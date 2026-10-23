import { assertHistoricalLint } from '../../scripts/lib/lint-baseline.mjs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const files = ['src/services/sessionPatch.js', 'src/services/operationContract.js', 'src/services/workoutOperations.js', 'src/routes/operations.js',
    'test/run-conflict-integration.mjs', 'test/conflict.integration.test.js', 'test/fixtures/conflict-http.mjs',
    'test/fixtures/conflict-browser.mjs', 'test/check-conflicts.mjs', 'test/verify-conflicts.mjs'];
const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [js.configs.recommended,
    { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } }] });
const results = await lint.lintFiles(files);
if (results.some(r => r.errorCount || r.warningCount)) throw new Error(await (await lint.loadFormatter('stylish')).format(results));
const client = fileURLToPath(new URL('../../client/', import.meta.url));
const output = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', 'src/services/sessionChanges.js', 'src/services/conflictResolution.js',
    'src/services/operationProtocol.js', 'src/services/operationSync.js', 'src/services/operationRuntime.js', 'src/storage',
    'src/components/layout/ConflictStatus.jsx', 'src/components/layout/OperationStatus.jsx', 'test/conflict-cases.js'],
{ cwd: client, windowsHide: true, encoding: 'utf8' });
if (output.status !== 0) throw new Error(output.stdout || output.stderr);
const global = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], { cwd: client, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const all = JSON.parse(global.stdout), errors = all.reduce((n, r) => n + r.errorCount, 0), warnings = all.reduce((n, r) => n + r.warningCount, 0);
await assertHistoricalLint(all, client);
process.stdout.write(JSON.stringify({ newLintErrors: 0, newLintWarnings: 0, historicalClientErrors: errors, historicalClientWarnings: warnings }) + '\n');
