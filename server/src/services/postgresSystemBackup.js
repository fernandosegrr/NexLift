// Sensitive, complete application-database backup. Never used by portable JSON
// endpoints or Cloudinary. Invocation requires an explicit sensitive-data ack.
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { MODELS, fieldsFor, canonical, BackupError } from './backupFormat.js';
import { pg } from './postgresBackup.js';
import { classifyRecoverySchema, historyManifest, historyVerificationSQL, verifyHistoryCompatibility, migrationFiles, digest } from './migrationHistory.js';
import { assertExplicitTarget, assertEmptyTarget } from './postgresTarget.js';

const schemaPath=new URL('../../prisma/schema.prisma',import.meta.url);
const schemaHash=async()=>digest((await readFile(schemaPath,'utf8')).replaceAll('\r\n','\n'));
const acknowledge=value=>{ if(value!==true) throw new BackupError('El respaldo completo contiene credenciales y datos personales; requiere acknowledgeSensitive=true.',400); };
async function fullFingerprints(tx) {
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    const entries=[];
    for(const name of Object.keys(MODELS)) {
        const columns=fieldsFor(name).map(f=>`"${f.name}"`);
        // Full User includes authentication and operational fields deliberately.
        const select=name==='User' ? '*' : columns.join(',');
        const [row]=await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY t.id),'')) AS digest FROM (SELECT ${select} FROM public."${name}") t`);
        entries.push([name,row]);
    }
    return Object.fromEntries(entries);
}
async function operationJournal(tx) {
    const [table] = await tx.$queryRaw`SELECT to_regclass('nexlift_operations."IdempotencyRecord"') IS NOT NULL AS present`;
    if (!table.present) return null;
    const [row] = await tx.$queryRaw`SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY t."userId",t."operationId"),'')) AS digest
        FROM (SELECT * FROM nexlift_operations."IdempotencyRecord") t`;
    return row;
}
export async function dumpSystemPostgres({prisma,url,directory,bin,acknowledgeSensitive}) {
    acknowledge(acknowledgeSensitive);
    await assertExplicitTarget(prisma,url);
    await mkdir(directory,{recursive:false,mode:0o700});
    return prisma.$transaction(async tx=>{
        const history=await classifyRecoverySchema(tx);
        const [{snapshot}]=await tx.$queryRaw`SELECT pg_export_snapshot() AS snapshot`;
        const archive=path.join(directory,'system.dump');
        // No data exclusions; keeps credentials, push, operational state and
        // _prisma_migrations. Cluster roles are not part of a single-DB pg_dump.
        await pg('pg_dump',['--format=custom',`--snapshot=${snapshot}`,`--file=${archive}`],{bin,url});
        await chmod(archive,0o600);
        const manifest={version:1,kind:'NEXLIFT_SYSTEM_POSTGRES',sensitive:true,createdAt:new Date().toISOString(),
            schemaSha256:await schemaHash(),migrationFiles:await migrationFiles(),prismaClient:Prisma.prismaVersion.client,
            archiveSha256:digest(await readFile(archive)),entities:await fullFingerprints(tx),migrationHistory:await historyManifest(tx,history),
            operationJournal:await operationJournal(tx),
            restoreVerified:false,clusterRolesIncluded:false,externalMediaIncluded:false};
        await writeFile(path.join(directory,'system-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
        return manifest;
    },{isolationLevel:'RepeatableRead',timeout:120000,maxWait:10000});
}
export async function restoreSystemPostgres({prisma,url,directory,bin,acknowledgeSensitive}) {
    acknowledge(acknowledgeSensitive);
    const manifest=JSON.parse(await readFile(path.join(directory,'system-manifest.json'),'utf8'));
    if(manifest.kind!=='NEXLIFT_SYSTEM_POSTGRES' || manifest.version!==1 || manifest.sensitive!==true) throw new BackupError('Formato de respaldo completo no reconocido.');
    if(manifest.schemaSha256!==await schemaHash() || canonical(manifest.migrationFiles)!==canonical(await migrationFiles())) throw new BackupError('Respaldo incompatible con esta versión del código.',409);
    await verifyHistoryCompatibility(manifest.migrationHistory);
    const archive=path.join(directory,'system.dump');
    const archiveBytes=await readFile(archive);
    if(digest(archiveBytes)!==manifest.archiveSha256) throw new BackupError('Checksum del respaldo completo incorrecto.');
    await assertExplicitTarget(prisma,url);
    await assertEmptyTarget(prisma);
    const sections=[];
    for(const section of ['pre-data','data','post-data']) sections.push((await pg('pg_restore',['--no-owner','--no-acl',`--section=${section}`,'--file=-'],{bin,url,input:archiveBytes})).toString('utf8').replace(/^CREATE SCHEMA public;\r?$/m,'-- public exists on a fresh database'));
    const assertions=Object.keys(MODELS).map(name=>{
        const expected=manifest.entities?.[name];
        if(!Number.isInteger(expected?.count) || !/^[a-f0-9]{32}$/.test(expected?.digest || '')) throw new BackupError('Manifiesto del respaldo completo inválido.');
        const columns=name==='User' ? '*' : fieldsFor(name).map(f=>`"${f.name}"`).join(',');
        return `IF (SELECT count(*) FROM public."${name}") <> ${expected.count} OR (SELECT md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY t.id),'')) FROM (SELECT ${columns} FROM public."${name}") t) <> '${expected.digest}' THEN RAISE EXCEPTION 'Full recovery verification failed'; END IF;`;
    }).join('\n')+'\n'+historyVerificationSQL(manifest.migrationHistory);
    let journalVerification = '';
    if (manifest.operationJournal) {
        const { count, digest: journalDigest } = manifest.operationJournal;
        if (!Number.isInteger(count) || count < 0 || !/^[a-f0-9]{32}$/.test(journalDigest || '')) throw new BackupError('Manifiesto de comprobantes inválido.');
        journalVerification = `IF (SELECT count(*) FROM nexlift_operations."IdempotencyRecord") <> ${count} OR
          (SELECT md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY t."userId",t."operationId"),'')) FROM (SELECT * FROM nexlift_operations."IdempotencyRecord") t)
          <> '${journalDigest}' THEN RAISE EXCEPTION 'Operation journal recovery verification failed'; END IF;`;
    }
    const script=`BEGIN;\nSET standard_conforming_strings=on;\nSET TIME ZONE 'UTC';\n${sections.join('\n')}\nDO $$ BEGIN ${assertions}\n${journalVerification} END $$;\nCOMMIT;\n`;
    await pg('psql',['-X','--set=ON_ERROR_STOP=1','--file=-'],{bin,url,input:script});
    return {ok:true,sensitive:true,credentialsRestored:true,migrationHistoryRestored:!!manifest.migrationHistory,verified:true};
}
