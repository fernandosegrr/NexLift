import assert from 'node:assert/strict';
import { readFileSync,realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { serverDir,cleanEnvironment,runPg,inspectSql } from '../../audit/postgresql/audit-tools.mjs';
import { MODELS,delegate,jsonCopy } from '../../src/services/backupFormat.js';
import { seedBackupFixture } from './backup-fixture.js';

export const root=process.env.NEXLIFT_BASELINE_TEST_ROOT;
export const port=process.env.NEXLIFT_BASELINE_TEST_PORT;
if(!root || !port || !/^\d+$/.test(port)) throw new Error('Disposable runner required.');
const resolved=realpathSync(root);
if(path.dirname(resolved)!==realpathSync(tmpdir()) || !path.basename(resolved).startsWith('nexlift-baseline-tests-')) throw new Error('Disposable runner root required.');
const pid=readFileSync(path.join(root,'data/postmaster.pid'),'utf8').split(/\r?\n/);
if(pid[3]!==port || realpathSync(pid[1])!==realpathSync(path.join(root,'data'))) throw new Error('Fresh cluster identity check failed.');
export const work=path.join(root,'work');
export const bin=process.env.NEXLIFT_TEST_PG_BIN || (process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'');
const clients=[];
export function target(name) {
    if(!/^nexlift_baseline_[a-z0-9_]+$/.test(name)) throw new Error('Unexpected test database name');
    const url=`postgresql://nexlift_baseline_test@127.0.0.1:${port}/${name}`;
    const prisma=new PrismaClient({datasources:{db:{url}}});clients.push(prisma);
    return {name,url,prisma,args:['-h','127.0.0.1','-p',port,'-U','nexlift_baseline_test','-d',name]};
}
export async function create(name,{legacy=false,seed=false}={}) {
    const t=target(name);
    runPg('createdb',['-h','127.0.0.1','-p',port,'-U','nexlift_baseline_test',name]);
    if(legacy) runPg('psql',['-X','-w','-q','-v','ON_ERROR_STOP=1',...t.args,'-1','-f',path.join(serverDir,'audit/postgresql/declared-schema.sql')]);
    if(seed) await seedBackupFixture(t.prisma);
    return t;
}
export function migrate(t,action,extra=[],directory=work) {
    assert.ok(['deploy','resolve','status'].includes(action));
    // Generated URL ONLY. Never use the inherited DATABASE_URL.
    const result=spawnSync(process.execPath,[path.join(serverDir,'node_modules/prisma/build/index.js'),'migrate',action,'--schema',path.join(directory,'prisma/schema.prisma'),...extra],{
        cwd:directory,encoding:'utf8',windowsHide:true,env:{...cleanEnvironment(),DATABASE_URL:t.url,PRISMA_HIDE_UPDATE_MESSAGE:'1',CHECKPOINT_DISABLE:'1'}
    });
    if(result.error) throw new Error('Local Prisma executable failed');
    return result;
}
export const catalog=t=>inspectSql('catalog.sql',{args:t.args})[0];
export const rows=async t=>Object.fromEntries(await Promise.all(Object.keys(MODELS).map(async name=>[name,jsonCopy(await t.prisma[delegate(name)].findMany({orderBy:{id:'asc'}}))])));
export const history=async t=>jsonCopy(await t.prisma.$queryRaw`SELECT * FROM public._prisma_migrations ORDER BY id`);
export const physical=async t=>jsonCopy(await t.prisma.$queryRaw`SELECT c.relname,c.oid::text AS oid,c.relfilenode::text AS storage FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations' ORDER BY c.relname`);
export const closeAll=()=>Promise.all(clients.map(c=>c.$disconnect()));
