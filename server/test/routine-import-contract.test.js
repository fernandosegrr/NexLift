import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoutineImport, normalizeImportedExercise, RoutineValidationError } from '../src/services/routineImportContract.js';
import { MUSCLE_GROUPS } from '../../client/src/data/exercises.js';
import { EXERCISE_CATALOG } from '../src/data/exerciseCatalog.js';

const ex = extra => ({ name: 'Remo', ...extra });
const routine = extra => ({ name: 'Fuerza', days: [{ dayName: 'Domingo', exercises: [ex(extra)] }] });
const rejected = (input, path) => assert.throws(() => normalizeRoutineImport(input), err => {
    assert.ok(err instanceof RoutineValidationError); assert.equal(err.status, 400);
    assert.ok(err.details[0].path.includes(path), err.message); return true;
});

test('canonical and legacy prescriptions normalize identically without mutating either input', () => {
    const a = routine({ targetSets: 4, targetReps: '4-6', restSeconds: 150, muscleGroup: 'Espalda', isUnilateral: true, note: '' });
    const b = routine({ sets: '4', reps: '4–6', rest: '150', muscle: 'back', isUnilateral: true, note: '' });
    const before = structuredClone([a, b]);
    assert.deepEqual(normalizeRoutineImport(a), normalizeRoutineImport(b));
    assert.deepEqual([a, b], before);
});
test('equivalent aliases compare normalized values, including numeric reps and null rest', () => {
    const output = normalizeRoutineImport(routine({ targetSets: 4, sets: '04', targetReps: '6', reps: 6,
        restSeconds: null, rest: null, muscleGroup: 'Piernas', muscle: 'legs' }));
    assert.equal(output.days[0].exercises[0].targetSets, 4);
});
test('defaults apply only to absent/undefined values; null, zero and empty notes remain distinct', () => {
    const defaults = normalizeImportedExercise(ex({ targetSets: undefined }));
    assert.deepEqual(defaults, { name: 'Remo', targetSets: 3, targetReps: '8-12', restSeconds: null,
        muscleGroup: null, isUnilateral: false, note: null, order: 0 });
    assert.equal(normalizeImportedExercise(ex({ restSeconds: 0, note: '' })).restSeconds, 0);
    assert.equal(normalizeImportedExercise(ex({ note: '' })).note, '');
});
for (const [canonical, legacy, a, b] of [
    ['targetSets', 'sets', 4, 3], ['targetReps', 'reps', '4-6', '8-12'],
    ['restSeconds', 'rest', 0, null], ['muscleGroup', 'muscle', 'Espalda', 'legs']
]) test(`conflicting ${canonical}/${legacy} is an explicit validation error`, () => {
    rejected(routine({ [canonical]: a, [legacy]: b }), canonical);
});

for (const [field, invalids] of [
    ['targetSets', [null, 0, -1, 1.5, NaN, Infinity, 2147483648, '', '3abc', '3.5', true, [], {}]],
    ['targetReps', [null, 0, -1, NaN, Infinity, '', '12-4', '4-6-8', '0-4', '8foo', '4.5', [], {}]],
    ['restSeconds', [-1, 1.5, NaN, Infinity, 2147483648, '', '90seconds', false, [], {}]],
    ['isUnilateral', [null, 0, 1, 'false', 'true', [], {}]],
    ['order', [null, -1, 0.5, NaN, Infinity, 2147483648, '0x10']],
    ['muscleGroup', [false, 0, {}, [], 'inventado']],
    ['note', [0, false, {}, []]]
]) test(`strict ${field} rejects malformed values without coercion`, () => {
    for (const value of invalids) rejected(routine({ [field]: value }), field);
});
test('uses schema bounds without arbitrary exercise or rest maxima; accepts AMRAP', () => {
    const output = normalizeImportedExercise(ex({ targetSets: 11, targetReps: 'AMRAP', restSeconds: 900 }));
    assert.equal(output.targetSets, 11); assert.equal(output.restSeconds, 900); assert.equal(output.targetReps, 'AMRAP');
    assert.equal(normalizeImportedExercise(ex({ targetSets: 2147483647 })).targetSets, 2147483647);
    assert.equal(normalizeImportedExercise(ex({ targetSets: '+4.0', restSeconds: '1.5e2' })).restSeconds, 150);
    assert.equal(normalizeImportedExercise(ex({ targetSets: '+4.0' })).targetSets, 4);
});
test('muscle normalization covers every current client and server catalog entry', () => {
    for (const group of MUSCLE_GROUPS) {
        assert.equal(normalizeImportedExercise(ex({ muscleGroup: group.id })).muscleGroup,
            group.id === 'core' ? 'Core' : group.name);
    }
    for (const entry of EXERCISE_CATALOG) assert.equal(normalizeImportedExercise(entry).muscleGroup,
        entry.muscleGroup === 'Core / Abdomen' ? 'Core' : entry.muscleGroup);
    assert.equal(normalizeImportedExercise(ex({ muscleGroup: 'Biceps' })).muscleGroup, 'Bíceps');
    for (const empty of [null, '', 'default']) assert.equal(normalizeImportedExercise(ex({ muscleGroup: empty })).muscleGroup, null);
});
test('Sunday zero and explicit null survive; omitted weekday is inferred from legacy day name', () => {
    const a = normalizeRoutineImport({ name: 'R', days: [{ name: 'Domingo', weekday: 0 }, { dayName: 'Lunes', weekday: null }] });
    assert.deepEqual(a.days.map(d => d.weekday), [0, null]);
    assert.equal(normalizeRoutineImport(routine()).days[0].weekday, 0);
});
test('nested malformed structures, null collections and invalid days produce field errors', () => {
    for (const value of [null, [], true, 1]) rejected(value, 'routine');
    for (const value of [undefined, null, {}, 'days']) rejected({ name: 'R', days: value }, 'days');
    for (const value of [null, [], false, 'Monday']) rejected({ name: 'R', days: [value] }, 'days[0]');
    for (const value of [null, {}, 'exercises']) rejected({ name: 'R', days: [{ dayName: 'D', exercises: value }] }, 'exercises');
    for (const value of [null, [], 42]) rejected({ name: 'R', days: [{ dayName: 'D', exercises: [value] }] }, 'exercises[0]');
});
test('rest days reject hidden exercises and non-boolean flags instead of discarding configuration', () => {
    rejected({ name: 'R', days: [{ ...routine().days[0], isRestDay: true }] }, 'exercises');
    for (const value of [null, 0, 'false']) rejected({ name: 'R', days: [{ dayName: 'D', isRestDay: value }] }, 'isRestDay');
});
test('invalid/duplicate weekdays and conflicting day-name aliases are rejected', () => {
    for (const value of [-1, 7, '0', false, 0.5, NaN, Infinity]) rejected({ name: 'R', days: [{ dayName: 'D', weekday: value }] }, 'weekday');
    rejected({ name: 'R', days: [{ dayName: 'A', weekday: 0 }, { dayName: 'B', weekday: 0 }] }, 'weekday');
    rejected({ name: 'R', days: [{ dayName: 'A', name: 'B' }] }, 'dayName');
});
test('duplicate orders and provenance IDs are rejected; repeated names remain legitimate', () => {
    rejected({ name: 'R', days: [{ dayName: 'A', order: 0 }, { dayName: 'B', order: '0' }] }, 'days');
    rejected({ name: 'R', days: [{ dayName: 'D', exercises: [ex({ order: 0 }), ex({ order: 0 })] }] }, 'exercises');
    rejected({ name: 'R', days: [{ dayName: 'A', id: 'd' }, { dayName: 'B', id: 'd' }] }, 'days');
    rejected({ name: 'R', days: [{ dayName: 'A', exercises: [ex({ id: 'e' })] }, { dayName: 'B', exercises: [ex({ id: 'e' })] }] }, 'days');
    assert.equal(normalizeRoutineImport({ name: 'R', days: [{ dayName: 'D', exercises: [ex(), ex()] }] }).days[0].exercises.length, 2);
});
test('explicit order, split label and every Exercise scalar configuration are retained, parents are excluded', () => {
    const input = { name: 'R', userId: 'foreign', source: 'ai', days: [{ dayName: 'A', order: 7, splitLabel: 'Pull',
        exercises: [ex({ order: 11, id: 'e', routineDayId: 'foreign', workoutLogs: [{ id: 'foreign' }], restSeconds: 0 })] }] };
    const result = normalizeRoutineImport(input);
    assert.equal(result.days[0].order, 7); assert.equal(result.days[0].splitLabel, 'Pull');
    assert.equal(result.days[0].exercises[0].order, 11);
    assert.equal(result.userId, undefined); assert.equal(result.days[0].exercises[0].routineDayId, undefined);
});
