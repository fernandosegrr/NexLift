// Migra las fotos que ya están alojadas en Catbox (avatarUrl de User, photoUrl de
// BodyLog) a Cloudinary, y actualiza la URL guardada en cada registro.
//
// Requiere CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en server/.env (ver
// server/.env.example). Corre una sola vez cuando esas variables ya estén
// configuradas: `node migrate-catbox-to-cloudinary.mjs`. Es seguro volver a
// correrlo — solo toca registros cuya URL todavía empiece con
// https://files.catbox.moe/, así que los ya migrados se saltan solos.
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('Faltan CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en .env — no se puede migrar sin credenciales.');
    process.exit(1);
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const prisma = new PrismaClient();
const CATBOX_PREFIX = 'https://files.catbox.moe/';

async function migrateField(modelName, urlField) {
    const records = await prisma[modelName].findMany({
        where: { [urlField]: { startsWith: CATBOX_PREFIX } }
    });
    console.log(`${modelName}.${urlField}: ${records.length} registro(s) en Catbox por migrar`);

    let ok = 0, fail = 0;
    for (const record of records) {
        const oldUrl = record[urlField];
        try {
            // Cloudinary puede subir directo desde una URL remota, sin descargarla a mano.
            const result = await cloudinary.uploader.upload(oldUrl, { folder: 'nexlift' });
            await prisma[modelName].update({
                where: { id: record.id },
                data: { [urlField]: result.secure_url }
            });
            console.log(`  OK ${record.id}: ${oldUrl} -> ${result.secure_url}`);
            ok++;
        } catch (error) {
            console.error(`  FALLO ${record.id} (${oldUrl}): ${error.message}`);
            fail++;
        }
    }
    console.log(`${modelName}.${urlField}: ${ok} migrados, ${fail} fallidos\n`);
}

await migrateField('user', 'avatarUrl');
await migrateField('bodyLog', 'photoUrl');

await prisma.$disconnect();
console.log('Migración completa.');
