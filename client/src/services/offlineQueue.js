// Legacy arrays stay in place. Independent keys prevent concurrent appends
// from replacing another tab's array snapshot. This module never expires data.
import { mexicoCityDateStr } from '../utils/dates.js';

const QUEUE_KEY = 'nexlift_offline_queue';
const ITEM_PREFIX = 'nexlift_offline_op_v2:';
const listeners = new Set();
let storageError = null;

export function getSessionIdentity() {
    try {
        const token = localStorage.getItem('nexlift_token');
        const user = JSON.parse(localStorage.getItem('nexlift_user') || 'null');
        const part = token?.split('.')[1];
        const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
        // The server verifies the signature. Locally bind ownership to the
        // credential being sent, rather than trusting a cached profile alone.
        return typeof claims.userId === 'string' && claims.userId === user?.id
            ? { ownerId: user.id, token } : null;
    } catch { return null; }
}
function failStorage(cause) {
    storageError = 'No se pudo leer o guardar en este dispositivo. Conserva esta pantalla y copia tus datos antes de salir.';
    const error = new Error(storageError, { cause });
    error.isStorageError = true;
    return error;
}
export function getQueueStorageError() { return storageError; }
function notify() {
    // Reads never notify. Subscriber failures cannot invalidate a durable save.
    for (const fn of listeners) { try { fn(); } catch { /* isolated subscriber */ } }
}
function save(item) {
    try {
        localStorage.setItem(`${ITEM_PREFIX}${item.id}`, JSON.stringify(item));
        storageError = null;
    } catch (cause) { throw failStorage(cause); }
    notify();
    return item;
}
export function enqueueWrite(op, payload, metadata = {}) {
    const timestamp = metadata.timestamp ?? Date.now();
    const ownerId = metadata.ownerId ?? getSessionIdentity()?.ownerId ?? null;
    const item = {
        version: 2,
        id: globalThis.crypto?.randomUUID?.() || `${timestamp}_${Math.random().toString(36).slice(2)}`,
        op, payload: JSON.parse(JSON.stringify(payload)), timestamp, ownerId,
        originalDay: mexicoCityDateStr(new Date(timestamp)),
        status: ownerId ? 'pending' : 'blocked',
        reason: ownerId ? null : 'unknown_owner',
        attempts: 0, nextRetryAt: null, mutationDispatched: false
    };
    getQueue(); // unreadable data must not be silently replaced
    return save(item);
}
// Pure read: no expiry, migration, repair, notification or implicit ownership.
export function getQueue({ includeSynced = false } = {}) {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        const legacy = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(legacy)) throw new Error('Invalid legacy queue');
        const items = legacy.map((item, i) => ({
            ...item, id: item?.id ?? `legacy-${i}`, legacy: true,
            status: 'blocked', reason: 'unknown_owner', ownerId: null
        }));
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(ITEM_PREFIX)) continue;
            const item = JSON.parse(localStorage.getItem(key));
            if (!item || item.version !== 2 || key !== `${ITEM_PREFIX}${item.id}`) {
                throw new Error('Invalid offline operation');
            }
            items.push(item);
        }
        return items.filter(item => includeSynced || item.status !== 'synced')
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    } catch (cause) { throw failStorage(cause); }
}
export function updateQueueItem(id, patch) {
    const current = getQueue({ includeSynced: true }).find(item => item.id === id && !item.legacy);
    if (!current) throw new Error('Offline operation not found');
    if (current.status === 'synced' && patch.status !== 'synced') return current;
    const allowed = ['status', 'reason', 'attempts', 'nextRetryAt', 'lastError',
        'remote', 'receipt', 'mutationDispatched', 'confirmedAt'];
    const changes = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
    return save({ ...current, ...changes });
}
// Explicit removal retained for compatibility. Replay never calls this:
// confirmed operations retain both their payload and server acknowledgement.
export function removeFromQueue(id) {
    try {
        const key = `${ITEM_PREFIX}${id}`;
        if (localStorage.getItem(key) !== null) localStorage.removeItem(key);
        else {
            const raw = localStorage.getItem(QUEUE_KEY);
            const legacy = raw ? JSON.parse(raw) : [];
            localStorage.setItem(QUEUE_KEY, JSON.stringify(legacy.filter(item => item.id !== id)));
        }
    } catch (cause) { throw failStorage(cause); }
    notify();
}
export function hasPendingWrite(exerciseId) {
    if (!exerciseId) return false;
    const ownerId = getSessionIdentity()?.ownerId ?? null;
    return getQueue().some(item => item.ownerId === ownerId && item.payload?.exerciseId === exerciseId);
}
export function subscribeQueueChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
        if (event.key === null || event.key === QUEUE_KEY || event.key?.startsWith(ITEM_PREFIX)) notify();
    });
}
