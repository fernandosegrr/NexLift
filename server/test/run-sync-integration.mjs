// Creates its own native PostgreSQL cluster. No .env or external URL accepted.
import { mkdtemp, realpath, rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { serverDir, runPg } from '../audit/postgresql/audit-tools.mjs';
import { cleanStageEnvironment } from '../staging/environment.mjs';
import { freePort, protectDirectory } from '../staging/local.mjs';

if (process.argv.length !== 2) throw new Error('No external arguments accepted');
const parent = await realpath(tmpdir()), root = await mkdtemp(path.join(parent, 'nexlift-operation-tests-'));
await protectDirectory(root);
const data = path.join(root, 'data'), work = path.join(root, 'work'), port = await freePort();
const marker = `NEXLIFT_PHASE31_DISPOSABLE:${randomUUID()}`;
const env = { ...cleanStageEnvironment(), NODE_ENV: 'test', DATABASE_URL: '', NEXLIFT_SYNC_TEST: 'true',
    NEXLIFT_OPS_TEST_ROOT: root, NEXLIFT_OPS_TEST_PORT: String(port), NEXLIFT_OPS_TEST_MARKER: marker,
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
let started = false;
async function cleanup() {
    const actual = await realpath(root);
    if (path.dirname(actual) !== parent || !path.basename(actual).startsWith('nexlift-operation-tests-')) throw new Error('Unsafe cleanup path');
    await rm(actual, { recursive: true, force: true });
}
try {
    await mkdir(work); await cp(path.join(serverDir, 'prisma'), path.join(work, 'prisma'), { recursive: true });
    runPg('initdb', ['-D', data, '-U', 'nexlift_ops_test', '--auth=trust', '--no-locale', '--encoding=UTF8'], { env });
    runPg('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { env, stdio: 'ignore' });
    started = true;
    for (const name of ['nexlift_ops_test_empty', 'nexlift_ops_test_missing']) {
        runPg('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'nexlift_ops_test', name], { env });
        const db = new PrismaClient({ datasources: { db: { url: `postgresql://nexlift_ops_test@127.0.0.1:${port}/${name}` } } });
        try {
            env.NEXLIFT_OPS_TEST_SYSTEM_ID = (await db.$queryRaw`SELECT system_identifier::text AS id FROM pg_control_system()`)[0].id;
            await db.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
            await db.$executeRawUnsafe(`ALTER DATABASE "${name}" SET nexlift.phase31_disposable TO '${marker}'`);
        } finally { await db.$disconnect(); }
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'test/sync.integration.test.js'], {
        cwd: serverDir, windowsHide: true, env, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, timeout: 240000 });
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exitCode = result.status ?? 1;
    if (result.status === 0) {
        await mkdir(path.join(serverDir, 'audit/sync'), { recursive: true });
        await writeFile(path.join(serverDir, 'audit/sync/integration-evidence.json'), await readFile(path.join(root, 'sync-evidence.json')));
    }
} finally {
    if (started || existsSync(path.join(data, 'postmaster.pid'))) runPg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { env, stdio: 'ignore' });
    await cleanup();
}
