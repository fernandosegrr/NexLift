// A fresh, loopback-only PostgreSQL cluster. Never loads .env or accepts a DB URL.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { cleanStageEnvironment } from '../staging/environment.mjs';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 2) throw new Error('No external arguments accepted');
const serverDir = fileURLToPath(new URL('../', import.meta.url));
const bin = process.env.NEXLIFT_TEST_PG_BIN || (process.platform === 'win32'
    ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const executable = name => bin ? path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const run = (name, args, options = {}) => {
    const result = spawnSync(executable(name), args, { windowsHide: true, encoding: 'utf8', ...options });
    if (result.error || result.status !== 0) {
        throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout}`);
    }
    return result;
};

const probe = net.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const tempRoot = realpathSync(tmpdir());
const root = mkdtempSync(path.join(tempRoot, 'nexlift-workout-tests-'));
const data = path.join(root, 'data');
let started = false;
let stopped = false;
try {
    run('initdb', ['-D', data, '-U', 'nexlift_workout_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    // On Windows the server can inherit pipe handles and keep spawnSync waiting.
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
    run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'nexlift_workout_test', 'nexlift_workout_test']);
    const result = spawnSync(process.execPath, [
        '--test', '--test-reporter=spec', 'test/smart-loading.integration.test.js'
    ], {
        cwd: serverDir, windowsHide: true, stdio: 'inherit',
        env: {
            ...cleanStageEnvironment(),
            DATABASE_URL: `postgresql://nexlift_workout_test@127.0.0.1:${port}/nexlift_workout_test`,
            NEXLIFT_WORKOUT_TEST_PORT: String(port),
            OPENAI_API_KEY: '', NODE_ENV: 'test'
        }
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} finally {
    // Stop before removal, and validate the resolved absolute path is our temp child.
    if (started || existsSync(path.join(data, 'postmaster.pid'))) {
        run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    }
    stopped = true;
    const resolvedRoot = realpathSync(root);
    if (stopped && path.dirname(resolvedRoot) === tempRoot && path.basename(resolvedRoot).startsWith('nexlift-workout-tests-')) {
        rmSync(resolvedRoot, { recursive: true, force: true });
    }
}
