// Explicit CLI, never called by HTTP/jobs. Operator needs PostgreSQL client tools.
import { statfs, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function assertRecoveryCapacity(parent, requiredBytes, inspect = statfs) {
    const info = await inspect(parent, { bigint: true });
    const free = info.bavail * info.bsize;
    if (free < BigInt(requiredBytes)) throw Object.assign(new Error('Insufficient recovery storage; operation blocked'), { code: 'ENOSPC' });
}
export async function recover({ action, directory, url, acknowledgeSensitive, bin }) {
    if (!['system-dump', 'system-restore'].includes(action) || acknowledgeSensitive !== true || !url || !path.isAbsolute(directory)) throw new Error('Explicit recovery configuration required');
    const { PrismaClient } = await import('@prisma/client');
    const { dumpSystemPostgres, restoreSystemPostgres } = await import('../src/services/postgresSystemBackup.js');
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
        if (action === 'system-dump') {
            const [{ bytes }] = await prisma.$queryRaw`SELECT pg_database_size(current_database())::text AS bytes`;
            await assertRecoveryCapacity(path.dirname(directory), BigInt(bytes) * 2n + 268435456n);
        } else {
            const bytes = (await stat(path.join(directory, 'system.dump'))).size;
            // Local file disk check; destination PostgreSQL disk must ALSO be
            // measured by its operator. Compressed archive size is not DB size.
            await assertRecoveryCapacity(path.dirname(directory), BigInt(bytes) * 4n + 268435456n);
        }
        const result = await (action === 'system-dump' ? dumpSystemPostgres : restoreSystemPostgres)({ prisma, url, directory, bin, acknowledgeSensitive });
        return { ok: true, action, verified: result.verified === true, restoreRequired: action === 'system-dump' };
    } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [action, directory, acknowledgement] = process.argv.slice(2);
    try { console.log(JSON.stringify(await recover({ action, directory, url: process.env.NEXLIFT_RECOVERY_DATABASE_URL,
        acknowledgeSensitive: acknowledgement === '--acknowledge-sensitive', bin: process.env.NEXLIFT_TEST_PG_BIN }))); }
    catch { console.error('Recovery blocked or failed; preserve source and archive'); process.exitCode = 1; }
}
