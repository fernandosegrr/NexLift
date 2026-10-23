import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cleanStageEnvironment, databaseURL, runtimeEnvironment, stageHome } from '../staging/environment.mjs';
import { validateSourceDescriptor } from '../staging/capture-source.mjs';
import { isLoopback } from '../staging/egress.mjs';

const state = { pgPort: 45432, httpPort: 43001, jwtSecret: 'new-staging-secret',
    databases: { runtime: { name: 'nexlift_stage_12345678_runtime' } },
    credentials: { admin: { user: 'stage_admin', password: 'private-admin' }, app: { user: 'stage_app', password: 'private-app' } } };
const descriptor = () => ({ kind: 'AUTHORIZED_READ_ONLY_POSTGRES', authorized: true,
    connectionUrl: 'postgresql://reader:synthetic@127.0.0.1:45433/source',
    expectedIdentity: { systemId: '123456789', database: 'source', role: 'reader', address: '127.0.0.1', port: 45433 } });

test('staging sanitizes inherited credentials, proxies, provider keys and Node preload flags', () => {
    assert.deepEqual(cleanStageEnvironment({ PATH: '/node', TEMP: '/tmp', DATABASE_URL: 'secret', PGHOST: 'prod',
        OPENAI_API_KEY: 'secret', CLOUDINARY_API_SECRET: 'secret', VAPID_PRIVATE_KEY: 'secret',
        HTTP_PROXY: 'secret', NODE_OPTIONS: '--import=malicious', JWT_SECRET: 'prod' }), { PATH: '/node', TEMP: '/tmp' });
});
test('runtime gets a generated DML URL and independent JWT instead of inherited DATABASE_URL', () => {
    const env = runtimeEnvironment(state, path.resolve('private-stage'));
    assert.equal(new URL(env.NEXLIFT_RELEASE_DATABASE_URL).username, 'stage_app'); assert.equal(env.JWT_SECRET, state.jwtSecret);
    assert.equal(env.OPENAI_API_KEY, ''); assert.equal(env.CLOUDINARY_API_KEY, ''); assert.equal(env.VAPID_PRIVATE_KEY, '');
    assert.equal(env.NEXLIFT_BIND_HOST, '127.0.0.1'); assert.equal(env.DATABASE_URL, undefined);
});
test('staging URL construction rejects arbitrary database and role names', () => {
    assert.throws(() => databaseURL(state, 'production'), /Unregistered/);
    assert.throws(() => databaseURL(state, 'runtime', 'production'), /Unregistered/);
});
test('staging never silently accepts a relative data directory', () => {
    assert.throws(() => stageHome({ NEXLIFT_STAGE_HOME: 'relative' }), /absolute/);
});
test('a source requires explicit authorization and cannot fall back to ambient URLs', () => {
    assert.throws(() => validateSourceDescriptor({}), /authorization/);
    const d = descriptor(); d.authorized = false; assert.throws(() => validateSourceDescriptor(d), /authorization/);
});
test('a source without independently expected cluster identity is rejected', () => {
    for (const key of ['systemId', 'database', 'role', 'address', 'port']) {
        const d = descriptor(); delete d.expectedIdentity[key]; assert.throws(() => validateSourceDescriptor(d), /identity/);
    }
});
test('a mismatched source database, role or port is rejected before connecting', () => {
    for (const [key, value] of [['database', 'different'], ['role', 'different'], ['port', 1]]) {
        const d = descriptor(); d.expectedIdentity[key] = value; assert.throws(() => validateSourceDescriptor(d), /identity/);
    }
    const d = descriptor(); d.connectionUrl += '?host=example.invalid'; assert.throws(() => validateSourceDescriptor(d), /identity/);
});
test('a valid explicit source descriptor retains bounded connection waits', () => {
    const d = validateSourceDescriptor(descriptor()); const u = new URL(d.url);
    assert.equal(u.searchParams.get('connect_timeout'), '3'); assert.equal(u.searchParams.get('pool_timeout'), '3');
});
test('the staging network allowlist is limited to loopback', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) assert.equal(isLoopback(host), true);
    for (const host of ['api.openai.com', 'api.cloudinary.com', '127.0.0.1.example.com', '10.0.0.1', undefined]) assert.equal(isLoopback(host), false);
});
test('actual fetch, HTTP, HTTPS and raw socket provider requests are blocked before network access', () => {
    const script = `import {installEgressGuard} from './staging/egress.mjs';
      import http from 'node:http';import https from 'node:https';import net from 'node:net';import assert from 'node:assert/strict';
      installEgressGuard();
      await assert.rejects(fetch('https://api.openai.com/'),/STAGING_EXTERNAL_NETWORK_DISABLED/);
      for(const invoke of [()=>http.get('http://example.invalid/'),()=>https.request('https://api.cloudinary.com/'),()=>net.connect({host:'push.example.invalid',port:443})])assert.throws(invoke,/STAGING_EXTERNAL_NETWORK_DISABLED/);`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), encoding: 'utf8', windowsHide: true, timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
});
test('Compose declares isolated network and storage, loopback port, separate secrets and a successful migration dependency', async () => {
    const require = createRequire(new URL('../../client/package.json', import.meta.url));
    const yaml = require('js-yaml');
    const compose = yaml.load(await readFile(new URL('../../compose.staging.yaml', import.meta.url), 'utf8'));
    assert.equal(compose.networks.isolated.internal, true); assert.equal(compose.services.db.ports, undefined);
    assert.deepEqual(compose.services.app.ports, ['127.0.0.1:43001:3001']);
    assert.equal(compose.services.app.depends_on.migration.condition, 'service_completed_successfully');
    assert.deepEqual(compose.services.app.secrets, ['app_config']); assert.deepEqual(compose.services.migration.secrets, ['job_config']);
    assert.equal(compose.services.app.read_only, true); assert.equal(compose.volumes.staging_pg?.external, undefined);
});
test('Docker context includes only the two container staging modules and excludes local state and source archives', async () => {
    const require = createRequire(new URL('../../client/package.json', import.meta.url));
    const rules = require('ignore')().add(await readFile(new URL('../../.dockerignore', import.meta.url), 'utf8'));
    for (const file of ['server/staging/container.mjs', 'server/staging/egress.mjs', 'Dockerfile.staging']) assert.equal(rules.ignores(file), false);
    for (const file of ['server/staging/local.mjs', 'server/staging/source.private.manifest.json', 'server/staging/source.original.dump', 'server/staging/state.private.json', 'server/src/state.private.json']) assert.equal(rules.ignores(file), true);
});
