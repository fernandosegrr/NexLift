import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as shared from '../../packages/shared/dist/index.js';
import * as server from '../../server/src/services/operationContract.js';
import * as oldServer from '../fixtures/phase43/server/src/services/operationContract.js';
import * as oldPatch from '../fixtures/phase43/server/src/services/sessionPatch.js';
import * as oldRoutine from '../fixtures/phase43/server/src/services/routineImportContract.js';
import * as oldClient from '../fixtures/phase43/client/src/services/operationProtocol.js';
import { parseChanges } from '../../server/src/services/sessionPatch.js';
import { normalizeImportedExercise, normalizeRoutineImport } from '../../server/src/services/routineImportContract.js';
import { normalizePayload, payloadHash, verifyReceipt } from '../../client/src/services/operationProtocol.js';
import { createOperationStore } from '../../client/src/services/operationStore.js';
import { createOperationTransport } from '../../client/src/services/operationTransport.js';
import { createOperationSync } from '../../client/src/services/operationSync.js';
import { mountOperationRoutes } from '../../server/src/routes/operations.js';
import { createAuthMiddleware } from '../../server/src/middleware/auth.js';
import { id, version, at, set, receipt } from '../../packages/shared/test/contract-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const express = require('express'), jwt = require('jsonwebtoken');
const input = extra => ({ operationId: id, source: 'pwa', kind: 'workout.create', performedAt: at,
    exerciseId: 'exercise', notes: null, sets: [{ ...set }], ...extra });
function outcome(parser, value) {
    try { return { value: parser(value) }; } catch (e) { return { status: e.status, code: e.code, message: e.message }; }
}
test('contracts integration: all variants keep exact legacy canonical values and hashes', async () => {
    for (const payload of [input(), input({ source: 'shortcut', performedAt: '2026-10-18T23:59:59.999-06:00', sets: [{ weight: 80, reps: 8, rir: 2 }] }),
        { operationId: id, source: 'pwa', kind: 'rest.create', performedAt: at },
        ...['workout.appendSet', 'workout.replaceSets', 'workout.delete'].map(kind => ({ operationId: id, source: 'pwa', kind, performedAt: at,
            logId: 'log', expectedVersion: version, ...(kind === 'workout.delete' ? {} : { sets: [set] }) })),
        { operationId: id, source: 'pwa', kind: 'workout.replaceSets', performedAt: at, logId: 'log', expectedVersion: version,
            changes: { updates: [{ id: 's', fields: { rpe: 0, weightRight: 0, completed: false } }] } }]) {
        const before = JSON.stringify(payload), actual = server.parseOperation(payload), previous = oldServer.parseOperation(payload);
        assert.deepEqual(actual, previous); assert.equal(server.requestHash(actual), oldServer.requestHash(previous));
        assert.equal(JSON.stringify(payload), before);
        if (payload.source === 'pwa') { assert.deepEqual(normalizePayload(payload), oldClient.normalizePayload(payload)); assert.equal(await payloadHash(payload), await oldClient.payloadHash(payload)); }
    }
});
test('contracts integration: accepted series combinations retain historical rpe and unilateral data', () => {
    for (const rir of [0, 1, 2, 3, 4]) for (const completed of [false, true]) for (const right of [null, 0, 35]) {
        const payload = input({ sets: [{ weight: 80, reps: 8, rir, completed, weightRight: right, repsRight: right === null ? null : 0 }] });
        assert.deepEqual(server.parseOperation(payload), oldServer.parseOperation(payload));
    }
    assert.deepEqual(server.parseOperation(input({ sets: [{ weight: 0, reps: 0, rpe: null, completed: false }, set] })), oldServer.parseOperation(input({ sets: [{ weight: 0, reps: 0, rpe: null, completed: false }, set] })));
});
test('contracts integration: invalid raw data keep legacy status, code and public error', () => {
    for (const payload of [null, [], input({ operationId: 'bad' }), input({ operationId: 0 }), input({ source: 'web' }), input({ userId: 'B' }),
        input({ performedAt: '2026-02-30T00:00:00Z' }), input({ performedAt: '2026-10-19' }), input({ performedAt: '2026-10-19T00:00:00+01:60' }),
        input({ sets: [{ ...set, weight: '80' }] }), input({ sets: [{ ...set, reps: 1.5 }] }), input({ sets: [{ ...set, rir: 5 }] }),
        input({ sets: [{ ...set, weight: null }] }), input({ sets: [{ ...set, completed: null }] }), input({ sets: [{ ...set, rpe: null }] }),
        input({ sets: [null] }), input({ sets: [] }), input({ sets: [{ ...set, extra: true }] }), input({ kind: 'nope' })]) {
        assert.deepEqual(outcome(server.parseOperation, payload), outcome(oldServer.parseOperation, payload));
    }
});
test('contracts integration: patches keep exact legacy accepted values and rejected errors', () => {
    for (const changes of [{ session: { notes: null, date: at } }, { updates: [{ id: 's', fields: { rpe: 0, weight: 0, completed: false } }] },
        { additions: [{ id: 's2', fields: set }], order: ['s', 's2'] }, { removals: ['s'] }, {}, { updates: [] }, { notes: '' },
        { updates: [{ id: '', fields: set }] }, { updates: [{ id: 's', fields: { reps: 1.5 } }] }, { updates: [{ id: 's', fields: { rpe: undefined } }] },
        { session: { notes: undefined } }, { order: ['s', 's'] }]) assert.deepEqual(outcome(parseChanges, changes), outcome(oldPatch.parseChanges, changes));
});
test('contracts integration: CDMX midnight and instant offsets keep canonical hashes', () => {
    for (const performedAt of ['2026-10-19T05:59:59.999Z', '2026-10-19T06:00:00Z', '2026-10-19T00:00:00-06:00']) {
        const payload = input({ performedAt }); assert.deepEqual(server.parseOperation(payload), oldServer.parseOperation(payload));
    }
    assert.equal(server.parseOperation(input()).performedDay, '2026-10-18');
    assert.equal(server.parseOperation(input({ performedAt: '2026-10-19T06:00:00Z' })).performedDay, '2026-10-19');
});
test('contracts integration: 1.4 normalizer equivalence includes aliases/null/zero/defaults/ranges', () => {
    for (const rest of [undefined, null, 0, '0', '60', 2147483647, false, Infinity]) for (const reps of [undefined, '4-6', 'amrap', 8, '0', null]) {
        const ex = { name: ' Remo ', sets: '4', reps, rest, muscle: 'back', note: null, isUnilateral: false };
        const previous = outcome(oldRoutine.normalizeImportedExercise, ex), actual = outcome(normalizeImportedExercise, ex);
        assert.deepEqual(actual.value ?? actual.message, previous.value ?? previous.message);
    }
    for (const weekday of [0, null, undefined]) {
        const routine = { name: 'R', days: [{ dayName: 'Domingo', weekday, isRestDay: true, exercises: [] }] };
        assert.deepEqual(outcome(normalizeRoutineImport, routine), outcome(oldRoutine.normalizeRoutineImport, routine));
    }
});
test('contracts integration: receipt verification binds account/hash/operation/instant/content', async () => {
    const payload = normalizePayload(input()), item = { id, ownerId: 'A', payload, requestHash: await payloadHash(payload), originalDay: '2026-10-18' };
    const good = receipt(); good.requestHash = item.requestHash;
    assert.equal(verifyReceipt(item, good, 201), good); assert.equal(oldClient.verifyReceipt(item, good, 201), good);
    for (const mutate of [r => r.ownerId = 'B', r => r.requestHash = 'b'.repeat(64), r => r.operation.operationId = crypto.randomUUID(),
        r => r.operation.performedAt = '2026-10-20T00:00:00.000Z', r => r.result.workoutLog.sets[0].weight = 81]) {
        const body = structuredClone(good); mutate(body); assert.throws(() => verifyReceipt(item, body, 200));
    }
    assert.throws(() => verifyReceipt(item, good, 202));
});
function memory() {
    const map = new Map();
    return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), key: i => [...map.keys()][i] ?? null,
        removeItem: k => map.delete(k), get length() { return map.size; } };
}
async function engineFor(mode) {
    const storage = memory(), identity = { ownerId: 'A', token: 'synthetic-contract-token' }, receipts = new Map(), calls = [];
    let reply = mode;
    const transport = createOperationTransport({ apiUrl: 'http://synthetic/api', identity: () => identity, storage, fetcher: async (url, opts) => {
        calls.push({ url, method: opts.method, body: opts.body });
        if (url.endsWith('workout-capabilities')) return Response.json({ protocolVersion: 1, receiptFormat: 'sha256-v1', userId: 'A', ready: true, enabled: true, kinds: shared.operationKinds });
        if (opts.method === 'GET') return Response.json(receipts.get(id) ?? { code: 'OPERATION_NOT_FOUND' }, { status: receipts.has(id) ? 200 : 404 });
        if (typeof reply === 'number') return Response.json({ code: 'SYNTHETIC' }, { status: reply, headers: { 'Retry-After': '10' } });
        const payload = JSON.parse(opts.body), result = receipt(); result.requestHash = await payloadHash(payload); receipts.set(id, result);
        if (reply === 'lost') throw new TypeError('response lost after synthetic commit');
        if (reply === 'incompatible') result.result.workoutLog.sets[0].weight = '80';
        return Response.json(result, { status: 201 });
    } });
    const clock = { value: Date.parse(at) }, store = createOperationStore({ storage, now: () => clock.value });
    const engine = createOperationSync({ store, transport, enabled: true, online: () => reply !== 'offline', now: () => clock.value,
        uuid: () => id, setTimer: () => 1, clearTimer: () => {} });
    await transport.remember({ id: 'A' }, identity.token);
    return { engine, store, calls, clock, setMode(value) { reply = value; } };
}
test('contracts client: incompatible 201 retains the immutable local operation without confirmation', async () => {
    const { engine, store } = await engineFor('incompatible');
    const result = await engine.capture('workout.create', { exerciseId: 'exercise', notes: null, sets: [set] }, { performedAt: at });
    assert.equal(result.syncStatus, 'blocked_incompatible');
    const local = await store.get('A', id); assert.equal(local.receipt, undefined); assert.equal(local.payload.sets[0].weight, 80);
    assert.equal(local.requestHash, await payloadHash(local.payload)); assert.equal(local.id, id);
});
test('contracts client: lost response recovers the same receipt with no second POST', async () => {
    const state = await engineFor('lost');
    await state.engine.capture('workout.create', { exerciseId: 'exercise', notes: null, sets: [set] }, { performedAt: at });
    const before = await state.store.get('A', id); assert.equal(before.status, 'retry_scheduled');
    state.clock.value += 20000; state.setMode('normal'); await state.engine.run();
    const after = await state.store.get('A', id); assert.equal(after.status, 'confirmed'); assert.deepEqual(after.payload, before.payload);
    assert.equal(after.requestHash, before.requestHash); assert.equal(state.calls.filter(c => c.method === 'POST').length, 1);
});
test('contracts client: offline capture persists without sending or changing identity', async () => {
    const state = await engineFor('offline');
    const result = await state.engine.capture('workout.create', { exerciseId: 'exercise', notes: null, sets: [set] }, { performedAt: at });
    assert.equal(result.syncStatus, 'pending'); assert.equal(state.calls.length, 0);
    assert.equal((await state.store.get('A', id)).payload.performedAt, at);
});
for (const [status, expected] of [[401, 'paused_auth'], [409, 'conflict'], [429, 'retry_scheduled'], [503, 'retry_scheduled']]) {
    test(`contracts client: actual engine preserves data after HTTP ${status}`, async () => {
        const state = await engineFor(status);
        const result = await state.engine.capture('workout.create', { exerciseId: 'exercise', notes: null, sets: [set] }, { performedAt: at });
        assert.equal(result.syncStatus, expected); const local = await state.store.get('A', id);
        assert.equal(local.id, id); assert.equal(local.requestHash, await payloadHash(local.payload)); assert(!local.receipt);
    });
}
test('contracts compiler: invalid variants and unchecked JSON cause exactly five diagnostics', () => {
    const file = path.join(root, 'scripts/fixtures/contracts-types.ts'), options = { strict: true, noEmit: true,
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] };
    const host = ts.createCompilerHost(options), read = host.readFile.bind(host);
    assert.equal(ts.getPreEmitDiagnostics(ts.createProgram([file], options, host)).length, 0);
    host.readFile = name => path.resolve(name) === path.resolve(file) ? read(name).replaceAll('@ts-expect-error', 'expected error') : read(name);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
    assert.equal(diagnostics.length, 5); assert(diagnostics.every(d => path.resolve(d.file.fileName) === path.resolve(file)));
});
test('contracts build: generated ESM/CJS validate identically with relative source maps', async () => {
    const client = await import('../../client/src/generated/contracts.js'), backend = require(path.join(root, 'server/src/generated/contracts.cjs'));
    for (const value of [{ name: 'Remo', rest: 0 }, { name: 'Remo', sets: 3, targetSets: 4 }]) {
        const actual = outcome(backend.normalizeImportedExercise, value), previous = outcome(shared.normalizeImportedExercise, value);
        assert.deepEqual(actual, previous);
    }
    assert.equal(client.readOperationReceipt(receipt()).operation.operationId, id);
    for (const file of ['client/src/generated/contracts.js', 'server/src/generated/contracts.cjs']) {
        const code = await readFile(path.join(root, file), 'utf8'); assert.doesNotMatch(code, /require\(|from ["']@nexlift|[A-Z]:[\\/]/);
        const map = JSON.parse(Buffer.from(code.split('base64,').at(-1).trim(), 'base64'));
        for (const source of map.sources) { assert(!path.isAbsolute(source)); await readFile(path.resolve(root, path.dirname(file), source)); }
    }
});
let httpServer, base, queries = 0;
before(async () => {
    const prisma = { user: { findUnique: async () => ({ isActive: true, tokenVersion: 0 }) },
        $queryRaw: async () => { queries++; throw Object.assign(new Error('synthetic-private-sql-token'), { code: 'P1001' }); } };
    const app = express(); app.use(express.json());
    mountOperationRoutes(app, { prisma, authMiddleware: createAuthMiddleware({ prisma, secret: 'synthetic-contract-secret', log: () => {} }) });
    httpServer = app.listen(0, '127.0.0.1'); await new Promise(resolve => httpServer.once('listening', resolve));
    base = `http://127.0.0.1:${httpServer.address().port}`;
});
after(async () => { httpServer.closeAllConnections(); await new Promise(resolve => httpServer.close(resolve)); });
async function request(payload, { token = jwt.sign({ userId: 'A', tokenVersion: 0 }, 'synthetic-contract-secret'), method = 'POST', suffix = '' } = {}) {
    const response = await fetch(base + '/api/v1/workout-operations' + suffix, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(10000) });
    return { response, body: await response.json() };
}
for (const [label, payload] of [['UUID', input({ operationId: 'broken' })], ['version', { operationId: id, source: 'pwa', kind: 'workout.delete', performedAt: at, logId: 'log', expectedVersion: 'old' }],
    ['calendar', input({ performedAt: '2026-02-30T00:00:00Z' })], ['numeric types', input({ sets: [{ ...set, weight: '80' }] })], ['owner injection', input({ userId: 'B' })]]) {
    test(`contracts Express: rejects ${label} before a database write or query`, async () => {
        const before = queries, { response, body } = await request(payload);
        assert.equal(response.status, 422); assert.equal(body.code, 'INVALID_OPERATION'); assert.equal(queries, before);
        assert.equal(response.headers.get('cache-control'), 'no-store');
    });
}
test('contracts Express: GET receipt validates UUID before querying', async () => {
    const before = queries, { response } = await request(undefined, { method: 'GET', suffix: '/bad' });
    assert.equal(response.status, 422); assert.equal(queries, before);
});
test('contracts Express: authentication still precedes shared validation', async () => {
    const before = queries, { response } = await request(input({ operationId: 'bad' }), { token: 'invalid' });
    assert.equal(response.status, 401); assert.equal(queries, before);
});
test('contracts Express: valid input reaches dependency boundary and sanitized 503', async () => {
    const before = queries, { response, body } = await request(input());
    assert.equal(response.status, 503); assert.equal(queries, before + 1); assert.equal(response.headers.get('retry-after'), '1');
    assert.equal(body.outcome, 'unknown'); assert(!JSON.stringify(body).includes('synthetic-private'));
});
