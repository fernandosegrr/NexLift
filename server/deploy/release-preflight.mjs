import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSchemaReady, businessCatalog } from './releaseGate.js';
import { compareCatalog } from '../audit/postgresql/audit-tools.mjs';
import { readMigrationHistory } from '../src/services/migrationHistory.js';

export async function operationsCatalog(tx) {
    const source = await readFile(new URL('../audit/postgresql/catalog.sql', import.meta.url), 'utf8');
    const query = source.slice(source.indexOf('WITH tables AS'), source.lastIndexOf('COMMIT;'))
        .replaceAll("n.nspname = 'public'", "n.nspname = 'nexlift_operations'")
        .replaceAll("n.nspname='public'", "n.nspname='nexlift_operations'");
    await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog');
    const [row] = await tx.$queryRawUnsafe(query);
    return Object.values(row)[0];
}
export async function assertReleaseSchema(prisma) {
    const ready = await assertSchemaReady(prisma);
    const expected = JSON.parse(await readFile(new URL('./operations-catalog.json', import.meta.url), 'utf8'));
    await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
        if (compareCatalog(expected, await operationsCatalog(tx)).length) throw new Error('Operation journal schema incompatible');
    }, { isolationLevel: 'RepeatableRead', timeout: 10000 });
    return ready;
}
// Counts only: no credentials, row IDs, migration logs or raw query output.
// legacy is inspection, never permission to resolve/adopt the baseline.
export async function releasePreflight(prisma, { phase = 'current' } = {}) {
    if (!['current', 'legacy'].includes(phase)) throw new Error('Unknown schema phase');
    if (phase === 'current') await assertReleaseSchema(prisma);
    const expected = JSON.parse(await readFile(new URL(phase === 'current'
        ? '../audit/database/declared-catalog.json' : '../audit/postgresql/declared-catalog.json', import.meta.url), 'utf8')).catalog;
    return prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='30s'");
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
        await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog');
        const source = await readFile(new URL('../audit/postgresql/catalog.sql', import.meta.url), 'utf8');
        const [row] = await tx.$queryRawUnsafe(source.slice(source.indexOf('WITH tables AS'), source.lastIndexOf('COMMIT;')));
        const actual = Object.values(row)[0], differences = compareCatalog(expected, businessCatalog(actual));
        if (differences.length) throw new Error('Schema mismatch: preflight rejected');
        const history = await readMigrationHistory(tx, { requireCurrent: phase === 'current' });
        const counts = {};
        for (const table of expected.tables) {
            if (!/^[A-Za-z]+$/.test(table.name)) throw new Error('Unexpected table');
            const [count] = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM public."${table.name}"`);
            counts[table.name] = count.count;
        }
        const [data] = await tx.$queryRawUnsafe(`SELECT
            (SELECT count(*)::int FROM public."WorkoutLog" w JOIN public."Exercise" e ON e.id=w."exerciseId" JOIN public."RoutineDay" d ON d.id=e."routineDayId" JOIN public."Routine" r ON r.id=d."routineId" WHERE r."userId" IS NULL) AS "unownedHistory",
            (SELECT count(*)::int FROM public."SuggestionLog" s JOIN public."Exercise" e ON e.id=s."exerciseId" JOIN public."RoutineDay" d ON d.id=e."routineDayId" JOIN public."Routine" r ON r.id=d."routineId" WHERE s."userId" IS DISTINCT FROM r."userId") AS "crossAccountSuggestions",
            (SELECT count(*)::int FROM public."PendingReminder" s JOIN public."Exercise" e ON e.id=s."exerciseId" JOIN public."RoutineDay" d ON d.id=e."routineDayId" JOIN public."Routine" r ON r.id=d."routineId" WHERE s."userId" IS DISTINCT FROM r."userId") AS "crossAccountReminders",
            (SELECT count(*)::int FROM public."SetLog" s LEFT JOIN public."WorkoutLog" w ON w.id=s."workoutLogId" WHERE w.id IS NULL) AS "orphanSets",
            (SELECT count(*)::int FROM (SELECT "workoutLogId","setNumber" FROM public."SetLog" GROUP BY 1,2 HAVING count(*)>1) x) AS "setNumberCollisions",
            (SELECT count(*)::int FROM public."RoutineDay" WHERE weekday<0 OR weekday>6) AS "invalidWeekdays"`);
        if (Object.values(data).some(n => n > 0)) throw new Error('Incompatible data: preserve records and investigate');
        return { ready: phase === 'current', phase, baseline: 'PROVISIONAL', counts, diagnostics: data,
            appliedMigrations: history.rows.length, pending: history.pending, catalog: { tables: expected.tables.length,
                columns: expected.columns.length, indexes: expected.indexes.length, foreignKeys: expected.foreignKeys.length, constraints: expected.constraints.length } };
    }, { isolationLevel: 'RepeatableRead', timeout: 40000 });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const url = process.env.NEXLIFT_RELEASE_DATABASE_URL;
    if (!url || !['current', 'legacy'].includes(process.argv[2] || 'current')) { console.error('Explicit preflight URL and valid phase required'); process.exitCode = 1; }
    else {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient({ datasources: { db: { url } } });
        try { console.log(JSON.stringify(await releasePreflight(prisma, { phase: process.argv[2] || 'current' }))); }
        catch { console.error('Read-only preflight rejected; no repair performed'); process.exitCode = 1; }
        finally { await prisma.$disconnect(); }
    }
}
