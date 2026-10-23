import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function assertLintSubset(findings, client, baseline) {
    const key = (file, message) => JSON.stringify([file, message.ruleId, message.severity, message.message.split('\n')[0]]);
    const allowed = new Map();
    for (const row of baseline.findings) for (const message of row.messages) {
        const id = key(row.file, message); allowed.set(id, (allowed.get(id) || 0) + 1);
    }
    for (const row of findings) for (const message of row.messages) {
        const id = key(path.relative(client, row.filePath).replaceAll('\\', '/'), message), remaining = allowed.get(id) || 0;
        if (!remaining) throw new Error('New lint finding: ' + id);
        allowed.set(id, remaining - 1);
    }
}
export async function assertHistoricalLint(findings, client) {
    const baseline = JSON.parse(await readFile(new URL('../../server/audit/frontend/offline-lint-evidence.json', import.meta.url), 'utf8'));
    assertLintSubset(findings, client, baseline);
}
