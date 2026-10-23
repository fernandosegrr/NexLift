import { readBackendSource } from './backend-source.mjs';
// Test-only extraction of actual, unchanged functions embedded in JSX/routes.
// Never imports index.js: no application startup, dotenv, SQL or providers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
export const trainingRoot = fileURLToPath(new URL('../../', import.meta.url));
export async function sourceFunction(file, name, bindings = {}) {
    const source = file === 'server/src/index.js' ? await readBackendSource() : await readFile(new URL('../../' + file, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
        file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
    const matches = [];
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
        if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer &&
            (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) matches.push(node.initializer);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(matches.length, 1, `${file}: unique real function ${name}`);
    const code = matches[0].getText(ast).replace(/^export\s+/, '');
    return new Function(...Object.keys(bindings), `return (${code});`)(...Object.values(bindings));
}
