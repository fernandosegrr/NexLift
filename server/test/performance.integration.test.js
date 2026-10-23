import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWorkoutHandlers } from '../src/routes/workouts.js';
import { recalcPRForExercise } from '../src/services/personalRecords.js';
import { recalcPRForExercise as referenceRecalc } from '../../scripts/fixtures/phase52/personalRecords.js';
import { prisma, schema, seed, snapshot, addLog, set, listen, withFailure } from './fixtures/workout-test-db.js';
let server, request;
const prs = () => prisma.personalRecord.findMany({ where: { userId: 'A' } });
async function exactReferenceRecord() {
    const [actual] = await prs();
    await prisma.$transaction(tx => referenceRecalc(tx, 'Press', 'A'));
    const [expected] = await prs();
    // Compare the real historical adapter across the same Prisma/Postgres
    // serialization boundary, which renders these doubles with 15 digits.
    assert.deepEqual({ ...actual, id: null }, { ...expected, id: null });
}
before(async () => {
    await schema(); const app = express(); app.use(express.json());
    app.use((req, res, next) => { req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A'; next(); });
    const handlers = createWorkoutHandlers({ prisma, logger: { error: () => {} } });
    app.post('/api/shortcuts/log-set', handlers.logShortcutSet);
    app.put('/api/workouts/:logId', handlers.updateWorkout);
    app.delete('/api/workouts/:logId', handlers.deleteWorkout);
    ({ server, request } = await listen(app));
});
beforeEach(seed);
after(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await prisma.$disconnect(); });
const shortcut = extra => request('/api/shortcuts/log-set?date=2026-10-17', { exerciseId: 'a-ex', weight: 80, reps: 10, ...extra });
test('5.2 HTTP/SQL legacy RIR0..4, raw rpe0..4 and stored rpe6..10 roundtrip without changing PR', async () => {
    for (let rir = 0; rir <= 4; rir++) for (const extra of [{ rir }, { rpe: rir }, { rpe: 10 - rir }]) {
        const result = await shortcut(extra); assert.equal(result.status, 201, JSON.stringify(result.body));
        const saved = await prisma.workoutLog.findUnique({ where: { id: result.body.workoutLog.id }, include: { sets: { orderBy: { setNumber: 'asc' } } } });
        assert.equal(saved.sets.at(-1).rpe, 10 - rir); assert.equal(saved.date.toISOString(), '2026-10-17T06:00:00.000Z');
        await exactReferenceRecord();
    }
    assert.equal(await prisma.workoutLog.count(), 1); assert.equal(await prisma.setLog.count(), 15);
});
test('5.2 HTTP legacy absence, priority and invalid gap retain response contract and reject before writes', async () => {
    assert.equal((await shortcut({})).body.workoutLog.sets[0].rpe, 10);
    const result = await shortcut({ rir: 3, rpe: 9 }); assert.equal(result.body.workoutLog.sets.at(-1).rpe, 7);
    for (const extra of [{ rpe: 5 }, { rir: 5, rpe: 8 }, { rir: 'bad' }, { rpe: 'bad' }]) {
        const before = await snapshot(), failed = await shortcut(extra); assert.equal(failed.status, 400);
        assert.deepEqual(failed.body, { error: 'RIR inválido (usa 0-4, reps en recámara)' }); assert.deepEqual(await snapshot(), before);
    }
});
test('5.2 HTTP unilateral zero and strongest side preserve persisted performance, dates and owner', async () => {
    const zero = await shortcut({ rir: 2, weightRight: 0, repsRight: 0 }); assert.equal(zero.status, 201);
    assert.equal(zero.body.workoutLog.sets[0].weightRight, 0); assert.equal((await prs())[0].weight, 80);
    const right = await shortcut({ rir: 2, weightRight: 100, repsRight: 2 }); assert.equal(right.status, 201);
    assert.equal((await prs())[0].weight, 100); await exactReferenceRecord();
    const before = await snapshot(); assert.equal((await request('/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 200, reps: 10, rir: 2 }, 'POST', 'B')).status, 404); assert.deepEqual(await snapshot(), before);
});
test('5.2 SQL PR edit/delete recomputation and injected PR failure remain atomic with exact binary comparisons', async () => {
    await addLog('older', 'a-ex', [set(80, 10)], '2026-10-17T05:59:59.999Z');
    await addLog('best', 'a-ex', [set(100, 2)], '2026-10-18T05:59:59.999Z');
    await prisma.$transaction(tx => recalcPRForExercise(tx, 'Press', 'A'));
    assert.equal((await prs())[0].weight, 100);
    const before = await snapshot();
    const failed = await withFailure('PersonalRecord', 'INSERT', () => request('/api/workouts/best', { sets: [set(60, 2)] }, 'PUT'));
    assert.equal(failed.status, 500); assert.deepEqual(await snapshot(), before);
    assert.equal((await request('/api/workouts/best', { sets: [set(60, 2)] }, 'PUT')).status, 200); assert.equal((await prs())[0].weight, 80);
    assert.equal((await prs())[0].date.toISOString(), '2026-10-17T05:59:59.999Z');
    assert.equal((await request('/api/workouts/older', undefined, 'DELETE')).status, 200); assert.equal((await prs())[0].weight, 60);
});
