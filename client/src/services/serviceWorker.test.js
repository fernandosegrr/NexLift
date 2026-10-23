import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
    const handlers = {};
    const fetch = vi.fn(async () => new Response('{"live":true}'));
    const caches = { match: vi.fn(async () => new Response('{"user":"other"}')), open: vi.fn(),
        keys: vi.fn(async () => ['unrelated', 'nexlift-api-old', 'nexlift-static-old']), delete: vi.fn() };
    runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
        self: { clients: { claim: vi.fn() }, location: { origin: 'https://test.invalid' }, addEventListener: (name, cb) => { handlers[name] = cb; } },
        caches, fetch, URL, console, clients: { claim: vi.fn() }
    });
    async function get(url, headers) {
        let result;
        handlers.fetch({ request: new Request(url, { headers }), respondWith: promise => { result = promise; } });
        return await result;
    }
    return { ...handlers, fetch, caches, get };
}
describe('service worker: API sin caché compartida', () => {
    it('today-log va a red sin leer ni escribir versiones cacheadas', async () => {
        const w = worker();
        expect(await (await w.get('https://test.invalid/api/workouts/today-log?exerciseId=ex1')).json()).toEqual({ live: true });
        expect(w.fetch).toHaveBeenCalledTimes(1);
        expect(w.fetch.mock.calls[0][1]).toEqual({ cache: 'no-store' });
        expect(w.caches.match).not.toHaveBeenCalled();
        expect(w.caches.open).not.toHaveBeenCalled();
    });
    it('offline no entrega como GET actual la respuesta de otra cuenta', async () => {
        const w = worker();
        w.fetch.mockRejectedValue(new TypeError('offline'));
        await expect(w.get('https://test.invalid/api/auth/me')).rejects.toThrow('offline');
        expect(w.caches.match).not.toHaveBeenCalled();
    });
    it('Authorization impide el fallback incluso fuera de /api y en otro origen', async () => {
        const w = worker();
        w.fetch.mockRejectedValue(new TypeError('offline'));
        await expect(w.get('https://other.invalid/workouts/today-log', { Authorization: 'Bearer test' })).rejects.toThrow('offline');
        expect(w.caches.match).not.toHaveBeenCalled();
    });
    it('activar solo retira shells viejos, preserva cachés existentes de datos', async () => {
        const w = worker();
        let done;
        w.activate({ waitUntil: promise => { done = promise; } });
        await done;
        expect(w.caches.delete.mock.calls).toEqual([['nexlift-static-old']]);
    });
});
