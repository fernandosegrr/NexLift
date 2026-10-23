import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {Prisma} from '@prisma/client';
import {root,work,bin,create,migrate,catalog,rows,history,physical,closeAll} from './fixtures/baseline-environment.js';
import {MODELS,delegate} from '../src/services/backupFormat.js';
import {seedBackupFixture} from './fixtures/backup-fixture.js';
import {loadDeclared,compareCatalog,serverDir} from '../audit/postgresql/audit-tools.mjs';
import {migrationFiles,readMigrationHistory} from '../src/services/migrationHistory.js';
import {dumpPostgres,restorePostgres} from '../src/services/postgresBackup.js';
import {dumpSystemPostgres,restoreSystemPostgres} from '../src/services/postgresSystemBackup.js';
import {exportBackup} from '../src/services/backupExport.js';
import {assertSchemaReady,controlledRelease,businessCatalog} from '../deploy/releaseGate.js';
import {startChecked} from '../deploy/start-checked.mjs';

let a,b,original,oldPhysical,legacyFull,legacySafe,metaFull,metaSafe;
const options=t=>({prisma:t.prisma,url:t.url,bin,acknowledgeSensitive:true});
const succeeded=result=>assert.equal(result.status,0,'Isolated Prisma command must succeed; connection output suppressed.');
const empty=async t=>assert.equal((await t.prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length,0);
before(async()=>{
    a=await create('nexlift_baseline_a',{legacy:true,seed:true});
    b=await create('nexlift_baseline_b');
    original=await rows(a);oldPhysical=await physical(a);
    assert.deepEqual(compareCatalog(loadDeclared().catalog,catalog(a)),[]);
    legacyFull=path.join(root,'legacy-full');legacySafe=path.join(root,'legacy-safe');
    await dumpSystemPostgres({...options(a),directory:legacyFull});
    await dumpPostgres({...options(a),directory:legacySafe});
});
after(closeAll);

test('CLI, dependency lock and generated client are aligned to Prisma 6.19.3',async()=>{
    const pkg=JSON.parse(await readFile(path.join(serverDir,'package.json'),'utf8'));
    const lock=JSON.parse(await readFile(path.join(serverDir,'package-lock.json'),'utf8'));
    assert.equal(pkg.dependencies['@prisma/client'],'6.19.3');assert.equal(pkg.devDependencies.prisma,'6.19.3');
    for(const name of ['prisma','@prisma/client']) assert.equal(lock.packages[`node_modules/${name}`].version,'6.19.3');
    assert.equal(Prisma.prismaVersion.client,'6.19.3');
});
test('legacy A contains representative rows of all 17 models and no migration history',async()=>{
    assert.equal(Object.keys(original).length,17);
    assert.ok(Object.values(original).every(list=>list.length>0));
    assert.equal((await readMigrationHistory(a.prisma)).present,false);
    assert.equal(catalog(a).columns.length,155);
    assert.equal(catalog(a).foreignKeys.length,18);
    assert.equal(catalog(a).indexes.length,48);
});
test('B is reconstructed by real migrate deploy and structurally matches legacy A',async()=>{
    await empty(b);succeeded(migrate(b,'deploy'));
    assert.deepEqual(compareCatalog(catalog(a),businessCatalog(catalog(b))),[]);
    await seedBackupFixture(b.prisma);
    assert.deepEqual(await rows(b),original);
});
test('A resolves baseline only after structural equivalence and preserves every physical table and row',async()=>{
    assert.deepEqual(compareCatalog(catalog(a),businessCatalog(catalog(b))),[]);
    succeeded(migrate(a,'resolve',['--applied','0_init']));
    assert.deepEqual(await physical(a),oldPhysical);
    assert.deepEqual(await rows(a),original);
    const files=await migrationFiles();
    for(const t of [a,b]) {
        const h=await history(t);assert.equal(h.length,1);assert.equal(h[0].migration_name,'0_init');
        assert.equal(h[0].checksum,files[0].checksum);assert.ok(h[0].finished_at);assert.equal(h[0].rolled_back_at,null);assert.ok(h[0].logs===null || h[0].logs==='');
    }
});
test('status succeeds and repeated deploy never reapplies baseline or changes IDs, rows, storage or history',async()=>{
    for(const t of [a,b]) {
        const saved=await rows(t),ids=await physical(t),meta=await history(t);
        succeeded(migrate(t,'status'));succeeded(migrate(t,'deploy'));succeeded(migrate(t,'deploy'));
        assert.deepEqual(await rows(t),saved);assert.deepEqual(await physical(t),ids);assert.deepEqual(await history(t),meta);
    }
});
test('backup after resolve accepts classified migration metadata in both recovery formats',async()=>{
    metaFull=path.join(root,'meta-full');metaSafe=path.join(root,'meta-safe');
    const full=await dumpSystemPostgres({...options(a),directory:metaFull});
    const safe=await dumpPostgres({...options(a),directory:metaSafe});
    assert.equal(full.migrationHistory.count,1);assert.equal(safe.migrationHistory.count,1);
    assert.equal(full.sensitive,true);assert.equal(safe.credentialRecovery,'RESET_REQUIRED');
    assert.equal(full.restoreVerified,false);
});
for(const [label,getDirectory,hasHistory] of [['legacy',()=>legacyFull,false],['baseline',()=>metaFull,true]]) test(`full ${label} recovery preserves all models, credentials, push, IDs and exact migration rows`,async()=>{
    const t=await create(`nexlift_baseline_full_${label}`);
    const result=await restoreSystemPostgres({...options(t),directory:getDirectory()});
    assert.equal(result.credentialsRestored,true);assert.equal(result.migrationHistoryRestored,hasHistory);
    assert.deepEqual(await rows(t),original);
    assert.deepEqual(compareCatalog(businessCatalog(catalog(a)),businessCatalog(catalog(t))),[]);
    if(hasHistory) {assert.deepEqual(await history(t),await history(a));succeeded(migrate(t,'status'));succeeded(migrate(t,'deploy'));assert.deepEqual(await rows(t),original);}
    else assert.equal((await readMigrationHistory(t.prisma)).present,false);
});
for(const [label,getDirectory,hasHistory] of [['legacy',()=>legacySafe,false],['baseline',()=>metaSafe,true]]) test(`sanitized ${label} recovery keeps sport data and migration metadata while excluding credentials and push`,async()=>{
    const t=await create(`nexlift_baseline_safe_${label}`);
    const result=await restorePostgres({...options(t),directory:getDirectory()});assert.equal(result.requiresCredentialReset,true);
    assert.deepEqual((await exportBackup(t.prisma,'A')).data,(await exportBackup(a.prisma,'A')).data);
    assert.equal(await t.prisma.pushSubscription.count(),0);assert.equal(await t.prisma.pendingReminder.count(),0);
    assert.equal((await t.prisma.user.findUnique({where:{id:'A'}})).passwordHash,'!NEXLIFT_CREDENTIALS_EXCLUDED!');
    if(hasHistory) assert.deepEqual(await history(t),await history(a));
    else assert.equal((await readMigrationHistory(t.prisma)).present,false);
});
test('portable JSON after baseline never exports migration internals or secrets',async()=>{
    const json=JSON.stringify(await exportBackup(a.prisma,'A'));
    for(const value of ['_prisma_migrations','passwordHash','SYNTHETIC_PASSWORD_HASH','PUSH_AUTH_SECRET','PUSH_KEY_SECRET']) assert.ok(!json.includes(value));
});
for(const model of Object.values(MODELS)) for(const rel of model.fields.filter(f=>f.relationFromFields?.length)) test(`baseline FK preserves referential integrity: ${model.name}.${rel.relationFromFields[0]}`,async()=>{
    const row=await a.prisma[delegate(model.name)].findFirst();
    const field=rel.relationFromFields[0];
    await assert.rejects(a.prisma.$executeRawUnsafe(`UPDATE "${model.name}" SET "${field}"=$1 WHERE id=$2`,'synthetic-missing-parent',row.id),e=>e.meta?.code==='23503');
    assert.deepEqual(await rows(a),original);
});
test('full backup requires explicit acknowledgement before any database call',async()=>{
    await assert.rejects(dumpSystemPostgres({prisma:null,url:null,directory:root}),/acknowledgeSensitive/);
    await assert.rejects(restoreSystemPostgres({prisma:null,url:null,directory:root}),/acknowledgeSensitive/);
});
test('full restore refuses a nonempty destination without changing its data',async()=>{
    await assert.rejects(restoreSystemPostgres({...options(b),directory:metaFull}),e=>e.status===409);
    assert.deepEqual(await rows(b),original);
});
test('different Prisma client and libpq target are rejected before writes',async()=>{
    await assert.rejects(restoreSystemPostgres({...options(b),url:a.url,directory:metaFull}),e=>e.status===409);
    assert.deepEqual(await rows(a),original);assert.deepEqual(await rows(b),original);
});
test('corrupt archive is detected before restoring any tables',async()=>{
    const copy=path.join(root,'corrupt-full');await cp(metaFull,copy,{recursive:true});
    await writeFile(path.join(copy,'system.dump'),'synthetic corruption');
    const t=await create('nexlift_baseline_corrupt');
    await assert.rejects(restoreSystemPostgres({...options(t),directory:copy}),/Checksum/);await empty(t);
});
test('backup from incompatible code migration files is rejected before any DDL',async()=>{
    const copy=path.join(root,'wrong-code');await cp(metaFull,copy,{recursive:true});
    const file=path.join(copy,'system-manifest.json'),m=JSON.parse(await readFile(file,'utf8'));m.migrationFiles[0].checksum='0'.repeat(64);await writeFile(file,JSON.stringify(m));
    const t=await create('nexlift_baseline_wrong_code');
    await assert.rejects(restoreSystemPostgres({...options(t),directory:copy}),e=>e.status===409);await empty(t);
});
test('history verification failure rolls back schema and every restored sensitive row',async()=>{
    const copy=path.join(root,'wrong-history');await cp(metaFull,copy,{recursive:true});
    const file=path.join(copy,'system-manifest.json'),m=JSON.parse(await readFile(file,'utf8'));m.migrationHistory.digest='0'.repeat(32);await writeFile(file,JSON.stringify(m));
    const t=await create('nexlift_baseline_wrong_history');
    await assert.rejects(restoreSystemPostgres({...options(t),directory:copy}),/psql/);await empty(t);
    await writeFile(file,await readFile(path.join(metaFull,'system-manifest.json')));
    await restoreSystemPostgres({...options(t),directory:copy});assert.deepEqual(await rows(t),original);assert.deepEqual(await history(t),await history(a));
});
test('clean history and schema pass a read-only readiness gate',async()=>{
    const beforeRows=await rows(a),beforeHistory=await history(a);
    assert.deepEqual(await assertSchemaReady(a.prisma),{ready:true,businessTables:17,appliedMigrations:1});
    assert.deepEqual(await rows(a),beforeRows);assert.deepEqual(await history(a),beforeHistory);
});
test('checksum mismatch blocks readiness and backup without exposing migration logs',async()=>{
    const saved=(await history(a))[0];
    await a.prisma.$executeRaw`UPDATE public._prisma_migrations SET checksum=${'0'.repeat(64)} WHERE id=${saved.id}`;
    try {
        await assert.rejects(assertSchemaReady(a.prisma),/inconsistente/);
        await assert.rejects(dumpSystemPostgres({...options(a),directory:path.join(root,'rejected-history')}),/inconsistente/);
    } finally {await a.prisma.$executeRaw`UPDATE public._prisma_migrations SET checksum=${saved.checksum} WHERE id=${saved.id}`;}
});
test('drift blocks startup even when migrate deploy reports no pending migrations',async()=>{
    let started=false;
    await b.prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" ALTER COLUMN weekday SET DEFAULT 0');
    try {
        await assert.rejects(controlledRelease({prisma:b.prisma,migrate:async()=>migrate(b,'deploy').status,start:async()=>{started=true;}}),/incompatible/);
        assert.equal(started,false);assert.deepEqual(await rows(b),original);
    } finally {await b.prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" ALTER COLUMN weekday DROP DEFAULT');}
});
test('real failed migration leaves failed history and never starts the rehearsal application',async()=>{
    const directory=path.join(root,'failed-release');await cp(work,directory,{recursive:true});
    await mkdir(path.join(directory,'prisma/migrations/1_failure'));
    await writeFile(path.join(directory,'prisma/migrations/1_failure/migration.sql'),'BEGIN;\nSELECT 1/0;\nCOMMIT;\n');
    const t=await create('nexlift_baseline_failed_release');let started=false;
    await assert.rejects(controlledRelease({prisma:t.prisma,migrate:async()=>migrate(t,'deploy',[],directory).status,start:async()=>{started=true;}}),/no se arranca/);
    assert.equal(started,false);assert.notEqual(migrate(t,'status',[],directory).status,0);
    assert.ok((await history(t)).some(h=>h.migration_name==='1_failure' && !h.finished_at));
    await assert.rejects(assertSchemaReady(t.prisma),/inconsistente/);
    await assert.rejects(dumpSystemPostgres({...options(t),directory:path.join(root,'failed-history-backup')}),/inconsistente/);
});
test('controlled release serves a rehearsal readiness endpoint only after successful deploy and verification',async()=>{
    let server;
    try {
        const result=await controlledRelease({prisma:b.prisma,migrate:async()=>migrate(b,'deploy').status,start:async ready=>{
            server=http.createServer(async(req,res)=>{try {const state=await assertSchemaReady(b.prisma);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(state));}catch{res.statusCode=503;res.end();}});
            await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return ready;
        }});
        assert.equal(result.ready,true);
        const response=await fetch(`http://127.0.0.1:${server.address().port}/readyz`);assert.equal(response.status,200);assert.equal((await response.json()).ready,true);
        await b.prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" ALTER COLUMN weekday SET DEFAULT 0');
        try {assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/readyz`)).status,503);}
        finally {await b.prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" ALTER COLUMN weekday DROP DEFAULT');}
    } finally {if(server) await new Promise(resolve=>server.close(resolve));}
});
test('alternative startup rejects missing or legacy history and never calls the application',async()=>{
    let started=false;
    await assert.rejects(startChecked({start:()=>{started=true;}}),/destino/);
    const t=await create('nexlift_baseline_unmarked',{legacy:true,seed:true});
    const beforeRows=await rows(t);
    await assert.rejects(startChecked({url:t.url,start:()=>{started=true;}}),/historial/);
    assert.equal(started,false);assert.deepEqual(await rows(t),beforeRows);
});
test('alternative startup verifies schema and then calls the rehearsal application without DDL',async()=>{
    const beforeRows=await rows(b),beforeHistory=await history(b);
    assert.equal(await startChecked({url:b.url,start:()=>42}),42);
    assert.deepEqual(await rows(b),beforeRows);assert.deepEqual(await history(b),beforeHistory);
});
test('container readiness command returns success or failure without printing connection details',()=>{
    const run=url=>spawnSync(process.execPath,['deploy/readiness-check.mjs'],{cwd:serverDir,windowsHide:true,encoding:'utf8',env:{...process.env,DATABASE_URL:'',NEXLIFT_RELEASE_DATABASE_URL:url}});
    const success=run(b.url);assert.equal(success.status,0);assert.equal(success.stdout.trim(),'ready');
    const failure=run('');assert.equal(failure.status,1);assert.ok(!failure.stderr.includes('postgresql:'));
});
test('legacy sanitized bundles without migrationHistory remain recoverable',async()=>{
    const copy=path.join(root,'old-format');await cp(legacySafe,copy,{recursive:true});
    const file=path.join(copy,'manifest.json'),m=JSON.parse(await readFile(file,'utf8'));delete m.migrationHistory;await writeFile(file,JSON.stringify(m));
    const t=await create('nexlift_baseline_old_format');
    await restorePostgres({...options(t),directory:copy});
    assert.deepEqual((await exportBackup(t.prisma,'A')).data,(await exportBackup(a.prisma,'A')).data);
    assert.equal((await readMigrationHistory(t.prisma)).present,false);
});
test('sanitized history mismatch also rolls back schema, account and migration metadata',async()=>{
    const copy=path.join(root,'safe-mismatch');await cp(metaSafe,copy,{recursive:true});
    const file=path.join(copy,'manifest.json'),m=JSON.parse(await readFile(file,'utf8'));m.migrationHistory.digest='0'.repeat(32);await writeFile(file,JSON.stringify(m));
    const t=await create('nexlift_baseline_safe_mismatch');
    await assert.rejects(restorePostgres({...options(t),directory:copy}),/psql/);await empty(t);
});
test('complete recovery CLI uses its explicit disposable URL and prints no sensitive manifest',async()=>{
    const directory=path.join(root,'cli-full');
    const run=(action,t)=>spawnSync(process.execPath,['postgres-recovery.mjs',action,directory,'--acknowledge-sensitive'],{
        cwd:serverDir,windowsHide:true,encoding:'utf8',env:{...process.env,
            DATABASE_URL:'postgresql://unused@127.0.0.1:1/never_use',NEXLIFT_RECOVERY_DATABASE_URL:t.url,NEXLIFT_TEST_PG_BIN:bin}
    });
    const dump=run('system-dump',a);assert.equal(dump.status,0);assert.equal(JSON.parse(dump.stdout).ok,true);
    const t=await create('nexlift_baseline_cli_restore');
    const restore=run('system-restore',t);assert.equal(restore.status,0);assert.equal(JSON.parse(restore.stdout).verified,true);
    for(const output of [dump.stdout,dump.stderr,restore.stdout,restore.stderr]) {
        for(const forbidden of ['postgresql://','SYNTHETIC_PASSWORD_HASH','PUSH_AUTH_SECRET','migrationHistory','entities']) assert.ok(!output.includes(forbidden));
    }
    assert.deepEqual(await rows(t),original);assert.deepEqual(await history(t),await history(a));
});
