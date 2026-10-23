// This root-owned development tool declares @nexlift/shared in root devDependencies.
// The TS build bundles shared into compatibility artifacts for legacy packaging.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { workspaceProbe } from '@nexlift/shared';

const workspace = process.argv[2];
assert(['client', 'server'].includes(workspace), 'Choose client or server');
const directory = new URL(`../${workspace}/`, import.meta.url);
const require = createRequire(new URL('package.json', directory));
assert.equal(await realpath(require.resolve('@nexlift/shared')),
    await realpath(fileURLToPath(new URL('../packages/shared/dist/index.js', import.meta.url))));
for (const [args, source] of [
    [['--input-type=module'], "import {workspaceProbe} from '@nexlift/shared'; console.log(workspaceProbe)"],
    [['--input-type=commonjs'], "console.log(require('@nexlift/shared').workspaceProbe)"]
]) {
    const result = spawnSync(process.execPath, [...args, '-e', source], { cwd: directory, windowsHide: true, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), workspaceProbe);
}
console.log(`${workspace}: shared resolves in ESM and Node 24 CommonJS tooling`);
