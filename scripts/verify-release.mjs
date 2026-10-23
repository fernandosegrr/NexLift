// Static/artifact checks only; no HTTP, database or provider credentials.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { artifactManifest } from '../server/deploy/release-artifacts.mjs';
import { cleanStageEnvironment } from '../server/staging/environment.mjs';

process.env = { ...cleanStageEnvironment(), NODE_ENV: 'production' };
const root = fileURLToPath(new URL('../', import.meta.url)), client = path.join(root, 'client');
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { build } = require('vite');
async function compile() {
    const start = performance.now();
    const result = await build({ root: client, configFile: path.join(client, 'vite.config.js'), envFile: false, logLevel: 'error', build: { write: false } });
    const outputs = result.output.map(asset => {
        const bytes = asset.type === 'chunk' ? Buffer.from(asset.code) : Buffer.from(asset.source);
        return { file: asset.fileName, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
            gzip: gzipSync(bytes).length, entry: asset.type === 'chunk' && asset.isEntry };
    }).sort((a, b) => a.file.localeCompare(b.file));
    return { milliseconds: performance.now() - start, outputs };
}
const first = await compile(), second = await compile();
assert.deepEqual(first.outputs, second.outputs, 'Same sources/locks must reproduce frontend bytes');
for (const output of first.outputs) {
    const actual = await readFile(path.join(client, 'dist', output.file));
    assert.equal(createHash('sha256').update(actual).digest('hex'), output.sha256,
        `On-disk release asset differs from production build: ${output.file}`);
}
const entry = first.outputs.find(file => file.entry); assert(entry && entry.gzip < 110000, 'Entry gzip budget 110000 bytes');
const runtime = await artifactManifest();
const pkg = JSON.parse(await readFile(path.join(root, 'server/package.json'), 'utf8'));
assert.equal(pkg.dependencies['@prisma/client'], '6.19.3'); assert.equal(pkg.devDependencies.prisma, '6.19.3');
await mkdir(path.join(root, 'server/audit/release'), { recursive: true });
await writeFile(path.join(root, 'server/audit/release/artifacts.json'), JSON.stringify({ node: process.versions.node,
    environmentFilesRead: false, frontendByteReproducible: true, diskMatchesProduction: true, first, second, runtime,
    dockerExecuted: false, note: 'Local frontend bytes only; apt/base layers are not a bit-for-bit image certification.' }, null, 2) + '\n');
console.log(JSON.stringify({ frontendByteReproducible: true, entry, artifacts: Object.keys(runtime).length }));
