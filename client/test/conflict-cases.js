// Real browser + native IndexedDB + actual isolated Express/PostgreSQL.
import { createStorageRuntime, getStorageRuntime } from '../src/storage/runtime.js';
import { createOperationSync } from '../src/services/operationSync.js';
import { createOperationTransport } from '../src/services/operationTransport.js';
import { createConflictResolution } from '../src/services/conflictResolution.js';
import { compareSession, changesFromEditor, selectedChanges, verifySnapshot } from '../src/services/sessionChanges.js';
import { canonicalJSON, normalizePayload } from '../src/services/operationProtocol.js';

const assert = (value, msg = 'Assertion failed') => { if (!value) throw new Error(msg); };
const equal = (a, b) => assert(canonicalJSON(a) === canonicalJSON(b), `Expected ${canonicalJSON(b)}, received ${canonicalJSON(a)}`);
const reject = async task => { let error; try { await task(); } catch (e) { error = e; } assert(error, 'Expected rejection'); return error; };
const fields = { weight: 100, reps: 8, rpe: 8, completed: true, weightRight: null, repsRight: null };
const cases = [], runtimes = []; let config, account, online, clock;
const test = (name, fn) => cases.push({ name, fn });
async function request(payload, owner = 'A') {
    const response = await fetch('/api/v1/workout-operations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config[`token${owner}`]}` }, body: JSON.stringify(payload) });
    const body = await response.json(); return { status: response.status, body };
}
const operation = (kind, data = {}) => ({ kind, operationId: crypto.randomUUID(), source: 'pwa', performedAt: '2026-10-01T18:00:00.000Z', ...data });
async function remotePatch(snapshot, changes, extras = {}) {
    const response = await request(operation('workout.replaceSets', { logId: snapshot.workoutLog.id, expectedVersion: snapshot.sessionVersion, changes, ...extras }));
    equal(response.status, 200); return { ownerId: 'A', ...response.body.result };
}
function client({ name = `nexlift-conflict-test-${crypto.randomUUID()}`, shared = false } = {}) {
    const storage = createStorageRuntime({ name, conflictsEnabled: true, identity: () => account, now: () => clock, locks: navigator.locks,
        ...(shared ? {} : { storage: { length: 0, key: () => null, getItem: () => null }, events: new EventTarget() }) });
    const transport = createOperationTransport({ apiUrl: '/api', identity: () => account, events: new EventTarget() });
    const sync = createOperationSync({ enabled: true, store: storage.store, transport, online: () => online,
        now: () => clock, setTimer: () => 0, clearTimer: () => {} });
    const service = createConflictResolution({ storage, sync, now: () => clock });
    const result = { storage, sync, service, name }; runtimes.push(result); return result;
}
async function initial() {
    const response = await request(operation('workout.create', { exerciseId: 'A-Exercise', notes: 'original', sets: [fields, { ...fields, weight: 70 }] }));
    equal(response.status, 201); return { ownerId: 'A', ...response.body.result };
}
async function captured(c, snapshot, changes) {
    await c.sync.transport.remember({ id: 'A' }, account.token); online = false;
    return c.sync.capture('workout.replaceSets', { logId: snapshot.workoutLog.id, expectedVersion: snapshot.sessionVersion, changes },
        { ownerId: 'A', performedAt: '2026-10-02T18:00:00.000Z', baseSnapshot: snapshot });
}
async function conflictFor(localFields = { weight: 120 }, remoteFields = { weight: 130 }) {
    const base = await initial(), c = client(), id = base.workoutLog.sets[0].id;
    const saved = await captured(c, base, { updates: [{ id, fields: localFields }] });
    const remote = await remotePatch(base, { updates: [{ id, fields: remoteFields }] });
    online = true; await c.sync.run();
    equal((await c.storage.store.get('A', saved.operationId)).status, 'conflict');
    const detail = await c.service.inspect('A', saved.operationId); return { c, base, id, saved, remote, detail };
}
async function read(logId, owner = 'A') {
    const response = await fetch(`/api/v1/workout-sessions/${logId}`, { headers: { Authorization: `Bearer ${config[`token${owner}`]}` } });
    return { status: response.status, body: await response.json() };
}

for (const [field, local, remote] of [['weight', 120, 130], ['reps', 10, 12], ['rpe', 7, 9], ['weightRight', 110, 125], ['repsRight', 9, 11]]) test(`dos clientes detectan modificaciones concurrentes en ${field}`, async () => {
    const s = await conflictFor({ [field]: local }, { [field]: remote });
    const diff = s.detail.observation.comparison.differences.find(d => d.field === field);
    assert(diff.conflict); equal(diff.local, local); equal(diff.remote, remote); equal(diff.original, fields[field]);
});
test('notas originales y dos cambios de notas se comparan sin conjeturas', async () => {
    const base = await initial(), c = client(), saved = await captured(c, base, { session: { notes: 'local' } });
    await remotePatch(base, { session: { notes: 'remoto' } }); online = true; await c.sync.run();
    const d = await c.service.inspect('A', saved.operationId); assert(d.observation.comparison.differences.find(v => v.field === 'notes').conflict);
});
test('completed false se preserva y se distingue de peso remoto', async () => {
    const s = await conflictFor({ completed: false }, { weight: 130 });
    const p = await s.c.service.preview('A', s.saved.operationId, [], 'local'), result = await s.c.service.confirm('A', p);
    equal(result.status, 'confirmed'); const set = result.receipt.result.workoutLog.sets.find(v => v.id === s.id); equal(set.completed, false); equal(set.weight, 130);
});
test('campos independientes de una misma serie conservan peso remoto y reps locales', async () => {
    const s = await conflictFor({ reps: 12 }, { weight: 145 }); assert(s.detail.observation.comparison.independent);
    const result = await s.c.service.confirm('A', await s.c.service.preview('A', s.saved.operationId, [], 'local'));
    const set = result.receipt.result.workoutLog.sets.find(v => v.id === s.id); equal(set.weight, 145); equal(set.reps, 12); equal(set.id, s.id);
});
test('series distintas y notas remotas no se sobrescriben al resolver', async () => {
    const base = await initial(), c = client(), [a, b] = base.workoutLog.sets;
    const saved = await captured(c, base, { updates: [{ id: a.id, fields: { weight: 140 } }] });
    await remotePatch(base, { updates: [{ id: b.id, fields: { weight: 170 } }], session: { notes: 'nota remota' } }); online = true; await c.sync.run();
    const result = await c.service.confirm('A', await c.service.preview('A', saved.operationId, [], 'local'));
    equal(result.receipt.result.workoutLog.notes, 'nota remota'); equal(result.receipt.result.workoutLog.sets.find(v => v.id === b.id).weight, 170);
});
test('creación simultánea de series conserva ambas identidades sin depender del índice', async () => {
    const base = await initial(), c = client(), localId = crypto.randomUUID(), remoteId = crypto.randomUUID();
    const saved = await captured(c, base, { additions: [{ id: localId, fields: { ...fields, weight: 121 } }] });
    await remotePatch(base, { additions: [{ id: remoteId, fields: { ...fields, weight: 131 } }] }); online = true; await c.sync.run();
    const result = await c.service.confirm('A', await c.service.preview('A', saved.operationId, [], 'local'));
    equal(new Set(result.receipt.result.workoutLog.sets.map(v => v.id)).size, 4); assert(result.receipt.result.workoutLog.sets.some(v => v.id === remoteId));
});
test('serie eliminada remotamente y modificada localmente queda incompatible sin resucitar', async () => {
    const base = await initial(), c = client(), id = base.workoutLog.sets[0].id;
    const saved = await captured(c, base, { updates: [{ id, fields: { weight: 200 } }] });
    await remotePatch(base, { removals: [id] }); online = true; await c.sync.run();
    const d = await c.service.inspect('A', saved.operationId); assert(d.observation.comparison.differences.some(v => v.incompatible));
    await reject(() => c.service.preview('A', saved.operationId, [], 'local')); equal((await read(base.workoutLog.id)).body.workoutLog.sets.length, 1);
});
test('sesión eliminada y sesión inexistente no se recrean ni filtran propietario', async () => {
    const base = await initial(), c = client(), saved = await captured(c, base, { session: { notes: 'sin aplicar' } });
    equal((await request(operation('workout.delete', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion }))).status, 200);
    online = true; await c.sync.run(); const d = await c.service.inspect('A', saved.operationId);
    equal(d.observation.remote.status, 'unavailable'); assert(!d.observation.comparison.mergeable);
    await reject(() => c.service.preview('A', saved.operationId, [], 'local')); equal((await read(base.workoutLog.id, 'B')).status, 404);
    await c.service.acceptServer('A', saved.operationId); equal((await c.storage.store.get('A', saved.operationId)).status, 'resolved_preserved');
});
for (const decision of ['local', 'manual']) test(`eliminación conflictiva ${decision} requiere preview y nuevo UUID, con tombstone y PR`, async () => {
    const base = await initial(), c = client(); await c.sync.transport.remember({ id: 'A' }, account.token); online = false;
    const saved = await c.sync.capture('workout.delete', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion }, { ownerId: 'A', baseSnapshot: base });
    await remotePatch(base, { session: { notes: 'cambio remoto antes de eliminar' } }); online = true; await c.sync.run();
    const detail = await c.service.inspect('A', saved.operationId); assert(detail.observation.comparison.differences.some(d => d.field === 'deleted' && d.conflict));
    const preview = await c.service.preview('A', saved.operationId, ['session:deleted'], decision); assert(preview.deleteSession);
    const result = await c.service.confirm('A', preview); equal(result.status, 'confirmed'); assert(result.id !== saved.operationId);
    equal(result.receipt.result.deleted, true); equal(result.receipt.resolution.originalOperationId, saved.operationId);
    equal((await read(base.workoutLog.id)).status, 404); equal((await c.storage.store.get('A', saved.operationId)).status, 'resolved_preserved');
});
test('rechaza reutilizar UUID original para una decisión de resolución', async () => {
    const base = await initial(), operationId = crypto.randomUUID();
    const response = await request(operation('workout.delete', { operationId, logId: base.workoutLog.id, expectedVersion: base.sessionVersion,
        resolution: { conflictId: operationId, originalOperationId: operationId, decision: 'manual' } }));
    equal(response.status, 422); equal((await read(base.workoutLog.id)).body.sessionVersion, base.sessionVersion);
});
test('cambio de fecha conserva instante base y detecta fecha remota distinta', async () => {
    const base = await initial(), c = client(), saved = await captured(c, base, { session: { date: '2026-09-20T18:00:00.000Z' } });
    await remotePatch(base, { session: { date: '2026-09-21T18:00:00.000Z' } }); online = true; await c.sync.run();
    const d = await c.service.inspect('A', saved.operationId); assert(d.observation.comparison.differences.find(v => v.field === 'date').conflict);
    const result = await c.service.confirm('A', await c.service.preview('A', saved.operationId, [], 'local')); equal(result.receipt.result.workoutLog.date, '2026-09-20T18:00:00.000Z');
});
test('conservar servidor no escribe en PostgreSQL y conserva payload, base e historial', async () => {
    const s = await conflictFor(), before = await s.c.storage.store.get('A', s.saved.operationId);
    await s.c.service.acceptServer('A', s.saved.operationId);
    const after = await s.c.storage.store.get('A', s.saved.operationId); equal(after.payload, before.payload); equal(after.baseSnapshot, s.base);
    equal(after.status, 'resolved_preserved'); equal((await read(s.base.workoutLog.id)).body.sessionVersion, s.remote.sessionVersion);
    await s.c.storage.store.record('A', s.saved.operationId, { status: 'conflict', errorCode: 'LATE_REPLY' });
    equal((await s.c.storage.store.get('A', s.saved.operationId)).status, 'resolved_preserved');
    equal((await s.c.service.list('A')).length, 1);
});
test('aplicar intención local genera UUID nuevo, referencia y comprobante persistente', async () => {
    const s = await conflictFor(), proposal = await s.c.service.preview('A', s.saved.operationId, [], 'local');
    const result = await s.c.service.confirm('A', proposal); assert(result.id !== s.saved.operationId); equal(result.status, 'confirmed');
    equal(result.payload.resolution.originalOperationId, s.saved.operationId); equal(result.receipt.resolution, result.payload.resolution);
    equal((await s.c.storage.store.get('A', s.saved.operationId)).status, 'resolved_preserved');
    await reject(() => s.c.service.confirm('A', proposal));
});
test('selección manual por campo aplica peso local y conserva reps y notas remotas', async () => {
    const s = await conflictFor({ weight: 155, reps: 10 }, { weight: 160, reps: 12 });
    const key = s.detail.observation.comparison.differences.find(v => v.field === 'weight').key;
    const result = await s.c.service.confirm('A', await s.c.service.preview('A', s.saved.operationId, [key], 'manual'));
    const set = result.receipt.result.workoutLog.sets.find(v => v.id === s.id); equal(set.weight, 155); equal(set.reps, 12);
});
test('cambio remoto después de vista previa bloquea la decisión sin crear UUID nuevo', async () => {
    const s = await conflictFor(), proposal = await s.c.service.preview('A', s.saved.operationId, [], 'local');
    await remotePatch(s.remote, { session: { notes: 'tercer cliente' } });
    await reject(() => s.c.service.confirm('A', proposal)); equal((await s.c.storage.store.list('A')).length, 1);
});
test('dos resoluciones concurrentes contra la misma versión sólo confirman una', async () => {
    const s = await conflictFor(), changes = { updates: [{ id: s.id, fields: { weight: 199 } }] };
    const responses = await Promise.all([request(operation('workout.replaceSets', { logId: s.base.workoutLog.id, expectedVersion: s.remote.sessionVersion, changes })),
        request(operation('workout.replaceSets', { logId: s.base.workoutLog.id, expectedVersion: s.remote.sessionVersion, changes: { session: { notes: 'simultáneo' } } }))]);
    equal(responses.map(r => r.status).sort(), [200, 409]);
});
test('carrera entre lectura final y POST crea otro conflicto y permite revisión encadenada', async () => {
    const s = await conflictFor(), proposal = await s.c.service.preview('A', s.saved.operationId, [], 'local');
    const original = s.c.sync.transport.request; let intercepted = false;
    s.c.sync.transport.request = async (session, path, options) => {
        if (options?.method === 'POST' && !intercepted) {
            intercepted = true; await remotePatch(s.remote, { session: { notes: 'carrera después de leer' } });
        }
        return original(session, path, options);
    };
    const result = await s.c.service.confirm('A', proposal); equal(result.status, 'conflict');
    const next = await s.c.service.inspect('A', result.id); assert(next.observation.comparison.mergeable);
    await s.c.service.confirm('A', await s.c.service.preview('A', result.id, [], 'local'));
    const list = await s.c.service.list('A'); equal(list.find(c => c.id === s.saved.operationId).status, 'resolved_local');
    equal(list.find(c => c.id === result.id).status, 'resolved_local');
});
test('reintento del mismo UUID devuelve comprobante idéntico y contenido distinto se rechaza', async () => {
    const base = await initial(), payload = operation('workout.replaceSets', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion, changes: { session: { notes: 'reintento' } } });
    const first = await request(payload), second = await request(payload); equal(first.status, 200); equal(second.status, 200);
    equal(first.body.result, second.body.result); equal(first.body.requestHash, second.body.requestHash); equal(second.body.replayed, true);
    equal((await request({ ...payload, changes: { session: { notes: 'otra decisión' } } })).status, 409);
});
test('fallo local durante acuse revierte conflicto, original y receipt; se recupera sin repetir escritura', async () => {
    const s = await conflictFor(), proposal = await s.c.service.preview('A', s.saved.operationId, [], 'local');
    const fail = (_key, data) => { if (data.type === 'attempt_state' && data.data.status === 'confirmed') throw new DOMException('Synthetic storage cut', 'QuotaExceededError'); };
    s.c.storage.db.conflictHistory.hook('creating', fail);
    await reject(() => s.c.service.confirm('A', proposal));
    const conflict = await s.c.storage.conflicts.get('A', s.saved.operationId), id = conflict.activeResolutionId;
    equal(conflict.status, 'awaiting_receipt'); equal(await s.c.storage.db.receipts.get(['A', id]), undefined);
    equal((await s.c.storage.store.get('A', s.saved.operationId)).status, 'conflict');
    s.c.storage.db.conflictHistory.hook('creating').unsubscribe(fail); clock += 600000; await s.c.sync.run();
    equal((await s.c.storage.store.get('A', id)).status, 'confirmed');
    equal((await s.c.service.list('A')).find(c => c.id === s.saved.operationId).status, 'resolved_local');
});
test('tercer dispositivo días después conserva tres versiones y vuelve a presentar conflicto', async () => {
    const s = await conflictFor(); clock += 86400000 * 5;
    const c = client(), local = await captured(c, s.base, { updates: [{ id: s.id, fields: { reps: 20 } }] });
    await remotePatch(s.remote, { session: { notes: 'versión tercera' } }); online = true; await c.sync.run();
    const d = await c.service.inspect('A', local.operationId); equal(d.baseSnapshot, s.base); equal(d.observation.remote.snapshot.workoutLog.notes, 'versión tercera');
});
test('dependencias pausadas se revisan con nuevos IDs y no se reanudan a ciegas', async () => {
    const base = await initial(), c = client(), id = base.workoutLog.sets[0].id;
    const a = await captured(c, base, { updates: [{ id, fields: { weight: 135 } }] });
    const b = await captured(c, base, { session: { notes: 'depende' } });
    await remotePatch(base, { updates: [{ id, fields: { weight: 140 } }] }); online = true; await c.sync.run();
    await c.service.inspect('A', b.operationId); await reject(() => c.service.preview('A', b.operationId, [], 'local'));
    await c.service.inspect('A', a.operationId); await c.service.acceptServer('A', a.operationId);
    const before = await c.storage.store.get('A', b.operationId); equal(before.status, 'blocked_dependency');
    const p = await c.service.preview('A', b.operationId, [], 'local'), result = await c.service.confirm('A', p); equal(result.status, 'confirmed');
    equal((await c.storage.store.get('A', b.operationId)).payload, before.payload); equal(result.receipt.result.workoutLog.notes, 'depende');
});
test('persistencia y detección de conflictos existentes no duplica registros al recargar', async () => {
    const s = await conflictFor(), original = await s.c.storage.store.get('A', s.saved.operationId); s.c.storage.close();
    const c = client({ name: s.c.name }); await c.storage.ready();
    await c.service.list('A'); await c.service.list('A'); equal((await c.service.list('A')).length, 1);
    equal((await c.storage.store.get('A', original.id)).payload, original.payload);
    await c.service.defer('A', original.id); equal((await c.service.list('A'))[0].status, 'deferred');
});
test('A cierra sesión, B no puede leer resolver ni exportar y A recupera su conflicto', async () => {
    const s = await conflictFor(); account = { ownerId: 'B', token: config.tokenB };
    await reject(() => s.c.service.list('A')); await reject(() => s.c.service.export('A')); equal((await s.c.service.list('B')).length, 0);
    const before = (await read(s.base.workoutLog.id, 'A')).body.sessionVersion;
    equal((await request(operation('workout.replaceSets', { logId: s.base.workoutLog.id, expectedVersion: before, changes: { session: { notes: 'ataque' } } }), 'B')).status, 404);
    account = { ownerId: 'A', token: config.tokenA }; equal((await s.c.service.list('A')).length, 1);
});
test('respuesta tardía de A tras cambiar a B no confirma ni modifica su vista', async () => {
    const s = await conflictFor(), original = s.c.sync.transport.request;
    s.c.sync.transport.request = async (...args) => { const result = await original(...args); account = { ownerId: 'B', token: config.tokenB }; return result; };
    await reject(() => s.c.service.inspect('A', s.saved.operationId)); equal((await s.c.service.list('B')).length, 0);
});
test('operación legacy sin base verificable sólo ofrece conservación y exportación', async () => {
    const base = await initial(), c = client(); await c.sync.transport.remember({ id: 'A' }, account.token); online = false;
    const saved = await c.sync.capture('workout.replaceSets', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion, sets: [fields] });
    await remotePatch(base, { session: { notes: 'remote' } }); online = true; await c.sync.run();
    const d = await c.service.inspect('A', saved.operationId); assert(!d.observation.comparison.mergeable); await reject(() => c.service.preview('A', saved.operationId, [], 'local'));
});
test('base manipulada se rechaza antes de almacenar o enviar operaciones', async () => {
    const base = await initial(), bad = structuredClone(base); bad.workoutLog.sets[0].weight = 999;
    await reject(() => verifySnapshot(bad, 'A', base.workoutLog.id, base.sessionVersion));
    const c = client(); await reject(() => captured(c, bad, { session: { notes: 'x' } })); equal((await c.storage.store.list('A')).length, 0);
});
test('estado resuelto no puede introducirse sin decisión mediante evento legacy o creación', async () => {
    const base = await initial(), c = client(), saved = await captured(c, base, { session: { notes: 'pendiente' } });
    await reject(() => c.storage.store.record('A', saved.operationId, { status: 'resolved_preserved' }));
    equal((await c.storage.store.get('A', saved.operationId)).status, 'pending');
    const item = await c.storage.store.get('A', saved.operationId);
    await reject(() => c.storage.store.create({ ...item, initialStatus: 'confirmed' }));
    await reject(() => c.storage.store.create({ ...item, initialStatus: 'resolved_preserved' }));
});
test('exportación íntegra incluye conflictos historial y originales sin credenciales', async () => {
    const s = await conflictFor(), data = await s.c.service.export('A'); equal(data.conflicts.length, 1); assert(data.conflictHistory.length);
    equal(data.operations[0].envelope.payload.operationId, s.saved.operationId); assert(!JSON.stringify(data).includes(config.tokenA));
});
test('ID de serie ajena se rechaza y la transacción conserva sesión y comprobantes', async () => {
    const a = await initial(), b = await initial();
    const response = await request(operation('workout.replaceSets', { logId: a.workoutLog.id, expectedVersion: a.sessionVersion,
        changes: { session: { notes: 'no debe guardarse' }, updates: [{ id: b.workoutLog.sets[0].id, fields: { weight: 500 } }] } }));
    equal(response.status, 409); equal((await read(a.workoutLog.id)).body.sessionVersion, a.sessionVersion);
});
test('contrato rechaza sets más changes, campos prohibidos, NaN, ciclos y órdenes incompletos', async () => {
    const base = await initial();
    for (const changes of [{ session: { exerciseId: 'B-Exercise' } }, { updates: [{ id: base.workoutLog.sets[0].id, fields: { weight: -1 } }] }, { order: [base.workoutLog.sets[0].id] }]) {
        const r = await request(operation('workout.replaceSets', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion, changes })); assert([409, 422].includes(r.status));
    }
    await reject(() => Promise.resolve(normalizePayload(operation('workout.replaceSets', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion, changes: { session: { notes: 'a' } }, sets: [fields] }))));
    await reject(() => Promise.resolve(normalizePayload(operation('workout.replaceSets', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion, changes: { updates: [{ id: 'x', fields: { weight: NaN } }] } }))));
    const c = client(); await c.sync.transport.remember({ id: 'A' }, account.token); online = false;
    const saved = await captured(c, base, { session: { notes: 'x' } }); const row = (await c.storage.store.get('A', saved.operationId));
    await reject(() => c.storage.store.create({ ...row, dependsOn: [row.id] }));
    const rest = await c.sync.capture('rest.create', { note: 'Identidad en revisión' });
    await c.storage.store.record('A', rest.operationId, { status: 'conflict', errorCode: 'OPERATION_CONTENT_CONFLICT' });
    equal((await c.service.list('A')).length, 0); // No fake session/tombstone for a creation identity collision.
});
test('cambio de orden mantiene IDs y no modifica campos no seleccionados', async () => {
    const base = await initial(), ids = base.workoutLog.sets.map(v => v.id).reverse();
    const after = await remotePatch(base, { order: ids }); equal(after.workoutLog.sets.map(v => v.id), ids);
    equal(after.workoutLog.sets[0].weight, 70);
    const diff = compareSession(base, { changes: { order: base.workoutLog.sets.map(v => v.id) } }, after); assert(diff.differences.some(v => v.field === 'order'));
});
test('el editor genera cambios mínimos con identidades estables', async () => {
    const base = await initial(), sets = structuredClone(base.workoutLog.sets); sets[1].weight = 75;
    equal(changesFromEditor(base.workoutLog, sets), { updates: [{ id: sets[1].id, fields: { weight: 75 } }] });
    const comparison = compareSession(base, { changes: { session: { notes: 'local' } } }, base);
    equal(selectedChanges(comparison, ['session:notes']), { session: { notes: 'local' } });
});
test('PR sube, baja, empata y elimina serie ganadora con lados dentro de transacción', async () => {
    let snapshot = await initial(); const [a, b] = snapshot.workoutLog.sets;
    snapshot = await remotePatch(snapshot, { updates: [{ id: a.id, fields: { weight: 900, reps: 5 } }, { id: b.id, fields: { weight: 800, reps: 8, weightRight: 950, repsRight: 5 } }] });
    snapshot = await remotePatch(snapshot, { updates: [{ id: a.id, fields: { weight: 950, reps: 5 } }] });
    snapshot = await remotePatch(snapshot, { removals: [b.id], updates: [{ id: a.id, fields: { weight: 90, reps: 10 } }] });
    equal(snapshot.workoutLog.sets.length, 1); equal(snapshot.workoutLog.sets[0].weight, 90);
});
test('Atajo legacy sigue siendo aditivo y obliga a revisar una versión leída antes', async () => {
    const created = await request(operation('workout.create', { exerciseId: 'A-Exercise', notes: 'Atajo preserva esta nota', sets: [fields, fields], performedAt: '2026-08-20T18:00:00.000Z' }));
    const base = { ownerId: 'A', ...created.body.result };
    const response = await fetch('/api/shortcuts/log-set', { method: 'POST', headers: { Authorization: `Bearer ${config.tokenA}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: 'A-Exercise', weight: 65, reps: 12, rpe: 8, date: '2026-08-20' }) });
    equal(response.status, 201); const data = await response.json(); assert(data.workoutLog);
    equal(data.workoutLog.id, base.workoutLog.id); equal(data.workoutLog.sets.length, 3);
    equal(data.workoutLog.notes, base.workoutLog.notes); equal(data.workoutLog.sets.slice(0, 2).map(s => s.id), base.workoutLog.sets.map(s => s.id));
    equal((await request(operation('workout.replaceSets', { logId: base.workoutLog.id, expectedVersion: base.sessionVersion, changes: { session: { notes: 'obsoleta' } } }))).status, 409);
});
test('upgrade Dexie 2 a 3 conserva operaciones originales sin purga', async () => {
    const name = `nexlift-conflict-test-${crypto.randomUUID()}`, old = createStorageRuntime({ name, conflictsEnabled: false, identity: () => account,
        storage: { length: 0, key: () => null, getItem: () => null }, events: new EventTarget() });
    await old.ready(); await old.db.metadata.put({ key: 'preserved', value: 'original' }); old.close();
    const c = client({ name }); await c.storage.ready(); equal(c.storage.db.verno, 3); equal((await c.storage.db.metadata.get('preserved')).value, 'original');
});
test('dos conexiones IndexedDB que deciden sobre el mismo conflicto sólo crean una operación nueva', async () => {
    const s = await conflictFor(), other = client({ name: s.c.name });
    const proposal = await s.c.service.preview('A', s.saved.operationId, [], 'local'); online = false;
    const results = await Promise.allSettled([s.c.service.confirm('A', proposal), other.service.confirm('A', proposal)]);
    equal(results.filter(r => r.status === 'fulfilled').length, 1); equal((await s.c.storage.store.list('A')).length, 2);
});

export async function prepareSharedDecision() {
    const s = await conflictFor(), proposal = await s.c.service.preview('A', s.saved.operationId, [], 'local');
    return { proposal, name: s.c.name, clock };
}
export async function confirmSharedDecision(data, settings) {
    config = settings; account = { ownerId: 'A', token: config.tokenA }; online = false; clock = data.clock;
    const c = client({ name: data.name });
    try { await c.service.confirm('A', data.proposal); return { prepared: true }; } catch { return { prepared: false }; }
}

export const caseNames = cases.map(v => v.name);
export async function runCase(index, settings) {
    config = settings; account = { ownerId: 'A', token: config.tokenA }; online = true; clock = Date.parse('2026-10-18T18:00:00.000Z');
    try { await cases[index].fn(); return { passed: true }; }
    finally { for (const c of runtimes.splice(0)) c.storage.close(); }
}
let lostState;
export async function prepareLostReply() {
    const s = await conflictFor({ weight: 277 }, { weight: 278 }), proposal = await s.c.service.preview('A', s.saved.operationId, [], 'local');
    lostState = { s, proposal }; return true;
}
export async function sendLostReply() {
    const { s, proposal } = lostState;
    // The native runner arms loss AFTER actual PostgreSQL commit. No mock ACK.
    const result = await s.c.service.confirm('A', proposal);
    return { status: result.status, id: result.id, conflictId: s.saved.operationId, name: s.c.name, setId: s.id, clock };
}
export async function recoverLostReply(saved, settings) {
    config = settings; account = { ownerId: 'A', token: settings.tokenA }; online = true; clock = saved.clock + 600000;
    const c = client({ name: saved.name }); await c.sync.run(); const item = await c.storage.store.get('A', saved.id);
    equal((await c.service.list('A')).find(v => v.id === saved.conflictId).status, 'resolved_local');
    return { status: item.status, setId: saved.setId };
}
export async function seedVisibleConflict() {
    // Seed the actual React singleton so the visible UI uses persisted records.
    const ui = getStorageRuntime(); await ui.ready();
    const base = await initial();
    const visible = client({ name: 'nexlift-offline' });
    const local = await captured(visible, base, { session: { notes: 'UI local' } });
    await remotePatch(base, { session: { notes: 'UI servidor' } }); online = true; await visible.sync.run();
    equal((await visible.storage.store.get('A', local.operationId)).status, 'conflict');
    return true;
}
