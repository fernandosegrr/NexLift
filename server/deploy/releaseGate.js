// Preparation only: not imported by index.js or the production Dockerfile.
import { readFile } from 'node:fs/promises';
import { compareCatalog, loadDeclared } from '../audit/postgresql/audit-tools.mjs';
import { readMigrationHistory, migrationFiles } from '../src/services/migrationHistory.js';
import { BackupError } from '../src/services/backupFormat.js';
import { hasHistoryPersistence } from '../src/services/historyPersistence.js';

export function businessCatalog(catalog) {
    return Object.fromEntries(Object.entries(catalog).map(([key,rows])=>[key,rows.filter(r=>
        r.table!=='_prisma_migrations' && !(key==='tables' && r.name==='_prisma_migrations'))]));
}
export async function assertSchemaReady(prisma,{files,expected}={}) {
    expected ??= hasHistoryPersistence
        ? JSON.parse(await readFile(new URL('../audit/database/declared-catalog.json', import.meta.url), 'utf8')).catalog
        : loadDeclared().catalog;
    files ??= await migrationFiles();
    const source=await readFile(new URL('../audit/postgresql/catalog.sql',import.meta.url),'utf8');
    const query=source.slice(source.indexOf('WITH tables AS'),source.lastIndexOf('COMMIT;'));
    return prisma.$transaction(async tx=>{
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='30s'");
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
        await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog');
        const history=await readMigrationHistory(tx,{files,requireCurrent:true});
        const [row]=await tx.$queryRawUnsafe(query);
        const actual=Object.values(row)[0];
        const differences=compareCatalog(expected,businessCatalog(actual));
        if(differences.length) throw new BackupError('Esquema incompatible: readiness rechazada.',409);
        return {ready:true,businessTables:actual.tables.length-1,appliedMigrations:history.rows.length};
    },{isolationLevel:'RepeatableRead',timeout:40000});
}
export async function controlledRelease({prisma,migrate,start,files,expected}) {
    const result=await migrate();
    if(result!==0) throw new BackupError('Migración fallida: no se arranca la aplicación.',409);
    const readiness=await assertSchemaReady(prisma,{files,expected});
    return start(readiness);
}
