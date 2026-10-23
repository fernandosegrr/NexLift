import { loadedPublicAssets, warmInitialPublicAssets } from '../src/app/serviceWorkerLifecycle';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { readSelectedExercise, writeSelectedExercise } from '../src/features/progress/preferences';
import { readHome, readProgress, readRoutines, readGoals, readConfirmedHistory } from '../src/features/remoteViews';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { accountScope, guardedRead, queryKey, readObject, readCollection, retryRead, remoteClient, invalidateAccount, RemoteReadError, queryProfile } from '../src/app/remote';

beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    accountScope(null, null);
});
afterEach(() => { onlineManager.setOnline(true); remoteClient.clear(); vi.unstubAllGlobals(); });
function session(owner = 'A', token = 'token-A') {
    localStorage.setItem('nexlift_token', token);
    const scope = accountScope(owner, token);
    if (!scope) throw Error('Missing scope');
    return scope;
}
it('deduplicates simultaneous remote reads and reuses fresh account cache', async () => {
    const scope = session(), load = vi.fn(async () => ({ id: 'confirmed' }));
    const options = { queryKey: queryKey(scope, 'routines'), queryFn: ({ signal }: { signal: AbortSignal }) => guardedRead(scope, signal, load, readObject) };
    const values = await Promise.all([remoteClient.fetchQuery(options), remoteClient.fetchQuery(options)]);
    expect(values[0]).toEqual(values[1]);
    await remoteClient.fetchQuery(options); expect(load).toHaveBeenCalledTimes(1);
});
it('isolates keys by account, generation and filters and disables authenticated browser HTTP caching', async () => {
    const a = session(), b = session('B', 'token-B');
    expect(queryKey(a, 'routines')).not.toEqual(queryKey(b, 'routines'));
    expect(queryKey(b, 'history', [30])).not.toEqual(queryKey(b, 'history', [80]));
    expect(JSON.stringify(queryKey(a, 'profile'))).not.toContain('token-A');
    const fetcher = vi.fn(async (url: unknown, _options?: RequestInit) => new Response(JSON.stringify(String(url).endsWith('/auth/me') ? { id: 'B' } : []), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const { api } = await import('../src/services/api');
    await api.getRoutines(); await api.getProfile('token-B');
    expect(fetcher.mock.calls.every(([, options]) => options?.cache === 'no-store')).toBe(true);
});
it('clears remote data immediately on logout without touching local persistence', () => {
    const a = session(); localStorage.setItem('draft', 'preserved');
    remoteClient.setQueryData(queryKey(a, 'history'), [{ id: 'private' }]);
    accountScope(null, null); expect(remoteClient.getQueryCache().getAll()).toHaveLength(0);
    expect(localStorage.getItem('draft')).toBe('preserved');
});
it('rejects an old account response even when the loader ignores cancellation', async () => {
    const a = session(); let finish: (value: unknown) => void = () => {};
    const pending = guardedRead(a, new AbortController().signal, () => new Promise(resolve => { finish = resolve; }), readObject);
    session('B', 'token-B'); finish({ id: 'private-A' });
    await expect(pending).rejects.toMatchObject({ code: 'session_changed' });
});
it('rejects late reads after token rotation in the same account', async () => {
    const a = session(); localStorage.setItem('nexlift_token', 'rotated');
    await expect(guardedRead(a, new AbortController().signal, async () => ({}), readObject)).rejects.toMatchObject({ code: 'session_changed' });
});
it('uses a new generation after logout/login with the same token', () => {
    const a = session(); accountScope(null, null); const b = session();
    expect(a.generation).not.toBe(b.generation);
});
it('invalidates confirmed remote views without removing drafts or cached data', () => {
    const a = session(), key = queryKey(a, 'progress');
    localStorage.setItem('draft', 'unchanged'); remoteClient.setQueryData(key, { volume: 100 });
    invalidateAccount(a);
    expect(remoteClient.getQueryState(key)?.isInvalidated).toBe(true);
    expect(remoteClient.getQueryData(key)).toEqual({ volume: 100 }); expect(localStorage.getItem('draft')).toBe('unchanged');
});
it('an old account invalidation cannot affect the current account', () => {
    const a = session(), b = session('B', 'token-B'), key = queryKey(b, 'goals');
    remoteClient.setQueryData(key, []); invalidateAccount(a);
    expect(remoteClient.getQueryState(key)?.isInvalidated).toBe(false);
});
for (const status of [401, 403, 409, 429]) it(`does not retry HTTP ${status} reads`, () => expect(retryRead(0, { status })).toBe(false));
it('retries transient reads once and never indefinitely', () => {
    expect(retryRead(0, { status: 503 })).toBe(true); expect(retryRead(1, { status: 503 })).toBe(false);
    expect(retryRead(0, { isNetworkError: true })).toBe(true); expect(retryRead(1, { isNetworkError: true })).toBe(false);
});
it('does not retry incompatible JSON or session changes', () => {
    expect(retryRead(0, new RemoteReadError('shape', 'incompatible'))).toBe(false);
    expect(retryRead(0, new RemoteReadError('account', 'session_changed'))).toBe(false);
    for (const value of [null, [], 'html', 1]) expect(() => readObject(value)).toThrow(RemoteReadError);
    for (const value of [{}, [null], ['html']]) expect(() => readCollection(value)).toThrow(RemoteReadError);
    for (const decode of [readHome, readProgress, readRoutines, readGoals, readConfirmedHistory]) expect(() => decode({ error: 'invalid response' })).toThrow(RemoteReadError);
});
it('never configures mutation retries or a persisted mutation queue', () => {
    expect(remoteClient.getDefaultOptions().mutations?.retry).toBe(false);
    expect(remoteClient.getDefaultOptions().mutations?.networkMode).toBe('always');
    expect(remoteClient.getMutationCache().getAll()).toHaveLength(0);
});
it('honors query abort without admitting the returned data', async () => {
    const a = session(), controller = new AbortController(); controller.abort();
    const load = vi.fn(); await expect(guardedRead(a, controller.signal, load, readObject)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
});
it('validates profile ownership before admitting remote data', async () => {
    session(); await expect(queryProfile('token-A', 'A', async () => ({ id: 'B' }))).rejects.toMatchObject({ code: 'incompatible' });
    expect(remoteClient.getQueryData(queryKey(accountScope('A', 'token-A'), 'profile'))).toBeUndefined();
});
it('profile verification rejects promptly offline so restored PWA drafts remain accessible', async () => {
    session(); onlineManager.setOnline(false);
    const load = vi.fn(async () => { throw Object.assign(new Error('Offline'), { isNetworkError: true }); });
    const result = queryProfile('token-A', 'A', load).then(() => 'unexpected', () => 'rejected');
    expect(await Promise.race([result, new Promise(resolve => setTimeout(() => resolve('paused'), 150))])).toBe('rejected');
    expect(load).toHaveBeenCalledTimes(1);
});
it('preserves extensions and explicit nulls in remote view decoding', () => {
    expect(readCollection([{ id: 'A', notes: null, extension: 0 }])).toEqual([{ id: 'A', notes: null, extension: 0 }]);
});

it('exercise selection is scoped per account and never assigns an unowned legacy preference', () => {
    localStorage.setItem('nexlift_lastExercise', 'Legacy private exercise');
    expect(readSelectedExercise('B')).toBe('');
    writeSelectedExercise('A', 'Private A'); writeSelectedExercise('B', 'Private B');
    expect(readSelectedExercise('A')).toBe('Private A'); expect(readSelectedExercise('B')).toBe('Private B');
    expect(localStorage.getItem('nexlift_lastExercise')).toBe('Legacy private exercise');
});

it('a legacy SKIP_WAITING message cannot activate an update over a live workout', async () => {
    let message: (event: { data: { type: string } }) => void = () => {};
    const skipWaiting = vi.fn();
    vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
        self: { skipWaiting, addEventListener: (name: string, handler: typeof message) => { if (name === 'message') message = handler; } }
    });
    message({ data: { type: 'SKIP_WAITING' } }); expect(skipWaiting).not.toHaveBeenCalled();
});
it('SW first-install warming only caches same-origin public assets with matching content types', async () => {
    const origin = 'https://pwa.test', stored = new Map<string, Response>(), pending: Promise<unknown>[] = [];
    interface Message { data: { type: string; urls: unknown[] }; waitUntil: (promise: Promise<unknown>) => void }
    const handlers = new Map<string, (event: Message) => void>();
    const fetcher = vi.fn(async (url: string, _options: RequestInit) => {
        const response = new Response('synthetic', { headers: { 'Content-Type': url.endsWith('bad.js') ? 'text/html' : url.endsWith('.css') ? 'text/css' : 'application/javascript' } });
        if (url.endsWith('redirect.js')) Object.defineProperty(response, 'redirected', { value: true });
        return response;
    });
    const cache = { match: async (url: string) => stored.get(url), put: async (url: string, response: Response) => { stored.set(url, response); } };
    vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
        self: { location: { origin }, addEventListener: (name: string, handler: (event: Message) => void) => handlers.set(name, handler) },
        caches: { open: async () => cache }, fetch: fetcher, URL,
    });
    const urls = ['/assets/app.js', '/assets/app.css', '/api/auth/me', '/assets/bad.js', '/assets/redirect.js',
        '/assets/app.js?token=private', 'https://other.test/assets/private.js', 'https://user:secret@pwa.test/assets/private.js', null, 1];
    handlers.get('message')?.({ data: { type: 'CACHE_PUBLIC_ASSETS', urls }, waitUntil: promise => { pending.push(promise); } });
    await Promise.all(pending);
    expect([...stored.keys()].sort()).toEqual([origin + '/assets/app.css', origin + '/assets/app.js']);
    expect(fetcher.mock.calls.every(([, options]) => options.credentials === 'omit' && options.cache === 'no-store')).toBe(true);
    expect(loadedPublicAssets(urls.filter((value): value is string => typeof value === 'string'), origin)).not.toContain(origin + '/api/auth/me');
});
it('first-claim warming captures pre-claim requests that finish later without replaying later API traffic', () => {
    const origin = 'https://pwa.test';
    interface Entry { name: string; startTime: number; responseEnd: number }
    let emit: (entries: Entry[]) => void = () => {};
    const disconnected = vi.fn(), observed = vi.fn(), listen = vi.fn();
    vi.stubGlobal('performance', { now: () => 100, getEntriesByType: () => [{ name: origin + '/assets/initial.js' }] });
    vi.stubGlobal('PerformanceObserver', class {
        constructor(callback: (list: { getEntries: () => Entry[] }) => void) { emit = entries => callback({ getEntries: () => entries }); }
        observe = observed;
        disconnect = disconnected;
    });
    vi.stubGlobal('window', { addEventListener: listen });
    const postMessage = vi.fn((_message: unknown) => {});
    warmInitialPublicAssets({ postMessage }, origin);
    expect(observed).toHaveBeenCalledWith({ type: 'resource', buffered: true });
    emit([{ name: origin + '/assets/late.js', startTime: 90, responseEnd: 110 },
        { name: origin + '/assets/already-controlled.js', startTime: 101, responseEnd: 120 },
        { name: origin + '/api/auth/me', startTime: 90, responseEnd: 110 }]);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1]?.[0]).toEqual({ type: 'CACHE_PUBLIC_ASSETS', urls: [origin + '/assets/late.js'] });
    expect(listen.mock.calls[0]?.[0]).toBe('pagehide');
    listen.mock.calls[0]?.[1](); expect(disconnected).toHaveBeenCalledOnce();
});
