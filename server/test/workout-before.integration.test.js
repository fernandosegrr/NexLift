import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyWorkoutApp } from './fixtures/workout-before-1.5.js';
import { createLegacyRoutineDeleteApp } from './fixtures/routine-delete-before-1.5.js';
import { prisma, schema, seed, snapshot, addLog, set, withFailure, listen } from './fixtures/workout-test-db.js';

let server, request, recalc, secondaryFails;
before(async () => {
    await schema();
    const legacy = createLegacyWorkoutApp({ prisma, scheduleRestReminder: () => {
        if (secondaryFails) throw Error('synthetic notification failure');
    } });
    recalc = legacy.recalcPRForExercise;
    ({ server, request } = await listen(legacy.app));
});
beforeEach(async () => { secondaryFails = false; await seed(); });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });

test('BEFORE: PR failure after POST returns 500 but commits the workout and its sets', async () => {
    const result = await withFailure('PersonalRecord', 'INSERT', () => request('/api/workouts/log', { exerciseId: 'a-ex', sets: [set()] }));
    assert.equal(result.status, 500);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); assert.equal(db.prs.length, 0);
});
test('BEFORE: editing commits new sets and deletes the old PR before PR insertion fails', async () => {
    await addLog('session'); await recalc('Press', 'A');
    const result = await withFailure('PersonalRecord', 'INSERT', () => request('/api/workouts/session', { sets: [set(90)] }, 'PUT'));
    assert.equal(result.status, 500);
    const db = await snapshot(); assert.equal(db.sets[0].weight, 90); assert.equal(db.prs.length, 0);
});
test('BEFORE: replacing sets already rolls back on an intermediate SetLog insertion failure', async () => {
    await addLog('session'); await recalc('Press', 'A'); const previous = await snapshot();
    const result = await withFailure('SetLog', 'INSERT', () => request('/api/workouts/session', { sets: [set(90)] }, 'PUT'));
    assert.equal(result.status, 500); assert.deepEqual(await snapshot(), previous);
});
test('BEFORE: deleting the historical winner persists deletion despite a PR failure and loses the prior PR', async () => {
    await addLog('old'); await addLog('winner', 'a-ex', [set(100)], '2026-02-01T12:00:00Z'); await recalc('Press', 'A');
    const result = await withFailure('PersonalRecord', 'INSERT', () => request('/api/workouts/winner', undefined, 'DELETE'));
    assert.equal(result.status, 500);
    const db = await snapshot(); assert.deepEqual(db.logs.map(l => l.id), ['old']); assert.equal(db.prs.length, 0);
});
test('BEFORE: a nested SetLog failure in POST already rolls back its parent', async () => {
    const previous = await snapshot();
    const result = await withFailure('SetLog', 'INSERT', () => request('/api/workouts/log', { exerciseId: 'a-ex', sets: [set()] }));
    assert.equal(result.status, 500); assert.deepEqual(await snapshot(), previous);
});
test('BEFORE: foreign-user edit and deletion return 404 and preserve every row', async () => {
    await addLog('foreign', 'b-ex'); await recalc('Press', 'B'); const previous = await snapshot();
    assert.equal((await request('/api/workouts/foreign', { sets: [set(100)] }, 'PUT')).status, 404);
    assert.equal((await request('/api/workouts/foreign', undefined, 'DELETE')).status, 404);
    assert.deepEqual(await snapshot(), previous);
});
test('BEFORE: unilateral editing preserves both sides and chooses the strongest limb for the PR', async () => {
    await addLog('session', 'a-uni');
    assert.equal((await request('/api/workouts/session', { sets: [set(25, 8, { weightRight: 30, repsRight: 10 })] }, 'PUT')).status, 200);
    const db = await snapshot(); assert.equal(db.sets[0].weightRight, 30); assert.equal(db.sets[0].repsRight, 10);
    assert.equal(db.prs[0].weight, 30); assert.equal(db.prs[0].estimated1RM, 40);
});
test('BEFORE: removing a winner successfully restores the remaining historical PR', async () => {
    await addLog('old'); await addLog('winner', 'a-ex', [set(100)]); await recalc('Press', 'A');
    assert.equal((await request('/api/workouts/winner', undefined, 'DELETE')).status, 200);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.prs[0].weight, 50);
});
test('BEFORE: tied PRs keep the oldest session and preserve Epley boundary behavior', async () => {
    await addLog('new', 'a-ex', [set(50)], '2026-02-01T12:00:00Z');
    await addLog('old', 'a-ex', [set(50)], '2026-01-01T12:00:00Z'); await recalc('Press', 'A');
    const db = await snapshot(); assert.equal(db.prs[0].date.toISOString(), '2026-01-01T12:00:00.000Z');
    assert.equal(db.prs[0].estimated1RM, 50 * (1 + 10 / 30));
});
test('BEFORE: synchronous secondary failure returns a false 500 after shortcut workout and PR committed', async () => {
    secondaryFails = true;
    assert.equal((await request('/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 50, reps: 10, rir: 2 })).status, 500);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets[0].rpe, 8); assert.equal(db.prs.length, 1);
});
test('BEFORE: fix-weights changes PR weight but leaves its estimated1RM stale', async () => {
    await addLog('session'); await recalc('Press', 'A');
    assert.equal((await request('/api/workouts/fix-weights', { exerciseName: 'Press', oldWeight: 50, newWeight: 80 }, 'PUT')).status, 200);
    const db = await snapshot(); assert.equal(db.sets[0].weight, 80); assert.equal(db.prs[0].weight, 80);
    assert.equal(db.prs[0].estimated1RM, 50 * (1 + 10 / 30));
});
test('BEFORE: two concurrent edits can interleave replacement sets in ReadCommitted', async () => {
    await addLog('session');
    // Force both old transactions to delete before either creates. This is the
    // actual production transaction body, intercepted only to schedule the race.
    let arrivals = 0, release; const barrier = new Promise(resolve => { release = resolve; });
    const original = prisma.$transaction.bind(prisma);
    prisma.$transaction = (callback, options) => original(async tx => callback(new Proxy(tx, { get(target, key) {
        if (key !== 'setLog') return target[key];
        return new Proxy(target.setLog, { get(delegate, operation) {
            if (operation !== 'deleteMany') return delegate[operation];
            return async args => {
                const result = await delegate.deleteMany(args);
                arrivals++; if (arrivals === 1) setTimeout(release, 150);
                await barrier; return result;
            };
        } });
    } })), options);
    try {
        const results = await Promise.all([50, 80].map(w => request('/api/workouts/session', { sets: [set(w)] }, 'PUT')));
        assert.ok(results.every(r => r.status === 200));
        const db = await snapshot();
        assert.equal(db.logs.length, 1);
        assert.equal(db.sets.length, 2, 'two replacement requests merged their sets instead of replacing atomically');
        assert.deepEqual(db.sets.map(s => s.weight).sort((a, b) => a - b), [50, 80]);
        console.log('BASELINE concurrent edits final weights:', db.sets.map(s => s.weight), 'PRs:', db.prs.length);
    } finally { prisma.$transaction = original; }
});

test('BEFORE: deleting a routine can cascade a workout committed after its empty history count', async () => {
    const original = prisma.$transaction.bind(prisma); let inserted = false;
    const client = { routine: prisma.routine, $transaction: (callback, options) => original(tx => callback(new Proxy(tx, { get(target, key) {
        if (key !== 'workoutLog') return target[key];
        return new Proxy(target.workoutLog, { get(delegate, operation) {
            if (operation !== 'findMany') return delegate[operation];
            return async args => {
                const empty = await delegate.findMany(args);
                if (!inserted) { inserted = true; await addLog('racing'); await recalc('Press', 'A'); }
                return empty;
            };
        } });
    } })), options) };
    const local = await listen(createLegacyRoutineDeleteApp(client));
    try {
        assert.equal((await local.request('/api/routines/a-routine', undefined, 'DELETE')).status, 200);
        const db = await snapshot(); assert.equal(inserted, true); assert.equal(db.logs.length, 0); assert.equal(db.sets.length, 0);
        assert.equal(db.prs.length, 1, 'a phantom PR remains after the indirect cascade');
    } finally { await new Promise(resolve => local.server.close(resolve)); }
});
