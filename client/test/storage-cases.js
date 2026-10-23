// Executed by REAL Edge via the disposable PostgreSQL/HTTP harness. No IDB mock.
import Dexie from 'dexie';
import { createStorageRuntime } from '../src/storage/runtime.js';
import { createDatabase, schemaV1 } from '../src/storage/database.js';
import { createCoordination } from '../src/storage/coordination.js';
import { createOperationRepository } from '../src/storage/operationRepository.js';
import { createOperationStore, OPERATION_PREFIX } from '../src/services/operationStore.js';
import { normalizePayload, payloadHash, sha256 } from '../src/services/operationProtocol.js';
import { createOperationSync } from '../src/services/operationSync.js';
import { createOperationTransport } from '../src/services/operationTransport.js';
import { storageEstimate, requestPersistence } from '../src/storage/storageHealth.js';
import { inspectLegacy } from '../src/storage/migrationService.js';
import { mexicoCityDateStr } from '../src/utils/dates.js';

const assert = (value, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const equal = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);
const reject = async (task, code) => {
    let failure; try { await task(); } catch (error) { failure = error; }
    assert(failure, 'Expected rejection'); if (code) equal(failure.code, code); return failure;
};
const sets = [{ weight: 180, reps: 8, rpe: 8, weightRight: 150, repsRight: 10, completed: true },
    { weight: 10, reps: 2, rpe: 7, completed: false }];
const performedAt = '2026-10-20T05:59:59.999Z', expectedVersion = 'a'.repeat(64);
let runtimes = [], names = [], config, identity, clock;
const memoryStorage = () => {
    const map = new Map();
    return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k),
        key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
};
const freshName = () => { const name = `nexlift-storage-test-${crypto.randomUUID()}`; names.push(name); return name; };
function runtime(options = {}) {
    const value = createStorageRuntime({ name: freshName(), storage: memoryStorage(), identity: () => identity,
        now: () => clock, events: new EventTarget(), ...options });
    runtimes.push(value); return value;
}
async function envelope(kind = 'workout.create', input = {}, ownerId = 'A') {
    const payload = normalizePayload({ operationId: crypto.randomUUID(), source: 'pwa', kind, performedAt,
        ...(kind === 'workout.create' ? { exerciseId: `${ownerId}-Exercise`, sets, notes: 'Literal original' }
            : kind === 'rest.create' ? {} : { logId: 'synthetic-log', expectedVersion, ...(kind === 'workout.delete' ? {} : { sets }) }), ...input });
    return { format: 1, id: payload.operationId, ownerId, payload, requestHash: await payloadHash(payload), originalDay: mexicoCityDateStr(performedAt),
        createdAt: clock, localOrder: 1, dependsOn: [], initialStatus: 'pending' };
}
function seed(storage, item) { storage.setItem(`${OPERATION_PREFIX}${encodeURIComponent(item.ownerId)}:${item.id}:payload`, JSON.stringify(item)); }
function engine(r, { offline = false, fetcher = fetch } = {}) {
    const requests = [], transport = createOperationTransport({ apiUrl: '/api', identity: () => identity, storage: localStorage,
        fetcher: async (...args) => { requests.push({ url: args[0], method: args[1].method, body: args[1].body }); return fetcher(...args); } });
    const sync = createOperationSync({ store: r.store, transport, enabled: true, now: () => clock, online: () => !offline, setTimer: () => 0, clearTimer: () => {} });
    return { sync, transport, requests };
}
async function capture(e, ownerId = 'A') {
    await e.transport.remember({ id: ownerId }, identity.token);
    return e.sync.capture('workout.create', { exerciseId: `${ownerId}-Exercise`, sets, notes: 'Navegador IndexedDB' }, { performedAt, ownerId });
}
async function head(r) { return (await r.store.list('A'))[0]; }
const cases = [];
const test = (name, task) => cases.push({ name, task });

test('primera instalación crea esquema versionado sin datos ni secretos', async () => {
    const r = runtime(); await r.ready(); equal(r.db.verno, 2); equal((await r.store.list('A')).length, 0);
    equal(await r.db.operations.count(), 0); equal((await r.db.metadata.get('migration')).finalCutover, false);
});
test('copia literal desde localStorage real y conserva UUID, fecha, versión y payload', async () => {
    const item = await envelope('workout.replaceSets'), raw = JSON.stringify(item, null, 2);
    const key = `${OPERATION_PREFIX}A:${item.id}:payload`; localStorage.setItem(key, raw);
    const r = runtime({ storage: localStorage }); await r.ready();
    const found = await r.store.get('A', item.id); equal(found.payload, item.payload); equal(found.id, item.id);
    equal(found.payload.expectedVersion, expectedVersion); equal(found.payload.performedAt, performedAt);
    equal(localStorage.getItem(key), raw); equal((await r.db.sources.where('key').equals(key).first()).raw, raw);
});
test('fase 1.2: cola v2 y array antiguo quedan bloqueados sin asignar dueño', async () => {
    const storage = memoryStorage(); storage.setItem('nexlift_offline_queue', JSON.stringify([{ id: 'old', timestamp: 'yesterday', payload: { weight: 33 } }]));
    storage.setItem('nexlift_offline_op_v2:owned', JSON.stringify({ version: 2, id: 'owned', ownerId: 'A', op: 'logWorkout', payload: { sets } }));
    const r = runtime({ storage }); await r.ready(); equal((await r.store.list('A')).length, 0); equal(await r.db.sources.where('status').equals('blocked').count(), 2);
    equal((await r.db.sources.where('key').equals('nexlift_offline_queue').first()).ownerId, null);
});
test('migración repetida conserva 1000 operaciones sin duplicados ni cambio de hashes', async () => {
    const storage = memoryStorage(), originals = [];
    for (let i = 0; i < 1000; i++) { const item = await envelope(); item.localOrder = i + 1; originals.push(item); seed(storage, item); }
    const name = freshName(), a = runtime({ name, storage }); await a.ready(); await a.ready(); a.close();
    const b = runtime({ name, storage }); await b.ready(); const found = await b.store.list('A'); equal(found.length, 1000);
    equal(found.map(row => row.requestHash), originals.map(row => row.requestHash)); equal(await b.db.sources.count(), 1000);
    equal(new Set(found.map(row => row.id)).size, 1000);
});
test('fase 3.2: migra eventos y comprobantes verificados sin repetir HTTP ni perder errores', async () => {
    const storage = memoryStorage(), legacy = createOperationStore({ storage });
    const transport = createOperationTransport({ apiUrl: '/api', identity: () => identity, storage });
    await transport.remember({ id: 'A' }, identity.token);
    const sync = createOperationSync({ store: legacy, transport, enabled: true, now: () => clock, setTimer: () => 0, clearTimer: () => {} });
    const made = await sync.capture('workout.create', { exerciseId: 'A-Exercise', sets });
    const before = await legacy.get('A', made.operationId); equal(before.status, 'confirmed');
    const r = runtime({ storage }); await r.ready(); const after = await r.store.get('A', made.operationId);
    equal(after.payload, before.payload); equal(after.receipt, before.receipt); equal(after.history, before.history);
    equal(await r.db.receipts.count(), 1); const e = engine(r); await e.sync.run(); equal(e.requests.length, 0);
});
for (const stage of ['copied', 'batch', 'before_receipt']) test(`reanuda después de interrupción en ${stage} sin duplicar`, async () => {
    const storage = memoryStorage(), item = await envelope(); seed(storage, item); const name = freshName();
    const a = runtime({ name, storage, checkpoint: async point => { if (point === stage) throw new Error('simulated process interruption'); } });
    await reject(() => a.ready()); a.close(); const b = runtime({ name, storage }); await b.ready();
    equal((await b.store.list('A')).length, 1); equal((await head(b)).payload, item.payload); equal((await b.db.metadata.get('migration')).verified, true);
});
test('legacy corrupto, fecha ambigua y sin dueño se conservan bloqueados junto a registros válidos', async () => {
    const storage = memoryStorage(), good = await envelope(); seed(storage, good);
    storage.setItem('workout_old', '{broken'); storage.setItem('nexlift_draft_v2:unknown', JSON.stringify({ version: 2, data: sets }));
    const bad = { ...await envelope(), ownerId: null }; seed(storage, bad);
    const ambiguous = await envelope(); ambiguous.payload.performedAt = '10/19/26'; seed(storage, ambiguous);
    const r = runtime({ storage }); await r.ready(); equal((await r.store.list('A')).length, 1);
    equal(await r.db.sources.where('status').equals('blocked').count(), 4); equal(storage.getItem('workout_old'), '{broken');
});
test('nunca importa autenticación, cachés ni credenciales ocultas en legacy', async () => {
    const storage = memoryStorage(); storage.setItem('nexlift_token', config.tokenA); storage.setItem('nexlift_user', '{"id":"A"}');
    storage.setItem('nexlift_lastExercise', 'Press'); storage.setItem('nexlift_draft_v2:bad', JSON.stringify({ token: config.tokenA }));
    const r = runtime({ storage }); await r.ready(); equal(await r.db.sources.count(), 1);
    const dump = JSON.stringify(await r.db.sources.toArray()); assert(!dump.includes(config.tokenA)); assert(!dump.includes('nexlift_token'));
});
test('escritura de pestaña antigua durante copia impide marcar verificación completa', async () => {
    const storage = memoryStorage(), first = await envelope(), second = await envelope(); seed(storage, first); let once = true;
    const r = runtime({ storage, checkpoint: async point => { if (point === 'before_receipt' && once) { once = false; seed(storage, second); } } });
    await reject(() => r.ready()); equal((await r.db.metadata.get('migration')).verified, false);
    await r.ready(); equal((await r.store.list('A')).length, 2); equal((await r.db.metadata.get('migration')).finalCutover, false);
});
test('escrituras legacy posteriores y eventos tardíos se reconcilian sin sobrescribir payload', async () => {
    const storage = memoryStorage(), item = await envelope(); seed(storage, item); const r = runtime({ storage }); await r.ready();
    const old = createOperationStore({ storage }); await old.record('A', item.id, { status: 'conflict', attempts: 1, lastError: '409' });
    equal((await head(r)).status, 'conflict'); const second = await envelope(); seed(storage, second); equal((await r.store.list('A')).length, 2);
    equal((await r.store.get('A', item.id)).payload, item.payload);
});
test('colisión de identidad legacy se conserva y bloquea el envío automático', async () => {
    const storage = memoryStorage(), item = await envelope(); seed(storage, item); const r = runtime({ storage }); await r.ready();
    const changed = structuredClone(item); changed.payload.notes = 'different'; changed.requestHash = await payloadHash(changed.payload); seed(storage, changed);
    equal((await head(r)).status, 'blocked_migration'); equal((await head(r)).payload, item.payload);
    equal(await r.db.sources.count(), 2);
});
test('fallo entre operación y metadatos revierte ambas tablas', async () => {
    const r = runtime(); await r.ready(); const item = await envelope();
    r.db.metadata.hook('creating', function () { throw new DOMException('injected', 'QuotaExceededError'); });
    const error = await reject(() => r.store.create(item)); assert(error.isStorageError); equal(await r.db.operations.count(), 0);
});
test('cuota agotada al guardar no confirma éxito ni ejecuta HTTP', async () => {
    const r = runtime(); await r.ready(); const e = engine(r);
    r.db.operations.hook('creating', function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); });
    const error = await reject(() => capture(e)); assert(error.isStorageError); equal(e.requests.length, 0); equal(await r.db.operations.count(), 0);
});
test('fallo al registrar comprobante revierte evento y confirmación; reconcilia sin otro POST', async () => {
    const r = runtime(), e = engine(r); await r.ready();
    const fail = function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); };
    r.db.receipts.hook('creating', fail); await reject(() => capture(e));
    equal((await head(r)).status, 'syncing'); equal(await r.db.receipts.count(), 0);
    assert(!(await head(r)).history.some(event => event.status === 'confirmed'));
    r.db.receipts.hook('creating').unsubscribe(fail); await e.sync.run(); equal((await head(r)).status, 'confirmed');
    equal(e.requests.filter(row => row.method === 'POST').length, 1); equal(await r.db.receipts.count(), 1);
});
test('borradores se recuperan y actualizan con identidad estable y revisiones atómicas', async () => {
    const r = runtime(), editor = r.drafts.editor('workout', 'dayA', 'A');
    const original = { workoutData: { e: [{ weight: '80', reps: '7', rir: 2, weightR: '77', repsR: '8' }] }, sessionBases: { e: { logId: 'l', sessionVersion: expectedVersion } } };
    const a = await editor.save(original); const b = await editor.save({ ...original, completedExerciseIds: ['e'] });
    equal(a.id, b.id); equal(b.version, 2); equal(await r.db.draftVersions.count(), 2);
    equal(await r.drafts.editor('workout', 'dayA', 'A').load(), b.data); equal(a.data, original);
});
test('borrador legacy v2 conserva versión remota y no mezcla el día anterior', async () => {
    const storage = memoryStorage(), original = { session: { sessionVersion: expectedVersion }, sets };
    storage.setItem('nexlift_draft_v2:known', JSON.stringify({ version: 2, ownerId: 'A', kind: 'session', resourceId: 'l', originalDay: '2026-10-18', createdAt: clock - 86400000, updatedAt: clock - 86400000, data: original }));
    storage.setItem('nexlift_draft_v2:yesterday', JSON.stringify({ version: 2, ownerId: 'A', kind: 'workout', resourceId: 'd', originalDay: '2026-10-18', createdAt: clock - 86400000, updatedAt: clock - 86400000, data: original }));
    const r = runtime({ storage }); equal(await r.drafts.editor('session', 'l', 'A').load(), original);
    equal(await r.drafts.editor('workout', 'd', 'A').load(), null); equal((await r.drafts.list('A')).length, 2);
});
test('fallo a mitad de revisión de borrador revierte contenido y versión', async () => {
    const r = runtime(), editor = r.drafts.editor('session', 'l', 'A'); await editor.save({ sets });
    const fail = function () { throw new Error('injected write failure'); }; r.db.drafts.hook('updating', fail);
    await reject(() => editor.save({ sets: [] })); equal(await r.db.draftVersions.count(), 1);
    r.db.drafts.hook('updating').unsubscribe(fail); equal((await editor.save({ sets: [] })).version, 2);
});
test('revisiones legacy simultáneas ambiguas conservan ambas versiones para revisión', async () => {
    const storage = memoryStorage(), draft = { version: 2, ownerId: 'A', kind: 'session', resourceId: 'l', originalDay: '2026-10-19', createdAt: clock, updatedAt: clock, data: { sets } };
    storage.setItem('nexlift_draft_v2:collision', JSON.stringify(draft)); const r = runtime({ storage }); await r.ready();
    storage.setItem('nexlift_draft_v2:collision', JSON.stringify({ ...draft, data: { sets: [] } })); await r.ready();
    equal(await r.db.draftVersions.count(), 2); equal((await r.db.drafts.get(['A', 'collision'])).recovery, 'requires_review');
    equal(await r.drafts.editor('session', 'l', 'A').load(), null); equal((await r.export('A')).draftVersions.length, 2);
});
test('dos cuentas conservan sus datos sin mostrar ni sincronizar datos ajenos', async () => {
    const r = runtime(), e = engine(r, { offline: true }); await capture(e); await r.drafts.editor('session', 'l', 'A').save({ sets });
    identity = { ownerId: 'B', token: config.tokenB }; const b = engine(r); await b.sync.run(); equal(b.requests.length, 0);
    equal((await r.drafts.list('A')).length, 0); equal((await r.export('B')).operations.length, 0);
    await reject(() => r.drafts.editor('session', 'l', 'A').save({ sets }));
    identity = { ownerId: 'A', token: config.tokenA }; equal((await head(r)).status, 'pending'); equal((await r.drafts.list('A')).length, 1);
});
test('respuesta HTTP tardía de A no confirma bajo B y se recupera al volver A', async () => {
    const r = runtime(), e = engine(r, { fetcher: async (...args) => { const response = await fetch(...args); if (args[1].method === 'POST') identity = { ownerId: 'B', token: config.tokenB }; return response; } });
    await capture(e); equal((await head(r)).status, 'syncing'); identity = { ownerId: 'A', token: config.tokenA };
    const back = engine(r); await back.sync.run(); equal((await head(r)).status, 'confirmed'); equal(back.requests.filter(row => row.method === 'POST').length, 0);
});
test('dos adaptadores concurrentes con lease IDB ejecutan un solo POST', async () => {
    const name = freshName(), a = runtime({ name, locks: null }), b = runtime({ name, locks: null }); await capture(engine(a, { offline: true }));
    const x = engine(a), y = engine(b); await Promise.all([x.sync.run(), y.sync.run()]); equal((await head(a)).status, 'confirmed');
    equal([...x.requests, ...y.requests].filter(row => row.method === 'POST').length, 1);
});
test('lease expirado recupera liderazgo y el proceso antiguo no puede cambiar estado', async () => {
    const name = freshName(), a = runtime({ name, locks: null }), b = runtime({ name, locks: null }); const item = await envelope(); await a.store.create(item); await b.ready();
    const ca = createCoordination({ db: a.db, locks: null, now: () => clock, leaseMs: 10000 });
    const cb = createCoordination({ db: b.db, locks: null, now: () => clock, leaseMs: 10000 });
    const ra = createOperationRepository({ db: a.db, coordination: ca, now: () => clock });
    const rb = createOperationRepository({ db: b.db, coordination: cb, now: () => clock });
    await ca.withLock('A', async () => {
        clock += 10001;
        await cb.withLock('A', () => rb.record('A', item.id, { status: 'conflict', attempts: 2 }));
        await reject(() => ra.record('A', item.id, { status: 'pending' }), 'LEADERSHIP_LOST');
    });
    equal((await head(b)).status, 'conflict');
});
test('renovación encolada después de liberar liderazgo no pisa un nuevo titular', async () => {
    const name = freshName(), a = runtime({ name, locks: null }), b = runtime({ name, locks: null }); await a.ready(); await b.ready();
    let renewal;
    const ca = createCoordination({ db: a.db, locks: null, now: () => clock, scheduleRenewal: fn => { renewal = fn; }, cancelRenewal: () => {} });
    const cb = createCoordination({ db: b.db, locks: null, now: () => clock });
    await ca.withLock('A', async () => {});
    await cb.withLock('A', async () => {
        const before = await b.db.leases.get('sync:A'); await renewal(); equal(await b.db.leases.get('sync:A'), before);
    });
});
test('errores 409 conservan expectedVersion sin rebase', async () => {
    const r = runtime(), e = engine(r); const made = await capture(e);
    const pending = runtime(), off = engine(pending, { offline: true }); await off.transport.remember({ id: 'A' }, identity.token);
    await off.sync.capture('workout.replaceSets', { logId: made.workoutLog.id, expectedVersion: made.sessionVersion, sets });
    await e.sync.capture('workout.appendSet', { logId: made.workoutLog.id, expectedVersion: made.sessionVersion, sets: [sets[0]] });
    await engine(pending).sync.run(); equal((await head(pending)).status, 'conflict'); equal((await head(pending)).payload.expectedVersion, made.sessionVersion);
});
test('JWT inválido pausa la cola y vuelve con la credencial verificada', async () => {
    const r = runtime(); await capture(engine(r, { offline: true })); identity = { ownerId: 'A', token: 'invalid-synthetic-token' };
    const e = engine(r); await e.sync.run(); equal((await head(r)).status, 'paused_auth'); equal(e.requests.filter(row => row.method === 'POST').length, 0);
    identity = { ownerId: 'A', token: config.tokenA }; await e.sync.retry(); equal((await head(r)).status, 'confirmed');
});
test('503 y 429 conservan payload/backoff y respetan Retry-After', async () => {
    for (const status of [503, 429]) {
        const r = runtime(), e = engine(r, { fetcher: () => Promise.resolve(new Response('{}', { status, headers: { 'Retry-After': '120' } })) });
        await capture(e); const item = await head(r); equal(item.status, 'retry_scheduled'); assert(item.nextRetryAt >= clock + 120000);
        const previous = e.requests.length; await e.sync.retry(); equal(e.requests.length, previous); equal((await head(r)).payload, item.payload);
    }
});
test('respuesta perdida después de COMMIT se reconcilia por comprobante sin duplicar', async () => {
    const r = runtime(), e = engine(r, { fetcher: async (...args) => { const response = await fetch(...args); if (args[1].method === 'POST') throw new TypeError('lost after commit'); return response; } });
    await capture(e); const item = await head(r); equal(item.status, 'retry_scheduled'); clock = item.nextRetryAt + 1;
    const back = engine(r); await back.sync.run(); equal((await head(r)).status, 'confirmed'); equal(back.requests.filter(row => row.method === 'POST').length, 0);
});
test('dependencias se conservan bloqueadas después de reiniciar el adaptador', async () => {
    const made = await capture(engine(runtime())), name = freshName(), r = runtime({ name }), off = engine(r, { offline: true });
    await off.transport.remember({ id: 'A' }, identity.token); const input = { logId: made.workoutLog.id, expectedVersion: made.sessionVersion, sets };
    await off.sync.capture('workout.replaceSets', input); clock++; await off.sync.capture('workout.replaceSets', input); r.close();
    const back = runtime({ name }); await engine(back).sync.run(); const items = await back.store.list('A');
    equal(items.map(item => item.status), ['confirmed', 'blocked_dependency']); equal(items[1].dependsOn, [items[0].id]);
});
test('exporta íntegramente pendientes, comprobantes, revisiones y originales sin JWT', async () => {
    const storage = memoryStorage(), item = await envelope(); seed(storage, item); const r = runtime({ storage }); await r.ready();
    await r.drafts.editor('session', 'l', 'A').save({ sets }); const data = await r.export('A');
    equal(data.operations[0].envelope, item); equal(data.originals[0].raw, storage.getItem(data.originals[0].key));
    equal(data.draftVersions.length, 1); assert(!JSON.stringify(data).includes(config.tokenA)); equal(await sha256(data.sources[0].raw), data.sources[0].hash);
});
test('upgrade v1 a v2 conserva operaciones y agrega metadatos sin recrear datos', async () => {
    const name = freshName(), old = new Dexie(name); old.version(1).stores(schemaV1); await old.open();
    const item = await envelope(); await old.operations.add({ ownerId: 'A', id: item.id, envelope: item, status: 'pending', attempts: 0, dependsOn: [], createdAt: clock }); old.close();
    const r = runtime({ name }); await r.ready(); equal((await head(r)).payload, item.payload); equal((await r.db.metadata.get('schema')).version, 2);
});
test('pestaña antigua bloquea upgrade; al cerrarse continúa sin borrar la base', async () => {
    const name = freshName(), old = new Dexie(name); old.version(1).stores(schemaV1); old.on('versionchange', () => false); await old.open();
    let blocked = false; const newer = createDatabase({ name, onHealth: health => { if (health.status === 'blocked') blocked = true; } });
    const opened = newer.open();
    for (let i = 0; i < 100 && !blocked; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert(blocked); old.close(); await opened; equal(newer.verno, 2); newer.close();
});
test('esquema futuro se rechaza sin downgrade ni eliminación', async () => {
    const name = freshName(), future = new Dexie(name); future.version(3).stores({ ...schemaV1, future: '&id' }); await future.open();
    await future.table('future').put({ id: 'preserved' }); future.close(); const r = runtime({ name });
    await reject(() => r.ready(), 'VersionError'); r.close(); const check = new Dexie(name); await check.open(); equal(await check.table('future').count(), 1); check.close();
});
test('IndexedDB cerrado y lectura fallida no usan memoria y permiten exportar legacy', async () => {
    const storage = memoryStorage(), item = await envelope(); seed(storage, item); const r = runtime({ storage }); await r.ready(); r.close();
    const error = await reject(() => r.store.list('A')); assert(error.isStorageError);
    const data = await r.export('A'); equal(data.available, false); equal(JSON.parse(data.originals[0].raw), item);
});
test('IndexedDB no disponible falla explícitamente y exporta originales sin fallback en memoria', async () => {
    const dependency = Dexie.dependencies.indexedDB, storage = memoryStorage(), item = await envelope(); seed(storage, item);
    let r;
    try {
        Dexie.dependencies.indexedDB = undefined; r = runtime({ storage });
        const error = await reject(() => r.ready()); assert(error.isStorageError);
        const data = await r.export('A'); equal(data.available, false); equal(JSON.parse(data.originals[0].raw), item);
    } finally { r?.close(); Dexie.dependencies.indexedDB = dependency; }
});
test('fallo de lectura no modifica ni purga operaciones recuperables', async () => {
    const r = runtime(), item = await envelope(); await r.store.create(item);
    const fail = () => { throw new Error('synthetic read failure'); }; r.db.operations.hook('reading', fail);
    const error = await reject(() => r.store.list('A')); assert(error.isStorageError);
    r.db.operations.hook('reading').unsubscribe(fail); equal((await head(r)).payload, item.payload);
});
test('políticas del navegador se detectan sin prometer retención absoluta', async () => {
    const value = await storageEstimate(); equal(value.estimateSupported, true); assert(Number.isFinite(value.quota));
    equal(typeof await requestPersistence(), 'boolean'); equal(await requestPersistence({}), false);
    const missing = await storageEstimate({}); equal(missing.persistSupported, false);
});
test('payload inválido, NaN o secreto no llega a IndexedDB ni a HTTP', async () => {
    const r = runtime(), item = await envelope(); item.payload.sets[0].weight = NaN; await reject(() => r.store.create(item));
    const secret = await envelope(); secret.token = config.tokenA; await reject(() => r.store.create(secret)); equal(await r.db.operations.count(), 0);
});
test('confirmación absorbente impide que una respuesta vieja degrade el estado', async () => {
    const r = runtime(), e = engine(r); const made = await capture(e); const original = await r.store.get('A', made.operationId);
    await r.store.record('A', made.operationId, { status: 'retry_scheduled', attempts: 100, nextRetryAt: clock + 50000 });
    equal(await r.store.get('A', made.operationId), original); equal(await r.db.receipts.count(), 1);
});

export const caseNames = cases.map(entry => entry.name);
export async function runCase(index, settings) {
    config = settings; identity = { ownerId: 'A', token: config.tokenA }; clock = Date.parse(performedAt); runtimes = []; names = [];
    // This origin/profile is created solely for these synthetic tests.
    for (const { key } of inspectLegacy(localStorage)) localStorage.removeItem(key);
    try { await cases[index].task(); return { passed: true }; }
    finally {
        for (const r of runtimes) r.close();
        for (const name of new Set(names)) { assert(name.startsWith('nexlift-storage-test-')); await Dexie.delete(name); }
    }
}
