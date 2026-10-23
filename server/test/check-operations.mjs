import { readBackendSource } from '../../scripts/lib/backend-source.mjs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
export const files = ['src/services/operationContract.js', 'src/services/workoutOperations.js', 'src/routes/operations.js',
    'src/services/workoutTransaction.js', 'src/routes/workouts.js', 'test/operation-contract.test.js', 'test/operation.integration.test.js',
    'test/run-operation-integration.mjs', 'test/fixtures/operation-http.mjs', 'test/check-operations.mjs', 'test/verify-operations.mjs'];
const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [js.configs.recommended,
    { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } }] });
const results = await lint.lintFiles(files);
const source = await readBackendSource();
const baseline = source.replace("import { mountOperationRoutes } from './routes/operations.js';\n", '').replace('mountOperationRoutes(app, { prisma, authMiddleware });\n', '');
const current = (await lint.lintText(source, { filePath: 'src/index.js' }))[0];
const before = (await lint.lintText(baseline, { filePath: 'src/index.js' }))[0];
// The two route-wiring lines must introduce no additional historical lint debt.
const fingerprint = r => JSON.stringify(r.messages.map(m => [m.ruleId, m.message]).sort());
if (fingerprint(current) !== fingerprint(before)) results.push(current);
if (results.some(r => r.errorCount || r.warningCount)) {
    process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1;
}
for (const file of [...files, 'src/index.js']) {
    if (spawnSync(process.execPath, ['--check', file], { windowsHide: true }).status !== 0) throw new Error(`Syntax check failed: ${file}`);
    if ((await readFile(file, 'utf8')).includes('\uFFFD')) throw new Error(`Invalid UTF-8: ${file}`);
}
process.stdout.write(JSON.stringify({ checkedFiles: files.length + 1, newLintErrors: results.reduce((n, r) => n + r.errorCount, 0),
    historicalIndexErrors: before.errorCount, historicalIndexWarnings: before.warningCount }) + '\n');
