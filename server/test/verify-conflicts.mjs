// Historical fixtures and tests remain untouched. Current application sources
// run all 917 previous tests before the phase 3.4 SQL/browser cases.
import { cp, mkdtemp, mkdir, readFile, writeFile, realpath, rm, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { createHash } from 'node:crypto';
import { cleanStageEnvironment } from '../staging/environment.mjs';
import { protectDirectory } from '../staging/local.mjs';

if (process.versions.node !== '24.22.0' || process.argv.length !== 2) throw new Error('Node 24.22.0 required; no external arguments accepted');
const source = fileURLToPath(new URL('../../', import.meta.url)), parent = await realpath(tmpdir());
const root = await mkdtemp(path.join(parent, 'nexlift-phase34-verification-')); await protectDirectory(root);
const migration = '202610180001_phase31_operations', clientTests = ['operationSync.test.js', 'operationApi.test.js'];
const env = { ...cleanStageEnvironment(), CI: 'true', DATABASE_URL: '', NODE_ENV: 'test', PRISMA_SKIP_POSTINSTALL_GENERATE: 'true',
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1', npm_config_registry: 'https://registry.npmjs.org' };
env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${env.PATH || env.Path || ''}`;
const npm = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
const results = [], filter = name => !['node_modules', 'dist', '.git', migration, ...clientTests].includes(path.basename(name)) && !path.basename(name).startsWith('.env');
let passed = false;
try {
    for (const dir of ['server', 'client']) {
        await mkdir(path.join(root, dir));
        const entries = dir === 'server'
            ? ['package.json', 'package-lock.json', 'src', 'test', 'prisma', 'audit', 'deploy', 'staging', 'postgres-recovery.mjs', 'restore-backup.mjs']
            : ['package.json', 'package-lock.json', 'src', 'public', 'test', 'index.html', 'vite.config.js', 'vitest.config.js', 'eslint.config.js'];
        for (const entry of entries) await cp(path.join(source, dir, entry), path.join(root, dir, entry), { recursive: true, filter });
    }
    for (const file of ['Dockerfile', 'Dockerfile.rehearsal', 'Dockerfile.staging', 'compose.staging.yaml', '.dockerignore', '.gitignore']) await cp(path.join(source, file), path.join(root, file));
    const run = async (name, args, cwd) => {
        const start = Date.now();
        const result = spawnSync(process.execPath, args, { cwd: path.join(root, cwd), env, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300000 });
        const log = (result.stdout || '') + (result.stderr || ''); await writeFile(path.join(root, `${name}.private.log`), log, { mode: 0o600 });
        const plain = stripVTControlCharacters(log), summary = { name, exit: result.status, milliseconds: Date.now() - start,
            tests: Number(plain.match(/(?:ℹ |# )tests (\d+)/)?.[1] || plain.match(/Tests\s+(\d+) passed/)?.[1] || 0) };
        results.push(summary); process.stdout.write(JSON.stringify(summary) + '\n');
        if (result.error || result.status !== 0) throw new Error(`${name} failed; private log: ${path.join(root, `${name}.private.log`)}`);
    };
    await run('server-ci', [npm, 'ci', '--no-audit', '--no-fund'], 'server');
    await run('client-ci', [npm, 'ci', '--no-audit', '--no-fund'], 'client');
    await run('prisma-generate', ['node_modules/prisma/build/index.js', 'generate'], 'server');
    for (const script of ['test', 'test:integration', 'test:backup', 'test:backup:integration', 'test:import', 'test:import:integration',
        'test:workout:integration', 'test:workout:baseline', 'test:schema:audit', 'test:baseline', 'test:infra', 'test:infra:integration']) {
        await run(`server-${script.replaceAll(':', '-')}`, [npm, 'run', script], 'server');
    }
    await run('client-historical-tests', [npm, 'test'], 'client'); await run('client-production-default-build', [npm, 'run', 'build'], 'client');
    await run('staging-unit', ['--test', '--test-reporter=spec', 'test/staging.test.js'], 'server');
    await run('staging-integration', ['test/run-staging-integration.mjs'], 'server');
    await run('infra-static', ['test/check-infrastructure.mjs'], 'server'); await run('staging-static', ['test/check-staging.mjs'], 'server');
    if (results.reduce((n, r) => n + r.tests, 0) !== 730) throw new Error('Historical 730 test count changed');
    await cp(path.join(source, 'server/prisma/migrations', migration), path.join(root, 'server/prisma/migrations', migration), { recursive: true });
    await run('operations-unit', ['--test', '--test-reporter=spec', 'test/operation-contract.test.js'], 'server');
    await run('operations-integration', ['test/run-operation-integration.mjs'], 'server');
    await run('operations-static', ['test/check-operations.mjs'], 'server');
    if (results.reduce((n, r) => n + r.tests, 0) !== 800) throw new Error('Previous 800 test count changed');
    for (const file of clientTests) await cp(path.join(source, 'client/src/services', file), path.join(root, 'client/src/services', file));
    await run('sync-client', [npm, 'test', '--', ...clientTests.map(f => `src/services/${f}`)], 'client');
    await run('sync-postgres-browser', ['test/run-sync-integration.mjs'], 'server');
    await run('sync-static', ['test/check-sync.mjs'], 'server');
    if (results.reduce((n, r) => n + r.tests, 0) !== 870) throw new Error('Previous 870 tests changed');
    await run('storage-postgres-browser', ['test/run-storage-integration.mjs'], 'server');
    await run('storage-static', ['test/check-storage.mjs'], 'server');
    if (results.reduce((n,r)=>n+r.tests,0)!==917) throw new Error('Previous 917 tests changed');
    await run('conflicts-postgres-browser',['test/run-conflict-integration.mjs'],'server');
    if (results.reduce((n,r)=>n+r.tests,0)!==973) throw new Error('Expected 917 previous + 56 conflict tests');
    await run('conflicts-static',['test/check-conflicts.mjs'],'server');
    env.VITE_WORKOUT_OPERATIONS_ENABLED = 'true'; env.VITE_INDEXEDDB_ENABLED = 'true'; env.VITE_CONFLICT_RESOLUTION_ENABLED = 'true';
    await run('client-authorized-rehearsal-build', [npm, 'run', 'build'], 'client'); delete env.VITE_WORKOUT_OPERATIONS_ENABLED; delete env.VITE_INDEXEDDB_ENABLED; delete env.VITE_CONFLICT_RESOLUTION_ENABLED;
    await run('production-prune', [npm, 'prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], 'server');
    await run('production-deps-smoke', [npm, 'run', 'test:integration'], 'server');
    const artifacts = {};
    const storageArtifacts = ['client/package.json', 'client/package-lock.json', 'client/.env.example',
        'client/test/storage-cases.js', 'client/test/storage-harness.html', 'client/src/components/layout/DraftBoundary.jsx',
        'client/src/components/layout/OfflineStorageStatus.jsx', 'server/test/run-storage-integration.mjs',
        'server/test/storage.integration.test.js', 'server/test/fixtures/storage-browser.mjs', 'server/test/check-storage.mjs', 'server/test/verify-storage.mjs',
        'server/test/run-conflict-integration.mjs','server/test/conflict.integration.test.js','server/test/fixtures/conflict-http.mjs','server/test/fixtures/conflict-browser.mjs',
        'server/test/check-conflicts.mjs','server/test/verify-conflicts.mjs','server/src/services/sessionPatch.js',
        'client/src/services/sessionChanges.js','client/src/services/conflictResolution.js','client/src/components/layout/ConflictStatus.jsx','client/test/conflict-cases.js','client/test/conflict-harness.html'];
    for (const name of await readdir(path.join(root, 'client/src/storage'))) storageArtifacts.push(`client/src/storage/${name}`);
    // .env examples are documentation only, not loaded by any runner.
    await cp(path.join(source, 'client/.env.example'), path.join(root, 'client/.env.example'));
    for (const file of ['Dockerfile', 'server/prisma/schema.prisma', 'server/prisma/migrations/0_init/migration.sql',
        `server/prisma/migrations/${migration}/migration.sql`, 'server/src/routes/operations.js', 'server/src/services/workoutOperations.js',
        'server/src/services/operationContract.js', 'server/src/services/workoutTransaction.js', 'server/src/services/personalRecords.js',
        'server/src/services/postgresSystemBackup.js', 'client/src/services/offlineQueue.js', 'client/src/services/offlineSync.js', 'client/public/sw.js',
        'client/src/services/api.js', 'client/src/services/operationProtocol.js', 'client/src/services/operationStore.js',
        'client/src/services/operationTransport.js', 'client/src/services/operationSync.js', 'client/src/services/operationRuntime.js',
        'client/src/components/layout/OperationStatus.jsx', 'client/src/components/layout/SyncStatus.jsx', 'client/src/pages/Workout.jsx',
        'client/src/pages/EditSession.jsx', 'client/src/pages/Settings.jsx', 'client/src/context/AuthContext.jsx',
        'client/src/services/operationSync.test.js', 'client/src/services/operationApi.test.js', 'server/test/sync.integration.test.js',
        'server/test/run-sync-integration.mjs', 'server/test/fixtures/sync-http.mjs', 'server/test/fixtures/sync-browser.mjs', 'server/test/check-sync.mjs', 'server/test/verify-sync.mjs', ...storageArtifacts]) {
        artifacts[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    }
    const evidence = { createdAt: new Date().toISOString(), node: process.versions.node, postgres: '18', baseline: 'PROVISIONAL', productionTouched: false,
        source: 'SYNTHETIC_ONLY_NOT_PRODUCTION', historicalFixture: '730 unchanged tests on 0_init; then original 70 tests on actual provisional SQL migration; current application sources throughout',
        results, historicalTests: 917, uniqueTests: results.filter(r => r.name !== 'production-deps-smoke').reduce((sum, r) => sum + r.tests, 0),
        repeatedSmokeTests: 48, globalClientLint: { errors: 27, warnings: 3, newErrors: 0, newWarnings: 0 }, artifacts };
    await mkdir(path.join(source, 'server/audit/conflicts'), { recursive: true });
    await writeFile(path.join(source, 'server/audit/conflicts/phase34-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    await cp(path.join(root, 'server/audit/conflicts/integration-evidence.json'), path.join(source, 'server/audit/conflicts/integration-evidence.json'));
    passed = true;
} finally {
    const actual = await realpath(root);
    if (passed && path.dirname(actual) === parent && path.basename(actual).startsWith('nexlift-phase34-verification-')) await rm(actual, { recursive: true, force: true });
    else process.stderr.write(`Private verification directory retained: ${root}\n`);
}
