import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const lint = new ESLint({ cwd: fileURLToPath(new URL('../', import.meta.url)), overrideConfigFile: true,
    overrideConfig: [js.configs.recommended, { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node } }] });
const results = await lint.lintFiles(['server/deploy/release-*.{js,mjs}', 'server/test/phase10*.js', 'server/test/run-phase10*.mjs', 'scripts/*release*.mjs']);
if (results.some(result => result.errorCount || result.warningCount)) {
    process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1;
} else console.log(`Release lint: ${results.length} files, 0 errors, 0 warnings`);
