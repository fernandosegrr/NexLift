import { readBackendSource } from '../../scripts/lib/backend-source.mjs';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createWorkoutHandlers } from '../src/routes/workouts.js';
import { createUpdateRoutineHandler } from '../src/routes/updateRoutine.js';
import { recalcPRForExercise } from '../src/services/personalRecords.js';
import { withWorkoutTransaction } from '../src/services/workoutTransaction.js';
import { epley1RM } from '../src/utils/exerciseName.js';
import { mexicoCityDateStr, mexicoCityDayBounds } from '../src/logic.js';
import { createLegacyWorkoutApp } from './fixtures/workout-before-1.5.js';
import { mountGraphRoutes } from './fixtures/workout-graph-routes.js';
import { prisma, schema, seed, snapshot, addLog, set, withFailure, listen } from './fixtures/workout-test-db.js';

let server, request, handlerPrisma, secondary, errors, secondaryCalls;
const paths = {
    create: ['/api/workouts/log', () => ({ exerciseId: 'a-ex', sets: [set(90)] }), 'POST'],
    edit: ['/api/workouts/session', () => ({ sets: [set(90)] }), 'PUT'],
    delete: ['/api/workouts/session', () => undefined, 'DELETE'],
    shortcut: ['/api/shortcuts/log-set?date=2026-01-01', () => ({ exerciseId: 'a-ex', weight: 90, reps: 10, rir: 2 }), 'POST'],
    fix: ['/api/workouts/fix-weights', () => ({ exerciseName: 'Press', oldWeight: 50, newWeight: 90 }), 'PUT']
};
const call = operation => { const [path, body, method] = paths[operation]; return request(path, body(), method); };
const recalc = (name = 'Press', user = 'A') => prisma.$transaction(tx => recalcPRForExercise(tx, name, user));
const pr = (user = 'A', name = 'press') => prisma.personalRecord.findMany({ where: { userId: user, exerciseName: name } });
const assertPR = async (weight, reps = 10, user = 'A', name = 'press') => {
    const records = await pr(user, name); assert.equal(records.length, 1);
    assert.equal(records[0].weight, weight); assert.equal(records[0].reps, reps);
    const expected = reps > 1 && reps < 37 ? weight * (1 + reps / 30) : weight;
    assert.ok(Math.abs(records[0].estimated1RM - expected) < 1e-10, 'PostgreSQL double precision round trip');
    return records[0];
};
async function unchanged(operation, table, event) {
    const previous = await snapshot();
    const result = await withFailure(table, event, () => call(operation));
    assert.equal(result.status, 500, JSON.stringify(result.body));
    assert.deepEqual(await snapshot(), previous, 'real PostgreSQL rows/IDs/timestamps must all roll back');
    assert.equal(secondaryCalls, 0);
}

// Every delegate still executes against the real PostgreSQL transaction. Hooks
// only coordinate independent connections or inject actual SQL failures.
function instrument({ beforeOperation = () => {}, afterBody = () => {}, transaction = undefined, transactionOptions = options => options } = {}) {
    let attempts = 0;
    handlerPrisma = new Proxy(prisma, { get(target, property) {
        if (property !== '$transaction') return target[property];
        return async (callback, options) => {
            attempts++;
            const run = () => target.$transaction(async tx => {
                const wrapped = new Proxy(tx, { get(client, model) {
                    if (!['workoutLog', 'setLog', 'exercise', 'personalRecord', 'routine', 'routineDay'].includes(model)) return client[model];
                    return new Proxy(client[model], { get(delegate, operation) {
                        if (typeof delegate[operation] !== 'function') return delegate[operation];
                        return async args => {
                            await beforeOperation({ tx, model, operation, args, attempt: attempts });
                            return delegate[operation](args);
                        };
                    } });
                } });
                const result = await callback(wrapped);
                await afterBody(tx, attempts);
                return result;
            }, transactionOptions(options, attempts));
            return transaction ? transaction(run, attempts) : run();
        };
    } });
    return () => attempts;
}

before(async () => {
    await schema();
    const app = express(); app.use(express.json());
    app.use((req, res, next) => { req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A'; next(); });
    const route = key => (req, res) => createWorkoutHandlers({ prisma: handlerPrisma,
        scheduleRestReminder: (...args) => { secondaryCalls++; return secondary(...args); },
        logger: { error: error => { errors.push(error); if (process.env.NEXLIFT_WORKOUT_DEBUG) console.error(error); } }
    })[key](req, res);
    app.post('/api/workouts/log', route('logWorkout'));
    app.put('/api/workouts/fix-weights', route('fixWeights'));
    app.put('/api/workouts/:logId', route('updateWorkout'));
    app.delete('/api/workouts/:logId', route('deleteWorkout'));
    app.post('/api/shortcuts/log-set', route('logShortcutSet'));
    app.put('/api/routines/:id', createUpdateRoutineHandler({ prisma, deduplicateExercises: async () => [] }));
    await mountGraphRoutes(app, () => handlerPrisma);
    ({ server, request } = await listen(app));
});
beforeEach(async () => {
    handlerPrisma = prisma; secondary = () => {}; secondaryCalls = 0; errors = [];
    await seed();
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });

test('POST preserves HTTP contract and returns exactly the committed session and bilateral sets', async () => {
    const result = await request('/api/workouts/log', { exerciseId: 'a-ex', notes: 'Sintético', sets: [set(), set(60, 8)] });
    assert.equal(result.status, 201); assert.equal(result.body.message, 'Workout logged successfully!');
    const persisted = await prisma.workoutLog.findUnique({ where: { id: result.body.workoutLog.id },
        include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true } });
    assert.deepEqual(result.body.workoutLog, JSON.parse(JSON.stringify(persisted)));
    assert.equal(persisted.notes, 'Sintético'); assert.deepEqual(persisted.sets.map(s => s.setNumber), [1, 2]);
    await assertPR(60, 8); assert.equal(secondaryCalls, 0);
});
test('PUT preserves session ID/date/notes and replaces sets and PR together', async () => {
    const original = await addLog('session'); await recalc();
    const result = await call('edit'); assert.equal(result.status, 200); assert.equal(result.body.message, 'Session updated!');
    const persisted = await prisma.workoutLog.findUnique({ where: { id: 'session' }, include: { sets: true } });
    assert.equal(persisted.date.getTime(), original.date.getTime()); assert.equal(persisted.notes, original.notes);
    assert.equal(persisted.sets.length, 1); assert.equal(persisted.sets[0].weight, 90); await assertPR(90);
});
test('DELETE removes its sets, restores the older PR and retains every remaining log unchanged', async () => {
    const older = await addLog('old'); await addLog('session', 'a-ex', [set(100)], '2026-02-01T12:00:00Z'); await recalc();
    assert.equal((await call('delete')).status, 200);
    const db = await snapshot(); assert.deepEqual(db.logs.map(l => l.id), ['old']); assert.equal(db.sets.length, 1);
    assert.equal(db.sets[0].id, older.sets[0].id); const record = await assertPR(50); assert.equal(record.date.getTime(), older.date.getTime());
});
test('DELETE of the final session removes its PR without affecting the other account', async () => {
    await addLog('session'); await addLog('foreign', 'b-ex', [set(120)]); await recalc(); await recalc('Press', 'B');
    const foreignPR = await pr('B'); const foreignSet = await prisma.setLog.findMany({ where: { workoutLogId: 'foreign' } });
    assert.equal((await call('delete')).status, 200); assert.deepEqual(await pr(), []);
    assert.deepEqual(await pr('B'), foreignPR); assert.deepEqual(await prisma.setLog.findMany({ where: { workoutLogId: 'foreign' } }), foreignSet);
});
test('mixed-case historical PR duplicates collapse to the same history identity without touching another user', async () => {
    await addLog('session');
    await prisma.personalRecord.createMany({ data: [
        { id: 'legacy-upper', userId: 'A', exerciseName: 'PRESS', weight: 999, reps: 1, estimated1RM: 999 },
        { id: 'legacy-lower', userId: 'A', exerciseName: 'press', weight: 998, reps: 1, estimated1RM: 998 },
        { id: 'foreign-upper', userId: 'B', exerciseName: 'PRESS', weight: 997, reps: 1, estimated1RM: 997 }
    ] });
    const foreign = await prisma.personalRecord.findMany({ where: { userId: 'B' } });
    assert.equal((await call('edit')).status, 200); await assertPR(90);
    assert.equal(await prisma.personalRecord.count({ where: { userId: 'A' } }), 1);
    assert.equal((await call('delete')).status, 200); assert.equal(await prisma.personalRecord.count({ where: { userId: 'A' } }), 0);
    assert.deepEqual(await prisma.personalRecord.findMany({ where: { userId: 'B' } }), foreign);
    assert.equal(await prisma.workoutLog.count(), 0); assert.equal(await prisma.setLog.count(), 0);
});
test('PUT with an empty set array preserves the existing validation contract and every historical row', async () => {
    await addLog('session'); await recalc(); const previous = await snapshot();
    assert.equal((await request('/api/workouts/session', { sets: [] }, 'PUT')).status, 400);
    assert.deepEqual(await snapshot(), previous);
});

for (const operation of Object.keys(paths)) {
    for (const event of ['DELETE', 'INSERT']) {
        test(`${operation}: a PersonalRecord ${event} failure rolls back session, sets and previous PR`, async () => {
            await addLog('session'); await addLog('remaining', 'a-ex', [set(30)], '2025-12-01T12:00:00Z'); await recalc();
            await unchanged(operation, 'PersonalRecord', event);
        });
    }
}
for (const [operation, table, event] of [
    ['create', 'WorkoutLog', 'INSERT'], ['create', 'SetLog', 'INSERT'],
    ['edit', 'SetLog', 'DELETE'], ['edit', 'SetLog', 'INSERT'],
    ['delete', 'WorkoutLog', 'DELETE'], ['shortcut', 'SetLog', 'INSERT'], ['fix', 'SetLog', 'UPDATE']
]) {
    test(`${operation}: intermediate ${table} ${event} failure leaves the database identical`, async () => {
        await addLog('session'); await recalc(); await unchanged(operation, table, event);
    });
}
test('shortcut: first daily session and nested sets roll back if PR creation fails', async () => {
    await unchanged('shortcut', 'PersonalRecord', 'INSERT');
});
test('bulk weights: failure on the second update rolls back the first changed set', async () => {
    await addLog('session', 'a-ex', [set(50), set(50)]); await recalc();
    let changed = 0;
    instrument({ beforeOperation: async ({ tx, model, operation }) => {
        if (model === 'setLog' && operation === 'update' && ++changed === 2) await tx.$queryRaw`SELECT 1 / 0`;
    } });
    const previous = await snapshot(); assert.equal((await call('fix')).status, 500); assert.equal(changed, 2);
    assert.deepEqual(await snapshot(), previous);
});
test('bulk weights: recalculates estimated1RM from remaining history and preserves the right limb', async () => {
    await addLog('session', 'a-ex', [set(50, 10, { weightRight: 55, repsRight: 7 })]); await recalc();
    const result = await request('/api/workouts/fix-weights', { exerciseName: 'Press', oldWeight: '50', newWeight: '80' }, 'PUT');
    assert.equal(result.status, 200); assert.equal(result.body.setsUpdated, 1); assert.equal(result.body.prsUpdated, 1);
    const db = await snapshot(); assert.equal(db.sets[0].weight, 80); assert.equal(db.sets[0].weightRight, 55); await assertPR(80);
});
test('bulk weights: reducing the old winner discovers a different winning session', async () => {
    await addLog('session', 'a-ex', [set(100)]); await addLog('other', 'a-ex2', [set(80)]); await recalc();
    assert.equal((await request('/api/workouts/fix-weights', { exerciseName: 'press', oldWeight: 100, newWeight: 20 }, 'PUT')).status, 200);
    await assertPR(80); assert.equal((await prisma.setLog.findMany({ where: { workoutLogId: 'session' } }))[0].weight, 20);
});

test('all mutation endpoints reject foreign resources without changing logs, sets or PRs', async () => {
    await addLog('foreign', 'b-ex'); await recalc('Press', 'B'); const previous = await snapshot();
    for (const [path, body, method] of [
        ['/api/workouts/log', { exerciseId: 'b-ex', sets: [set(100)] }, 'POST'],
        ['/api/shortcuts/log-set', { exerciseId: 'b-ex', weight: 100, reps: 10 }, 'POST'],
        ['/api/workouts/foreign', { sets: [set(100)] }, 'PUT'], ['/api/workouts/foreign', undefined, 'DELETE']
    ]) assert.equal((await request(path, body, method)).status, 404);
    assert.equal((await request('/api/workouts/fix-weights', { exerciseName: 'Press', oldWeight: 50, newWeight: 90 }, 'PUT')).status, 200);
    assert.deepEqual(await snapshot(), previous);
});
test('rechecks authorization inside the write transaction after ownership changes', async () => {
    await addLog('session'); await recalc();
    let moved = false;
    instrument({ transaction: async run => {
        if (!moved) { moved = true; await prisma.routine.update({ where: { id: 'a-routine' }, data: { userId: 'B' } }); }
        return run();
    } });
    const previous = await snapshot(); assert.equal((await call('edit')).status, 404); assert.deepEqual(await snapshot(), previous);
});
for (const [label, mutate] of [
    ['routine owner', tx => tx.routine.update({ where: { id: 'a-routine' }, data: { userId: 'B' } })],
    ['day parent', tx => tx.routineDay.update({ where: { id: 'a-day' }, data: { routineId: 'b-routine' } })],
    ['exercise parent', tx => tx.exercise.update({ where: { id: 'a-ex' }, data: { routineDayId: 'b-day' } })]
]) {
    test(`locks the ${label} against a second connection between authorization and writing`, async () => {
        let attempted = false, blocked = false;
        instrument({ beforeOperation: async ({ model, operation }) => {
            if (attempted || model !== 'workoutLog' || operation !== 'create') return;
            attempted = true;
            try { await prisma.$transaction(async other => {
                await other.$executeRaw`SET LOCAL lock_timeout = '100ms'`; await mutate(other);
            }); } catch (error) { assert.match(error.message, /lock timeout/); blocked = true; }
        } });
        assert.equal((await call('create')).status, 201); assert.equal(blocked, true); await assertPR(90);
        assert.equal((await prisma.routine.findUnique({ where: { id: 'a-routine' } })).userId, 'A');
        assert.equal((await prisma.exercise.findUnique({ where: { id: 'a-ex' } })).routineDayId, 'a-day');
    });
}

test('two simultaneous edits replace serially: one complete result, no mixed series or duplicate PRs', async () => {
    await addLog('session'); await recalc();
    const results = await Promise.all([70, 90].map(w => request('/api/workouts/session', { sets: [set(w), set(w + 1)] }, 'PUT')));
    assert.ok(results.every(r => r.status === 200));
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 2);
    const weights = db.sets.sort((a, b) => a.setNumber - b.setNumber).map(s => s.weight);
    assert.ok(JSON.stringify(weights) === '[70,71]' || JSON.stringify(weights) === '[90,91]'); await assertPR(weights[1]);
});
test('two first-day shortcuts create one session with unique increasing set numbers', async () => {
    const results = await Promise.all([50, 90].map(weight => request('/api/shortcuts/log-set?date=2026-03-01', { exerciseId: 'a-ex', weight, reps: 10, rir: 1 })));
    assert.ok(results.every(r => r.status === 201));
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 2);
    assert.deepEqual(db.sets.map(s => s.setNumber).sort(), [1, 2]); await assertPR(90);
    assert.equal(db.logs[0].date.toISOString(), '2026-03-01T06:00:00.000Z');
});
test('shortcut and PWA edit of a partial session cannot interleave replacement and appended sets', async () => {
    await addLog('session', 'a-ex', [set()], new Date().toISOString()); await recalc();
    const results = await Promise.all([
        request('/api/workouts/session', { sets: [set(70), set(75)] }, 'PUT'),
        request('/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 90, reps: 10, rir: 2 })
    ]);
    assert.deepEqual(results.map(r => r.status), [200, 201]);
    const db = await snapshot(); assert.equal(db.logs.length, 1);
    const weights = db.sets.sort((a, b) => a.setNumber - b.setNumber).map(s => s.weight);
    assert.ok(JSON.stringify(weights) === '[70,75]' || JSON.stringify(weights) === '[70,75,90]');
    assert.equal(new Set(db.sets.map(s => s.setNumber)).size, db.sets.length); await assertPR(Math.max(...weights));
});
test('two concurrent workouts with case-equivalent names share one correct PR', async () => {
    const results = await Promise.all(['a-ex', 'a-ex2'].map((exerciseId, i) => request('/api/workouts/log', { exerciseId, sets: [set(60 + i * 40)] })));
    assert.ok(results.every(r => r.status === 201));
    const db = await snapshot(); assert.equal(db.logs.length, 2); assert.equal(db.sets.length, 2); await assertPR(100);
});
test('a PWA POST and first shortcut stay serially coherent without changing POST always-create semantics', async () => {
    const results = await Promise.all([
        request('/api/workouts/log', { exerciseId: 'a-ex', sets: [set(60)] }),
        request('/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 90, reps: 10, rir: 0 })
    ]);
    assert.ok(results.every(r => r.status === 201)); const db = await snapshot();
    assert.ok(db.logs.length === 1 || db.logs.length === 2); assert.equal(db.sets.length, 2); await assertPR(90);
});
test('concurrent deletion and editing never resurrect a deleted session or leave a phantom PR', async () => {
    await addLog('session'); await recalc();
    const results = await Promise.all([call('delete'), call('edit')]);
    assert.equal(results[0].status, 200); assert.ok([200, 404].includes(results[1].status));
    assert.deepEqual(await snapshot(), { logs: [], sets: [], prs: [] });
});
test('deletion of the winner racing a new workout leaves the PR supported by committed history', async () => {
    await addLog('session', 'a-ex', [set(100)]); await addLog('old', 'a-ex', [set(40)]); await recalc();
    const results = await Promise.all([call('delete'), request('/api/workouts/log', { exerciseId: 'a-ex2', sets: [set(80)] })]);
    assert.deepEqual(results.map(r => r.status), [200, 201]); const db = await snapshot();
    assert.equal(db.logs.length, 2); assert.equal(db.sets.length, 2); await assertPR(80);
});
test('another account can commit while the first account holds its workout lock', async () => {
    let tested = false;
    instrument({ beforeOperation: async ({ model, operation }) => {
        if (tested || model !== 'workoutLog' || operation !== 'create') return;
        tested = true;
        await withWorkoutTransaction(prisma, 'B', async tx => {
            await tx.workoutLog.create({ data: { exerciseId: 'b-ex', sets: { create: { ...set(110), setNumber: 1 } } } });
            await recalcPRForExercise(tx, 'Press', 'B');
        });
    } });
    assert.equal((await call('create')).status, 201); assert.equal(tested, true); await assertPR(90); await assertPR(110, 10, 'B');
});

test('SQLSTATE 40001 after all writes retries only aborted transactions, at most three attempts', async () => {
    const attempts = instrument({ afterBody: async (tx, n) => {
        if (n < 3) await tx.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION 'serialization test' USING ERRCODE = '40001'; END $$");
    } });
    assert.equal((await call('create')).status, 201); assert.equal(attempts(), 3);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); await assertPR(90);
});
test('exhausted SQLSTATE 40001 conflicts return 409 with complete rollback', async () => {
    await addLog('session'); await recalc(); const previous = await snapshot();
    const attempts = instrument({ afterBody: tx => tx.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION 'serialization test' USING ERRCODE = '40001'; END $$") });
    const result = await call('edit'); assert.equal(result.status, 409); assert.equal(result.body.code, 'WORKOUT_CONFLICT');
    assert.equal(result.body.outcome, 'not_committed'); assert.equal(attempts(), 3); assert.deepEqual(await snapshot(), previous);
});
test('a genuine competing PostgreSQL update produces Prisma P2034 and safely retries the aborted body', async () => {
    const log = await addLog('session'); await recalc(); let competed = false; const codes = [];
    const attempts = instrument({
        // Force the first conflict via a second real connection; after rollback
        // a ReadCommitted test attempt also proves this callback can be reused.
        transactionOptions: (options, attempt) => ({ ...options, isolationLevel: attempt === 1 ? 'Serializable' : 'ReadCommitted' }),
        beforeOperation: async ({ model, operation }) => {
            if (competed || model !== 'setLog' || operation !== 'update') return;
            competed = true;
            await prisma.setLog.update({ where: { id: log.sets[0].id }, data: { rpe: 9 } });
        },
        transaction: async run => { try { return await run(); } catch (error) { codes.push(error.code); throw error; } }
    });
    assert.equal((await call('fix')).status, 200); assert.deepEqual(codes, ['P2034']); assert.equal(attempts(), 2);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1);
    assert.equal(db.sets[0].rpe, 9); assert.equal(db.sets[0].weight, 90); await assertPR(90);
});
test('SQLSTATE 40P01 aborted deadlock is retried once and does not duplicate a shortcut set', async () => {
    const attempts = instrument({ afterBody: async (tx, n) => {
        if (n === 1) await tx.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION 'deadlock test' USING ERRCODE = '40P01'; END $$");
    } });
    assert.equal((await call('shortcut')).status, 201); assert.equal(attempts(), 2);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); await assertPR(90); assert.equal(secondaryCalls, 1);
});
test('a real lock timeout returns a controlled 409 without retrying or persisting partial work', async () => {
    let unlock, locked;
    const held = new Promise(resolve => { locked = resolve; }); const release = new Promise(resolve => { unlock = resolve; });
    const blocker = prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "User" WHERE id = 'A' FOR NO KEY UPDATE`; locked(); await release; }, { timeout: 10000 });
    await held;
    try {
        const previous = await snapshot(); const attempts = instrument(); const result = await call('create');
        assert.equal(result.status, 409); assert.equal(result.body.code, 'WORKOUT_CONFLICT'); assert.equal(attempts(), 1);
        assert.deepEqual(await snapshot(), previous);
    } finally { unlock(); await blocker; }
});
test('a known SQL failure after the body rolls back and returns 500 without retrying', async () => {
    const attempts = instrument({ afterBody: tx => tx.$queryRaw`SELECT 1 / 0` }); const previous = await snapshot();
    assert.equal((await call('create')).status, 500); assert.equal(attempts(), 1); assert.deepEqual(await snapshot(), previous);
});
test('lost commit acknowledgement returns outcome unknown, does not retry, and preserves the real committed data', async () => {
    const attempts = instrument({ transaction: async run => {
        await run(); const error = new Error('synthetic lost COMMIT acknowledgement'); error.code = 'P1017'; throw error;
    } });
    const result = await call('create'); assert.equal(result.status, 409); assert.equal(result.body.code, 'WORKOUT_OUTCOME_UNKNOWN');
    assert.equal(result.body.outcome, 'unknown'); assert.equal(attempts(), 1);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); await assertPR(90); assert.equal(secondaryCalls, 0);
});
test('uncertain commit failure can also represent rollback; no automatic replay guesses the outcome', async () => {
    let attempts = 0;
    handlerPrisma = { $transaction: async (callback, options) => {
        attempts++;
        try { await prisma.$transaction(async tx => {
            await callback(tx); throw Error('synthetic loss of connection before COMMIT');
        }, options); } catch {
            const error = new Error('synthetic missing transaction acknowledgement'); error.code = 'P1017'; throw error;
        }
    } };
    const previous = await snapshot(); const result = await call('create');
    assert.equal(result.status, 409); assert.equal(result.body.outcome, 'unknown'); assert.equal(attempts, 1);
    assert.deepEqual(await snapshot(), previous);
});

for (const kind of ['synchronous', 'asynchronous']) {
    test(`post-commit ${kind} reminder failure still returns 201 and leaves workout/PR committed`, async () => {
        secondary = kind === 'synchronous' ? () => { throw Error('secondary sync'); } : async () => { throw Error('secondary async'); };
        const result = await call('shortcut'); assert.equal(result.status, 201);
        await new Promise(resolve => setImmediate(resolve));
        const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); await assertPR(90);
        assert.equal(secondaryCalls, 1); assert.equal(errors.length, 1);
    });
}
test('secondary work observes committed data through a separate connection', async () => {
    let checked; const observed = new Promise(resolve => { checked = resolve; });
    secondary = async () => { const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.prs.length, 1); checked(); };
    assert.equal((await call('shortcut')).status, 201); await observed;
});

const mathematicalCases = [
    ['ordinary', [set(50, 10)]], ['one rep', [set(100, 1)]], ['two reps', [set(100, 2)]],
    ['36 reps', [set(50, 36)]], ['37 reps legacy guard', [set(50, 37)]], ['1000 reps legacy guard', [set(50, 1000)]],
    ['right limb stronger', [set(25, 8, { weightRight: 30, repsRight: 10 })]],
    ['left limb stronger', [set(40, 10, { weightRight: 20, repsRight: 12 })]],
    ['right weight only', [set(25, 8, { weightRight: 30 })]],
    ['right reps only', [set(25, 8, { repsRight: 12 })]],
    ['zero left with valid right', [set(0, 0, { weightRight: 30, repsRight: 10, completed: false })]],
    ['right zero is not fallback', [set(25, 8, { weightRight: 0, repsRight: 0 })]],
    ['incomplete historic set still considered', [set(40, 10, { completed: false })]],
    ['no positive work', [set(0, 0, { completed: false })]], ['ties within the session', [set(30, 10), set(40, 1)]]
];
for (const [label, sets] of mathematicalCases) {
    test(`PR unchanged before/after: ${label}`, async () => {
        const original = await addLog('session', 'a-uni', sets);
        // Run the frozen pre-phase implementation against exactly the same rows.
        await createLegacyWorkoutApp({ prisma }).recalcPRForExercise('Remo unilateral', 'A');
        const withoutId = record => Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'id'));
        const old = (await pr('A', 'remo unilateral')).map(withoutId);
        assert.equal((await request('/api/workouts/session', { sets }, 'PUT')).status, 200);
        const current = (await pr('A', 'remo unilateral')).map(withoutId);
        assert.deepEqual(current, old);
        const db = await prisma.workoutLog.findUnique({ where: { id: 'session' }, include: { sets: { orderBy: { setNumber: 'asc' } } } });
        assert.equal(db.date.getTime(), original.date.getTime());
        for (let i = 0; i < sets.length; i++) for (const key of ['weight', 'reps', 'rpe', 'completed', 'weightRight', 'repsRight']) {
            assert.equal(db.sets[i][key], original.sets[i][key]);
        }
    });
}
test('an exact tie between historical sessions preserves the oldest occurrence regardless of insertion order', async () => {
    await addLog('new', 'a-ex', [set(50)], '2026-02-01T12:00:00Z');
    await addLog('session', 'a-ex', [set(50)], '2026-01-01T12:00:00Z');
    await call('edit'); // 90 first, then restore tie through the real endpoint.
    assert.equal((await request('/api/workouts/session', { sets: [set(50)] }, 'PUT')).status, 200);
    const record = await assertPR(50); assert.equal(record.date.toISOString(), '2026-01-01T12:00:00.000Z');
    assert.equal(await prisma.workoutLog.count(), 2);
});
test('documented mathematical difference stays intact: PR drops to raw weight at >=37 while Smart Loading caps reps', async () => {
    await addLog('session', 'a-ex', [set(50, 37)]); await recalc();
    assert.equal((await assertPR(50, 37)).estimated1RM, 50); assert.ok(Math.abs(epley1RM(50, 37) - 110) < 1e-10);
    assert.equal((await prisma.setLog.findMany())[0].reps, 37);
});

test('shortcuts preserve RIR conversions, explicit dates, unilateral fields and next-exercise response', async () => {
    const body = { exerciseId: 'a-ex', weight: 25, reps: 8, rpe: 2, weightRight: 30, repsRight: 10 };
    const first = await request('/api/shortcuts/log-set?date=2026-04-05', body);
    const second = await request('/api/shortcuts/log-set?date=2026-04-05', { ...body, rir: 0 });
    assert.equal(first.status, 201); assert.equal(first.body.nextExerciseName, null); assert.equal(second.status, 201);
    assert.equal(second.body.setsLoggedToday, 2); assert.equal(second.body.targetSets, 2); assert.equal(second.body.nextExerciseName, 'PRESS');
    assert.equal(first.body.workoutLog.id, second.body.workoutLog.id);
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.logs[0].date.toISOString(), '2026-04-05T06:00:00.000Z');
    assert.deepEqual(db.sets.sort((a, b) => a.setNumber - b.setNumber).map(s => s.rpe), [8, 10]);
    assert.ok(db.sets.every(s => s.weightRight === 30 && s.repsRight === 10)); await assertPR(30);
});
test('shortcut without date preserves the real save timestamp within the CDMX day', async () => {
    const before = Date.now(); const result = await request('/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 50, reps: 10, rpe: 8 });
    assert.equal(result.status, 201); const date = new Date(result.body.workoutLog.date);
    assert.ok(date.getTime() >= before && date.getTime() <= Date.now()); assert.equal(mexicoCityDateStr(date), mexicoCityDateStr());
    const db = await snapshot(); assert.equal(db.logs[0].date.getTime(), date.getTime()); assert.equal(db.sets[0].rpe, 8); await assertPR(50);
});
test('shortcut appends above historical noncontiguous set numbers without renumbering old data', async () => {
    await addLog('session', 'a-ex', [set()], mexicoCityDayBounds(new Date()).start.toISOString());
    await prisma.setLog.updateMany({ where: { workoutLogId: 'session' }, data: { setNumber: 5 } });
    assert.equal((await request('/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 60, reps: 10 })).status, 201);
    const db = await snapshot(); assert.deepEqual(db.sets.map(s => s.setNumber).sort(), [5, 6]); await assertPR(60);
});
test('existing same-day sessions are retained; shortcut deterministically appends to the oldest', async () => {
    const start = mexicoCityDayBounds(new Date()).start.getTime();
    await addLog('old', 'a-ex', [set()], new Date(start + 1000).toISOString());
    await addLog('new', 'a-ex', [set(60)], new Date(start + 2000).toISOString());
    const result = await request('/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 70, reps: 10 }); assert.equal(result.status, 201);
    assert.equal(result.body.workoutLog.id, 'old'); const db = await snapshot(); assert.equal(db.logs.length, 2);
    assert.equal(db.sets.filter(s => s.workoutLogId === 'old').length, 2); await assertPR(70);
});
test('validation failures do not enter transactions or change persisted state', async () => {
    await addLog('session'); await recalc(); const previous = await snapshot(); const attempts = instrument();
    for (const [path, body, method] of [
        ['/api/workouts/log', { exerciseId: 'a-ex', sets: [set(-1)] }, 'POST'],
        ['/api/workouts/session', { sets: null }, 'PUT'],
        ['/api/workouts/session', { sets: [set(30, -1)] }, 'PUT'],
        ['/api/shortcuts/log-set', { exerciseId: 'a-ex', weight: 50, reps: 10, rir: 5 }, 'POST'],
        ['/api/workouts/fix-weights', { exerciseName: 'Press', oldWeight: 50, newWeight: 'Infinity' }, 'PUT']
    ]) assert.equal((await request(path, body, method)).status, 400);
    assert.equal(attempts(), 0); assert.deepEqual(await snapshot(), previous);
});

const graphSnapshot = async () => ({ ...await snapshot(),
    routines: await prisma.routine.findMany({ orderBy: { id: 'asc' } }),
    days: await prisma.routineDay.findMany({ orderBy: { id: 'asc' } }),
    exercises: await prisma.exercise.findMany({ orderBy: { id: 'asc' } })
});
async function aiDay() {
    await prisma.routine.update({ where: { id: 'a-routine' }, data: { source: 'ai' } });
    await prisma.routineDay.update({ where: { id: 'a-day' }, data: { dayName: mexicoCityDateStr() } });
    await prisma.exercise.updateMany({ where: { routineDayId: 'a-day' }, data: { muscleGroup: 'Pecho' } });
    await prisma.trainingProfile.create({ data: { userId: 'A', goal: 'hypertrophy', daysPerWeek: 3,
        equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'], experienceLevel: 'intermediate' } });
}
test('routine deletion archives all historical exercises without changing sessions, sets or PRs', async () => {
    await addLog('session'); await recalc(); const previous = await snapshot();
    const result = await request('/api/routines/a-routine', undefined, 'DELETE'); assert.equal(result.status, 200);
    assert.deepEqual(await snapshot(), previous); assert.equal(await prisma.routine.count({ where: { id: 'a-routine' } }), 0);
    const exercise = await prisma.exercise.findUnique({ where: { id: 'a-ex' }, include: { routineDay: { include: { routine: true } } } });
    assert.equal(exercise.routineDay.routine.name, 'ARCHIVED_HISTORY_DO_NOT_DELETE'); assert.equal(exercise.routineDay.routine.userId, 'A');
});
test('the unchanged Phase 1.1 editor cannot cascade a workout committed while its Serializable snapshot waited', async () => {
    let reached, release;
    const ready = new Promise(resolve => { reached = resolve; }); const gate = new Promise(resolve => { release = resolve; });
    let paused = false;
    instrument({ beforeOperation: async ({ model, operation }) => {
        if (paused || model !== 'personalRecord' || operation !== 'deleteMany') return;
        paused = true; reached(); await gate;
    } });
    const logging = request('/api/workouts/log', { exerciseId: 'a-ex2', sets: [set(90)] });
    await ready;
    const editing = request('/api/routines/a-routine', { name: 'Edited', days: [{ id: 'a-day', dayName: 'Lunes', exercises: [
        { id: 'a-ex', name: 'Press', targetSets: 2, targetReps: '8-12' },
        { id: 'a-uni', name: 'Remo unilateral', targetSets: 2, targetReps: '8-12' }
    ] }] }, 'PUT');
    let waiting = false;
    try {
        for (let i = 0; i < 100; i++) {
            const rows = await prisma.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
            if (rows.length) { waiting = true; break; }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    } finally { release(); }
    const results = await Promise.all([logging, editing]);
    assert.equal(waiting, true); assert.equal(results[0].status, 201); assert.ok([200, 409].includes(results[1].status));
    const db = await snapshot(); assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); await assertPR(90);
    assert.ok(await prisma.exercise.findUnique({ where: { id: 'a-ex2' } }));
});
test('deleting the archive itself cannot cascade historical workouts or leave phantom PRs', async () => {
    await prisma.routine.update({ where: { id: 'a-routine' }, data: { name: 'ARCHIVED_HISTORY_DO_NOT_DELETE' } });
    await addLog('session'); await recalc(); const previous = await graphSnapshot();
    const result = await request('/api/routines/a-routine', undefined, 'DELETE');
    assert.equal(result.status, 409); assert.equal(result.body.code, 'WORKOUT_HISTORY_CONFLICT');
    assert.deepEqual(await graphSnapshot(), previous);
});
test('routine deletion racing the first workout either archives the committed log or rejects creation before any write', async () => {
    const results = await Promise.all([request('/api/routines/a-routine', undefined, 'DELETE'), call('create')]);
    assert.equal(results[0].status, 200); assert.ok([201, 404].includes(results[1].status));
    const db = await snapshot();
    if (results[1].status === 201) {
        assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); await assertPR(90);
        const exercise = await prisma.exercise.findUnique({ where: { id: db.logs[0].exerciseId }, include: { routineDay: { include: { routine: true } } } });
        assert.equal(exercise.routineDay.routine.userId, 'A'); assert.equal(exercise.routineDay.routine.name, 'ARCHIVED_HISTORY_DO_NOT_DELETE');
    } else assert.deepEqual(db, { logs: [], sets: [], prs: [] });
});
test('routine deletion locks exercises before the history count even against a writer not using the new account lock', async () => {
    let attempted = false, blocked = false;
    instrument({ beforeOperation: async ({ model, operation, args }) => {
        if (attempted || model !== 'workoutLog' || operation !== 'findMany' || !args.distinct) return;
        attempted = true;
        try { await prisma.$transaction(async other => {
            await other.$executeRaw`SET LOCAL lock_timeout = '100ms'`;
            await other.workoutLog.create({ data: { exerciseId: 'a-ex', sets: { create: { ...set(), setNumber: 1 } } } });
        }); } catch (error) { assert.match(error.message, /lock timeout/); blocked = true; }
    } });
    assert.equal((await request('/api/routines/a-routine', undefined, 'DELETE')).status, 200);
    assert.equal(attempted, true); assert.equal(blocked, true); assert.deepEqual(await snapshot(), { logs: [], sets: [], prs: [] });
});
test('a failure after archiving but before routine deletion rolls back the complete graph and its history', async () => {
    await addLog('session'); await recalc(); const previous = await graphSnapshot();
    instrument({ beforeOperation: async ({ tx, model, operation }) => {
        if (model === 'routine' && operation === 'delete') await tx.$queryRaw`SELECT 1 / 0`;
    } });
    assert.equal((await request('/api/routines/a-routine', undefined, 'DELETE')).status, 500);
    assert.deepEqual(await graphSnapshot(), previous);
});
test('reshuffle keeps today logs, archives older history, and leaves PRs and unilateral sets intact', async () => {
    await aiDay(); await addLog('today', 'a-ex', [set(100)], new Date().toISOString());
    await addLog('old', 'a-uni', [set(25, 8, { weightRight: 30, repsRight: 10 })]); await recalc(); await recalc('Remo unilateral');
    const previous = await snapshot();
    const result = await request('/api/ai-routine/reshuffle/a-day', {}); assert.equal(result.status, 200);
    assert.deepEqual(await snapshot(), previous);
    assert.ok(result.body.day.exercises.some(e => e.id === 'a-ex'));
    assert.equal((await prisma.exercise.findUnique({ where: { id: 'a-ex' } })).routineDayId, 'a-day');
    assert.notEqual((await prisma.exercise.findUnique({ where: { id: 'a-uni' } })).routineDayId, 'a-day');
});
test('reshuffle failure after archiving and deletion rolls back every graph mutation', async () => {
    await aiDay(); await addLog('old', 'a-ex'); await recalc(); const previous = await graphSnapshot();
    instrument({ beforeOperation: async ({ tx, model, operation }) => {
        if (model === 'exercise' && operation === 'create') await tx.$queryRaw`SELECT 1 / 0`;
    } });
    assert.equal((await request('/api/ai-routine/reshuffle/a-day', {})).status, 500);
    assert.deepEqual(await graphSnapshot(), previous);
});
test('reshuffle racing a first workout never cascades a successfully committed training log', async () => {
    await aiDay();
    const results = await Promise.all([request('/api/ai-routine/reshuffle/a-day', {}), call('create')]);
    assert.equal(results[0].status, 200); assert.ok([201, 404].includes(results[1].status));
    const db = await snapshot();
    if (results[1].status === 201) { assert.equal(db.logs.length, 1); assert.equal(db.sets.length, 1); await assertPR(90); }
    else assert.deepEqual(db, { logs: [], sets: [], prs: [] });
});
test('indirect graph writers cannot modify another account or its training history', async () => {
    await addLog('foreign', 'b-ex'); await recalc('Press', 'B'); const previous = await graphSnapshot();
    assert.equal((await request('/api/routines/b-routine', undefined, 'DELETE')).status, 404);
    assert.equal((await request('/api/ai-routine/reshuffle/b-day', {})).status, 404);
    assert.deepEqual(await graphSnapshot(), previous);
});

test('production registration preserves authentication and routes every workout mutation through the new handlers', async () => {
    const source = await readBackendSource();
    for (const [method, path, handler] of [
        ['post', '/api/workouts/log', 'logWorkout'], ['put', '/api/workouts/:logId', 'updateWorkout'],
        ['delete', '/api/workouts/:logId', 'deleteWorkout'], ['post', '/api/shortcuts/log-set', 'logShortcutSet'],
        ['put', '/api/workouts/fix-weights', 'fixWeights']
    ]) assert.ok(source.includes(`app.${method}('${path}', authMiddleware, workoutHandlers.${handler});`));
    assert.ok(!source.includes('async function recalcPRForExercise('));
    assert.ok(!source.includes('prisma.setLog.update('));
    assert.ok(!source.includes('prisma.workoutLog.create('));
    assert.deepEqual(await snapshot(), { logs: [], sets: [], prs: [] });
});
