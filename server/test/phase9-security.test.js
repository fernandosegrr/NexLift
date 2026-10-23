import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import jwt from 'jsonwebtoken';
import { createApp } from '../build/app/createApp.js';
import { createExpressApp } from '../src/app/createExpressApp.js';
import { createRuntime } from '../src/app/runtime.js';
import { trustedProxy } from '../src/app/security.js';
import { operationalLog } from '../src/operations/telemetry.js';
import { createRateLimiter } from '../src/generated/http.cjs';
import { validPushEndpoint, validPushKeys } from '../src/modules/notifications/subscriptions.js';
import { fakeProviders } from './fixtures/phase7-providers.js';

const secret = 'synthetic-phase9-secret', origin = 'https://web.synthetic.invalid';
const token = () => jwt.sign({ userId: 'A', tokenVersion: 0 }, secret, { expiresIn: '365d' });
async function pair(run, config = {}, overrides = {}) {
    const runtimes = [0, 1].map(() => createRuntime({ prisma: { user: { findUnique: async () => ({ id: 'A', isActive: true, tokenVersion: 0 }) }, ...overrides },
        config: { jwtSecret: secret, nodeEnv: 'test', ...config }, providers: fakeProviders() }));
    const express = createExpressApp({ runtime: runtimes[0] }), fastify = await createApp({ runtime: runtimes[1] });
    const server = express.listen(0, '127.0.0.1'); await once(server, 'listening');
    await fastify.listen({ host: '127.0.0.1', port: 0 });
    const bases = [`http://127.0.0.1:${server.address().port}`, fastify.listeningOrigin];
    const call = (url, body, options = {}) => Promise.all(bases.map(async base => {
        const response = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', ...options,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}`, ...options.headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, headers: response.headers, body: await response.json() };
    }));
    try { await run(call, runtimes, bases); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fastify.close(); await Promise.all(runtimes.map(r => r.stopBackground())); }
}
function statuses(rows, status) { rows.forEach(row => assert.equal(row.status, status, JSON.stringify(row.body))); }

test('9 HTTP: every private API result is no-store, unconditionally including errors', async () => {
    await pair(async call => {
        for (const url of ['/api/auth/me', '/api/missing', '/api/push/vapid-public-key']) {
            for (const row of await call(url)) { assert.equal(row.headers.get('cache-control'), 'no-store'); assert.equal(row.headers.get('etag'), null); }
        }
    });
});
test('9 HTTP: strict script policy, permissions and anti-framing headers match both transports', async () => {
    await pair(async call => { for (const row of await call('/api/auth/me')) {
        assert.match(row.headers.get('content-security-policy-report-only'), /script-src 'self';/);
        assert.doesNotMatch(row.headers.get('content-security-policy-report-only'), /script-src[^;]*(unsafe-inline|\*)/);
        assert.equal(row.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=()');
        assert.equal(row.headers.get('x-frame-options'), 'SAMEORIGIN');
    } });
});
test('9 HTTP: forged forwarding cannot rotate login origin limits', async () => {
    await pair(async call => {
        for (let n = 0; n < 12; n++) statuses(await call('/api/auth/login', {}, { headers: { 'x-forwarded-for': `198.51.100.${n}` } }), 400);
        for (const row of await call('/api/auth/login', {}, { headers: { 'x-forwarded-for': '203.0.113.99' } })) {
            assert.equal(row.status, 429); assert(Number(row.headers.get('retry-after')) > 0);
        }
    });
});
test('9 HTTP: explicit trusted reverse proxy retains per-origin limits', async () => {
    await pair(async call => {
        for (let n = 0; n < 14; n++) statuses(await call('/api/auth/login', {}, { headers: { 'x-forwarded-for': `198.51.100.${n}` } }), 400);
    }, { trustedProxyCidrs: '127.0.0.1/32' });
});
test('9 proxy: exact CIDRs, IPv4 mapped IPv6 and invalid configuration fail safely', () => {
    const trust = trustedProxy('10.1.2.0/24,::1/128');
    assert(trust('10.1.2.3')); assert(trust('::ffff:10.1.2.3')); assert(trust('::1'));
    assert(!trust('198.51.100.1')); assert(!trustedProxy()('127.0.0.1'));
    for (const value of ['1', 'true', 'loopback', '0.0.0.0/no', '10.0.0.0/999']) assert.throws(() => trustedProxy(value));
});
test('9 HTTP: malicious CORS origin receives no credentials or allow-origin', async () => {
    await pair(async call => { for (const row of await call('/api/auth/me', undefined, { headers: { origin: 'https://attacker.invalid' } })) {
        assert.equal(row.headers.get('access-control-allow-origin'), null); assert.equal(row.headers.get('access-control-allow-credentials'), null);
    } }, { corsOrigin: origin });
});
test('9 auth: missing recovery identity never queries an arbitrary account', async () => {
    await pair(async call => statuses(await call('/api/auth/recover/question', {}), 400), {}, { user: { findFirst: () => { throw Error('Must not query'); } } });
});
test('9 auth: non-string credentials and oversized new bcrypt passwords reject before SQL', async () => {
    await pair(async call => {
        for (const body of [{ username: {}, password: 'password' }, { username: ['A'], password: 'password' }, { username: 'A', password: {} }])
            statuses(await call('/api/auth/login', body), 400);
        statuses(await call('/api/auth/password', { currentPassword: 'password', newPassword: 'é'.repeat(37) }, { method: 'PUT' }), 400);
    });
    await pair(async call => {
        statuses(await call('/api/auth/login', { username: 'legacy', password: 'x'.repeat(5000) }), 401);
        statuses(await call('/api/auth/login', { username: 'legacy', password: ' '.repeat(8) }), 401);
        statuses(await call('/api/auth/recover/verify', { username: 'legacy', answer: 'x'.repeat(5000), newPassword: 'Synthetic123' }), 401);
        statuses(await call('/api/auth/register', { username: 'new', email: 'new@synthetic.invalid', password: 'Synthetic123', firstName: 'New', lastName: 'User',
            securityQuestion: 'Synthetic?', securityAnswer: 'x'.repeat(73) }), 400);
    }, {}, { user: { findFirst: async () => null } });
});
test('9 auth: absent account and wrong recovery answer return the same generic failure', async () => {
    await pair(async call => {
        statuses(await call('/api/auth/recover/verify', { username: 'missing', answer: 'wrong', newPassword: 'Synthetic123' }), 401);
    }, {}, { user: { findFirst: async () => null } });
});
test('9 auth: unauthenticated PostgreSQL dependency failure remains 503 without secret details', async () => {
    await pair(async call => { for (const row of await call('/api/auth/login', { username: 'A', password: 'Synthetic123' })) {
        assert.equal(row.status, 503); assert.equal(row.headers.get('retry-after'), '5'); assert.doesNotMatch(JSON.stringify(row.body), /secret/);
    } }, {}, { user: { findFirst: async () => { throw Object.assign(Error('secret-database-url'), { code: 'P1001' }); } } });
});
test('9 sessions: cookie bridge disabled by default and blocked in production', async () => {
    for (const config of [{}, { webSessionEnabled: true, webOrigin: origin, nodeEnv: 'production' }])
        await pair(async call => statuses(await call('/api/auth/web-session', {}), 404), config);
});
test('9 sessions: explicit exchange sets opaque secure HttpOnly cookie without returning a JWT', async () => {
    await pair(async call => {
        statuses(await call('/api/auth/web-session', {}, { headers: { origin } }), 403);
        for (const row of await call('/api/auth/web-session', {}, { headers: { origin, 'x-nexlift-web-session': '1' } })) {
            assert.equal(row.status, 201); assert.match(row.headers.get('set-cookie'), /^__Host-nexlift_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/);
            assert.deepEqual(Object.keys(row.body).sort(), ['csrf', 'userId']); assert.doesNotMatch(JSON.stringify(row.body), /eyJ/);
        }
    }, { webSessionEnabled: true, webOrigin: origin });
});
test('9 sessions: cookie authentication requires CSRF and exact origin, logout revokes replay', async () => {
    await pair(async (call, _runtimes, bases) => {
        const exchange = await call('/api/auth/web-session', {}, { headers: { origin, 'x-nexlift-web-session': '1' } });
        for (let n = 0; n < bases.length; n++) {
            const cookie = exchange[n].headers.get('set-cookie').split(';')[0], csrf = exchange[n].body.csrf;
            const request = async (method, headers = {}) => {
                const response = await fetch(bases[n] + '/api/auth/web-session', { method, headers: { cookie, ...headers } }); return response;
            };
            assert.equal((await request('GET')).status, 200);
            for (const headers of [{}, { origin }, { origin: 'https://attacker.invalid', 'x-nexlift-csrf': csrf }, { origin, 'x-nexlift-csrf': 'wrong' }])
                assert.equal((await request('DELETE', headers)).status, 403);
            const logout = await request('DELETE', { origin, 'x-nexlift-csrf': csrf }); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
            assert.equal((await request('GET')).status, 401);
            assert.equal((await fetch(bases[n] + '/api/auth/me', { headers: { authorization: `Bearer ${token()}` } })).status, 200);
        }
    }, { webSessionEnabled: true, webOrigin: origin });
});
test('9 sessions: tokenVersion revocation and restart invalidate rehearsed cookies', async () => {
    let version = 0;
    await pair(async (call, runtimes, bases) => {
        const rows = await call('/api/auth/web-session', {}, { headers: { origin, 'x-nexlift-web-session': '1' } }); version = 1;
        for (let n = 0; n < 2; n++) {
            const headers = { cookie: rows[n].headers.get('set-cookie').split(';')[0] };
            assert.equal((await fetch(bases[n] + '/api/auth/me', { headers })).status, 401);
            runtimes[n].services.webSessions.clear(); version = 0;
            assert.equal((await fetch(bases[n] + '/api/auth/me', { headers })).status, 401); version = 1;
        }
    }, { webSessionEnabled: true, webOrigin: origin }, { user: { findUnique: async () => ({ isActive: true, tokenVersion: version }) } });
});
test('9 limits: simultaneous requests cannot exceed identity quota and full store never resets existing quotas', async () => {
    const limit = createRateLimiter(() => 1), policy = { max: 3, keyFn: req => req.ip };
    const results = await Promise.all(Array.from({ length: 20 }, async () => limit({ ip: 'A' }, policy)));
    assert.equal(results.filter(Boolean).length, 17);
    for (let i = 0; i < 50001; i++) limit({ ip: String(i) }, policy);
    assert.equal(limit({ ip: 'A' }, policy).status, 429); assert.equal(limit({ ip: 'new' }, policy).status, 429);
});
test('9 logs: structured duration and fixed module exclude all supplied secrets', () => {
    const lines = [];
    operationalLog({ event: 'push_failed', category: 'provider', module: 'notifications', durationMs: 23.4, count: 2,
        requestId: 'Authorization: secret', password: 'secret', cookie: 'secret', endpoint: 'https://capability.invalid/private', databaseUrl: 'secret', error: Error('secret') }, line => lines.push(line));
    const row = JSON.parse(lines[0]); assert.equal(row.durationMs, 23); assert.equal(row.count, 2);
    assert.doesNotMatch(lines[0], /secret|Authorization|capability|database|password|cookie/);
});
test('9 push: endpoints reject SSRF, credentials, foreign provider hosts and malformed encryption keys', () => {
    for (const endpoint of ['http://127.0.0.1/push', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.attacker.invalid/push', 'https://u:p@fcm.googleapis.com/push', 'https://fcm.googleapis.com:444/push'])
        assert.equal(validPushEndpoint(endpoint, 'production'), false);
    assert(validPushEndpoint('https://fcm.googleapis.com/fcm/send/synthetic', 'production'));
    assert.equal(validPushEndpoint('https://synthetic.invalid/push', 'production'), false);
    assert.equal(validPushKeys({ p256dh: 'fake', auth: 'fake' }), false);
});

async function worker() {
    const handlers = {}, calls = { show: [], open: [], navigated: [], read: 0, write: 0 };
    const context = { URL, Headers, self: { location: { origin: 'https://app.synthetic.invalid' },
        addEventListener: (name, fn) => { handlers[name] = fn; }, registration: { showNotification: async (...args) => calls.show.push(args) } },
        clients: { matchAll: async () => [], openWindow: async url => calls.open.push(url) },
        fetch: async () => new Response('private'), caches: { match: async () => { calls.read++; }, open: async () => ({ put: async () => { calls.write++; } }) } };
    context.self.clients = context.clients;
    runInNewContext(await readFile(new URL('../../client/public/sw.js', import.meta.url), 'utf8'), context);
    const event = async (name, data) => { let task; handlers[name]({ ...data, waitUntil: value => { task = value; } }); await task; };
    return { calls, context, event, handlers };
}
test('9 SW: unknown private same-origin files are never cached', async () => {
    const w = await worker(); let captured = false;
    w.handlers.fetch({ request: { method: 'GET', mode: 'cors', url: 'https://app.synthetic.invalid/private-photo', headers: new Headers() }, respondWith: () => { captured = true; } });
    assert.equal(captured, false); assert.equal(w.calls.write, 0); assert.equal(w.calls.read, 0);
    for (const path of ['/API/auth/me', '/%61pi/auth/me']) {
        let task;
        w.handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://app.synthetic.invalid' + path, headers: new Headers() }, respondWith: value => { task = value; } });
        await task; assert.equal(w.calls.write, 0); assert.equal(w.calls.read, 0);
    }
});
test('9 SW: push payload cannot open foreign origins, API, javascript or credential URLs', async () => {
    const w = await worker();
    for (const url of ['https://attacker.invalid/', 'javascript:alert(1)', '//attacker.invalid/', 'https://u:p@app.synthetic.invalid/', '/api/auth/me']) {
        await w.event('notificationclick', { notification: { data: { url }, close() {} } });
        assert.equal(w.calls.open.at(-1), '/');
    }
});
test('9 SW: malformed and legacy push remain compatible; duplicate events do not mute a distinct next rest', async () => {
    const w = await worker();
    w.context.self.registration.getNotifications = async ({ tag }) => w.calls.show.filter(([, options]) => options.tag === tag).slice(-1).map(([, options]) => ({ data: options.data }));
    for (const data of [null, [], { eventId: 'first', tag: 'same', title: 'NexLift', body: '<script>private</script>', url: '/?checkin=creatine' }])
        await w.event('push', { data: { json: () => data } });
    assert.equal(w.calls.show.length, 3); assert.equal(w.calls.show[2][1].renotify, false);
    assert.equal(w.calls.show[2][1].data.url, '/?checkin=creatine');
    await w.event('push', { data: { json: () => ({ eventId: 'first', tag: 'same' }) } });
    assert.equal(w.calls.show[3][1].renotify, false);
    await w.event('push', { data: { json: () => ({ eventId: 'second', tag: 'same' }) } });
    assert.equal(w.calls.show[4][1].renotify, true);
    await w.event('push', { data: { json: () => ({ tag: 'same' }) } });
    assert.equal(w.calls.show[5][1].renotify, true);
});
test('9 SW: same-origin window is focused without navigating an active workout', async () => {
    const w = await worker(); let focused = false, navigated;
    w.context.clients.matchAll = async () => [{ url: 'https://app.synthetic.invalid/workout', navigate: async url => { navigated = url; return { focus: async () => { focused = true; } }; }, focus() { focused = true; } }];
    await w.event('notificationclick', { notification: { data: { url: '/?checkin=creatine' }, close() {} } });
    assert(focused); assert.equal(navigated, undefined); assert.equal(w.calls.open.length, 0);
});
