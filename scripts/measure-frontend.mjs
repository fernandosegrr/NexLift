// Repeatable local artifact comparison against a verified received checkpoint.
// No environment files, HTTP servers, databases or operational configuration.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkpoint = path.resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(path.join(checkpoint, 'manifest.json'), 'utf8'));
assert.equal(path.resolve(manifest.source), path.resolve(root));
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { build } = require('vite');
const parent = path.join(homedir(), '.codex/artifacts/nexlift-verification'); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(path.join(parent, 'nexlift-phase8-performance-'));
for (const [file, hash] of Object.entries(manifest.files)) if (file.replaceAll('\\', '/').startsWith('client/')) {
    assert.equal(createHash('sha256').update(await readFile(path.join(checkpoint, 'files', file))).digest('hex'), hash);
}
await cp(path.join(checkpoint, 'files/client'), path.join(directory, 'client'), { recursive: true });
await cp(path.join(checkpoint, 'files/configs'), path.join(directory, 'configs'), { recursive: true });
await symlink(path.join(root, 'client/node_modules'), path.join(directory, 'client/node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
async function measure(client) {
    const start = performance.now();
    const result = await build({ root: client, configFile: path.join(client, 'vite.config.js'), envFile: false, logLevel: 'error', build: { write: false } });
    const chunks = result.output.filter(item => item.type === 'chunk').map(item => ({ name: item.name, entry: item.isEntry, raw: Buffer.byteLength(item.code), gzip: gzipSync(item.code).length }));
    return { milliseconds: performance.now() - start, chunks };
}
const before = await measure(path.join(directory, 'client')), after = await measure(path.join(root, 'client'));
const evidence = { checkpoint, node: process.versions.node, environmentFilesRead: false, before, after,
    note: 'Same installed Vite/dependencies, production defaults, write:false. Sequential local builds; duration is descriptive, not a statistically established speedup. Browser evidence separately measures actual cache reuse.' };
await mkdir(path.join(root, 'server/audit/frontend'), { recursive: true });
await writeFile(path.join(root, 'server/audit/frontend/performance.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ beforeEntry: before.chunks.find(x => x.entry), afterEntry: after.chunks.find(x => x.entry), evidence: 'server/audit/frontend/performance.json' }));
