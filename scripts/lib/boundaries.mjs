import path from 'node:path';
import ts from 'typescript';

const platformGlobals = new Set(['window', 'document', 'navigator', 'localStorage', 'sessionStorage',
    'indexedDB', 'process', 'Buffer', 'global', 'fetch', 'XMLHttpRequest']);

// Parse syntax rather than matching text in comments or string literals.
export function inspectSharedSource(source, file, sourceRoot) {
    const findings = [];
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function dependency(node) {
        if (!node || !ts.isStringLiteralLike(node)) {
            findings.push('Dynamic dependency must be a static relative path'); return;
        }
        const spec = node.text;
        if (!spec.startsWith('./') && !spec.startsWith('../')) {
            findings.push(`Shared cannot import external/platform module: ${spec}`); return;
        }
        const relative = path.relative(sourceRoot, path.resolve(path.dirname(file), spec));
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
            findings.push(`Shared import escapes its source directory: ${spec}`);
        }
    }
    function visit(node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier) dependency(node.moduleSpecifier);
        if (ts.isImportEqualsDeclaration(node)) {
            findings.push('Shared cannot use TypeScript import-equals');
        }
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            ts.isIdentifier(node.expression) && node.expression.text === 'require')) dependency(node.arguments[0]);
        if (ts.isIdentifier(node) && platformGlobals.has(node.text)) findings.push(`Shared cannot use platform global: ${node.text}`);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    return findings;
}
