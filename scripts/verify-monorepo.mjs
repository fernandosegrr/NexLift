// Full matrix in a new copy. Historical fixtures/assertions and evidence remain
// untouched. All database runners create and identify their own disposable PGDATA.
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cleanStageEnvironment } from '../server/staging/environment.mjs';
import { passedOfflineCleanupTarget } from './lib/cleanup-result.mjs';
import { pgExecutable } from '../server/audit/postgresql/audit-tools.mjs';

assert.equal(process.versions.node, '24.22.1', 'Release matrix requires patched Node 24.22.1');
assert.equal(process.argv.length, 2, 'No external databases or arguments accepted');
const source = fileURLToPath(new URL('../', import.meta.url));
// Keep source/dependency evidence outside Temp: system Temp maintenance must not
// remove an in-progress matrix. Disposable database runners keep their guards.
const verificationHome = path.join(homedir(), '.codex', 'artifacts', 'nexlift-verification');
await mkdir(verificationHome, { recursive: true });
const root = await mkdtemp(path.join(verificationHome, 'nexlift-phase10-verification-'));
const migration = '202610180001_phase31_operations', syncTests = ['operationSync.test.js', 'operationApi.test.js'];
const historyMigration = '202610220001_phase6_history';
const coachMigration = '202610230001_coach';
const coachSchema = await readFile(path.join(source, 'server/prisma/schema.prisma'));
// Test the immutable v4 schema first, then the additive Coach expansion with its real client.
const currentSchema = await readFile(path.join(source, 'scripts/fixtures/coach/v4-schema.prisma'));
const legacySchema = await readFile(path.join(source, 'scripts/fixtures/phase6/legacy-schema.prisma'));
const env = { ...cleanStageEnvironment(), CI: 'true', DATABASE_URL: '', NODE_ENV: 'test', PRISMA_SKIP_POSTINSTALL_GENERATE: 'true',
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1', npm_config_registry: 'https://registry.npmjs.org' };
env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${env.PATH || env.Path || ''}`;
const npm = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
const runtimeRelativeToTemp = path.relative(tmpdir(), process.execPath);
assert(runtimeRelativeToTemp.startsWith('..') || path.isAbsolute(runtimeRelativeToTemp), 'Use a stable Node/npm runtime outside Temp');
assert(existsSync(npm), 'The matching stable npm CLI must exist before the matrix');
const results = [], artifacts = {};
const filter = file => !['node_modules', 'dist', 'build', '.git', migration, historyMigration, coachMigration, ...syncTests].includes(path.basename(file)) &&
    !path.basename(file).startsWith('.env') && !/\.private(?:\.|$)|\.(dump|bak|zip|gz|pem|key|pgpass)$|credentials|secrets/i.test(path.basename(file));
async function run(name, args, cwd = '.', { repeat = false } = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const start = Date.now();
    const result = spawnSync(process.execPath, args, { cwd: path.isAbsolute(cwd) ? cwd : path.join(root, cwd), env, windowsHide: true, encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024, timeout: 1200000 });
    const log = (result.stdout || '') + (result.stderr || '');
    const plain = stripVTControlCharacters(log);
    let retainedCleanup = null;
    if (['offline-postgres-browser', 'phase6-offline-current-schema-edge-dexie', 'phase7-fastify-edge-dexie-offline'].includes(name)
        && attempt === 1 && !result.error && result.status === 1) {
        const parent = await realpath(tmpdir()), candidate = passedOfflineCleanupTarget(plain, parent);
        if (candidate && await realpath(candidate).catch(() => null) === candidate) {
            const entries = await readdir(candidate);
            const data = path.join(candidate, 'data');
            let stopped = entries.length === 1 && entries[0] === 'postgres.private.log';
            if (!stopped && await realpath(data).catch(() => null) === data && !existsSync(path.join(data, 'postmaster.pid')) &&
                (await readFile(path.join(data, 'PG_VERSION'), 'utf8').catch(() => '')).trim() === '18') {
                const status = spawnSync(pgExecutable('pg_ctl'), ['-D', data, 'status'], { env, windowsHide: true, encoding: 'utf8', timeout: 5000 });
                stopped = !status.error && status.status === 3;
            }
            // Never retry deletion of the old path. Retain the stopped cluster
            // and diagnostics, and execute a NEW disposable cluster instead.
            if (stopped) retainedCleanup = candidate;
        }
    }
    const logName = retainedCleanup ? `${name}-cleanup-diagnostic-${attempt}` : name;
    await writeFile(path.join(root, `${logName}.private.log`), log, { mode: 0o600 });
    const summary = { name, exit: result.status, milliseconds: Date.now() - start, repeat,
        tests: [...plain.matchAll(/(?:ℹ |# )tests (\d+)|Tests\s+(\d+) passed/g)].reduce((sum, match) => sum + Number(match[1] || match[2]), 0) };
    if (retainedCleanup) Object.assign(summary, { repeat: true, cleanupDiagnostic: true, retainedCleanup, log: `${logName}.private.log` });
    results.push(summary); console.log(JSON.stringify(summary));
    // Preserve diagnostics as each command finishes, before any external Temp
    // maintenance can remove this run's isolated copy. No operational env/data.
    const progressDirectory = path.join(source, 'server/audit/release');
    await mkdir(path.join(progressDirectory, 'raw'), { recursive: true });
    await writeFile(path.join(progressDirectory, 'raw', `${logName}.private.log`), log, { mode: 0o600 });
    await writeFile(path.join(progressDirectory, 'matrix-progress.json'), JSON.stringify({
        isolatedDirectory: root, node: process.versions.node, results, artifacts, productionTouched: false
    }, null, 2) + '\n');
    if (retainedCleanup) continue;
    if (result.error || result.status !== 0) throw new Error(`${name} failed; log: ${path.join(root, `${name}.private.log`)}`);
    assert(!/(?:ℹ |# )(?:fail|cancelled|skipped) [1-9]/.test(plain), `${name}: failed/cancelled/skipped cases`);
    return;
  }
}
// Three upstream import-parser cases were preserved while merging origin/main.
const upstreamAdditionalTests = 3;
const unique = () => results.filter(result => !result.repeat).reduce((sum, result) => sum + result.tests, 0);
async function hashSources(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name), relative = prefix + entry.name;
        if (['node_modules', 'dist', 'build', '.git'].includes(entry.name) || entry.name.startsWith('.env') || relative.startsWith('server/audit/coach') || relative.startsWith('server/audit/typescript') || relative.startsWith('server/audit/contracts') || relative.startsWith('server/audit/training-engine') || relative.startsWith('server/audit/database') || relative.startsWith('server/audit/backend') || relative.startsWith('server/audit/frontend') || relative.startsWith('server/audit/security') || relative.startsWith('server/audit/release') ||
            /\.private(?:\.|$)|\.(dump|bak|zip|gz|pem|key|pgpass)$|credentials|secrets/i.test(entry.name)) continue;
        if (entry.isDirectory()) await hashSources(file, relative + '/');
        else if (entry.isFile() && !/\.(private|dump|bak|zip|gz)$/.test(entry.name)) artifacts[relative] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
}
console.log(`Isolated verification: ${root}`);
try {
    await hashSources(source);
    for (const directory of ['server', 'client', 'packages', 'configs', 'scripts']) await cp(path.join(source, directory), path.join(root, directory), { recursive: true, filter });
    for (const file of ['package.json', 'package-lock.json', '.npmrc', 'Dockerfile', 'Dockerfile.rehearsal', 'Dockerfile.staging', 'Dockerfile.fastify-rehearsal', 'Dockerfile.release', 'compose.staging.yaml', '.dockerignore', '.gitignore']) await cp(path.join(source, file), path.join(root, file));
    // The 1,236 historical cases include deliberate old-schema defects and
    // immutable baseline/catalog comparisons. Run those unchanged SQL fixtures
    // with their genuine received client and the final compatibility adapters.
    // The new schema/client is then generated and tested separately below.
    await writeFile(path.join(root, 'server/prisma/schema.prisma'), legacySchema);
    await run('root-ci', [npm, 'ci', '--no-audit', '--no-fund']);
    const lockedBytes = await readFile(path.join(root, 'package-lock.json'));
    await run('root-workspaces', [npm, 'ls', '--workspaces', '--depth=0']);
    await run('root-project-check', [npm, 'run', 'check']);
    // New strict HTTP boundaries depend on the generated Prisma declarations.
    // Generation is offline and must precede the first clean TypeScript build.
    await run('prisma-generate', [npm, 'run', 'db:generate']);
    await run('initial-typescript-build', [npm, 'run', 'build:typed']);
    await run('strict-typechecks-generated-and-lint', [npm, 'run', 'check:typescript']);
    await run('shared-resolution', [npm, 'run', 'check:shared']);
    // Same historical 730 tests, on their original fixture with only 0_init.
    for (const script of ['test', 'test:integration', 'test:backup', 'test:backup:integration', 'test:import', 'test:import:integration',
        'test:workout:integration', 'test:workout:baseline', 'test:schema:audit', 'test:baseline', 'test:infra', 'test:infra:integration']) {
        await run(`server-${script.replaceAll(':', '-')}`, script === 'test' ? [npm, 'run', 'test:server'] : [npm, 'run', script, '--workspace', 'nexlift-server']);
    }
    await run('client-historical-tests', [npm, 'run', 'test:client']);
    await run('default-workspace-build', [npm, 'run', 'build']);
    await run('client-bundle-boundaries', [npm, 'run', 'check:bundle']);
    await run('staging-unit', [npm, 'run', 'test:staging', '--workspace', 'nexlift-server']);
    await run('staging-integration', [npm, 'run', 'test:staging:integration', '--workspace', 'nexlift-server']);
    await run('infra-static', ['test/check-infrastructure.mjs'], 'server');
    await run('staging-static', ['test/check-staging.mjs'], 'server');
    assert.equal(unique(), 730 + upstreamAdditionalTests);
    // The provisional migration is copied only into this fresh test copy.
    await cp(path.join(source, 'server/prisma/migrations', migration), path.join(root, 'server/prisma/migrations', migration), { recursive: true });
    await run('operations-unit', [npm, 'run', 'test:operations', '--workspace', 'nexlift-server']);
    await run('operations-integration', [npm, 'run', 'test:operations:integration', '--workspace', 'nexlift-server']);
    await run('operations-static', ['test/check-operations.mjs'], 'server'); assert.equal(unique(), 800 + upstreamAdditionalTests);
    for (const file of syncTests) await cp(path.join(source, 'client/src/services', file), path.join(root, 'client/src/services', file));
    await run('sync-client', [npm, 'run', 'test:client', '--', ...syncTests.map(file => `src/services/${file}`)]);
    await run('sync-postgres-browser', [npm, 'run', 'test:sync:integration', '--workspace', 'nexlift-server']);
    await run('sync-static', ['test/check-sync.mjs'], 'server'); assert.equal(unique(), 870 + upstreamAdditionalTests);
    await run('storage-postgres-browser', [npm, 'run', 'test:storage:integration', '--workspace', 'nexlift-server']);
    await run('storage-static', ['test/check-storage.mjs'], 'server'); assert.equal(unique(), 917 + upstreamAdditionalTests);
    await run('conflicts-postgres-browser', [npm, 'run', 'test:conflicts:integration', '--workspace', 'nexlift-server']);
    await run('conflicts-static', ['test/check-conflicts.mjs'], 'server'); assert.equal(unique(), 973 + upstreamAdditionalTests);
    await run('offline-sw', [npm, 'run', 'test:offline:sw', '--workspace', 'nexlift-server']);
    await run('offline-postgres-browser', [npm, 'run', 'test:offline:integration', '--workspace', 'nexlift-server']);
    await run('offline-static', ['test/check-stabilization.mjs'], 'server'); assert.equal(unique(), 1007 + upstreamAdditionalTests);
    await run('monorepo-tests', [npm, 'run', 'test:monorepo']); assert.equal(unique(), 1019 + upstreamAdditionalTests);
    await run('typescript-tests', [npm, 'run', 'test:typescript']); assert.equal(unique(), 1031 + upstreamAdditionalTests);
    await run('typescript-development-entry', [npm, 'run', 'test:typescript:dev', '--workspace', 'nexlift-server']); assert.equal(unique(), 1032 + upstreamAdditionalTests);
    await run('shared-contracts-and-http-consumers', [npm, 'run', 'test:contracts']); assert.equal(unique(), 1088 + upstreamAdditionalTests);
    await run('client-import-response-contracts', [npm, 'run', 'test:contracts', '--workspace', 'client']); assert.equal(unique(), 1091 + upstreamAdditionalTests);
    await run('phase44-real-typescript-consumers', [npm, 'run', 'test:phase44']); assert.equal(unique(), 1104 + upstreamAdditionalTests);
    await run('phase52-training-engine', [npm, 'run', 'test:training']); assert.equal(unique(), 1141 + upstreamAdditionalTests);
    await run('phase52-performance-domain', [npm, 'run', 'test:performance']); assert.equal(unique(), 1169 + upstreamAdditionalTests);
    await run('phase52-performance-http-postgres', [npm, 'run', 'test:performance:integration']); assert.equal(unique(), 1173 + upstreamAdditionalTests);
    await run('phase53-smart-domain-and-react', [npm, 'run', 'test:smart-loading']); assert.equal(unique(), 1198 + upstreamAdditionalTests);
    await run('phase53-smart-http-postgres', [npm, 'run', 'test:smart-loading:integration']); assert.equal(unique(), 1202 + upstreamAdditionalTests);
    await run('phase54-analysis-domain-and-react', [npm, 'run', 'test:analysis']); assert.equal(unique(), 1232 + upstreamAdditionalTests);
    await run('phase55-analysis-http-postgres', [npm, 'run', 'test:analysis:integration']); assert.equal(unique(), 1236 + upstreamAdditionalTests);
    const legacyClient = path.join(root, 'phase6-clients/legacy');
    await cp(path.join(root, 'server/node_modules/.prisma/client'), legacyClient, { recursive: true });
    await writeFile(path.join(root, 'server/prisma/schema.prisma'), currentSchema);
    await cp(path.join(source, 'server/prisma/migrations', historyMigration), path.join(root, 'server/prisma/migrations', historyMigration), { recursive: true });
    await run('phase6-current-prisma-generate', [npm, 'run', 'db:generate']);
    await run('phase6-migration-history-http-recovery', ['server/test/run-phase6-integration.mjs']); assert.equal(unique(), 1290 + upstreamAdditionalTests);
    await run('phase6-offline-current-schema-edge-dexie', [npm, 'run', 'test:offline:integration', '--workspace', 'nexlift-server'], '.', { repeat: true });
    await run('phase6-current-schema-strict-build', [npm, 'run', 'check:typescript']);
    await run('phase6-persistence-lint', ['scripts/check-phase6.mjs']);
    await run('phase7-native-http-jobs-security', ['--test', 'server/test/phase7-http.test.js', 'server/test/phase7-notifications.test.js']);
    await run('phase7-independent-postgres-http-equivalence', ['server/test/run-phase7-integration.mjs']); assert.equal(unique(), 1355 + upstreamAdditionalTests);
    await run('phase7-fastify-edge-dexie-offline', ['server/test/run-phase7-offline.mjs'], '.', { repeat: true });
    await run('phase8-query-unit', [npm, 'run', 'test:frontend', '--workspace', 'client']);
    await run('phase8-react-edge-mobile', ['--test', 'scripts/test/frontend.test.mjs']);
    assert.equal(unique(), 1381 + upstreamAdditionalTests);
    await run('phase9-security-http-sw', ['--test', 'server/test/phase9-security.test.js']);
    await run('phase9-client-privacy', [npm, 'exec', '--workspace', 'client', '--', 'vitest', 'run', '--config', 'test/security.config.js']);
    await run('phase9-edge-rest-cancellation', ['--test', 'scripts/test/security-browser.test.mjs']);
    await run('phase9-postgres-push-processes', ['server/test/run-phase9-integration.mjs']);
    assert.equal(unique(), 1441 + upstreamAdditionalTests);
    env.NODE_ENV = 'production';
    await run('phase10-production-artifacts-build', [npm, 'run', 'build:client']);
    env.NODE_ENV = 'test';
    await run('phase10-release-config-docker-capacity', [npm, 'run', 'test:release']);
    await run('phase10-postgres-migrate-recovery-transports', [npm, 'run', 'test:release:integration']);
    await run('phase10-edge-first-render', [npm, 'run', 'test:release:browser']);
    assert.equal(unique(), 1464 + upstreamAdditionalTests);
    await run('phase10-reproducible-artifacts', [npm, 'run', 'verify:release']);
    await run('phase10-release-lint', [npm, 'run', 'lint:release']);
    await run('phase7-modular-runtime-lint', ['scripts/check-phase7.mjs']);
    await run('phase7-executable-api-inventory', ['scripts/audit-backend.mjs']);
    await run('shared-workspace-contracts', [npm, 'test', '--workspace', '@nexlift/shared'], '.', { repeat: true });
    await run('tooling-lint', [npm, 'run', 'lint:tooling']);
    Object.assign(env, { VITE_WORKOUT_OPERATIONS_ENABLED: 'true', VITE_INDEXEDDB_ENABLED: 'true', VITE_CONFLICT_RESOLUTION_ENABLED: 'true' });
    await run('client-rehearsal-build', [npm, 'run', 'build:client']);
    delete env.VITE_WORKOUT_OPERATIONS_ENABLED; delete env.VITE_INDEXEDDB_ENABLED; delete env.VITE_CONFLICT_RESOLUTION_ENABLED;
    env.NODE_ENV = 'production';
    await run('phase6-client-production-build', [npm, 'run', 'build:client']);
    env.NODE_ENV = 'test';
    // Client+server still run independently; repeated cases never inflate totals.
    await run('all-workspace-unit-tests', [npm, 'run', 'test:unit'], '.', { repeat: true });
    assert.deepEqual(await readFile(path.join(root, 'package-lock.json')), lockedBytes, 'Root lock changed during installation/builds/tests');
    // Real standalone installs outside any workspace parent, from retained locks.
    for (const directory of ['client', 'server']) {
        const standaloneParent = await mkdtemp(path.join(verificationHome, `nexlift-phase5-complete-${directory}-`));
        const standalone = directory === 'server' ? path.join(standaloneParent, 'server') : standaloneParent;
        await cp(path.join(root, directory), standalone, { recursive: true, filter });
        if (directory === 'server') {
            // The historical unit suite compares two algorithms with the actual
            // client source. Supply that read-only TEST fixture as a sibling;
            // runtime and installed server dependencies remain independent.
            await mkdir(path.join(standaloneParent, 'client/src/utils'), { recursive: true });
            await cp(path.join(root, 'client/src/utils/smartLoading.js'), path.join(standaloneParent, 'client/src/utils/smartLoading.js'));
            await mkdir(path.join(standaloneParent, 'client/src/generated'), { recursive: true });
            await cp(path.join(root, 'client/src/generated/training.js'), path.join(standaloneParent, 'client/src/generated/training.js'));
            await cp(path.join(root, 'client/package.json'), path.join(standaloneParent, 'client/package.json'));
        }
        await run(`${directory}-standalone-ci`, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], standalone);
        if (directory === 'client') await run('client-standalone-build', [npm, 'run', 'build'], standalone);
        else {
            await run('server-standalone-unit', [npm, 'test'], standalone, { repeat: true });
            await run('server-standalone-commonjs', ['--input-type=commonjs', '-e',
                "if(!require('./src/generated/errors.cjs').isDependencyUnavailable({code:'P1001'}))process.exit(1);if(require('./src/generated/contracts.cjs').operationId('12345678-1234-4000-8000-123456789ABC')!=='12345678-1234-4000-8000-123456789abc')process.exit(1)"], standalone);
            await run('server-standalone-training', ['--no-experimental-strip-types', '--input-type=module', '-e',
                "import {epley1RM,bestOneRepMaxForTarget} from './src/utils/exerciseName.js';if(epley1RM(80,37)!==176||bestOneRepMaxForTarget([{sets:[{weight:115,reps:1}]}],1)!==115)process.exit(1)"], standalone);
        }
        console.log(`Standalone dependency copy retained: ${standalone}`);
    }
    // Isolated/server-only compatibility uses its retained lock; root deps stay out.
    await run('production-prune', [npm, '--prefix', 'server', 'prune', '--omit=dev', '--ignore-scripts', '--workspaces=false', '--no-audit', '--no-fund']);
    const currentClient = path.join(root, 'phase6-clients/current');
    await cp(path.join(root, 'server/node_modules/.prisma/client'), currentClient, { recursive: true });
    await cp(legacyClient, path.join(root, 'server/node_modules/.prisma/client'), { recursive: true });
    await run('production-deps-smoke', [npm, 'run', 'test:integration', '--workspace', 'nexlift-server'], '.', { repeat: true });
    await cp(currentClient, path.join(root, 'server/node_modules/.prisma/client'), { recursive: true });
    await run('phase7-production-deps-fastify-smoke', ['--no-experimental-strip-types', '--input-type=module', '-e',
        "import {createApp} from './server/build/app/createApp.js';import {createRuntime} from './server/build/app/runtime.js';const unavailable=async()=>{throw Error('blocked')};const runtime=createRuntime({prisma:{},config:{jwtSecret:'synthetic-pruned-runtime',nodeEnv:'test'},providers:{fetch:unavailable,backupStore:{uploadBackup:unavailable,pruneOldBackups:unavailable}}});const app=await createApp({runtime});if((await app.inject('/api/health')).statusCode!==200)throw Error('Fastify runtime failed');await app.close();await runtime.stopBackground();"]);
    assert.deepEqual(await readFile(path.join(root, 'package-lock.json')), lockedBytes, 'Production pruning changed the root lock');
    // Reinstall from the same unchanged lock after the production dependency smoke.
    await run('coach-clean-development-install', [npm, 'ci', '--no-audit', '--no-fund']);
    await writeFile(path.join(root, 'server/prisma/schema.prisma'), coachSchema);
    await cp(path.join(source, 'server/prisma/migrations', coachMigration), path.join(root, 'server/prisma/migrations', coachMigration), { recursive: true });
    await run('coach-current-prisma-generate', [npm, 'run', 'db:generate']);
    await run('coach-strict-reproducible-typescript-build', [npm, 'run', 'build:typed']);
    await run('coach-strict-types-generated-lint', [npm, 'run', 'check:typescript']);
    await run('coach-domain-assistant-scenarios', [npm, 'run', 'test:coach']);
    await run('coach-postgres-transports-backups', [npm, 'run', 'test:coach:integration']);
    await run('coach-edge-react-mobile-privacy', [npm, 'run', 'test:coach:browser']);
    await run('coach-final-production-build', [npm, 'run', 'build']);
    await run('coach-final-bundle', [npm, 'run', 'check:bundle']);
    await run('coach-final-module-lint', [npm, 'run', 'lint:backend']);
    await run('coach-final-workspace-regression', [npm, 'run', 'test:unit'], '.', { repeat: true });
    const coachNewTests = results.filter(r => r.name.startsWith('coach-') && !r.repeat).reduce((n, r) => n + r.tests, 0);
    assert.equal(unique(), 1464 + upstreamAdditionalTests + coachNewTests);
    assert.deepEqual(await readFile(path.join(root, 'package-lock.json')), lockedBytes, 'Coach installation changed the root lock');
    for (const [file, hash] of Object.entries(artifacts)) assert.equal(createHash('sha256').update(await readFile(path.join(source, file))).digest('hex'), hash, `Source changed during verification: ${file}`);
    const destination = path.join(source, 'server/audit/release'); await mkdir(destination, { recursive: true });
    for (const [directory, file] of [['offline', 'integration-evidence.json'], ['offline', 'lint-evidence.json'],
        ['sync', 'integration-evidence.json'], ['storage', 'integration-evidence.json'], ['conflicts', 'integration-evidence.json']]) {
        await cp(path.join(root, 'server/audit', directory, file), path.join(destination, `${directory}-${file}`));
    }
    for (const file of ['phase6-evidence.json', 'declared-catalog.json', 'offline-current-evidence.json']) await cp(path.join(root, 'server/audit/database', file), path.join(destination, file));
    for (const file of ['phase7-evidence.json', 'fastify-offline-evidence.json', 'api-inventory.json', 'API-MATRIX.md']) await cp(path.join(root, 'server/audit/backend', file), path.join(destination, file));
    for (const file of ['browser-evidence.json', 'pwa-first-install.json']) await cp(path.join(root, 'server/audit/frontend', file), path.join(destination, file));
    for (const file of ['integration-evidence.json', 'browser-performance.json', 'artifacts.json']) await cp(path.join(root, 'server/audit/release', file), path.join(destination, file));
    const coachDestination = path.join(source, 'server/audit/coach'); await mkdir(coachDestination, { recursive: true });
    for (const file of ['integration.json', 'browser.json', 'performance.json', 'mobile.png']) await cp(path.join(root, 'server/audit/coach', file), path.join(coachDestination, file));
    // New security evidence is produced only in the isolated copy.
    for (const file of ['integration-evidence.json', 'api-inventory.json', 'API-MATRIX.md', 'browser-cancellation-evidence.json']) await cp(path.join(root, 'server/audit/security', file), path.join(destination, 'phase9-' + file));
    await writeFile(path.join(destination, 'matrix-evidence.json'), JSON.stringify({ createdAt: new Date().toISOString(), node: process.versions.node,
        npm: JSON.parse(await readFile(path.join(path.dirname(npm), '../package.json'))).version, baseline: 'PROVISIONAL', productionTouched: false,
        persistentDatabaseAccessed: false, dockerExecuted: false, isolatedDirectory: root, historicalTests: 1464 + upstreamAdditionalTests, upstreamAdditionalTests, newTests: coachNewTests, uniqueTests: unique(),
        repeatedTests: results.filter(r => r.repeat).reduce((n, r) => n + r.tests, 0), installStrategy: 'nested', results, artifacts }, null, 2) + '\n');
    console.log(`Approved: ${unique()} unique tests. Evidence: server/audit/release/matrix-evidence.json`);
} finally {
    // Retain this phase's source/log copy for inspection. Database/browser runners
    // close their own verified disposable processes and directories themselves.
    console.log(`Verification source/log copy retained: ${root}`);
}
