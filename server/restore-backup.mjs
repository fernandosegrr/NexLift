// Explicit destination only; never loads .env. Dry-run unless --apply is present.
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { readFile } from 'node:fs/promises';
import { restoreBackup } from './src/services/backupRestore.js';
import { listBackups, getBackupDownloadUrl } from './src/services/backupService.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const i = a.indexOf('=');
    return [a.slice(2, i < 0 ? undefined : i), i < 0 ? true : a.slice(i + 1)];
}));
if (args.help) {
    console.log('NEXLIFT_RESTORE_DATABASE_URL=<destino> node restore-backup.mjs --file=backup.json --user=cuenta [--apply] [--allow-incomplete] [--restore-profile]\nCloudinary: --source-user-id=<id> [--public-id=<id>] [--allow-legacy-cloud]. Sin --public-id se selecciona el más reciente SOLO del usuario de origen. No carga .env.');
    process.exit(0);
}
if (!process.env.NEXLIFT_RESTORE_DATABASE_URL) throw new Error('Defina NEXLIFT_RESTORE_DATABASE_URL explícitamente. No se usa DATABASE_URL ni .env.');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.NEXLIFT_RESTORE_DATABASE_URL } } });
try {
    let data;
    if (args.file) data = JSON.parse(await readFile(args.file, 'utf8'));
    else {
        if (!args['source-user-id']) throw new Error('Cloudinary requiere --source-user-id.');
        cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
        const publicId = args['public-id'] || (await listBackups(args['source-user-id']))[0]?.public_id;
        if (!publicId) throw new Error('No hay respaldos en el nuevo namespace del usuario. Legacy requiere --public-id explícito y --allow-legacy-cloud.');
        const response = await fetch(getBackupDownloadUrl(publicId, args['source-user-id'], { allowLegacy: args['allow-legacy-cloud'] === true }), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Descarga falló (${response.status}).`);
        data = await response.json();
    }
    const username = args.user || data.data?.User?.[0]?.username || data.user?.username;
    if (!username) throw new Error('Indique --user=<cuenta existente>.');
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true } });
    if (!user) throw new Error('La cuenta destino debe existir. Regístrela mediante el procedimiento habitual.');
    const result = await restoreBackup(prisma, data, user.id, { dryRun: args.apply !== true, allowIncomplete: args['allow-incomplete'] === true, restoreProfile: args['restore-profile'] === true });
    console.log(JSON.stringify({ ...result, idMap: undefined }, null, 2));
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, ...error.details }, null, 2));
    process.exitCode = 1;
} finally { await prisma.$disconnect(); }
