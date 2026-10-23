import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const lint = new ESLint({ cwd: fileURLToPath(new URL('../', import.meta.url)), overrideConfigFile: true,
    overrideConfig: [js.configs.recommended, { files: ['scripts/**/*.mjs', 'server/test/**/*.{js,mjs}'], languageOptions: { globals: globals.node } },
        { files: ['scripts/fixtures/phase43/client/**/*.js'], languageOptions: { globals: globals.browser } },
        { files: ['scripts/fixtures/phase44/client/src/utils/routinePayload.js'], rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }] } }] });
const results = await lint.lintFiles(['scripts/**/*.{js,mjs}', 'packages/shared/src/**/*.js', 'packages/shared/test/**/*.mjs',
    'server/test/typescript-dev.integration.test.js', 'server/test/run-typescript-dev.mjs', 'server/test/fixtures/typescript-dev-guard.mjs',
    'server/test/fixtures/typescript-dev-process.mjs', 'server/test/fixtures/browser-process.mjs',
    'server/test/training-analysis.integration.test.js', 'server/test/run-training-analysis-integration.mjs',
    'server/test/smart-loading.integration.test.js', 'server/test/run-smart-loading-integration.mjs',
    'server/test/performance.integration.test.js', 'server/test/run-performance-integration.mjs',
    'server/test/fixtures/stabilization-browser.mjs', 'server/test/phase9*.js', 'server/test/run-phase9*.mjs', 'server/test/fixtures/phase9*.js']);
if (results.some(result => result.errorCount || result.warningCount)) {
    process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1;
} else console.log(`Tooling/shared lint: ${results.length} files, 0 errors, 0 warnings`);
