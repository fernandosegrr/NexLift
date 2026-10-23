import assert from 'node:assert/strict';
import { createRequire, isBuiltin } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const client = fileURLToPath(new URL('../client/', import.meta.url));
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const modules = new Set();
await build({ root: client, configFile: path.join(client, 'vite.config.js'), envFile: false, logLevel: 'error',
    build: { write: false }, plugins: [{ name: 'verify-browser-boundaries', generateBundle() {
        for (const id of this.getModuleIds()) {
            const normalized = id.replaceAll('\\', '/'); modules.add(normalized);
            assert(!/\/(?:server\/(?:src|node_modules)|node_modules\/@prisma|node_modules\/\.prisma)\//.test(normalized), `Server module in browser graph: ${normalized}`);
            assert(!isBuiltin(id), `Node builtin in browser graph: ${id}`);
            assert(!/(?:^|\/)\.env(?:\.|$)|\.(?:pgpass|pem|key)$/.test(normalized), 'Private file in browser graph');
        }
    } }] });
assert(modules.size > 0);
console.log(`Browser graph verified: ${modules.size} modules; no server, Prisma, Node builtins or private files`);
