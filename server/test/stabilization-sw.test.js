import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

for (const route of ['/api/auth/me', '/api/v1/workout-capabilities', '/private-profile']) {
    test(`SW: navegacion privada ${route} nunca reemplaza shell ni consulta cache`, async () => {
        const handlers = {}, calls = { read: 0, write: 0 }, headers = new Headers(route.startsWith('/api') ? {} : { Authorization: 'Bearer synthetic' });
        runInNewContext(await readFile(new URL('../../client/public/sw.js', import.meta.url), 'utf8'), {
            self: { location: { origin: 'https://isolated.invalid' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
            URL, fetch: async () => new Response('{"private":true}'),
            caches: { match: async () => { calls.read++; }, open: async () => ({ put: async () => { calls.write++; } }) }
        });
        let promise;
        handlers.fetch({ request: { method: 'GET', mode: 'navigate', headers, url: 'https://isolated.invalid' + route }, respondWith: value => { promise = value; } });
        await promise; await Promise.resolve();
        assert.deepEqual(calls, { read: 0, write: 0 });
    });
}
