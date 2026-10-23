import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { ESLint } = require('eslint');
const js = require('@eslint/js');
const globals = require('globals');
const files = ['src/middleware/auth.js','src/operations/errors.js','src/operations/telemetry.js','src/operations/health.js','src/operations/shutdown.js',
    'deploy/rehearsal-config.js','deploy/rehearsal-http.mjs','deploy/rehearsal-migrate.mjs','deploy/http-healthcheck.mjs',
    'test/infra-auth.test.js','test/infra-operations.test.js','test/infra.integration.test.js','test/run-infrastructure-integration.mjs',
    'test/fixtures/infra-process.mjs','test/verify-node24.mjs','test/check-infrastructure.mjs'];
const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [js.configs.recommended,
    { files: ['**/*.js','**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } }] });
const results = await lint.lintFiles(files);
const errors = results.reduce((sum,r) => sum + r.errorCount + r.warningCount,0);
if (errors) { process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1; }
for (const file of ['src/index.js',...files]) {
    const check = spawnSync(process.execPath,['--check',file],{ encoding: 'utf8', windowsHide: true });
    if (check.status !== 0) throw new Error(`Syntax check failed: ${file}`);
    if ((await readFile(file,'utf8')).includes('\uFFFD')) throw new Error(`Invalid UTF-8: ${file}`);
}
const clientFile = fileURLToPath(new URL('../../client/src/context/AuthContext.infra.test.jsx',import.meta.url));
const clientLint = new ESLint({ cwd: fileURLToPath(new URL('../../client/', import.meta.url)), overrideConfigFile: true, overrideConfig: [js.configs.recommended, {
    files: ['**/*.jsx'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser,
        parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { 'no-unused-vars': ['error',{varsIgnorePattern:'^[A-Z_]'}] }
}] });
const clientResults = await clientLint.lintFiles([clientFile]);
if (clientResults.some(r=>r.errorCount || r.warningCount)) {
    process.stderr.write(await (await clientLint.loadFormatter('stylish')).format(clientResults)); process.exitCode = 1;
}
process.stdout.write(`Infrastructure lint and syntax: ${files.length + 2} files checked.\n`);
