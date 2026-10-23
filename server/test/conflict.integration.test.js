import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { serverDir, runPg } from '../audit/postgresql/audit-tools.mjs';
import { seedBackupFixture } from './fixtures/backup-fixture.js';
import { runConflictBrowser } from './fixtures/conflict-browser.mjs';
import { randomUUID } from 'node:crypto';

const root = process.env.NEXLIFT_OPS_TEST_ROOT, port = process.env.NEXLIFT_OPS_TEST_PORT;
if (!process.env.NEXLIFT_SYNC_TEST || path.dirname(await realpath(root)) !== await realpath(tmpdir()) || !path.basename(root).startsWith('nexlift-conflict-tests-')) throw new Error('Disposable runner required');
const pid = (await readFile(path.join(root, 'data/postmaster.pid'), 'utf8')).split(/\r?\n/);
assert.equal(pid[3], port); assert.equal(await realpath(pid[1]), await realpath(path.join(root, 'data')));
const url = name => `postgresql://nexlift_ops_test@127.0.0.1:${port}/nexlift_ops_test_${name}`;
const db = new PrismaClient({ datasources: { db: { url: url('empty') } } });
let child, base;
let browserEvidence;
const token = user => jwt.sign({ userId: user, tokenVersion: 0 }, 'synthetic-sync-jwt');
const counts = async () => ({ logs: await db.workoutLog.count(), sets: await db.setLog.count(), rest: await db.restLog.count(),
    receipts: (await db.$queryRaw`SELECT count(*)::int AS n FROM nexlift_operations."IdempotencyRecord"`)[0].n });
async function start(name = 'empty') {
    child = spawn(process.execPath, ['test/fixtures/conflict-http.mjs'], { cwd: serverDir, windowsHide: true,
        env: { ...process.env, NEXLIFT_OPS_TEST_URL: url(name), NEXLIFT_CONFLICT_HTTP_PORT: base ? new URL(base).port : '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const errors = []; child.stderr.on('data', chunk => errors.push(chunk));
    const [message] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(Buffer.concat(errors).toString()); })]);
    base = `http://127.0.0.1:${message.port}/api`;
}
async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.send('stop'); await done; } }
async function fault(value) { const changed = once(child, 'message'); child.send({ fault: value }); assert.equal((await changed)[0].fault, value); }
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
test('resoluciones deshabilitadas por defecto no escriben y no anuncian capacidades', async () => {
    const { applyOperation, getOperationCapabilities } = await import('../src/services/workoutOperations.js');
    const before = await counts();
    await assert.rejects(() => applyOperation(db, 'A', { operationId: '00000000-0000-4000-8000-000000000010', kind: 'workout.replaceSets', source: 'pwa', performedAt: '2026-10-01T18:00:00.000Z', logId: 'missing', expectedVersion: 'a'.repeat(64), changes: { session: { notes: 'disabled' } } }), error => error.code === 'RESOLUTIONS_NOT_READY');
    assert.equal((await getOperationCapabilities(db, 'A', true)).resolutions, undefined); assert.deepEqual(await counts(), before);
});
test('base sin migración provisional rechaza capacidades y escrituras sin crear tablas', async () => {
    const { getOperationCapabilities, applyOperation } = await import('../src/services/workoutOperations.js');
    const missing = new PrismaClient({ datasources: { db: { url: url('missing') } } });
    try {
        await assert.rejects(() => getOperationCapabilities(missing, 'A', true, true), e => e.code === 'OPERATIONS_NOT_READY');
        await assert.rejects(() => applyOperation(missing, 'A', { operationId: '00000000-0000-4000-8000-000000000011', kind: 'workout.replaceSets', source: 'pwa', performedAt: '2026-10-01T18:00:00.000Z', logId: 'missing', expectedVersion: 'a'.repeat(64), changes: { session: { notes: 'missing' } } }, { resolutionEnabled: true }), e => e.code === 'OPERATIONS_NOT_READY');
        assert.equal((await missing.$queryRaw`SELECT to_regclass('nexlift_operations."IdempotencyRecord"')::text AS name`)[0].name, null);
    } finally { await missing.$disconnect(); }
});
test('PR se mantiene transaccional en aumentos, descensos, repeticiones, lados, eliminación y empates', async t => {
    const { applyOperation } = await import('../src/services/workoutOperations.js');
    const op = (kind, extra) => ({ operationId: randomUUID(), source: 'pwa', performedAt: '2026-10-01T18:00:00.000Z', kind, ...extra });
    const send = body => applyOperation(db, 'B', body, { resolutionEnabled: true });
    let snapshot = (await send(op('workout.create', { exerciseId: 'B-Exercise', notes: null, sets: [{ weight: 100, reps: 5, rpe: 8, completed: true }, { weight: 80, reps: 5, rpe: 8, completed: true }] }))).body.result;
    const [a, b] = snapshot.workoutLog.sets;
    const patch = async changes => { snapshot = (await send(op('workout.replaceSets', { logId: snapshot.workoutLog.id, expectedVersion: snapshot.sessionVersion, changes }))).body.result; };
    const pr = () => db.personalRecord.findFirst({ where: { userId: 'B' } });
    await t.test('aumentar peso actualiza PR en la misma transacción', async () => { await patch({ updates: [{ id: a.id, fields: { weight: 150 } }] }); assert.equal((await pr()).weight, 150); });
    await t.test('disminuir peso permite que gane otra serie', async () => { await patch({ updates: [{ id: a.id, fields: { weight: 50 } }] }); assert.equal((await pr()).weight, 80); });
    await t.test('cambiar repeticiones recalcula el récord', async () => { await patch({ updates: [{ id: a.id, fields: { weight: 70, reps: 20 } }] }); assert.equal((await pr()).reps, 20); assert.equal((await pr()).weight, 70); });
    await t.test('lado derecho puede sostener el PR unilateral', async () => { await patch({ updates: [{ id: b.id, fields: { weightRight: 200, repsRight: 5 } }] }); assert.equal((await pr()).weight, 200); });
    await t.test('eliminar serie ganadora restaura el PR anterior válido', async () => { await patch({ removals: [b.id] }); assert.equal((await pr()).weight, 70); });
    await t.test('un empate conserva fecha de sesión más antigua', async () => {
        await send({ ...op('workout.create', { exerciseId: 'B-Exercise', sets: [{ weight: 70, reps: 20, rpe: 8, completed: true }], notes: null }), performedAt: '2026-10-02T18:00:00.000Z' });
        assert.equal((await pr()).date.toISOString(), '2026-10-01T18:00:00.000Z');
    });
    await t.test('eliminar la sesión ganadora conserva la empatada', async () => {
        await send(op('workout.delete', { logId: snapshot.workoutLog.id, expectedVersion: snapshot.sessionVersion }));
        assert.equal((await pr()).date.toISOString(), '2026-10-02T18:00:00.000Z');
    });
});
test('resolución en Edge real y PostgreSQL desechable', {timeout:180000}, async t=>{
    browserEvidence=await runConflictBrowser({root,backend:base.replace(/\/api$/,''),tokenA:token('A'),tokenB:token('B'),counts,t,db,fault,
        restart:async()=>{const address=base;await stop();await start();assert.equal(base,address);}});
    const invalid=await db.$queryRaw`SELECT count(*)::int AS n FROM public."SetLog" s WHERE NOT EXISTS(SELECT 1 FROM public."WorkoutLog" w WHERE w.id=s."workoutLogId")`;
    assert.equal(invalid[0].n,0);
    const {recalcPRForExercise}=await import('../src/services/personalRecords.js');
    const prs=await db.personalRecord.findMany({where:{userId:'A'},orderBy:{exerciseName:'asc'}});
    for(const name of new Set(prs.map(p=>p.exerciseName))) await db.$transaction(tx=>recalcPRForExercise(tx,name,'A'));
    const rebuilt=await db.personalRecord.findMany({where:{userId:'A'},orderBy:{exerciseName:'asc'}});
    const values=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='id')));
    assert.deepEqual(values(rebuilt),values(prs));
    await writeFile(path.join(root,'conflict-evidence.json'),JSON.stringify({createdAt:new Date().toISOString(),source:'SYNTHETIC_ONLY_NOT_PRODUCTION',productionTouched:false,realPostgres:true,browserEvidence,counts:await counts(),prRebuildMatched:true},null,2));
});
