import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { serverDir, runPg } from '../audit/postgresql/audit-tools.mjs';
import { seedBackupFixture } from './fixtures/backup-fixture.js';
import { createOperationStore } from '../../client/src/services/operationStore.js';
import { createOperationTransport } from '../../client/src/services/operationTransport.js';
import { createOperationSync } from '../../client/src/services/operationSync.js';
import { runBrowserSync } from './fixtures/sync-browser.mjs';
import { mountOperationRoutes } from '../src/routes/operations.js';

const root = process.env.NEXLIFT_OPS_TEST_ROOT, port = process.env.NEXLIFT_OPS_TEST_PORT;
if (!process.env.NEXLIFT_SYNC_TEST || path.dirname(await realpath(root)) !== await realpath(tmpdir()) || !path.basename(root).startsWith('nexlift-operation-tests-')) throw new Error('Disposable runner required');
const pid = (await readFile(path.join(root, 'data/postmaster.pid'), 'utf8')).split(/\r?\n/);
assert.equal(pid[3], port); assert.equal(await realpath(pid[1]), await realpath(path.join(root, 'data')));
const url = name => `postgresql://nexlift_ops_test@127.0.0.1:${port}/nexlift_ops_test_${name}`;
const db = new PrismaClient({ datasources: { db: { url: url('empty') } } });
let child, base, clock = Date.parse('2026-10-20T05:59:59.999Z');
let browserEvidence;
const token = user => jwt.sign({ userId: user, tokenVersion: 0 }, 'synthetic-sync-jwt');
let identity = { ownerId: 'A', token: token('A') };
const sets = [{ weight: 180, reps: 8, rir: 2, weightRight: 150, repsRight: 10, completed: true },
    { weight: 10, reps: 2, rpe: 7, completed: false }];
const counts = async () => ({ logs: await db.workoutLog.count(), sets: await db.setLog.count(), rest: await db.restLog.count(),
    receipts: (await db.$queryRaw`SELECT count(*)::int AS n FROM nexlift_operations."IdempotencyRecord"`)[0].n });
async function start(name = 'empty') {
    child = spawn(process.execPath, ['test/fixtures/sync-http.mjs'], { cwd: serverDir, windowsHide: true,
        env: { ...process.env, NEXLIFT_OPS_TEST_URL: url(name) }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const errors = []; child.stderr.on('data', chunk => errors.push(chunk));
    const [message] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(Buffer.concat(errors).toString()); })]);
    base = `http://127.0.0.1:${message.port}/api`;
}
async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.send('stop'); await done; } }
async function fault(value) { const changed = once(child, 'message'); child.send({ fault: value }); assert.equal((await changed)[0].fault, value); }
function local(map = new Map()) {
    const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k),
        key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
    return { storage, map };
}
async function runtime({ map, offline = false, enabled = true, fetcher } = {}) {
    const { storage, map: data } = local(map);
    const store = createOperationStore({ storage });
    const requests = [];
    const transport = createOperationTransport({ apiUrl: base, identity: () => identity, storage,
        fetcher: async (...args) => { requests.push({ url: args[0], method: args[1].method, body: args[1].body }); return (fetcher || fetch)(...args); } });
    await transport.remember({ id: identity.ownerId }, identity.token);
    const engine = createOperationSync({ store, transport, enabled, now: () => clock, online: () => !offline, setTimer: () => 0, clearTimer: () => {} });
    return { engine, store, transport, map: data, requests };
}
const capture = r => r.engine.capture('workout.create', { exerciseId: `${identity.ownerId}-Exercise`, sets, notes: 'Original sin pérdida' }, { ownerId: identity.ownerId });
const operation = async r => (await r.store.list('A'))[0];
before(async () => {
    assert.equal((await db.$queryRaw`SELECT system_identifier::text AS id FROM pg_control_system()`)[0].id, process.env.NEXLIFT_OPS_TEST_SYSTEM_ID);
    assert.equal((await db.$queryRaw`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)[0].marker, process.env.NEXLIFT_OPS_TEST_MARKER);
    const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(root, 'work/prisma/schema.prisma')], {
        cwd: serverDir, env: { ...process.env, DATABASE_URL: url('empty') }, windowsHide: true, encoding: 'utf8', timeout: 60000 });
    assert.equal(migrated.status, 0, migrated.stderr);
    const args = ['-h', '127.0.0.1', '-p', port, '-U', 'nexlift_ops_test', '-d', 'nexlift_ops_test_missing'];
    runPg('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1', ...args, '-1', '-f', path.join(serverDir, 'prisma/migrations/0_init/migration.sql')]);
    for (const name of ['empty', 'missing']) {
        const client = name === 'empty' ? db : new PrismaClient({ datasources: { db: { url: url(name) } } });
        for (const user of ['A', 'B']) { await seedBackupFixture(client, user); await client.user.update({ where: { id: user }, data: { tokenVersion: 0 } }); }
        await client.workoutLog.deleteMany(); await client.personalRecord.deleteMany();
        if (name === 'missing') await client.$disconnect();
    }
    await db.$executeRawUnsafe('CREATE ROLE nexlift_sync_http LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
    for (const name of ['empty', 'missing']) {
        const client = name === 'empty' ? db : new PrismaClient({ datasources: { db: { url: url(name) } } });
        await client.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO nexlift_sync_http');
        await client.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexlift_sync_http');
        await client.$executeRawUnsafe('REVOKE INSERT,UPDATE,DELETE ON public._prisma_migrations FROM nexlift_sync_http').catch(() => {});
        if (name === 'missing') await client.$disconnect();
    }
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA nexlift_operations TO nexlift_sync_http');
    await db.$executeRawUnsafe('GRANT SELECT,INSERT ON nexlift_operations."IdempotencyRecord" TO nexlift_sync_http');
    await start();
});
after(async () => { await stop(); await db.$disconnect(); });
test('capability negotiation is authenticated, read-only and inspects the SQL journal', async () => {
    const old = await counts(); const r = await fetch(base + '/v1/workout-capabilities', { headers: { Authorization: `Bearer ${token('A')}` } });
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await r.json(), { protocolVersion: 1, receiptFormat: 'sha256-v1', userId: 'A', enabled: true, ready: true,
        kinds: ['workout.create', 'workout.appendSet', 'workout.replaceSets', 'workout.delete', 'rest.create'] });
    assert.deepEqual(await counts(), old);
});
test('production refuses sync capability even when its environment flag is explicitly true', async () => {
    const previousNode = process.env.NODE_ENV, previousFlag = process.env.NEXLIFT_OFFLINE_SYNC_ENABLED;
    const handlers = new Map(), app = { post() {}, get(route, auth, handler) { handlers.set(route, handler); } };
    let status, body;
    const response = { set() {}, status(value) { status = value; return this; }, json(value) { body = value; } };
    try {
        process.env.NODE_ENV = 'production'; process.env.NEXLIFT_OFFLINE_SYNC_ENABLED = 'true';
        mountOperationRoutes(app, { prisma: db, authMiddleware() {} });
        await handlers.get('/api/v1/workout-capabilities')({ userId: 'A' }, response);
        assert.equal(status, 200); assert.equal(body.enabled, false); assert.equal(body.ready, true);
    } finally {
        if (previousNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNode;
        if (previousFlag === undefined) delete process.env.NEXLIFT_OFFLINE_SYNC_ENABLED; else process.env.NEXLIFT_OFFLINE_SYNC_ENABLED = previousFlag;
    }
});
test('offline frontend reconnects across CDMX midnight with complete original data and PR', async () => {
    const r = await runtime({ offline: true }), old = await counts(); await capture(r); const snapshot = (await operation(r)).payload;
    clock += 86400000; const resumed = await runtime({ map: r.map }); await resumed.engine.run(); const item = await operation(resumed);
    assert.equal(item.status, 'confirmed'); assert.deepEqual(item.payload, snapshot);
    const log = await db.workoutLog.findUnique({ where: { id: item.receipt.result.workoutLog.id }, include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true } });
    assert.equal(log.date.toISOString(), '2026-10-20T05:59:59.999Z'); assert.equal(log.notes, 'Original sin pérdida');
    assert.equal(item.originalDay, '2026-10-19'); assert.equal(item.receipt.operation.performedDay, '2026-10-19');
    assert.equal(log.sets[0].weightRight, 150); assert.equal(log.sets[0].repsRight, 10); assert.equal(log.sets[0].rpe, 8);
    assert.equal(log.sets[1].completed, false); assert.equal(log.sets[1].setNumber, 2); assert.equal(log.exercise.restSeconds, 113);
    const prs = await db.personalRecord.findMany({ where: { userId: 'A' } }); assert.equal(prs[0].weight, 180); assert.equal(prs[0].estimated1RM, 180 * (1 + 8 / 30));
    await resumed.engine.run(); assert.deepEqual(await db.personalRecord.findMany({ where: { userId: 'A' } }), prs);
    assert.deepEqual(await counts(), { ...old, logs: old.logs + 1, sets: old.sets + 2, receipts: old.receipts + 1 });
});
test('network cut immediately BEFORE commit rolls back log, sets, PR and receipt; same ID then succeeds', async () => {
    const r = await runtime(), old = await counts(), prs = await db.personalRecord.findMany(); await fault('before');
    assert.equal((await capture(r)).queued, true); const payload = (await operation(r)).payload;
    assert.deepEqual(await counts(), old); assert.deepEqual(await db.personalRecord.findMany(), prs);
    clock = (await operation(r)).nextRetryAt + 1; await r.engine.run(); assert.equal((await operation(r)).status, 'confirmed');
    assert.deepEqual(r.requests.filter(req => req.method === 'POST').map(req => JSON.parse(req.body)), [payload, payload]);
});
test('network cut immediately AFTER commit is recovered by receipt with no second POST', async () => {
    const r = await runtime(), old = await counts(); await fault('after'); await capture(r);
    assert.equal((await operation(r)).status, 'retry_scheduled'); assert.equal((await counts()).logs, old.logs + 1);
    clock = (await operation(r)).nextRetryAt + 1; await r.engine.run(); assert.equal((await operation(r)).status, 'confirmed');
    assert.equal(r.requests.filter(req => req.method === 'POST').length, 1); assert.equal((await counts()).receipts, old.receipts + 1);
});
test('Node restart and browser-module reconstruction recognize a committed uncertain operation', async () => {
    const r = await runtime(); await fault('after'); await capture(r); const old = await counts();
    await stop(); await start(); clock = (await operation(r)).nextRetryAt + 1;
    const reloaded = await runtime({ map: r.map }); await reloaded.engine.run();
    assert.equal((await operation(reloaded)).status, 'confirmed'); assert.equal(reloaded.requests.filter(req => req.method === 'POST').length, 0); assert.deepEqual(await counts(), old);
});
test('two frontend instances without Web Locks still have exactly one database effect', async () => {
    const r = await runtime({ offline: true }); await capture(r); const old = await counts();
    // Different adapters intentionally bypass the JavaScript lock. SQL is the guarantee.
    let arrived = 0, release;
    const both = new Promise(resolve => { release = resolve; });
    const simultaneous = async (...args) => {
        const response = await fetch(...args);
        if (args[1].method === 'GET' && args[0].includes('/workout-operations/')) { if (++arrived === 2) release(); await both; }
        return response;
    };
    const a = await runtime({ map: r.map, fetcher: simultaneous }), b = await runtime({ map: r.map, fetcher: simultaneous });
    a.store.withLock = b.store.withLock = (owner, task) => task();
    await Promise.all([a.engine.run(), b.engine.run()]);
    assert.equal((await operation(a)).status, 'confirmed'); assert.deepEqual(await counts(), { ...old, logs: old.logs + 1, sets: old.sets + 2, receipts: old.receipts + 1 });
    assert.equal([...a.requests, ...b.requests].filter(req => req.method === 'POST').length, 2);
});
test('two distinct offline sessions on the same date remain separate', async () => {
    const r = await runtime({ offline: true }); const a = await capture(r); clock++; const b = await capture(r); const resumed = await runtime({ map: r.map });
    await resumed.engine.run(); const items = await resumed.store.list('A'); assert.notEqual(a.operationId, b.operationId);
    assert.equal(items.filter(item => item.status === 'confirmed').length, 2); assert.notEqual(items[0].receipt.result.workoutLog.id, items[1].receipt.result.workoutLog.id);
});
test('account B never queries A receipts; A reconnects later without loss', async () => {
    const r = await runtime({ offline: true }); await capture(r); identity = { ownerId: 'B', token: token('B') };
    const b = await runtime({ map: r.map }); await b.engine.run(); assert.equal(b.requests.length, 0); assert.equal((await operation(r)).status, 'pending');
    identity = { ownerId: 'A', token: token('A') }; const a = await runtime({ map: r.map }); await a.engine.run(); assert.equal((await operation(a)).status, 'confirmed');
});
test('changing accounts while the HTTP response arrives leaves A unconfirmed locally, B untouched', async () => {
    const r = await runtime({ fetcher: async (...args) => { const response = await fetch(...args); if (args[1].method === 'POST') identity = { ownerId: 'B', token: token('B') }; return response; } });
    await capture(r); assert.equal((await operation(r)).status, 'syncing'); const old = await counts(); await r.engine.run(); assert.deepEqual(await counts(), old);
    identity = { ownerId: 'A', token: token('A') }; const back = await runtime({ map: r.map }); await back.engine.run(); assert.equal((await operation(back)).status, 'confirmed');
});
test('revoked JWT produces a retained authentication pause, not a deletion', async () => {
    const r = await runtime({ offline: true }); await capture(r); await db.user.update({ where: { id: 'A' }, data: { tokenVersion: 1 } });
    const resumed = await runtime({ map: r.map }); await resumed.engine.run(); assert.equal((await operation(resumed)).status, 'paused_auth');
    assert.equal(resumed.requests.filter(req => req.method === 'POST').length, 0);
    await db.user.update({ where: { id: 'A' }, data: { tokenVersion: 0 } }); await resumed.engine.retry(); assert.equal((await operation(resumed)).status, 'confirmed');
});
test('stale session version gives 409 and never changes the original expectedVersion', async () => {
    const created = await runtime(); const made = await capture(created), logId = made.workoutLog.id, expectedVersion = made.sessionVersion;
    const pending = await runtime({ offline: true }); await pending.engine.capture('workout.replaceSets', { logId, expectedVersion, sets: sets.slice(0, 1) });
    const changed = await runtime(); await changed.engine.capture('workout.appendSet', { logId, expectedVersion, sets: [{ weight: 1, reps: 1, rpe: 8 }] });
    const old = await counts(), resumed = await runtime({ map: pending.map }); await resumed.engine.run();
    assert.equal((await operation(resumed)).status, 'conflict'); assert.equal((await operation(resumed)).payload.expectedVersion, expectedVersion); assert.deepEqual(await counts(), old);
});
test('dependent offline replacements are retained without inventing consecutive versions', async () => {
    const made = await capture(await runtime()), r = await runtime({ offline: true });
    const input = { logId: made.workoutLog.id, expectedVersion: made.sessionVersion, sets: sets.slice(0, 1) };
    await r.engine.capture('workout.replaceSets', input); clock++; await r.engine.capture('workout.replaceSets', input);
    const resumed = await runtime({ map: r.map }); await resumed.engine.run();
    assert.deepEqual((await resumed.store.list('A')).map(item => item.status), ['confirmed', 'blocked_dependency']);
});
test('rest creation preserves original instant and cannot duplicate after losing reply', async () => {
    const r = await runtime(), old = await counts(); await fault('after'); await r.engine.capture('rest.create', { note: 'Descanso original' });
    clock = (await operation(r)).nextRetryAt + 1; await r.engine.run();
    const item = await operation(r); assert.equal(item.status, 'confirmed'); assert.equal(item.receipt.result.restLog.date, item.payload.performedAt);
    assert.equal((await counts()).rest, old.rest + 1);
});
test('backend without provisional migration blocks frontend before every mutation', async () => {
    await stop(); await start('missing'); const r = await runtime(), original = identity.token;
    assert.equal((await capture(r)).queued, true); assert.equal((await operation(r)).status, 'retry_scheduled');
    assert.equal((await operation(r)).errorCode, 'OPERATIONS_NOT_READY'); assert.equal(identity.token, original); assert.equal(r.requests.length, 1);
    await stop(); await start();
});
test('a real PostgreSQL outage preserves authentication and operations, recovery confirms once', async () => {
    const r = await runtime({ offline: true }); await capture(r); await db.$disconnect();
    runPg('pg_ctl', ['-D', path.join(root, 'data'), '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    const resumed = await runtime({ map: r.map }), saved = identity.token;
    try { await resumed.engine.run(); assert.equal((await operation(resumed)).status, 'retry_scheduled'); assert.equal(identity.token, saved); }
    finally { runPg('pg_ctl', ['-D', path.join(root, 'data'), '-l', path.join(root, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { stdio: 'ignore' }); }
    for (let attempt = 0; attempt < 8 && (await operation(resumed)).status !== 'confirmed'; attempt++) {
        clock = ((await operation(resumed)).nextRetryAt || clock) + 1; await delay(30); await resumed.engine.run();
    }
    assert.equal((await operation(resumed)).status, 'confirmed'); assert.equal(resumed.requests.filter(req => req.method === 'POST').length, 1);
});
test('legacy iOS shortcut keeps its additive contract without new-client metadata', async () => {
    const r = await fetch(base + '/shortcuts/log-set', { method: 'POST', headers: { Authorization: `Bearer ${token('B')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: 'B-Exercise', weight: 25, reps: 8, rir: 2 }) });
    assert.equal(r.status, 201); const body = await r.json(); assert.ok(body.set || body.workoutLog || body.success);
});
test('real React browser: offline journal, automatic reconnection, two tabs, reload, UI and one SQL effect', async () => {
    browserEvidence = await runBrowserSync({ root, backend: base.slice(0, -4), token: token('A'), counts });
});
test('final database and frontend evidence has no orphan receipt and no production target', async () => {
    const orphan = await db.$queryRaw`SELECT count(*)::int AS n FROM nexlift_operations."IdempotencyRecord" r LEFT JOIN public."User" u ON u.id=r."userId" WHERE u.id IS NULL`;
    assert.equal(orphan[0].n, 0);
    await writeFile(path.join(root, 'sync-evidence.json'), JSON.stringify({ createdAt: new Date().toISOString(), source: 'SYNTHETIC_ONLY_NOT_PRODUCTION',
        productionTouched: false, realPostgres: true, realNodeRestart: true, realPostgresRestart: true,
        sqlFailureImmediatelyBeforeCommit: true, httpResponseDroppedImmediatelyAfterCommit: true,
        frontendEngine: 'Actual client modules; replaceable local Storage adapter', browserEvidence, counts: await counts() }, null, 2) + '\n');
});
