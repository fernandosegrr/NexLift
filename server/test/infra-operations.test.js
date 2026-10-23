import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHealthHandlers } from '../src/operations/health.js';
import { requestContext, operationalLog } from '../src/operations/telemetry.js';
import { installShutdown } from '../src/operations/shutdown.js';
import { rehearsalConfig } from '../deploy/rehearsal-config.js';

const config = { NEXLIFT_INFRA_REHEARSAL: 'true', NEXLIFT_RELEASE_DATABASE_URL: 'postgresql://synthetic@127.0.0.1:5432/disposable',
    NODE_ENV: 'production', JWT_SECRET: 'synthetic-secret-at-least-32-characters', PORT: '3001' };
const response = () => Object.assign(new EventEmitter(), { statusCode: 200, headers: {}, set(k,v) { this.headers[k] = v; return this; },
    status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } });
for (const name of ['NEXLIFT_INFRA_REHEARSAL', 'NEXLIFT_RELEASE_DATABASE_URL', 'JWT_SECRET', 'NODE_ENV']) {
    test(`HTTP rehearsal rejects missing ${name} before startup`, () => {
        assert.throws(() => rehearsalConfig({ ...config, [name]: undefined, DATABASE_URL: config.NEXLIFT_RELEASE_DATABASE_URL }));
    });
}
test('rehearsal rejects invalid ports, secrets and connection strings without echoing values', () => {
    for (const change of [{ PORT: '0' }, { PORT: '65536' }, { PORT: '3001x' }, { JWT_SECRET: ' ' },
        { NEXLIFT_RELEASE_DATABASE_URL: 'https://secret:password@example.com/db' }, { NEXLIFT_RELEASE_DATABASE_URL: 'postgresql:///db' }]) {
        assert.throws(() => rehearsalConfig({ ...config, ...change }), error => !error.message.includes('password'));
    }
});
test('valid configuration uses the explicit target and bounds connection waits', () => {
    const result = rehearsalConfig({ ...config, DATABASE_URL: 'postgresql://forbidden/persistent' });
    assert.equal(result.port, 3001); assert.equal(new URL(result.url).hostname, '127.0.0.1');
    assert.equal(new URL(result.url).searchParams.get('connect_timeout'), '3');
});
test('public liveness does not query users, backups or PostgreSQL', () => {
    const res = response();
    createHealthHandlers({ prisma: new Proxy({}, { get() { throw new Error('No DB allowed'); } }) }).live({}, res);
    assert.equal(res.statusCode, 200); assert.deepEqual(Object.keys(res.body).sort(), ['status','timestamp']);
    assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('readiness probes PostgreSQL and optional schema, hiding all internal details', async () => {
    let checked = 0;
    const prisma = { $transaction: async fn => fn({ $executeRawUnsafe: async () => {}, $queryRawUnsafe: async () => [{ one: 1 }] }) };
    const handlers = createHealthHandlers({ prisma, schemaCheck: async () => { checked++; } });
    const res = response(); await handlers.ready({}, res);
    assert.equal(res.statusCode, 200); assert.equal(checked, 1); assert.deepEqual(res.body, { status: 'ready' });
    const bad = response(); await createHealthHandlers({ prisma, schemaCheck: async () => { throw new Error('secret-schema'); }, log: () => {} }).ready({}, bad);
    assert.equal(bad.statusCode, 503); assert.deepEqual(bad.body, { status: 'unavailable' });
});
test('disconnected PostgreSQL makes readiness 503 while liveness remains 200', async () => {
    const handlers = createHealthHandlers({ prisma: { $transaction: async () => { throw new Error('secret-url'); } }, log: () => {} });
    const ready = response(), live = response(); await handlers.ready({}, ready); handlers.live({}, live);
    assert.equal(ready.statusCode, 503); assert.equal(live.statusCode, 200);
});
test('closing process is never ready and does not query PostgreSQL', async () => {
    const res = response(); await createHealthHandlers({ prisma: {}, isClosing: () => true, log: () => {} }).ready({}, res);
    assert.equal(res.statusCode, 503);
});
test('request IDs are generated locally and structured logs never serialize secret extras', () => {
    const req = { headers: { 'x-request-id': 'attacker-secret' } }, res = response();
    requestContext(req, res, () => {});
    assert.match(req.requestId, /^[a-f0-9-]{36}$/); assert.equal(res.headers['X-Request-ID'], req.requestId);
    let line;
    operationalLog({ event: 'auth_error', category: 'dependency_unavailable', requestId: req.requestId, status: 503,
        error: new Error('secret-password'), token: 'jwt-secret', url: 'postgresql://secret' }, value => { line = value; });
    assert.equal(/secret|password|postgresql/.test(line), false); assert.equal(JSON.parse(line).requestId, req.requestId);
});
test('shutdown drains HTTP before disconnecting Prisma and handles repeated signals once', async () => {
    const events = [], signals = new EventEmitter();
    const shutdown = installShutdown({ signals, server: { close: cb => { events.push('http_drained'); cb(); } },
        prisma: { $disconnect: async () => { events.push('db_disconnected'); } },
        markClosing: () => events.push('not_ready'), stopTimers: () => events.push('timers_stopped'),
        exit: code => events.push(`exit_${code}`), log: () => {} });
    await Promise.all([shutdown(), shutdown()]);
    assert.deepEqual(events, ['not_ready','timers_stopped','http_drained','db_disconnected','exit_0']);
    assert.equal(signals.listenerCount('SIGTERM'), 0);
});
test('shutdown lets an in-flight HTTP response finish before disconnecting the database', async () => {
    let started, release, disconnected = false;
    const entered = new Promise(resolve => { started = resolve; });
    const mayFinish = new Promise(resolve => { release = resolve; });
    const server = http.createServer(async (req,res) => { started(); await mayFinish; res.end('persisted-response'); });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const response = fetch(`http://127.0.0.1:${server.address().port}`).then(res=>res.text());
    await entered;
    const shutdown = installShutdown({ server, prisma: { $disconnect: async () => { disconnected = true; } },
        signals: new EventEmitter(), markClosing: () => {}, stopTimers: () => {}, exit: () => {}, log: () => {} });
    const done = shutdown(); assert.equal(disconnected, false); release();
    assert.equal(await response, 'persisted-response'); await done; assert.equal(disconnected, true);
});
test('shutdown deadline forces connection closure and a nonzero exit when a request never drains', async () => {
    const events = [];
    installShutdown({ server: { close: () => {}, closeAllConnections: () => events.push('forced_close') }, prisma: {},
        signals: new EventEmitter(), markClosing: () => {}, stopTimers: () => {}, timeoutMs: 10,
        exit: code => events.push(code), log: () => {} })();
    await new Promise(resolve=>setTimeout(resolve,30)); assert.deepEqual(events,['forced_close',1]);
});
test('Docker context rules exclude secret/archive fixtures and retain runtime code and migrations', async () => {
    // Existing ESLint tooling's gitignore matcher validates these shared glob
    // rules statically. Docker's actual context needs a Docker CLI rehearsal.
    const require = createRequire(new URL('../../client/package.json', import.meta.url));
    const ignore = require('ignore');
    const rules = ignore().add(await readFile(new URL('../../.dockerignore', import.meta.url), 'utf8'));
    for (const file of ['.git/config','server/.env','client/.env.production','server/src/.env.local',
        'server/node_modules/synthetic.js','client/node_modules/synthetic.js','backup.json','server/prisma/archive.dump',
        'server/src/secret.pem','server/src/system-manifest.json','server/src/credentials.json','client/public/secrets.json',
        'server/test/secrets.json','server/src/logic.test.js']) {
        assert.equal(rules.ignores(file), true, `${file} must be excluded`);
    }
    for (const file of ['server/prisma/migrations/0_init/migration.sql','server/prisma/migrations/migration_lock.toml',
        'server/src/services/backupService.js','server/src/services/backupFormat.js','server/src/services/postgresBackup.js',
        'server/src/services/postgresSystemBackup.js','server/src/routes/backup.js','server/src/index.js','client/src/App.jsx',
        'client/public/manifest.json','client/public/sw.js','client/package-lock.json',
        'server/audit/postgresql/catalog.sql','server/deploy/rehearsal-http.mjs']) {
        assert.equal(rules.ignores(file), false, `${file} must remain available`);
    }
});
test('alternate Dockerfile separates migration job and HTTP, pins Node and runs non-root', async () => {
    const source = await readFile(new URL('../../Dockerfile.rehearsal', import.meta.url), 'utf8');
    assert.match(source, /FROM node:24\.22\.0-bookworm-slim@sha256:[a-f0-9]{64}/);
    const runtime = source.split('FROM base AS runtime')[1];
    assert.match(source, /npm ci/); assert.match(source, /npm prune --omit=dev/);
    assert.match(runtime, /USER node/); assert.match(runtime, /STOPSIGNAL SIGTERM/);
    assert.match(runtime, /CMD \["node", "deploy\/rehearsal-http.mjs"\]/);
    assert.doesNotMatch(runtime, /migrate|db push|npx|npm start/);
    const job = source.split('FROM base AS migration-job')[1].split('FROM server-build AS production-deps')[0];
    assert.match(job, /COPY server\/src\/operations\/telemetry.js/);
});
