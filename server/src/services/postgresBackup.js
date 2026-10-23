// Recovery bundle: real pg_dump/pg_restore, but NEVER authentication material.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { USER_FIELDS, ENTITY_NAMES, fieldsFor, BackupError } from './backupFormat.js';
import { classifyRecoverySchema, historyManifest, verifyHistoryCompatibility, historyVerificationSQL } from './migrationHistory.js';
import { assertExplicitTarget } from './postgresTarget.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const executable = (bin, name) => bin ? path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
function connectionEnv(url) {
    const u = new URL(url);
    const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$)/i.test(key)));
    return { ...clean, PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGSSLMODE: u.searchParams.get('sslmode') || 'prefer', PGCONNECT_TIMEOUT: '5' };
}
export function pg(name, args, { bin, url, input } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable(bin, name), args, { windowsHide: true, env: connectionEnv(url), stdio: ['pipe', 'pipe', 'pipe'] });
        const chunks = [];
        child.stdout.on('data', c => chunks.push(c));
        // Never return DB error payloads or connection strings (may contain secrets).
        const diagnostics = [];
        child.stderr.on('data', c => diagnostics.push(c));
        child.on('error', () => reject(new BackupError(`No se pudo ejecutar ${name}.`, 500)));
        child.on('close', code => {
            if (code === 0) return resolve(Buffer.concat(chunks));
            const isolated = new URL(url).hostname === '127.0.0.1' && new URL(url).port === process.env.NEXLIFT_BACKUP_TEST_PORT;
            reject(new BackupError(`${name} falló (código ${code}); respaldo/restauración no confirmado.${isolated ? Buffer.concat(diagnostics).toString('utf8') : ''}`, 500));
        });
        child.stdin.on('error', () => {});
        child.stdin.end(input);
    });
}
const literal = v => v === null ? 'NULL' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replaceAll("'", "''")}'`;
const userSQL = rows => rows.map(row => {
    const safe = { ...row, passwordHash: '!NEXLIFT_CREDENTIALS_EXCLUDED!', isActive: false };
    return `INSERT INTO public."User" (${Object.keys(safe).map(k => `"${k}"`).join(',')}) VALUES (${Object.values(safe).map(literal).join(',')});`;
}).join('\n');

async function fingerprints(tx) {
    const result = {};
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    for (const name of ENTITY_NAMES) {
        const columns = fieldsFor(name).map(f => `"${f.name}"`).join(',');
        // Identifiers are fixed schema metadata, never input from a backup/user.
        const [row] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY t.id), '')) AS digest FROM (SELECT ${columns} FROM public."${name}") t`);
        result[name] = row;
    }
    return result;
}

export async function dumpPostgres({ prisma, url, directory, bin }) {
    await assertExplicitTarget(prisma, url);
    // New directory only: never replace an earlier backup, even an incomplete one.
    await mkdir(directory, { recursive: false, mode: 0o700 });
    const archive = path.join(directory, 'database.dump');
    return prisma.$transaction(async tx => {
        const history = await classifyRecoverySchema(tx);
        const [{ snapshot }] = await tx.$queryRaw`SELECT pg_export_snapshot() AS snapshot`;
        const users = await tx.user.findMany({ orderBy: { id: 'asc' }, select: Object.fromEntries(USER_FIELDS.map(k => [k, true])) });
        const safeUsers = JSON.stringify(users);
        await pg('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--no-large-objects', `--snapshot=${snapshot}`, `--file=${archive}`,
            '--schema=public', '--exclude-table-data=public."User"', '--exclude-table-data=public."PushSubscription"', '--exclude-table-data=public."PendingReminder"'], { bin, url });
        await writeFile(path.join(directory, 'users.safe.json'), safeUsers, { flag: 'wx', mode: 0o600 });
        const bytes = await readFile(archive);
        const manifest = { version: 1, generatedAt: new Date().toISOString(), id: randomUUID(), credentialRecovery: 'RESET_REQUIRED',
            excludedData: ['User authentication/operational state', 'PushSubscription', 'PendingReminder'],
            files: { 'database.dump': sha(bytes), 'users.safe.json': sha(safeUsers) }, users: users.length, entities: await fingerprints(tx),
            migrationHistory: await historyManifest(tx, history), restoreVerified: false };
        await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
        return manifest;
    }, { isolationLevel: 'RepeatableRead', timeout: 120000, maxWait: 10000 });
}

export async function restorePostgres({ prisma, url, directory, bin }) {
    await assertExplicitTarget(prisma, url);
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || manifest.credentialRecovery !== 'RESET_REQUIRED') throw new BackupError('Bundle PostgreSQL desconocido.');
    await verifyHistoryCompatibility(manifest.migrationHistory);
    for (const file of ['database.dump', 'users.safe.json']) {
        if (sha(await readFile(path.join(directory, file))) !== manifest.files?.[file]) throw new BackupError(`Checksum PostgreSQL incorrecto: ${file}.`);
    }
    const users = JSON.parse(await readFile(path.join(directory, 'users.safe.json'), 'utf8'));
    if (!Array.isArray(users) || users.length !== manifest.users || users.some(row => Object.keys(row).sort().join() !== [...USER_FIELDS].sort().join())) throw new BackupError('Usuarios seguros incompletos/desconocidos.');
    const existing = await prisma.$queryRaw`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')`;
    if (existing.length) throw new BackupError('La restauración PostgreSQL requiere una base nueva sin tablas. No se borrará ningún dato.', 409);
    const archive = path.join(directory, 'database.dump');
    const sections = [];
    for (const section of ['pre-data', 'data', 'post-data']) {
        sections.push((await pg('pg_restore', ['--no-owner', '--no-acl', `--section=${section}`, '--file=-', archive], { bin, url })).toString('utf8').replace(/^CREATE SCHEMA public;\r?$/m, '-- public already exists in a fresh database'));
    }
    // One psql transaction includes schema, safe accounts, data and constraints.
    // pg_restore emits \restrict independently per section; each section unrestricts.
    const assertions = ENTITY_NAMES.map(name => {
        const expected = manifest.entities?.[name];
        if (!Number.isInteger(expected?.count) || !/^[a-f0-9]{32}$/.test(expected?.digest)) throw new BackupError('Falta manifiesto PostgreSQL de entidades.');
        const columns = fieldsFor(name).map(f => `"${f.name}"`).join(',');
        return `IF (SELECT COUNT(*) FROM public."${name}") <> ${expected.count} OR (SELECT md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY t.id), '')) FROM (SELECT ${columns} FROM public."${name}") t) <> '${expected.digest}' THEN RAISE EXCEPTION 'Recovery verification failed: ${name}'; END IF;`;
    }).join('\n') + '\n' + historyVerificationSQL(manifest.migrationHistory);
    const script = `BEGIN;\nSET standard_conforming_strings=on;\nSET TIME ZONE 'UTC';\n${sections[0]}\n${userSQL(users)}\n${sections[1]}\n${sections[2]}\nDO $$ BEGIN ${assertions} END $$;\nCOMMIT;\n`;
    await pg('psql', ['-X', '--set=ON_ERROR_STOP=1', '--file=-'], { bin, url, input: script });
    return { ok: true, users: users.length, credentialsRestored: false, requiresCredentialReset: true };
}
