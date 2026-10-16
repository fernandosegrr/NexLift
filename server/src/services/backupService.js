// Backup automático diario (P0 del plan de mejoras): sube un export JSON completo
// de los datos del usuario a Cloudinary como recurso `raw` + `authenticated` (no
// público — el JSON incluye datos personales como peso/composición corporal, y a
// diferencia de las fotos no necesita ser servido directo a un <img>). Reutiliza
// el cliente/credenciales de Cloudinary que uploadPhoto() ya configura en index.js
// (cloudinary.config() es estado global del SDK, no hace falta repetirlo aquí).
import { v2 as cloudinary } from 'cloudinary';

const BACKUP_FOLDER = 'nexlift-backups';
const MAX_BACKUPS_TO_KEEP = 14;

export async function uploadBackup(backupData) {
    const json = JSON.stringify(backupData);
    const base64 = `data:application/json;base64,${Buffer.from(json, 'utf-8').toString('base64')}`;
    // Nombre ordenable cronológicamente para no depender de `created_at` al listar,
    // con el username para poder identificar de quién es a simple vista.
    const who = backupData.user?.username || 'user';
    const publicId = `${BACKUP_FOLDER}/backup-${who}-${backupData.generatedAt.replace(/[:.]/g, '-')}`;
    const result = await cloudinary.uploader.upload(base64, {
        resource_type: 'raw',
        type: 'authenticated',
        public_id: publicId,
        overwrite: false
    });
    return result;
}

export async function listBackups() {
    const { resources } = await cloudinary.api.resources({
        resource_type: 'raw',
        type: 'authenticated',
        prefix: `${BACKUP_FOLDER}/`,
        max_results: 500
    });
    return resources.sort((a, b) => b.public_id.localeCompare(a.public_id)); // más reciente primero
}

// Borra todo lo que exceda MAX_BACKUPS_TO_KEEP, quedándose con los más recientes.
export async function pruneOldBackups() {
    const backups = await listBackups();
    const toDelete = backups.slice(MAX_BACKUPS_TO_KEEP);
    for (const backup of toDelete) {
        await cloudinary.uploader.destroy(backup.public_id, { resource_type: 'raw', type: 'authenticated' }).catch(() => {});
    }
    return { kept: Math.min(backups.length, MAX_BACKUPS_TO_KEEP), deleted: toDelete.length };
}

// URL firmada de corta duración para descargar un backup `authenticated` — nunca
// es público, así que restaurar requiere generar esta URL con las credenciales
// del server (ver server/restore-backup.mjs).
export function getBackupDownloadUrl(publicId) {
    return cloudinary.utils.private_download_url(publicId, 'json', {
        resource_type: 'raw',
        type: 'authenticated'
    });
}

export { normalizeBackupBodyLog, normalizeBackupBodyLogs } from '../logic.js';

