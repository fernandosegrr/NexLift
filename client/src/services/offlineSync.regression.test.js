import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'nexlift_offline_queue';
const sets = [{ weight: 80, reps: 5, rpe: 8, completed: true }];
function session(id = 'A') {
    localStorage.setItem('nexlift_token', `x.${btoa(JSON.stringify({ userId: id }))}.x`);
    localStorage.setItem('nexlift_user', JSON.stringify({ id }));
}
function response(status, body = {}, headers = {}) {
    return new Response(JSON.stringify(body), { status, headers });
}
beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T18:00:00Z'));
    const store = new Map();
    vi.stubGlobal('localStorage', {
        getItem: k => store.get(k) ?? null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
        key: i => [...store.keys()][i] ?? null,
        get length() { return store.size; }
    });
    vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name, _options, cb) => cb({}) } });
    vi.stubGlobal('window', { addEventListener: vi.fn(), dispatchEvent: vi.fn(), location: { pathname: '/login' } });
    vi.stubGlobal('fetch', vi.fn());
    session();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function clearRetryTimers() {
    const mockedTime = Date.now();
    vi.clearAllTimers();
    vi.setSystemTime(mockedTime); // Keep the fixture time across Vitest 4.1 reset().
}

async function setup(op = 'logWorkout', payload = { exerciseId: 'ex1', sets }) {
    const queue = await import('./offlineQueue.js');
    const item = queue.enqueueWrite(op, payload);
    const api = await import('./api.js');
    clearRetryTimers(); // isolate retry scheduling from the page-open kickoff
    return { ...queue, ...api, item };
}

describe('fase 1.2: preservación de escrituras', () => {
    it.each([500, 502, 503, 429, 401, 400, 403, 422, 409])('HTTP %s conserva la operación', async status => {
        const q = await setup();
        fetch.mockResolvedValue(response(status, {}, { 'Retry-After': '120' }));
        await q.replayOfflineQueue();
        expect(q.getQueue()).toHaveLength(1);
        expect(q.getQueue()[0].payload.sets).toEqual(sets);
    });
    it('429 respeta Retry-After y no reintenta inmediatamente', async () => {
        const q = await setup();
        fetch.mockImplementation(async () => response(429, {}, { 'Retry-After': '120' }));
        await q.replayOfflineQueue();
        const calls = fetch.mock.calls.length;
        await q.replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(calls);
        expect(q.getQueue()[0].nextRetryAt).toBeGreaterThanOrEqual(Date.now() + 120000);
    });
    it('400 bloquea sin reintentos infinitos', async () => {
        const q = await setup();
        fetch.mockImplementation(async () => response(400));
        await q.replayOfflineQueue();
        const calls = fetch.mock.calls.length;
        await q.replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(calls);
        expect(q.getQueue()[0].status).toBe('blocked');
    });
    it('error de red preserva datos', async () => {
        const q = await setup();
        fetch.mockRejectedValue(new TypeError('offline'));
        await q.replayOfflineQueue();
        expect(q.getQueue()).toHaveLength(1);
    });
    it('antigüedad y recarga no eliminan operaciones', async () => {
        const q = await setup();
        vi.advanceTimersByTime(72 * 3600000);
        vi.resetModules();
        const reloaded = await import('./offlineQueue.js');
        expect(reloaded.getQueue()).toHaveLength(1);
        expect(reloaded.getQueue()[0].payload).toEqual(q.item.payload);
    });
    it('medianoche CDMX bloquea el POST al día siguiente', async () => {
        vi.setSystemTime(new Date('2026-10-19T05:59:00Z'));
        const q = await setup();
        vi.setSystemTime(new Date('2026-10-19T06:01:00Z'));
        fetch.mockImplementation(async () => response(200, null));
        await q.replayOfflineQueue();
        expect(fetch).not.toHaveBeenCalled();
        expect(q.getQueue()[0].status).toBe('blocked');
    });
    it('series remotas diferentes nunca provocan PUT y se conservan ambas versiones', async () => {
        const q = await setup();
        const remote = { id: 'remote', exerciseId: 'ex1', date: new Date().toISOString(), sets: [{ weight: 20, reps: 10 }] };
        fetch.mockImplementation(async () => response(200, remote));
        await q.replayOfflineQueue();
        expect(fetch.mock.calls.every(([, opts]) => !opts?.method || opts.method === 'GET')).toBe(true);
        expect(q.getQueue()[0]).toMatchObject({ status: 'conflict', payload: { sets }, remote });
    });
    it('cambio de cuenta no reproduce operaciones ajenas', async () => {
        const q = await setup();
        session('B');
        fetch.mockImplementation(async () => response(201, { restLog: { id: 'r' } }));
        await q.replayOfflineQueue();
        expect(fetch).not.toHaveBeenCalled();
        expect(q.getQueue()).toHaveLength(1);
    });
    it('varias operaciones mantienen orden y datos ante un error', async () => {
        const q = await setup();
        const second = q.enqueueWrite('logWorkout', { exerciseId: 'ex2', sets });
        fetch.mockImplementation(async () => response(503));
        await q.replayOfflineQueue();
        expect(q.getQueue().map(x => x.id)).toEqual([q.item.id, second.id]);
    });
    it('legacy se preserva byte a byte y nunca se atribuye a la sesión actual', async () => {
        const original = JSON.stringify([{ id: 'legacy', op: 'logRestDay', payload: { note: 'antiguo' }, timestamp: Date.now() }]);
        localStorage.setItem(KEY, original);
        const { replayOfflineQueue } = await import('./api.js');
        fetch.mockResolvedValue(response(201, { restLog: { id: 'r' } }));
        await replayOfflineQueue();
        expect(localStorage.getItem(KEY)).toBe(original);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('fallo local se informa y nunca devuelve queued ni éxito falso', async () => {
        const { api } = await import('./api.js');
        localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
        fetch.mockRejectedValue(new TypeError('offline'));
        await expect(api.logWorkout('ex1', sets)).rejects.toThrow();
    });
    it('2xx sin contrato de persistencia no elimina ni confirma', async () => {
        const q = await setup('logRestDay', { note: 'descanso' });
        fetch.mockImplementation(async () => response(200, { ok: true }));
        await q.replayOfflineQueue();
        expect(q.getQueue()).toHaveLength(1);
        expect(q.getQueue()[0].status).not.toBe('synced');
    });
});

function workoutReceipt(overrides = {}) {
    return { message: 'Workout logged successfully!', workoutLog: {
        id: 'log1', exerciseId: 'ex1', date: new Date().toISOString(), notes: null,
        sets: sets.map((set, i) => ({ ...set, id: `set${i}`, setNumber: i + 1, weightRight: null, repsRight: null })),
        ...overrides
    } };
}

describe('confirmaciones, reinicio y concurrencia de sincronización', () => {
    it.each([['logWorkout', 201], ['updateWorkoutSession', 200], ['logRestDay', 201]])('confirma el contrato real de %s y conserva el recibo', async (op, status) => {
        const { api } = await import('./api.js');
        const q = await import('./offlineQueue.js');
        const body = op === 'logRestDay'
            ? { restLog: { id: 'rest1', userId: 'A', note: 'Día de descanso', date: new Date().toISOString() } }
            : workoutReceipt();
        fetch.mockImplementation(async () => {
            expect(q.getQueue()[0]).toMatchObject({ status: 'syncing', mutationDispatched: true, ownerId: 'A' });
            return response(status, body);
        });
        const result = op === 'logWorkout' ? await api.logWorkout('ex1', sets)
            : op === 'logRestDay' ? await api.logRestDay() : await api.updateWorkoutSession('log1', sets, 'ex1');
        expect(result.queued).not.toBe(true);
        expect(result.syncStatus).toBe('synced');
        expect(q.getQueue()).toHaveLength(0);
        expect(q.getQueue({ includeSynced: true })[0]).toMatchObject({ status: 'synced', receipt: body });
        expect(JSON.stringify(q.getQueue({ includeSynced: true }))).not.toContain(localStorage.getItem('nexlift_token'));
    });
    it.each([400, 401, 403, 409, 422, 429, 500, 502, 503])('también conserva el envío inicial HTTP %s', async status => {
        const { api } = await import('./api.js');
        const q = await import('./offlineQueue.js');
        fetch.mockImplementation(async () => response(status, { error: 'synthetic' }));
        const result = await api.logWorkout('ex1', sets);
        expect(result.queued).toBe(true);
        expect(result.syncStatus).not.toBe('synced');
        expect(q.getQueue()[0].payload.sets).toEqual(sets);
        expect(q.getQueue()[0].remote).toEqual({ error: 'synthetic' });
    });
    it.each([
        ['identidad equivocada', { exerciseId: 'other' }],
        ['series equivocadas', { sets: [{ weight: 0, reps: 1 }] }],
        ['fecha equivocada', { date: '2026-10-01T18:00:00Z' }],
        ['identificador ausente', { id: null }],
        ['fecha inválida', { date: 'invalid' }]
    ])('no confirma 201 con %s', async (_name, override) => {
        const { api } = await import('./api.js');
        const q = await import('./offlineQueue.js');
        fetch.mockResolvedValue(response(201, workoutReceipt(override)));
        const result = await api.logWorkout('ex1', sets);
        expect(result).toMatchObject({ queued: true, syncStatus: 'blocked' });
        expect(q.getQueue()[0].payload.sets).toEqual(sets);
    });
    it('un GET con series idénticas no es un recibo de la operación local', async () => {
        const q = await setup();
        fetch.mockResolvedValue(response(200, workoutReceipt().workoutLog));
        await q.replayOfflineQueue();
        expect(q.getQueue()[0].status).toBe('conflict');
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('una edición offline nunca reenvía PUT aunque sus series remotas sean iguales', async () => {
        const q = await setup('updateWorkoutSession', { logId: 'log1', exerciseId: 'ex1', sets });
        fetch.mockResolvedValue(response(200, workoutReceipt().workoutLog));
        await q.replayOfflineQueue();
        expect(q.getQueue()[0].status).toBe('conflict');
        expect(fetch.mock.calls[0][1].method).toBeUndefined();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('null remoto no autoriza un nuevo POST ambiguo', async () => {
        const q = await setup();
        fetch.mockResolvedValue(response(200, null));
        await q.replayOfflineQueue();
        expect(q.getQueue()[0]).toMatchObject({ status: 'blocked', reason: 'unsafe_create' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('401 queda pausado hasta una recuperación de autenticación explícita', async () => {
        const q = await setup();
        fetch.mockImplementation(async () => response(401));
        await q.replayOfflineQueue();
        await q.replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(q.getQueue()[0].status).toBe('paused');
        fetch.mockImplementation(async () => response(200, workoutReceipt().workoutLog));
        await q.replayOfflineQueue({ resumeAuth: true });
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(q.getQueue()[0].status).toBe('conflict');
    });
    it('respeta Retry-After con fecha HTTP incluso si supera el backoff máximo', async () => {
        const q = await setup();
        const deadline = Math.floor((Date.now() + 3600000) / 1000) * 1000;
        fetch.mockResolvedValue(response(503, {}, { 'Retry-After': new Date(deadline).toUTCString() }));
        await q.replayOfflineQueue();
        expect(q.getQueue()[0].nextRetryAt).toBe(deadline);
    });
    it('cinco errores consecutivos bloquean sin perder ni seguir reintentando', async () => {
        const q = await setup();
        fetch.mockImplementation(async () => response(503));
        await q.replayOfflineQueue();
        for (let i = 1; i < 5; i++) await vi.advanceTimersByTimeAsync(q.getQueue()[0].nextRetryAt - Date.now());
        expect(fetch).toHaveBeenCalledTimes(5);
        expect(q.getQueue()[0]).toMatchObject({ status: 'blocked', reason: 'retry_limit', attempts: 5 });
        await vi.advanceTimersByTimeAsync(3600000);
        expect(fetch).toHaveBeenCalledTimes(5);
        expect(q.getQueue()[0].payload.sets).toEqual(sets);
    });
    it('timeout conserva y aplica backoff', async () => {
        const q = await setup();
        fetch.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
        await q.replayOfflineQueue();
        expect(q.getQueue()[0]).toMatchObject({ status: 'temporary_error', attempts: 1 });
        expect(q.getQueue()[0].nextRetryAt).toBe(Date.now() + 5000);
    });
    it('reinicio conserva backoff y el payload, sin reintento prematuro', async () => {
        const q = await setup();
        fetch.mockImplementation(async () => response(503));
        await q.replayOfflineQueue();
        clearRetryTimers();
        vi.resetModules();
        const reloaded = await import('./api.js');
        await reloaded.replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(1);
        const storage = await import('./offlineQueue.js');
        expect(storage.getQueue()[0]).toMatchObject({ payload: { sets }, nextRetryAt: Date.now() + 5000 });
    });
    it('respuesta perdida tras POST no genera otro POST después de reiniciar', async () => {
        const { api } = await import('./api.js');
        fetch.mockRejectedValueOnce(new TypeError('response lost'));
        const result = await api.logWorkout('ex1', sets);
        expect(result.queued).toBe(true);
        clearRetryTimers();
        vi.resetModules();
        vi.setSystemTime(Date.now() + 6000);
        const { replayOfflineQueue } = await import('./api.js');
        fetch.mockImplementation(async () => response(200, workoutReceipt().workoutLog));
        await replayOfflineQueue();
        expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
        const { getQueue } = await import('./offlineQueue.js');
        expect(getQueue()[0]).toMatchObject({ status: 'conflict', mutationDispatched: true, payload: { sets } });
    });
    it('cambio de cuenta durante una petición no usa el token nuevo ni confirma', async () => {
        const { api } = await import('./api.js');
        const q = await import('./offlineQueue.js');
        const tokenA = localStorage.getItem('nexlift_token');
        fetch.mockImplementation(async (_url, options) => {
            expect(options.headers.Authorization).toBe(`Bearer ${tokenA}`);
            session('B');
            return response(201, workoutReceipt());
        });
        const result = await api.logWorkout('ex1', sets);
        expect(result).toMatchObject({ queued: true, syncStatus: 'paused' });
        await (await import('./api.js')).replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(q.getQueue()[0]).toMatchObject({ ownerId: 'A', payload: { sets } });
    });
    it('el propietario del formulario impide guardar una pantalla de A en sesión B', async () => {
        const { api } = await import('./api.js');
        session('B');
        await expect(api.logWorkout('ex1', sets, null, { ownerId: 'A' })).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
        expect((await import('./offlineQueue.js')).getQueue()).toHaveLength(0);
    });
    it('perfil y credencial de cuentas distintas no permiten enviar', async () => {
        const { api } = await import('./api.js');
        localStorage.setItem('nexlift_user', JSON.stringify({ id: 'B' }));
        await expect(api.logWorkout('ex1', sets)).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
    it('operaciones de otra cuenta no bloquean ni se envían con el usuario actual', async () => {
        const q = await setup();
        session('B');
        q.enqueueWrite('logWorkout', { exerciseId: 'b1', sets });
        fetch.mockResolvedValue(response(200, null));
        await q.replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toContain('exerciseId=b1');
        expect(q.getQueue()).toHaveLength(2);
    });
    it('segundo envío del mismo ejercicio conserva ambas versiones sin repetir POST', async () => {
        const { api } = await import('./api.js');
        fetch.mockRejectedValue(new TypeError('offline'));
        await api.logWorkout('ex1', sets);
        const changed = [{ ...sets[0], reps: 8 }];
        const result = await api.logWorkout('ex1', changed);
        expect(result).toMatchObject({ queued: true, syncStatus: 'conflict' });
        expect(fetch).toHaveBeenCalledTimes(1);
        const q = (await import('./offlineQueue.js')).getQueue();
        expect(q.map(item => item.payload.sets)).toEqual([sets, changed]);
    });
    it('dos módulos/pestañas conservan sus appends independientes', async () => {
        const first = await import('./offlineQueue.js');
        vi.resetModules();
        const second = await import('./offlineQueue.js');
        const a = first.enqueueWrite('logWorkout', { exerciseId: 'ex1', sets });
        const b = second.enqueueWrite('logWorkout', { exerciseId: 'ex2', sets });
        expect(first.getQueue().map(item => item.id)).toEqual([a.id, b.id]);
    });
    it('lecturas y suscriptores no escriben ni provocan recursión', async () => {
        const q = await setup();
        const set = vi.spyOn(localStorage, 'setItem');
        const listener = vi.fn(() => q.getQueue());
        q.subscribeQueueChange(listener);
        for (let i = 0; i < 100; i++) q.getQueue();
        expect(set).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });
    it('un suscriptor que falla no convierte una escritura durable en fallo', async () => {
        const q = await setup();
        q.subscribeQueueChange(() => { throw new Error('render'); });
        expect(() => q.enqueueWrite('logWorkout', { exerciseId: 'ex2', sets })).not.toThrow();
        expect(q.getQueue()).toHaveLength(2);
    });
    it('cola legacy corrupta queda intacta y produce un error visible', async () => {
        const q = await import('./offlineQueue.js');
        const broken = '[{"id":"keep"';
        localStorage.setItem(KEY, broken);
        expect(() => q.getQueue()).toThrow();
        expect(() => q.enqueueWrite('logWorkout', { exerciseId: 'ex1', sets })).toThrow();
        expect(localStorage.getItem(KEY)).toBe(broken);
        expect(q.getQueueStorageError()).toContain('No se pudo');
    });
    it('storage falla antes del envío: no hay petición ni falso queued', async () => {
        const { api } = await import('./api.js');
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        await expect(api.logWorkout('ex1', sets)).rejects.toMatchObject({ isStorageError: true });
        expect(fetch).not.toHaveBeenCalled();
    });
    it('storage falla al marcar syncing: conserva payload y no sale a la red', async () => {
        const { api } = await import('./api.js');
        const save = localStorage.setItem;
        let count = 0;
        localStorage.setItem = (...args) => { if (++count === 2) throw new Error('quota'); save(...args); };
        await expect(api.logWorkout('ex1', sets)).rejects.toMatchObject({ isStorageError: true });
        expect(fetch).not.toHaveBeenCalled();
        expect((await import('./offlineQueue.js')).getQueue()[0]).toMatchObject({ status: 'pending', payload: { sets } });
    });
    it('storage falla al confirmar: conserva el envío incierto para revisión', async () => {
        const { api } = await import('./api.js');
        fetch.mockResolvedValue(response(201, workoutReceipt()));
        const save = localStorage.setItem;
        let count = 0;
        localStorage.setItem = (...args) => { if (++count === 3) throw new Error('quota'); save(...args); };
        await expect(api.logWorkout('ex1', sets)).rejects.toMatchObject({ isStorageError: true });
        expect((await import('./offlineQueue.js')).getQueue()[0]).toMatchObject({ status: 'syncing', payload: { sets } });
    });
    it('offline declarado guarda antes de cualquier llamada de red', async () => {
        navigator.onLine = false;
        const { api } = await import('./api.js');
        expect(await api.logWorkout('ex1', sets)).toMatchObject({ queued: true, syncStatus: 'pending' });
        expect(fetch).not.toHaveBeenCalled();
    });
    it('descanso incierto no se duplica automáticamente', async () => {
        const { api, replayOfflineQueue } = await import('./api.js');
        fetch.mockRejectedValue(new TypeError('response lost'));
        await api.logRestDay();
        clearRetryTimers();
        vi.setSystemTime(Date.now() + 6000);
        await replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect((await import('./offlineQueue.js')).getQueue()[0]).toMatchObject({ status: 'blocked', reason: 'uncertain_write' });
    });
    it('un conflicto anterior detiene FIFO sin un temporizador de cero infinito', async () => {
        const q = await setup();
        const second = q.enqueueWrite('logWorkout', { exerciseId: 'ex2', sets });
        q.updateQueueItem(q.item.id, { status: 'conflict' });
        q.updateQueueItem(second.id, { status: 'temporary_error', nextRetryAt: Date.now() - 1 });
        await q.replayOfflineQueue();
        await vi.advanceTimersByTimeAsync(60000);
        expect(fetch).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        expect(q.getQueue()).toHaveLength(2);
    });
    it('un recibo confirmado no retrocede por una inspección tardía', async () => {
        const q = await setup();
        q.updateQueueItem(q.item.id, { status: 'synced', receipt: workoutReceipt() });
        q.updateQueueItem(q.item.id, { status: 'conflict' });
        expect(q.getQueue()).toHaveLength(0);
        expect(q.getQueue({ includeSynced: true })[0].receipt).toBeDefined();
    });
    it('cambiar de cuenta mientras llega el JSON no confirma en la pantalla anterior', async () => {
        const { api } = await import('./api.js');
        fetch.mockResolvedValue({ ok: true, status: 201, json: async () => {
            session('B');
            return workoutReceipt();
        } });
        expect(await api.logWorkout('ex1', sets)).toMatchObject({ queued: true, syncStatus: 'paused' });
        expect((await import('./offlineQueue.js')).getQueue()[0].ownerId).toBe('A');
    });
    it('el payload enviado sigue siendo el snapshot durable aunque cambie el formulario', async () => {
        const { api } = await import('./api.js');
        const editable = structuredClone(sets);
        navigator.locks.request = async (_name, _options, task) => {
            editable[0].reps = 99;
            return task({});
        };
        fetch.mockImplementation(async (_url, options) => {
            expect(JSON.parse(options.body).sets).toEqual(sets);
            return response(201, workoutReceipt());
        });
        expect(await api.logWorkout('ex1', editable)).toMatchObject({ syncStatus: 'synced' });
    });
    it('el lock de otra pestaña evita inspeccionar un envío todavía en vuelo', async () => {
        let held = false;
        navigator.locks.request = async (_name, options, callback) => {
            if (held && options.ifAvailable) return callback(null);
            held = true;
            try { return await callback({}); } finally { held = false; }
        };
        let finish;
        fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const { api } = await import('./api.js');
        const sending = api.logWorkout('ex1', sets);
        vi.resetModules();
        const otherTab = await import('./api.js');
        await otherTab.replayOfflineQueue();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect((await import('./offlineQueue.js')).getQueue()[0].status).toBe('syncing');
        finish(response(201, workoutReceipt()));
        expect(await sending).toMatchObject({ syncStatus: 'synced' });
        expect((await import('./offlineQueue.js')).getQueue()).toHaveLength(0);
    });
    it('legacy heterogéneo, con IDs repetidos o sin timestamp, no se reescribe al encolar', async () => {
        const raw = JSON.stringify([{ id: 'duplicate', op: 'logRestDay', payload: { note: 'one' } },
            { id: 'duplicate', op: 'future-op', payload: { custom: [1, 2] }, timestamp: 1 }, null, 42]);
        localStorage.setItem(KEY, raw);
        const q = await import('./offlineQueue.js');
        q.enqueueWrite('logWorkout', { exerciseId: 'new', sets });
        expect(localStorage.getItem(KEY)).toBe(raw);
        expect(q.getQueue()).toHaveLength(5);
        expect(q.getQueue().filter(item => item.legacy).every(item => item.status === 'blocked' && item.ownerId === null)).toBe(true);
    });
});
