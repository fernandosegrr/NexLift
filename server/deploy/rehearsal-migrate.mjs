// A separate, explicit job; NEVER imported or invoked by HTTP startup.
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rehearsalConfig } from './rehearsal-config.js';
import { operationalLog } from '../src/operations/telemetry.js';

export async function rehearsalMigrate(env = process.env) {
    const { url } = rehearsalConfig(env, { http: false });
    const parent = await realpath(tmpdir());
    const work = await mkdtemp(path.join(parent, 'nexlift-release-job-'));
    try {
        const schema = path.join(work, 'prisma');
        await cp(new URL('../prisma/', import.meta.url), schema, { recursive: true, filter: source => !path.basename(source).startsWith('.env') });
        const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !/^(PG|PRISMA_|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$)/i.test(key)));
        const code = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)),
                'migrate', 'deploy', '--schema', path.join(schema, 'schema.prisma')], {
                windowsHide: true, cwd: work, stdio: 'ignore',
                env: { ...clean, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' }
            });
            child.once('error', reject); child.once('exit', value => resolve(value ?? 1));
        });
        if (code !== 0) throw new Error('Migration job failed');
        operationalLog({ event: 'migration_job_complete', category: 'lifecycle' });
    } finally {
        const resolved = await realpath(work);
        if (path.dirname(resolved) === parent && path.basename(resolved).startsWith('nexlift-release-job-')) {
            await rm(resolved, { recursive: true, force: true });
        }
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { await rehearsalMigrate(); }
    catch { operationalLog({ event: 'migration_job_failed', category: 'configuration_or_dependency' }); process.exitCode = 1; }
}
