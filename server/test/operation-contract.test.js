import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseOperation, requestHash, sessionVersion } from '../src/services/operationContract.js';

const operation = extra => ({ operationId: randomUUID(), kind: 'workout.create', source: 'pwa',
    performedAt: '2026-10-19T05:59:59.999Z', exerciseId: 'synthetic',
    sets: [{ weight: 80, reps: 10, rir: 2, completed: true }], ...extra });
test('canonical operation preserves the original instant and CDMX day', () => {
    const parsed = parseOperation(operation());
    assert.equal(parsed.performedAt, '2026-10-19T05:59:59.999Z');
    assert.equal(parsed.performedDay, '2026-10-18');
    assert.equal(parsed.sets[0].rpe, 8);
});
test('CDMX midnight changes day at 06:00 UTC', () => {
    assert.equal(parseOperation(operation({ performedAt: '2026-10-19T06:00:00Z' })).performedDay, '2026-10-19');
});
test('equivalent offsets, key order, RIR/RPE and absent defaults share a hash', () => {
    const a = parseOperation(operation());
    const b = parseOperation({ ...a, performedDay: undefined, performedAt: '2026-10-18T23:59:59.999-06:00',
        sets: [{ reps: 10, weight: 80, rpe: 8 }] });
    assert.equal(requestHash(a), requestHash(b));
});
for (const [label, patch] of [
    ['no stable ID', { operationId: null }], ['invalid UUID', { operationId: 'x' }],
    ['no original instant', { performedAt: undefined }], ['ambiguous date', { performedAt: '2026-10-18' }],
    ['impossible date', { performedAt: '2026-02-30T10:00:00Z' }],
    ['unknown kind', { kind: 'merge.everything' }], ['non-string kind', { kind: {} }], ['client ownership', { userId: 'another' }],
    ['unknown source', { source: 'unknown' }], ['unexpected field', { arbitrary: true }],
    ['partial numeric parsing', { sets: [{ weight: '80kg', reps: 10, rir: 2 }] }],
    ['fractional reps', { sets: [{ weight: 80, reps: 1.5, rir: 2 }] }],
    ['nonfinite', { sets: [{ weight: Infinity, reps: 10, rir: 2 }] }],
    ['NaN', { sets: [{ weight: NaN, reps: 10, rir: 2 }] }],
    ['null weight', { sets: [{ weight: null, reps: 10, rir: 2 }] }],
    ['numeric strings', { sets: [{ weight: '80', reps: 10, rir: 2 }] }],
    ['fractional stored effort', { sets: [{ weight: 80, reps: 10, rpe: 8.5 }] }],
    ['empty sets', { sets: [] }], ['nested unknown field', { sets: [{ weight: 80, reps: 10, rir: 2, id: 'remote' }] }],
    ['invalid offset', { performedAt: '2026-10-18T00:00:00+01:60' }],
    ['null completed', { sets: [{ weight: 80, reps: 10, rir: 2, completed: null }] }],
    ['ambiguous effort', { sets: [{ weight: 80, reps: 10, rir: 2, rpe: 9 }] }],
    ['missing expected version', { kind: 'workout.replaceSets', logId: 'log', exerciseId: undefined }],
    ['append without session identity', { kind: 'workout.appendSet', exerciseId: undefined }],
    ['invalid rest note', { kind: 'rest.create', exerciseId: undefined, sets: undefined, note: 42 }]
]) test(`strict validation rejects ${label}`, () => assert.throws(() => parseOperation(operation(patch)), e => e.status === 422));
test('changed weight/reps/time/source are different operations under the same ID', () => {
    const a = operation();
    for (const patch of [{ sets: [{ weight: 81, reps: 10, rir: 2 }] }, { sets: [{ weight: 80, reps: 11, rir: 2 }] },
        { performedAt: '2026-10-20T01:00:00Z' }, { source: 'shortcut' }]) {
        assert.notEqual(requestHash(parseOperation(a)), requestHash(parseOperation({ ...a, ...patch })));
    }
});
test('session version includes identities, order, notes and bilateral set content', () => {
    const a = { id: 'log', exerciseId: 'ex', date: new Date('2026-10-19T05:00:00Z'), notes: null,
        sets: [{ id: 's', setNumber: 1, weight: 10, reps: 2, rpe: 8, completed: true, weightRight: 12, repsRight: 3 }] };
    assert.equal(sessionVersion(a), sessionVersion(structuredClone(a)));
    assert.notEqual(sessionVersion(a), sessionVersion({ ...a, sets: [{ ...a.sets[0], weightRight: 13 }] }));
});
