import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertTarget, client } from './identity.mjs';
import { connection } from './local.mjs';
import { cleanStageEnvironment } from './environment.mjs';
import { pgExecutable } from '../audit/postgresql/audit-tools.mjs';

// Preserve the source archive and restore only into a registered empty clone.
// A mismatch retains that new clone for investigation; never repair its schema.
export async function restoreCaptured(state, key, directory, { initialize = false } = {}) {
    const file = path.join(directory, 'source.original.dump');
    const manifest = JSON.parse(await readFile(path.join(directory, 'source.private.manifest.json'), 'utf8'));
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    if (manifest.kind !== 'NEXLIFT_AUTHORIZED_SOURCE' || manifest.version !== 1 || manifest.sourceVerified !== true
        || hash !== manifest.archiveSha256) throw new Error('Authorized source archive integrity rejected');
    await assertTarget(state, key, { write: true, initialize });
    const db = client(state, key);
    try {
        const objects = await db.$queryRawUnsafe("SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'");
        if (objects.length) throw new Error('Source restore requires a new empty staging database');
        const c = connection(state, key, { readOnly: false });
        const result = spawnSync(pgExecutable('pg_restore'), ['--no-owner', '--no-acl', '--exit-on-error', '--single-transaction', ...c.args, file], {
            env: { ...cleanStageEnvironment(), ...c.env, PGOPTIONS: '-c statement_timeout=30000 -c lock_timeout=2000' }, windowsHide: true, stdio: 'ignore', timeout: 120000
        });
        if (result.status !== 0 || result.error) throw new Error('Authorized source restoration failed');
        await db.$transaction(async tx => {
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
            const tables = await tx.$queryRawUnsafe("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname");
            if (tables.length !== Object.keys(manifest.fingerprints).length) throw new Error('Restored table count mismatch');
            for (const { name } of tables) {
                const identifier = '"' + name.replaceAll('"', '""') + '"';
                const [row] = await tx.$queryRawUnsafe(`SELECT count(*)::text AS count,md5(coalesce(string_agg(v,E'\\n' ORDER BY v),'')) AS digest FROM (SELECT row_to_json(t)::text AS v FROM public.${identifier} t) q`);
                if (row.count !== manifest.fingerprints[name]?.count || row.digest !== manifest.fingerprints[name]?.digest) throw new Error('Source restore row verification failed');
            }
        }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
        if (createHash('sha256').update(await readFile(file)).digest('hex') !== hash) throw new Error('Original source archive changed');
        return { restored: true, verified: true, tables: Object.keys(manifest.fingerprints).length };
    } finally { await db.$disconnect(); }
}
