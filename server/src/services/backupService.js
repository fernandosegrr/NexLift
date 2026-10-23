import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { checksum, validateBackup, BackupError } from './backupFormat.js';

const ROOT = 'nexlift-backups';
export const MAX_BACKUPS_TO_KEEP = 14;
export const userBackupPrefix = userId => {
    if (typeof userId !== 'string' || !userId) throw new BackupError('Se requiere un usuario para operar respaldos.');
    return `${ROOT}/users/${checksum(userId)}/`;
};
const owns = (id, userId) => typeof id === 'string' && id.startsWith(userBackupPrefix(userId)) && !id.slice(userBackupPrefix(userId).length).includes('/');

export function createCloudBackupStore(sdk = cloudinary, fetcher = fetch) {
    const getBackupDownloadUrl = (publicId, userId, { allowLegacy = false } = {}) => {
        if (!owns(publicId, userId) && !(allowLegacy && /^nexlift-backups\/backup-[^/]+$/.test(publicId))) throw new BackupError('Respaldo fuera del ámbito del usuario.', 403);
        return sdk.utils.private_download_url(publicId, 'json', {
            resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300, attachment: true
        });
    };
    const listBackups = async userId => {
        const resources = [];
        const seenCursors = new Set();
        let next_cursor;
        do {
            const page = await sdk.api.resources({ resource_type: 'raw', type: 'authenticated', prefix: userBackupPrefix(userId), max_results: 500, ...(next_cursor ? { next_cursor } : {}) });
            if (!Array.isArray(page.resources)) throw new BackupError('Listado de respaldos incompleto.', 502);
            resources.push(...page.resources.filter(r => owns(r.public_id, userId)));
            if (page.next_cursor && seenCursors.has(page.next_cursor)) throw new BackupError('Paginación de Cloudinary detenida.', 502);
            if (page.next_cursor) seenCursors.add(page.next_cursor);
            next_cursor = page.next_cursor;
        } while (next_cursor);
        if (resources.some(r => !Number.isFinite(Date.parse(r.created_at)))) throw new BackupError('Cloudinary devolvió una fecha inválida; no se poda.', 502);
        return [...new Map(resources.map(r => [r.public_id, r])).values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.public_id.localeCompare(a.public_id));
    };
    const uploadBackup = async input => {
        const data = validateBackup(input);
        const userId = data.source.userId;
        const publicId = `${userBackupPrefix(userId)}${data.generatedAt.replace(/[:.]/g, '-')}_${randomUUID()}.json`;
        const result = await sdk.uploader.upload(`data:application/json;base64,${Buffer.from(JSON.stringify(data)).toString('base64')}`, {
            resource_type: 'raw', type: 'authenticated', public_id: publicId, overwrite: false
        });
        if (result.public_id !== publicId || result.type !== 'authenticated' || result.resource_type !== 'raw') throw new BackupError('Cloudinary no confirmó el almacenamiento privado esperado.', 502);
        const response = await fetcher(getBackupDownloadUrl(publicId, userId), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new BackupError('No se pudo verificar el respaldo subido.', 502);
        if (validateBackup(await response.json()).integrity.sha256 !== data.integrity.sha256) throw new BackupError('El respaldo descargado no coincide con el original.', 502);
        return { public_id: publicId, storageVerified: true, restoreVerified: false };
    };
    const pruneOldBackups = async (userId, { dryRun = true } = {}) => {
        const resources = await listBackups(userId);
        const candidates = resources.slice(MAX_BACKUPS_TO_KEEP);
        let deleted = 0;
        let alreadyAbsent = 0;
        if (!dryRun) {
            for (const resource of candidates) {
                if (!owns(resource.public_id, userId)) throw new BackupError('Retención fuera de ámbito.', 403);
                const result = await sdk.uploader.destroy(resource.public_id, { resource_type: 'raw', type: 'authenticated', invalidate: true });
                if (!['ok', 'not found'].includes(result.result)) throw new BackupError('Cloudinary no confirmó la poda.', 502, { deleted });
                if (result.result === 'ok') deleted++;
                else alreadyAbsent++;
            }
        }
        return { dryRun, kept: dryRun ? resources.length : resources.length - deleted - alreadyAbsent, deleted, alreadyAbsent, candidates: candidates.map(r => r.public_id), retention: MAX_BACKUPS_TO_KEEP };
    };
    return { uploadBackup, listBackups, pruneOldBackups, getBackupDownloadUrl };
}
export const { uploadBackup, listBackups, pruneOldBackups, getBackupDownloadUrl } = createCloudBackupStore();
export { normalizeBackupBodyLog, normalizeBackupBodyLogs } from '../logic.js';
