import { assertNoSecrets, createDatabase, storageError } from './database.js';
import { createCoordination } from './coordination.js';
import { createOperationRepository } from './operationRepository.js';
import { createMigrationService, inspectLegacy } from './migrationService.js';
import { createDraftRepository } from './draftRepository.js';
import { getSessionIdentity } from '../services/offlineQueue.js';
import { createConflictRepository } from './conflictRepository.js';
import { sealLocalBackup } from './localBackup.js';

// Two opt-ins are required. No DB is opened merely by importing this module.
export const indexedStorageEnabled = import.meta.env.VITE_INDEXEDDB_ENABLED === 'true'
    && import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED === 'true';
export const conflictResolutionEnabled = indexedStorageEnabled && import.meta.env.VITE_CONFLICT_RESOLUTION_ENABLED === 'true';
export function createStorageRuntime({ name, storage = globalThis.localStorage, events = globalThis.window,
    locks = globalThis.navigator?.locks, identity = getSessionIdentity, now = Date.now, checkpoint, conflictsEnabled = conflictResolutionEnabled,
    channelFactory = channelName => typeof BroadcastChannel === 'function' ? new BroadcastChannel(channelName) : null } = {}) {
    const listeners = new Set(); let health = { status: 'preparing', error: null }, opened, closed = false, lastFailure;
    const notifyLocal = () => { for (const listener of listeners) { try { listener(); } catch { /* observer */ } } };
    const channel = channelFactory(`${name || 'nexlift-offline'}:changes`);
    const notify = () => { notifyLocal(); channel?.postMessage({ type: 'changed' }); };
    if (channel) channel.onmessage = notifyLocal;
    const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
    const reportError = error => {
        const changed = lastFailure?.message !== error.message;
        lastFailure = error; health = { ...health, status: 'error', error: error.message, code: error.code };
        if (changed) notifyLocal();
    };
    const db = createDatabase({ name, conflictsEnabled, onHealth: patch => { health = patch; notifyLocal(); } });
    const migration = createMigrationService({ db, storage, notify, now, checkpoint });
    async function ready() {
        try {
            if (closed) throw storageError(new Error('Closed storage runtime'));
            // Dexie 4 can adapt to a newer physical schema: fail closed here
            // instead of assuming forward compatibility of the data contract.
            opened ??= db.open().then(() => {
                // Dexie keeps verno at the DECLARED version when it adapts to
                // a newer database. Inspect the native physical version too.
                const version = conflictsEnabled ? 3 : 2;
                if (db.verno !== version || db.backendDB().version !== version * 10) throw Object.assign(new Error('Unsupported schema version'), { name: 'VersionError' });
            });
            await opened;
            const result = await migration.reconcile();
            health = { status: lastFailure ? 'error' : 'ready', error: lastFailure?.message || null, migration: result }; return result;
        } catch (cause) {
            const error = storageError(cause), changed = health.status !== 'error' || health.error !== error.message;
            health = { status: 'error', error: error.message, code: error.code };
            if (changed) notifyLocal();
            throw error;
        }
    }
    const coordination = createCoordination({ db, locks, now });
    const conflicts = conflictsEnabled ? createConflictRepository({ db, ready, identity, notify, coordination, now, onError: reportError }) : null;
    const store = createOperationRepository({ db, ready, coordination, notify, subscribe, now, onError: reportError,
        onState: conflicts ? (row, patch) => conflicts.onState(row, patch) : undefined });
    if (conflicts) {
        store.supportsPreserved = true;
        store.processingList = (ownerId, items) => conflicts.processingList(ownerId, items);
    }
    const drafts = createDraftRepository({ db, ready, identity, notify, now, onError: reportError });
    const changed = event => {
        if (event.key === null || event.key?.startsWith('nexlift_') || event.key?.startsWith('workout_')) {
            void ready().then(notifyLocal).catch(() => {});
        }
    };
    events?.addEventListener('storage', changed);
    return { db, store, drafts, conflicts, ready, subscribe, health: () => health,
        async summary(ownerId) {
            await ready();
            if (identity()?.ownerId !== ownerId) throw new Error('La cuenta cambió.');
            const pending = await db.transaction('r', db.operations, async () => {
                const [total, confirmed, preserved] = await Promise.all([
                    db.operations.where('ownerId').equals(ownerId).count(),
                    db.operations.where('[ownerId+status]').equals([ownerId, 'confirmed']).count(),
                    db.operations.where('[ownerId+status]').equals([ownerId, 'resolved_preserved']).count()
                ]);
                return total - confirmed - preserved;
            });
            return { health, pending,
                drafts: (await drafts.list(ownerId)).length,
                legacy: await db.sources.filter(row => row.status === 'blocked' && (row.ownerId === ownerId || row.ownerId === null)).count() };
        },
        async export(ownerId, { includeUnassigned = false } = {}) {
            if (identity()?.ownerId !== ownerId) throw new Error('La cuenta cambió.');
            let available = true;
            try { await ready(); } catch { available = false; }
            const original = inspectLegacy(storage).filter(source => {
                try { assertNoSecrets(source.raw); } catch { return false; }
                try {
                    if (source.key.startsWith('nexlift_operation_v1:')) return decodeURIComponent(source.key.split(':')[1]) === ownerId;
                    const data = JSON.parse(source.raw);
                    return data?.ownerId === ownerId || (includeUnassigned && !data?.ownerId);
                } catch { return includeUnassigned; }
            });
            const data = { format: 'nexlift-local-backup', version: 1, ownerId, createdAt: new Date(now()).toISOString(), available, originals: original };
            if (available) await db.transaction('r', db.tables, async () => {
                data.operations = await db.operations.where('ownerId').equals(ownerId).toArray();
                data.events = await db.events.filter(row => row.ownerId === ownerId).toArray();
                data.receipts = await db.receipts.where('ownerId').equals(ownerId).toArray();
                data.drafts = await db.drafts.filter(row => row.ownerId === ownerId).toArray();
                data.draftVersions = await db.draftVersions.filter(row => row.ownerId === ownerId).toArray();
                data.sources = await db.sources.filter(row => row.ownerId === ownerId || (includeUnassigned && row.ownerId === null)).toArray();
                data.migration = await db.metadata.get('migration');
                if (conflicts) {
                    data.conflicts = await db.conflicts.where('ownerId').equals(ownerId).toArray();
                    data.conflictHistory = await db.conflictHistory.filter(row => row.ownerId === ownerId).toArray();
                }
            });
            if (identity()?.ownerId !== ownerId) throw new Error('La cuenta cambió.');
            const sealed = await sealLocalBackup(data);
            if (identity()?.ownerId !== ownerId) throw new Error('La cuenta cambió.');
            return sealed;
        },
        close() { closed = true; events?.removeEventListener('storage', changed); channel?.close(); db.close(); }
    };
}
let singleton;
export const getStorageRuntime = () => singleton ??= createStorageRuntime();
