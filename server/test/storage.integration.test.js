import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { serverDir, runPg } from '../audit/postgresql/audit-tools.mjs';
import { seedBackupFixture } from './fixtures/backup-fixture.js';
import { runStorageBrowser } from './fixtures/storage-browser.mjs';

const root = process.env.NEXLIFT_OPS_TEST_ROOT, port = process.env.NEXLIFT_OPS_TEST_PORT;
if (!process.env.NEXLIFT_SYNC_TEST || path.dirname(await realpath(root)) !== await realpath(tmpdir()) || !path.basename(root).startsWith('nexlift-storage-tests-')) throw new Error('Disposable runner required');
const pid = (await readFile(path.join(root, 'data/postmaster.pid'), 'utf8')).split(/\r?\n/);
assert.equal(pid[3], port); assert.equal(await realpath(pid[1]), await realpath(path.join(root, 'data')));
const url = name => `postgresql://nexlift_ops_test@127.0.0.1:${port}/nexlift_ops_test_${name}`;
const db = new PrismaClient({ datasources: { db: { url: url('empty') } } });
let child, base;
let browserEvidence;
const token = user => jwt.sign({ userId: user, tokenVersion: 0 }, 'synthetic-sync-jwt');
const counts = async () => ({ logs: await db.workoutLog.count(), sets: await db.setLog.count(), rest: await db.restLog.count(),
    receipts: (await db.$queryRaw`SELECT count(*)::int AS n FROM nexlift_operations."IdempotencyRecord"`)[0].n });
async function start(name = 'empty') {
    child = spawn(process.execPath, ['test/fixtures/sync-http.mjs'], { cwd: serverDir, windowsHide: true,
        env: { ...process.env, NEXLIFT_OPS_TEST_URL: url(name) }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const errors = []; child.stderr.on('data', chunk => errors.push(chunk));
    const [message] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(Buffer.concat(errors).toString()); })]);
    base = `http://127.0.0.1:${message.port}/api`;
}
async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.send('stop'); await done; } }
async function fault(value) { const changed = once(child, 'message'); child.send({ fault: value }); assert.equal((await changed)[0].fault, value); }
before(async () => {
    assert.equal((await db.$queryRaw`SELECT system_identifier::text AS id FROM pg_control_system()`)[0].id, process.env.NEXLIFT_OPS_TEST_SYSTEM_ID);
    assert.equal((await db.$queryRaw`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)[0].marker, process.env.NEXLIFT_OPS_TEST_MARKER);
    const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(root, 'work/prisma/schema.prisma')], {
        cwd: serverDir, env: { ...process.env, DATABASE_URL: url('empty') }, windowsHide: true, encoding: 'utf8', timeout: 60000 });
    assert.equal(migrated.status, 0, migrated.stderr);
    const args = ['-h', '127.0.0.1', '-p', port, '-U', 'nexlift_ops_test', '-d', 'nexlift_ops_test_missing'];
    runPg('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1', ...args, '-1', '-f', path.join(serverDir, 'prisma/migrations/0_init/migration.sql')]);
    for (const name of ['empty', 'missing']) {
        const client = name === 'empty' ? db : new PrismaClient({ datasources: { db: { url: url(name) } } });
        for (const user of ['A', 'B']) { await seedBackupFixture(client, user); await client.user.update({ where: { id: user }, data: { tokenVersion: 0 } }); }
        await client.workoutLog.deleteMany(); await client.personalRecord.deleteMany();
        if (name === 'missing') await client.$disconnect();
    }
    await db.$executeRawUnsafe('CREATE ROLE nexlift_sync_http LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
    for (const name of ['empty', 'missing']) {
        const client = name === 'empty' ? db : new PrismaClient({ datasources: { db: { url: url(name) } } });
        await client.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO nexlift_sync_http');
        await client.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexlift_sync_http');
        await client.$executeRawUnsafe('REVOKE INSERT,UPDATE,DELETE ON public._prisma_migrations FROM nexlift_sync_http').catch(() => {});
        if (name === 'missing') await client.$disconnect();
    }
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA nexlift_operations TO nexlift_sync_http');
    await db.$executeRawUnsafe('GRANT SELECT,INSERT ON nexlift_operations."IdempotencyRecord" TO nexlift_sync_http');
    await start();
});
after(async () => { await stop(); await db.$disconnect(); });
test('IndexedDB/Dexie en Edge real con PostgreSQL desechable', { timeout: 180000 }, async t => {
    browserEvidence = await runStorageBrowser({ root, backend: base.replace(/\/api$/, ''), tokenA: token('A'), tokenB: token('B'), counts, t, db, fault });
    const orphan = await db.$queryRaw`SELECT count(*)::int AS n FROM nexlift_operations."IdempotencyRecord" r
        WHERE r.kind <> 'workout.delete' AND r.kind <> 'rest.create' AND NOT EXISTS (SELECT 1 FROM public."WorkoutLog" w WHERE w.id = r."resourceId")`;
    assert.equal(orphan[0].n, 0);
    await writeFile(path.join(root, 'storage-evidence.json'), JSON.stringify({ createdAt: new Date().toISOString(), source: 'SYNTHETIC_ONLY_NOT_PRODUCTION',
        productionTouched: false, realPostgres: true, browserEvidence, counts: await counts() }, null, 2));
});
