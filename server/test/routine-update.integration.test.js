import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createUpdateRoutineHandler } from '../src/routes/updateRoutine.js';

// Fail closed if someone invokes this suite without the disposable-cluster runner.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.NEXLIFT_ISOLATED_TEST_PORT);
assert.equal(url.pathname, '/nexlift_routine_test');
assert.equal(url.username, 'nexlift_test');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
let server;
let base;
let dedupHook;
let handlerPrisma = prisma;
const clone = value => structuredClone(value);
const dedup = async (incoming, canonical) => {
    if (dedupHook) await dedupHook();
    return incoming.map((ex, index) => ({
        index, matchedId: canonical.find(c => c.name === ex.name)?.id || null,
        cleanedName: ex.name.toLowerCase()
    }));
};

before(async () => {
    const sql = await readFile(new URL('./fixtures/routine-schema.sql', import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
        await prisma.$executeRawUnsafe(statement);
    }
    const app = express();
    app.use(express.json());
    // Authentication is an explicit test fixture; production still uses authMiddleware.
    app.put('/api/routines/:id', (req, res, next) => {
        req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A';
        next();
    }, (req, res) => createUpdateRoutineHandler({ prisma: handlerPrisma, deduplicateExercises: dedup })(req, res));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
});

const exercise = (id, name = 'press', extra = {}) => ({ id, name, targetSets: 3, targetReps: '8-12', restSeconds: 90, ...extra });
const day = (id, exercises = [], extra = {}) => ({ id, dayName: 'Push', weekday: null, exercises, ...extra });
const valid = () => ({ name: 'Edited', description: 'Description', days: [
    day('a1', [exercise('ae1'), exercise('ae2', 'remo')]), day('a2', [exercise('ae3', 'sentadilla')])
] });
const put = async (body, id = 'ra', user = 'A') => {
    const response = await fetch(`${base}/api/routines/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user}` }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
};
const snapshot = async () => ({
    routines: await prisma.routine.findMany({ orderBy: { id: 'asc' } }),
    days: await prisma.routineDay.findMany({ orderBy: { id: 'asc' } }),
    exercises: await prisma.exercise.findMany({ orderBy: { id: 'asc' } }),
    logs: await prisma.workoutLog.findMany({ orderBy: { id: 'asc' } }),
    sets: await prisma.setLog.findMany({ orderBy: { id: 'asc' } })
});
const history = async () => {
    const { logs, sets } = await snapshot();
    return { logs, sets };
};
const unchangedRejection = async (body, status = 400, id = 'ra') => {
    const previous = await snapshot();
    const result = await put(body, id);
    assert.equal(result.status, status);
    assert.deepEqual(await snapshot(), previous, 'rejection must leave every row, ID and timestamp unchanged');
    return result;
};

beforeEach(async () => {
    dedupHook = null;
    handlerPrisma = prisma;
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Routine", "RoutineDay", "Exercise", "WorkoutLog", "SetLog" CASCADE');
    await prisma.$executeRaw`INSERT INTO "User" (id) VALUES ('A'), ('B')`;
    for (const [id, userId, days] of [
        ['ra', 'A', [['a1', ['ae1', 'ae2']], ['a2', ['ae3']]]],
        ['ra-other', 'A', [['ao1', ['aoe1']]]],
        ['rb', 'B', [['b1', ['be1']]]]
    ]) {
        await prisma.routine.create({ data: { id, userId, name: id, days: { create: days.map(([dayId, ids], order) => ({
            id: dayId, dayName: 'Push', order, exercises: { create: ids.map((exId, index) => ({
                ...exercise(exId, exId === 'ae2' ? 'remo' : exId === 'ae3' ? 'sentadilla' : 'press'), order: index
            })) }
        })) } } });
    }
    for (const id of ['ae1', 'ae3', 'be1', 'aoe1']) {
        await prisma.workoutLog.create({ data: {
            id: `log-${id}`, exerciseId: id, date: new Date('2026-10-01T18:00:00Z'), notes: 'original',
            sets: { create: { id: `set-${id}`, setNumber: 1, weight: 42.5, reps: 8, rpe: 8, weightRight: 40, repsRight: 7 } }
        } });
    }
});

test('rejects a routine belonging to B without disclosing its contents', async () => {
    const result = await unchangedRejection(valid(), 404, 'rb');
    assert.deepEqual(result.body, { error: 'Routine not found' });
});
test('rejects a day belonging to B before archiving omitted legitimate days', async () => {
    await unchangedRejection({ ...valid(), days: [day('b1', [])] });
});
test('rejects an exercise belonging to B', async () => {
    const body = valid(); body.days[0].exercises.push(exercise('be1'));
    await unchangedRejection(body);
});
test('rejects a day from another routine of A', async () => {
    const body = valid(); body.days.push(day('ao1', []));
    await unchangedRejection(body);
});
test('rejects an exercise from another routine of A', async () => {
    const body = valid(); body.days[0].exercises.push(exercise('aoe1'));
    await unchangedRejection(body);
});
test('rejects mixed legitimate, new and foreign references without partial writes', async () => {
    const body = valid(); body.days.push(day(undefined, [exercise(undefined, 'new movement'), exercise('be1')]));
    await unchangedRejection(body);
});
test('rejects duplicate day IDs', async () => {
    const body = valid(); body.days.push(clone(body.days[0]));
    await unchangedRejection(body);
});
test('rejects duplicate exercise IDs within one day', async () => {
    const body = valid(); body.days[0].exercises.push(clone(body.days[0].exercises[0]));
    await unchangedRejection(body);
});
test('rejects duplicate exercise IDs across days', async () => {
    const body = valid(); body.days[1].exercises.push(clone(body.days[0].exercises[0]));
    await unchangedRejection(body);
});
test('rejects a rename attempting to archive a foreign exercise', async () => {
    await unchangedRejection({ ...valid(), days: [day('a1', [exercise('be1', 'other movement')])] });
});
test('rejects a same-routine exercise assigned to a different day (not a UI operation)', async () => {
    const body = valid(); body.days[0].exercises.push(body.days[1].exercises.pop());
    await unchangedRejection(body);
});
test('unknown IDs cannot be supplied as IDs for new resources', async () => {
    const body = valid(); body.days.push(day('client-created-id', []));
    await unchangedRejection(body);
    const other = valid(); other.days[0].exercises.push(exercise('client-created-exercise'));
    await unchangedRejection(other);
});
test('legitimate edits preserve existing IDs, workout logs and every set field', async () => {
    const previous = await history();
    const body = valid();
    body.days[0].dayName = 'Updated day'; body.days[0].weekday = 2;
    Object.assign(body.days[0].exercises[0], { targetSets: 4, targetReps: '4-6', restSeconds: 150, note: 'updated', isUnilateral: true });
    const result = await put(body);
    assert.equal(result.status, 200);
    assert.equal(result.body.name, body.name); assert.equal(result.body.description, body.description);
    assert.equal(result.body.days[0].id, 'a1'); assert.equal(result.body.days[0].weekday, 2);
    assert.equal(result.body.days[0].exercises[0].id, 'ae1');
    assert.equal(result.body.days[0].exercises[0].targetSets, 4);
    assert.equal(result.body.days[0].exercises[0].targetReps, '4-6');
    assert.equal(result.body.days[0].exercises[0].restSeconds, 150);
    assert.deepEqual(await history(), previous);
});
test('reorders days and exercises while retaining their original IDs', async () => {
    const previous = await history(); const body = valid();
    body.days[0].exercises.reverse(); body.days.reverse();
    const result = await put(body);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.days.map(d => d.id), ['a2', 'a1']);
    assert.deepEqual(result.body.days[1].exercises.map(e => e.id), ['ae2', 'ae1']);
    assert.deepEqual(await history(), previous);
});
test('adds new days/exercises with server-generated IDs', async () => {
    const previous = await history(); const body = valid();
    body.days.push(day(undefined, [exercise(undefined, 'new movement')]));
    const result = await put(body); assert.equal(result.status, 200);
    assert.ok(result.body.days[2].id); assert.ok(result.body.days[2].exercises[0].id);
    assert.deepEqual(await history(), previous);
});
test('omitting exercises archives those with history and deletes only those without it', async () => {
    const previous = await history(); const body = valid(); body.days[0].exercises = [];
    assert.equal((await put(body)).status, 200);
    assert.equal(await prisma.exercise.findUnique({ where: { id: 'ae2' } }), null);
    const archived = await prisma.exercise.findUnique({ where: { id: 'ae1' }, include: { routineDay: { include: { routine: true } } } });
    assert.equal(archived.routineDay.routine.userId, 'A');
    assert.equal(archived.routineDay.routine.name, 'ARCHIVED_HISTORY_DO_NOT_DELETE');
    assert.deepEqual(await history(), previous);
});
test('omitting a day archives its history before deleting the day', async () => {
    const previous = await history(); const body = valid(); body.days.pop();
    assert.equal((await put(body)).status, 200);
    assert.equal(await prisma.routineDay.findUnique({ where: { id: 'a2' } }), null);
    assert.ok(await prisma.exercise.findUnique({ where: { id: 'ae3' } }));
    assert.deepEqual(await history(), previous);
});
test('rename with history archives the original and creates a separate exercise', async () => {
    const previous = await history(); const body = valid(); body.days[0].exercises[0].name = 'different movement';
    const result = await put(body); assert.equal(result.status, 200);
    assert.notEqual(result.body.days[0].exercises[0].id, 'ae1');
    assert.equal((await prisma.exercise.findUnique({ where: { id: 'ae1' } })).name, 'press');
    assert.deepEqual(await history(), previous);
});
test('restores an archived exercise by name with original ID and history', async () => {
    const previous = await history(); const body = valid(); body.days[0].exercises.shift();
    assert.equal((await put(body)).status, 200);
    body.days[0].exercises.unshift(exercise(undefined));
    const result = await put(body); assert.equal(result.status, 200);
    assert.equal(result.body.days[0].exercises[0].id, 'ae1');
    assert.deepEqual(await history(), previous);
});
test('archived IDs cannot be used directly to bypass routine membership', async () => {
    const body = valid(); body.days[0].exercises.shift();
    assert.equal((await put(body)).status, 200);
    body.days[0].exercises.unshift(exercise('ae1'));
    await unchangedRejection(body);
});

test('missing and foreign references return the same generic error', async () => {
    const missing = valid(); missing.days[0].exercises.push(exercise('missing'));
    const foreign = valid(); foreign.days[0].exercises.push(exercise('be1'));
    assert.deepEqual((await unchangedRejection(missing)).body, (await unchangedRejection(foreign)).body);
});

for (const invalidId of ['', 0, false, {}, []]) {
    test(`rejects malformed IDs (${JSON.stringify(invalidId)}) instead of treating them as new`, async () => {
        const body = valid(); body.days.push(day(invalidId)); await unchangedRejection(body);
        const other = valid(); other.days[0].exercises.push(exercise(invalidId)); await unchangedRejection(other);
    });
}
test('rejects malformed day/exercise collections without writes', async () => {
    for (const days of [null, {}, [null], [day('a1', {})], [day('a1', [null])]]) {
        await unchangedRejection({ ...valid(), days });
    }
});
test('a new day cannot claim an existing exercise ID', async () => {
    const body = valid(); body.days.push(day(undefined, [exercise('ae1')])); await unchangedRejection(body);
});
test('explicit null IDs still create new resources', async () => {
    const body = valid(); body.days.push(day(null, [exercise(null, 'new movement')]));
    const result = await put(body); assert.equal(result.status, 200);
    assert.ok(result.body.days[2].id); assert.ok(result.body.days[2].exercises[0].id);
});
test('omitting the exercise array leaves that day exercises unchanged', async () => {
    const previous = await history(); const body = valid(); delete body.days[0].exercises;
    const result = await put(body); assert.equal(result.status, 200);
    assert.deepEqual(result.body.days[0].exercises.map(e => e.id), ['ae1', 'ae2']);
    assert.deepEqual(await history(), previous);
});
test('renaming an exercise without history retains its original ID', async () => {
    const previous = await history(); const body = valid(); body.days[0].exercises[1].name = 'new movement';
    const result = await put(body); assert.equal(result.status, 200);
    assert.equal(result.body.days[0].exercises[1].id, 'ae2');
    assert.deepEqual(await history(), previous);
});
test('rename with history can restore another archived exercise without rewriting either history', async () => {
    const previous = await history(); const body = valid(); body.days.pop();
    assert.equal((await put(body)).status, 200); // Archive ae3.
    body.days[0].exercises[0].name = 'sentadilla';
    const result = await put(body); assert.equal(result.status, 200);
    assert.equal(result.body.days[0].exercises[0].id, 'ae3');
    assert.deepEqual(await history(), previous);
});
test('restoration by name never reuses an exercise belonging to B', async () => {
    const previous = await history();
    await prisma.routine.create({ data: { id: 'b-bin', userId: 'B', name: 'ARCHIVED_HISTORY_DO_NOT_DELETE', days: { create: { id: 'b-bin-day', dayName: 'Bin' } } } });
    await prisma.exercise.update({ where: { id: 'be1' }, data: { routineDayId: 'b-bin-day', name: 'foreign archived movement' } });
    const foreignBefore = await prisma.exercise.findUnique({ where: { id: 'be1' } });
    const body = valid(); body.days[0].exercises.push(exercise(undefined, 'foreign archived movement'));
    const result = await put(body); assert.equal(result.status, 200);
    assert.notEqual(result.body.days[0].exercises[2].id, 'be1');
    assert.deepEqual(await prisma.exercise.findUnique({ where: { id: 'be1' } }), foreignBefore);
    assert.deepEqual(await history(), previous);
});
test('rechecks routine ownership after external dedup and before any writes', async () => {
    let expected;
    dedupHook = async () => {
        await prisma.routine.update({ where: { id: 'ra' }, data: { userId: 'B' } });
        expected = await snapshot();
    };
    const body = valid(); body.days[0].exercises.push(exercise(undefined, 'new movement'));
    assert.equal((await put(body)).status, 404);
    assert.deepEqual(await snapshot(), expected);
});
test('rechecks day membership after external dedup', async () => {
    let expected;
    dedupHook = async () => {
        await prisma.routineDay.update({ where: { id: 'a2' }, data: { routineId: 'rb' } });
        expected = await snapshot();
    };
    const body = valid(); body.days[0].exercises.push(exercise(undefined, 'new movement'));
    assert.equal((await put(body)).status, 400);
    assert.deepEqual(await snapshot(), expected);
});
test('rechecks exercise membership after external dedup', async () => {
    let expected;
    dedupHook = async () => {
        await prisma.exercise.update({ where: { id: 'ae1' }, data: { routineDayId: 'b1' } });
        expected = await snapshot();
    };
    const body = valid(); body.days[0].exercises.push(exercise(undefined, 'new movement'));
    assert.equal((await put(body)).status, 400);
    assert.deepEqual(await snapshot(), expected);
});
test('stale dedup catalog cannot restore an archived exercise transferred to B', async () => {
    const previous = await history(); const body = valid(); body.days[0].exercises.shift();
    assert.equal((await put(body)).status, 200);
    dedupHook = async () => {
        await prisma.exercise.update({ where: { id: 'ae1' }, data: { routineDayId: 'b1' } });
    };
    body.days[0].exercises.unshift(exercise(undefined));
    const result = await put(body); assert.equal(result.status, 200);
    assert.notEqual(result.body.days[0].exercises[0].id, 'ae1');
    assert.equal((await prisma.exercise.findUnique({ where: { id: 'ae1' } })).routineDayId, 'b1');
    assert.deepEqual(await history(), previous);
});

// Instrument only the first write boundary. Every read, lock and write still
// executes through real Prisma/PostgreSQL; no in-memory database substitutes.
const beforeFirstWrite = hook => {
    handlerPrisma = {
        routine: prisma.routine, exercise: prisma.exercise,
        $transaction: (callback, options) => prisma.$transaction(async tx => {
            let called = false;
            const instrumentedRoutine = new Proxy(tx.routine, { get(target, key) {
                if (key !== 'update') return target[key];
                return async args => {
                    if (!called) { called = true; await hook(); }
                    return target.update(args);
                };
            } });
            return callback(new Proxy(tx, { get: (target, key) => key === 'routine' ? instrumentedRoutine : target[key] }));
        }, options)
    };
};

for (const [resource, mutate] of [
    ['routine owner', other => other.routine.update({ where: { id: 'ra' }, data: { userId: 'B' } })],
    ['day parent', other => other.routineDay.update({ where: { id: 'a1' }, data: { routineId: 'rb' } })],
    ['exercise parent', other => other.exercise.update({ where: { id: 'ae1' }, data: { routineDayId: 'b1' } })]
]) {
    test(`locks ${resource} between validation and write against a concurrent connection`, async () => {
        const previous = await history(); let blocked = false;
        beforeFirstWrite(async () => {
            try {
                await prisma.$transaction(async other => {
                    await other.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
                    await mutate(other);
                });
            } catch (error) {
                assert.match(error.message, /lock timeout/); blocked = true;
            }
        });
        const result = await put(valid()); assert.equal(result.status, 200);
        assert.equal(blocked, true, 'concurrent reparenting must not pass the locked authorization check');
        assert.deepEqual(await history(), previous);
    });
}

test('locks exercises so a new historical log cannot slip between count and delete', async () => {
    const previous = await history(); let blocked = false;
    beforeFirstWrite(async () => {
        try {
            await prisma.$transaction(async other => {
                await other.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
                await other.workoutLog.create({ data: { id: 'concurrent-log', exerciseId: 'ae2' } });
            });
        } catch (error) { assert.match(error.message, /lock timeout/); blocked = true; }
    });
    const body = valid(); body.days[0].exercises.pop();
    assert.equal((await put(body)).status, 200); assert.equal(blocked, true);
    assert.deepEqual(await history(), previous);
});

test('an error after writes and archiving rolls back all rows and historical relations', async () => {
    const body = valid(); body.days.pop(); // This day is archived before the later failure.
    handlerPrisma = {
        routine: prisma.routine, exercise: prisma.exercise,
        $transaction: (callback, options) => prisma.$transaction(async tx => {
            await callback(tx);
            await tx.$queryRaw`SELECT 1 / 0`; // Real DB error after every mutation, before commit.
        }, options)
    };
    await unchangedRejection(body, 500);
});

test('a PostgreSQL serialization conflict returns 409 and rolls back the transaction', async () => {
    // Trigger a genuine SQLSTATE 40001 at the first write, not a fabricated ORM error.
    beforeFirstWrite(async () => {});
    const original = handlerPrisma.$transaction;
    handlerPrisma.$transaction = (callback, options) => original(async tx => {
        await callback(tx);
        await tx.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION 'test serialization conflict' USING ERRCODE = '40001'; END $$");
    }, options);
    await unchangedRejection(valid(), 409);
});

test('validates all references before reaching the first write', async () => {
    beforeFirstWrite(() => assert.fail('invalid references reached the write phase'));
    const body = valid(); body.days.push(day('b1'));
    await unchangedRejection(body);
});
test('payload parent/user fields cannot transfer legitimate resources to another account', async () => {
    const previous = await history(); const body = valid();
    body.userId = 'B'; body.days[0].routineId = 'rb';
    body.days[0].exercises[0].routineDayId = 'b1';
    const result = await put(body); assert.equal(result.status, 200);
    assert.equal(result.body.userId, 'A'); assert.equal(result.body.days[0].routineId, 'ra');
    assert.equal(result.body.days[0].exercises[0].routineDayId, 'a1');
    assert.deepEqual(await history(), previous);
});
test('archiving into the edited routine itself is rejected and cannot cascade history', async () => {
    const body = valid(); body.days[0].exercises.shift();
    assert.equal((await put(body)).status, 200);
    const bin = await prisma.routine.findFirst({ where: { userId: 'A', name: 'ARCHIVED_HISTORY_DO_NOT_DELETE' }, include: { days: true } });
    await unchangedRejection({ name: bin.name, days: [] }, 400, bin.id);
});
test('the archive marker cannot redirect omitted-day history back into a deleted day', async () => {
    const body = valid(); body.name = 'ARCHIVED_HISTORY_DO_NOT_DELETE'; body.days = [];
    await unchangedRejection(body);
});

test('a real competing writer produces 409 without partially applying the rejected request', async () => {
    const previous = await snapshot();
    let release;
    let signal;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { signal = resolve; });
    const competing = prisma.$transaction(async other => {
        const row = await other.routine.update({ where: { id: 'ra' }, data: { name: 'Concurrent edit' } });
        signal();
        await gate;
        return row;
    }, { timeout: 10000 });
    await entered;
    const request = put(valid());
    let waiting = false;
    try {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
            const locks = await prisma.$queryRaw`
                SELECT pid FROM pg_stat_activity WHERE datname = current_database()
                    AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
                    AND query LIKE '%FOR UPDATE%'
            `;
            if (locks.length) { waiting = true; break; }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    } finally {
        release();
    }
    const row = await competing;
    const result = await request;
    assert.equal(waiting, true, 'the endpoint must wait on the competing database writer');
    assert.equal(result.status, 409);
    previous.routines = previous.routines.map(routine => routine.id === 'ra' ? row : routine);
    assert.deepEqual(await snapshot(), previous, 'only the competing write may persist');
});
