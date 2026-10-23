// Generate from a temporary schema: Prisma must never discover server/.env.
import { mkdtemp, readFile, writeFile, realpath, rm, symlink, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const cli = require.resolve('prisma/build/index.js');
const output = path.resolve(path.dirname(require.resolve('@prisma/client/package.json')), '../../.prisma/client');
const parent = await realpath(tmpdir());
const root = await mkdtemp(path.join(parent, 'nexlift-generate-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOME)$/i.test(key)));
Object.assign(env, { DATABASE_URL: '', PRISMA_SKIP_POSTINSTALL_GENERATE: 'true', PRISMA_GENERATE_SKIP_AUTOINSTALL: 'true',
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' });
let linked = false;
async function cleanup() {
    const actual = await realpath(root);
    if (path.dirname(actual) !== parent || !path.basename(actual).startsWith('nexlift-generate-')) throw new Error('Unsafe temporary path');
    if (linked) await unlink(path.join(actual, 'node_modules'));
    await rm(actual, { recursive: true, force: true });
}
try {
    // Resolve the already installed Client without allowing Prisma to download it.
    await writeFile(path.join(root, 'package.json'), '{"private":true}');
    await symlink(path.resolve(output, '../..'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    linked = true;
    const original = await readFile(new URL('../server/prisma/schema.prisma', import.meta.url), 'utf8');
    const schema = original.replace(/generator client\s*\{/, match => `${match}\n  output = ${JSON.stringify(output.replaceAll('\\', '/'))}`);
    if (schema === original) throw new Error('Expected Prisma client generator');
    const file = path.join(root, 'schema.prisma'); await writeFile(file, schema);
    const result = spawnSync(process.execPath, [cli, 'generate', '--schema', file], {
        cwd: root, env, windowsHide: true, stdio: 'inherit'
    });
    if (result.status !== 0) throw new Error('Offline Prisma generation failed');
    console.log(`Generated Prisma Client for ${fileURLToPath(new URL('../server/', import.meta.url))}`);
} finally {
    await cleanup();
}
