import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import plugin from '@typescript-eslint/eslint-plugin';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const lint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [{
    files: ['**/*.{ts,cts,tsx}'],
    languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    plugins: { '@typescript-eslint': plugin },
    rules: { ...plugin.configs.recommended.rules,
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/consistent-type-imports': 'error' }
}] });
const results = await lint.lintFiles(['client/src/**/*.{ts,tsx}', 'server/src/**/*.ts', 'packages/shared/src/**/*.ts']);
if (results.some(result => result.errorCount || result.warningCount)) {
    process.stderr.write(await (await lint.loadFormatter('stylish')).format(results)); process.exitCode = 1;
} else console.log(`Migrated TypeScript lint: ${results.length} files, 0 errors, 0 warnings`);
