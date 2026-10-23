import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectSharedSource } from './lib/boundaries.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const manifest = await json('package.json'), lock = await json('package-lock.json');
assert.deepEqual(manifest.workspaces, ['client', 'server', 'packages/*']);
assert(manifest.private);
assert.match(await readFile(path.join(root, '.npmrc'), 'utf8'), /install-strategy=nested/);
for (const directory of ['client', 'server', 'packages/shared']) {
    const pkg = await json(`${directory}/package.json`);
    assert.deepEqual(lock.packages[directory].dependencies || {}, pkg.dependencies || {});
    assert.deepEqual(lock.packages[directory].devDependencies || {}, pkg.devDependencies || {});
    assert.equal(lock.packages[`node_modules/${pkg.name}`].resolved, directory);
    assert.equal(lock.packages[`node_modules/${pkg.name}`].link, true);
}
// Retained independent locks are compatibility inputs with the same package graph.
for (const directory of ['client', 'server']) {
    const legacy = await json(`${directory}/package-lock.json`), pkg = await json(`${directory}/package.json`);
    assert.deepEqual(legacy.packages[''].dependencies || {}, pkg.dependencies || {});
    assert.deepEqual(legacy.packages[''].devDependencies || {}, pkg.devDependencies || {});
    for (const [entry, value] of Object.entries(legacy.packages)) {
        if (!entry) continue;
        const actual = lock.packages[`${directory}/${entry}`];
        assert(actual, `Missing locked package: ${directory}/${entry}`);
        for (const field of ['version', 'resolved', 'integrity']) assert.equal(actual[field], value[field], `${directory}/${entry}: ${field} drift`);
    }
}
const server = await json('server/package.json');
assert.equal(server.dependencies['@prisma/client'], '6.19.3');
assert.equal(server.devDependencies.prisma, '6.19.3');
const shared = await json('packages/shared/package.json');
assert.equal(Object.keys(shared.dependencies || {}).length, 0);
const sourceRoot = path.join(root, 'packages/shared/src');
async function inspect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await inspect(file);
        else if (/\.[cm]?[jt]sx?$/.test(entry.name)) assert.deepEqual(inspectSharedSource(await readFile(file, 'utf8'), file, sourceRoot), [], file);
    }
}
await inspect(sourceRoot);
console.log('Three workspaces, shared boundaries, independent lock compatibility and exact historical dependency graph verified');
