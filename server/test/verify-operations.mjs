// All 730 historical tests use their frozen 0_init fixture, with CURRENT
// application sources. Then the actual new migration is added and exercised on
// a NEW independently verified cluster. No historical tests are edited/skipped.
import { cp, mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
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
const root = await mkdtemp(path.join(parent, 'nexlift-phase31-verification-')); await protectDirectory(root);
const migration = '202610180001_phase31_operations';
const env = { ...cleanStageEnvironment(), CI: 'true', DATABASE_URL: '', NODE_ENV: 'test', PRISMA_SKIP_POSTINSTALL_GENERATE: 'true',
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1', npm_config_registry: 'https://registry.npmjs.org' };
env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${env.PATH || env.Path || ''}`;
const npm = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
const results = [], filter = name => !['node_modules', 'dist', '.git', migration].includes(path.basename(name)) && !path.basename(name).startsWith('.env');
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
    await run('client-tests', [npm, 'test'], 'client'); await run('client-build', [npm, 'run', 'build'], 'client');
    await run('staging-unit', ['--test', '--test-reporter=spec', 'test/staging.test.js'], 'server');
    await run('staging-integration', ['test/run-staging-integration.mjs'], 'server');
    await run('infra-static', ['test/check-infrastructure.mjs'], 'server');
    await run('staging-static', ['test/check-staging.mjs'], 'server');
    const prior = results.reduce((n, r) => n + r.tests, 0);
    if (prior !== 730) throw new Error(`Historical test count changed: ${prior}`);
    await cp(path.join(source, 'server/prisma/migrations', migration), path.join(root, 'server/prisma/migrations', migration), { recursive: true });
    await run('operations-unit', ['--test', '--test-reporter=spec', 'test/operation-contract.test.js'], 'server');
    await run('operations-integration', ['test/run-operation-integration.mjs'], 'server');
    await run('operations-static', ['test/check-operations.mjs'], 'server');
    const lint = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], { cwd: path.join(root, 'client'), env, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (![0, 1].includes(lint.status)) throw new Error('Client lint execution failed');
    const lintFindings = JSON.parse(lint.stdout);
    const globalClientLint = { errors: lintFindings.reduce((n, r) => n + r.errorCount, 0), warnings: lintFindings.reduce((n, r) => n + r.warningCount, 0) };
    await run('production-prune', [npm, 'prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], 'server');
    await run('production-deps-smoke', [npm, 'run', 'test:integration'], 'server');
    const artifacts = {};
    for (const file of ['Dockerfile', 'server/prisma/schema.prisma', 'server/prisma/migrations/0_init/migration.sql',
        `server/prisma/migrations/${migration}/migration.sql`, 'server/src/index.js', 'server/src/routes/workouts.js',
        'server/src/routes/operations.js', 'server/src/services/operationContract.js', 'server/src/services/workoutOperations.js', 'server/src/services/workoutTransaction.js',
        'server/test/operation-contract.test.js', 'server/test/operation.integration.test.js', 'server/test/run-operation-integration.mjs',
        'client/src/services/offlineQueue.js', 'client/src/services/offlineSync.js', 'client/src/services/api.js',
        'server/src/services/postgresSystemBackup.js', 'server/src/services/postgresBackup.js', 'server/src/services/personalRecords.js']) {
        artifacts[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    }
    const evidence = { createdAt: new Date().toISOString(), node: process.versions.node, postgres: '18', baseline: 'PROVISIONAL', productionTouched: false,
        source: 'SYNTHETIC_ONLY_NOT_PRODUCTION', historicalFixture: 'Unchanged 0_init; current application sources',
        currentMigrationVerifiedSeparatelyOnNewCluster: true, results, historicalTests: prior,
        uniqueTests: results.filter(r => r.name !== 'production-deps-smoke').reduce((sum, r) => sum + r.tests, 0), repeatedSmokeTests: 48, globalClientLint, artifacts };
    await mkdir(path.join(source, 'server/audit/operations'), { recursive: true });
    await writeFile(path.join(source, 'server/audit/operations/phase31-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    await cp(path.join(root, 'server/audit/operations/integration-evidence.json'), path.join(source, 'server/audit/operations/integration-evidence.json'));
    passed = true;
} finally {
    const actual = await realpath(root);
    if (passed && path.dirname(actual) === parent && path.basename(actual).startsWith('nexlift-phase31-verification-')) await rm(actual, { recursive: true, force: true });
    else process.stderr.write(`Private verification directory retained: ${root}\n`);
}
