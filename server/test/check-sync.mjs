import { assertHistoricalLint } from '../../scripts/lib/lint-baseline.mjs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const files = ['test/run-sync-integration.mjs', 'test/sync.integration.test.js', 'test/fixtures/sync-http.mjs', 'test/fixtures/sync-browser.mjs',
    'test/check-sync.mjs', 'test/verify-sync.mjs', 'src/routes/operations.js', 'src/services/workoutOperations.js'];
const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [js.configs.recommended,
    { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } }] });
const findings = await lint.lintFiles(files);
if (findings.some(r => r.errorCount || r.warningCount)) throw new Error(await (await lint.loadFormatter('stylish')).format(findings));
for (const file of files) {
    if (spawnSync(process.execPath, ['--check', file], { windowsHide: true }).status !== 0) throw new Error(`Syntax: ${file}`);
    if ((await readFile(file, 'utf8')).includes('\uFFFD')) throw new Error(`UTF-8: ${file}`);
}
const client = fileURLToPath(new URL('../../client/', import.meta.url));
const output = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], {
    cwd: client, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (![0, 1].includes(output.status)) throw new Error('Client lint failed to execute');
const all = JSON.parse(output.stdout), errors = all.reduce((n, r) => n + r.errorCount, 0), warnings = all.reduce((n, r) => n + r.warningCount, 0);
const newFiles = all.filter(r => path.basename(r.filePath).startsWith('operation') || r.filePath.endsWith('OperationStatus.jsx'));
if (newFiles.some(r => r.errorCount || r.warningCount)) throw new Error('New sync files must remain lint clean');
await assertHistoricalLint(all, client);
process.stdout.write(JSON.stringify({ serverFiles: files.length, newLintErrors: 0, globalClientHistoricalErrors: errors, globalClientHistoricalWarnings: warnings }) + '\n');
