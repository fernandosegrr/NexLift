// Creates its own native PostgreSQL cluster. No .env or external URL accepted.
import { mkdtemp, realpath, rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { serverDir, runPg } from '../audit/postgresql/audit-tools.mjs';
import { cleanStageEnvironment } from '../staging/environment.mjs';
import { freePort, protectDirectory } from '../staging/local.mjs';
import { hasHistoryPersistence } from '../src/services/historyPersistence.js';

if (process.argv.length !== 2) throw new Error('No external arguments accepted');
const parent = await realpath(tmpdir()), root = await mkdtemp(path.join(parent, 'nexlift-stabilization-tests-'));
await protectDirectory(root);
const data = path.join(root, 'data'), work = path.join(root, 'work'), port = await freePort();
const marker = `NEXLIFT_PHASE31_DISPOSABLE:${randomUUID()}`;
const env = { ...cleanStageEnvironment(), NODE_ENV: 'test', DATABASE_URL: '', NEXLIFT_SYNC_TEST: 'true',
    NEXLIFT_OPS_TEST_ROOT: root, NEXLIFT_OPS_TEST_PORT: String(port), NEXLIFT_OPS_TEST_MARKER: marker,
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
if (process.env.NEXLIFT_TEST_TRANSPORT === 'fastify') env.NEXLIFT_TEST_TRANSPORT = 'fastify';
if (hasHistoryPersistence) {
    const id = randomUUID().replaceAll('-', '');
    env.NEXLIFT_PHASE6_OFFLINE_A = `nexlift_ops_test_phase6_${id}_a`;
    env.NEXLIFT_PHASE6_OFFLINE_B = `nexlift_ops_test_phase6_${id}_b`;
}
let started = false;
async function cleanup() {
    const actual = await realpath(root);
    if (path.dirname(actual) !== parent || !path.basename(actual).startsWith('nexlift-stabilization-tests-')) throw new Error('Unsafe cleanup path');
    await rm(actual, { recursive: true, force: true });
}
try {
    await mkdir(work); await cp(path.join(serverDir, 'prisma'), path.join(work, 'prisma'), { recursive: true });
    runPg('initdb', ['-D', data, '-U', 'nexlift_ops_test', '--auth=trust', '--no-locale', '--encoding=UTF8'], { env });
    runPg('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { env, stdio: 'ignore' });
    started = true;
    for (const name of hasHistoryPersistence ? [env.NEXLIFT_PHASE6_OFFLINE_A, env.NEXLIFT_PHASE6_OFFLINE_B] : ['nexlift_ops_test_empty', 'nexlift_ops_test_missing']) {
        runPg('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'nexlift_ops_test', name], { env });
        const db = new PrismaClient({ datasources: { db: { url: `postgresql://nexlift_ops_test@127.0.0.1:${port}/${name}` } } });
        try {
            env.NEXLIFT_OPS_TEST_SYSTEM_ID = (await db.$queryRaw`SELECT system_identifier::text AS id FROM pg_control_system()`)[0].id;
            await db.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
            await db.$executeRawUnsafe(`ALTER DATABASE "${name}" SET nexlift.phase31_disposable TO '${marker}'`);
            if (hasHistoryPersistence) await db.$executeRawUnsafe(`ALTER DATABASE "${name}" SET nexlift.phase6_disposable TO '${marker}'`);
        } finally { await db.$disconnect(); }
    }
    const status = await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,['--test','--test-reporter=spec','test/stabilization.integration.test.js'],{cwd:serverDir,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
        child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on('error',reject);child.on('exit',code=>resolve(code));
    });
    process.exitCode=status ?? 1;
    if (status === 0) {
        const output = path.join(serverDir, env.NEXLIFT_TEST_TRANSPORT === 'fastify' ? 'audit/backend' : hasHistoryPersistence ? 'audit/database' : 'audit/offline');
        await mkdir(output, { recursive: true });
        await writeFile(path.join(output, env.NEXLIFT_TEST_TRANSPORT === 'fastify' ? 'fastify-offline-evidence.json' : hasHistoryPersistence ? 'offline-current-evidence.json' : 'integration-evidence.json'), await readFile(path.join(root, 'stabilization-evidence.json')));
    }
} finally {
    if (started || existsSync(path.join(data, 'postmaster.pid'))) runPg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { env, stdio: 'ignore' });
    await cleanup();
}
