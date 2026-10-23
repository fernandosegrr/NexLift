import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { businessCatalog } from './releaseGate.js';
import { compareCatalog } from '../audit/postgresql/audit-tools.mjs';
import { readMigrationHistory, migrationFiles } from '../src/services/migrationHistory.js';

export async function operationsCatalog(tx) {
    const source = await readFile(new URL('../audit/postgresql/catalog.sql', import.meta.url), 'utf8');
    const query = source.slice(source.indexOf('WITH tables AS'), source.lastIndexOf('COMMIT;'))
        .replaceAll("n.nspname = 'public'", "n.nspname = 'nexlift_operations'")
        .replaceAll("n.nspname='public'", "n.nspname='nexlift_operations'");
    await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog');
    const [row] = await tx.$queryRawUnsafe(query);
    return Object.values(row)[0];
}
const coachMigration = '202610230001_coach';
export async function releaseSchema(tx, requireCoach = false) {
    const files = await migrationFiles();
    const history = await readMigrationHistory(tx, { files });
    const hasCoach = files.some(file => file.name === coachMigration);
    // Only this known additive expansion may be pending. Missing old migrations,
    // failed/unknown/checksum-altered history and partial schema always fail.
    const coachPending = hasCoach && history.pending.length === 1 && history.pending[0] === coachMigration;
    if (history.pending.length && !coachPending || !history.present || requireCoach && (!hasCoach || coachPending)) throw new Error('Required migration history incomplete');
    const coachReady = hasCoach && !coachPending;
    const expected = JSON.parse(await readFile(new URL(coachReady ? './coach-catalog.json' : '../audit/database/declared-catalog.json', import.meta.url), 'utf8')).catalog;
    const source = await readFile(new URL('../audit/postgresql/catalog.sql', import.meta.url), 'utf8');
    await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog');
    const [row] = await tx.$queryRawUnsafe(source.slice(source.indexOf('WITH tables AS'), source.lastIndexOf('COMMIT;')));
    if (compareCatalog(expected, businessCatalog(Object.values(row)[0])).length) throw new Error('Schema mismatch: preflight rejected');
    const operations = JSON.parse(await readFile(new URL('./operations-catalog.json', import.meta.url), 'utf8'));
    if (compareCatalog(operations, await operationsCatalog(tx)).length) throw new Error('Operation journal schema incompatible');
    return { expected, history, coachReady };
}
async function readOnly(tx) {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
}
export async function assertReleaseSchema(prisma, { requireCoach = false } = {}) {
    return prisma.$transaction(async tx => {
        await readOnly(tx);
        const { expected, history, coachReady } = await releaseSchema(tx, requireCoach);
        return { ready: true, businessTables: expected.tables.length, appliedMigrations: history.rows.length, coachReady };
    }, { isolationLevel: 'RepeatableRead', timeout: 10000 });
}
// Counts only: no credentials, row IDs, migration logs or raw query output.
// current accepts exact v4 during handover; coach requires the exact expansion.
export async function releasePreflight(prisma, { phase = 'current' } = {}) {
    if (!['current', 'legacy', 'coach'].includes(phase)) throw new Error('Unknown schema phase');
    return prisma.$transaction(async tx => {
        await readOnly(tx);
        let expected, history, coachReady = false;
        if (phase !== 'legacy') ({ expected, history, coachReady } = await releaseSchema(tx, phase === 'coach'));
        else {
            expected = JSON.parse(await readFile(new URL('../audit/postgresql/declared-catalog.json', import.meta.url), 'utf8')).catalog;
            const source = await readFile(new URL('../audit/postgresql/catalog.sql', import.meta.url), 'utf8');
            await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog');
            const [row] = await tx.$queryRawUnsafe(source.slice(source.indexOf('WITH tables AS'), source.lastIndexOf('COMMIT;')));
            if (compareCatalog(expected, businessCatalog(Object.values(row)[0])).length) throw new Error('Schema mismatch: preflight rejected');
            history = await readMigrationHistory(tx);
        }
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
        return { ready: phase !== 'legacy', coachReady, phase, baseline: 'PROVISIONAL', counts, diagnostics: data,
            appliedMigrations: history.rows.length, pending: history.pending, catalog: { tables: expected.tables.length,
                columns: expected.columns.length, indexes: expected.indexes.length, foreignKeys: expected.foreignKeys.length, constraints: expected.constraints.length } };
    }, { isolationLevel: 'RepeatableRead', timeout: 40000 });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const url = process.env.NEXLIFT_RELEASE_DATABASE_URL;
    if (!url || !['current', 'legacy', 'coach'].includes(process.argv[2] || 'current')) { console.error('Explicit preflight URL and valid phase required'); process.exitCode = 1; }
    else {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient({ datasources: { db: { url } } });
        try { console.log(JSON.stringify(await releasePreflight(prisma, { phase: process.argv[2] || 'current' }))); }
        catch { console.error('Read-only preflight rejected; no repair performed'); process.exitCode = 1; }
        finally { await prisma.$disconnect(); }
    }
}
