// Provisional SQL contains mandatory disposable guards. Never bypass them.
// This job cannot be used for a persistent deployment until a separately reviewed
// migration adoption plan exists. HTTP never imports this file.
import { PrismaClient } from '@prisma/client';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function migrateDisposable(env = process.env) {
    if (env.NEXLIFT_RELEASE_MODE !== 'rehearsal' || !/^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$/.test(env.NEXLIFT_DISPOSABLE_MARKER || '')) throw new Error('Disposable migration configuration required');
    const url = new URL(env.NEXLIFT_RELEASE_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || !/^\/nexlift_ops_test_phase6_[a-f0-9_]+$/.test(url.pathname)) throw new Error('Disposable target required');
    const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
    try {
        const [identity] = await prisma.$queryRaw`SELECT shobj_description(oid,'pg_database') AS marker,
            current_setting('nexlift.phase31_disposable',true) AS p31, current_setting('nexlift.phase6_disposable',true) AS p6
            FROM pg_database WHERE datname=current_database()`;
        if ([identity.marker, identity.p31, identity.p6].some(value => value !== env.NEXLIFT_DISPOSABLE_MARKER)) throw new Error('Disposable identity rejected');
        // Separate cwd/schema guarantees Prisma cannot discover operational .env.
        const work = await mkdtemp(path.join(tmpdir(), 'nexlift-release-migration-'));
        await cp(new URL('../prisma/', import.meta.url), path.join(work, 'prisma'), { recursive: true, filter: source => !path.basename(source).startsWith('.env') });
        const clean = Object.fromEntries(Object.entries(env).filter(([key]) => /^(PATH|HOME|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
        const code = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy', '--schema', path.join(work, 'prisma/schema.prisma')],
                { cwd: work, env: { ...clean, DATABASE_URL: url.href, PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' }, windowsHide: true, stdio: 'ignore' });
            child.once('error', reject); child.once('exit', resolve);
        });
        if (code !== 0) throw new Error('Disposable migration failed');
        // Retain this small schema-only diagnostic directory; never delete old trials.
        await readFile(path.join(work, 'prisma/schema.prisma'));
        return { migrated: true, baseline: 'PROVISIONAL' };
    } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    migrateDisposable().then(() => console.log('Disposable migration complete; baseline PROVISIONAL')).catch(() => {
        console.error('Migration blocked or failed; no automatic repair.'); process.exitCode = 1;
    });
}
