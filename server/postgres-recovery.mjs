import { PrismaClient } from '@prisma/client';
import { dumpPostgres, restorePostgres } from './src/services/postgresBackup.js';
import { dumpSystemPostgres, restoreSystemPostgres } from './src/services/postgresSystemBackup.js';

const [action, directory, acknowledgement] = process.argv.slice(2);
if (!['dump', 'restore', 'system-dump', 'system-restore'].includes(action) || !directory
    || (action.startsWith('system-') && acknowledgement !== '--acknowledge-sensitive')) {
    console.log('node postgres-recovery.mjs dump|restore <directorio>: sanitizado, sin credenciales.\nnode postgres-recovery.mjs system-dump|system-restore <directorio> --acknowledge-sensitive: completo y sensible.\nDestino explícito: NEXLIFT_RECOVERY_DATABASE_URL. No carga .env ni infiere DATABASE_URL. Restore exige base vacía.');
    process.exit(1);
}
const url = process.env.NEXLIFT_RECOVERY_DATABASE_URL;
if (!url) throw new Error('Se requiere NEXLIFT_RECOVERY_DATABASE_URL. Nunca se infiere DATABASE_URL.');
const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
    const run = { dump: dumpPostgres, restore: restorePostgres, 'system-dump': dumpSystemPostgres, 'system-restore': restoreSystemPostgres }[action];
    const result = await run({ prisma, url, directory, bin: process.env.NEXLIFT_TEST_PG_BIN, acknowledgeSensitive: acknowledgement === '--acknowledge-sensitive' });
    // Do not print manifests/fingerprints of authentication or migration logs.
    console.log(JSON.stringify(action.startsWith('system-') ? { ok: true, action, verified: result.verified ?? false,
        requiresCredentialReset: result.requiresCredentialReset ?? false } : result, null, 2));
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
