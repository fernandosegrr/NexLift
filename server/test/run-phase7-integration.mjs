// No arguments, .env, inherited URL or existing PGDATA are accepted.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanStageEnvironment } from '../staging/environment.mjs';
import { freePort } from '../staging/local.mjs';
import { pgExecutable } from '../audit/postgresql/audit-tools.mjs';

assert.equal(process.argv.length, 2, 'No external arguments accepted');
const server = fileURLToPath(new URL('../', import.meta.url));
const parent = path.join(homedir(), '.codex/artifacts/nexlift-phase6-trials');
await mkdir(parent, { recursive: true });
const root = await mkdtemp(path.join(parent, 'phase7-')), data = path.join(root, 'data');
const port = String(await freePort()), marker = `NEXLIFT_PHASE31_DISPOSABLE:${randomUUID()}`;
const env = { ...cleanStageEnvironment(), NODE_ENV: 'test', DATABASE_URL: '', OPENAI_API_KEY: '',
    NEXLIFT_PHASE6_ROOT: root, NEXLIFT_PHASE6_PORT: port, NEXLIFT_PHASE6_MARKER: marker,
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
function run(name, args, options = {}) {
    const result = spawnSync(pgExecutable(name), args, { env, windowsHide: true, encoding: 'utf8', ...options });
    assert.equal(result.status, 0, `${name}: ${result.error?.message || result.stderr}`);
    return result.stdout;
}
let started = false;
try {
    run('initdb', ['-D', data, '-U', 'nexlift_phase6_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${port} -c timezone=UTC`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
    const pid = (await readFile(path.join(data, 'postmaster.pid'), 'utf8')).split(/\r?\n/);
    assert.equal(await realpath(pid[1]), await realpath(data)); assert.equal(pid[3], port);
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'test/phase7.integration.test.js'], {
        cwd: server, env, windowsHide: true, encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024
    });
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
    await writeFile(path.join(root, 'tests.private.log'), (result.stdout || '') + (result.stderr || ''));
    assert(!result.error, result.error?.message);
    process.exitCode = result.status ?? 1;
} finally {
    if (started || existsSync(path.join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    // Retain one durable trial/evidence directory; do not delete other work.
    console.log(`Phase 7 disposable cluster stopped; evidence retained: ${root}`);
}
