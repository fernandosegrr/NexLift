import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pg } from '../src/services/postgresBackup.js';
import { captureSource } from '../staging/capture-source.mjs';
import { restoreCaptured } from '../staging/restore-captured.mjs';
import { loadState, assertTarget, assertCluster, client } from '../staging/identity.mjs';
import { stageHome, cleanStageEnvironment, runtimeEnvironment, databaseURL } from '../staging/environment.mjs';
import { createStaging, startApplication, stopStaging, startPostgres, status, inspect, createDatabase, migrate, backup, restore, connection, freePort, permitApplication } from '../staging/local.mjs';
import { serverDir, runPg, pgExecutable } from '../audit/postgresql/audit-tools.mjs';
import { MODELS, delegate } from '../src/services/backupFormat.js';
import { businessCatalog, assertSchemaReady } from '../deploy/releaseGate.js';

let state, db, reference, referenceRows, referenceHistory, tokens = {}, routine, exercise, savedBackup;
const rows = async prisma => Object.fromEntries(await Promise.all(Object.keys(MODELS).map(async name =>
    [name, JSON.parse(JSON.stringify(await prisma[delegate(name)].findMany({ orderBy: { id: 'asc' } })))])));
const history = prisma => prisma.$queryRaw`SELECT * FROM public._prisma_migrations ORDER BY id`;
const clients = [];
async function target(key, options = {}) {
    await createDatabase(state, key); const db = client(state, key); clients.push(db);
    if (options.clone) await restore(state, key, options.clone);
    return db;
}
const base = () => `http://127.0.0.1:${state.httpPort}`;
const request = (route, { user = 'A', method = 'GET', body } = {}) => fetch(base() + route, {
    method, headers: { ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
});
before(async () => {
    state = await loadState(stageHome());
    if (state.id !== process.env.NEXLIFT_STAGE_TEST_ID || state.source !== 'SYNTHETIC_ONLY_NOT_PRODUCTION'
        || !state.root.includes('nexlift-staging-tests-')) throw new Error('Disposable staging runner required');
    await assertCluster(state);
    db = client(state, 'runtime'); reference = client(state, 'reference'); clients.push(db, reference);
    referenceRows = await rows(reference); referenceHistory = await history(reference);
    await startApplication(state);
});
after(async () => { await Promise.all(clients.map(c => c.$disconnect())); });

test('automatically created staging serves real frontend, API, liveness and schema readiness', async () => {
    const result = await status(state);
    assert.equal(result.health, 200); assert.equal(result.readiness, 200); assert.equal(result.frontend, 200); assert.equal(result.frontendHTML, true);
    assert.equal(result.source, 'SYNTHETIC_ONLY_NOT_PRODUCTION');
    const html = await (await request('/')).text(), script = html.match(/src="([^"]+\.js)"/)[1];
    assert.equal((await request(script)).status, 200);
});
test('repeated creation reuses the identified staging without changing IDs, records or secrets', async () => {
    const before = await readFile(path.join(state.root, 'state.private.json'));
    const reused = await createStaging(state.root);
    assert.equal(reused.id, state.id); assert.deepEqual(await rows(reference), referenceRows);
    assert.deepEqual(await readFile(path.join(state.root, 'state.private.json')), before);
});
test('incorrect cluster identifier, process port and database marker are rejected before writes', async () => {
    await assert.rejects(assertTarget({ ...state, systemId: '1' }, 'runtime', { write: true }), /identity/);
    await assert.rejects(assertTarget({ ...state, pgPort: 1 }, 'runtime', { write: true }), /identity/);
    const forged = structuredClone(state); forged.databases.runtime.purpose = 'disposable';
    await assert.rejects(assertTarget(forged, 'runtime', { write: true }), /identity/);
});
test('the immutable reference rejects wrapper writes and PostgreSQL rejects actual SQL updates', async () => {
    await assert.rejects(assertTarget(state, 'reference', { write: true }), /protected/);
    await assert.rejects(reference.$executeRaw`UPDATE public."User" SET "firstName"='must-not-write'`, e => e.meta?.code === '25006');
    assert.deepEqual(await rows(reference), referenceRows);
});
test('the app role can read readiness but cannot alter tables or migration history or access reference', async () => {
    const app = client(state, 'runtime', 'app');
    try {
        await assertSchemaReady(app);
        await assert.rejects(app.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN forbidden TEXT'));
        await assert.rejects(app.$executeRawUnsafe('UPDATE public._prisma_migrations SET checksum=checksum'));
    } finally { await app.$disconnect(); }
    const forbidden = client(state, 'reference', 'app');
    try { await assert.rejects(forbidden.user.count()); } finally { await forbidden.$disconnect(); }
});
test('real password login succeeds with independent JWT and rejects incorrect credentials', async () => {
    for (const id of ['A', 'B']) {
        const response = await request('/api/auth/login', { user: 'none', method: 'POST', body: { username: id.toLowerCase(), password: state.syntheticPassword } });
        assert.equal(response.status, 200); const body = await response.json(); tokens[id] = body.token; assert.equal(body.user.id, id);
    }
    assert.equal((await request('/api/auth/login', { user: 'none', method: 'POST', body: { username: 'a', password: 'incorrect-synthetic' } })).status, 401);
    assert.equal((await request('/api/auth/me', { user: 'none' })).status, 401);
});
test('real API preserves multiuser isolation for routine reads and workout writes', async () => {
    assert.equal((await request('/api/routines/B-Routine')).status, 404);
    const before = await rows(db);
    assert.equal((await request('/api/workouts/log', { method: 'POST', body: { exerciseId: 'B-Exercise', sets: [{ weight: 10, reps: 8, rpe: 8 }] } })).status, 404);
    assert.deepEqual(await rows(db), before);
});
test('canonical routine import and subsequent editing persist all prescribed values and Sunday zero', async () => {
    const response = await request('/api/routines/import', { method: 'POST', body: { name: 'Staging round trip', days: [
        { dayName: 'Domingo', weekday: 0, order: 0, exercises: [{ name: 'Remo staging', muscleGroup: 'Espalda', targetSets: 4, targetReps: '4-6', restSeconds: 150, isUnilateral: true, note: 'Synthetic note' }] }
    ] } });
    assert.equal(response.status, 201); routine = (await response.json()).routine; exercise = routine.days[0].exercises[0];
    assert.equal(exercise.targetSets, 4); assert.equal(exercise.targetReps, '4-6'); assert.equal(exercise.restSeconds, 150); assert.equal(exercise.isUnilateral, true);
    assert.equal(routine.days[0].weekday, 0); assert.ok(exercise.muscleGroup);
    const edited = await request(`/api/routines/${routine.id}`, { method: 'PUT', body: { name: 'Staging edited', days: routine.days.map(day => ({ ...day, exercises: day.exercises.map(e => ({ ...e, restSeconds: 170 })) })) } });
    assert.equal(edited.status, 200); assert.equal((await db.exercise.findUnique({ where: { id: exercise.id } })).restSeconds, 170);
});
test('workout commit and editing recalculate PR consistently on the real staging API', async () => {
    const logged = await request('/api/workouts/log', { method: 'POST', body: { exerciseId: exercise.id, sets: [{ weight: 70, reps: 5, rpe: 8, completed: true }] } });
    assert.equal(logged.status, 201); const log = (await logged.json()).workoutLog;
    let pr = await db.personalRecord.findFirst({ where: { userId: 'A', exerciseName: exercise.name.toLowerCase() } });
    assert.equal(pr.weight, 70); assert.equal(pr.reps, 5);
    assert.equal((await request(`/api/workouts/${log.id}`, { method: 'PUT', body: { sets: [{ weight: 80, reps: 4, rpe: 8, completed: true }] } })).status, 200);
    pr = await db.personalRecord.findFirst({ where: { userId: 'A', exerciseName: exercise.name.toLowerCase() } }); assert.equal(pr.weight, 80);
    assert.equal((await db.workoutLog.findUnique({ where: { id: log.id } })).exerciseId, exercise.id);
});
test('iOS shortcut logs a real set with RIR conversion while providers remain disabled', async () => {
    const response = await request('/api/shortcuts/log-set', { method: 'POST', body: { exerciseId: exercise.id, weight: 65, reps: 8, rir: 2 } });
    assert.equal(response.status, 201); const body = await response.json();
    assert.ok(body.setsLoggedToday > 0); assert.equal(body.workoutLog.sets.at(-1).rpe, 8);
    assert.deepEqual(await db.pushSubscription.findMany({ where: { userId: 'A' } }), await reference.pushSubscription.findMany({ where: { userId: 'A' } }));
});
test('portable backup v4 exports and validates a dry-run restore without modifying account history', async () => {
    const response = await request('/api/backup/export'); assert.equal(response.status, 200); const payload = await response.json();
    const before = await rows(db);
    const dry = await request('/api/backup/import?dryRun=true', { method: 'POST', body: payload }); assert.equal(dry.status, 200);
    assert.deepEqual(await rows(db), before);
});
test('baseline catalog and read-only historical audit cover all 17 models and 18 declared relationships', async () => {
    const audit = await inspect(state, 'reference'); assert.deepEqual(audit.differences, []);
    assert.equal(businessCatalog(audit.catalog).tables.length, 17); assert.equal(businessCatalog(audit.catalog).columns.length, 155);
    assert.equal(audit.catalog.foreignKeys.length, 18); assert.equal(businessCatalog(audit.catalog).indexes.length, 48);
    assert.equal(audit.declaredOrphans.length, 18); assert.ok(audit.declaredOrphans.every(row => Number(row.count) === 0));
    assert.equal(audit.supplemental.length, 13);
    assert.deepEqual(await rows(reference), referenceRows);
});
test('authorized source pipeline verifies a synthetic read-only identity and restores the same snapshot into an independent clone', async () => {
    const role = `stage_reader_${state.id.slice(0, 8)}`, password = state.controlSecret;
    const admin = client(state, 'control');
    try {
        await assertCluster(state);
        await admin.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
        await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${state.databases.reference.name}" TO "${role}"`);
    } finally { await admin.$disconnect(); }
    // Reference is immutable: grant metadata only on the disposable seed source.
    const seed = client(state, 'seed');
    try {
        await assertTarget(state, 'seed', { write: true });
        await seed.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${state.databases.seed.name}" TO "${role}"`);
        await seed.$executeRawUnsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
        await seed.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
        await seed.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
        await seed.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO "${role}"`);
        const before = await rows(seed), meta = await history(seed);
        const url = new URL(databaseURL(state, 'seed')); url.username = role; url.password = password;
        const descriptorFile = path.join(state.root, 'source-descriptor.private.json'), directory = path.join(state.root, 'captured-source');
        await writeFile(descriptorFile, JSON.stringify({ kind: 'AUTHORIZED_READ_ONLY_POSTGRES', authorized: true, connectionUrl: url.href,
            expectedIdentity: { systemId: state.systemId, database: state.databases.seed.name, role, address: '127.0.0.1', port: state.pgPort } }), { mode: 0o600 });
        const result = await captureSource({ descriptorFile, directory }); assert.equal(result.sourceVerified, true); assert.equal(result.tables, 18);
        const clone = await target('captured_clone');
        assert.deepEqual(await restoreCaptured(state, 'captured_clone', directory), { restored: true, verified: true, tables: 18 });
        assert.deepEqual(await rows(clone), before); assert.deepEqual(await history(clone), meta);
        assert.deepEqual(await rows(seed), before); assert.deepEqual(await history(seed), meta);
    } finally { await seed.$disconnect(); }
});
test('a fresh disposable DB is constructed by migrate deploy and repeated jobs preserve existing IDs and history', async () => {
    const fresh = await target('from_empty'); assert.equal((await migrate(state, 'from_empty')).code, 0);
    await fresh.user.create({ data: { id: 'preserved', username: 'preserved', email: 'preserved@synthetic.invalid', firstName: 'Synthetic', lastName: 'Preserved', passwordHash: 'synthetic-only' } });
    const before = await rows(fresh), meta = await history(fresh);
    assert.equal((await migrate(state, 'from_empty')).code, 0); assert.equal((await migrate(state, 'from_empty')).code, 0);
    assert.deepEqual(await rows(fresh), before); assert.deepEqual(await history(fresh), meta);
});
test('legacy baseline resolve occurs only on an equivalent disposable clone and preserves physical tables and rows', async () => {
    const legacy = await target('legacy_resolve'); await assertTarget(state, 'legacy_resolve', { write: true });
    const c = connection(state, 'legacy_resolve', { readOnly: false });
    runPg('psql', ['-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', ...c.args, '-1', '-f', path.join(serverDir, 'audit/postgresql/declared-schema.sql')], { env: { ...cleanStageEnvironment(), ...c.env } });
    const before = await legacy.$queryRawUnsafe("SELECT oid::text,relfilenode::text FROM pg_class WHERE relname='User'");
    assert.equal((await migrate(state, 'legacy_resolve', 'resolve', ['--applied', '0_init'])).code, 0);
    assert.deepEqual(await legacy.$queryRawUnsafe("SELECT oid::text,relfilenode::text FROM pg_class WHERE relname='User'"), before);
    await assertSchemaReady(legacy);
});
test('full PostgreSQL backup restores exact credentials, operational fields, IDs, relationships and migration history', async () => {
    savedBackup = await backup(state);
    const recovered = await target('recovered', { clone: savedBackup.directory });
    assert.deepEqual(await rows(recovered), await rows(db)); assert.deepEqual(await history(recovered), await history(db));
    assert.equal(createHash('sha256').update(await readFile(path.join(savedBackup.directory, 'system.dump'))).digest('hex'), savedBackup.archiveSha256);
    await assertSchemaReady(recovered);
});
test('nonempty and reference destinations are rejected without changing either database or original archive', async () => {
    const before = await rows(db), bytes = await readFile(path.join(savedBackup.directory, 'system.dump'));
    await assert.rejects(restore(state, 'runtime', savedBackup.directory)); await assert.rejects(restore(state, 'reference', savedBackup.directory));
    assert.deepEqual(await rows(db), before); assert.deepEqual(await readFile(path.join(savedBackup.directory, 'system.dump')), bytes);
});
test('an actual interrupted SQL restoration rolls back and can be retried on the same empty disposable DB', async () => {
    const interrupted = await target('interrupted'); await assertTarget(state, 'interrupted', { write: true });
    const c = connection(state, 'interrupted', { readOnly: false });
    const child = spawn(pgExecutable('psql'), ['-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', ...c.args, '-f', '-'], {
        windowsHide: true, env: { ...cleanStageEnvironment(), ...c.env, PGAPPNAME: 'nexlift-stage-interrupted-restore' }, stdio: ['pipe', 'ignore', 'ignore']
    });
    const sql = (await pg('pg_restore', ['--no-owner', '--no-acl', '--file=-', path.join(savedBackup.directory, 'system.dump')],
        { bin: path.dirname(pgExecutable('pg_restore')), url: databaseURL(state, 'interrupted') })).toString('utf8')
        .replace(/^CREATE SCHEMA public;\r?$/m, '-- public already exists');
    child.stdin.end(`BEGIN;\n${sql}\nSELECT pg_sleep(60);\nCOMMIT;`);
    let sleeping = false;
    for (let i = 0; i < 50; i++) {
        const [row] = await db.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='nexlift-stage-interrupted-restore' AND wait_event='PgSleep') AS yes");
        if (row.yes) { sleeping = true; break; } await new Promise(resolve => setTimeout(resolve, 40));
    }
    assert.equal(sleeping, true); const exited = once(child, 'exit'); child.kill(); await exited;
    const [empty] = await interrupted.$queryRawUnsafe("SELECT NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') AS yes"); assert.equal(empty.yes, true);
    await restore(state, 'interrupted', savedBackup.directory); assert.deepEqual(await rows(interrupted), await rows(db));
});
test('a migration failing after intermediate DDL retains failed metadata and blocks readiness and application startup', async () => {
    const failed = await target('failed', { clone: savedBackup.directory });
    const directory = path.join(state.root, 'failure-bundle'); await cp(path.join(serverDir, 'prisma'), path.join(directory, 'prisma'), { recursive: true });
    await mkdir(path.join(directory, 'prisma/migrations/1_failure'));
    await writeFile(path.join(directory, 'prisma/migrations/1_failure/migration.sql'), 'BEGIN; CREATE TABLE public.must_rollback(id integer); SELECT 1/0; COMMIT;');
    const before = await rows(failed);
    assert.notEqual((await migrate(state, 'failed', 'deploy', [], directory)).code, 0);
    assert.notEqual((await migrate(state, 'failed', 'deploy', [], directory)).code, 0);
    const [row] = await failed.$queryRawUnsafe("SELECT to_regclass('public.must_rollback') IS NULL AS yes"); assert.equal(row.yes, true);
    assert.ok((await history(failed)).some(h => h.migration_name === '1_failure' && !h.finished_at));
    await assert.rejects(assertSchemaReady(failed)); assert.deepEqual(await rows(failed), before);
    const child = spawnSync(process.execPath, ['deploy/rehearsal-http.mjs'], { cwd: serverDir, windowsHide: true, timeout: 15000,
        env: { ...runtimeEnvironment(state, state.root), NEXLIFT_RELEASE_DATABASE_URL: databaseURL(state, 'failed'), PORT: String(await freePort()) }, encoding: 'utf8' });
    assert.equal(child.status, 1); assert.match(child.stderr, /rehearsal_start_blocked/);
});
test('incompatible schema rejects readiness; recovery uses a new clone instead of editing the reference or faking history', async () => {
    const incompatible = await target('incompatible', { clone: savedBackup.directory });
    await assertTarget(state, 'incompatible', { write: true });
    await incompatible.$executeRawUnsafe('ALTER TABLE "Exercise" RENAME COLUMN "targetSets" TO "incompatible_sets"');
    await assert.rejects(assertSchemaReady(incompatible));
    const metaBefore = await history(incompatible);
    await assert.rejects(migrate(state, 'incompatible', 'resolve', ['--applied', '0_init']), /equivalence/);
    assert.deepEqual(await history(incompatible), metaBefore);
    const child = spawnSync(process.execPath, ['deploy/rehearsal-http.mjs'], { cwd: serverDir, windowsHide: true, timeout: 15000,
        env: { ...runtimeEnvironment(state, state.root), NEXLIFT_RELEASE_DATABASE_URL: databaseURL(state, 'incompatible'), PORT: String(await freePort()) }, encoding: 'utf8' });
    assert.equal(child.status, 1);
    const recovered = await target('failure_recovery', { clone: savedBackup.directory });
    await assertSchemaReady(recovered); assert.deepEqual(await rows(recovered), await rows(db));
    assert.deepEqual(await history(recovered), await history(db));
});
test('expand and copy preserve original reader data; strict catalog gate requires explicit release reconciliation', async () => {
    const expanded = await target('expand_copy', { clone: savedBackup.directory });
    const before = await rows(expanded);
    await assertTarget(state, 'expand_copy', { write: true });
    await expanded.$executeRawUnsafe('ALTER TABLE "Exercise" ADD COLUMN target_sets_next INTEGER');
    await expanded.$executeRawUnsafe('UPDATE "Exercise" SET target_sets_next="targetSets"');
    const [verified] = await expanded.$queryRawUnsafe('SELECT count(*)::int AS mismatches FROM "Exercise" WHERE target_sets_next IS DISTINCT FROM "targetSets"');
    assert.equal(verified.mismatches, 0); assert.deepEqual(await rows(expanded), before);
    await assert.rejects(assertSchemaReady(expanded));
});
test('the compatible Phase 2.3 bootstrap serves the recovered database and stops without SQL rollback', async () => {
    const recovered = client(state, 'failure_recovery'); clients.push(recovered);
    await permitApplication(state, 'failure_recovery');
    const before = await rows(recovered), meta = await history(recovered), port = await freePort();
    const child = spawn(process.execPath, ['test/fixtures/infra-process.mjs'], { cwd: serverDir, windowsHide: true,
        env: { ...runtimeEnvironment(state, state.root, 'failure_recovery'), PORT: String(port) }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    try {
        let ready = false;
        for (let i = 0; i < 100; i++) {
            try { if ((await fetch(`http://127.0.0.1:${port}/api/ready`)).status === 200) { ready = true; break; } } catch { /* loopback startup */ }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(ready, true);
        assert.equal((await fetch(`http://127.0.0.1:${port}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.A}` } })).status, 200);
    } finally { const exited = once(child, 'exit'); child.send('SIGTERM'); const [code] = await exited; assert.equal(code, 0); }
    assert.deepEqual(await rows(recovered), before); assert.deepEqual(await history(recovered), meta);
});
test('application restart keeps all committed history, while the independent reference remains byte-equivalent at row level', async () => {
    const before = await rows(db), meta = await history(db);
    await stopStaging(state);
    await Promise.all(clients.map(c => c.$disconnect()));
    await startPostgres(state);
    await startApplication(state);
    assert.equal((await request('/api/auth/me')).status, 200); assert.deepEqual(await rows(db), before); assert.deepEqual(await history(db), meta);
    assert.deepEqual(await rows(reference), referenceRows); assert.deepEqual(await history(reference), referenceHistory);
    const audit = await inspect(state, 'reference');
    await writeFile(path.join(state.root, 'test-evidence.json'), JSON.stringify({ source: state.source, productionAccessed: false,
        referencePreserved: true, differences: audit.differences, businessTables: 17, columns: 155, foreignKeys: 18, indexes: 48,
        counts: audit.counts, declaredOrphans: audit.declaredOrphans, diagnostics: audit.diagnostics, supplemental: audit.supplemental,
        fullRecovery: true, interruptedRecovery: true, failedMigrationRecovery: true, applicationRestart: true, dockerExecuted: false }, null, 2));
});
