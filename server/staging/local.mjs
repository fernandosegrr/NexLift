import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, realpath, cp, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { serverDir, runPg, pgExecutable, inspectSql, compareCatalog, loadDeclared, canRunDiagnostics } from '../audit/postgresql/audit-tools.mjs';
import { dumpSystemPostgres, restoreSystemPostgres } from '../src/services/postgresSystemBackup.js';
import { businessCatalog, assertSchemaReady } from '../deploy/releaseGate.js';
import { seedBackupFixture } from '../test/fixtures/backup-fixture.js';
import { stageHome, cleanStageEnvironment, secret, databaseURL, runtimeEnvironment } from './environment.mjs';
import { loadState, assertCluster, assertTarget, client } from './identity.mjs';

export const privateWrite = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const quoted = value => `'${value.replaceAll("'", "''")}'`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function freePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve)); return port;
}
export async function protectDirectory(root) {
    if (process.platform !== 'win32') return;
    const identity = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { windowsHide: true, encoding: 'utf8' });
    const sid = identity.stdout?.trim();
    if (identity.status !== 0 || !/^S-1-[0-9-]+$/.test(sid || '')) throw new Error('Cannot identify the private directory owner');
    const result = spawnSync('icacls.exe', [root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'],
        { windowsHide: true, stdio: 'ignore' });
    if (result.status !== 0) throw new Error('Cannot protect private staging directory');
}
export async function saveState(root, state) { await privateWrite(path.join(root, 'state.private.json'), state); }
export async function startPostgres(state) {
    if (!existsSync(path.join(state.data, 'postmaster.pid'))) {
        // The on-disk control ID must match before starting a stopped instance.
        const control = runPg('pg_controldata', ['-D', state.data], { env: { ...cleanStageEnvironment(), LC_ALL: 'C' } });
        if (!control.includes(state.systemId)) throw new Error('Staging control identity mismatch');
        runPg('pg_ctl', ['-D', state.data, '-l', path.join(state.root, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${state.pgPort}`, '-w', 'start'], { stdio: 'ignore' });
    }
    await assertCluster(state);
}
export async function createDatabase(state, key, purpose = 'disposable') {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(key) || Object.hasOwn(state.databases, key)) throw new Error('Staging database name already registered or invalid');
    await assertCluster(state);
    const name = `nexlift_stage_${state.id.slice(0, 8)}_${key}`;
    const db = client(state, 'control');
    try {
        if ((await db.$queryRaw`SELECT datname FROM pg_database WHERE datname=${name}`).length) throw new Error('Existing database will not be adopted or replaced');
        await db.$executeRawUnsafe(`CREATE DATABASE "${name}" OWNER "${state.credentials.admin.user}" TEMPLATE template0 ENCODING 'UTF8'`);
        await db.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS ${quoted(`NEXLIFT_STAGE:${state.id}:${purpose}`)}`);
        await db.$executeRawUnsafe(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC`);
        state.databases[key] = { name, purpose };
        await saveState(state.root, state);
    } finally { await db.$disconnect(); }
    await assertTarget(state, key);
    return key;
}
export async function migrate(state, key, action = 'deploy', extra = [], directory = serverDir) {
    if (!['deploy', 'resolve', 'status'].includes(action)) throw new Error('Unsupported staging migration command');
    if ((action === 'resolve' && JSON.stringify(extra) !== JSON.stringify(['--applied', '0_init']))
        || (action !== 'resolve' && extra.length)) throw new Error('Unsupported staging migration arguments');
    await assertTarget(state, key, { write: action !== 'status' });
    if (action === 'resolve' && (await inspect(state, key)).differences.length) throw new Error('Baseline resolve requires structural equivalence');
    const work = await mkdtemp(path.join(state.root, 'migration-job-'));
    await cp(path.join(directory, 'prisma'), path.join(work, 'prisma'), { recursive: true, filter: source => !path.basename(source).startsWith('.env') });
    const result = spawnSync(process.execPath, [path.join(serverDir, 'node_modules/prisma/build/index.js'), 'migrate', action,
        '--schema', path.join(work, 'prisma/schema.prisma'), ...extra], {
        cwd: work, windowsHide: true, encoding: 'utf8', timeout: 120000,
        env: { ...cleanStageEnvironment(), DATABASE_URL: databaseURL(state, key), PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' }
    });
    // CLI output may include connection details or SQL; never print or publish it.
    return { code: result.error ? 1 : result.status ?? 1 };
}
export function connection(state, key, { readOnly = true } = {}) {
    const c = state.credentials.admin;
    return { args: ['-h', '127.0.0.1', '-p', String(state.pgPort), '-U', c.user, '-d', state.databases[key].name],
        env: { PGPASSWORD: c.password, PGCONNECT_TIMEOUT: '3', ...(readOnly ? { PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000' } : {}) } };
}
export async function inspect(state, key) {
    await assertTarget(state, key);
    const c = connection(state, key);
    const catalog = inspectSql('catalog.sql', c)[0];
    const compatible = canRunDiagnostics(loadDeclared().catalog, businessCatalog(catalog));
    const extra = compatible ? runPg('psql', ['-X', '-w', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...c.args,
        '-f', path.join(serverDir, 'staging/history.sql')], { env: { ...cleanStageEnvironment(), ...c.env } }) : '';
    return { source: state.source, differences: compareCatalog(loadDeclared().catalog, businessCatalog(catalog)), catalog,
        counts: inspectSql('counts-and-orphans.sql', c), declaredOrphans: compatible ? inspectSql('declared-orphans.sql', c) : [],
        diagnostics: compatible ? inspectSql('diagnostics.sql', c) : [],
        supplemental: extra.split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row)),
        diagnosticsSkipped: compatible ? null : 'Missing or incompatible columns; reference preserved, reconcile on a separate clone.' };
}
export async function backup(state, key = 'runtime') {
    await assertTarget(state, key);
    const directory = path.join(state.root, `backup-${key}-${Date.now()}-${randomBytes(3).toString('hex')}`);
    const db = client(state, key);
    try {
        const manifest = await dumpSystemPostgres({ prisma: db, url: databaseURL(state, key), directory,
            bin: path.dirname(pgExecutable('pg_dump')), acknowledgeSensitive: true });
        return { directory, archiveSha256: manifest.archiveSha256, entities: manifest.entities, migrationHistory: manifest.migrationHistory };
    } finally { await db.$disconnect(); }
}
export async function restore(state, key, directory, { initialize = false } = {}) {
    await assertTarget(state, key, { write: true, initialize });
    const db = client(state, key);
    try { return await restoreSystemPostgres({ prisma: db, url: databaseURL(state, key), directory,
        bin: path.dirname(pgExecutable('pg_restore')), acknowledgeSensitive: true }); }
    finally { await db.$disconnect(); }
}
export async function permitApplication(state, key = 'runtime') {
    await assertTarget(state, key, { write: true });
    const db = client(state, key), admin = state.credentials.admin.user, app = state.credentials.app.user;
    try {
        await db.$executeRawUnsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
        await db.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${state.databases[key].name}" TO "${app}"`);
        await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${app}"`);
        await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${app}"`);
        await db.$executeRawUnsafe(`REVOKE INSERT,UPDATE,DELETE ON public._prisma_migrations FROM "${app}"`);
        await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE "${admin}" IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO "${app}"`);
    } finally { await db.$disconnect(); }
}
async function seedReference(db, state) {
    for (const id of ['A', 'B']) {
        await seedBackupFixture(db, id);
        await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(state.syntheticPassword, 10), tokenVersion: 0, creatineReminderEnabled: false } });
        await db.routine.updateMany({ where: { userId: id, source: 'manual' }, data: { isActive: false } });
        await db.routineDay.update({ where: { id: `${id}-RoutineDay` }, data: { dayName: '2026-10-18', order: 0, weekday: 0 } });
        await db.exercise.update({ where: { id: `${id}-Exercise` }, data: { targetSets: 3, targetReps: '8-12' } });
    }
}
export async function createStaging(root = stageHome()) {
    if (existsSync(path.join(root, 'state.private.json'))) { const state = await loadState(root); await startPostgres(state); return state; }
    if (existsSync(root)) throw new Error('Unrecognized existing directory; no files replaced');
    const repository = await realpath(path.join(serverDir, '..'));
    if (path.resolve(root).startsWith(repository + path.sep) || path.resolve(root) === repository) throw new Error('Staging data must remain outside the repository');
    await mkdir(root, { recursive: true, mode: 0o700 }); root = await realpath(root);
    await protectDirectory(root);
    const id = randomBytes(16).toString('hex'), adminUser = `stage_admin_${id.slice(0, 8)}`;
    const state = { version: 1, id, root, data: path.join(root, 'postgres-data'), pgPort: await freePort(), httpPort: await freePort(),
        source: 'SYNTHETIC_ONLY_NOT_PRODUCTION', createdAt: new Date().toISOString(),
        credentials: { admin: { user: adminUser, password: secret() }, app: { user: `stage_app_${id.slice(0, 8)}`, password: secret() } },
        jwtSecret: secret(), controlSecret: secret(), syntheticPassword: secret(), databases: {}, systemId: '' };
    // Keep bootstrap credentials recoverable if initialization fails; never adopt
    // a partial directory automatically or silently initialize it again.
    await privateWrite(path.join(root, 'bootstrap.private.json'), state);
    const pwfile = path.join(root, 'init-password.private');
    await writeFile(pwfile, state.credentials.admin.password, { mode: 0o600, flag: 'wx' });
    runPg('initdb', ['-D', state.data, '-U', adminUser, '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', `--pwfile=${pwfile}`, '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
    await unlink(pwfile);
    runPg('pg_ctl', ['-D', state.data, '-l', path.join(root, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${state.pgPort}`, '-w', 'start'], { stdio: 'ignore' });
    const url = new URL(`postgresql://127.0.0.1:${state.pgPort}/postgres`); url.username = adminUser; url.password = state.credentials.admin.password;
    const db = new PrismaClient({ datasources: { db: { url: url.href } } });
    try {
        const [identity] = await db.$queryRawUnsafe('SELECT system_identifier::text AS id FROM pg_control_system()'); state.systemId = identity.id;
        // A fixed control DB is used only after the brand-new cluster was created.
        const controlName = `nexlift_stage_${id.slice(0, 8)}_control`;
        await db.$executeRawUnsafe(`CREATE DATABASE "${controlName}"`);
        await db.$executeRawUnsafe(`COMMENT ON DATABASE "${controlName}" IS ${quoted(`NEXLIFT_STAGE:${id}:control`)}`);
        await db.$executeRawUnsafe(`REVOKE ALL ON DATABASE "${controlName}" FROM PUBLIC`);
        state.databases.control = { name: controlName, purpose: 'control' }; await saveState(root, state);
        await assertCluster(state);
        await db.$executeRawUnsafe(`CREATE ROLE "${state.credentials.app.user}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quoted(state.credentials.app.password)}`);
    } finally { await db.$disconnect(); }
    await createDatabase(state, 'seed', 'disposable');
    if ((await migrate(state, 'seed')).code !== 0) throw new Error('Staging baseline initialization failed');
    await assertTarget(state, 'seed', { write: true });
    const seed = client(state, 'seed');
    try { await seedReference(seed, state); } finally { await seed.$disconnect(); }
    const original = await backup(state, 'seed');
    await createDatabase(state, 'reference', 'reference'); await restore(state, 'reference', original.directory, { initialize: true });
    const control = client(state, 'control');
    try { await control.$executeRawUnsafe(`ALTER DATABASE "${state.databases.reference.name}" SET default_transaction_read_only=on`); }
    finally { await control.$disconnect(); }
    await createDatabase(state, 'runtime', 'runtime'); await restore(state, 'runtime', original.directory); await permitApplication(state);
    state.referenceBackup = original.directory; state.ready = true; await saveState(root, state);
    await unlink(path.join(root, 'bootstrap.private.json'));
    return state;
}
export async function snapshot(state) {
    await assertCluster(state);
    if (state.release) return state.release;
    const release = path.join(state.root, 'release-2.4');
    await mkdir(path.join(release, 'server'), { recursive: true }); await mkdir(path.join(release, 'client'), { recursive: true });
    for (const entry of ['src', 'prisma', 'deploy', 'staging', 'node_modules', 'package.json', 'package-lock.json', 'audit/postgresql']) {
        await cp(path.join(serverDir, entry), path.join(release, 'server', entry), { recursive: true,
            filter: file => !path.basename(file).startsWith('.env') && !/\.test\./.test(path.basename(file)) });
    }
    await cp(path.join(serverDir, '../client/dist'), path.join(release, 'client/dist'), { recursive: true });
    const hash = createHash('sha256').update(await readFile(path.join(release, 'server/src/index.js'))).digest('hex');
    await writeFile(path.join(release, 'release.json'), JSON.stringify({ version: 'phase-2.4', applicationSha256: hash, source: state.source }, null, 2));
    state.release = release; await saveState(state.root, state); return release;
}
export const controlPath = state => process.platform === 'win32' ? `\\\\.\\pipe\\nexlift-stage-${state.id}` : path.join(state.root, `nexlift-stage-${state.id}.sock`);
export async function controlRequest(state, command) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(controlPath(state)); let text = '';
        socket.setTimeout(3000, () => socket.destroy(new Error('Staging control timeout')));
        socket.on('error', () => reject(new Error('Staging application control unavailable')));
        socket.once('connect', () => socket.write(JSON.stringify({ command, secret: state.controlSecret }) + '\n'));
        socket.on('data', data => { text += data; });
        socket.once('end', () => { try { const result = JSON.parse(text); if (result.id !== state.id) throw new Error(); resolve(result); } catch { reject(new Error('Staging control identity mismatch')); } });
    });
}
export async function startApplication(state) {
    await assertTarget(state, 'runtime');
    try { const running = await controlRequest(state, 'status'); if (running.ready) return running; } catch { /* no owned application yet */ }
    const release = await snapshot(state);
    const log = await open(path.join(state.root, 'application.private.log'), 'a', 0o600);
    const child = spawn(process.execPath, [path.join(release, 'server/staging/runtime.mjs')], { cwd: path.join(release, 'server'),
        env: runtimeEnvironment(state, state.root), windowsHide: true, detached: true, stdio: ['ignore', log.fd, log.fd] });
    child.unref(); await log.close();
    for (let i = 0; i < 100; i++) {
        try { const result = await controlRequest(state, 'status'); if (result.ready) return result; } catch { /* startup not ready */ }
        await pause(200);
    }
    throw new Error('Staging application did not become ready; inspect the private local log');
}
export async function stopStaging(state) {
    await assertCluster(state);
    let pid;
    try { const running = await controlRequest(state, 'status'); pid = running.pid; await controlRequest(state, 'stop'); }
    catch { /* no owned control channel; never kill an unknown PID */ }
    if (pid) {
        let exited = false;
        for (let i = 0; i < 80; i++) {
            try { process.kill(pid, 0); } catch { exited = true; break; }
            await pause(200);
        }
        if (!exited) throw new Error('Application has not drained; PostgreSQL remains running');
    }
    await assertCluster(state);
    runPg('pg_ctl', ['-D', state.data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
}
export async function status(state) {
    await assertTarget(state, 'runtime');
    const db = client(state, 'runtime', 'app');
    try { await assertSchemaReady(db); } finally { await db.$disconnect(); }
    const live = await fetch(`http://127.0.0.1:${state.httpPort}/api/health`, { signal: AbortSignal.timeout(5000) });
    const ready = await fetch(`http://127.0.0.1:${state.httpPort}/api/ready`, { signal: AbortSignal.timeout(10000) });
    const ui = await fetch(`http://127.0.0.1:${state.httpPort}/`, { signal: AbortSignal.timeout(5000) });
    return { source: state.source, api: `http://127.0.0.1:${state.httpPort}`, health: live.status, readiness: ready.status,
        frontend: ui.status, frontendHTML: (await ui.text()).includes('<div id="root">'), referenceProtected: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const command = process.argv[2]; if (process.argv.length !== 3 || !['create', 'up', 'status', 'stop', 'backup', 'inspect'].includes(command)) throw new Error('Use create|up|status|stop|backup|inspect without URLs');
        const root = stageHome();
        const state = command === 'create' ? await createStaging(root) : await loadState(root);
        if (['create', 'up'].includes(command)) { await startPostgres(state); await startApplication(state); process.stdout.write(JSON.stringify(await status(state), null, 2) + '\n'); }
        if (command === 'status') process.stdout.write(JSON.stringify(await status(state), null, 2) + '\n');
        if (command === 'stop') { await stopStaging(state); process.stdout.write('Owned staging processes stopped; databases and backups preserved.\n'); }
        if (command === 'backup') { const result = await backup(state); process.stdout.write(JSON.stringify({ directory: result.directory, archiveSha256: result.archiveSha256 }) + '\n'); }
        if (command === 'inspect') { const result = await inspect(state, 'reference'); await privateWrite(path.join(root, 'reference-audit.private.json'), result); process.stdout.write(JSON.stringify({ source: result.source, differences: result.differences.length, diagnosticChecks: result.diagnostics.length }) + '\n'); }
    } catch { process.stderr.write('Staging operation blocked or failed. No connection details printed.\n'); process.exitCode = 1; }
}
