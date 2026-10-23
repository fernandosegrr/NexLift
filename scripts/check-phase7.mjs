import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const lint = new ESLint({ cwd: fileURLToPath(new URL('../', import.meta.url)), overrideConfigFile: true,
    overrideConfig: [js.configs.recommended, { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node },
        rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] } }] });
const results = await lint.lintFiles(['server/src/app/**/*.js', 'server/src/modules/**/*.js', 'server/src/infrastructure/**/*.js',
    'server/src/index.js', 'server/src/middleware/auth.js', 'server/test/*phase7*.{js,mjs}', 'server/test/fixtures/phase7*.{js,mjs}']);
if (results.some(r => r.errorCount || r.warningCount)) {
    process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1;
} else console.log(`Phase 7 lint: ${results.length} modules/tools, 0 errors, 0 warnings`);
