import { readBackendSource } from '../../scripts/lib/backend-source.mjs';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createImportRoutineHandler } from '../src/routes/importRoutine.js';
import { createUpdateRoutineHandler } from '../src/routes/updateRoutine.js';
import { deduplicateExercises } from '../src/services/exerciseAgent.js';
import { normalizeRoutineImport, normalizeImportedExercise } from '../src/services/routineImportContract.js';
import { pickDeterministicExercises, pickReplacementExercises } from '../src/data/splitTemplates.js';
import { chooseExercisesForDay } from '../src/services/aiRoutineAgent.js';
import { buildRoutineFormPayload, buildTemplateRoutinePayload } from '../../client/src/utils/routinePayload.js';
import { ROUTINE_TEMPLATES } from '../../client/src/data/routineTemplates.js';
import { EXERCISES } from '../../client/src/data/exercises.js';

// No dotenv and no supplied databases. Only the new cluster owned by our runner.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(process.env.NEXLIFT_IMPORT_TEST_PORT);
assert.equal(url.port, process.env.NEXLIFT_IMPORT_TEST_PORT);
assert.equal(url.pathname, '/nexlift_import_test');
assert.equal(url.username, 'nexlift_import_test');
assert.equal(process.env.OPENAI_API_KEY, '');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
let server, base, mode, dedupCalls, handlerPrisma;
const configuration = { targetSets: 4, targetReps: '4-6', restSeconds: 150,
    muscleGroup: 'Espalda', isUnilateral: true, note: 'Alternar lados; no cambiar', order: 7 };
const exercise = (extra = {}) => ({ name: 'Remo', ...configuration, ...extra });
const payload = (ex = exercise()) => ({ name: 'Fuerza', description: '', days: [
    { dayName: 'Domingo', weekday: 0, order: 4, splitLabel: 'Pull', exercises: [ex] },
    { dayName: 'Lunes', weekday: 1, order: 8, isRestDay: true, exercises: [] }
] });
const scalars = ex => Object.fromEntries(['name', 'targetSets', 'targetReps', 'restSeconds', 'muscleGroup', 'isUnilateral', 'note', 'order'].map(k => [k, ex[k]]));
const snapshot = async () => ({
    routines: await prisma.routine.findMany({ orderBy: { id: 'asc' } }),
    days: await prisma.routineDay.findMany({ orderBy: { id: 'asc' } }),
    exercises: await prisma.exercise.findMany({ orderBy: { id: 'asc' } }),
    logs: await prisma.workoutLog.findMany({ orderBy: { id: 'asc' } }),
    sets: await prisma.setLog.findMany({ orderBy: { id: 'asc' } })
});
const history = async () => { const { logs, sets } = await snapshot(); return { logs, sets }; };
async function request(body, { method = 'POST', id, user = 'A', raw } = {}) {
    const response = await fetch(`${base}/api/routines/${method === 'PUT' ? id : 'import'}`, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user}` },
        body: raw ?? JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
}
async function assertPersisted(result, expected) {
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const actual = await prisma.routine.findUnique({ where: { id: result.body.routine.id }, include: {
        days: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' } } } }
    } });
    assert.deepEqual(result.body.routine, JSON.parse(JSON.stringify(actual)), 'HTTP reports actual committed state');
    assert.equal(actual.userId, 'A'); assert.equal(actual.source, 'manual');
    const sorted = structuredClone(expected.days).sort((a, b) => a.order - b.order);
    actual.days.forEach((day, i) => {
        assert.equal(day.routineId, actual.id);
        for (const key of ['dayName', 'weekday', 'isRestDay', 'order', 'splitLabel']) assert.equal(day[key], sorted[i][key]);
        const exercises = sorted[i].exercises.sort((a, b) => a.order - b.order);
        assert.deepEqual(day.exercises.map(scalars), exercises.map(scalars));
        day.exercises.forEach(ex => assert.equal(ex.routineDayId, day.id));
    });
    return actual;
}

before(async () => {
    const sql = await readFile(new URL('./fixtures/routine-schema.sql', import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
    const app = express();
    app.use(express.json());
    // Synthetic principals. Actual routes in index.js retain authMiddleware.
    app.use((req, res, next) => { req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A'; next(); });
    const dedup = async (incoming, canonical) => {
        dedupCalls++;
        assert.ok(canonical.every(ex => ex.id !== 'b-ex'), 'no foreign catalog rows supplied to name resolution');
        if (mode === 'ai') return incoming.map((ex, index) => ({ index, matchedId: 'a-ex', cleanedName: null,
            targetSets: 99, restSeconds: 1, muscleGroup: 'Piernas', isUnilateral: false }));
        if (mode === 'foreign') return incoming.map((ex, index) => ({ index, matchedId: 'b-ex', cleanedName: '' }));
        if (mode === 'reversed') return incoming.map((ex, index) => ({ index, cleanedName: `nombre ${index}` })).reverse();
        return deduplicateExercises(incoming, canonical); // Real deterministic fallback, no API key.
    };
    app.post('/api/routines/import', (req, res) => createImportRoutineHandler({ prisma: handlerPrisma, deduplicateExercises: dedup })(req, res));
    app.put('/api/routines/:id', createUpdateRoutineHandler({ prisma, deduplicateExercises: dedup }));
    app.use((error, req, res, next) => { if (error.type === 'entity.parse.failed') res.status(400).json({ error: 'JSON inválido' }); else next(error); });
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });
beforeEach(async () => {
    mode = 'fallback'; dedupCalls = 0; handlerPrisma = prisma;
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Routine", "RoutineDay", "Exercise", "WorkoutLog", "SetLog" CASCADE');
    await prisma.$executeRaw`INSERT INTO "User" (id) VALUES ('A'), ('B')`;
    for (const user of ['A', 'B']) {
        const prefix = user.toLowerCase();
        await prisma.routine.create({ data: { id: `${prefix}-routine`, userId: user, name: `${user} history`, days: {
            create: { id: `${prefix}-day`, dayName: 'Histórico', exercises: { create: {
                id: `${prefix}-ex`, name: user === 'A' ? 'remo' : 'secreto B', targetSets: 2, targetReps: '10',
                muscleGroup: 'Pecho', restSeconds: 60, isUnilateral: false,
                workoutLogs: { create: { id: `${prefix}-log`, date: new Date('2026-10-01T05:59:59.123Z'),
                    sets: { create: { id: `${prefix}-set`, setNumber: 1, reps: 11, weight: 17.5, rpe: 0, repsRight: 9, weightRight: 15.25 } } } }
            } } }
        } } });
    }
});

test('confirmed regression: canonical 4 / 4-6 / 150 / Espalda survives HTTP and PostgreSQL exactly', async () => {
    const input = payload(); const previous = await snapshot();
    const expected = normalizeRoutineImport(input); expected.days[0].exercises[0].name = 'remo';
    const actual = await assertPersisted(await request(input), expected);
    assert.equal(actual.days[0].exercises[0].name, 'remo');
    assert.deepEqual(await history(), { logs: previous.logs, sets: previous.sets });
    assert.deepEqual(await prisma.exercise.findUnique({ where: { id: 'a-ex' } }), previous.exercises.find(ex => ex.id === 'a-ex'));
});
test('manual builder to HTTP to DB preserves zero rest, null rest, unilateral flags and intentional empty text', async () => {
    const input = buildRoutineFormPayload({ name: 'Manual', days: [{ dayName: 'Domingo', weekday: 0, exercises: [
        exercise({ restSeconds: 0, targetSets: '4', isUnilateral: false, note: '' }),
        exercise({ name: 'Jalón', restSeconds: null, muscleGroup: null, isUnilateral: true, note: null })
    ] }] });
    await assertPersisted(await request(input), normalizeRoutineImport({ ...input, days: [{ ...input.days[0], exercises: input.days[0].exercises.map(ex => ({ ...ex, name: ex.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') })) }] }));
});
test('legacy JSON aliases, numeric strings, muscle alias and day-name alias remain supported', async () => {
    const input = { name: 'Heredada', days: [{ name: 'Domingo', exercises: [{ name: 'Remo', sets: '4', reps: '4-6', rest: '150', muscle: 'back', isUnilateral: true }] }] };
    const expected = normalizeRoutineImport(input); expected.days[0].exercises[0].name = 'remo';
    await assertPersisted(await request(input), expected);
});
test('absent fields use documented defaults; nullable/zero values never invoke those defaults', async () => {
    const input = payload({ name: 'Remo' }); const expected = normalizeRoutineImport(input); expected.days[0].exercises[0].name = 'remo';
    await assertPersisted(await request(input), expected);
});
test('equivalent old and new aliases are accepted together', async () => {
    const result = await request(payload(exercise({ sets: '4', reps: '4–6', rest: 150, muscle: 'back' })));
    assert.equal(result.status, 201); assert.equal(result.body.routine.days[0].exercises[0].targetSets, 4);
});
for (const template of ROUTINE_TEMPLATES) test(`real frontend template ${template.id} persists every day and Exercise scalar`, async () => {
    const input = buildTemplateRoutinePayload(template, EXERCISES);
    const expected = normalizeRoutineImport(input);
    const canonical = await prisma.exercise.findMany({ where: { routineDay: { routine: { userId: 'A' } } } });
    const incoming = expected.days.flatMap(day => day.exercises);
    const verdicts = await deduplicateExercises(incoming, canonical);
    verdicts.forEach((v, i) => { incoming[i].name = canonical.find(ex => ex.id === v.matchedId)?.name ?? v.cleanedName; });
    await assertPersisted(await request(input), expected);
});
test('AI name verdict cannot overwrite muscle, prescription, flags, order or note', async () => {
    mode = 'ai'; const expected = normalizeRoutineImport(payload()); expected.days[0].exercises[0].name = 'remo';
    await assertPersisted(await request(payload()), expected);
});
test('unrecognized name matches cannot attach to or borrow names from another account', async () => {
    mode = 'foreign'; const expected = normalizeRoutineImport(payload()); expected.days[0].exercises[0].name = 'remo';
    await assertPersisted(await request(payload()), expected);
});
test('out-of-order AI verdict indices do not swap prescriptions or drop repeated exercises', async () => {
    mode = 'reversed'; const input = payload(); input.days[0].exercises = [exercise({ order: 3 }), exercise({ order: 1, targetSets: 6, restSeconds: 0 })];
    const expected = normalizeRoutineImport(input); expected.days[0].exercises.forEach((ex, i) => { ex.name = `nombre ${i}`; });
    await assertPersisted(await request(input), expected);
});
for (const [label, mutate, path] of [
    ['sets conflict', ex => { ex.sets = 3; }, 'targetSets'],
    ['reps conflict', ex => { ex.reps = '8-12'; }, 'targetReps'],
    ['rest conflict', ex => { ex.rest = 0; }, 'restSeconds'],
    ['muscle conflict', ex => { ex.muscle = 'legs'; }, 'muscleGroup'],
    ['null sets', ex => { ex.targetSets = null; }, 'targetSets'],
    ['fractional sets', ex => { ex.targetSets = '3.8'; }, 'targetSets'],
    ['descending reps', ex => { ex.targetReps = '12-4'; }, 'targetReps'],
    ['negative rest', ex => { ex.restSeconds = -1; }, 'restSeconds'],
    ['boolean string', ex => { ex.isUnilateral = 'false'; }, 'isUnilateral'],
    ['unknown muscle', ex => { ex.muscleGroup = 'unknown'; }, 'muscleGroup']
]) test(`${label}: HTTP 400 points to offending field before name lookup or any write`, async () => {
    const input = payload(); mutate(input.days[0].exercises[0]); const before = await snapshot();
    const result = await request(input); assert.equal(result.status, 400); assert.match(result.body.error, new RegExp(path));
    assert.equal(result.body.details[0].path, `days[0].exercises[0].${path}`);
    assert.equal(dedupCalls, 0); assert.deepEqual(await snapshot(), before);
});
test('validation of the final nested exercise prevents writing the otherwise valid first day', async () => {
    const input = payload(); input.days[1] = { dayName: 'D', exercises: [exercise({ targetSets: 0 })] };
    const before = await snapshot(); assert.equal((await request(input)).status, 400); assert.deepEqual(await snapshot(), before);
});
test('nested type errors, rest exercises, duplicate orders/IDs/weekdays and invalid Sunday fail atomically', async () => {
    for (const change of [
        p => { p.days[0] = null; }, p => { p.days[0].exercises = {}; }, p => { p.days[0].exercises = null; },
        p => { p.days[0].isRestDay = true; }, p => { p.days[1].weekday = 0; }, p => { p.days[0].weekday = 7; },
        p => { p.days[1].order = 4; }, p => { p.days[0].exercises.push(exercise()); },
        p => { p.days[0].id = 'dup'; p.days[1].id = 'dup'; }
    ]) {
        const input = payload(); change(input); const before = await snapshot();
        assert.equal((await request(input)).status, 400); assert.deepEqual(await snapshot(), before);
    }
});
test('numeric overflow through valid JSON becomes 400, malformed JSON becomes 400, neither writes', async () => {
    const before = await snapshot();
    assert.equal((await request(null, { raw: JSON.stringify(payload()).replace('"targetSets":4', '"targetSets":1e400') })).status, 400);
    assert.equal((await request(null, { raw: '{' })).status, 400); assert.deepEqual(await snapshot(), before);
});
test('foreign IDs and nested history are not mass assigned and cannot alter either existing account', async () => {
    const input = payload(exercise({ id: 'b-ex', routineDayId: 'b-day', workoutLogs: [{ id: 'b-log' }] }));
    input.userId = 'B'; input.isActive = true; input.source = 'ai'; input.days[0].id = 'b-day'; input.days[0].routineId = 'b-routine';
    const before = await snapshot(); const result = await request(input); assert.equal(result.status, 201);
    assert.equal(result.body.routine.userId, 'A'); assert.equal(result.body.routine.isActive, false);
    assert.notEqual(result.body.routine.days[0].id, 'b-day'); assert.notEqual(result.body.routine.days[0].exercises[0].id, 'b-ex');
    assert.deepEqual(await history(), { logs: before.logs, sets: before.sets });
    for (const ex of before.exercises) assert.deepEqual(await prisma.exercise.findUnique({ where: { id: ex.id } }), ex);
});
test('real SQL failure in a nested Exercise rolls back the Routine, both days and all exercises', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_import() RETURNS trigger AS $$ BEGIN IF NEW.name = 'boom' THEN RAISE EXCEPTION 'synthetic import failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_import BEFORE INSERT ON "Exercise" FOR EACH ROW EXECUTE FUNCTION reject_import()');
    try {
        const before = await snapshot(); const input = payload(); input.days[1] = { dayName: 'D', exercises: [{ name: 'boom' }] };
        assert.equal((await request(input)).status, 500); assert.deepEqual(await snapshot(), before);
    } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER fail_import ON "Exercise"');
        await prisma.$executeRawUnsafe('DROP FUNCTION reject_import()');
    }
});
test('transaction commit failure returns 500, never 201 or a partial routine', async () => {
    handlerPrisma = { exercise: prisma.exercise, $transaction: (callback, options) => prisma.$transaction(async tx => {
        await callback(tx); await tx.$queryRaw`SELECT 1 / 0`;
    }, options) };
    const before = await snapshot(); assert.equal((await request(payload())).status, 500); assert.deepEqual(await snapshot(), before);
});
test('import then editor roundtrip retains zero/null/muscles, all IDs, and preexisting history', async () => {
    const imported = await request(payload(exercise({ restSeconds: 0 })));
    assert.equal(imported.status, 201); const routine = imported.body.routine; const previous = await history();
    const input = buildRoutineFormPayload(routine);
    input.days[0].exercises[0].muscleGroup = 'Piernas'; input.days[0].exercises[0].restSeconds = null;
    const result = await request(input, { method: 'PUT', id: routine.id }); assert.equal(result.status, 200);
    assert.deepEqual(result.body.days.map(day => day.id), routine.days.map(day => day.id));
    assert.equal(result.body.days[0].exercises[0].id, routine.days[0].exercises[0].id);
    assert.equal(result.body.days[0].exercises[0].restSeconds, null); assert.equal(result.body.days[0].exercises[0].muscleGroup, 'Piernas');
    assert.deepEqual(await history(), previous);
});
for (const branch of ['same-name history', 'rename history new', 'rename history archived', 'new archived', 'new fresh', 'rename no history']) {
    test(`editor persistence branch '${branch}' preserves every configuration scalar and history`, async () => {
        const previous = await history();
        const useArchive = branch.includes('archived');
        if (useArchive) await prisma.routine.create({ data: { id: 'archive', name: 'ARCHIVED_HISTORY_DO_NOT_DELETE', userId: 'A', days: {
            create: { id: 'bin', dayName: 'Bin', exercises: { create: { id: 'archived-ex', name: 'nuevo', targetSets: 2, targetReps: '10', muscleGroup: 'Core' } } }
        } } });
        if (branch === 'rename no history') await prisma.exercise.create({ data: { id: 'no-history', routineDayId: 'a-day', name: 'sin historial', targetSets: 2, targetReps: '10' } });
        const name = branch === 'same-name history' ? 'remo' : 'nuevo';
        const id = branch.startsWith('new ') ? undefined : branch === 'rename no history' ? 'no-history' : 'a-ex';
        const desired = exercise({ name, id, order: 5, restSeconds: 0, muscleGroup: 'Piernas', isUnilateral: false, note: '' });
        const result = await request({ name: 'Editada', days: [{ id: 'a-day', dayName: 'Domingo', weekday: 0, order: 8, splitLabel: 'Pull', exercises: [desired] }] },
            { method: 'PUT', id: 'a-routine' });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const actual = result.body.days[0].exercises[0];
        assert.deepEqual(scalars(actual), scalars(desired));
        assert.equal(result.body.days[0].order, 8); assert.equal(result.body.days[0].splitLabel, 'Pull');
        if (useArchive) assert.equal(actual.id, 'archived-ex');
        if (branch === 'same-name history' || branch === 'rename no history') assert.equal(actual.id, id);
        assert.deepEqual(await history(), previous);
    });
}
test('malformed edits fail before archiving/deleting omitted historical exercises', async () => {
    const previous = await snapshot();
    const result = await request({ name: 'Editada', days: [{ id: 'a-day', dayName: 'Domingo', exercises: [exercise({ targetSets: 0 })] }] }, { method: 'PUT', id: 'a-routine' });
    assert.equal(result.status, 400); assert.deepEqual(await snapshot(), previous);
});
test('legacy sparse edits preserve omitted optional configuration and split labels', async () => {
    await prisma.exercise.update({ where: { id: 'a-ex' }, data: { ...configuration, restSeconds: 0, note: 'retain' } });
    await prisma.routineDay.update({ where: { id: 'a-day' }, data: { splitLabel: 'Pull' } });
    const previous = await history();
    const result = await request({ name: 'R', days: [{ id: 'a-day', dayName: 'D', exercises: [{ id: 'a-ex', name: 'remo', targetSets: 4, targetReps: '4-6' }] }] }, { method: 'PUT', id: 'a-routine' });
    assert.equal(result.status, 200);
    assert.equal(result.body.days[0].splitLabel, 'Pull');
    assert.equal(result.body.days[0].exercises[0].muscleGroup, 'Espalda');
    assert.equal(result.body.days[0].exercises[0].restSeconds, 0);
    assert.equal(result.body.days[0].exercises[0].isUnilateral, true);
    assert.equal(result.body.days[0].exercises[0].note, 'retain');
    assert.deepEqual(await history(), previous);
});
test('all three deterministic AI prescriptions pass the same persistence boundary without training changes', async () => {
    for (const goal of ['strength', 'hypertrophy', 'general']) {
        const profile = { goal, daysPerWeek: 3, equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] };
        const fallback = () => pickDeterministicExercises('Full Body A', profile);
        const chosen = await chooseExercisesForDay({ profile, splitLabel: 'Full Body A', fallback });
        assert.deepEqual(chosen, fallback());
        const normalized = chosen.map((ex, i) => normalizeImportedExercise(ex, i));
        const actual = await prisma.routineDay.create({ data: { dayName: `2026-10-${goal}`, splitLabel: 'Full Body A', routineId: 'a-routine',
            exercises: { create: normalized } }, include: { exercises: { orderBy: { order: 'asc' } } } });
        assert.deepEqual(actual.exercises.map(scalars), normalized.map(scalars));
        const replacements = pickReplacementExercises(profile, chosen, chosen.map(ex => ex.name));
        const normalizedReplacements = replacements.map((ex, i) => normalizeImportedExercise(ex, i));
        const replacementDay = await prisma.routineDay.create({ data: { dayName: `reshuffle-${goal}`, routineId: 'a-routine',
            exercises: { create: normalizedReplacements } }, include: { exercises: { orderBy: { order: 'asc' } } } });
        assert.deepEqual(replacementDay.exercises.map(scalars), normalizedReplacements.map(scalars));
    }
});
test('production wiring keeps authentication and the centralized import, edit and AI boundaries', async () => {
    const source = await readBackendSource();
    assert.ok(source.includes("app.post('/api/routines/import', authMiddleware, createImportRoutineHandler({ prisma, deduplicateExercises }))"));
    assert.ok(source.includes("app.put('/api/routines/:id', authMiddleware, createUpdateRoutineHandler({ prisma, deduplicateExercises }))"));
    assert.ok(source.includes('normalizeImportedExercise(ex, i, `ai.exercises[${i}]`)'));
    assert.ok(source.includes('normalizeImportedExercise(ex, toKeep.length + i, `ai.reshuffle[${i}]`)'));
});
