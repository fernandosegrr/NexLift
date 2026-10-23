import { assertNoSecrets, clone, storageError } from './database.js';
import { canonicalJSON, normalizePayload, payloadHash, verifyReceipt } from '../services/operationProtocol.js';
import { mexicoCityDateStr } from '../utils/dates.js';
import { verifySnapshot } from '../services/sessionChanges.js';
import Dexie from 'dexie';

const statuses = new Set(['pending', 'syncing', 'confirmed', 'retry_scheduled', 'paused_auth', 'conflict',
    'blocked_validation', 'blocked_forbidden', 'blocked_incompatible', 'blocked_dependency', 'blocked_migration', 'resolved_preserved']);
const stateKeys = ['status', 'attempts', 'lastError', 'errorCode', 'nextRetryAt', 'receipt', 'confirmedAt'];
export async function validateEnvelope(item) {
    assertNoSecrets(item);
    if (item?.format !== 1 || typeof item.ownerId !== 'string' || !item.ownerId || item.id !== item.payload?.operationId
        || !Array.isArray(item.dependsOn) || item.dependsOn.some(id => typeof id !== 'string' || id === item.id) || new Set(item.dependsOn).size !== item.dependsOn.length
        || !Number.isFinite(item.createdAt) || !statuses.has(item.initialStatus) || ['confirmed', 'resolved_preserved'].includes(item.initialStatus)
        || canonicalJSON(normalizePayload(item.payload)) !== canonicalJSON(item.payload)
        || item.originalDay !== mexicoCityDateStr(item.payload.performedAt)
        || await payloadHash(item.payload) !== item.requestHash) throw new Error('Invalid immutable operation envelope');
    if (item.baseSnapshot) await verifySnapshot(item.baseSnapshot, item.ownerId, item.payload.logId, item.payload.expectedVersion);
}
export function statePatch(event, { preserveOriginal = false } = {}) {
    assertNoSecrets(event);
    if (!statuses.has(event.status) || (event.status === 'resolved_preserved' && !preserveOriginal) || (event.attempts !== undefined && (!Number.isInteger(event.attempts) || event.attempts < 0))
        || (event.nextRetryAt != null && !Number.isFinite(event.nextRetryAt))) throw new Error('Invalid operation state');
    return Object.fromEntries(stateKeys.filter(key => Object.hasOwn(event, key)).map(key => [key, clone(event[key])]));
}
export const sameEnvelope = (a, b) => canonicalJSON(a.envelope) === canonicalJSON(b);
export function operationRow(envelope) {
    return { ownerId: envelope.ownerId, id: envelope.id, envelope: clone(envelope), status: envelope.initialStatus,
        attempts: 0, createdAt: envelope.createdAt, dependsOn: envelope.dependsOn };
}
// Only IndexedDB operations in this function: also used by the resumable importer.
export async function applyEvent(db, row, event, options) {
    const patch = statePatch(event, options);
    if (patch.status === 'confirmed') verifyReceipt(row.envelope, patch.receipt, patch.receipt?.replayed ? 200 : 201);
    const historyKey = [row.ownerId, row.id, event.id];
    const old = await db.events.get(historyKey);
    if (old) {
        if (canonicalJSON(old.event) !== canonicalJSON(event)) throw new Error('Conflicting event identity');
        return;
    }
    await db.events.add({ ownerId: row.ownerId, operationId: row.id, id: event.id, event: clone(event) });
    if (['confirmed', 'resolved_preserved'].includes(row.status)) return;
    if (patch.status === 'confirmed') {
        await db.receipts.put({ ownerId: row.ownerId, operationId: row.id, receipt: clone(patch.receipt), confirmedAt: patch.confirmedAt });
    }
    row.attempts = Math.max(row.attempts || 0, patch.attempts || 0);
    if (patch.status === 'confirmed' || !row.currentEvent || event.sequence > row.currentEvent.sequence
        || (event.sequence === row.currentEvent.sequence && (event.at > row.currentEvent.at || (event.at === row.currentEvent.at && event.id > row.currentEvent.id)))) {
        Object.assign(row, patch, { attempts: row.attempts, currentEvent: { sequence: event.sequence, at: event.at, id: event.id } });
    }
    await db.operations.put(row);
}
export function createOperationRepository({ db, ready = async () => {}, coordination, notify = () => {}, subscribe = () => () => {}, onError = () => {}, now = Date.now,
    onState = async () => {} }) {
    function view(row, history = []) {
        const { envelope, currentEvent: _currentEvent, ...state } = row;
        return clone({ ...envelope, ...state, history: history.sort((a, b) => a.sequence - b.sequence || a.at - b.at || a.id.localeCompare(b.id)) });
    }
    async function getRaw(ownerId, id) {
        const row = await db.operations.get([ownerId, id]);
        if (!row) return null;
        const history = (await db.events.where('[ownerId+operationId]').equals([ownerId, id]).toArray()).map(e => e.event)
            .sort((a, b) => a.sequence - b.sequence || a.at - b.at || a.id.localeCompare(b.id));
        return view(row, history);
    }
    async function guarded(task) {
        try { await ready(); return await task(); }
        catch (cause) { const error = storageError(cause); onError(error); throw error; }
    }
    return {
        async create(item) {
            return guarded(async () => {
                await validateEnvelope(item); // crypto outside transaction
                await db.transaction('rw', db.operations, db.metadata, async () => {
                    await db.operations.add(operationRow(item));
                    await db.metadata.put({ key: `operation:${item.ownerId}:${item.id}`, createdAt: item.createdAt, format: 1 });
                });
                notify(); return getRaw(item.ownerId, item.id);
            });
        },
        get(ownerId, id) { return guarded(() => db.transaction('r', db.operations, db.events, () => getRaw(ownerId, id))); },
        list(ownerId, { includeHistory = true } = {}) { return guarded(() => db.transaction('r', db.operations, db.events, async () => {
            const rows = await db.operations.where('ownerId').equals(ownerId).toArray();
            // Batch the history by the existing compound index. The old path
            // reread each operation and opened one history query per row.
            const histories = new Map();
            if (includeHistory) for (const row of await db.events.where('[ownerId+operationId]')
                .between([ownerId, Dexie.minKey], [ownerId, Dexie.maxKey]).toArray()) {
                if (!histories.has(row.operationId)) histories.set(row.operationId, []);
                histories.get(row.operationId).push(row.event);
            }
            const items = rows.map(row => view(row, histories.get(row.id)));
            return items.sort((a, b) => (a.localOrder || 0) - (b.localOrder || 0) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        })); },
        record(ownerId, id, patch) { return guarded(async () => {
            statePatch(patch);
            await db.transaction('rw', db.tables, async () => {
                await coordination.assertFence(ownerId);
                const row = await db.operations.get([ownerId, id]);
                if (!row) throw new Error('Operation missing');
                if (['confirmed', 'resolved_preserved'].includes(row.status)) return;
                await applyEvent(db, row, { ...clone(patch), id: crypto.randomUUID(), at: now(), sequence: (row.currentEvent?.sequence || 0) + 1 });
                await onState(row, patch);
            });
            notify(); return getRaw(ownerId, id);
        }); },
        subscribe,
        withLock(ownerId, task) { return guarded(() => coordination.withLock(ownerId, task)); }
    };
}
