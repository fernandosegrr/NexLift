// Fresh PostgreSQL only. Reuses the baseline fixture's cluster identity checks;
// existing databases, inherited URLs and arguments are never accepted.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { serverDir, cleanEnvironment, runPg } from '../audit/postgresql/audit-tools.mjs';

if (process.argv.length !== 2) throw new Error('No external arguments or URLs accepted');
const parent = realpathSync(tmpdir());
const root = mkdtempSync(path.join(parent, 'nexlift-baseline-tests-'));
const data = path.join(root, 'data');
mkdirSync(path.join(root, 'work'));
cpSync(path.join(serverDir, 'prisma'), path.join(root, 'work/prisma'), { recursive: true });
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
let started = false;
try {
    runPg('initdb', ['-D',data,'-U','nexlift_baseline_test','--auth=trust','--no-locale','--encoding=UTF8']);
    runPg('pg_ctl', ['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'], { stdio: 'ignore' });
    started = true;
    const result = spawnSync(process.execPath, ['--test','--test-reporter=spec','test/infra.integration.test.js'], {
        cwd: serverDir, windowsHide: true, stdio: 'inherit', env: { ...cleanEnvironment(),
            NEXLIFT_BASELINE_TEST_ROOT: root, NEXLIFT_BASELINE_TEST_PORT: String(port), NODE_ENV: 'test',
            DATABASE_URL: '', OPENAI_API_KEY: '', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
            VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} finally {
    if (started && existsSync(path.join(data,'postmaster.pid'))) runPg('pg_ctl', ['-D',data,'-m','fast','-w','stop']);
    const resolved = realpathSync(root);
    if (path.dirname(resolved) === parent && path.basename(resolved).startsWith('nexlift-baseline-tests-')) rmSync(resolved, { recursive: true, force: true });
    else { process.stderr.write('Unsafe cleanup path; nothing removed.\n'); process.exitCode = 1; }
}
