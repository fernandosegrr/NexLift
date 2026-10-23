import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { serverDir, runPg, inspectSql, loadDeclared, compareCatalog } from '../audit/postgresql/audit-tools.mjs';
import { seedBackupFixture } from './fixtures/backup-fixture.js';
import { dumpSystemPostgres, restoreSystemPostgres } from '../src/services/postgresSystemBackup.js';
import { dumpPostgres, restorePostgres } from '../src/services/postgresBackup.js';
import { businessCatalog } from '../deploy/releaseGate.js';
import { applyOperation } from '../src/services/workoutOperations.js';

const root = process.env.NEXLIFT_OPS_TEST_ROOT, port = process.env.NEXLIFT_OPS_TEST_PORT;
if (!root || path.dirname(await realpath(root)) !== await realpath(tmpdir()) || !path.basename(root).startsWith('nexlift-operation-tests-')) throw new Error('Disposable runner required');
const pid = (await readFile(path.join(root, 'data/postmaster.pid'), 'utf8')).split(/\r?\n/);
assert.equal(pid[3], port); assert.equal(await realpath(pid[1]), await realpath(path.join(root, 'data')));
const url = name => `postgresql://nexlift_ops_test@127.0.0.1:${port}/nexlift_ops_test_${name}`;
const db = new PrismaClient({ datasources: { db: { url: url('empty') } } });
const upgrade = new PrismaClient({ datasources: { db: { url: url('upgrade') } } });
let child, base, first, version, logId, lost;
const diagnostics = [];
const auth = user => jwt.sign({ userId: user, tokenVersion: 0 }, 'synthetic-operation-jwt');
const body = extra => ({ operationId: randomUUID(), kind: 'workout.create', source: 'pwa',
    performedAt: '2026-10-19T05:59:59.999Z', exerciseId: 'A-Exercise', sets: [{ weight: 80, reps: 10, rir: 2 }], ...extra });
const call = async (payload, { user = 'A', method = 'POST', route = '/api/v1/workout-operations' } = {}) => {
    const r = await fetch(base + route, { method, headers: { Authorization: `Bearer ${user === 'invalid' ? 'invalid' : auth(user)}`, 'Content-Type': 'application/json' },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(20000) });
    return { status: r.status, body: await r.json() };
};
const receipt = id => call(undefined, { method: 'GET', route: `/api/v1/workout-operations/${id}` });
const migrate = (name, allowed = true, extra = ['deploy']) => spawnSync(process.execPath, [path.join(serverDir, 'node_modules/prisma/build/index.js'), 'migrate', ...extra,
    '--schema', path.join(root, 'work/prisma/schema.prisma')], { cwd: path.join(root, 'work'), windowsHide: true, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, DATABASE_URL: url(name), PGOPTIONS: allowed ? `-c nexlift.phase31_disposable=${process.env.NEXLIFT_OPS_TEST_MARKER}` : '' } });
async function start() {
    child = spawn(process.execPath, ['test/fixtures/operation-http.mjs'], { cwd: serverDir, windowsHide: true,
        env: { ...process.env, NEXLIFT_OPS_TEST_URL: url('empty') + '?connection_limit=4' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const errors = []; child.stderr.on('data', c => errors.push(c));
    child.on('message', message => { if (message.diagnostic) diagnostics.push(message.diagnostic); });
    const message = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(Buffer.concat(errors).toString()); })]);
    base = `http://127.0.0.1:${message[0].port}`;
}
async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.send('stop'); await done; } }
const counts = async () => ({ logs: await db.workoutLog.count(), sets: await db.setLog.count(),
    receipts: Number((await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM nexlift_operations."IdempotencyRecord"'))[0].n) });
async function failure(table, action, testBody, code = 'P0001') {
    await db.$executeRawUnsafe(`CREATE FUNCTION public.phase31_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure' USING ERRCODE='${code}'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER phase31_fail BEFORE ${action} ON ${table} FOR EACH ROW EXECUTE FUNCTION public.phase31_fail()`);
    try { await testBody(); }
    finally { await db.$executeRawUnsafe(`DROP TRIGGER phase31_fail ON ${table}`); await db.$executeRawUnsafe('DROP FUNCTION public.phase31_fail()'); }
}
before(async () => {
    const [identity] = await db.$queryRaw`SELECT system_identifier::text AS id FROM pg_control_system()`;
    assert.equal(identity.id, process.env.NEXLIFT_OPS_TEST_SYSTEM_ID);
    assert.equal((await db.$queryRaw`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)[0].marker, process.env.NEXLIFT_OPS_TEST_MARKER);
});
after(async () => { await stop(); await Promise.all([db.$disconnect(), upgrade.$disconnect()]); });

test('unmigrated backend fails closed without writing any operation', async () => {
    await assert.rejects(applyOperation(db, 'A', body()), e => e.status === 503 && e.code === 'OPERATIONS_NOT_READY');
});
test('provisional SQL migration refuses an unmarked/unauthorized migrate deploy', () => assert.notEqual(migrate('blocked', false).status, 0));
test('fresh disposable database reconstructs baseline and operation infrastructure', async () => {
    assert.equal(migrate('empty').status, 0);
    const rows = await db.$queryRaw`SELECT migration_name FROM public._prisma_migrations ORDER BY migration_name`;
    assert.deepEqual(rows.map(r => r.migration_name), ['0_init', '202610180001_phase31_operations']);
    for (const user of ['A', 'B']) {
        await seedBackupFixture(db, user);
        await db.user.update({ where: { id: user }, data: { tokenVersion: 0 } });
    }
    await db.workoutLog.deleteMany(); await db.personalRecord.deleteMany();
    await db.$executeRawUnsafe('CREATE ROLE nexlift_ops_http LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public,nexlift_operations TO nexlift_ops_http');
    await db.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexlift_ops_http');
    await db.$executeRawUnsafe('REVOKE INSERT,UPDATE,DELETE ON public._prisma_migrations FROM nexlift_ops_http');
    await db.$executeRawUnsafe('GRANT SELECT,INSERT ON nexlift_operations."IdempotencyRecord" TO nexlift_ops_http');
    await start();
});
test('synthetic legacy upgrade preserves every public row and physical table', async () => {
    const args = ['-h', '127.0.0.1', '-p', port, '-U', 'nexlift_ops_test', '-d', 'nexlift_ops_test_upgrade'];
    runPg('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1', ...args, '-1', '-f', path.join(serverDir, 'prisma/migrations/0_init/migration.sql')]);
    await seedBackupFixture(upgrade, 'A');
    const old = await upgrade.$queryRaw`SELECT c.relname,c.oid::text,c.relfilenode::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`;
    const logs = await upgrade.workoutLog.findMany({ include: { sets: true } });
    assert.equal(migrate('upgrade', true, ['resolve', '--applied', '0_init']).status, 0);
    assert.equal(migrate('upgrade').status, 0);
    const current = await upgrade.$queryRaw`SELECT c.relname,c.oid::text,c.relfilenode::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations' ORDER BY c.relname`;
    assert.deepEqual(current, old); assert.deepEqual(await upgrade.workoutLog.findMany({ include: { sets: true } }), logs);
});
test('legacy repeated POST has no receipt guarantee and still creates distinct server-dated sessions', async () => {
    const payload = { exerciseId: 'A-Exercise', sets: [{ weight: 10, reps: 5, rpe: 8 }] };
    const a = await call(payload, { route: '/api/workouts/log' }), b = await call(payload, { route: '/api/workouts/log' });
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    assert.notEqual(a.body.workoutLog.id, b.body.workoutLog.id);
    assert.notEqual(a.body.workoutLog.date, '2026-10-19T05:59:59.999Z');
    assert.equal((await counts()).receipts, 0);
});
test('first operation commits a distinct session and durable response with original time', async () => {
    first = body(); const r = await call(first); assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.replayed, false); assert.equal(r.body.operation.performedDay, '2026-10-18');
    assert.equal(r.body.result.workoutLog.date, first.performedAt);
    assert.notEqual(r.body.result.workoutLog.id, first.operationId);
    logId = r.body.result.workoutLog.id; version = r.body.result.sessionVersion;
    assert.equal((await counts()).receipts, 1);
});
test('identical retry and lookup return the stored result without writing PR, sets or receipt', async () => {
    const before = await counts(), pr = await db.personalRecord.findMany();
    const r = await call(first); assert.equal(r.status, 200); assert.equal(r.body.replayed, true);
    assert.equal(r.body.result.workoutLog.id, logId); assert.equal((await receipt(first.operationId)).body.result.sessionVersion, version);
    assert.deepEqual(await counts(), before); assert.deepEqual(await db.personalRecord.findMany(), pr);
});
test('restarting the Node process still recognizes committed operations', async () => {
    await stop(); await start(); const r = await call(first); assert.equal(r.status, 200); assert.equal(r.body.result.workoutLog.id, logId);
});
for (const n of [2, 10]) test(`${n} concurrent requests produce exactly one effect`, async () => {
    const op = body(), old = await counts();
    const result = await Promise.all(Array.from({ length: n }, () => call(op)));
    assert.ok(result.every(r => [200, 201].includes(r.status)), JSON.stringify(result));
    assert.equal(result.filter(r => r.status === 201).length, 1);
    assert.equal(new Set(result.map(r => r.body.result.workoutLog.id)).size, 1);
    assert.deepEqual(await counts(), { logs: old.logs + 1, sets: old.sets + 1, receipts: old.receipts + 1 });
});
for (const field of ['weight', 'reps']) test(`reusing an ID with changed ${field} is an explicit conflict`, async () => {
    const r = await call({ ...first, sets: [{ ...first.sets[0], [field]: 99 }] });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'OPERATION_CONTENT_CONFLICT');
});
test('a concurrent incompatible payload cannot silently replace the winner', async () => {
    const a = body(), b = { ...a, sets: [{ weight: 5, reps: 2, rir: 1 }] };
    const r = await Promise.all([call(a), call(b)]); assert.deepEqual(r.map(x => x.status).sort(), [201, 409]);
});
test('account-scoped IDs and lookups reveal no other account receipt or exercise', async () => {
    assert.equal((await call(undefined, { user: 'B', method: 'GET', route: `/api/v1/workout-operations/${first.operationId}` })).status, 404);
    assert.equal((await call(first, { user: 'B' })).status, 404);
    const r = await call({ ...first, exerciseId: 'B-Exercise' }, { user: 'B' }); assert.equal(r.status, 201);
    assert.notEqual(r.body.result.workoutLog.id, logId);
});
test('original dates span the CDMX boundary without using synchronization time', async () => {
    for (const [instant, day] of [['2026-10-19T05:59:59.999Z', '2026-10-18'], ['2026-10-19T06:00:00.000Z', '2026-10-19']]) {
        const r = await call(body({ performedAt: instant })); assert.equal(r.status, 201);
        assert.equal(r.body.operation.performedDay, day); assert.equal(r.body.result.workoutLog.date, instant);
    }
});
test('different operations on one exercise create distinct sessions, without invented merging', async () => {
    const r = await Promise.all([call(body()), call(body({ source: 'shortcut' }))]); assert.ok(r.every(x => x.status === 201));
    assert.notEqual(r[0].body.result.workoutLog.id, r[1].body.result.workoutLog.id);
});
test('PWA and shortcut operations preserve bilateral values and effort conversion', async () => {
    const r = await call(body({ source: 'shortcut', sets: [{ weight: 30, reps: 10, weightRight: 35, repsRight: 8, rir: 2 }] }));
    assert.equal(r.status, 201); const set = r.body.result.workoutLog.sets[0];
    assert.equal(set.weightRight, 35); assert.equal(set.repsRight, 8); assert.equal(set.rpe, 8);
    assert.equal((await call({ ...body(), operationId: r.body.operation.operationId, source: 'shortcut', sets: [{ weight: 30, reps: 10, weightRight: 35, repsRight: 8, rir: 2 }] })).status, 200);
});
test('unilateral PR keeps the original date and preserved Epley formula without replay writes', async () => {
    const op = body({ performedAt: '2026-10-17T05:59:59.123Z', sets: [{ weight: 150, reps: 10, weightRight: 180, repsRight: 8, rir: 2 }] });
    const created = await call(op); assert.equal(created.status, 201); assert.equal(created.body.result.workoutLog.exercise.isUnilateral, true);
    const records = await db.personalRecord.findMany({ where: { userId: 'A' } }); assert.equal(records.length, 1);
    assert.equal(records[0].weight, 180); assert.equal(records[0].reps, 8);
    assert.equal(records[0].estimated1RM, 180 * (1 + 8 / 30)); assert.equal(records[0].date.toISOString(), op.performedAt);
    assert.equal((await call(op)).status, 200); assert.deepEqual(await db.personalRecord.findMany({ where: { userId: 'A' } }), records);
});
test('append requires explicit session and version; repeated shortcut set is appended once', async () => {
    const op = body({ kind: 'workout.appendSet', source: 'shortcut', exerciseId: undefined, logId, expectedVersion: version });
    const r = await call(op); assert.equal(r.status, 201); version = r.body.result.sessionVersion;
    assert.equal(r.body.result.workoutLog.sets.length, 2);
    assert.equal((await call(op)).status, 200); assert.equal((await db.setLog.findMany({ where: { workoutLogId: logId } })).length, 2);
});
test('a versioned session read is owned and supports conditional edits of a legacy session', async () => {
    const made = await call({ exerciseId: 'A-Exercise', sets: [{ weight: 10, reps: 5, rpe: 8 }] }, { route: '/api/workouts/log' });
    const route = `/api/v1/workout-sessions/${made.body.workoutLog.id}`;
    const read = await call(undefined, { method: 'GET', route }); assert.equal(read.status, 200);
    assert.equal((await call(undefined, { method: 'GET', route, user: 'B' })).status, 404);
    const edited = await call(body({ kind: 'workout.replaceSets', exerciseId: undefined, logId: made.body.workoutLog.id,
        expectedVersion: read.body.sessionVersion, sets: [{ weight: 15, reps: 5, rir: 2 }] }));
    assert.equal(edited.status, 200); assert.equal(edited.body.result.workoutLog.date, made.body.workoutLog.date);
});
test('concurrent editing and appending cannot discard the winning series silently', async () => {
    const edit = body({ kind: 'workout.replaceSets', exerciseId: undefined, logId, expectedVersion: version });
    const append = { ...edit, operationId: randomUUID(), kind: 'workout.appendSet' };
    const r = await Promise.all([call(edit), call(append)]); assert.equal(r.filter(x => [200, 201].includes(x.status)).length, 1);
    assert.equal(r.filter(x => x.status === 409).length, 1);
    const conflict = r.find(x => x.status === 409); assert.equal(conflict.body.code, 'SESSION_VERSION_CONFLICT');
});
test('legacy unconditional update/delete are blocked only for protocol-managed sessions', async () => {
    for (const method of ['PUT', 'DELETE']) {
        const r = await call(method === 'PUT' ? { sets: [{ weight: 1, reps: 1, rpe: 8 }] } : undefined, { method, route: `/api/workouts/${logId}` });
        assert.equal(r.status, 409); assert.equal(r.body.code, 'WORKOUT_VERSION_REQUIRED');
    }
    const r = await call({ exerciseId: 'A-Exercise', sets: [{ weight: 10, reps: 5, rpe: 8 }] }, { route: '/api/workouts/log' });
    assert.equal(r.status, 201);
    assert.equal((await call({ sets: [{ weight: 11, reps: 5, rpe: 8 }] }, { method: 'PUT', route: `/api/workouts/${r.body.workoutLog.id}` })).status, 200);
});
test('legacy replacement racing a first versioned append either conflicts or runs before it', async () => {
    const made = await call({ exerciseId: 'A-Exercise', sets: [{ weight: 10, reps: 5, rpe: 8 }] }, { route: '/api/workouts/log' });
    const id = made.body.workoutLog.id;
    const read = await call(undefined, { method: 'GET', route: `/api/v1/workout-sessions/${id}` });
    const op = body({ kind: 'workout.appendSet', exerciseId: undefined, logId: id, expectedVersion: read.body.sessionVersion });
    const results = await Promise.all([call(op), call({ sets: [{ weight: 2, reps: 5, rpe: 8 }] }, { method: 'PUT', route: `/api/workouts/${id}` })]);
    assert.equal(results.filter(r => [200, 201].includes(r.status)).length, 1);
    assert.equal(results.filter(r => r.status === 409).length, 1);
});
test('rest operations retain original instant and replay only their own receipt', async () => {
    const op = body({ kind: 'rest.create', exerciseId: undefined, sets: undefined, note: 'Sintético' });
    const r = await call(op); assert.equal(r.status, 201); assert.equal(r.body.result.restLog.date, op.performedAt);
    assert.equal((await call(op)).status, 200);
});
test('receipt insertion failure rolls back workout, series and derived PR completely', async () => {
    const old = await counts(), prs = await db.personalRecord.findMany();
    await failure('nexlift_operations."IdempotencyRecord"', 'INSERT', async () => {
        const r = await call(body()); assert.equal(r.status, 500); assert.equal(r.body.retryable, false);
    });
    assert.deepEqual(await counts(), old); assert.deepEqual(await db.personalRecord.findMany(), prs);
});
test('PR failure rolls back training and receipt, then retry can commit', async () => {
    const op = body(), old = await counts();
    await failure('public."PersonalRecord"', 'INSERT', async () => assert.equal((await call(op)).status, 500));
    assert.deepEqual(await counts(), old); assert.equal((await receipt(op.operationId)).status, 404);
    assert.equal((await call(op)).status, 201);
});
test('an actual PostgreSQL serialization abort is retried atomically', async () => {
    await db.$executeRawUnsafe('CREATE SEQUENCE public.phase31_attempt');
    await db.$executeRawUnsafe('GRANT USAGE,SELECT ON SEQUENCE public.phase31_attempt TO nexlift_ops_http');
    await db.$executeRawUnsafe(`CREATE FUNCTION public.phase31_retry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('public.phase31_attempt')=1 THEN RAISE EXCEPTION 'retry' USING ERRCODE='40001'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER phase31_retry BEFORE INSERT ON public."WorkoutLog" FOR EACH ROW EXECUTE FUNCTION public.phase31_retry()');
    try { assert.equal((await call(body())).status, 201); assert.equal(Number((await db.$queryRawUnsafe('SELECT last_value FROM public.phase31_attempt'))[0].last_value), 2); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER phase31_retry ON public."WorkoutLog"'); await db.$executeRawUnsafe('DROP FUNCTION public.phase31_retry()'); await db.$executeRawUnsafe('DROP SEQUENCE public.phase31_attempt'); }
});
test('exhausted real serialization aborts return a recoverable response and no partial receipt', async () => {
    const op = body(), old = await counts();
    await failure('public."WorkoutLog"', 'INSERT', async () => {
        const r = await call(op); assert.equal(r.status, 503); assert.equal(r.body.retryable, true);
        assert.equal(r.body.outcome, 'not_committed');
    }, '40001');
    assert.deepEqual(await counts(), old); assert.equal((await call(op)).status, 201);
});
test('commit acknowledgement loss is reconciled from a real committed transaction', async () => {
    const op = body(), old = await counts(); let committed = false;
    const uncertain = new Proxy(db, { get(target, key) {
        if (key !== '$transaction') return target[key];
        return async (...args) => {
            const result = await target.$transaction(...args); committed = true;
            // Only acknowledgement is injected: all writes/COMMIT above are real.
            if (result) throw Object.assign(new Error('synthetic lost acknowledgement'), { code: 'P1017' });
        };
    } });
    await assert.rejects(applyOperation(uncertain, 'A', op), e => e.status === 503 && e.outcome === 'unknown');
    assert.equal(committed, true); assert.deepEqual(await counts(), { logs: old.logs + 1, sets: old.sets + 1, receipts: old.receipts + 1 });
    assert.equal((await call(op)).status, 200);
});
test('a lost HTTP response is reconciled by ID without duplicating committed work', async () => {
    lost = body();
    await new Promise((resolve, reject) => {
        const req = http.request(base + '/api/v1/workout-operations', { method: 'POST', headers: { Authorization: `Bearer ${auth('A')}`, 'Content-Type': 'application/json' } }, res => { res.destroy(); resolve(); });
        req.on('error', reject); req.end(JSON.stringify(lost));
    });
    const old = await counts(); const r = await call(lost); assert.equal(r.status, 200); assert.deepEqual(await counts(), old);
});
test('real PostgreSQL outage returns 503 rather than 401, then recovers safely', async () => {
    await db.$disconnect(); await upgrade.$disconnect();
    runPg('pg_ctl', ['-D', path.join(root, 'data'), '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    try { assert.equal((await call(lost)).status, 503); }
    finally {
        assert.ok(runPg('pg_controldata', ['-D', path.join(root, 'data')]).includes(process.env.NEXLIFT_OPS_TEST_SYSTEM_ID));
        runPg('pg_ctl', ['-D', path.join(root, 'data'), '-l', path.join(root, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
    }
    let recovered;
    // Existing native pool connections have been terminated. Only retry the
    // same durable operation while Prisma replaces those stale connections.
    for (let attempt = 0; attempt < 25; attempt++) {
        recovered = await call(lost);
        if (recovered.status !== 503) break;
        await delay(500);
    }
    assert.equal(recovered.status, 200, JSON.stringify({ response: recovered.body, diagnostics }));
});
test('deletion has a durable tombstone and its retry does not recreate the session', async () => {
    const create = body(), made = await call(create), log = made.body.result.workoutLog;
    const op = body({ kind: 'workout.delete', exerciseId: undefined, sets: undefined, logId: log.id, expectedVersion: made.body.result.sessionVersion });
    const r = await call(op); assert.equal(r.status, 200); assert.equal(r.body.result.deleted, true);
    assert.equal(await db.workoutLog.findUnique({ where: { id: log.id } }), null);
    assert.equal((await call(op)).status, 200);
    const replay = await call(create); assert.equal(replay.status, 200); assert.equal(replay.body.result.workoutLog.id, log.id);
    assert.equal(await db.workoutLog.findUnique({ where: { id: log.id } }), null);
});
test('real unique/FK/check constraints reject malformed or duplicate durable receipts', async () => {
    const [row] = await db.$queryRawUnsafe('SELECT * FROM nexlift_operations."IdempotencyRecord" LIMIT 1');
    await assert.rejects(db.$executeRawUnsafe('INSERT INTO nexlift_operations."IdempotencyRecord" SELECT * FROM nexlift_operations."IdempotencyRecord" LIMIT 1'), e => e.meta?.code === '23505');
    await assert.rejects(db.$executeRawUnsafe('UPDATE nexlift_operations."IdempotencyRecord" SET "userId"=$1 WHERE "userId"=$2 AND "operationId"=$3::uuid', 'nonexistent', row.userId, row.operationId), e => e.meta?.code === '23503');
    await assert.rejects(db.$executeRawUnsafe('UPDATE nexlift_operations."IdempotencyRecord" SET "requestHash"=$1 WHERE "userId"=$2 AND "operationId"=$3::uuid', 'invalid', row.userId, row.operationId), e => e.meta?.code === '23514');
});
test('HTTP database role cannot mutate/delete receipts, run DDL or rewrite migration metadata', async () => {
    const app = new PrismaClient({ datasources: { db: { url: `postgresql://nexlift_ops_http@127.0.0.1:${port}/nexlift_ops_test_empty` } } });
    try {
        for (const sql of ['DELETE FROM nexlift_operations."IdempotencyRecord"', 'UPDATE nexlift_operations."IdempotencyRecord" SET state=state',
            'ALTER TABLE nexlift_operations."IdempotencyRecord" ADD COLUMN forbidden TEXT', 'UPDATE public._prisma_migrations SET checksum=checksum']) {
            await assert.rejects(app.$executeRawUnsafe(sql), e => ['42501'].includes(e.meta?.code));
        }
    } finally { await app.$disconnect(); }
});
test('public schema remains identical; repeated migration preserves all receipts', async () => {
    const args = ['-h', '127.0.0.1', '-p', port, '-U', 'nexlift_ops_test', '-d', 'nexlift_ops_test_empty'];
    assert.deepEqual(compareCatalog(loadDeclared().catalog, businessCatalog(inspectSql('catalog.sql', { args })[0])), []);
    const old = await counts(); assert.equal(migrate('empty').status, 0); assert.deepEqual(await counts(), old);
});
test('unchanged full PostgreSQL recovery preserves durable receipts and original archive', async () => {
    const directory = path.join(root, 'full-backup'), bin = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : process.env.NEXLIFT_TEST_PG_BIN;
    await dumpSystemPostgres({ prisma: db, url: url('empty'), directory, bin, acknowledgeSensitive: true });
    const original = createHash('sha256').update(await readFile(path.join(directory, 'system.dump'))).digest('hex');
    const restored = new PrismaClient({ datasources: { db: { url: url('restore') } } });
    try {
        await restoreSystemPostgres({ prisma: restored, url: url('restore'), directory, bin, acknowledgeSensitive: true });
        assert.deepEqual(await restored.$queryRawUnsafe('SELECT * FROM nexlift_operations."IdempotencyRecord" ORDER BY "userId","operationId"'),
            await db.$queryRawUnsafe('SELECT * FROM nexlift_operations."IdempotencyRecord" ORDER BY "userId","operationId"'));
        assert.equal((await applyOperation(restored, 'A', first)).status, 200);
    } finally { await restored.$disconnect(); }
    assert.equal(createHash('sha256').update(await readFile(path.join(directory, 'system.dump'))).digest('hex'), original);
});
test('portable sanitized recovery remains unchanged and cannot impersonate an operation journal', async () => {
    const directory = path.join(root, 'safe-backup'), bin = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : process.env.NEXLIFT_TEST_PG_BIN;
    await dumpPostgres({ prisma: db, url: url('empty'), directory, bin });
    const restored = new PrismaClient({ datasources: { db: { url: url('sanitized') } } });
    try {
        await restorePostgres({ prisma: restored, url: url('sanitized'), directory, bin });
        assert.equal(await restored.workoutLog.count(), await db.workoutLog.count());
        await assert.rejects(applyOperation(restored, 'A', first), e => e.code === 'OPERATIONS_NOT_READY' && e.status === 503);
    } finally { await restored.$disconnect(); }
});
test('HTTP operation submission and lookup fail closed if journal storage is unavailable', async () => {
    const old = await counts();
    await db.$executeRawUnsafe('ALTER SCHEMA nexlift_operations RENAME TO phase31_unavailable');
    try {
        for (const result of [await call(body()), await receipt(first.operationId)]) {
            assert.equal(result.status, 503); assert.equal(result.body.code, 'OPERATIONS_NOT_READY');
        }
    } finally { await db.$executeRawUnsafe('ALTER SCHEMA phase31_unavailable RENAME TO nexlift_operations'); }
    assert.deepEqual(await counts(), old);
});
test('invalid JSON, unauthenticated, invalid data, missing receipt and missing ownership have distinct statuses', async () => {
    assert.equal((await call(body(), { user: 'invalid' })).status, 401);
    assert.equal((await call({ ...body(), userId: 'B' })).status, 422);
    assert.equal((await receipt(randomUUID())).status, 404);
    assert.equal((await call(body({ exerciseId: 'B-Exercise' }))).status, 404);
    const r = await fetch(base + '/api/v1/workout-operations', { method: 'POST', headers: { Authorization: `Bearer ${auth('A')}`, 'Content-Type': 'application/json' }, body: '{' }); assert.equal(r.status, 400);
});
test('writes and receipts remain relationally consistent after failures and concurrency', async () => {
    const orphan = await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM nexlift_operations."IdempotencyRecord" r LEFT JOIN public."User" u ON u.id=r."userId" WHERE u.id IS NULL');
    assert.equal(orphan[0].n, 0);
    await writeFile(path.join(root, 'evidence.json'), JSON.stringify({ source: 'SYNTHETIC_ONLY_NOT_PRODUCTION', counts: await counts(),
        realPostgres: true, realNodeRestart: true, realDatabaseOutage: true, productionTouched: false, migrationClassification: 'PROVISIONAL' }, null, 2));
});
