import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../server/', import.meta.url));
let count = 0;
async function check(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await check(file);
        else if (/\.[cm]?js$/.test(entry.name)) {
            const result = spawnSync(process.execPath, ['--check', file], { windowsHide: true, encoding: 'utf8' });
            if (result.status !== 0) throw new Error(`Syntax failed: ${path.relative(root, file)}\n${result.stderr}`);
            count++;
        }
    }
}
await check(path.join(root, 'src'));
console.log(`Backend validation: ${count} JavaScript modules; no database connection or schema writes`);
