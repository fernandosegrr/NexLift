import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestHash, parseOperation } from '../../../server/src/services/operationContract.js';
import { mexicoCityDateStr } from '../utils/dates.js';

let data, requests, api, runtime;
const sets = [{ weight: 80, reps: 8, rpe: 8, completed: false }], version = 'a'.repeat(64);
beforeEach(async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.stubEnv('VITE_WORKOUT_OPERATIONS_ENABLED', 'true');
    data = new Map(); requests = [];
    vi.stubGlobal('localStorage', { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k),
        key: i => [...data.keys()][i] ?? null, get length() { return data.size; } });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { addEventListener: vi.fn(), location: { pathname: '/', href: '' } });
    localStorage.setItem('nexlift_token', `x.${btoa(JSON.stringify({ userId: 'A' }))}.x`); localStorage.setItem('nexlift_user', JSON.stringify({ id: 'A' }));
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
        requests.push({ url, method: options.method || 'GET', body: options.body && JSON.parse(options.body) });
        const response = (status, body) => new Response(JSON.stringify(body), { status });
        if (url.endsWith('/auth/me')) return response(200, { id: 'A' });
        if (url.includes('workout-sessions')) return response(200, { workoutLog: { id: 'log1', sets, exerciseId: 'ex1' }, sessionVersion: version });
        if (url.endsWith('workout-capabilities')) return response(200, { protocolVersion: 1, receiptFormat: 'sha256-v1', enabled: true, ready: true, userId: 'A',
            kinds: ['workout.create', 'workout.appendSet', 'workout.replaceSets', 'workout.delete', 'rest.create'] });
        if (options.method !== 'POST') return response(404, { code: 'OPERATION_NOT_FOUND' });
        const p = JSON.parse(options.body), clean = parseOperation(p);
        const result = p.kind === 'workout.delete' ? { deleted: true, logId: p.logId }
            : p.kind === 'rest.create' ? { restLog: { id: 'rest1', userId: 'A', note: clean.note, date: p.performedAt } }
                : { sessionVersion: version, workoutLog: { id: p.logId || 'log1', exerciseId: p.exerciseId, notes: clean.notes, date: p.performedAt,
                    sets: clean.sets.map((s, i) => ({ ...s, setNumber: i + 1 })) } };
        return response(201, { protocolVersion: 1, requestHash: requestHash(clean), ownerId: 'A', replayed: false,
            operation: { operationId: p.operationId, kind: p.kind, source: 'pwa', state: 'confirmed', performedAt: p.performedAt,
                performedDay: mexicoCityDateStr(p.performedAt) }, result });
    }));
    const module = await import('./api.js'); api = module.api; runtime = module.operationRuntime();
    await api.getProfile(localStorage.getItem('nexlift_token')); vi.clearAllTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('api.logWorkout utiliza v1 sin fallback a POST legacy y adapta el acuse a la UI', async () => {
    expect(await api.logWorkout('ex1', sets, 'nota', { ownerId: 'A' })).toMatchObject({ workoutLog: { id: 'log1', notes: 'nota' }, syncStatus: 'confirmed' });
    expect(requests.filter(r => r.method === 'POST').map(r => r.url)).toEqual([expect.stringContaining('/v1/workout-operations')]);
});
it('api.logRestDay conserva la nota predeterminada real y usa el nuevo contrato', async () => {
    expect(await api.logRestDay(null, { ownerId: 'A' })).toMatchObject({ restLog: { note: 'Día de descanso' }, syncStatus: 'confirmed' });
});
it('api.getWorkoutSession devuelve la versión revisada para el borrador', async () => {
    expect(await api.getWorkoutSession('log1')).toMatchObject({ id: 'log1', sessionVersion: version });
});
it('api.updateWorkoutSession conserva expectedVersion y completed=false sin PUT', async () => {
    expect(await api.updateWorkoutSession('log1', sets, 'ex1', { ownerId: 'A', expectedVersion: version })).toMatchObject({ syncStatus: 'confirmed' });
    const post = requests.find(r => r.method === 'POST'); expect(post.body).toMatchObject({ kind: 'workout.replaceSets', expectedVersion: version, sets: [{ completed: false }] });
    expect(post.body).not.toHaveProperty('exerciseId'); expect(requests.some(r => r.method === 'PUT')).toBe(false);
});
it('un borrador antiguo sin versión no se rebasa ni sustituye la sesión remota', async () => {
    await expect(api.updateWorkoutSession('log1', sets, 'ex1', { ownerId: 'A' })).rejects.toThrow('versión');
    expect(await runtime.store.list('A')).toHaveLength(0); expect(requests.some(r => r.method === 'POST' || r.method === 'PUT')).toBe(false);
});
it('api.deleteWorkoutSession exige versión y confirma mediante tombstone, sin DELETE legacy', async () => {
    expect(await api.deleteWorkoutSession('log1', { ownerId: 'A', expectedVersion: version })).toMatchObject({ deleted: true, logId: 'log1', syncStatus: 'confirmed' });
    expect(requests.some(r => r.method === 'DELETE')).toBe(false);
});
it('operación encolada tras caída conserva credenciales y jamás usa el endpoint legacy', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    expect(await api.logWorkout('ex1', sets)).toMatchObject({ queued: true, syncStatus: 'retry_scheduled' });
    expect(localStorage.getItem('nexlift_token')).toBeTruthy(); expect((await runtime.store.list('A'))[0].payload.sets[0].completed).toBe(false);
});
it('backend incompatible bloquea sin promover operaciones ni hacer fallback', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ enabled: false }), { status: 200 }));
    expect(await api.logWorkout('ex1', sets)).toMatchObject({ queued: true, syncStatus: 'blocked_incompatible' });
    expect(requests.some(r => r.method === 'POST')).toBe(false);
});
