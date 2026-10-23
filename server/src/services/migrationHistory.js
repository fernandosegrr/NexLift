import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, BackupError, canonical } from './backupFormat.js';

export const migrationsDir = fileURLToPath(new URL('../../prisma/migrations/',import.meta.url));
export const migrationColumns = ['id','checksum','finished_at','migration_name','logs','rolled_back_at','started_at','applied_steps_count'];
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function migrationFiles(directory = migrationsDir) {
    const entries = await readdir(directory,{withFileTypes:true});
    const files = [];
    for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
        if (entry.isFile() && entry.name==='migration_lock.toml') continue;
        if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(entry.name)) throw new BackupError('Directorio de migraciones no reconocido.');
        const members = await readdir(path.join(directory,entry.name));
        if (members.length!==1 || members[0]!=='migration.sql') throw new BackupError('Artefactos de migración no reconocidos.');
        files.push({name:entry.name,checksum:digest(await readFile(path.join(directory,entry.name,'migration.sql')))});
    }
    if (!files.length) throw new BackupError('Falta el historial SQL versionado.');
    return files;
}
export async function readMigrationHistory(tx,{files,requireCurrent=false}={}) {
    files ??= await migrationFiles();
    const [table] = await tx.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    if (!table.present) {
        if (requireCurrent) throw new BackupError('Falta registrar el historial de migraciones.',409);
        return {present:false,rows:[],files,pending:files.map(f=>f.name)};
    }
    const columns=await tx.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='_prisma_migrations'`;
    if (columns.map(c=>c.column_name).sort().join()!==[...migrationColumns].sort().join()) throw new BackupError('Metadatos de migración con columnas incompatibles.',409);
    const rows=await tx.$queryRaw`SELECT id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count FROM public._prisma_migrations ORDER BY id`;
    const applied=new Set();
    for (const row of rows) {
        // Logs of failed migrations can contain SQL/secrets. Do not expose them.
        if (!row.finished_at || row.rolled_back_at || row.logs || applied.has(row.migration_name)
            || !files.some(f=>f.name===row.migration_name && f.checksum===row.checksum)) {
            throw new BackupError('Historial de migraciones inconsistente o incompatible con el código.',409);
        }
        applied.add(row.migration_name);
    }
    const pending=files.filter(f=>!applied.has(f.name)).map(f=>f.name);
    if (requireCurrent && pending.length) throw new BackupError('Hay migraciones requeridas pendientes.',409);
    return {present:true,rows,files,pending};
}
export async function classifyRecoverySchema(tx) {
    const tables=await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    const history=await readMigrationHistory(tx);
    const allowed=[...Object.keys(MODELS),...(history.present?['_prisma_migrations']:[])].sort();
    if (tables.map(t=>t.tablename).sort().join()!==allowed.join()) throw new BackupError('Esquema sin clasificar: no se generará un volcado potencialmente sensible.');
    const columns=await tx.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'`;
    const expected=Object.values(MODELS).flatMap(m=>m.fields.filter(f=>f.kind!=='object').map(f=>`${m.name}.${f.name}`));
    if (history.present) expected.push(...migrationColumns.map(c=>`_prisma_migrations.${c}`));
    if (columns.map(c=>`${c.table_name}.${c.column_name}`).sort().join()!==expected.sort().join()) throw new BackupError('Columnas sin clasificar: no se generará un volcado potencialmente sensible.');
    return history;
}
export async function historyManifest(tx,history) {
    if (!history.present) return null;
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    const [fingerprint]=await tx.$queryRaw`SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY t.id),'')) AS digest FROM (SELECT id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count FROM public._prisma_migrations) t`;
    return {...fingerprint,files:history.files,pending:history.pending};
}
export async function verifyHistoryCompatibility(history) {
    if (!history) return;
    if (!Number.isInteger(history.count) || history.count<0 || !/^[a-f0-9]{32}$/.test(history.digest || '')
        || canonical(history.files)!==canonical(await migrationFiles())) throw new BackupError('Respaldo incompatible con los archivos de migración del código.',409);
}
export function historyVerificationSQL(history) {
    if (!history) return `IF to_regclass('public._prisma_migrations') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected migration history'; END IF;`;
    if (!Number.isInteger(history.count) || !/^[a-f0-9]{32}$/.test(history.digest || '')) throw new BackupError('Manifiesto de historial inválido.');
    return `IF (SELECT count(*) FROM public._prisma_migrations) <> ${history.count} OR (SELECT md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY t.id),'')) FROM (SELECT id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count FROM public._prisma_migrations) t) <> '${history.digest}' THEN RAISE EXCEPTION 'Migration history recovery verification failed'; END IF;`;
}
