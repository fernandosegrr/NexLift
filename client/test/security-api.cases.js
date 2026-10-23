import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { api } from '../src/services/api';
let storage, fetcher;
beforeEach(() => {
    storage = new Map([['nexlift_token', 'A'], ['nexlift_user', '{"id":"A"}']]);
    vi.stubGlobal('localStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) });
    vi.stubGlobal('window', { location: { pathname: '/', href: '/' }, dispatchEvent: vi.fn() });
    fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());
it('late authenticated API response cannot expose the previous account data to a direct consumer', async () => {
    let finish; fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = api.getRoutines(); storage.set('nexlift_token', 'B'); finish(new Response('[{"id":"private-A"}]'));
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    for (const invoke of [() => api.getProfile('A'), () => api.changePassword('A', 'old', 'Synthetic123'), () => api.updateSecurityQuestion('A', 'Synthetic?', 'answer', 'old')]) {
        storage.set('nexlift_token', 'A');
        const old = invoke(); storage.set('nexlift_token', 'B'); finish(new Response('{"id":"A","token":"private-A-replacement"}'));
        await expect(old).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
        expect(storage.get('nexlift_token')).toBe('B');
    }
    fetcher.mockClear(); await expect(api.changePassword('A', 'old', 'Synthetic123')).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(fetcher).not.toHaveBeenCalled();
});
it('late 401 from another account cannot remove the new local session or redirect it', async () => {
    let finish; fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = api.getRoutines(); storage.set('nexlift_token', 'B'); finish(new Response('{}', { status: 401 }));
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' }); expect(storage.get('nexlift_token')).toBe('B'); expect(window.location.href).toBe('/');
});
it('429 retains Retry-After and the session without retrying or enqueueing reads', async () => {
    fetcher.mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '17' } }));
    await expect(api.getRoutines()).rejects.toMatchObject({ status: 429, retryAfter: '17' }); expect(storage.get('nexlift_token')).toBe('A'); expect(fetcher).toHaveBeenCalledOnce();
});
it('PostgreSQL 503 remains transient and does not clear credentials or drafts', async () => {
    storage.set('draft-A', 'preserved'); fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(api.getRoutines()).rejects.toMatchObject({ status: 503 }); expect(storage.get('nexlift_token')).toBe('A'); expect(storage.get('draft-A')).toBe('preserved');
});
it('rest cancellation waits for durable scheduling receipt and uses that exact generation without another queue', async () => {
    let finish;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
        .mockResolvedValueOnce(new Response('{"cancelled":true}'));
    const scheduling = api.scheduleRestReminder('ea'), cancelling = api.cancelRestReminder();
    expect(fetcher).toHaveBeenCalledOnce();
    finish(new Response('{"reminder":{"id":"generation-1","fireAt":"2026-10-22T17:00:00.000Z"}}', { status: 202 }));
    await scheduling; await expect(cancelling).resolves.toEqual({ cancelled: true });
    const options = fetcher.mock.calls[1][1]; expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body)).toEqual({ reminderId: 'generation-1', fireAt: '2026-10-22T17:00:00.000Z' });
    expect(storage.size).toBe(2); await api.cancelRestReminder(); expect(fetcher).toHaveBeenCalledTimes(2);
});
it('a delayed stop preserves the next rest context and cannot cancel another account after switching', async () => {
    let generation = 0;
    fetcher.mockImplementation(async (_url, options) => new Response(JSON.stringify(options.method === 'POST'
        ? { reminder: { id: `generation-${++generation}`, fireAt: '2026-10-22T17:00:00.000Z' } } : { cancelled: true })));
    await api.scheduleRestReminder('ea'); const oldCancel = api.cancelRestReminder();
    await api.scheduleRestReminder('ea'); await oldCancel; await api.cancelRestReminder();
    const deletes = fetcher.mock.calls.filter(([, options]) => options.method === 'DELETE').map(([, options]) => JSON.parse(options.body).reminderId);
    expect(deletes).toEqual(['generation-1', 'generation-2']);
    await api.scheduleRestReminder('ea'); storage.set('nexlift_token', 'B'); storage.set('nexlift_user', '{"id":"B"}');
    const count = fetcher.mock.calls.length; await api.cancelRestReminder(); expect(fetcher).toHaveBeenCalledTimes(count);
    storage.set('nexlift_token', 'A'); storage.set('nexlift_user', '{"id":"A"}');
    await api.scheduleRestReminder('ea'); fetcher.mockRejectedValueOnce(new TypeError('offline'));
    await expect(api.cancelRestReminder()).rejects.toMatchObject({ isNetworkError: true });
});
