import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const files = ['test/run-storage-integration.mjs', 'test/storage.integration.test.js', 'test/fixtures/storage-browser.mjs',
    'test/check-storage.mjs', 'test/verify-storage.mjs'];
const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [js.configs.recommended,
    { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } }] });
const findings = await lint.lintFiles(files);
if (findings.some(result => result.errorCount || result.warningCount)) throw new Error(await (await lint.loadFormatter('stylish')).format(findings));
for (const file of files) {
    if (spawnSync(process.execPath, ['--check', file], { windowsHide: true }).status !== 0) throw new Error(`Syntax: ${file}`);
    if ((await readFile(file, 'utf8')).includes('\uFFFD')) throw new Error(`UTF-8: ${file}`);
}
const output = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', 'src/storage', 'test/storage-cases.js',
    'src/components/layout/DraftBoundary.jsx', 'src/components/layout/OfflineStorageStatus.jsx', 'src/services/operationRuntime.js'], {
    cwd: fileURLToPath(new URL('../../client/', import.meta.url)), windowsHide: true, encoding: 'utf8' });
if (output.status !== 0) throw new Error(output.stdout || output.stderr);
process.stdout.write(JSON.stringify({ serverFiles: files.length, newLintErrors: 0, newLintWarnings: 0 }) + '\n');
