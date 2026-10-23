import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { isOperationId, operationId, isSessionVersion, readOperationReceipt, isOperationCapability,
    readSessionResponse, isWorkoutLog, normalizeImportedExercise, RoutineValidationError, classifyApiFailure,
    isApiErrorBody, readRoutineImportResponse, ContractValidationError, validate, parseChanges, parseResolution } from '../dist/index.js';
import { id, version, at, set, receipt } from './contract-fixtures.mjs';

test('contracts: UUID spelling compatibility without accepting coercions', () => {
    assert.equal(operationId(id.toUpperCase()), id);
    for (const value of [null, undefined, {}, [], 'x', 0, id + ' ']) assert.equal(isOperationId(value), false);
});
test('contracts: versions are lowercase sha256 strings, never numbers or missing', () => {
    assert(isSessionVersion(version));
    for (const value of [undefined, null, 'A'.repeat(64), '0'.repeat(63), {}, 0]) assert(!isSessionVersion(value));
});
for (const kind of ['workout.create', 'workout.appendSet', 'workout.replaceSets', 'workout.delete', 'rest.create']) {
    test(`contracts: valid ${kind} receipt returns the exact reference`, () => {
        const value = receipt(kind); Object.freeze(value);
        assert.equal(readOperationReceipt(value), value);
    });
}
test('contracts: malformed receipt envelope is a structured incompatible response', () => {
    for (const mutate of [r => r.protocolVersion = 2, r => r.ownerId = null, r => r.requestHash = 'bad', r => r.replayed = 'yes',
        r => r.operation.state = 'pending', r => r.operation.kind = 'merge', r => r.operation.operationId = {},
        r => r.operation.performedAt = '2026-02-30T00:00:00.000Z', r => r.operation.performedDay = 0,
        r => r.result.sessionVersion = null, r => r.result.workoutLog.sets = null]) {
        const value = receipt(); mutate(value);
        assert.throws(() => readOperationReceipt(value), error => error instanceof ContractValidationError
            && error.code === 'INCOMPATIBLE_OPERATION' && error.issues[0].path === 'receipt');
    }
});
test('contracts: incompatible set values cannot confirm a receipt', () => {
    for (const patch of [{ weight: NaN }, { weight: Infinity }, { reps: 1.5 }, { rpe: '8' }, { completed: null },
        { weightRight: false }, { repsRight: -1 }, { setNumber: 0 }, { id: null }, { workoutLogId: 7 }]) {
        const value = receipt(); Object.assign(value.result.workoutLog.sets[0], patch);
        assert.throws(() => readOperationReceipt(value));
    }
});
test('contracts: compatible response extensions survive without projection', () => {
    const value = receipt(); value.extension = { opaque: [0, null, false] };
    value.result.workoutLog.exercise = { historical: true };
    const before = JSON.stringify(value); assert.equal(readOperationReceipt(value), value); assert.equal(JSON.stringify(value), before);
});
test('contracts: rest and tombstone variants require their own result', () => {
    const rest = receipt('rest.create'); rest.result = receipt().result;
    assert.throws(() => readOperationReceipt(rest));
    const removed = receipt('workout.delete'); removed.result.deleted = false;
    assert.throws(() => readOperationReceipt(removed));
});
test('contracts: capability keeps additive kinds and rejects incompatible enum data', () => {
    const body = { protocolVersion: 1, receiptFormat: 'sha256-v1', userId: 'A', ready: true, enabled: true,
        kinds: ['workout.create', 'workout.appendSet', 'workout.replaceSets', 'workout.delete', 'rest.create', 'future'] };
    assert(isOperationCapability(body));
    assert(!isOperationCapability({ ...body, kinds: [...body.kinds, 0] }));
    assert(!isOperationCapability({ ...body, enabled: false }));
});
test('contracts: projected sessions remain distinct from complete versioned bases', () => {
    const projection = { workoutLog: { id: 'log', exerciseId: 'exercise', sets: [{ weight: 80, reps: 8, rpe: 8, completed: false }] }, sessionVersion: version };
    assert.equal(readSessionResponse(projection), projection);
    assert(!isWorkoutLog(projection.workoutLog));
    assert(isWorkoutLog(receipt().result.workoutLog));
});
test('contracts: invalid version, calendar, numeric strings and null session data fail', () => {
    for (const value of [null, { sessionVersion: version, workoutLog: null }, { sessionVersion: 'bad', workoutLog: { id: 'x', sets: [] } },
        { sessionVersion: version, workoutLog: { id: 'x', sets: [{ weight: '80', reps: 8 }] } },
        { sessionVersion: version, workoutLog: { id: 'x', date: '2026-02-30T00:00:00.000Z', sets: [] } }]) assert.throws(() => readSessionResponse(value));
});
test('contracts: normalized imported exercise preserves zero, null, false and notes', () => {
    const input = { name: ' Remo ', sets: '4', reps: '4–6', rest: 0, muscle: 'back', isUnilateral: false, note: '' };
    assert.deepEqual(normalizeImportedExercise(input), { name: 'Remo', targetSets: 4, targetReps: '4-6', restSeconds: 0,
        muscleGroup: 'Espalda', isUnilateral: false, note: '', order: 0 });
    assert.equal(input.rest, 0); assert.equal(input.name, ' Remo ');
});
test('contracts: aliases conflict at their original field path', () => {
    for (const patch of [{ targetSets: 4, sets: 3 }, { targetReps: '4-6', reps: '5' }, { restSeconds: 0, rest: null }, { muscleGroup: 'Pecho', muscle: 'back' }]) {
        assert.throws(() => normalizeImportedExercise({ name: 'Remo', ...patch }, 0, 'days[0].exercises[0]'),
            error => error instanceof RoutineValidationError && error.status === 400 && error.details[0].path.startsWith('days[0].exercises[0]'));
    }
});
test('contracts: exercise defaults apply only to undefined; extra provenance stays in input', () => {
    const input = { name: 'Remo', targetSets: undefined, note: null, provenance: { id: 'old' } };
    const result = normalizeImportedExercise(input);
    assert.equal(result.targetSets, 3); assert.equal(result.note, null); assert(!Object.hasOwn(result, 'provenance'));
    assert.deepEqual(input.provenance, { id: 'old' });
    assert.throws(() => normalizeImportedExercise({ name: 'Remo', targetSets: null }));
});
test('contracts: import response keeps Sunday and zero rest without rewriting JSON', () => {
    const body = { message: 'ok', routine: { name: 'R', description: null, days: [{ dayName: 'Domingo', weekday: 0, order: 0,
        isRestDay: false, exercises: [normalizeImportedExercise({ name: 'Remo', rest: 0 })] }] } };
    assert.equal(readRoutineImportResponse(body), body);
    body.routine.days[0].weekday = '0'; assert.throws(() => readRoutineImportResponse(body));
});
test('contracts: partial patches preserve stable IDs, numeric zero and historical rpe', () => {
    const input = { session: { notes: null, date: at }, updates: [{ id: 's', fields: { weightRight: 0, repsRight: 0, rpe: 0, completed: false } }] };
    assert.deepEqual(parseChanges(input), input);
    assert.deepEqual(parseResolution({ conflictId: id, originalOperationId: id, decision: 'manual' }), { conflictId: id, originalOperationId: id, decision: 'manual' });
});
test('contracts: patches reject overlapping identities and incomplete additions', () => {
    for (const value of [{ updates: [{ id: 's', fields: { weight: 1 } }], removals: ['s'] }, { additions: [{ id: 's', fields: { weight: 0 } }] },
        { updates: [{ id: 's', fields: { reps: Infinity } }] }, { session: { notes: undefined } }, { order: ['s', 's'] }]) {
        assert.throws(() => parseChanges(value), error => error.code === 'INVALID_SESSION_PATCH');
    }
});
for (const [status, expected] of [[400, 'validation'], [401, 'authentication'], [403, 'forbidden'], [404, 'validation'],
    [409, 'conflict'], [422, 'validation'], [429, 'recoverable'], [500, 'recoverable'], [503, 'recoverable']]) {
    test(`contracts: HTTP ${status} classification respects existing status`, () => assert.equal(classifyApiFailure(status, { error: 'untrusted' }), expected));
}
test('contracts: error body validation accepts auth legacy shapes without requiring invented codes', () => {
    assert(isApiErrorBody({ error: 'No autorizado' })); assert(isApiErrorBody({ code: 'DATABASE_UNAVAILABLE', retryable: true, outcome: 'unknown' }));
    assert(!isApiErrorBody({ code: {} })); assert(!isApiErrorBody({ retryable: 'yes' })); assert(!isApiErrorBody(null));
});
test('contracts: validation result contains paths and never echoes the rejected secret', () => {
    const value = { ...receipt(), requestHash: 'synthetic-secret-token' }, result = validate(readOperationReceipt, value);
    assert.equal(result.success, false); assert(!JSON.stringify(result).includes(value.requestHash));
    assert.equal(validate(readOperationReceipt, receipt()).success, true);
});
test('contracts: 5000 immutable receipts validate once at the HTTP boundary', t => {
    const values = Array.from({ length: 5000 }, () => receipt()), before = JSON.stringify(values), start = performance.now();
    for (const value of values) readOperationReceipt(value);
    t.diagnostic(`5000 receipts: ${(performance.now() - start).toFixed(2)} ms; informational, no universal latency claim`);
    assert.equal(JSON.stringify(values), before); assert.deepEqual(values[0].result.workoutLog.sets[0], { ...set, id: 's', setNumber: 1, workoutLogId: 'log' });
});
