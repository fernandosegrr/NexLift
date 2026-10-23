import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createOperationStore, OPERATION_PREFIX } from './operationStore.js';
import { createOperationTransport } from './operationTransport.js';
import { createOperationSync, retryDeadline } from './operationSync.js';
import { normalizePayload, payloadHash, verifyReceipt } from './operationProtocol.js';
import { parseOperation, requestHash } from '../../../server/src/services/operationContract.js';
import { mexicoCityDateStr } from '../utils/dates.js';

const sets = [{ weight: 80, reps: 10, rir: 2, completed: true }, { weight: 30, reps: 8, rpe: 7, weightRight: 35, repsRight: 6, completed: false }];
const version = 'a'.repeat(64);
let data, storage, identity, calls, receipts, mode, clock, engine, transport, store, timers;
const response = (status, body, headers) => new Response(JSON.stringify(body), { status, headers });
function receipt(payload) {
    const clean = normalizePayload(payload);
    return { protocolVersion: 1, ownerId: identity.ownerId, requestHash: requestHash(parseOperation(payload)), replayed: false,
        operation: { operationId: payload.operationId, kind: payload.kind, source: 'pwa', state: 'confirmed', performedAt: payload.performedAt,
            performedDay: mexicoCityDateStr(payload.performedAt) },
        result: payload.kind === 'rest.create' ? { restLog: { id: 'rest1', userId: identity.ownerId, note: clean.note, date: payload.performedAt } }
            : payload.kind === 'workout.delete' ? { deleted: true, logId: payload.logId }
                : { sessionVersion: version, workoutLog: { id: payload.logId || `log-${payload.operationId}`, exerciseId: payload.exerciseId,
                    date: payload.performedAt, notes: clean.notes, sets: clean.sets.map((set, i) => ({ ...set, id: `set-${i}`, setNumber: i + 1 })) } } };
}
async function fetcher(url, options) {
    calls.push({ url, method: options.method, payload: options.body && JSON.parse(options.body), token: options.headers.Authorization });
    if (url.endsWith('workout-capabilities')) return response(200, { protocolVersion: 1, receiptFormat: 'sha256-v1', userId: identity.ownerId,
        enabled: true, ready: true, kinds: ['workout.create', 'workout.appendSet', 'workout.replaceSets', 'workout.delete', 'rest.create'] });
    if (options.method === 'GET') {
        const found = receipts.get(url.split('/').at(-1));
        return response(found ? 200 : 404, found ? { ...found, replayed: true } : { code: 'OPERATION_NOT_FOUND' });
    }
    expect((await store.list(identity.ownerId)).some(item => item.id === JSON.parse(options.body).operationId)).toBe(true);
    if (typeof mode === 'number') return response(mode, { code: mode === 409 ? 'SESSION_VERSION_CONFLICT' : 'SYNTHETIC' }, { 'Retry-After': '120' });
    const body = JSON.parse(options.body), result = receipt(body);
    receipts.set(body.operationId, result);
    if (mode === 'lost') throw new TypeError('lost response');
    if (mode === 'generic') return response(200, { ok: true });
    if (mode === 'wrong') return response(201, { ...result, ownerId: 'B' });
    return response(201, result);
}
function construct(extra = {}) {
    store = createOperationStore({ storage, now: () => clock });
    transport = createOperationTransport({ apiUrl: 'http://synthetic/api', identity: () => identity, storage, fetcher });
    engine = createOperationSync({ store, transport, enabled: true, now: () => clock, online: () => true,
        setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}, ...extra });
    return engine;
}
beforeEach(async () => {
    vi.useFakeTimers();
    data = new Map(); storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null, get length() { return data.size; } };
    clock = Date.parse('2026-10-19T05:59:59.999Z'); identity = { ownerId: 'A', token: 'synthetic-token-A' };
    calls = []; receipts = new Map(); mode = 'normal'; timers = []; construct();
    await transport.remember({ id: 'A' }, identity.token);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const capture = (input = {}, context) => engine.capture('workout.create', { exerciseId: 'exA', sets, notes: 'Original', ...input }, context);
const head = async () => (await store.list('A'))[0];
it('UUID único antes de HTTP, contenido y comprobante durables', async () => {
    const a = await capture(), b = await capture();
    expect(a.operationId).not.toBe(b.operationId); expect(a.syncStatus).toBe('confirmed');
    expect((await store.list('A')).every(item => item.receipt && item.history.length >= 2)).toBe(true);
    expect(JSON.stringify([...data.values()])).not.toContain(identity.token);
});
it('hash del navegador coincide exactamente con el contrato SQL de 3.1', async () => {
    for (const [kind, input] of [['workout.create', { exerciseId: 'e', sets, notes: null }], ['rest.create', {}],
        ['workout.appendSet', { logId: 'l', expectedVersion: version, sets: sets.slice(0, 1) }],
        ['workout.replaceSets', { logId: 'l', expectedVersion: version, sets }], ['workout.delete', { logId: 'l', expectedVersion: version }]]) {
        const payload = normalizePayload({ operationId: crypto.randomUUID(), source: 'pwa', kind, performedAt: new Date(clock).toISOString(), ...input });
        expect(await payloadHash(payload)).toBe(requestHash(parseOperation(payload)));
    }
});
it('fallo al crear el journal no envía POST ni presenta un éxito local', async () => {
    storage.setItem = () => { throw new Error('quota'); };
    await expect(capture()).rejects.toMatchObject({ isStorageError: true }); expect(calls).toHaveLength(0);
});
it('fallo local al confirmar se recupera por comprobante tras reiniciar', async () => {
    const record = store.record;
    store.record = (...args) => { if (args[2].status === 'confirmed') throw Object.assign(new Error('quota'), { isStorageError: true }); return record(...args); };
    await expect(capture()).rejects.toMatchObject({ isStorageError: true });
    construct(); await engine.run(); expect((await head()).status).toBe('confirmed');
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
});
it('respuesta perdida se reconcilia por ID sin un segundo POST al reiniciar', async () => {
    mode = 'lost'; const result = await capture(); expect(result.queued).toBe(true);
    const original = (await head()).payload; clock += 6000; mode = 'normal'; construct(); await engine.run();
    expect((await head()).status).toBe('confirmed'); expect((await head()).payload).toEqual(original);
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
});
it('POST rechazado antes de commit reintenta el ID y contenido exactos', async () => {
    mode = 503; await capture(); const original = (await head()).payload;
    clock += 121000; mode = 'normal'; await engine.run();
    expect(calls.filter(c => c.method === 'POST').map(c => c.payload)).toEqual([original, original]);
});
it.each([[401, 'paused_auth'], [403, 'blocked_forbidden'], [409, 'conflict'], [400, 'blocked_validation'], [422, 'blocked_validation'],
    [429, 'retry_scheduled'], [500, 'retry_scheduled'], [502, 'retry_scheduled'], [503, 'retry_scheduled']])('HTTP %s conserva payload y estado %s', async (status, expected) => {
    mode = status; await capture(); expect((await head()).status).toBe(expected);
    expect((await head()).payload.sets[1]).toMatchObject({ weightRight: 35, repsRight: 6, completed: false, rpe: 7 });
    const previous = calls.length; await engine.run(); expect(calls.length).toBe(previous);
});
it('Retry-After numérico y fecha HTTP prevalece sobre backoff limitado', () => {
    expect(retryDeadline(1000, '600', clock)).toBe(clock + 600000);
    const date = Math.floor((clock + 3600000) / 1000) * 1000;
    expect(retryDeadline(2, new Date(date).toUTCString(), clock)).toBe(date);
    expect(retryDeadline(1000, null, clock)).toBe(clock + 300000);
});
it('reintento manual respeta Retry-After y no borra tras muchos fallos', async () => {
    mode = 429; await capture(); await engine.retry(); expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
    for (let i = 0; i < 12; i++) { clock = (await head()).nextRetryAt + 1; await engine.run(); }
    expect((await head()).status).toBe('retry_scheduled'); expect((await head()).attempts).toBe(13);
});
it('JWT revocado pausa y exige revalidación antes de reanudar', async () => {
    mode = 401; await capture(); mode = 'normal'; await engine.run(); expect((await head()).status).toBe('paused_auth');
    await engine.retry(); expect((await head()).status).toBe('confirmed');
});
it.each(['generic', 'wrong'])('respuesta %s queda bloqueada sin falso éxito', async value => {
    mode = value; expect((await capture()).queued).toBe(true); expect((await head()).status).toBe('blocked_incompatible');
});
it('no confirma un acuse con hash, fecha, ID, series o versión incompatibles', async () => {
    await capture(); const item = await head();
    const variants = [{ ...item.receipt, requestHash: 'b'.repeat(64) }, { ...item.receipt, operation: { ...item.receipt.operation, operationId: crypto.randomUUID() } },
        { ...item.receipt, result: { ...item.receipt.result, sessionVersion: null } },
        { ...item.receipt, result: { ...item.receipt.result, workoutLog: { ...item.receipt.result.workoutLog, sets: [] } } }];
    for (const body of variants) expect(() => verifyReceipt(item, body, 200)).toThrow();
});
it('cuenta B no consulta ni envía operaciones de A y A las recupera', async () => {
    construct({ online: () => false }); await capture();
    identity = { ownerId: 'B', token: 'synthetic-token-B' }; construct(); await engine.run(); expect(calls).toHaveLength(0);
    identity = { ownerId: 'A', token: 'synthetic-token-A' }; await engine.run(); expect((await head()).status).toBe('confirmed');
});
it('perfil local no es prueba: se verifica cuenta en la capacidad del servidor', async () => {
    construct({ online: () => false }); await capture(); construct();
    transport.request = async () => ({ status: 200, body: { protocolVersion: 1, receiptFormat: 'sha256-v1', userId: 'B', ready: true, enabled: true, kinds: [] } });
    await engine.run(); expect((await head()).status).toBe('blocked_incompatible'); expect(calls).toHaveLength(0);
});
it('cambio de cuenta antes de recibir respuesta no confirma ni modifica la cola de A', async () => {
    const request = transport.request;
    transport.request = async (...args) => { const result = await request(...args); if (args[2]?.method === 'POST') identity = { ownerId: 'B', token: 'B' }; return result; };
    await capture(); expect((await head()).status).toBe('syncing');
    const before = JSON.stringify(await head()); await engine.run(); expect(JSON.stringify(await head())).toBe(before);
});
it('pantalla residual de A no crea una operación bajo B', async () => {
    identity = { ownerId: 'B', token: 'B' };
    await expect(capture({}, { ownerId: 'A' })).rejects.toThrow(); expect(await store.list('B')).toHaveLength(0);
});
it('sin verificación previa no se promete protección offline', async () => {
    data.clear(); construct({ online: () => false });
    await expect(capture()).rejects.toThrow('verificada'); expect(await store.list('A')).toHaveLength(0);
});
it('CDMX conserva el lunes y la hora original al enviar el martes', async () => {
    clock = Date.parse('2026-10-20T05:59:59.999Z');
    construct({ online: () => false }); await capture(); const payload = (await head()).payload;
    clock += 24 * 3600000; construct(); await engine.run();
    expect((await head()).payload).toEqual(payload); expect((await head()).originalDay).toBe('2026-10-19');
    expect((await head()).receipt.result.workoutLog.date).toBe('2026-10-20T05:59:59.999Z');
});
it('cambiar el formulario después de guardar no altera pesos/reps/notas/RIR', async () => {
    const editable = structuredClone(sets); construct({ online: () => false }); await capture({ sets: editable });
    editable[0].reps = 999; editable[1].weightRight = 0; construct(); await engine.run();
    expect(calls.find(c => c.method === 'POST').payload.sets[0].reps).toBe(10);
});
it('edición con expectedVersion no se actualiza para superar un 409', async () => {
    mode = 409; await engine.capture('workout.replaceSets', { logId: 'log1', expectedVersion: version, sets });
    await engine.retry(); expect((await head()).payload.expectedVersion).toBe(version); expect((await head()).errorCode).toBe('SESSION_VERSION_CONFLICT');
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
});
it('dos ediciones locales dependientes conservan ambas y bloquean la segunda', async () => {
    construct({ online: () => false });
    const first = await engine.capture('workout.replaceSets', { logId: 'log1', expectedVersion: version, sets }); clock++;
    await engine.capture('workout.replaceSets', { logId: 'log1', expectedVersion: version, sets: sets.slice(0, 1) });
    const items = await store.list('A'); expect(items[1].dependsOn).toEqual([first.operationId]);
    construct(); await engine.run(); expect((await store.list('A')).map(i => i.status)).toEqual(['confirmed', 'blocked_dependency']);
});
it('legacy ambiguo no se convierte; el original permanece byte por byte', async () => {
    const raw = '[{"op":"logWorkout","payload":{"sets":[1]}}]'; data.set('nexlift_offline_queue', raw);
    construct({ legacyBarrier: () => true }); await capture(); expect((await head()).status).toBe('blocked_dependency');
    expect(data.get('nexlift_offline_queue')).toBe(raw); expect(calls.filter(c => c.method === 'POST')).toHaveLength(0);
});
it('feature flag deshabilitada no consulta capacidades ni reproduce operaciones', async () => {
    construct({ online: () => false }); await capture(); construct({ enabled: false }); await engine.run();
    await expect(capture()).rejects.toThrow('deshabilitada'); expect(calls).toHaveLength(0); expect((await head()).status).toBe('pending');
});
it('backend sin almacén devuelve 503 sin POST ni logout', async () => {
    construct({ online: () => false }); await capture(); construct();
    transport.request = async () => { throw Object.assign(new Error('schema not ready'), { status: 503, body: { code: 'OPERATIONS_NOT_READY' } }); };
    await engine.run(); expect((await head()).status).toBe('retry_scheduled'); expect(identity.token).toBe('synthetic-token-A');
    expect(calls).toHaveLength(0);
});
it('Web Locks coordina dos motores/pestañas y conserva confirmaciones tardías', async () => {
    construct({ online: () => false }); await capture(); let held = false;
    const locks = { request: async (name, options, task) => {
        if (held) return task(null); held = true; try { return await task({}); } finally { held = false; }
    } };
    const a = createOperationSync({ store: createOperationStore({ storage, locks }), transport, enabled: true });
    const b = createOperationSync({ store: createOperationStore({ storage, locks }), transport, enabled: true });
    await Promise.all([a.run(), b.run()]); expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
    const item = await head(); await store.record('A', item.id, { status: 'retry_scheduled' }); expect((await head()).status).toBe('confirmed');
});
it('pageshow/online/visibilitychange reanudan un journal pendiente', async () => {
    construct({ online: () => false }); await capture(); construct();
    const window = new EventTarget(), document = new EventTarget();
    const stop = engine.start(window, document); await engine.run(); expect((await head()).status).toBe('confirmed');
    window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'));
    await engine.run(); stop(); expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
});
it('un payload local alterado se bloquea en lugar de cambiar el hash o reenviarlo', async () => {
    construct({ online: () => false }); await capture();
    const key = [...data.keys()].find(k => k.startsWith(OPERATION_PREFIX) && k.endsWith(':payload'));
    const item = JSON.parse(data.get(key)); item.payload.sets[0].reps++; data.set(key, JSON.stringify(item));
    construct(); await engine.run(); expect((await head()).status).toBe('blocked_incompatible');
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(0);
});
it.each([NaN, Infinity, '80'])('no convierte %s silenciosamente mediante JSON', async weight => {
    await expect(capture({ sets: [{ weight, reps: 5, rpe: 8 }] })).rejects.toThrow(); expect(await store.list('A')).toHaveLength(0);
});
it('store alternativo conserva la interfaz sin acoplar el motor a localStorage', async () => {
    const map = new Map(); const alternate = {
        async list(owner) { return [...map.values()].filter(item => item.ownerId === owner); },
        async get(owner, id) { return (await this.list(owner)).find(item => item.id === id); },
        async create(item) { const result = { ...item, status: item.initialStatus, attempts: 0 }; map.set(item.id, result); return result; },
        async record(owner, id, patch) { const result = { ...await this.get(owner, id), ...patch }; map.set(id, result); return result; },
        async withLock(owner, task) { return task(); }
    };
    engine = createOperationSync({ store: alternate, transport, enabled: true, online: () => false });
    await capture(); expect([...map.values()]).toHaveLength(1);
});
it('operaciones del mismo milisegundo conservan orden causal sin ordenar UUID al azar', async () => {
    construct({ online: () => false });
    const input = { logId: 'log1', expectedVersion: version, sets };
    const a = await engine.capture('workout.replaceSets', input), b = await engine.capture('workout.replaceSets', input);
    expect((await store.list('A')).map(item => item.id)).toEqual([a.operationId, b.operationId]);
    expect((await store.list('A')).map(item => item.localOrder)).toEqual([1, 2]);
});
it('una reautenticación solicitada durante otra pasada no pierde su reanudación', async () => {
    mode = 401; await capture(); mode = 'normal';
    let release;
    const original = store.withLock, held = new Promise(resolve => { release = resolve; });
    store.withLock = async (...args) => { await held; return original(...args); };
    const first = engine.run(), resumed = engine.run({ resumeAuth: true }); release();
    await first; await resumed; await engine.run();
    expect((await head()).status).toBe('confirmed');
});
it('la desaparición de otra pestaña con el lock retenido programa una nueva inspección', async () => {
    construct({ online: () => false }); await capture(); construct();
    const lock = store.withLock; store.withLock = async () => {};
    await engine.run(); expect(timers.at(-1).ms).toBe(60000);
    store.withLock = lock; await timers.at(-1).fn(); await engine.run();
    expect((await head()).status).toBe('confirmed');
});
