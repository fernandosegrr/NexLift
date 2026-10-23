import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const shell = '<meta name="nexlift-shell" content="v4"><div id="root"></div>';
const html = (body = shell, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
async function worker() {
    const handlers = {}, stores = new Map(), calls = { deleted: 0, navigated: 0, claimed: 0, skipped: 0 };
    const caches = { keys: async () => [...stores.keys()], delete: async () => { calls.deleted++; },
        open: async key => { if (!stores.has(key)) stores.set(key, new Map()); const store = stores.get(key);
            return { put: async (url, response) => store.set(url, response.clone()), match: async url => store.get(url)?.clone() }; } };
    let network = async () => html();
    const self = { location: { origin: 'https://isolated.invalid' }, addEventListener: (name, fn) => { handlers[name] = fn; },
        skipWaiting: async () => { calls.skipped++; }, clients: { claim: async () => { calls.claimed++; }, matchAll: async () => [{ url: 'https://isolated.invalid/workout/day',
            focus: async () => {}, navigate: async () => { calls.navigated++; } }] } };
    runInNewContext(await readFile(new URL('../../client/public/sw.js', import.meta.url), 'utf8'), { self, caches, fetch: (...args) => network(...args), URL, Response, AbortSignal });
    const lifecycle = async name => { let promise; handlers[name]({ waitUntil: p => { promise = p; } }); return promise; };
    const navigate = async (pathname = '/workout/day', headers = new Headers()) => { let promise;
        handlers.fetch({ request: { url: self.location.origin + pathname, method: 'GET', mode: 'navigate', headers }, respondWith: p => { promise = p; }, waitUntil: () => {} }); return promise; };
    return { stores, caches, calls, lifecycle, handlers, navigate, setNetwork: fn => { network = fn; } };
}
for (const status of [502, 503, 504, 408, 200]) test(`availability: proxy ${status} cannot replace or poison verified shell`, async () => {
    const w = await worker(); await w.lifecycle('install');
    w.setNetwork(async () => html('Service is not reachable', status));
    assert.equal(await (await w.navigate()).text(), shell);
    for (const store of w.stores.values()) for (const response of store.values()) assert.equal(await response.clone().text(), shell);
});
test('availability: unavailable socket and bounded timeout use shell; healthy network subsequently recovers', async () => {
    const w = await worker(); await w.lifecycle('install');
    for (const reason of [new TypeError('socket unavailable'), new DOMException('timeout', 'TimeoutError')]) {
        w.setNetwork(async () => { throw reason; }); assert.equal(await (await w.navigate()).text(), shell);
    }
    w.setNetwork(async (_req, options) => { assert.equal(options.cache, 'no-store'); assert(options.signal); return html(shell + ' recovered'); });
    assert.match(await (await w.navigate()).text(), /recovered/);
});
test('availability: failed install rejects and activation preserves old assets, drafts and private caches', async () => {
    const w = await worker(); w.stores.set('nexlift-static-old', new Map()); w.stores.set('private-old', new Map());
    w.setNetwork(async () => html('proxy', 503)); await assert.rejects(w.lifecycle('install'));
    assert.equal(w.calls.skipped, 0); await w.lifecycle('activate'); assert.equal(w.calls.deleted, 0); assert.equal(w.calls.claimed, 1);
});
test('availability: no verified shell returns real 503; auth/404/API never become shell', async () => {
    const w = await worker(); w.setNetwork(async () => { throw Error('offline'); });
    const unavailable = await w.navigate(); assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    w.setNetwork(async () => html()); await w.lifecycle('install');
    for (const status of [401, 403, 404]) { w.setNetwork(async () => html('denied', status)); assert.equal((await w.navigate()).status, status); }
    w.setNetwork(async () => html('private', 503)); assert.equal((await w.navigate('/api/auth/me')).status, 503);
    assert.equal((await w.navigate('/private', new Headers({ Authorization: 'Bearer synthetic' }))).status, 503);
});
test('availability: old poisoned 200 cache is rejected and notification focuses workout without navigation', async () => {
    const w = await worker(); w.stores.set('nexlift-static-old', new Map([['/index.html', html('proxy')]]));
    w.setNetwork(async () => { throw Error('offline'); }); assert.equal((await w.navigate()).status, 503);
    let promise; w.handlers.notificationclick({ notification: { close() {}, data: { url: '/' } }, waitUntil: p => { promise = p; } });
    await promise; assert.equal(w.calls.navigated, 0);
});
