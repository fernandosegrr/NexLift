import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import net from 'node:net';
import jwt from 'jsonwebtoken';
import { create, closeAll, root, port as pgPort } from './fixtures/baseline-environment.js';
import { cleanEnvironment, serverDir, runPg } from '../audit/postgresql/audit-tools.mjs';

test('TypeScript backend: real development entry, native PostgreSQL, JWT and dependency recovery', { timeout: 90000 }, async context => {
    const db = await create('nexlift_baseline_typescript_dev', { legacy: true });
    await db.prisma.user.create({ data: { id: 'typed-dev', username: 'typed-dev', email: 'typed@example.invalid',
        passwordHash: 'synthetic-unused-password-hash', firstName: 'Typed', lastName: 'Development' } });
    const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const secret = 'typescript-disposable-development-secret';
    const child = spawn(process.execPath, ['--enable-source-maps', 'test/fixtures/typescript-dev-process.mjs'], {
        cwd: serverDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...cleanEnvironment(),
            NODE_ENV: 'development', NEXLIFT_INFRA_REHEARSAL: 'true', DATABASE_URL: db.url, JWT_SECRET: secret,
            PORT: String(port), NEXLIFT_BIND_HOST: '127.0.0.1', OPENAI_API_KEY: '', CLOUDINARY_CLOUD_NAME: '',
            CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }
    });
    let output = '', stopped = false;
    child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
    const request = (route, headers = {}) => fetch(`http://127.0.0.1:${port}${route}`, { headers, signal: AbortSignal.timeout(12000) });
    try {
        let ready = false;
        for (let attempt = 0; attempt < 200; attempt++) {
            assert.equal(child.exitCode, null, 'Development entry exited before readiness');
            try { if ((await request('/api/ready')).status === 200) { ready = true; break; } } catch { /* local readiness polling */ }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert(ready, 'Development entry did not become ready');
        assert.equal((await request('/api/health')).status, 200);
        assert.equal((await request('/api/auth/me')).status, 401);
        const headers = { Authorization: `Bearer ${jwt.sign({ userId: 'typed-dev', tokenVersion: 0 }, secret)}` };
        assert.equal((await request('/api/auth/me', headers)).status, 200);
        await db.prisma.$disconnect();
        runPg('pg_ctl', ['-D', path.join(root, 'data'), '-m', 'fast', '-w', 'stop']); stopped = true;
        const unavailable = await request('/api/auth/me', headers);
        assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get('retry-after'), '5');
        runPg('pg_ctl', ['-D', path.join(root, 'data'), '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${pgPort}`, '-w', 'start'], { stdio: 'ignore' }); stopped = false;
        let recovered = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            context.signal.throwIfAborted();
            const status = (await request('/api/auth/me', headers)).status;
            if (status === 200) { recovered = true; break; }
            assert.equal(status, 503, 'Recovery must not turn a dependency failure into 401 or 500');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert(recovered, 'Prisma did not reconnect to the restarted disposable cluster');
        assert.match(output, /server_started/);
    } finally {
        if (stopped) runPg('pg_ctl', ['-D', path.join(root, 'data'), '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${pgPort}`, '-w', 'start'], { stdio: 'ignore' });
        if (child.exitCode === null) { const exited = once(child, 'exit'); child.send('SIGTERM'); await exited; }
        await closeAll();
    }
});
