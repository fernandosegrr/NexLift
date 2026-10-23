// Read-only source inspection plus exclusively NEW local PostgreSQL. No .env.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanStageEnvironment } from '../staging/environment.mjs';
import { freePort } from '../staging/local.mjs';
import { pgExecutable } from '../audit/postgresql/audit-tools.mjs';
assert.equal(process.argv.length, 2);
const source = await realpath(process.env.NEXLIFT_COACH_SOURCE || 'COACH_SOURCE_REQUIRED');
const parent = path.join(homedir(), '.codex/artifacts/nexlift-phase6-trials'); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(path.join(parent, 'coach-release-')), data = path.join(directory, 'data');
const port = String(await freePort()), marker = `NEXLIFT_PHASE31_DISPOSABLE:${randomUUID()}`;
const env = { ...cleanStageEnvironment(), DATABASE_URL: '', NODE_ENV: 'test', NEXLIFT_PHASE6_ROOT: directory, NEXLIFT_PHASE6_PORT: port,
    NEXLIFT_PHASE6_MARKER: marker, NEXLIFT_COACH_SOURCE: source,
    ...(process.env.NEXLIFT_V4_SOURCE ? { NEXLIFT_V4_SOURCE: await realpath(process.env.NEXLIFT_V4_SOURCE) } : {}), PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
const run = (name, args) => { const r = spawnSync(pgExecutable(name), args, { env, encoding: 'utf8', windowsHide: true, stdio: 'ignore', timeout: 30000 }); assert.equal(r.status, 0, `${name} failed`); };
let started = false;
try {
    run('initdb', ['-D', data, '-U', 'nexlift_phase6_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.private.log'), '-o', `-h 127.0.0.1 -p ${port} -c timezone=UTC`, '-w', 'start']); started = true;
    const pid = (await readFile(path.join(data, 'postmaster.pid'), 'utf8')).split(/\r?\n/); assert.equal(await realpath(pid[1]), await realpath(data)); assert.equal(pid[3], port);
    const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('../../scripts/test/coach-release-check.mjs', import.meta.url))], {
        env, windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); assert(!result.error); process.exitCode = result.status ?? 1;
} finally {
    if (started || existsSync(path.join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    console.log(`Coach release disposable evidence: ${directory}`);
}
