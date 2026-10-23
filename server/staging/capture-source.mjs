// Explicit operator-supplied identity only. Never discovers or uses DATABASE_URL.
import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { cleanStageEnvironment } from './environment.mjs';
import { pgExecutable, serverDir } from '../audit/postgresql/audit-tools.mjs';
import { protectDirectory } from './local.mjs';

export function validateSourceDescriptor(value) {
    if (value?.kind !== 'AUTHORIZED_READ_ONLY_POSTGRES' || value.authorized !== true) throw new Error('Explicit read-only source authorization required');
    let url; try { url = new URL(value.connectionUrl); } catch { throw new Error('Private source configuration required'); }
    const e = value.expectedIdentity;
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.hostname || url.hash
        || [...url.searchParams.keys()].some(key => !['sslmode', 'connect_timeout', 'pool_timeout', 'connection_limit'].includes(key)) || !e
        || !/^\d+$/.test(e.systemId || '') || !e.database || !e.role || !e.address || !Number.isInteger(e.port)
        || e.port < 1 || e.port > 65535 || decodeURIComponent(url.pathname.slice(1)) !== e.database
        || decodeURIComponent(url.username) !== e.role || Number(url.port || 5432) !== e.port) throw new Error('Unambiguous expected source identity required');
    url.searchParams.set('connect_timeout', '3'); url.searchParams.set('pool_timeout', '3');
    return { url: url.href, expected: e };
}
export async function captureSource({ descriptorFile, directory }) {
    if (!path.isAbsolute(descriptorFile) || !path.isAbsolute(directory)) throw new Error('Private absolute paths required');
    const repository = path.resolve(serverDir, '..');
    if ([descriptorFile, directory].some(file => path.resolve(file) === repository || path.resolve(file).startsWith(repository + path.sep))) throw new Error('Sensitive files must stay outside Git');
    const { url, expected } = validateSourceDescriptor(JSON.parse(await readFile(descriptorFile, 'utf8')));
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    let created = false;
    try {
        return await prisma.$transaction(async tx => {
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout='30s'");
            await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
            await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
            const [actual] = await tx.$queryRawUnsafe("SELECT system_identifier::text AS \"systemId\",current_database() AS database,current_user AS role,inet_server_port() AS port,host(inet_server_addr()) AS address FROM pg_control_system()");
            if (Object.keys(actual).some(key => actual[key] !== expected[key])) throw new Error('Source identity mismatch');
            const [rights] = await tx.$queryRawUnsafe("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user");
            const [writable] = await tx.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p') AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')) AS yes");
            const [schemaWrite] = await tx.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname !~ '^pg_toast' AND has_schema_privilege(current_user,oid,'CREATE')) OR has_database_privilege(current_user,current_database(),'CREATE') AS yes");
            if (Object.values(rights).some(Boolean) || writable.yes || schemaWrite.yes) throw new Error('Source role must be read-only');
            const [{ snapshot }] = await tx.$queryRaw`SELECT pg_export_snapshot() AS snapshot`;
            await mkdir(directory, { mode: 0o700 }); created = true;
            await protectDirectory(directory);
            const archive = path.join(directory, 'source.original.dump');
            const u = new URL(url), env = { ...cleanStageEnvironment(), PGHOST: u.hostname, PGPORT: u.port || '5432',
                PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: expected.database,
                PGSSLMODE: u.searchParams.get('sslmode') || 'prefer', PGCONNECT_TIMEOUT: '3',
                PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000' };
            const execute = (name, args) => new Promise((resolve, reject) => {
                const child = spawn(pgExecutable(name), args, { env, stdio: 'ignore', windowsHide: true });
                const timer = setTimeout(() => { child.kill(); reject(new Error('Read-only capture timeout')); }, 90000);
                child.once('error', () => { clearTimeout(timer); reject(new Error('Read-only capture tool unavailable')); });
                child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Read-only capture failed')); });
            });
            await execute('pg_dump', ['--format=custom', '--lock-wait-timeout=2000', `--snapshot=${snapshot}`, `--file=${archive}`]);
            await chmod(archive, 0o600); await execute('pg_restore', ['--list', archive]);
            const tables = await tx.$queryRawUnsafe("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname");
            const fingerprints = {};
            for (const { name } of tables) {
                const identifier = '"' + name.replaceAll('"', '""') + '"';
                // Private manifest only: full rows stay in the archive; no PII in logs.
                const [row] = await tx.$queryRawUnsafe(`SELECT count(*)::text AS count,md5(coalesce(string_agg(v,E'\\n' ORDER BY v),'')) AS digest FROM (SELECT row_to_json(t)::text AS v FROM public.${identifier} t) q`);
                fingerprints[name] = row;
            }
            const manifest = { kind: 'NEXLIFT_AUTHORIZED_SOURCE', version: 1, sensitive: true, sourceVerified: true,
                createdAt: new Date().toISOString(), archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
                fingerprints, sourceIdentitySha256: createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
                singleSnapshot: true, clusterRolesIncluded: false, mediaIncluded: false, restoreVerified: false };
            await writeFile(path.join(directory, 'source.private.manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
            return { captured: true, sourceVerified: true, tables: tables.length, archiveSha256: manifest.archiveSha256 };
        }, { isolationLevel: 'RepeatableRead', timeout: 120000, maxWait: 5000 });
    } catch { throw new Error(created ? 'Read-only capture failed; partial private directory retained for inspection' : 'Read-only source rejected; no archive created'); }
    finally { await prisma.$disconnect(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.length !== 4) throw new Error('Private descriptor and new output directory required');
        process.stdout.write(JSON.stringify(await captureSource({ descriptorFile: process.argv[2], directory: process.argv[3] })) + '\n');
    } catch { process.stderr.write('Read-only source capture blocked or failed. No secrets printed.\n'); process.exitCode = 1; }
}
