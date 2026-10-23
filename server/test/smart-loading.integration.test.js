import { readBackendSource } from '../../scripts/lib/backend-source.mjs';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import express from 'express';
import * as logic from '../src/logic.js';
import * as old from '../../scripts/fixtures/phase53/smartLoading.js';
import { sourceFunction } from '../../scripts/lib/training-characterization.mjs';
import { createWorkoutHandlers } from '../src/routes/workouts.js';
import { prisma, schema, seed, snapshot, addLog, set, listen } from './fixtures/workout-test-db.js';
const require = createRequire(new URL('../../package.json', import.meta.url)), ts = require('typescript');
let server, request;
// Execute the EXACT existing inline handler through Express HTTP + real PG.
// No import of index.js, dotenv, application startup or background jobs.
const source = await readBackendSource();
const ast = ts.createSourceFile('index.js', source, ts.ScriptTarget.Latest, true);
let callback;
function visit(n) {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'app.get' && n.arguments[0]?.text === '/api/shortcuts/next-set') callback = n.arguments.at(-1).getText(ast);
    ts.forEachChild(n, visit);
}
visit(ast); assert(callback);
const baseShortcutResponse = await sourceFunction('server/src/index.js', 'baseShortcutResponse');
let phase = null;
const bindings = { ...logic, prisma, baseShortcutResponse, HISTORY_SESSIONS_WINDOW: 10,
    getRoutinePhaseStatus: () => ({ phase, isDeload: phase === 'deload' }),
    resolveOrGenerateAiRoutineDay: () => { throw new Error('AI generation is outside synthetic manual-routine fixture'); } };
const handler = new Function(...Object.keys(bindings), `return (${callback});`)(...Object.values(bindings));
before(async () => {
    await schema();
    await prisma.$executeRawUnsafe('CREATE TABLE "RoutineBlock" (id TEXT PRIMARY KEY, "routineId" TEXT NOT NULL REFERENCES "Routine"(id), name TEXT NOT NULL, phase TEXT NOT NULL, "order" INTEGER NOT NULL, "durationWeeks" INTEGER NOT NULL, "startedAt" TIMESTAMP(3))');
    await prisma.$executeRawUnsafe('CREATE TABLE "SuggestionLog" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "exerciseId" TEXT NOT NULL, date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "suggestedWeight" DOUBLE PRECISION NOT NULL, "suggestedReps" INTEGER NOT NULL, phase TEXT, source TEXT NOT NULL)');
    const app = express(); app.use(express.json()); app.use((req, res, next) => { req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A'; next(); });
    app.get('/api/shortcuts/next-set', handler);
    const workouts = createWorkoutHandlers({ prisma, logger: { error: () => {} } });
    app.post('/api/shortcuts/log-set', workouts.logShortcutSet);
    app.put('/api/workouts/:logId', workouts.updateWorkout); app.delete('/api/workouts/:logId', workouts.deleteWorkout);
    ({ server, request } = await listen(app));
});
beforeEach(async () => {
    await seed(); phase = null;
    await prisma.routine.update({ where: { id: 'a-routine' }, data: { isActive: true } });
    await prisma.routineDay.update({ where: { id: 'a-day' }, data: { weekday: 1 } });
    await prisma.$executeRawUnsafe('TRUNCATE "SuggestionLog"');
});
after(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await prisma.$disconnect(); });
const next = user => request('/api/shortcuts/next-set?date=2026-10-19', undefined, 'GET', user);
const shortcut = body => request('/api/shortcuts/log-set?date=2026-10-19', { exerciseId: 'a-ex', weight: 80, reps: 8, rir: 0, ...body });
test('5.3 real next-set HTTP/SQL owner isolation, no history, inter golden and unchanged telemetry payload', async () => {
    assert.equal((await next()).body.source, 'none'); assert.equal((await next('B')).body.noActiveRoutine, true);
    await addLog('past', 'a-ex', [set(80, 12, { rpe: 9 })], '2026-10-17T18:00:00Z');
    await addLog('foreign', 'b-ex', [set(500, 12, { rpe: 9 })], '2026-10-18T18:00:00Z');
    const before = await snapshot(), result = await next(); assert.equal(result.status, 200);
    const expected = old.computeWorkoutSuggestion([{ sets: [set(80, 12, { rpe: 9 })] }], '8-12', 2.5);
    assert.equal(result.body.suggestedWeight, expected.weight); assert.equal(result.body.suggestedReps, expected.reps); assert.equal(result.body.rationale, expected.rationale); assert.equal(result.body.source, 'inter');
    assert.deepEqual(await snapshot(), before); assert(!('explanation' in result.body));
    // Await the established fire-and-forget write without changing the route.
    let logs = []; for (let i = 0; i < 50; i++) { logs = await prisma.suggestionLog.findMany(); if (logs.length) break; await new Promise(r => setTimeout(r, 20)); }
    assert.equal(logs.length, 1); assert.equal(logs[0].suggestedWeight, 82.5); assert.equal(logs[0].source, 'shortcut'); assert.equal(logs[0].userId, 'A');
});
test('5.3 real shortcut RIR normalization feeds intra backoff, partial sets and missing-RIR inter fallback', async () => {
    await addLog('past', 'a-ex', [set(80, 12, { rpe: 9 })], '2026-10-17T18:00:00Z');
    const saved = await shortcut({}); assert.equal(saved.status, 201); assert.equal(saved.body.workoutLog.sets[0].rpe, 10);
    const intra = await next(); assert.equal(intra.body.source, 'intra'); assert.equal(intra.body.suggestedWeight, 70); assert.equal(intra.body.suggestedReps, 10);
    const log = saved.body.workoutLog; await prisma.setLog.updateMany({ where: { workoutLogId: log.id }, data: { rpe: null } });
    const fallback = await next(); assert.equal(fallback.body.source, 'inter'); assert.equal(fallback.body.suggestedWeight, 82.5);
});
test('5.3 real next-set reflects edit/delete, unilateral weak side and PR remains strongest side transactionally', async () => {
    await addLog('past', 'a-ex', [set(100, 12, { weightRight: 80, repsRight: 8, rpe: 8 })], '2026-10-17T18:00:00Z');
    assert.equal((await next()).body.suggestedWeight, 80);
    const edited = await request('/api/workouts/past', { sets: [set(90, 12, { weightRight: 70, repsRight: 12, rpe: 9 })] }, 'PUT'); assert.equal(edited.status, 200);
    const nextEdited = await next(); assert.equal(nextEdited.body.suggestedWeight, 72.5); assert.equal(nextEdited.body.suggestedReps, 8);
    const pr = await prisma.personalRecord.findFirst({ where: { userId: 'A' } }); assert.equal(pr.weight, 90);
    assert.equal((await request('/api/workouts/past', undefined, 'DELETE')).status, 200); assert.equal((await next()).body.source, 'none'); assert.equal(await prisma.personalRecord.count(), 0);
});
test('5.3 routine phase uses unchanged deload post-adjustment only inter and not twice intra', async () => {
    phase = 'deload'; await addLog('past', 'a-ex', [set(80, 12, { rpe: 9 })], '2026-10-17T18:00:00Z');
    const result = await next(); assert.equal(result.body.suggestedWeight, 75); assert.equal(result.body.source, 'inter');
    assert.equal((await shortcut({})).status, 201); const intra = await next(); assert.equal(intra.body.suggestedWeight, 70); assert.equal(intra.body.source, 'intra');
});
