// Always create a NEW loopback-only cluster. Never read .env or accept a DB URL.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('../', import.meta.url));
const bin = process.env.NEXLIFT_TEST_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const exe = n => bin ? path.join(bin, n + (process.platform === 'win32' ? '.exe' : '')) : n;
const run = (name, args, options = {}) => {
    const r = spawnSync(exe(name), args, { windowsHide: true, encoding: 'utf8', ...options });
    if (r.error || r.status !== 0) throw new Error(`${name} falló: ${r.error?.message || r.stderr}`);
    return r;
};
const probe = net.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const tempRoot = realpathSync(tmpdir());
const root = mkdtempSync(path.join(tempRoot, 'nexlift-backup-tests-'));
const data = path.join(root, 'data');
let started = false;
try {
    run('initdb', ['-D', data, '-U', 'nexlift_backup_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
    for (const db of ['nexlift_backup_test', 'nexlift_backup_empty', 'nexlift_backup_pgrestore', 'nexlift_backup_pgfailure']) run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'nexlift_backup_test', db]);
    const verifyFile = process.argv.slice(2).find(a => a.startsWith('--verify-file='));
    const receipt = process.argv.slice(2).find(a => a.startsWith('--receipt='));
    const childArgs = verifyFile
        ? ['test/verify-backup-file.mjs', verifyFile.slice('--verify-file='.length), ...(receipt ? [receipt.slice('--receipt='.length)] : [])]
        : ['--test', '--test-reporter=spec', ...process.argv.slice(2), 'test/backup.integration.test.js'];
    const r = spawnSync(process.execPath, childArgs, {
        cwd: serverDir, windowsHide: true, stdio: 'inherit', env: { ...process.env,
            DATABASE_URL: `postgresql://nexlift_backup_test@127.0.0.1:${port}/nexlift_backup_test`,
            NEXLIFT_BACKUP_TEST_PORT: String(port), NEXLIFT_BACKUP_TEST_ROOT: root, NEXLIFT_TEST_PG_BIN: bin,
            OPENAI_API_KEY: '', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', NODE_ENV: 'test'
        }
    });
    if (r.error) throw r.error;
    process.exitCode = r.status ?? 1;
} finally {
    if (started || existsSync(path.join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    const resolved = realpathSync(root);
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('nexlift-backup-tests-')) throw new Error('Ruta temporal fuera de ámbito; no se elimina.');
    rmSync(resolved, { recursive: true, force: true });
}
