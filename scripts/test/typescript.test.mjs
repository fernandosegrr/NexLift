import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as legacyImages from '../fixtures/legacy-cloudinary.js';
import { isDependencyUnavailable as legacyFailure } from '../fixtures/legacy-errors.js';
import * as images from '../../client/src/utils/cloudinary.js';
import { isDependencyUnavailable } from '../../server/src/operations/errors.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cloud = 'https://res.cloudinary.com/synthetic/image/upload/v1/example.jpg';
test('TS images: exact legacy results for every option combination and nullish URL', () => {
    for (const url of [null, undefined, '', 'https://example.invalid/image.jpg', cloud, cloud + '?q=1',
        '/relative.jpg', 'https://res.cloudinary.com/x/video/upload/y']) {
        for (const width of [undefined, 0, 360, -1]) for (const height of [undefined, 0, 360])
            for (const crop of [undefined, '', 'fill']) for (const quality of [undefined, 0, 'auto', 80]) {
                const options = { width, height, crop, quality };
                assert.equal(images.cloudinaryThumb(url, options), legacyImages.cloudinaryThumb(url, options));
            }
        assert.equal(images.cloudinaryDisplay(url), legacyImages.cloudinaryDisplay(url));
    }
});
test('TS images: JavaScript callers retain legacy behavior for malformed inputs', () => {
    for (const value of [0, 1, false, true, {}, [], Symbol('x')]) {
        assert.equal(images.cloudinaryThumb(value), legacyImages.cloudinaryThumb(value));
    }
    assert.throws(() => images.cloudinaryThumb(cloud, null), TypeError);
});
test('TS backend: every stable transient code and all non-transient errors retain classification', () => {
    const codes = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037', 'ECONNREFUSED', 'ECONNRESET',
        'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ENOTFOUND', '57P01', '57P02', '57P03',
        '53300', '53400', '57014', '08000', '08P01', 'P2002', 'P2025', '42P01', '', null, 8];
    for (const code of codes) for (const error of [{ code }, { errorCode: code }, { code: 'P2010', meta: { code } }]) {
        assert.equal(isDependencyUnavailable(error), legacyFailure(error));
    }
});
test('TS backend: unknown values, causes, cycles, prototypes and throwing getters retain behavior', () => {
    const cycle = {}; cycle.cause = cycle;
    const nested = depth => depth ? { cause: nested(depth - 1) } : { code: 'P1001' };
    for (const error of [undefined, null, false, true, 0, 3, '', 'P1001', Symbol('x'), 1n, [], {},
        new Error('never inspect secret message'), cycle, ...[0, 1, 2, 3, 4, 5].map(nested),
        Object.create({ code: 'P1001' }), { code: 'P2010', meta: { code: { toString: () => '08000' } } }]) {
        assert.equal(isDependencyUnavailable(error), legacyFailure(error));
    }
    for (const error of [{ code: 'P2010', meta: { code: Symbol('bad-driver-code') } },
        { get code() { throw new RangeError('getter'); } }]) {
        assert.throws(() => legacyFailure(error)); assert.throws(() => isDependencyUnavailable(error));
    }
    const failure = () => { let reads = 0; return { get code() { reads++; return 'P2010'; },
        get meta() { reads++; return { code: 'P2002' }; }, get cause() { return null; }, count: () => reads }; };
    const old = failure(), migrated = failure(); legacyFailure(old); isDependencyUnavailable(migrated);
    assert.equal(migrated.count(), old.count());
});
test('TS runtime: CommonJS loads the compiled backend without TS, shared or a compiler', () => {
    const script = `const {isDependencyUnavailable}=require('./server/src/generated/errors.cjs');
        if(!isDependencyUnavailable({code:'P1001'}))process.exit(1);`;
    const result = spawnSync(process.execPath, ['--input-type=commonjs', '-e', script], { cwd: root, windowsHide: true, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
});
test('TS runtime: React consumers still use the migrated module through their stable JS entry', async () => {
    for (const page of ['BodyTracking', 'Profile']) {
        assert.match(await readFile(path.join(root, `client/src/pages/${page}.jsx`), 'utf8'), /import.*cloudinaryThumb.*from ['"]\.\.\/utils\/cloudinary['"]/);
    }
    assert.equal(images.cloudinaryThumb(cloud, { width: 360, height: 360 }),
        'https://res.cloudinary.com/synthetic/image/upload/w_360,q_auto,f_auto,h_360,c_fill/v1/example.jpg');
});
for (const [workspace, expected] of [['client', 6], ['server', 4], ['packages/shared', 3]]) {
    test(`TS compiler: ${workspace} rejects ${expected} intentionally invalid uses`, () => {
        const configFile = path.join(root, workspace, 'tsconfig.json');
        const config = ts.readConfigFile(configFile, ts.sys.readFile); assert.equal(config.error, undefined);
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFile), undefined, configFile);
        assert.equal(parsed.errors.length, 0);
        assert.equal(parsed.options.strict, true);
        assert(parsed.fileNames.some(file => /\/src\/.*\.(?:ts|cts|tsx)$/.test(file.replaceAll('\\', '/'))));
        const host = ts.createCompilerHost(parsed.options), read = host.readFile.bind(host);
        host.readFile = file => {
            const content = read(file);
            return file.replaceAll('\\', '/').includes('/type-tests/') ? content?.replaceAll('@ts-expect-error', 'expected diagnostic') : content;
        };
        const program = ts.createProgram(parsed.fileNames, parsed.options, host);
        const diagnostics = ts.getPreEmitDiagnostics(program);
        assert.equal(diagnostics.length, expected, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n' }));
        assert(diagnostics.every(item => item.file?.fileName.replaceAll('\\', '/').includes('/type-tests/')));
    });
}
test('TS runtime: compatibility artifacts are self-contained, with relocatable source maps', async () => {
    for (const file of ['client/src/generated/cloudinary.js', 'server/src/generated/errors.cjs']) {
        const code = await readFile(path.join(root, file), 'utf8');
        assert.doesNotMatch(code, /require\(|from ["']@nexlift|[A-Z]:[\\/]/);
        const map = JSON.parse(Buffer.from(code.split('base64,').at(-1).trim(), 'base64'));
        assert.equal(map.file, path.basename(file));
        for (const source of map.sources) {
            assert(!path.isAbsolute(source));
            assert((await readFile(path.resolve(root, path.dirname(file), source), 'utf8')).length > 0);
        }
    }
});
