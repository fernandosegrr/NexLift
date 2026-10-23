import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { effects } = vi.hoisted(() => ({ effects: [] }));
// Exercise the provider's actual initialization effect without a browser/DOM.
vi.mock('react', async original => ({ ...(await original()),
    useState: initial => [initial, vi.fn()], useRef: initial => ({ current: initial }), useEffect: fn => { effects.push(fn); } }));
vi.mock('../utils/push', () => ({ unsubscribeFromPush: vi.fn(async () => {}) }));
let storage;
let savedToken;
beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); effects.length = 0;
    storage = new Map();
    vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)),
        removeItem: k => storage.delete(k), key: i => [...storage.keys()][i] ?? null, get length() { return storage.size; } });
    vi.stubGlobal('window', { location: { pathname: '/dashboard', href: '' }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('navigator', { onLine: true });
    savedToken = `x.${btoa(JSON.stringify({ userId: 'A' }))}.x`;
    localStorage.setItem('nexlift_token', savedToken); localStorage.setItem('nexlift_user', JSON.stringify({ id: 'A' }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

for (const status of [503, 500]) {
    it(`profile HTTP ${status} preserves authentication, drafts and blocked offline operations`, async () => {
        const { createDraftStore } = await import('../services/workoutDrafts.js');
        const q = await import('../services/offlineQueue.js');
        const draft = createDraftStore('workout', 'day1', 'A'); draft.save({ sets: [{ weight: '80', reps: '5' }] });
        const queued = q.enqueueWrite('logWorkout', { exerciseId: 'ex1', sets: [{ weight: 80, reps: 5 }] });
        q.updateQueueItem(queued.id, { status: 'blocked', reason: 'uncertain_write' });
        const previous = [...storage.entries()];
        const calls = [];
        vi.stubGlobal('fetch', vi.fn(async (url, options) => {
            calls.push(options?.method || 'GET'); return new Response(JSON.stringify({ error: 'temporary' }), { status });
        }));
        const { AuthProvider } = await import('./AuthContext.jsx');
        vi.stubGlobal('React', await import('react'));
        AuthProvider({ children: null }); effects[0]();
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        await Promise.resolve(); await Promise.resolve();
        await (await import('../services/api.js')).api.getRoutines().catch(() => {});
        await (await import('../services/api.js')).replayOfflineQueue({ resumeAuth: true });
        expect(localStorage.getItem('nexlift_token')).toBe(savedToken);
        expect([...storage.entries()]).toEqual(previous);
        expect(calls.every(method => method === 'GET')).toBe(true);
        expect(window.location.href).toBe('');
    });
}
it('a genuine profile 401 clears only authentication and retains offline work', async () => {
    const { createDraftStore } = await import('../services/workoutDrafts.js');
    createDraftStore('workout', 'day1', 'A').save({ reps: '5' });
    const q = await import('../services/offlineQueue.js');
    const item = q.enqueueWrite('logWorkout', { exerciseId: 'ex1', sets: [{ weight: 80, reps: 5 }] });
    q.updateQueueItem(item.id, { status: 'blocked', reason: 'uncertain_write' });
    const queue = q.getQueue();
    const drafts = [...storage.entries()].filter(([key]) => key.startsWith('nexlift_draft'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const { AuthProvider } = await import('./AuthContext.jsx'); vi.stubGlobal('React', await import('react'));
    AuthProvider({ children: null }); effects[0]();
    await vi.waitFor(() => expect(localStorage.getItem('nexlift_token')).toBeNull());
    expect([...storage.entries()].filter(([key]) => key.startsWith('nexlift_draft'))).toEqual(drafts);
    expect(q.getQueue({ allOwners: true })).toEqual(queue);
});
