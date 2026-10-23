import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stageHome } from './environment.mjs';
import { loadState, assertTarget, client } from './identity.mjs';
import { inspect, status, backup, createDatabase, restore } from './local.mjs';
import { assertSchemaReady } from '../deploy/releaseGate.js';
import { serverDir } from '../audit/postgresql/audit-tools.mjs';

if (process.argv.length !== 2) throw new Error('No arguments or external URLs accepted');
try {
    const state = await loadState(stageHome());
    await assertTarget(state, 'reference');
    const audit = await inspect(state, 'reference'), running = await status(state);
    const original = path.join(state.referenceBackup, 'system.dump');
    const before = createHash('sha256').update(await readFile(original)).digest('hex');
    const bundle = await backup(state), cloneKey = `verified_${Date.now()}`;
    await createDatabase(state, cloneKey); const recovery = await restore(state, cloneKey, bundle.directory);
    const clone = client(state, cloneKey), reference = client(state, 'reference');
    let version;
    try {
        await assertSchemaReady(clone);
        const [row] = await reference.$queryRawUnsafe("SELECT current_setting('server_version') AS version,current_setting('default_transaction_read_only') AS readonly");
        if (row.readonly !== 'on') throw new Error('Reference protection missing'); version = row.version;
    } finally { await clone.$disconnect(); await reference.$disconnect(); }
    if (createHash('sha256').update(await readFile(original)).digest('hex') !== before) throw new Error('Original reference backup changed');
    const result = { createdAt: new Date().toISOString(), infrastructure: 'PARTIAL_LOCAL_FUNCTIONAL_DOCKER_UNVERIFIED', baseline: 'PROVISIONAL',
        source: state.source, authorizedRealCopyAvailable: false, productionConnected: false,
        postgres: version, node: process.versions.node, api: running, separateDatabaseCredentials: true, referenceReadOnly: true,
        structuralDifferences: audit.differences, tables: audit.catalog.tables.length - 1, columns: audit.catalog.columns.filter(r => r.table !== '_prisma_migrations').length,
        foreignKeys: audit.catalog.foreignKeys.length, indexes: audit.catalog.indexes.filter(r => r.table !== '_prisma_migrations').length,
        counts: audit.counts, declaredOrphans: audit.declaredOrphans, diagnostics: audit.diagnostics, supplemental: audit.supplemental,
        fullBackupAndRestoreVerified: recovery.verified, originalArchiveUnchanged: true, dockerExecuted: false };
    await mkdir(path.join(serverDir, 'audit/staging'), { recursive: true });
    await writeFile(path.join(serverDir, 'audit/staging/local-evidence.json'), JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ source: result.source, api: running.api, structuralDifferences: result.structuralDifferences.length,
        fullBackupAndRestoreVerified: result.fullBackupAndRestoreVerified, baseline: result.baseline }) + '\n');
} catch { process.stderr.write('Local staging validation blocked or failed. No secrets printed.\n'); process.exitCode = 1; }
