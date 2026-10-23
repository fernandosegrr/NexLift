import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import { target, migrations, baseline, operations, history, seed, rows, catalog, sql, close, root, marker } from './fixtures/phase6-environment.js';
import { releasePreflight, operationsCatalog } from '../deploy/release-preflight.mjs';
import { migrateDisposable } from '../deploy/release-migrate.mjs';
import { startRelease } from '../deploy/release-http.mjs';
import { dumpSystemPostgres, restoreSystemPostgres } from '../src/services/postgresSystemBackup.js';
import { exportBackup } from '../src/services/backupExport.js';
import { restoreBackup } from '../src/services/backupRestore.js';
import { applyOperation } from '../src/services/workoutOperations.js';
import { freePort } from '../staging/local.mjs';
import { fakeProviders } from './fixtures/phase7-providers.js';

const chain = [baseline, operations, history], secret = 'phase10-'.padEnd(64, 'x');
const evidence = { productionTouched: false, baseline: 'PROVISIONAL', tests: [], performance: {}, simulations: {} };
let source;
const credentials = (db, directory) => ({ prisma: db.raw, url: db.url, directory,
    bin: process.env.NEXLIFT_TEST_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : undefined), acknowledgeSensitive: true });
const operation = id => ({ operationId: id, kind: 'workout.create', source: 'pwa', performedAt: '2026-10-18T05:59:59.999Z',
    exerciseId: 'ea', sets: [{ weight: 90, reps: 10, rpe: 8, completed: true }] });
const opId = '12345678-1234-4000-8000-123456789abc';
before(async () => {
    source = await target('e10'); assert.equal((await migrations(source, chain)).status, 0); seed(source);
    assert.deepEqual(await source.raw.$transaction(tx => operationsCatalog(tx)), JSON.parse(await readFile(new URL('../deploy/operations-catalog.json', import.meta.url), 'utf8')));
});
after(async () => {
    await close(); await mkdir(new URL('../audit/release/', import.meta.url), { recursive: true });
    await writeFile(new URL('../audit/release/integration-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
});
test('10 preflight validates current schema, operations, checksums and all table counts without changing data', async () => {
    const before = await rows(source), report = await releasePreflight(source.raw);
    assert(report.ready); assert.equal(report.appliedMigrations, 3); assert.equal(report.catalog.tables, 17);
    assert.deepEqual(await rows(source), before); evidence.preflight = report;
});
test('10 separated migration job installs from zero and is repeatable with exact migration history', async () => {
    const db = await target('a10'); const env = { NEXLIFT_RELEASE_MODE: 'rehearsal', NEXLIFT_RELEASE_DATABASE_URL: db.url, NEXLIFT_DISPOSABLE_MARKER: marker };
    assert((await migrateDisposable(env)).migrated); assert((await migrateDisposable(env)).migrated);
    assert.equal((await releasePreflight(db.raw)).appliedMigrations, 3);
});
test('10 legacy preflight and synthetic populated upgrade preserve counts, IDs and all legacy columns', async () => {
    const db = await target('b10'); assert.equal((await migrations(db, [baseline, operations])).status, 0); seed(db);
    const old = await rows(db, true), report = await releasePreflight(db.raw, { phase: 'legacy' }); assert(!report.ready);
    assert.deepEqual(report.pending, [history]); assert.equal((await migrations(db, [history])).status, 0);
    assert.deepEqual(await rows(db, true), old); assert.deepEqual((await releasePreflight(db.raw)).counts, report.counts);
});
test('10 preflight rejects schema drift and missing journal index without automatic repair', async () => {
    const db = await target('c10'); assert.equal((await migrations(db, chain)).status, 0);
    sql(db, 'DROP INDEX nexlift_operations."IdempotencyRecord_resourceId_idx";');
    await assert.rejects(releasePreflight(db.raw), /incompatible/);
    sql(db, 'ALTER TABLE "BodyLog" ALTER COLUMN weight SET NOT NULL;');
    await assert.rejects(releasePreflight(db.raw));
});
test('10 preflight rejects tampered migration checksum and ambiguous legacy owners without writing', async () => {
    const db = await target('d10'); assert.equal((await migrations(db, [baseline, operations])).status, 0); seed(db);
    sql(db, 'UPDATE "Routine" SET "userId"=NULL WHERE id=\'ra\';'); const before = await rows(db, true);
    await assert.rejects(releasePreflight(db.raw, { phase: 'legacy' }), /Incompatible data/); assert.deepEqual(await rows(db, true), before);
    sql(db, "UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='0_init';");
    await assert.rejects(releasePreflight(db.raw, { phase: 'legacy' }));
});
test('10 full restore recovers original data after mutation, PR, receipts, pending jobs and permits real HTTP reads/writes', async () => {
    await applyOperation(source.client, 'A', operation(opId));
    const original = await rows(source), directory = path.join(root, 'phase10-full');
    const started = performance.now(), manifest = await dumpSystemPostgres(credentials(source, directory));
    evidence.backupMs = performance.now() - started; assert.equal(manifest.operationJournal.count, 1);
    sql(source, "UPDATE \"SetLog\" SET weight=1 WHERE id='sa';");
    assert.notDeepEqual(await rows(source), original);
    const restored = await target('aa10'), restoreStarted = performance.now();
    assert((await restoreSystemPostgres(credentials(restored, directory))).verified);
    evidence.restoreMs = performance.now() - restoreStarted; assert.deepEqual(await rows(restored), original);
    assert((await releasePreflight(restored.raw)).ready);
    const replay = await applyOperation(restored.client, 'A', operation(opId)); assert.equal(replay.status, 200);
    assert.equal(await restored.raw.pendingReminder.count(), 1); assert.equal(await restored.raw.workoutLog.count({ where: { userId: 'B' } }), 1);
    await restored.raw.bodyLog.create({ data: { userId: 'B', weight: 75 } });
    assert.equal(await restored.raw.bodyLog.count({ where: { userId: 'B' } }), 1);
    const live = await startRelease({ env: { NODE_ENV: 'production', NEXLIFT_RELEASE_MODE: 'rehearsal', NEXLIFT_HTTP_TRANSPORT: 'express',
        JWT_SECRET: secret, NEXLIFT_REPLICAS: '1', NEXLIFT_RELEASE_DATABASE_URL: restored.url, NEXLIFT_DISPOSABLE_MARKER: marker,
        NEXLIFT_BIND_HOST: '127.0.0.1', PORT: String(await freePort()) }, signals: new EventEmitter(), exit: code => assert.equal(code, 0) });
    try {
        const base = `http://127.0.0.1:${live.server.address().port}`, auth = { authorization: `Bearer ${jwt.sign({ userId: 'A', tokenVersion: 0 }, secret)}` };
        assert.equal((await fetch(base + '/api/stats/overview', { headers: auth })).status, 200);
        const saved = await fetch(base + '/api/shortcuts/log-set?date=2026-10-17', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ exerciseId: 'ea', weight: 95, reps: 10, rpe: 2 }) });
        assert.equal(saved.status, 201);
    } finally { await live.shutdown(); }
    evidence.recovery = { exactAllModelRows: true, manifestSha256: manifest.archiveSha256, counts: (await releasePreflight(restored.raw)).counts, replay: true };
});
test('10 operation commits and lost-response replay have measured latency and exactly one retained set per operation', async () => {
    const db = await target('ba10'); assert.equal((await migrations(db, chain)).status, 0); seed(db);
    const commits = [], replays = [], inputs = Array.from({ length: 20 }, () => operation(randomUUID()));
    for (const input of inputs) {
        let start = performance.now(); assert.equal((await applyOperation(db.client, 'A', input)).status, 201); commits.push(performance.now() - start);
        start = performance.now(); assert.equal((await applyOperation(db.client, 'A', input)).status, 200); replays.push(performance.now() - start);
    }
    assert.equal(await db.raw.workoutLog.count(), 24); assert.equal(await db.raw.setLog.count(), 25);
    const summarize = list => { list.sort((a, b) => a - b); return { n: list.length, p50: list[9], p95: list[18], errors: 0 }; };
    evidence.performance.operations = { commit: summarize(commits), replay: summarize(replays), note: 'Direct service+Prisma; browser offline scheduling not included' };
});
test('10 selected release runtime restores one pending reminder after restart with simulated provider only', async () => {
    const db = await target('bb10'); assert.equal((await migrations(db, chain)).status, 0); seed(db);
    await db.raw.pushSubscription.updateMany({ data: { endpoint: 'https://fcm.googleapis.com/fcm/send/phase10-synthetic' } });
    await db.raw.pendingReminder.updateMany({ data: { fireAt: new Date(Date.now() + 4000) } });
    let sends = 0;
    const providers = fakeProviders({ vapidConfigured: true, webpush: { sendNotification: async () => { sends++; } } });
    const env = { NODE_ENV: 'production', NEXLIFT_RELEASE_MODE: 'rehearsal', NEXLIFT_HTTP_TRANSPORT: 'express', JWT_SECRET: secret,
        NEXLIFT_REPLICAS: '1', NEXLIFT_RELEASE_DATABASE_URL: db.url, NEXLIFT_DISPOSABLE_MARKER: marker, PORT: String(await freePort()) };
    const options = { env, providers, signals: new EventEmitter(), exit: code => assert.equal(code, 0) };
    let live = await startRelease(options); await live.shutdown(); assert.equal(await db.raw.pendingReminder.count(), 1);
    live = await startRelease({ ...options, env: { ...env, NEXLIFT_HTTP_TRANSPORT: 'fastify', NEXLIFT_FASTIFY_ACTIVATION: 'reviewed-v4' } });
    try {
        for (let attempt = 0; attempt < 100 && sends === 0; attempt++) await delay(100);
        assert.equal(sends, 1);
        for (let attempt = 0; attempt < 20 && await db.raw.pendingReminder.count(); attempt++) await delay(50);
        assert.equal(await db.raw.pendingReminder.count(), 0);
        evidence.jobs = { restart: true, switchedToFastify: true, simulatedAcceptances: sends };
    } finally { await live.shutdown(); }
});
test('10 portable backup restores validated owned history and intentionally excludes credentials, receipts and pending jobs', async () => {
    const db = await target('ab10'); assert.equal((await migrations(db, chain)).status, 0); seed(db);
    const portable = await exportBackup(db.raw, 'A'); const result = await restoreBackup(db.raw, portable, 'B', { dryRun: false });
    assert(result.ok); assert.equal(await db.raw.pendingReminder.count({ where: { userId: 'B' } }), 0);
    const restored = await exportBackup(db.raw, 'B'); assert(restored.data.WorkoutLog.length > portable.data.WorkoutLog.length);
    assert(!JSON.stringify(portable).includes('SYNTHETIC_SECRET'));
    const before = await rows(db); portable.data.SetLog[0].weight += 1;
    await assert.rejects(restoreBackup(db.raw, portable, 'B', { dryRun: false })); assert.deepEqual(await rows(db), before);
});
test('10 corrupt archive, incomplete restore and schema mismatch never leave partially restored tables', async () => {
    const original = path.join(root, 'phase10-full');
    for (const [name, change] of [['corrupt', async directory => writeFile(path.join(directory, 'system.dump'), 'corrupt')],
        ['incomplete', async directory => { const file = path.join(directory, 'system-manifest.json'); const m = JSON.parse(await readFile(file, 'utf8')); m.entities.SetLog.count++; await writeFile(file, JSON.stringify(m)); }],
        ['schema', async directory => { const file = path.join(directory, 'system-manifest.json'); const m = JSON.parse(await readFile(file, 'utf8')); m.schemaSha256 = '0'.repeat(64); await writeFile(file, JSON.stringify(m)); }]]) {
        const directory = path.join(root, `phase10-${name}`); await cp(original, directory, { recursive: true }); await change(directory);
        const db = await target(`ac10_${name === 'corrupt' ? 'a' : name === 'incomplete' ? 'b' : 'c'}`);
        await assert.rejects(restoreSystemPostgres(credentials(db, directory))); assert.equal((await catalog(db)).tables.length, 0);
        evidence.simulations[name] = 'rejected; destination empty';
    }
});
test('10 filesystem failure prevents backup certification and database loss rejects preflight', async () => {
    // Deterministic I/O failure at mkdir; do not fill the user disk to induce ENOSPC.
    const file = path.join(root, 'phase10-no-space-file'); await writeFile(file, 'occupied');
    await assert.rejects(dumpSystemPostgres(credentials(source, path.join(file, 'archive'))));
    const unavailable = { $transaction: async () => { throw Object.assign(Error('unavailable'), { code: 'P1001' }); } };
    await assert.rejects(releasePreflight(unavailable)); evidence.simulations.filesystem = 'ENOTDIR real; ENOSPC not physically induced';
});
for (const transport of ['express', 'fastify']) test(`10 ${transport} release starts without DDL, serves SPA, drains, restarts and rejects offline activation`, async () => {
    const db = await target(transport === 'express' ? 'ae10' : 'af10'); assert.equal((await migrations(db, chain)).status, 0); seed(db);
    const port = await freePort(), signals = new EventEmitter(), exits = [];
    const env = { NODE_ENV: 'production', NEXLIFT_RELEASE_MODE: 'rehearsal', NEXLIFT_HTTP_TRANSPORT: transport,
        NEXLIFT_FASTIFY_ACTIVATION: 'reviewed-v4', JWT_SECRET: secret, NEXLIFT_REPLICAS: '1', NEXLIFT_RELEASE_DATABASE_URL: db.url,
        NEXLIFT_DISPOSABLE_MARKER: marker, NEXLIFT_BIND_HOST: '127.0.0.1', PORT: String(port) };
    const before = await rows(db), started = performance.now();
    let running = await startRelease({ env, signals, exit: code => exits.push(code) });
    const startupMs = performance.now() - started, base = `http://127.0.0.1:${port}`;
    const auth = { authorization: `Bearer ${jwt.sign({ userId: 'A', tokenVersion: 0 }, secret)}` };
    try {
        assert.equal((await fetch(base + '/api/health')).status, 200); assert.equal((await fetch(base + '/api/ready')).status, 200);
        assert.match(await (await fetch(base + '/')).text(), /<html/); assert.equal((await fetch(base + '/sw.js')).status, 200);
        assert.equal((await fetch(base + '/api/stats/home', { headers: auth })).status, 200);
        assert.deepEqual(await rows(db), before);
        const latencies = [];
        for (let batch = 0; batch < 5; batch++) await Promise.all(Array.from({ length: 8 }, async () => {
            const start = performance.now(); const res = await fetch(base + '/api/stats/overview', { headers: auth });
            assert.equal(res.status, 200); await res.json(); latencies.push(performance.now() - start);
        }));
        latencies.sort((a, b) => a - b);
        evidence.performance[transport] = { startupMs, n: latencies.length, concurrency: 8, p50: latencies[19], p95: latencies[37], errors: 0, rssBytes: process.memoryUsage().rss };
        const write = await fetch(base + '/api/shortcuts/log-set?date=2026-10-17', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ exerciseId: 'ea', weight: 85, reps: 10, rpe: 2 }) }); assert.equal(write.status, 201);
        const afterWrite = await rows(db);
        // Same shutdown callback installed for SIGTERM, without killing the test runner.
        await running.shutdown(); assert.equal(exits.at(-1), 0); assert(!running.server.listening);
        running = await startRelease({ env, signals, exit: code => exits.push(code) });
        assert.deepEqual(await rows(db), afterWrite); assert.equal((await fetch(base + '/api/ready')).status, 200);
        const disabled = await fetch(base + '/api/operations', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(operation(opId)) }); assert.notEqual(disabled.status, 201);
    } finally { await running.shutdown(); }
});
