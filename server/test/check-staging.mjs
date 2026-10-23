import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const files = (await readdir('staging')).filter(f => f.endsWith('.mjs')).map(f => `staging/${f}`);
files.push('test/staging.test.js', 'test/staging.integration.test.js', 'test/run-staging-integration.mjs', 'test/check-staging.mjs', 'test/verify-staging.mjs');
const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [js.configs.recommended,
    { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } }] });
const results = await lint.lintFiles(files);
if (results.some(r => r.errorCount || r.warningCount)) { process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1; }
for (const file of files) {
    const check = spawnSync(process.execPath, ['--check', file], { windowsHide: true, encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`Syntax check failed: ${file}`);
    if ((await readFile(file, 'utf8')).includes('\uFFFD')) throw new Error(`Invalid UTF-8: ${file}`);
}
process.stdout.write(`Staging: ${files.length} files checked for lint, syntax and UTF-8.\n`);
