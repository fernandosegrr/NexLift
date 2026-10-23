import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, cp, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { createECDH, randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { Prisma } from '@prisma/client';
import { root, create, history, closeAll, port as pgPort } from './fixtures/baseline-environment.js';
import { serverDir, cleanEnvironment, runPg } from '../audit/postgresql/audit-tools.mjs';

const secret = 'synthetic-jwt-secret-with-at-least-32-characters';
let db, child, base, output = '', httpPort;
const children = new Set();
const envFor = (url, extra = {}) => ({ ...cleanEnvironment(), NODE_ENV: 'production', NEXLIFT_INFRA_REHEARSAL: 'true',
    NEXLIFT_RELEASE_DATABASE_URL: url, JWT_SECRET: secret, PORT: String(httpPort || 3001), NEXLIFT_BIND_HOST: '127.0.0.1',
    DATABASE_URL: 'postgresql://ignored@127.0.0.1:1/forbidden', OPENAI_API_KEY: '', CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', ...extra });
const cli = (file, env) => spawnSync(process.execPath, [file], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
const job = (target, file = path.join(serverDir, 'deploy/rehearsal-migrate.mjs')) => cli(file, envFor(target.url));
const auth = version => ({ Authorization: `Bearer ${jwt.sign({ userId: 'infra-user', tokenVersion: version }, secret)}` });
const request = (route, headers = {}) => fetch(`${base}${route}`, { headers, signal: AbortSignal.timeout(8000) });
async function launch() {
    child = spawn(process.execPath, [path.join(serverDir,'test/fixtures/infra-process.mjs')], {
        cwd: root, windowsHide: true, env: envFor(db.url), stdio: ['ignore','pipe','pipe','ipc']
    });
    children.add(child);
    child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
    for (let i = 0; i < 200; i++) {
        if (child.exitCode !== null) throw new Error('Rehearsal exited before readiness');
        try { if ((await request('/api/ready')).status === 200) return; } catch { /* polling only loopback */ }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Rehearsal readiness deadline exceeded');
}
before(async () => {
    assert.match(process.versions.node, /^24\.22\.[01]$/); assert.equal(Prisma.prismaVersion.client, '6.19.3');
    db = await create('nexlift_baseline_infra');
    assert.equal(job(db).status, 0);
    await db.prisma.user.create({ data: { id: 'infra-user', username: 'synthetic-infra', email: 'synthetic-infra@example.invalid',
        passwordHash: await bcrypt.hash('synthetic-password', 4), firstName: 'Synthetic', lastName: 'Test', tokenVersion: 2 } });
    const probe = net.createServer(); await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
    httpPort = probe.address().port; await new Promise(resolve => probe.close(resolve));
    base = `http://127.0.0.1:${httpPort}`;
    await launch();
});
after(async () => {
    for (const process of children) if (process.exitCode === null) { process.kill(); await once(process,'exit'); }
    await closeAll();
});
test('Node 24.22.0 loads the Prisma 6.19.3 native query engine and commits/rolls back transactions', async () => {
    await db.prisma.$transaction(async tx => { assert.equal(await tx.user.count(), 1); });
    await assert.rejects(db.prisma.$transaction(async tx => { await tx.user.update({ where: { id: 'infra-user' }, data: { firstName: 'must-rollback' } }); throw new Error('rollback'); }));
    assert.equal((await db.prisma.user.findUnique({ where: { id: 'infra-user' } })).firstName, 'Synthetic');
    assert.match(process.versions.openssl, /^3\./);
});
test('crypto, bcrypt, JWT and real Web Push encryption work on Node 24 without external delivery', async () => {
    assert.equal(await bcrypt.compare('synthetic-password', (await db.prisma.user.findUnique({ where: { id: 'infra-user' } })).passwordHash), true);
    assert.equal(jwt.verify(auth(2).Authorization.slice(7), secret).userId, 'infra-user');
    assert.equal(createHash('sha256').update('synthetic').digest('hex').length, 64);
    const vapid = webpush.generateVAPIDKeys(), ecdh = createECDH('prime256v1'); ecdh.generateKeys();
    const details = webpush.generateRequestDetails({ endpoint: 'https://127.0.0.1:9/synthetic', keys: {
        p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } },
    JSON.stringify({ synthetic: true }), { vapidDetails: { subject: 'mailto:synthetic@example.invalid', publicKey: vapid.publicKey, privateKey: vapid.privateKey } });
    assert.ok(details.body.length > 0); assert.equal(details.headers['Content-Encoding'], 'aes128gcm');
});
test('real app starts after independent job and preserves profile/routines endpoint shapes', async () => {
    const profile = await request('/api/auth/me', auth(2)); assert.equal(profile.status, 200);
    const body = await profile.json(); assert.equal(body.id, 'infra-user'); assert.equal(body.passwordHash, undefined); assert.ok(body._count);
    const routines = await request('/api/routines', auth(2)); assert.equal(routines.status, 200); assert.deepEqual(await routines.json(), []);
    const status = await request('/api/backup/status', auth(2));
    assert.equal(status.status, 200); assert.deepEqual(await status.json(), { configured: false, lastBackupAt: null, hasBackupError: false });
    assert.equal((await request('/api/backup/status')).status, 401);
});
test('actual invalid, expired, revoked and missing JWT remain 401', async () => {
    for (const headers of [{}, { Authorization: 'Bearer invalid' }, auth(1),
        { Authorization: `Bearer ${jwt.sign({ userId: 'infra-user', tokenVersion: 2 }, secret, { expiresIn: -1 })}` }]) {
        assert.equal((await request('/api/auth/me', headers)).status, 401);
    }
});
test('public probes disclose no accounts, backup status, connection details or tokens', async () => {
    const live = await request('/api/health'); assert.equal(live.status, 200);
    assert.deepEqual(Object.keys(await live.json()).sort(), ['status','timestamp']);
    assert.match(live.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
    const ready = await request('/api/ready'); assert.equal(ready.status, 200); assert.deepEqual(await ready.json(), { status: 'ready' });
});
test('the runtime healthcheck command observes the actual ready application', () => {
    assert.equal(cli(path.join(serverDir,'deploy/http-healthcheck.mjs'), envFor(db.url)).status, 0);
});
test('malformed JSON gets a generic 400 with request ID, no HTML stack or posted secrets', async () => {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"secret-password"' });
    assert.equal(res.status, 400); assert.equal(res.headers.get('content-type').includes('application/json'), true);
    assert.deepEqual(await res.json(), { error: 'Solicitud inválida' });
});
test('missing required config blocks real rehearsal entry before listening', () => {
    for (const key of ['NEXLIFT_RELEASE_DATABASE_URL','JWT_SECRET','NEXLIFT_INFRA_REHEARSAL']) {
        const result = cli(path.join(serverDir,'deploy/rehearsal-http.mjs'), envFor(db.url, { [key]: '' }));
        assert.equal(result.status, 1); assert.doesNotMatch(result.stderr, /postgresql:|synthetic-password/);
    }
});
test('schema drift makes live readiness 503 and blocks a new app instance before listening', async () => {
    await db.prisma.$executeRawUnsafe('ALTER TABLE "Exercise" ALTER COLUMN "targetSets" SET DEFAULT 99');
    try {
        assert.equal((await request('/api/ready')).status, 503);
        const result = cli(path.join(serverDir,'deploy/rehearsal-http.mjs'), envFor(db.url));
        assert.equal(result.status, 1); assert.match(result.stderr, /rehearsal_start_blocked/);
        assert.equal(cli(path.join(serverDir,'deploy/http-healthcheck.mjs'), envFor(db.url)).status, 1);
    } finally { await db.prisma.$executeRawUnsafe('ALTER TABLE "Exercise" ALTER COLUMN "targetSets" SET DEFAULT 3'); }
});
test('legacy schema without metadata is refused; HTTP startup never creates migration history', async () => {
    const legacy = await create('nexlift_baseline_infra_legacy', { legacy: true });
    assert.equal(cli(path.join(serverDir,'deploy/rehearsal-http.mjs'), envFor(legacy.url)).status, 1);
    const [row] = await legacy.prisma.$queryRawUnsafe("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present");
    assert.equal(row.present, false);
});
test('a failed independent migration job exits nonzero and actual startup refuses its failed history', async () => {
    const failed = await create('nexlift_baseline_infra_failed');
    const bundle = path.join(root,'failed-job'); await mkdir(path.join(bundle,'deploy'), { recursive: true });
    await cp(path.join(serverDir,'prisma'), path.join(bundle,'prisma'), { recursive: true });
    for (const file of ['rehearsal-migrate.mjs','rehearsal-config.js']) await cp(path.join(serverDir,'deploy',file), path.join(bundle,'deploy',file));
    await mkdir(path.join(bundle,'src/operations'), { recursive: true });
    await cp(path.join(serverDir,'src/operations/telemetry.js'), path.join(bundle,'src/operations/telemetry.js'));
    await writeFile(path.join(bundle,'package.json'), '{"type":"module"}');
    await symlink(path.join(serverDir,'node_modules'), path.join(bundle,'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await mkdir(path.join(bundle,'prisma/migrations/1_failure'));
    await writeFile(path.join(bundle,'prisma/migrations/1_failure/migration.sql'), 'BEGIN; SELECT 1/0; COMMIT;');
    const result = job(failed, path.join(bundle,'deploy/rehearsal-migrate.mjs'));
    assert.equal(result.status, 1); assert.match(result.stderr, /migration_job_failed/);
    assert.ok((await history(failed)).some(row => row.migration_name === '1_failure' && !row.finished_at));
    assert.equal(cli(path.join(serverDir,'deploy/rehearsal-http.mjs'), envFor(failed.url)).status, 1);
    assert.equal(job(failed).status, 1); // Failed history is never silently resolved.
});
test('repeating the independent job is safe and HTTP startup has not reapplied migrations', async () => {
    const previous = await history(db); assert.equal(job(db).status, 0); assert.deepEqual(await history(db), previous);
});
test('actual database outage returns auth 503, readiness 503 and public liveness 200', async () => {
    runPg('pg_ctl', ['-D',path.join(root,'data'),'-m','fast','-w','stop']);
    try {
        const res = await request('/api/auth/me', auth(2)); assert.equal(res.status, 503);
        assert.equal(res.headers.get('retry-after'), '5');
        assert.deepEqual(await res.json(), { error: 'Servicio temporalmente no disponible' });
        assert.equal((await request('/api/ready')).status, 503); assert.equal((await request('/api/health')).status, 200);
        assert.equal(cli(path.join(serverDir,'deploy/http-healthcheck.mjs'), envFor(db.url)).status, 1);
    } finally {
        runPg('pg_ctl', ['-D',path.join(root,'data'),'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort}`,'-w','start'], { stdio: 'ignore' });
        // The test controller also lost its idle connections; rebuild that pool.
        await db.prisma.$disconnect();
    }
    assert.equal((await request('/api/auth/me', auth(2))).status, 200);
});
test('actual process handles shutdown, frees its socket and leaves user/migration rows intact', async () => {
    const previous = await history(db);
    const exited = once(child,'exit'); child.send('SIGTERM');
    const [code] = await exited; assert.equal(code, 0);
    assert.match(output, /shutdown_complete/); assert.doesNotMatch(output, /synthetic-password|postgresql:\/\/|Bearer /);
    await assert.rejects(request('/api/health'));
    assert.equal(await db.prisma.user.count(), 1); assert.deepEqual(await history(db), previous);
});
