import path from 'node:path';

// Recognize only the historical offline runner's post-success Windows log lock.
// The caller must additionally check realpath and the stopped cluster on disk.
export function passedOfflineCleanupTarget(log, temporaryParent) {
    const summaries = [...log.matchAll(/(?:ℹ |# )(tests|pass|fail|cancelled|skipped) (\d+)/g)];
    if (summaries.length !== 5) return null;
    const totals = Object.fromEntries(summaries.map(match => [match[1], Number(match[2])]));
    if (totals.tests !== 31 || totals.pass !== 31 || totals.fail !== 0 || totals.cancelled !== 0 || totals.skipped !== 0) return null;
    if (!/code:\s*['"]EBUSY['"]/.test(log) || !/syscall:\s*['"]unlink['"]/.test(log)) return null;
    const match = log.match(/unlink ['"]([^'"\r\n]+)['"]/);
    if (!match || path.basename(match[1]) !== 'postgres.private.log') return null;
    const directory = path.dirname(path.resolve(match[1]));
    if (path.dirname(directory) !== path.resolve(temporaryParent) || !/^nexlift-stabilization-tests-[A-Za-z0-9_-]+$/.test(path.basename(directory))) return null;
    return directory;
}
