// The only entry for migration rehearsals. Creates its OWN new PostgreSQL
// cluster, never reads .env or accepts external database arguments.
import { spawnSync } from 'node:child_process';
import { mkdtempSync,realpathSync,rmSync,existsSync,readFileSync,cpSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { serverDir,cleanEnvironment,runPg } from '../audit/postgresql/audit-tools.mjs';
import { digest } from '../src/services/migrationHistory.js';

if(process.argv.length!==2) throw new Error('No arguments or external connection URLs are accepted.');
const versions=Object.fromEntries(['prisma','@prisma/client'].map(n=>[n,JSON.parse(readFileSync(path.join(serverDir,'node_modules',n,'package.json'),'utf8')).version]));
if(versions.prisma!=='6.19.3' || versions['@prisma/client']!=='6.19.3') throw new Error('This rehearsal requires aligned Prisma 6.19.3 packages.');
const tempRoot=realpathSync(tmpdir());
const root=mkdtempSync(path.join(tempRoot,'nexlift-baseline-tests-'));
const data=path.join(root,'data');
const work=path.join(root,'work');
mkdirSync(work);
cpSync(path.join(serverDir,'prisma'),path.join(work,'prisma'),{recursive:true});
const probe=net.createServer();
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
let started=false;
try {
    const offline=spawnSync(process.execPath,[path.join(serverDir,'node_modules/prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema-datamodel',path.join(work,'prisma/schema.prisma'),'--script'],{
        cwd:work,windowsHide:true,encoding:'utf8',env:{...cleanEnvironment(),DATABASE_URL:'',PRISMA_HIDE_UPDATE_MESSAGE:'1',CHECKPOINT_DISABLE:'1'}
    });
    if(offline.status!==0) throw new Error('Offline schema diff failed.');
    const baseline=readFileSync(path.join(work,'prisma/migrations/0_init/migration.sql'),'utf8');
    const ddl=s=>s.replace(/^--[^\n]*\n/gm,'').replace(/\r/g,'').trim();
    if(ddl(baseline)!==ddl(offline.stdout)) throw new Error('Baseline differs from current declared schema; stop rehearsal.');
    if(/(?:^|;)\s*(DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b/i.test(ddl(baseline))) throw new Error('Unexpected destructive baseline SQL.');
    const manifest=JSON.parse(readFileSync(path.join(serverDir,'audit/postgresql/baseline-manifest.json'),'utf8'));
    if(manifest.classification!=='PROVISIONAL' || manifest.baselineSha256!==digest(Buffer.from(baseline))) throw new Error('Baseline review manifest/checksum does not match.');
    runPg('initdb',['-D',data,'-U','nexlift_baseline_test','--auth=trust','--no-locale','--encoding=UTF8']);
    runPg('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],{stdio:'ignore'});
    started=true;
    const result=spawnSync(process.execPath,['--test','--test-reporter=spec','test/baseline.integration.test.js'],{
        cwd:serverDir,windowsHide:true,stdio:'inherit',env:{...cleanEnvironment(),
            NEXLIFT_BASELINE_TEST_PORT:String(port),NEXLIFT_BASELINE_TEST_ROOT:root,NODE_ENV:'test',
            DATABASE_URL:'',OPENAI_API_KEY:'',CLOUDINARY_CLOUD_NAME:'',CLOUDINARY_API_KEY:'',CLOUDINARY_API_SECRET:''}
    });
    if(result.error) throw result.error;
    process.exitCode=result.status ?? 1;
} finally {
    if(started || existsSync(path.join(data,'postmaster.pid'))) runPg('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    const resolved=realpathSync(root);
    if(path.dirname(resolved)===tempRoot && path.basename(resolved).startsWith('nexlift-baseline-tests-')) rmSync(resolved,{recursive:true,force:true});
    else {process.stderr.write('Unsafe cleanup path; no removal attempted.\n');process.exitCode=1;}
}
