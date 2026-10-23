import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseConfig } from '../deploy/release-config.js';
import { migrateDisposable } from '../deploy/release-migrate.mjs';
import { assertRecoveryCapacity } from '../deploy/release-recovery.mjs';
import { diagnoseStartup, logStartupFailure } from '../deploy/release-diagnostics.mjs';
const valid = { NODE_ENV: 'production', NEXLIFT_HTTP_TRANSPORT: 'express', NEXLIFT_RELEASE_MODE: 'release',
    NEXLIFT_RELEASE_DATABASE_URL: 'postgresql://test@127.0.0.1/test', JWT_SECRET: 'a'.repeat(64), NEXLIFT_REPLICAS: '1' };

test('10 release requires explicit transport, mode, URL, secret, environment and one replica', () => {
    for (const key of Object.keys(valid)) assert.throws(() => releaseConfig({ ...valid, [key]: undefined }), error => {
        assert.equal(diagnoseStartup(error).field, key); return true;
    });
    assert.equal(releaseConfig(valid).transport, 'express');
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../deploy/release-http.mjs', import.meta.url))], {
        env: { SYSTEMROOT: process.env.SYSTEMROOT || process.env.SystemRoot, NODE_ENV: 'production' },
        encoding: 'utf8', windowsHide: true, timeout: 10000
    });
    assert.equal(child.status, 1);
    const diagnostic = JSON.parse(child.stderr.trim());
    assert.equal(diagnostic.field, 'NEXLIFT_HTTP_TRANSPORT');
    assert.equal(diagnostic.event, 'startup_failed');
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
    const hidden = 'SENSITIVE-secret postgresql://private:password@example.invalid/db';
    for (const error of [new Error(hidden), Object.assign(new Error(hidden), { code: 'P1001' }),
        Object.assign(new Error(hidden), { errorCode: 'P1000' }),
        new Error('Release configuration rejected: SENSITIVE_SECRET'),
        { message: hidden, code: hidden, stack: hidden }]) {
        let output = ''; logStartupFailure(error, line => { output += line; });
        assert(!/SENSITIVE|password|postgresql|stack/i.test(output));
        assert.equal(JSON.parse(output).event, 'startup_failed');
    }
    assert.equal(diagnoseStartup({ errorCode: 'P1000' }).code, 'DATABASE_AUTHENTICATION_FAILED');
    assert.equal(diagnoseStartup(new Error('Falta registrar el historial de migraciones.')).code, 'MIGRATION_HISTORY_MISSING');
    assert.equal(diagnoseStartup(new Error('Hay migraciones requeridas pendientes.')).code, 'MIGRATIONS_PENDING');
    assert.equal(diagnoseStartup(new Error('Esquema incompatible: readiness rechazada.')).code, 'SCHEMA_MISMATCH');
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
