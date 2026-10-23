// Root-owned compiler/bundler: no application lifecycle, .env or database access.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile, cp, rename, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] || 'all';
assert(['all', 'client', 'server', 'check'].includes(mode));
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
function compile(project) {
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', project],
        { cwd: root, windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
}
compile('packages/shared/tsconfig.build.json');
if (mode !== 'server') compile('client/tsconfig.build.json');
if (mode !== 'client') compile('server/tsconfig.build.json');
// Handwritten declarations describe unchanged JS ports; preserve them beside
// emitted declarations so both declaration trees resolve after compilation.
for (const [target, files] of [['client', ['utils/routineDays.d.ts']], ['server', ['logic.d.ts', 'services/operationHash.d.ts']]]) {
    if (mode !== 'all' && mode !== 'check' && mode !== target) continue;
    for (const file of files) {
        const destination = path.join(root, target, 'build', file);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(path.join(root, target, 'src', file), destination);
    }
}
const entries = [
    ['client', 'client/src/utils/cloudinary.ts', 'client/src/generated/cloudinary.js'],
    ['server', 'server/src/operations/errors.ts', 'server/src/generated/errors.cjs'],
    ['server', 'server/src/app/transport.ts', 'server/src/generated/http.cjs'],
    ['client', 'client/src/services/contracts.ts', 'client/src/generated/contracts.js'],
    ['server', 'server/src/contracts.ts', 'server/src/generated/contracts.cjs'],
    ['client', 'client/src/utils/routinePayload.ts', 'client/src/generated/routinePayload.js'],
    ['client', 'client/src/services/routineResponse.ts', 'client/src/generated/routineResponse.js'],
    ['client', 'client/src/services/operationLabels.ts', 'client/src/generated/operationLabels.js'],
    ['server', 'server/src/services/operationContract.ts', 'server/src/generated/operationContract.cjs'],
    ['server', 'server/src/services/routineImportContract.ts', 'server/src/generated/routineImportContract.cjs'],
    ['client', 'client/src/domain/training.ts', 'client/src/generated/training.js'],
    ['server', 'server/src/domain/training.ts', 'server/src/generated/training.cjs'],
    ['server', 'server/src/domain/coach.ts', 'server/src/generated/coach.cjs'],
    ['client', 'client/src/domain/coach.ts', 'client/src/generated/coach.js']
];
const pendingWrites = [];
for (const [target, entry, output] of entries.filter(([target]) => mode === 'all' || mode === 'check' || mode === target)) {
    // These adapters share the SAME error constructors with the existing JS
    // consumers. Externalize the established runtime ports rather than bundle
    // another copy of the shared classes or the sporting algorithms.
    const ports = entry.includes('/services/') && target === 'server' ? {
        '@nexlift/shared': './contracts.cjs', '../logic.js': '../logic.js', './operationHash.js': '../services/operationHash.js'
    } : {};
    const result = await build({ root, configFile: false, envFile: false, logLevel: 'error',
        build: { write: false, minify: false, sourcemap: 'inline', target: 'es2022',
            ...(target === 'client' ? { lib: { entry: path.join(root, entry), formats: ['es'] } } :
                { ssr: path.join(root, entry) }),
            rollupOptions: { external: id => Object.keys(ports).includes(id) || Object.keys(ports).some(port => port.startsWith('.') && id === path.resolve(path.dirname(path.join(root, entry)), port).replaceAll('\\', '/')),
                output: { format: target === 'client' ? 'es' : 'cjs', exports: 'named', paths: id => ports[id] || Object.entries(ports).find(([port]) => port.startsWith('.') && id.replaceAll('\\', '/') === path.resolve(path.dirname(path.join(root, entry)), port).replaceAll('\\', '/'))?.[1] || id } } },
        ssr: { noExternal: ['@nexlift/shared'] } });
    const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output).filter(item => item.type === 'chunk');
    assert.equal(chunks.length, 1, `${target}: expected one self-contained artifact`);
    assert(chunks[0].imports.every(id => Object.values(ports).includes(id) || Object.keys(ports).includes(id)), `Only declared local runtime ports may enter compatibility artifacts: ${JSON.stringify(chunks[0].imports)}`);
    const file = path.join(root, output);
    // Rollup's in-memory map assumes root/dist. Relocate it to the actual,
    // versioned compatibility artifact without embedding machine-specific paths.
    const code = chunks[0].code.replace(/sourceMappingURL=data:application\/json[^,]*;base64,([^\s]+)/, (_, encoded) => {
        const map = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        map.file = path.basename(output);
        map.sources = map.sources.map(source => path.relative(path.dirname(file), path.resolve(root, 'dist', source)).replaceAll('\\', '/'));
        return 'sourceMappingURL=data:application/json;base64,' + Buffer.from(JSON.stringify(map)).toString('base64');
    });
    const content = '// GENERATED from TypeScript by npm run build:typed; do not edit.\n' + code;
    if (mode === 'check') assert.equal(await readFile(file, 'utf8'), content, `${output} is stale; run npm run build:typed`);
    else pendingWrites.push({ file, content });
    console.log(`${mode === 'check' ? 'Verified' : 'Generated'} ${output} (${chunks[0].imports.length} declared runtime ports)`);
}
// No compatibility artifact changes until EVERY compilation and bundle succeeds.
// Atomic per-file replacement also prevents Vite from reading partial JS.
for (const { file, content } of pendingWrites) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.private.${process.pid}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, file);
}
// Complete Node ESM runtime tree: emitted TS imports the established JS services.
// No tsx/ts-node/TypeScript loader or dev dependency is needed at runtime.
if (mode !== 'client' && mode !== 'check') {
    async function copyRuntime(relative = '') {
        for (const entry of await readdir(path.join(root, 'server/src', relative), { withFileTypes: true })) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) await copyRuntime(name);
            else if (/(?:\.[cm]?js|\.d\.ts)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
                const output = path.join(root, 'server/build', name);
                await mkdir(path.dirname(output), { recursive: true });
                await cp(path.join(root, 'server/src', name), output);
            }
        }
    }
    await copyRuntime();
}
