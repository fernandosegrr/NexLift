import { mkdtemp, realpath, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createStaging, saveState, stopStaging } from '../staging/local.mjs';
import { cleanStageEnvironment } from '../staging/environment.mjs';
import { serverDir } from '../audit/postgresql/audit-tools.mjs';

if (process.argv.length !== 2) throw new Error('No external URLs or arguments accepted');
const parent = await realpath(tmpdir());
const root = await mkdtemp(path.join(parent, 'nexlift-staging-tests-'));
async function cleanup() {
    const actual = await realpath(root);
    if (path.dirname(actual) !== parent || !path.basename(actual).startsWith('nexlift-staging-tests-')) throw new Error('Unsafe test cleanup path');
    await rm(actual, { recursive: true, force: true });
}
let state;
try {
    state = await createStaging(path.join(root, 'owned-stage'));
    // A test-only release: this runner's clean install and built frontend. The
    // persistent operator staging uses an independent snapshot instead.
    state.release = path.resolve(serverDir, '..'); await saveState(state.root, state);
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'test/staging.integration.test.js'], {
        cwd: serverDir, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 180000,
        env: { ...cleanStageEnvironment(), NEXLIFT_STAGE_HOME: state.root, NEXLIFT_STAGE_TEST_ID: state.id }
    });
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
    process.exitCode = result.status ?? 1;
    const evidence = path.join(state.root, 'test-evidence.json');
    try { await writeFile(path.join(serverDir, 'audit/staging/integration-evidence.json'), await readFile(evidence)); } catch { /* failed suite has no public evidence */ }
} finally {
    if (state) await stopStaging(state);
    await cleanup();
}
