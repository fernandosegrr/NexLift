import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { inspectSharedSource } from '../lib/boundaries.mjs';
import { passedOfflineCleanupTarget } from '../lib/cleanup-result.mjs';

const root = path.resolve('packages/shared/src'), file = path.join(root, 'example.js');
const inspect = source => inspectSharedSource(source, file, root);
test('shared permits pure code, relative modules and harmless strings/comments', () => {
    assert.deepEqual(inspect(`// import fs from 'node:fs'; window\nexport {x} from './pure.js'; export const label='process';`), []);
});
test('shared rejects Node builtins in static imports', () => assert(inspect(`import fs from 'node:fs'`).length));
test('shared rejects server dependencies and framework re-exports', () => {
    for (const name of ['@prisma/client', 'express', 'react']) assert(inspect(`export * from '${name}'`).length);
});
test('shared rejects literal dynamic platform imports', () => assert(inspect(`const fs=import('node:fs')`).length));
test('shared rejects computed dynamic imports and require', () => {
    assert(inspect(`const m=import(name)`).length); assert(inspect(`const m=require(name)`).length);
});
test('shared rejects imports escaping its directory', () => assert(inspect(`export * from '../../../server/src/logic.js'`).length));
test('shared rejects browser persistence and credential environment globals', () => {
    for (const source of ['localStorage.getItem("x")', 'window.location', 'indexedDB.open("x")', 'process.env.JWT_SECRET', 'Buffer.from("x")']) assert(inspect(source).length);
});
test('shared rejects require of server code and TypeScript import-equals', () => {
    assert(inspect(`const m=require('express')`).length); assert(inspect(`import m = require('express')`).length);
});
test('shared bundles for the browser without Node, frameworks or server modules', async () => {
    const require = createRequire(new URL('../../client/package.json', import.meta.url));
    const { build } = await import(pathToFileURL(require.resolve('vite')).href);
    const result = await build({ configFile: false, envFile: false, logLevel: 'silent',
        build: { write: false, minify: true, lib: { entry: fileURLToPath(new URL('../fixtures/shared-browser.js', import.meta.url)), formats: ['es'] } } });
    const builds = Array.isArray(result) ? result : [result];
    const modules = builds.flatMap(item => item.output).filter(item => item.type === 'chunk').flatMap(item => Object.keys(item.modules));
    assert(modules.some(id => id.replaceAll('\\', '/').endsWith('/packages/shared/dist/index.js')));
    for (const id of modules) assert(!/node_modules|server\/|__vite-browser-external/.test(id.replaceAll('\\', '/')), id);
});
const cleanupRoot = path.join(tmpdir(), 'nexlift-stabilization-tests-AAA111');
const cleanupLog = (directory = cleanupRoot, filename = 'postgres.private.log') =>
    `ℹ tests 31\nℹ pass 31\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\n` +
    `[Error: EBUSY: resource busy or locked, unlink '${path.join(directory, filename)}']\ncode: 'EBUSY', syscall: 'unlink'`;
test('cleanup retry recognizes only all 31 passed cases and the expected disposable log', () => {
    assert.equal(passedOfflineCleanupTarget(cleanupLog(), tmpdir()), cleanupRoot);
});
test('cleanup retry never accepts failed, skipped or cancelled assertions', () => {
    for (const field of ['fail', 'skipped', 'cancelled']) assert.equal(passedOfflineCleanupTarget(cleanupLog().replace(`${field} 0`, `${field} 1`), tmpdir()), null);
    assert.equal(passedOfflineCleanupTarget(cleanupLog().replace('pass 31', 'pass 30'), tmpdir()), null);
});
test('cleanup retry rejects other errors, files, counts and directories', () => {
    for (const log of [cleanupLog().replaceAll('EBUSY', 'EACCES'), cleanupLog(cleanupRoot, 'data.db'),
        cleanupLog(path.join(tmpdir(), 'persistent-stage')), cleanupLog().replace('tests 31', 'tests 30')]) {
        assert.equal(passedOfflineCleanupTarget(log, tmpdir()), null);
    }
});
