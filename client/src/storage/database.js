import Dexie from 'dexie';

export const DATABASE_NAME = 'nexlift-offline';
export const STORAGE_VERSION = 2;
export const schemaV1 = {
    operations: '[ownerId+id],ownerId,[ownerId+status],createdAt,*dependsOn',
    events: '[ownerId+operationId+id],[ownerId+operationId]',
    receipts: '[ownerId+operationId],ownerId,confirmedAt',
    drafts: '[ownerId+id],[ownerId+kind+resourceId],updatedAt',
    draftVersions: '[ownerId+id+version],[ownerId+id]',
    sources: '&id,key,ownerId,status', metadata: '&key', leases: '&key'
};
export function createDatabase({ name = DATABASE_NAME, onHealth = () => {}, conflictsEnabled = false } = {}) {
    const db = new Dexie(name);
    db.version(1).stores(schemaV1);
    // Explicit, additive upgrade. Never delete/recreate the user's database.
    db.version(2).stores({ sources: '&id,key,ownerId,status,type' }).upgrade(tx =>
        tx.table('metadata').put({ key: 'schema', version: STORAGE_VERSION }));
    if (conflictsEnabled) db.version(3).stores({
        conflicts: '[ownerId+id],ownerId,[ownerId+operationId],[ownerId+status]',
        conflictHistory: '[ownerId+conflictId+id],[ownerId+conflictId]'
    }).upgrade(tx => tx.table('metadata').put({ key: 'schema', version: 3 }));
    db.on('blocked', () => onHealth({ status: 'blocked', error: 'Cierra las otras pestañas de NexLift para preparar el almacenamiento.' }));
    db.on('versionchange', () => { db.close(); onHealth({ status: 'versionchange', error: 'Hay una versión nueva. Recarga esta pestaña; tus datos se conservan.' }); });
    return db;
}
export function storageError(cause) {
    if (cause?.isStorageError) return cause;
    const name = cause?.name || 'StorageError';
    const messages = {
        QuotaExceededError: 'No hay espacio para guardar en este dispositivo. Exporta tus datos y libera espacio.',
        VersionError: 'El almacenamiento pertenece a una versión más reciente. Actualiza NexLift.',
        DatabaseClosedError: 'El almacenamiento se cerró. Recarga NexLift para recuperar tus datos.',
        MissingAPIError: 'Este navegador no permite el almacenamiento offline. Conserva esta pantalla y exporta tus datos.'
    };
    return Object.assign(new Error(messages[name] || 'No pudimos guardar o leer los datos de este dispositivo. Conserva esta pantalla y exporta tus datos.', { cause }),
        { isStorageError: true, code: name });
}
// Reject accidental credentials, including in legacy records, before any IDB write.
export function assertNoSecrets(value) {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    if (/"(?:token|accessToken|refreshToken|authorization|password|secret|jwt|credentialDigest)"\s*:/i.test(raw)
        || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(raw)) {
        throw new Error('Sensitive local record: retained only in its original storage');
    }
}
export const clone = value => structuredClone(value);
