// Real HTTP transport against a synthetic, loopback-only API. No .env, production
// endpoint, app startup, or database is involved in these transport regressions.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let server;
let baseUrl;
let requests;
let remote;
let mode;
const sets = [{ weight: 100, reps: 5, rpe: 8, completed: true }];
function session(id = 'A') {
    localStorage.setItem('nexlift_token', `x.${btoa(JSON.stringify({ userId: id }))}.x`);
    localStorage.setItem('nexlift_user', JSON.stringify({ id }));
}
beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T18:00:00Z'));
    const data = new Map();
    vi.stubGlobal('localStorage', {
        getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k),
        key: i => [...data.keys()][i] ?? null, get length() { return data.size; }
    });
    vi.stubGlobal('navigator', { onLine: true });
    session();
    requests = [];
    remote = null;
    mode = 'normal';
    server = createServer(async (req, res) => {
        requests.push({ method: req.method, path: req.url, auth: req.headers.authorization });
        if (req.method === 'GET') {
            res.writeHead(mode === 'unavailable' ? 503 : 200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mode === 'unavailable' ? { error: 'temporary' } : remote));
            return;
        }
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        remote = { id: 'http-log', exerciseId: body.exerciseId, notes: body.notes ?? null,
            date: new Date().toISOString(), sets: body.sets };
        if (mode === 'lost-response') { req.socket.destroy(); return; }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ workoutLog: remote }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('HTTP real: escribe el journal antes de enviar y confirma un 201 válido', async () => {
    const { submitWorkoutWrite } = await import('./offlineSync.js');
    const { getQueue } = await import('./offlineQueue.js');
    const result = await submitWorkoutWrite(baseUrl, 'logWorkout', { exerciseId: 'ex1', sets, notes: null });
    expect(result.syncStatus).toBe('synced');
    expect(requests.map(req => req.method)).toEqual(['POST']);
    expect(getQueue()).toHaveLength(0);
    expect(getQueue({ includeSynced: true })[0]).toMatchObject({ payload: { sets }, receipt: { workoutLog: remote } });
});
it('HTTP real: POST persistido con socket perdido no se duplica tras reinicio', async () => {
    mode = 'lost-response';
    const { submitWorkoutWrite } = await import('./offlineSync.js');
    expect(await submitWorkoutWrite(baseUrl, 'logWorkout', { exerciseId: 'ex1', sets, notes: null })).toMatchObject({ queued: true });
    expect(remote.sets).toEqual(sets);
    // Advance beyond the persisted retry deadline, then reconstruct all modules.
    vi.setSystemTime(Date.now() + 6000);
    vi.resetModules();
    const { replayQueue } = await import('./offlineSync.js');
    mode = 'normal';
    await replayQueue(baseUrl);
    expect(requests.map(req => req.method)).toEqual(['POST', 'GET']);
    expect((await import('./offlineQueue.js')).getQueue()[0]).toMatchObject({ status: 'conflict', remote: { sets }, payload: { sets } });
});
it('HTTP real: una versión remota distinta se conserva sin PUT/POST', async () => {
    const q = await import('./offlineQueue.js');
    q.enqueueWrite('logWorkout', { exerciseId: 'ex1', sets });
    remote = { id: 'remote-other', exerciseId: 'ex1', date: new Date().toISOString(), sets: [{ weight: 10, reps: 2 }] };
    const original = structuredClone(remote);
    await (await import('./offlineSync.js')).replayQueue(baseUrl);
    expect(remote).toEqual(original);
    expect(requests.map(req => req.method)).toEqual(['GET']);
    expect(q.getQueue()[0]).toMatchObject({ status: 'conflict', remote: original, payload: { sets } });
});
it('HTTP real: 503 retiene FIFO y reiniciar respeta el plazo de reintento', async () => {
    mode = 'unavailable';
    const q = await import('./offlineQueue.js');
    const a = q.enqueueWrite('logWorkout', { exerciseId: 'ex1', sets });
    const b = q.enqueueWrite('logWorkout', { exerciseId: 'ex2', sets });
    await (await import('./offlineSync.js')).replayQueue(baseUrl);
    vi.resetModules();
    await (await import('./offlineSync.js')).replayQueue(baseUrl);
    expect(requests.map(req => req.method)).toEqual(['GET']);
    expect(q.getQueue().map(item => item.id)).toEqual([a.id, b.id]);
    // Stop timers by moving the head to a retained review state.
    q.updateQueueItem(a.id, { status: 'blocked', reason: 'retry_limit' });
    await (await import('./offlineSync.js')).replayQueue(baseUrl);
});
