import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { releaseConfig } from '../deploy/release-config.js';
import { migrateDisposable } from '../deploy/release-migrate.mjs';
import { assertRecoveryCapacity } from '../deploy/release-recovery.mjs';
const valid = { NODE_ENV: 'production', NEXLIFT_HTTP_TRANSPORT: 'express', NEXLIFT_RELEASE_MODE: 'release',
    NEXLIFT_RELEASE_DATABASE_URL: 'postgresql://test@127.0.0.1/test', JWT_SECRET: 'a'.repeat(64), NEXLIFT_REPLICAS: '1' };

test('10 release requires explicit transport, mode, URL, secret, environment and one replica', () => {
    for (const key of Object.keys(valid)) assert.throws(() => releaseConfig({ ...valid, [key]: undefined }));
    assert.equal(releaseConfig(valid).transport, 'express');
});
test('10 transport cannot change through invalid values or a Fastify flag alone', () => {
    for (const value of ['', 'FASTIFY', ' fastify', 'unknown']) assert.throws(() => releaseConfig({ ...valid, NEXLIFT_HTTP_TRANSPORT: value }));
    assert.throws(() => releaseConfig({ ...valid, NEXLIFT_HTTP_TRANSPORT: 'fastify' }));
    assert.equal(releaseConfig({ ...valid, NEXLIFT_HTTP_TRANSPORT: 'fastify', NEXLIFT_FASTIFY_ACTIVATION: 'reviewed-v4' }).transport, 'fastify');
    assert.equal(releaseConfig({ ...valid, NEXLIFT_FASTIFY_ACTIVATION: 'reviewed-v4' }).transport, 'express');
});
test('10 runtime rejects activation of offline, cookie bridge, pruning and multiple replicas', () => {
    for (const key of ['NEXLIFT_OFFLINE_SYNC_ENABLED', 'NEXLIFT_CONFLICT_RESOLUTION_ENABLED', 'NEXLIFT_WEB_SESSION_REHEARSAL', 'NEXLIFT_BACKUP_PRUNE_ENABLED']) {
        for (const value of ['true', '1', 'FALSE']) assert.throws(() => releaseConfig({ ...valid, [key]: value }));
        assert.equal(releaseConfig({ ...valid, [key]: 'false' }).nodeEnv, 'production');
    }
    assert.throws(() => releaseConfig({ ...valid, NEXLIFT_REPLICAS: '2' }));
});
test('10 invalid runtime values fail safely without printing supplied secrets', () => {
    for (const change of [{ PORT: '80' }, { PORT: '3001x' }, { PORT: '65536' }, { JWT_SECRET: 'SENSITIVE-secret' },
        { NEXLIFT_RELEASE_DATABASE_URL: 'https://sensitive:password@example.invalid/db' }, { CORS_ORIGIN: '*' },
        { NEXLIFT_BIND_HOST: 'external.invalid' }, { NEXLIFT_TRUSTED_PROXY_CIDRS: 'true' }]) {
        assert.throws(() => releaseConfig({ ...valid, ...change }), error => !/sensitive|password|external.invalid/i.test(error.message));
    }
});
test('10 disposable release requires local database name and identity; ordinary URL cannot opt in', () => {
    assert.throws(() => releaseConfig({ ...valid, NEXLIFT_RELEASE_MODE: 'rehearsal' }));
    const config = releaseConfig({ ...valid, NEXLIFT_RELEASE_MODE: 'rehearsal',
        NEXLIFT_RELEASE_DATABASE_URL: 'postgresql://test@127.0.0.1/nexlift_ops_test_phase6_a',
        NEXLIFT_DISPOSABLE_MARKER: 'NEXLIFT_PHASE31_DISPOSABLE:12345678-1234-4000-8000-123456789abc' });
    assert(config.rehearsal); assert.equal(new URL(config.url).searchParams.get('connect_timeout'), '3');
});
test('10 migration job refuses persistent mode before creating clients or connecting', async () => {
    await assert.rejects(migrateDisposable(valid), /Disposable/);
    await assert.rejects(migrateDisposable({ ...valid, NEXLIFT_RELEASE_MODE: 'rehearsal' }), /Disposable/);
});
test('10 ENOSPC simulation cancels recovery before writing and sufficient capacity proceeds', async () => {
    await assert.rejects(assertRecoveryCapacity('.', 1000n, async () => ({ bavail: 0n, bsize: 4096n })), error => error.code === 'ENOSPC');
    await assertRecoveryCapacity('.', 1000n, async () => ({ bavail: 1n, bsize: 4096n }));
});
test('10 release Dockerfile separates builder, CLI job and pruned non-root HTTP without DDL', async () => {
    const text = await readFile(new URL('../../Dockerfile.release', import.meta.url), 'utf8');
    assert.equal(await readFile(new URL('../../Dockerfile', import.meta.url), 'utf8'), text, 'Default deployment must use the reviewed release recipe without startup DDL');
    assert.match(text, /node:24\.22\.1-bookworm-slim@sha256:[a-f0-9]{64}/);
    for (const target of ['builder', 'migration-job', 'production-deps', 'runtime']) assert(text.includes(`AS ${target}`));
    assert.match(text, /npm ci/); assert.match(text, /prune --omit=dev/); assert.match(text, /USER node/);
    assert.match(text, /STOPSIGNAL SIGTERM/); assert.match(text, /http-healthcheck.mjs/);
    assert.match(text, /CMD \["node", "deploy\/release-http.mjs"\]/);
    assert(!/db push|migrate dev|npm install|ARG .*SECRET|COPY \. /i.test(text));
});
test('10 Docker context excludes secrets and includes current catalog, TS config and release artifacts', async () => {
    const require = createRequire(new URL('../../client/package.json', import.meta.url));
    const ignore = require('ignore')().add(await readFile(new URL('../../.dockerignore', import.meta.url), 'utf8'));
    for (const file of ['server/.env', 'client/.env.production', 'server/prisma/.env', 'server/deploy/password.key', 'server/audit/release/system.dump']) assert(ignore.ignores(file), file);
    for (const file of ['Dockerfile.release', 'client/tsconfig.build.json', 'server/audit/database/declared-catalog.json',
        'server/deploy/operations-catalog.json', 'server/deploy/release-http.mjs', 'server/src/services/backupRestore.js',
        'client/src/storage/localBackup.js', 'server/src/modules/backups/routes.js', 'server/src/modules/backups/service.js']) assert(!ignore.ignores(file), file);
});
