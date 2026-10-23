import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseRoot = fileURLToPath(new URL('../../', import.meta.url));
export async function artifactManifest(root = releaseRoot) {
    const paths = ['server/build/app/createApp.js', 'server/src/generated/http.cjs', 'server/src/generated/training.cjs',
        'server/src/generated/contracts.cjs', 'client/dist/index.html', 'client/dist/sw.js', 'client/dist/manifest.json',
        'server/prisma/schema.prisma', 'server/audit/database/declared-catalog.json', 'server/audit/postgresql/catalog.sql',
        'server/deploy/operations-catalog.json'];
    const assets = await readdir(path.join(root, 'client/dist/assets'));
    if (!assets.some(file => file.endsWith('.js')) || !assets.some(file => file.endsWith('.css'))) throw new Error('Release assets missing');
    paths.push(...assets.sort().map(file => `client/dist/assets/${file}`));
    const manifest = {};
    for (const file of paths) {
        if (!(await stat(path.join(root, file))).isFile()) throw new Error('Release artifact missing');
        manifest[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    }
    return manifest;
}
