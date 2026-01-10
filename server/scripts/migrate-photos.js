/**
 * Script de Migración: Base64 → Catbox URLs
 * 
 * Este script migra todas las fotos almacenadas en base64 en la tabla BodyLog
 * a URLs de Catbox.moe, liberando espacio en la base de datos.
 * 
 * Uso: cd server && node scripts/migrate-photos.js
 */

import { PrismaClient } from '@prisma/client';
import FormData from 'form-data';
import fetch from 'node-fetch';

const prisma = new PrismaClient();
const CATBOX_API = 'https://catbox.moe/user/api.php';

/**
 * Upload base64 image to Catbox
 */
async function uploadBase64ToCatbox(base64Data, extension = 'jpg') {
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    const filename = `nexlift_${Date.now()}.${extension}`;

    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { filename });

    const response = await fetch(CATBOX_API, {
        method: 'POST',
        body: form
    });

    if (!response.ok) {
        throw new Error(`Catbox upload failed: ${response.status}`);
    }

    const url = await response.text();
    return url.trim();
}

async function migratePhotos() {
    console.log('🔍 Buscando fotos en base64...\n');

    // Buscar registros con photoUrl que parece ser base64 (empieza con data: o es muy largo)
    const logsWithPhotos = await prisma.bodyLog.findMany({
        where: {
            photoUrl: { not: null }
        },
        select: {
            id: true,
            photoUrl: true,
            date: true
        }
    });

    // Filtrar solo los que son base64 (no URLs)
    const toMigrate = logsWithPhotos.filter(log => {
        if (!log.photoUrl) return false;
        return log.photoUrl.startsWith('data:image') ||
            (log.photoUrl.length > 500 && !log.photoUrl.startsWith('http'));
    });

    console.log(`📊 Total registros con foto: ${logsWithPhotos.length}`);
    console.log(`📷 Fotos en base64 a migrar: ${toMigrate.length}\n`);

    if (toMigrate.length === 0) {
        console.log('✅ No hay fotos en base64 para migrar. ¡Todo limpio!');
        return;
    }

    let migrated = 0;
    let failed = 0;

    for (const log of toMigrate) {
        try {
            process.stdout.write(`⏳ Migrando ${log.id} (${new Date(log.date).toLocaleDateString()})... `);

            const catboxUrl = await uploadBase64ToCatbox(log.photoUrl, 'jpg');

            await prisma.bodyLog.update({
                where: { id: log.id },
                data: { photoUrl: catboxUrl }
            });

            console.log(`✅ ${catboxUrl}`);
            migrated++;

            // Pequeña pausa para no sobrecargar Catbox
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            failed++;
        }
    }

    console.log('\n========================================');
    console.log(`📈 Migración completada:`);
    console.log(`   ✅ Exitosas: ${migrated}`);
    console.log(`   ❌ Fallidas: ${failed}`);
    console.log('========================================\n');
}

migratePhotos()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
