import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fork } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { root, port, env, target, migrations, baseline, operations, history, seed, rows, catalog, sql, pg, close, legacyClient, tables } from './fixtures/phase6-environment.js';
import { exportBackup } from '../src/services/backupExport.js';
import { restoreBackup } from '../src/services/backupRestore.js';
import { readBackup } from '../src/services/backupLegacy.js';
import { sealBackup, checksum, ENTITY_NAMES, USER_FIELDS, validateBackup } from '../src/services/backupFormat.js';
import { dumpPostgres, restorePostgres } from '../src/services/postgresBackup.js';
import { dumpSystemPostgres, restoreSystemPostgres } from '../src/services/postgresSystemBackup.js';
import { businessCatalog, assertSchemaReady } from '../deploy/releaseGate.js';
import { applyOperation, getOperationSession, getOperation } from '../src/services/workoutOperations.js';
import { parseOperation, requestHash, sessionVersion } from '../src/services/operationContract.js';
import { selectHistoricalPersonalRecord } from '../src/generated/training.cjs';
import { recalcPRForExercise } from '../src/services/personalRecords.js';
import { withWorkoutTransaction } from '../src/services/workoutTransaction.js';
import { hasRetainedExerciseData } from '../src/services/historyPersistence.js';

let upgraded, empty, runtime, oldRows, migratedRows, oldPortable, oldVersion, beforeReceipts, child, baseURL;
const chain = [baseline, operations, history], evidence = { productionTouched: false, baseline: 'PROVISIONAL', trials: [] };
const bodySet = (weight = 80, reps = 10, more = {}) => ({ weight, reps, rpe: 8, completed: true, ...more });
const operation = (extra = {}) => ({ operationId: randomUUID(), kind: 'workout.create', source: 'pwa',
    performedAt: '2026-10-18T05:59:59.999Z', exerciseId: 'ea', sets: [bodySet()], ...extra });
const credentials = t => ({ prisma: t.raw, url: t.url, bin: process.env.NEXLIFT_TEST_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin', acknowledgeSensitive: true });
async function request(route, body, method = 'GET', owner = 'A') {
    const token = jwt.sign({ userId: owner, tokenVersion: 0 }, 'synthetic-phase6-jwt', { expiresIn: '1h' });
    const response = await fetch(baseURL + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}
const counts = async () => ({ logs: await runtime.raw.workoutLog.count(), sets: await runtime.raw.setLog.count(), prs: await runtime.raw.personalRecord.count() });
async function failure(table, event, action) {
    assert(['SetLog', 'PersonalRecord'].includes(table)); assert(['INSERT', 'DELETE'].includes(event));
    sql(runtime, `CREATE FUNCTION phase6_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END $$;
        CREATE TRIGGER phase6_failure BEFORE ${event} ON "${table}" FOR EACH ROW EXECUTE FUNCTION phase6_failure();`);
    try { return await action(); }
    finally { sql(runtime, `DROP TRIGGER phase6_failure ON "${table}"; DROP FUNCTION phase6_failure();`); }
}
function legacyPortable(data) {
    const ownedRoutines = new Set(data.Routine.filter(r => r.userId === 'A').map(r => r.id));
    const days = new Set(data.RoutineDay.filter(d => ownedRoutines.has(d.routineId)).map(d => d.id));
    const exercises = new Set(data.Exercise.filter(e => days.has(e.routineDayId)).map(e => e.id));
    const logs = new Set(data.WorkoutLog.filter(w => exercises.has(w.exerciseId)).map(w => w.id));
    const cardio = new Set(data.CardioSession.filter(c => c.userId === 'A').map(c => c.id));
    const out = Object.fromEntries(ENTITY_NAMES.map(name => [name, data[name].filter(row => name === 'User' ? row.id === 'A'
        : ['RoutineDay', 'RoutineBlock'].includes(name) ? ownedRoutines.has(row.routineId)
            : name === 'Exercise' ? exercises.has(row.id) : name === 'WorkoutLog' ? logs.has(row.id)
                : name === 'SetLog' ? logs.has(row.workoutLogId) : name === 'CardioSegment' ? cardio.has(row.sessionId) : row.userId === 'A')]));
    out.User = out.User.map(u => Object.fromEntries(USER_FIELDS.map(f => [f, u[f]])));
    const b = sealBackup(out); b.backupSchemaVersion = 4; delete b.integrity;
    b.integrity = { algorithm: 'sha256', sha256: checksum(b) }; return b;
}
async function journal(t) { return JSON.parse(JSON.stringify(await t.raw.$queryRaw`SELECT * FROM nexlift_operations."IdempotencyRecord" ORDER BY "userId","operationId"`)); }
before(async () => {
    upgraded = await target('a'); assert.equal((await migrations(upgraded, [baseline, operations])).status, 0);
    seed(upgraded);
    sql(upgraded, `UPDATE "Exercise" SET name='Already renamed' WHERE id='ea2';`);
    // A durable pre-upgrade acknowledgement with old JSON. No new fields are
    // added to, re-hashed into, or inferred from existing receipts.
    const input = operation({ operationId: '12345678-1234-4000-8000-123456789abc' });
    const parsed = parseOperation(input), fingerprint = requestHash(parsed);
    await upgraded.raw.$executeRaw`INSERT INTO nexlift_operations."IdempotencyRecord"
        ("userId","operationId",kind,"requestHash","performedAt","performedDay","resourceId","responseStatus",response)
        VALUES ('A',${input.operationId}::uuid,'workout.create',${fingerprint},${new Date(parsed.performedAt)},${parsed.performedDay}::date,'wa',201,
        ${JSON.stringify({ protocolVersion: 1, operation: { operationId: input.operationId, kind: input.kind, state: 'confirmed' }, result: { workoutLog: { id: 'wa' }, sessionVersion: '0'.repeat(64) } })}::jsonb)`;
    oldRows = await rows(upgraded, true);
    const previous = legacyClient(upgraded), oldExportRows = {};
    for (const name of tables) oldExportRows[name] = JSON.parse(JSON.stringify(await previous[name[0].toLowerCase() + name.slice(1)].findMany({ orderBy: { id: 'asc' } })));
    oldPortable = legacyPortable(oldExportRows); validateBackup(oldPortable);
    const [oldLog] = await upgraded.raw.$queryRaw`SELECT * FROM "WorkoutLog" WHERE id='wa'`;
    const oldSets = await upgraded.raw.$queryRaw`SELECT * FROM "SetLog" WHERE "workoutLogId"='wa'`;
    oldVersion = sessionVersion({ ...oldLog, sets: oldSets }); beforeReceipts = await journal(upgraded);
    pg('pg_dump', ['--format=custom', ...upgraded.args, '--file', path.join(root, 'before.dump')]);
    assert.equal((await migrations(upgraded, [history])).status, 0, 'Real incremental migrate deploy must succeed');
    migratedRows = await rows(upgraded); empty = await target('b'); assert.equal((await migrations(empty, chain)).status, 0);
    const declaration = { environment: 'verified fresh PostgreSQL only; production baseline PROVISIONAL', catalog: businessCatalog(await catalog(empty)) };
    const output = new URL('../audit/database/', import.meta.url); await mkdir(output, { recursive: true });
    await writeFile(new URL('declared-catalog.json', output), JSON.stringify(declaration, null, 2) + '\n');
    runtime = await target('c'); assert.equal((await migrations(runtime, chain)).status, 0);
    child = fork(new URL('./fixtures/phase6-http.mjs', import.meta.url), [], { cwd: path.resolve(new URL('../', import.meta.url).pathname.slice(process.platform === 'win32' ? 1 : 0)),
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...env, DATABASE_URL: runtime.url,
            NEXLIFT_PHASE6_PORT: port, NEXLIFT_INFRA_REHEARSAL: 'true', JWT_SECRET: 'synthetic-phase6-jwt', PORT: '0',
            NEXLIFT_OFFLINE_SYNC_ENABLED: 'true', NEXLIFT_CONFLICT_RESOLUTION_ENABLED: 'true' } });
    let outputText = ''; child.stdout.on('data', b => { outputText += b; }); child.stderr.on('data', b => { outputText += b; });
    const address = await new Promise((resolve, reject) => { child.once('message', resolve); child.once('exit', code => reject(new Error(`HTTP exited ${code}: ${outputText}`))); });
    baseURL = `http://127.0.0.1:${address.port}`;
    evidence.postgres = runtime.version; evidence.root = root;
});
beforeEach(async () => { sql(runtime, 'TRUNCATE "User" CASCADE;'); seed(runtime); });
after(async () => {
    if (child?.connected) { const exited = new Promise(resolve => child.once('exit', resolve)); child.send('stop'); await exited; }
    await close(); await writeFile(path.join(root, 'phase6-evidence.json'), JSON.stringify(evidence, null, 2));
    const out = new URL('../audit/database/phase6-evidence.json', import.meta.url); await writeFile(out, JSON.stringify(evidence, null, 2) + '\n');
});

test('6 migration chain is real PostgreSQL18.4/Prisma6.19.3 with all three exact migration checksums', async () => {
    assert.match(runtime.version, /PostgreSQL 18\.4/);
    const registered = await upgraded.raw.$queryRaw`SELECT migration_name,checksum,finished_at FROM _prisma_migrations ORDER BY migration_name`;
    assert.deepEqual(registered.map(r => r.migration_name), chain);
    const { digest } = await import('../src/services/migrationHistory.js');
    for (const r of registered) { assert(r.finished_at); assert.equal(r.checksum, digest(await readFile(new URL(`../prisma/migrations/${r.migration_name}/migration.sql`, import.meta.url)))); }
});
test('6 upgrade preserves all17 models, per-user counts, original IDs, dates and every legacy scalar', async () => {
    assert.deepEqual(await rows(upgraded, true), oldRows);
    assert.equal(Object.keys(oldRows).length, 17); assert.equal(migratedRows.WorkoutLog.length, 4); assert.equal(migratedRows.SetLog.length, 5);
});
test('6 backfill owns every session directly and never merges duplicate names or same timestamps', () => {
    assert.deepEqual(migratedRows.WorkoutLog.map(w => [w.id, w.userId]), [['wa', 'A'], ['wa2', 'A'], ['wb', 'B'], ['wu', 'A']]);
    assert.equal(migratedRows.WorkoutLog.find(w => w.id === 'wa2').exerciseId, 'ea2');
    assert.equal(migratedRows.WorkoutLog.find(w => w.id === 'wa').date, oldRows.WorkoutLog.find(w => w.id === 'wa').date);
});
test('6 legacy labels have explicit observed provenance and unknown muscle, unilateral and original plan', () => {
    for (const w of migratedRows.WorkoutLog) { assert.equal(w.snapshotSource, 'legacy-observed'); assert.equal(w.muscleGroupSnapshot, null);
        assert.equal(w.isUnilateralSnapshot, null); assert.equal(w.originRoutineId, null); assert.equal(w.originRoutineDayId, null); }
    assert.equal(migratedRows.WorkoutLog.find(w => w.id === 'wa2').exerciseNameSnapshot, 'Already renamed');
    assert.equal(migratedRows.PersonalRecord[0].sourceExerciseId, null);
});
test('6 empty reconstruction and populated upgrade have identical constraints, indexes, triggers and function definitions', async () => {
    assert.deepEqual(businessCatalog(await catalog(empty)), businessCatalog(await catalog(upgraded)));
    const cat = businessCatalog(await catalog(empty)); assert.equal(cat.tables.length, 17); assert.equal(cat.columns.length, 166); assert.equal(cat.foreignKeys.length, 21);
    evidence.catalog = { tables: cat.tables.length, columns: cat.columns.length, foreignKeys: cat.foreignKeys.length, indexes: cat.indexes.length, extraObjects: cat.extras.length };
});
test('6 repeated migrate deploy preserves all IDs, values, receipts and original sessionVersion', async () => {
    const before = await rows(upgraded); assert.equal((await migrations(upgraded, chain)).status, 0); assert.deepEqual(await rows(upgraded), before);
    assert.deepEqual(await journal(upgraded), beforeReceipts);
    assert.equal(sessionVersion(await upgraded.client.workoutLog.findUnique({ where: { id: 'wa' }, include: { sets: true } })), oldVersion);
});
test('6 SQL gate rejects an unmarked fresh database without adding or changing business columns', async () => {
    const t = await target('d', { marked: false }); assert.equal((await migrations(t, [baseline])).status, 0);
    const before = businessCatalog(await catalog(t)); assert.notEqual((await migrations(t, [history])).status, 0);
    assert.deepEqual(businessCatalog(await catalog(t)), before);
});
test('6 ambiguous unowned history aborts the incremental transaction and conserves all old data', async () => {
    const t = await target('e'); assert.equal((await migrations(t, [baseline, operations])).status, 0); seed(t);
    sql(t, `UPDATE "Routine" SET "userId"=NULL WHERE id='ra';`); const before = await rows(t, true);
    assert.notEqual((await migrations(t, [history])).status, 0); assert.deepEqual(await rows(t, true), before);
    assert.equal((await catalog(t)).columns.some(c => c.table === 'WorkoutLog' && c.name === 'exerciseNameSnapshot'), false);
});
test('6 interrupted migration rolls back DDL and DML, retains failed journal and never partially reinterprets history', async () => {
    const t = await target('f'); assert.equal((await migrations(t, chain)).status, 0); seed(t); const before = await rows(t);
    const name = '202610220002_synthetic_failure'; await mkdir(path.join(t.work, 'prisma/migrations', name));
    await writeFile(path.join(t.work, 'prisma/migrations', name, 'migration.sql'), `BEGIN; ALTER TABLE "WorkoutLog" ADD COLUMN interrupted TEXT; UPDATE "WorkoutLog" SET "snapshotSource"='made-up'; COMMIT;`);
    assert.notEqual((await migrations(t, [])).status, 0); assert.deepEqual(await rows(t), before);
    assert.equal((await catalog(t)).columns.some(c => c.name === 'interrupted'), false);
    const failed = await t.raw.$queryRaw`SELECT finished_at FROM _prisma_migrations WHERE migration_name=${name}`; assert.equal(failed[0].finished_at, null);
});
test('6 recovery from the pre-migration pg_dump restores all17 models and exact original acknowledgements', async () => {
    const t = await target('aa'); pg('pg_restore', ['--no-owner', '--no-acl', '--single-transaction', ...t.args, path.join(root, 'before.dump')]);
    assert.deepEqual(await rows(t, true), oldRows); assert.deepEqual(await journal(t), beforeReceipts);
    assert.equal((await migrations(t, chain)).status, 0); assert.deepEqual(await rows(t, true), oldRows);
    assert.equal(sessionVersion(await t.raw.workoutLog.findUnique({ where: { id: 'wa' }, include: { sets: true } })), oldVersion);
});
test('6 SQL routine deletion detaches and archives identities, preserving every session, set, PR and history visibility', async () => {
    const before = await counts(); await runtime.raw.routine.delete({ where: { id: 'ra' } }); assert.deepEqual(await counts(), before);
    const e = await runtime.raw.exercise.findUnique({ where: { id: 'ea' } }); assert.equal(e.routineDayId, null); assert.equal(e.userId, 'A'); assert(e.archivedAt);
    const visible = await runtime.client.workoutLog.findMany({ where: { exercise: { routineDay: { routine: { userId: 'A' } } } }, include: { exercise: true, sets: true } });
    assert.equal(visible.length, 3); assert.equal(visible.find(w => w.id === 'wa').exercise.name, 'Press');
});
test('6 SQL day deletion cannot cascade to sessions or sets', async () => {
    const before = await counts(); await runtime.raw.routineDay.delete({ where: { id: 'da' } }); assert.deepEqual(await counts(), before);
    assert.equal((await runtime.raw.exercise.findUnique({ where: { id: 'eu' } })).routineDayId, null);
});
test('6 SQL exercise deletion is restrictive when it supports recorded history', async () => {
    const before = await rows(runtime); await assert.rejects(runtime.raw.exercise.delete({ where: { id: 'ea' } })); assert.deepEqual(await rows(runtime), before);
});
test('6 suggestion-only exercise is retained by SQL and routine editing even without workouts', async () => {
    await runtime.raw.exercise.create({ data: { id: 'only', name: 'Suggestion only', routineDayId: 'da', targetSets: 2, targetReps: '8' } });
    await runtime.raw.suggestionLog.create({ data: { userId: 'A', exerciseId: 'only', suggestedWeight: 0, suggestedReps: 8, source: 'client' } });
    const queries = runtime.queryCount(); assert.equal(await hasRetainedExerciseData(runtime.raw, 'only'), true); assert.equal(runtime.queryCount() - queries, 1);
    await assert.rejects(runtime.raw.exercise.delete({ where: { id: 'only' } }));
    const result = await request('/api/routines/ra', { name: 'Empty', days: [] }, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.body));
    assert(await runtime.raw.exercise.findUnique({ where: { id: 'only' } })); assert.equal(await runtime.raw.suggestionLog.count({ where: { exerciseId: 'only' } }), 1);
});
test('6 actual Express routine editing preserves historical IDs, series and immutable source context', async () => {
    const before = await rows(runtime); const result = await request('/api/routines/ra', { name: 'Replanned', days: [] }, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.body));
    const after = await rows(runtime); assert.deepEqual(after.WorkoutLog, before.WorkoutLog); assert.deepEqual(after.SetLog, before.SetLog); assert.deepEqual(after.PersonalRecord, before.PersonalRecord);
});
test('6 actual Express routine deletion preserves training and remains visible to legacy history endpoint', async () => {
    const before = await counts(); const result = await request('/api/routines/ra', undefined, 'DELETE'); assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(await counts(), before); const history = await request('/api/workouts/history?exerciseId=ea'); assert.equal(history.status, 200); assert.equal(history.body[0].id, 'wa');
});
test('6 renaming through the actual routine editor preserves exercise ID and historical name', async () => {
    const ex = await runtime.raw.exercise.findMany({ where: { routineDayId: 'da' } });
    const result = await request('/api/routines/ra', { name: 'Plan A', days: [{ id: 'da', dayName: 'Lunes', exercises: ex.map(e => ({ ...e, name: e.id === 'ea' ? 'Renamed press' : e.name })) }] }, 'PUT');
    assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal((await runtime.raw.exercise.findUnique({ where: { id: 'ea' } })).name, 'renamed press');
    const logs = await request('/api/workouts/history?exerciseId=ea'); assert.equal(logs.body[0].exerciseId, 'ea'); assert.equal(logs.body[0].exercise.name, 'Press');
});
test('6 changing muscle and unilateral metadata never rewrites historical sides, snapshots, effort or order', async () => {
    const before = await rows(runtime); await runtime.raw.exercise.update({ where: { id: 'eu' }, data: { name: 'Bilateral now', muscleGroup: 'espalda', isUnilateral: false } });
    const after = await rows(runtime); assert.deepEqual(after.WorkoutLog, before.WorkoutLog); assert.deepEqual(after.SetLog, before.SetLog);
    const history = await request('/api/workouts/history?exerciseId=eu'); assert.equal(history.body[0].exercise.name, 'Personalizado unilateral'); assert.equal(history.body[0].exercise.isUnilateral, true);
});
test('6 archiving an identity preserves PR and permits old offline work to retain that exercise ID', async () => {
    const before = await counts(); await runtime.raw.exercise.update({ where: { id: 'ea' }, data: { routineDayId: null } }); assert.deepEqual(await counts(), before);
    const result = await applyOperation(runtime.client, 'A', operation()); assert.equal(result.status, 201); assert.equal(result.body.result.workoutLog.exerciseId, 'ea');
});
test('6 old SQL/Prisma writers omitting new columns receive owned immutable snapshots automatically', async () => {
    await legacyClient(runtime).workoutLog.create({ data: { id: 'old-writer', exerciseId: 'eu' } });
    const w = await runtime.raw.workoutLog.findUnique({ where: { id: 'old-writer' } }); assert.equal(w.userId, 'A'); assert.equal(w.isUnilateralSnapshot, true);
    assert.equal(w.snapshotSource, 'recorded'); assert.equal(w.originRoutineId, 'ra'); assert.equal(w.originRoutineDayId, 'da');
    assert(w.contextCapturedAt instanceof Date);
});
test('6 cross-account session associations are rejected before persistence', async () => {
    const before = await rows(runtime); await assert.rejects(runtime.raw.workoutLog.create({ data: { exerciseId: 'eb', userId: 'A' } }));
    assert.deepEqual(await rows(runtime), before); assert.equal((await request('/api/workouts/log', { exerciseId: 'eb', sets: [bodySet()] }, 'POST')).status, 404);
});
test('6 an exercise cannot be reparented into another users private routine day', async () => {
    const before = await rows(runtime); await assert.rejects(runtime.raw.exercise.update({ where: { id: 'ea' }, data: { routineDayId: 'db' } })); assert.deepEqual(await rows(runtime), before);
});
test('6 routine ownership cannot be transferred with its historical descendants', async () => {
    const before = await rows(runtime); await assert.rejects(runtime.raw.routine.update({ where: { id: 'ra' }, data: { userId: 'B' } })); assert.deepEqual(await rows(runtime), before);
});
test('6 day ownership cannot be transferred by moving the whole day', async () => {
    const before = await rows(runtime); await assert.rejects(runtime.raw.routineDay.update({ where: { id: 'da' }, data: { routineId: 'rb' } })); assert.deepEqual(await rows(runtime), before);
});
test('6 session owner, exercise ID and snapshots are immutable even under SQL writers', async () => {
    const before = await rows(runtime);
    for (const data of [{ userId: 'B' }, { exerciseId: 'ea2' }, { exerciseNameSnapshot: 'Fake history' }, { isUnilateralSnapshot: true }, { originRoutineId: 'rb' }])
        await assert.rejects(runtime.raw.workoutLog.update({ where: { id: 'wa' }, data }));
    await assert.rejects(runtime.raw.setLog.update({ where: { id: 'sa' }, data: { workoutLogId: 'wb' } }));
    assert.deepEqual(await rows(runtime), before);
});
test('6 suggestions, reminders and PR provenance reject exercises owned by another account', async () => {
    const before = await rows(runtime);
    await assert.rejects(runtime.raw.suggestionLog.update({ where: { id: 'suggestion' }, data: { exerciseId: 'eb' } }));
    await assert.rejects(runtime.raw.pendingReminder.update({ where: { id: 'reminder' }, data: { exerciseId: 'eb' } }));
    await assert.rejects(runtime.raw.personalRecord.update({ where: { id: 'pa' }, data: { sourceExerciseId: 'eb' } }));
    assert.deepEqual(await rows(runtime), before);
});
test('6 unauthorized HTTP workout deletion leaves both accounts unchanged', async () => {
    const before = await rows(runtime); assert.equal((await request('/api/workouts/wa', undefined, 'DELETE', 'B')).status, 404); assert.deepEqual(await rows(runtime), before);
});
test('6 intentional owned session deletion cascades only its sets and recomputes PR transactionally', async () => {
    assert.equal((await request('/api/workouts/wa', undefined, 'DELETE')).status, 200);
    assert.equal(await runtime.raw.workoutLog.count(), 3); assert.equal(await runtime.raw.setLog.count(), 3);
    assert.equal(await runtime.raw.setLog.count({ where: { workoutLogId: 'wa' } }), 0); assert.equal((await runtime.raw.personalRecord.findFirst({ where: { userId: 'A' } })).sourceExerciseId, 'ea2');
});
test('6 PR failure rolls back the entire workout edit with original stable set IDs', async () => {
    const before = await rows(runtime); await failure('PersonalRecord', 'INSERT', async () => {
        assert.equal((await request('/api/workouts/wa', { sets: [bodySet(120, 10)] }, 'PUT')).status, 500);
    }); assert.deepEqual(await rows(runtime), before);
});
test('6 strongest-side e1RM and nullable/zero effort retain Phase5 formulas and winning stable exercise provenance', async () => {
    const result = await request('/api/workouts/wu', { sets: [bodySet(90, 8, { weightRight: 100, repsRight: 8, rpe: 0 })] }, 'PUT'); assert.equal(result.status, 200);
    const pr = await runtime.raw.personalRecord.findFirst({ where: { exerciseName: 'personalizado unilateral', userId: 'A' } });
    assert.equal(pr.weight, 100); assert.equal(pr.reps, 8); assert.equal(pr.sourceExerciseId, 'eu'); assert.equal(result.body.workoutLog.sets[0].rpe, 0);
    assert(Math.abs(pr.estimated1RM - selectHistoricalPersonalRecord([result.body.workoutLog]).est1RM) < 1e-10);
});
test('6 renamed detached exercise remains editable and recomputes the original historical PR label', async () => {
    await runtime.raw.exercise.update({ where: { id: 'ea' }, data: { name: 'Different label', routineDayId: null } });
    const result = await request('/api/workouts/wa', { sets: [bodySet(110, 8)] }, 'PUT'); assert.equal(result.status, 200);
    assert.equal(result.body.workoutLog.exercise.name, 'Press'); const pr = await runtime.raw.personalRecord.findFirst({ where: { userId: 'A' } }); assert.equal(pr.exerciseName, 'press'); assert.equal(pr.sourceExerciseId, 'ea');
    const bulk = await request('/api/workouts/fix-weights', { exerciseName: 'Different label', oldWeight: 110, newWeight: 120 }, 'PUT');
    assert.equal(bulk.status, 200); assert.equal(bulk.body.setsUpdated, 1);
    assert.equal((await runtime.raw.personalRecord.findFirst({ where: { userId: 'A' } })).weight, 120);
});
test('6 PR reconstruction by stable exercise ID requires no surviving routine and retains exact ties', async () => {
    const before = await runtime.client.workoutLog.findMany({ where: { exerciseId: 'ea' }, include: { sets: true }, orderBy: { date: 'asc' } });
    await runtime.raw.routine.delete({ where: { id: 'ra' } });
    const after = await runtime.client.workoutLog.findMany({ where: { exerciseId: 'ea' }, include: { sets: true }, orderBy: { date: 'asc' } });
    assert.deepEqual(selectHistoricalPersonalRecord(after), selectHistoricalPersonalRecord(before));
    await withWorkoutTransaction(runtime.client, 'A', tx => recalcPRForExercise(tx, 'Press', 'A'));
    assert.equal((await runtime.raw.personalRecord.findFirst({ where: { userId: 'A' } })).date.toISOString(), '2020-01-01T12:00:00.123Z');
});
test('6 unchanged v1 offline payload replays the exact durable receipt after planning changes', async () => {
    const op = operation(), hash = requestHash(parseOperation(op)); const first = await applyOperation(runtime.client, 'A', op);
    await runtime.raw.routine.delete({ where: { id: 'ra' } }); const again = await applyOperation(runtime.client, 'A', op);
    assert.equal(again.status, 200); assert.equal(again.body.requestHash, hash); assert.deepEqual(again.body.result, first.body.result); assert.equal(again.body.replayed, true);
    assert.equal(await runtime.raw.workoutLog.count(), 5); assert.equal((await getOperation(runtime.client, 'A', op.operationId)).requestHash, hash);
});
test('6 simultaneous identical operations commit a single workout, PR result and acknowledgement', async () => {
    const op = operation(); const results = await Promise.all(Array.from({ length: 8 }, () => applyOperation(runtime.client, 'A', op)));
    assert.equal(await runtime.raw.workoutLog.count(), 5); assert.equal((await journal(runtime)).length, 1);
    assert.equal(new Set(results.map(r => r.body.result.workoutLog.id)).size, 1);
});
test('6 sessionVersion survives catalog edits and pending conflict resolution retains stable set IDs', async () => {
    const view = await getOperationSession(runtime.client, 'A', 'wa'); await runtime.raw.exercise.update({ where: { id: 'ea' }, data: { name: 'After pending conflict', muscleGroup: 'otro', isUnilateral: true } });
    assert.equal((await getOperationSession(runtime.client, 'A', 'wa')).sessionVersion, view.sessionVersion);
    const id = view.workoutLog.sets[0].id;
    const op = operation({ kind: 'workout.replaceSets', exerciseId: undefined, logId: 'wa', expectedVersion: view.sessionVersion, sets: undefined,
        changes: { updates: [{ id, fields: { weight: 100 } }] } });
    const result = await applyOperation(runtime.client, 'A', op, { resolutionEnabled: true }); assert.equal(result.status, 200);
    assert(result.body.result.workoutLog.sets.some(s => s.id === id && s.weight === 100));
});
test('6 stale versions and unauthorized conflict resolution cannot mutate training or receipts', async () => {
    const before = await rows(runtime), op = operation({ kind: 'workout.delete', exerciseId: undefined, sets: undefined, logId: 'wa', expectedVersion: '0'.repeat(64) });
    await assert.rejects(applyOperation(runtime.client, 'A', op), e => e.code === 'SESSION_VERSION_CONFLICT');
    await assert.rejects(applyOperation(runtime.client, 'B', op)); assert.deepEqual(await rows(runtime), before); assert.equal((await journal(runtime)).length, 0);
});
test('6 portable v5 includes detached history, immutable context and photo references while excluding credentials and receipt journal', async () => {
    await runtime.raw.routine.delete({ where: { id: 'ra' } }); const b = await exportBackup(runtime.raw, 'A', { pageSize: 1 }); assert.equal(b.backupSchemaVersion, 5); validateBackup(b);
    assert.equal(b.data.WorkoutLog.length, 3); assert.equal(b.data.Exercise.length, 3); assert.equal(b.data.BodyLog[0].photoUrl, 'https://example.invalid/photo');
    assert.equal(b.media.binaryFilesIncluded, false); for (const s of ['SYNTHETIC_SECRET', 'SYNTHETIC_PUSH', 'IdempotencyRecord']) assert(!JSON.stringify(b).includes(s));
});
test('6 portable dry-run and cross-account restore map new relations without replacing existing users or their records', async () => {
    await runtime.raw.routine.delete({ where: { id: 'ra' } }); const b = await exportBackup(runtime.raw, 'A'), before = await rows(runtime);
    const dry = await restoreBackup(runtime.raw, b, 'B'); assert(dry.dryRun); assert.deepEqual(await rows(runtime), before);
    const result = await restoreBackup(runtime.raw, b, 'B', { dryRun: false }); assert(result.ok);
    const copy = await runtime.raw.workoutLog.findUnique({ where: { id: result.idMap.WorkoutLog.wa } }); assert.equal(copy.userId, 'B'); assert.equal(copy.exerciseNameSnapshot, 'Press');
    assert.equal(copy.exerciseId, result.idMap.Exercise.ea); assert.equal((await runtime.raw.workoutLog.findUnique({ where: { id: 'wb' } })).userId, 'B');
    assert.equal((await restoreBackup(runtime.raw, b, 'B', { dryRun: false })).plannedCreates, 0);
});
test('6 complete v4 portable backups verify their original checksums and restore with explicit unknown historical attributes', async () => {
    const adapted = readBackup(oldPortable); assert.equal(adapted.backup.backupSchemaVersion, 5); assert.equal(adapted.incomplete, false);
    const result = await restoreBackup(runtime.raw, oldPortable, 'B', { dryRun: false }); const w = await runtime.raw.workoutLog.findUnique({ where: { id: result.idMap.WorkoutLog.wa } });
    assert.equal(w.snapshotSource, 'legacy-observed'); assert.equal(w.isUnilateralSnapshot, null); assert.equal(w.muscleGroupSnapshot, null); assert.equal(w.date.toISOString(), '2020-01-01T12:00:00.123Z');
    const invalid = structuredClone(oldPortable); invalid.data.Exercise[0].routineDayId = null;
    invalid.manifest.Exercise.sha256 = checksum(invalid.data.Exercise); delete invalid.integrity;
    invalid.integrity = { algorithm: 'sha256', sha256: checksum(invalid) }; assert.throws(() => readBackup(invalid));
});
test('6 admitted daily v1 legacy backup still restores through its explicit incomplete-data policy', async () => {
    const d = oldPortable.data;
    const b = { version: 1, generatedAt: oldPortable.generatedAt, user: d.User[0],
        routines: d.Routine.map(r => ({ ...r, blocks: d.RoutineBlock.filter(v => v.routineId === r.id), days: d.RoutineDay.filter(v => v.routineId === r.id).map(day => ({ ...day, exercises: d.Exercise.filter(e => e.routineDayId === day.id) })) })),
        workoutLogs: d.WorkoutLog.map(w => ({ ...w, sets: d.SetLog.filter(s => s.workoutLogId === w.id) })), bodyLogs: d.BodyLog,
        personalRecords: d.PersonalRecord, restLogs: d.RestLog, goals: d.Goal };
    const dry = await restoreBackup(runtime.raw, b, 'B'); assert.equal(dry.complete, false);
    const result = await restoreBackup(runtime.raw, b, 'B', { dryRun: false, allowIncomplete: true }); assert(result.ok);
    assert.equal((await runtime.raw.workoutLog.findUnique({ where: { id: result.idMap.WorkoutLog.wa } })).snapshotSource, 'legacy-observed');
});
test('6 corrupt or cross-account portable backup is rejected before writes', async () => {
    const b = await exportBackup(runtime.raw, 'A'), before = await rows(runtime); b.data.WorkoutLog[0].userId = 'B';
    await assert.rejects(restoreBackup(runtime.raw, b, 'B', { dryRun: false })); assert.deepEqual(await rows(runtime), before);
    const forged = sealBackup(b.data); await assert.rejects(restoreBackup(runtime.raw, forged, 'B', { dryRun: false })); assert.deepEqual(await rows(runtime), before);
    for (const name of ['Routine', 'PersonalRecord', 'BodyLog', 'RestLog']) {
        const owned = await exportBackup(runtime.raw, 'A'); owned.data[name][0].userId = null;
        await assert.rejects(restoreBackup(runtime.raw, sealBackup(owned.data), 'B', { dryRun: false }));
        assert.deepEqual(await rows(runtime), before);
    }
});
test('6 a late portable restoration failure rolls back all earlier inserted relations and context', async () => {
    const b = await exportBackup(runtime.raw, 'A'), before = await rows(runtime);
    await failure('SetLog', 'INSERT', () => assert.rejects(restoreBackup(runtime.raw, b, 'B', { dryRun: false }), e => e.details.rolledBack));
    assert.deepEqual(await rows(runtime), before);
});
test('6 sanitized PostgreSQL recovery preserves new schema, context and data while excluding credentials', async () => {
    const directory = path.join(root, 'safe-backup'); await dumpPostgres({ ...credentials(runtime), directory });
    const t = await target('ab'); await restorePostgres({ ...credentials(t), directory });
    assert.deepEqual((await exportBackup(t.raw, 'A')).data, (await exportBackup(runtime.raw, 'A')).data);
    assert.equal((await t.raw.user.findUnique({ where: { id: 'A' } })).passwordHash, '!NEXLIFT_CREDENTIALS_EXCLUDED!');
    assert.equal(await t.raw.pendingReminder.count(), 0); assert.deepEqual(businessCatalog(await catalog(t)), businessCatalog(await catalog(runtime)));
});
test('6 full PostgreSQL recovery verifies new history, all models, SQL guards and exact operation journal', async () => {
    await applyOperation(runtime.client, 'A', operation()); const directory = path.join(root, 'full-backup');
    const manifest = await dumpSystemPostgres({ ...credentials(runtime), directory }); assert.equal(manifest.operationJournal.count, 1);
    const t = await target('ac'); const result = await restoreSystemPostgres({ ...credentials(t), directory }); assert(result.verified);
    assert.deepEqual(await rows(t), await rows(runtime)); assert.deepEqual(await journal(t), await journal(runtime));
    assert.deepEqual(businessCatalog(await catalog(t)), businessCatalog(await catalog(runtime)));
});
test('6 full recovery with an invalid operation-journal digest rolls back schema, data and acknowledgements', async () => {
    await applyOperation(runtime.client, 'A', operation()); const directory = path.join(root, 'bad-journal'); await dumpSystemPostgres({ ...credentials(runtime), directory });
    const file = path.join(directory, 'system-manifest.json'), manifest = JSON.parse(await readFile(file, 'utf8')); manifest.operationJournal.digest = '0'.repeat(32); await writeFile(file, JSON.stringify(manifest));
    const t = await target('ad'); await assert.rejects(restoreSystemPostgres({ ...credentials(t), directory })); assert.equal((await catalog(t)).tables.length, 0);
});
test('6 read-only readiness verifies the new catalog and rejects changed retention triggers', async () => {
    assert.deepEqual(await assertSchemaReady(runtime.raw), { ready: true, businessTables: 17, appliedMigrations: 3 });
    sql(runtime, 'ALTER TABLE "WorkoutLog" DISABLE TRIGGER nexlift_workout_history;');
    try { await assert.rejects(assertSchemaReady(runtime.raw), /incompatible/); }
    finally { sql(runtime, 'ALTER TABLE "WorkoutLog" ENABLE TRIGGER nexlift_workout_history;'); }
});
test('6 synthetic long histories keep bounded Prisma query counts and use the owner/date index', async () => {
    sql(runtime, `INSERT INTO "WorkoutLog" (id,date,"exerciseId") SELECT 'perf-'||n,'2026-01-01'::timestamp+n*interval '1 minute','ea' FROM generate_series(1,2000) n;
        INSERT INTO "SetLog" (id,"setNumber",weight,reps,"workoutLogId") SELECT 'perf-set-'||n||'-'||s,s,80,10,'perf-'||n FROM generate_series(1,2000) n CROSS JOIN generate_series(1,6) s;
        ANALYZE "WorkoutLog"; ANALYZE "SetLog";`);
    let start = performance.now(), q = runtime.queryCount();
    const logs = await runtime.client.workoutLog.findMany({ where: { exercise: { routineDay: { routine: { userId: 'A' } } } }, include: { sets: true, exercise: true }, orderBy: { date: 'desc' }, take: 2000 });
    const queryCount = runtime.queryCount() - q, readMs = performance.now() - start; assert.equal(logs.length, 2000); assert(queryCount <= 4);
    start = performance.now(); await withWorkoutTransaction(runtime.client, 'A', tx => recalcPRForExercise(tx, 'Press', 'A')); const rebuildMs = performance.now() - start;
    const plan = await runtime.raw.$queryRawUnsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM "WorkoutLog" WHERE "userId"='B' ORDER BY date DESC LIMIT 30`);
    assert(JSON.stringify(plan).includes('WorkoutLog_userId_date_idx'));
    evidence.performance = { sessions: 2004, sets: 12005, returned: logs.length, queryCount, readMs, rebuildMs, plan };
    sql(runtime, `INSERT INTO "Routine" (id,name,"userId","updatedAt") VALUES ('large','Large custom plan','A',now());
        INSERT INTO "RoutineDay" (id,"dayName","order","routineId") SELECT 'large-day-'||n,'Custom day '||n,n,'large' FROM generate_series(1,10) n;
        INSERT INTO "Exercise" (id,name,"targetSets","targetReps","routineDayId") SELECT 'large-ex-'||n,'Custom exercise '||n,6,'8-12','large-day-'||(1+(n%10)) FROM generate_series(1,100) n;
        INSERT INTO "WorkoutLog" (id,date,"exerciseId") SELECT 'large-log-'||n,'2026-01-02'::timestamp,'large-ex-'||n FROM generate_series(1,100) n;
        INSERT INTO "SetLog" (id,"setNumber",weight,reps,rpe,"workoutLogId") SELECT 'large-set-'||n||'-'||s,s,80,10,8,'large-log-'||n FROM generate_series(1,100) n CROSS JOIN generate_series(1,6) s;`);
    const beforePlan = await counts(); start = performance.now();
    const edited = await request('/api/routines/large', { name: 'Large plan edited', days: [] }, 'PUT');
    const editMs = performance.now() - start; assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.deepEqual(await counts(), beforePlan);
    assert.equal(await runtime.raw.exercise.count({ where: { id: { startsWith: 'large-ex-' }, userId: 'A', archivedAt: { not: null } } }), 100);
    start = performance.now(); const removed = await request('/api/routines/large', undefined, 'DELETE');
    const deleteMs = performance.now() - start; assert.equal(removed.status, 200); assert.deepEqual(await counts(), beforePlan);
    evidence.performance.largeRoutine = { days: 10, customExercises: 100, historicalLogs: 100, historicalSets: 600, editMs, deleteMs, preserved: beforePlan };
});
test('6 all final relations have owners and no orphan sets after actual Express edit/delete and replanning', async () => {
    assert.equal((await request('/api/workouts/wa', { sets: [bodySet(0, 0, { rpe: null, weightRight: 0, repsRight: 0, completed: false })] }, 'PUT')).status, 200);
    assert.equal((await request('/api/routines/ra', { name: 'Replan', days: [] }, 'PUT')).status, 200);
    const missing = await runtime.raw.$queryRaw`SELECT
      (SELECT count(*)::int FROM "WorkoutLog" w LEFT JOIN "User" u ON u.id=w."userId" WHERE u.id IS NULL) AS owners,
      (SELECT count(*)::int FROM "SetLog" s LEFT JOIN "WorkoutLog" w ON w.id=s."workoutLogId" WHERE w.id IS NULL) AS sets`;
    assert.deepEqual(missing, [{ owners: 0, sets: 0 }]);
});
test('6 actual overview counts detached historical work using direct ownership', async () => {
    await runtime.raw.routine.delete({ where: { id: 'ra' } }); const result = await request('/api/stats/overview');
    assert.equal(result.status, 200); assert.equal(result.body.totalWorkouts, 3);
    const foreign = await request('/api/stats/overview', undefined, 'GET', 'B'); assert.equal(foreign.body.totalWorkouts, 1);
});
test('6 snapshot projection preserves narrow legacy JSON selections without leaking injected scalar fields', async () => {
    await runtime.raw.exercise.update({ where: { id: 'ea' }, data: { name: 'New display', muscleGroup: 'otro' } });
    const selected = await runtime.client.workoutLog.findUnique({ where: { id: 'wa' }, select: { id: true, exercise: { select: { name: true } } } });
    assert.deepEqual(selected, { id: 'wa', exercise: { name: 'Press' } });
});
test('6 compound Exercise and Workout predicates preserve both direct and legacy ownership constraints', async () => {
    assert.equal(await runtime.client.exercise.count({ where: { userId: 'B', routineDay: { routine: { userId: 'A' } } } }), 0);
    assert.equal(await runtime.client.workoutLog.count({ where: { userId: 'B', exercise: { routineDay: { routine: { userId: 'A' } } } } }), 0);
    await runtime.raw.routine.delete({ where: { id: 'ra' } });
    assert.equal(await runtime.client.exercise.count({ where: { OR: [{ routineDay: { routine: { userId: 'A' } } }], NOT: { id: 'ea2' } } }), 2);
});
test('6 nested series predicates retain ownership and find detached records without joining deleted plans', async () => {
    await runtime.raw.routine.delete({ where: { id: 'ra' } });
    assert.equal(await runtime.client.setLog.count({ where: { AND: [{ workoutLog: { exercise: { routineDay: { routine: { userId: 'A' } } } } }] } }), 4);
});
test('6 actual legacy Shortcut HTTP keeps cumulative sets and RIR conversion on an archived exercise', async () => {
    await runtime.raw.exercise.update({ where: { id: 'ea' }, data: { routineDayId: null } });
    for (const rir of [0, 1, 2, 3, 4]) {
        const result = await request('/api/shortcuts/log-set?date=2026-10-17', { exerciseId: 'ea', weight: 80, reps: 10, rpe: rir }, 'POST');
        assert.equal(result.status, 201); assert.equal(result.body.workoutLog.sets.at(-1).rpe, 10 - rir); assert.equal(result.body.setsLoggedToday, rir + 1);
    }
    assert.equal(await runtime.raw.workoutLog.count(), 5);
});
test('6 unknown legacy unilateral classification displays recorded right-side structure without borrowing current metadata', async () => {
    const result = await upgraded.client.workoutLog.findUnique({ where: { id: 'wu' }, include: { exercise: true, sets: true } });
    assert.equal(result.isUnilateralSnapshot, null); assert.equal(result.exercise.isUnilateral, true); assert.equal(result.sets[0].weightRight, 60);
    assert.equal(result.snapshotSource, 'legacy-observed');
});
