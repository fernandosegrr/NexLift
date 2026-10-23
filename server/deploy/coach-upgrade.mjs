// Incremental expansion only. No migrate reset, baseline adoption or schema repair.
// Historical guarded migration files remain immutable; reuse their exact DDL.
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationFiles } from '../src/services/migrationHistory.js';
import { releaseSchema } from './release-preflight.mjs';

const name = '202610230001_coach', checksum = '068eba7493f7af5c365d9a892d99700e0a9fbfa6a7f3cf12e3c4983808bc2236';
async function statements() {
    const files = await migrationFiles();
    if (!files.some(file => file.name === name && file.checksum === checksum)) throw new Error('Coach SQL checksum rejected');
    const source = await readFile(new URL('../prisma/migrations/202610230001_coach/migration.sql', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('CREATE TABLE "CoachCheckIn"'), source.lastIndexOf('COMMIT;')).trim();
    const parts = body.split(/;\r?\n(?=CREATE|-- Defense)/).map(sql => sql.trim().replace(/;$/, ''));
    if (parts.length !== 13 || parts.some(sql => !/^(CREATE|-- Defense)/.test(sql))) throw new Error('Unreviewed Coach DDL layout');
    return parts;
}
async function fingerprint(tx, tables) {
    const values = [];
    for (const table of tables) {
        if (!/^[A-Za-z]+$/.test(table.name)) throw new Error('Unexpected table');
        const [row] = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) AS digest FROM public."${table.name}" t`);
        values.push({ table: table.name, ...row });
    }
    const [journal] = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) AS digest FROM nexlift_operations."IdempotencyRecord" t`);
    return JSON.stringify({ values, journal });
}
export async function expandCoach(prisma, { expectedDatabase, expectedServerMajor, abortAfterDDL = false } = {}) {
    if (typeof expectedDatabase !== 'string' || !expectedDatabase || !Number.isInteger(expectedServerMajor)) throw new Error('Explicit target identity required');
    const ddl = await statements();
    return prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ WRITE');
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='10s'");
        await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
        const [identity] = await tx.$queryRaw`SELECT current_database() AS database, (current_setting('server_version_num')::int / 10000)::int AS major`;
        if (identity.database !== expectedDatabase || identity.major !== expectedServerMajor) throw new Error('Target identity rejected');
        const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended('nexlift:coach:202610230001',0)) AS held`;
        if (!lock.held) throw new Error('Another Coach migration is active');
        const before = await releaseSchema(tx);
        if (before.coachReady) return { migrated: false, alreadyApplied: true, appliedMigrations: before.history.rows.length };
        if (before.history.pending.join() !== name || before.history.rows.length !== 3) throw new Error('Only reviewed v4 to Coach expansion is permitted');
        const original = await fingerprint(tx, before.expected.tables);
        await tx.$executeRawUnsafe('SET LOCAL search_path=public,pg_catalog');
        for (const sql of ddl) await tx.$executeRawUnsafe(sql);
        if (abortAfterDDL) throw new Error('Deliberate disposable rollback rehearsal');
        await tx.$executeRaw`INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count)
            VALUES (${randomUUID()},${checksum},CURRENT_TIMESTAMP,${name},NULL,CURRENT_TIMESTAMP,1)`;
        const after = await releaseSchema(tx, true);
        if (await fingerprint(tx, before.expected.tables) !== original) throw new Error('Original data changed; entire expansion rolled back');
        return { migrated: true, appliedMigrations: after.history.rows.length, originalTablesPreserved: true, operationJournalPreserved: true, coachTables: 4 };
    }, { isolationLevel: 'RepeatableRead', timeout: 60000, maxWait: 5000 });
}
export async function verifyCoachBackup(directory, database) {
    const backup = JSON.parse(await readFile(path.join(directory, 'backup-result.json'), 'utf8'));
    const restore = JSON.parse(await readFile(path.join(directory, 'restore-result.json'), 'utf8'));
    if (backup.sourceDatabase !== database || !backup.sourceReadOnly || !backup.snapshotConsistent
        || !/^[a-f0-9]{64}$/.test(backup.archiveSha256) || restore.sourceArchiveSha256 !== backup.archiveSha256
        || !restore.restoredExact || !restore.originalTablesPreserved || !restore.coachDDLRehearsed
        || restore.tablesVerified !== backup.tableDataEntries || Date.now() - Date.parse(backup.createdAt) > 86400000
        || !Number.isFinite(Date.parse(backup.createdAt))) throw new Error('Fresh verified restore rehearsal required');
    const encrypted = await readFile(path.join(directory, 'production-full.dump.enc'));
    if (createHash('sha256').update(encrypted).digest('hex') !== backup.encryptedSha256) throw new Error('Encrypted archive changed since verification');
    return backup.archiveSha256;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let prisma;
    try {
        const database = process.env.NEXLIFT_COACH_TARGET_DATABASE, url = new URL(process.env.NEXLIFT_RELEASE_DATABASE_URL);
        if (!database || decodeURIComponent(url.pathname.slice(1)) !== database || process.env.NODE_ENV !== 'production') throw new Error('Explicit release target required');
        await verifyCoachBackup(process.env.NEXLIFT_COACH_BACKUP_EVIDENCE, database);
        const { PrismaClient } = await import('@prisma/client');
        prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
        console.log(JSON.stringify(await expandCoach(prisma, { expectedDatabase: database, expectedServerMajor: Number(process.env.NEXLIFT_COACH_TARGET_PG_MAJOR) })));
    } catch { console.error('Coach expansion blocked or rolled back; no schema repair attempted'); process.exitCode = 1; }
    finally { await prisma?.$disconnect(); }
}
