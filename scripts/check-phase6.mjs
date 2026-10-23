import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { ESLint } = require('eslint'), js = require('@eslint/js'), globals = require('globals');
const files = ['server/src/services/historyPersistence.js', 'server/src/services/workoutTransaction.js',
    'server/src/services/personalRecords.js', 'server/src/services/backupFormat.js', 'server/src/services/backupExport.js',
    'server/src/services/backupLegacy.js', 'server/src/services/backupRestore.js', 'server/src/services/postgresSystemBackup.js',
    'server/src/routes/updateRoutine.js', 'server/src/routes/workouts.js', 'server/deploy/releaseGate.js', 'server/test/run-phase6-integration.mjs',
    'server/test/phase6.integration.test.js', 'server/test/fixtures/phase6-environment.js', 'server/test/fixtures/phase6-http.mjs',
    'server/test/run-stabilization-integration.mjs', 'server/test/stabilization.integration.test.js', 'server/test/fixtures/stabilization-http.mjs',
    'server/test/fixtures/workout-graph-routes.js', 'server/test/fixtures/storage-browser.mjs'];
const lint = new ESLint({ cwd: fileURLToPath(new URL('../', import.meta.url)), overrideConfigFile: true,
    overrideConfig: [js.configs.recommended, { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node } }] });
const results = await lint.lintFiles(files);
if (results.some(r => r.errorCount || r.warningCount)) {
    process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1;
} else console.log(`Phase6 persistence/SQL harness lint: ${results.length} files, 0 errors, 0 warnings`);
