import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import jwt from 'jsonwebtoken';
import { createApp } from '../build/app/createApp.js';
import { createExpressApp } from '../src/app/createExpressApp.js';
import { createRuntime } from '../src/app/runtime.js';
import { buildRoutes } from '../src/app/routes.js';
import { createRateLimiter, ResponseOutput } from '../src/generated/http.cjs';
import { installProcessShutdown } from '../src/infrastructure/jobs/lifecycle.js';
import { readBackendSource } from '../../scripts/lib/backend-source.mjs';
import { startFastify } from '../src/entrypoints/fastify.mjs';

const secret = 'synthetic-phase7-http-secret';
const token = (more = {}) => jwt.sign({ userId: 'A', tokenVersion: 0, ...more }, secret);
const blocked = async () => { throw new Error('Synthetic provider unavailable'); };
function fixture(overrides = {}, config = {}) {
    const prisma = { user: { findUnique: async () => ({ isActive: true, tokenVersion: 0 }) },
        $transaction: async fn => fn({ $executeRawUnsafe: async () => 0, $queryRawUnsafe: async () => [{ n: 1 }] }), ...overrides };
    return createRuntime({ prisma, config: { jwtSecret: secret, nodeEnv: 'test', ...config },
        providers: { backupStore: { uploadBackup: blocked, pruneOldBackups: blocked }, fetch: blocked } });
}
async function pair(run, overrides, config) {
    const a = fixture(overrides, config), b = fixture(overrides, config);
    const express = createExpressApp({ runtime: a }), fastify = await createApp({ runtime: b });
    const server = express.listen(0, '127.0.0.1'); await once(server, 'listening');
    await fastify.listen({ host: '127.0.0.1', port: 0 });
    const base = [`http://127.0.0.1:${server.address().port}`, fastify.listeningOrigin];
    const request = async (route, options = {}) => Promise.all(base.map(async url => {
        const response = await fetch(url + route, { ...options, signal: AbortSignal.timeout(10000) });
        const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
        return { status: response.status, headers: Object.fromEntries(response.headers), body };
    }));
    try { await run(request, { a, b, fastify }); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fastify.close(); }
}
const equal = ([a, b], status) => { assert.equal(a.status, status); assert.equal(b.status, status); assert.deepEqual(a.body, b.body); return a; };

test('7 transport: every private endpoint rejects missing JWT in both real HTTP servers', async () => {
    await pair(async (call, { a }) => {
        for (const route of buildRoutes(a.services).filter(r => r.guards.some(g => g.kind === 'auth'))) {
            const url = route.path.replace(/:[^/]+/g, 'synthetic');
            equal(await call(url, { method: route.method }), 401);
        }
    });
});
test('7 transport: invalid JWT is 401 with no dependency lookup', async () => {
    await pair(async call => equal(await call('/api/auth/me', { headers: { authorization: 'Bearer invalid' } }), 401),
        { user: { findUnique: () => { throw Error('Must not query'); } } });
});
test('7 transport: revoked tokenVersion is 401', async () => {
    await pair(async call => equal(await call('/api/auth/me', { headers: { authorization: `Bearer ${token()}` } }), 401),
        { user: { findUnique: async () => ({ isActive: true, tokenVersion: 1 }) } });
});
test('7 transport: PostgreSQL outage remains 503 and Retry-After without secrets', async () => {
    await pair(async call => {
        const result = await call('/api/auth/me', { headers: { authorization: `Bearer ${token()}` } }); equal(result, 503);
        for (const r of result) { assert.equal(r.headers['retry-after'], '5'); assert(!JSON.stringify(r.body).includes('sensitive')); }
    }, { user: { findUnique: () => { throw Object.assign(Error('sensitive SQL'), { code: 'P1001' }); } } });
});
test('7 transport: expired signed JWT is 401', async () => {
    await pair(async call => equal(await call('/api/auth/me', { headers: { authorization: `Bearer ${token({ exp: 1 })}` } }), 401));
});
test('7 transport: JSON syntax errors are safe 400 before authentication', async () => {
    await pair(async call => equal(await call('/api/workouts/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' }), 400));
});
test('7 transport: JSON primitive/null rejected, arrays accepted without coercion', async () => {
    await pair(async call => {
        for (const body of ['null', '1', '"text"', 'false']) equal(await call('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body }), 400);
        equal(await call('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]' }), 400);
    });
});
test('7 transport: empty JSON entity retains required-field errors', async () => {
    await pair(async call => equal(await call('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '' }), 400));
});
test('7 transport: unsupported media are ignored as Express does', async () => {
    await pair(async call => {
        for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/vnd.synthetic+json'])
            equal(await call('/api/auth/register', { method: 'POST', headers: { 'content-type': type }, body: '{"username":"a"}' }), 400);
    });
});
test('7 transport: body greater than 10 MiB is bounded and rejected safely', async () => {
    await pair(async call => equal(await call('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(10 * 1024 * 1024) }) }), 413));
});
test('7 transport: compressed JSON and legacy UTF charsets keep exact parse/error semantics', async () => {
    await pair(async call => {
        for (const [headers, body, status] of [
            [{ 'content-encoding': 'gzip' }, gzipSync('{}'), 400], [{ 'content-encoding': 'deflate' }, deflateSync('{}'), 400],
            [{ 'content-encoding': 'br' }, brotliCompressSync('{}'), 500], [{ 'content-type': 'application/json; charset=latin1' }, '{}', 500],
            [{ 'content-type': 'application/json; charset=utf-16le' }, Buffer.from('{}', 'utf16le'), 400],
            [{ 'content-encoding': 'gzip' }, Buffer.from('invalid gzip'), 500]
        ]) equal(await call('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }), status);
    });
});
test('7 transport: rate limit emits equivalent 429, Retry-After and body', async () => {
    await pair(async call => {
        for (let i = 0; i < 12; i++) equal(await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), 400);
        const result = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        equal(result, 429); assert.equal(result[0].headers['retry-after'], result[1].headers['retry-after']);
    });
});
test('7 transport: CORS preflight, denied origin and security headers agree', async () => {
    await pair(async call => {
        const rs = await call('/api/workouts/log', { method: 'OPTIONS', headers: { origin: 'https://allowed.invalid', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
        equal(rs, 204);
        for (const header of ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers']) assert.equal(rs[0].headers[header], rs[1].headers[header]);
        const denied = await call('/api/health', { headers: { origin: 'https://denied.invalid' } });
        for (const r of denied) { assert.equal(r.headers['access-control-allow-origin'], undefined); assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN'); }
    }, undefined, { corsOrigin: 'https://allowed.invalid' });
});
test('7 transport: private JSON cannot be reused through conditional GET after authentication', async () => {
    await pair(async call => {
        const headers = { authorization: `Bearer ${token()}` }, first = await call('/api/push/vapid-public-key', { headers }); equal(first, 200);
        assert.equal(first[0].headers.etag, undefined); assert.equal(first[1].headers.etag, undefined);
        for (const response of first) assert.equal(response.headers['cache-control'], 'no-store');
        // Fetch otherwise adds Cache-Control:no-cache to conditional requests;
        // force-cache keeps these synthetic HTTP headers explicit and unchanged.
        const cached = await call('/api/push/vapid-public-key', { cache: 'force-cache', headers: { ...headers, 'if-none-match': '*' } }); equal(cached, 200);
        assert.deepEqual(cached[0].body, first[0].body);
        equal(await call('/api/push/vapid-public-key', { headers: { authorization: 'Bearer invalid', 'if-none-match': '*' } }), 401);
    });
});
test('7 transport: public probes preserve privacy and request IDs are locally generated', async () => {
    await pair(async call => {
        const rs = await call('/api/health', { headers: { 'x-request-id': 'client-controlled' } });
        for (const r of rs) { assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.body).sort(), ['status', 'timestamp']); assert.equal(r.headers['cache-control'], 'no-store'); assert.match(r.headers['x-request-id'], /^[a-f0-9-]{36}$/); }
        equal(await call('/api/ready'), 200);
    }, { user: { findUnique: () => { throw Error('Public leak'); } } });
});
test('7 transport: readiness failure and closing preserve liveness distinctions', async () => {
    await pair(async (call, { a, b }) => {
        equal(await call('/api/ready'), 503);
        a.markClosing(); b.markClosing(); const rs = await call('/api/health'); for (const r of rs) { assert.equal(r.status, 503); assert.equal(r.body.status, 'unavailable'); }
    }, { $transaction: blocked });
});
test('7 transport: case, trailing slash and HEAD match Express route semantics', async () => {
    await pair(async call => {
        for (const url of ['/API/AUTH/ME', '/api/auth/me/']) equal(await call(url), 401);
        const rs = await call('/api/auth/me', { method: 'HEAD' }); equal(rs, 401); assert.equal(rs[0].body, '');
    });
});
test('7 transport: unknown API and unsupported methods never serve SPA', async () => {
    await pair(async call => {
        for (const [url, method] of [['/api/missing', 'GET'], ['/API/missing', 'GET'], ['/api', 'GET'], ['/api%2fmissing', 'GET'], ['/%61pi/missing', 'GET'], ['/api/health', 'PATCH']]) equal(await call(url, { method }), 404);
    });
});
test('7 transport: built SPA, assets, manifest, icons and service worker are served safely', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nexlift-phase7-static-')); await mkdir(path.join(root, 'assets'));
    for (const [file, text] of [['index.html', '<html>synthetic frontend</html>'], ['assets/app-hash.js', 'export const ok=true;'], ['sw.js', 'self.version=1;'], ['manifest.json', '{"scope":"/"}'], ['icon.svg', '<svg/>']]) await writeFile(path.join(root, file), text);
    await pair(async call => {
        for (const url of ['/', '/routines/ra', '/assets/app-hash.js', '/sw.js', '/manifest.json', '/icon.svg']) {
            const rs = await call(url); equal(rs, 200);
            assert.equal(rs[0].headers['content-type'].toLowerCase(), rs[1].headers['content-type'].toLowerCase());
            assert.equal(rs[0].headers['cache-control'], rs[1].headers['cache-control']);
        }
        const html = await call('/routines/ra'); assert.equal(html[1].headers['cache-control'], 'no-cache');
        const js = await call('/assets/app-hash.js'); assert.match(js[1].headers['cache-control'], /immutable/);
        const sw = await call('/sw.js'); assert.equal(sw[1].headers['service-worker-allowed'], undefined);
        equal(await call('/api/missing'), 404);
    }, undefined, { staticRoot: root });
});
test('7 architecture: factories build independent applications without connecting Prisma or starting jobs', async () => {
    const runtime = fixture({ $connect: () => { throw Error('Unexpected connection'); } });
    const a = await createApp({ runtime }), b = await createApp({ runtime });
    assert.equal((await a.inject('/api/health')).statusCode, 200); await a.close();
    assert.equal((await b.inject('/api/health')).statusCode, 503); // same explicitly shared runtime was marked closing
    await b.close();
    for (const file of ['app/runtime.d.ts', 'app/routes.d.ts', 'modules/auth/authenticate.d.ts'])
        assert.equal(await readFile(new URL('../build/' + file, import.meta.url), 'utf8'), await readFile(new URL('../src/' + file, import.meta.url), 'utf8'));
    const require = createRequire(new URL('../../package.json', import.meta.url)), ts = require('typescript');
    const root = await mkdtemp(path.join(tmpdir(), 'nexlift-phase7-types-')), consumer = path.join(root, 'consumer.mts');
    const appPath = fileURLToPath(new URL('../build/app/createApp.js', import.meta.url)).replaceAll('\\', '/');
    const runtimePath = fileURLToPath(new URL('../build/app/runtime.js', import.meta.url)).replaceAll('\\', '/');
    await writeFile(consumer, `import {createApp} from ${JSON.stringify(appPath)};import type {ApplicationRuntime} from ${JSON.stringify(runtimePath)};declare const runtime:ApplicationRuntime;createApp({runtime}).then(app=>app.close());`);
    const program = ts.createProgram([consumer], { strict: true, noEmit: true, skipLibCheck: false, target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
});
test('7 architecture: live migrated business statements match received source', async () => {
    assert.equal(await readBackendSource(), await readFile(new URL('../../scripts/fixtures/phase7/index.received.txt', import.meta.url), 'utf8'));
});
test('7 architecture: domain modules have no Express/Fastify imports or raw HTTP access', async () => {
    async function check(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name); if (entry.isDirectory()) await check(file); else if (file.endsWith('.js')) assert.doesNotMatch(await readFile(file, 'utf8'), /from ['"](?:express|fastify)|\.raw\b|\.socket\b/);
    } }
    await check(fileURLToPath(new URL('../src/modules/', import.meta.url)));
});
test('7 boundary: response output rejects double completion', () => {
    const out = new ResponseOutput(); out.json({ ok: true }); assert.throws(() => out.json({ ok: false }));
});
test('7 boundary: rate limiter retains inclusive limit, window and account key semantics', () => {
    let now = 0; const limit = createRateLimiter(() => now), req = { ip: 'a', path: '/login', body: { username: 'a' } };
    const policy = { max: 1, windowMs: 1000, keyFn: req => req.body.username };
    assert.equal(limit(req, policy), undefined); assert.equal(limit({ ...req, ip: 'b' }, policy).status, 429);
    assert.equal(limit({ ...req, body: { username: 'b' } }, policy), undefined); now = 1001; assert.equal(limit(req, policy), undefined);
});
test('7 lifecycle: shutdown drains HTTP, jobs and Prisma exactly once', async () => {
    const events = [], signals = new EventEmitter();
    const runtime = { markClosing: () => events.push('closing'), stopBackground: async () => events.push('jobs'), prisma: { $disconnect: async () => events.push('prisma') } };
    const stop = installProcessShutdown({ runtime, signals, closeHttp: async () => events.push('http'), exit: n => events.push(n) });
    await Promise.all([stop(), stop()]); assert.deepEqual(events, ['closing', 'http', 'jobs', 'prisma', 0]); assert.equal(signals.listenerCount('SIGTERM'), 0);
});
test('7 lifecycle: production Fastify activation is blocked before any connection', async () => {
    for (const env of [{}, { NODE_ENV: 'production', NEXLIFT_FASTIFY_REHEARSAL: 'true', JWT_SECRET: secret },
        { NODE_ENV: 'test', NEXLIFT_FASTIFY_REHEARSAL: 'true', JWT_SECRET: secret, DATABASE_URL: 'postgresql://example.invalid/nexlift_ops_test_a' }]) await assert.rejects(startFastify({ env }));
});
