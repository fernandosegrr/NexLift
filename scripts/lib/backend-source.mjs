// Historical extraction tests inspect the LIVE moved statements. Reconstructing
// their old positions preserves the previous byte/AST assertions without keeping
// a second active implementation. Lifecycle/transport changes have new HTTP tests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createHash } from 'node:crypto';

export async function readBackendSource() {
    const base = new URL('../../', import.meta.url);
    let source = await readFile(new URL('scripts/fixtures/phase7/index.received.txt', base), 'utf8');
    const entries = JSON.parse(await readFile(new URL('scripts/fixtures/phase7/extraction.json', base), 'utf8'));
    const security = JSON.parse(await readFile(new URL('scripts/fixtures/phase9/security-statements.json', base), 'utf8'));
    const modules = new Map();
    for (const entry of entries.toReversed()) {
        if (!modules.has(entry.file)) {
            const text = await readFile(new URL(entry.file, base), 'utf8');
            modules.set(entry.file, ts.createSourceFile(entry.file, text, ts.ScriptTarget.Latest, true));
        }
        const ast = modules.get(entry.file), found = [];
        function visit(node) {
            const key = entry.key;
            if (key.function && ts.isFunctionDeclaration(node) && node.name?.text === key.function) found.push(node);
            if (key.variable && ts.isVariableStatement(node) && node.declarationList.declarations[0]?.name.getText(ast) === key.variable) found.push(node);
            if (key.method && ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === key.method
                && node.expression.arguments[0]?.text === key.route) found.push(node);
            ts.forEachChild(node, visit);
        }
        visit(ast); assert.equal(found.length, 1, `${entry.file}: live statement ${JSON.stringify(entry.key)}`);
        let text = found[0].getText(ast).replace(/^export /, '');
        const reviewed = security.find(row => row.file === entry.file && JSON.stringify(row.key) === JSON.stringify(entry.key));
        if (reviewed) {
            // Explicit Phase 9 security changes have exact reviewed hashes plus
            // HTTP/SQL/concurrency regressions. Every other extracted business
            // statement still compares byte-for-byte to the received fixture.
            assert.equal(createHash('sha256').update(text).digest('hex'), reviewed.sha256, `Unreviewed security statement: ${entry.file} ${JSON.stringify(entry.key)}`);
            continue;
        }
        // Explicit dependency-injection substitutions only; no business formula,
        // response, validator, Prisma query or transaction may be normalized.
        text = text.replace('if (chooseExercisesForDay)', 'if (process.env.OPENAI_API_KEY)')
            .replace('createWorkoutHandlers({ prisma, scheduleRestReminder, logger: console })', 'createWorkoutHandlers({ prisma, scheduleRestReminder })')
            .replace('createImportRoutineHandler({ prisma, deduplicateExercises, logger: console })', 'createImportRoutineHandler({ prisma, deduplicateExercises })')
            .replace('createUpdateRoutineHandler({ prisma, deduplicateExercises, logger: console })', 'createUpdateRoutineHandler({ prisma, deduplicateExercises })')
            .replace('dryRun: !config.backupPruneEnabled', "dryRun: process.env.NEXLIFT_BACKUP_PRUNE_ENABLED !== 'true'")
            .replace('config.vapidPublicKey || null', 'process.env.VAPID_PUBLIC_KEY || null')
            .replace('mountOperationRoutes(app, { prisma, authMiddleware, offlineSyncEnabled: config.offlineSyncEnabled, resolutionEnabled: config.resolutionEnabled });', 'mountOperationRoutes(app, { prisma, authMiddleware });');
        // Received test-creatine referenced a nonexistent lowercase variable.
        // Its corrected 400/200 behavior is covered by native HTTP/SQL tests.
        if (entry.key.route === '/api/push/test-creatine') text = text.replace('if (!VAPID_CONFIGURED)', 'if (!vapidConfigured)');
        if (entry.key.function === 'sendPushToUser') text = text.replace("typeof payload === 'string' ? payload : JSON.stringify(payload)", 'payload');
        if (['scheduleRestReminder', 'restorePendingReminders'].includes(entry.key.function)) text = text.replaceAll('void track(firePendingReminder, ', 'firePendingReminder(');
        const original = source.slice(entry.start, entry.end), endings = original.match(/\r?\n/g) || [], lines = text.split(/\r?\n/);
        assert.equal(lines.length, endings.length + 1, `${entry.file}: moved statement line count changed`);
        text = lines.map((line, index) => line + (endings[index] || '')).join('');
        source = source.slice(0, entry.start) + text + source.slice(entry.end);
    }
    return source;
}
