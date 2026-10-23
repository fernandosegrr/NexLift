// Replaceable async interface for 3.3: create/get/list/record/subscribe/withLock.
// Payloads are immutable, one key per operation. State changes are append-only
// events, so a stale tab cannot overwrite a confirmation or another append.
export const OPERATION_PREFIX = 'nexlift_operation_v1:';
const copy = value => JSON.parse(JSON.stringify(value));
const storageFailure = cause => Object.assign(new Error('No se pudo leer o guardar el journal local. Conserva esta pantalla y exporta tus datos antes de salir.', { cause }), { isStorageError: true });
export function createOperationStore({ storage, locks, events, now = Date.now, uuid = () => crypto.randomUUID() }) {
    const listeners = new Set();
    const notify = () => { for (const fn of listeners) { try { fn(); } catch { /* observer */ } } };
    const base = (ownerId, id) => `${OPERATION_PREFIX}${encodeURIComponent(ownerId)}:${id}`;
    const guarded = fn => { try { return fn(); } catch (cause) { throw storageFailure(cause); } };
    const read = key => guarded(() => JSON.parse(storage.getItem(key) || 'null'));
    const write = (key, data) => guarded(() => storage.setItem(key, JSON.stringify(data)));
    const keys = () => guarded(() => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(Boolean));
    function get(ownerId, id) {
        const key = base(ownerId, id), item = read(`${key}:payload`);
        if (!item) return null;
        if (item.format !== 1 || item.id !== id || item.ownerId !== ownerId || !item.payload || !Array.isArray(item.dependsOn)) throw storageFailure(new Error('Invalid operation envelope'));
        const history = keys().filter(k => k.startsWith(`${key}:event:`)).map(read)
            .sort((a, b) => a.sequence - b.sequence || a.at - b.at || a.id.localeCompare(b.id));
        // Confirmed is absorbing, even when a different tab reports an older
        // failure after it. The receipt and original payload remain available.
        const confirmed = history.findLast(event => event.status === 'confirmed');
        const current = confirmed || history.at(-1) || { status: item.initialStatus, attempts: 0 };
        return copy({ ...item, ...current, id, history, attempts: Math.max(0, ...history.map(e => e.attempts || 0)) });
    }
    events?.addEventListener('storage', event => { if (event.key === null || event.key?.startsWith(OPERATION_PREFIX)) notify(); });
    return {
        async create(item) {
            const key = `${base(item.ownerId, item.id)}:payload`;
            if (read(key)) throw storageFailure(new Error('Operation ID already exists'));
            write(key, item); notify(); return get(item.ownerId, item.id);
        },
        async get(ownerId, id) { return get(ownerId, id); },
        async list(ownerId) {
            const prefix = `${OPERATION_PREFIX}${encodeURIComponent(ownerId)}:`;
            return keys().filter(key => key.startsWith(prefix) && key.endsWith(':payload'))
                .map(key => { const item = read(key); return get(ownerId, item.id); })
                .sort((a, b) => (a.localOrder || 0) - (b.localOrder || 0) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        },
        async record(ownerId, id, event) {
            const item = get(ownerId, id);
            if (!item) throw storageFailure(new Error('Operation missing'));
            if (item.status === 'confirmed') return item;
            const entry = { ...copy(event), id: uuid(), at: now(), sequence: 1 + Math.max(0, ...item.history.map(e => e.sequence)) };
            write(`${base(ownerId, id)}:event:${entry.id}`, entry); notify();
            return get(ownerId, id);
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        async withLock(ownerId, task) {
            const name = `nexlift-operation-sync:${ownerId}`;
            if (locks?.request) return locks.request(name, { ifAvailable: true }, lock => lock ? task() : undefined);
            // Advisory fallback only: Web Storage has no compare-and-swap. A
            // suspended tab may outlive the lease; PostgreSQL still deduplicates.
            const key = `${OPERATION_PREFIX}lease:${encodeURIComponent(ownerId)}`, holder = uuid();
            const old = read(key);
            if (old?.until > now()) return;
            write(key, { holder, until: now() + 60000 });
            if (read(key)?.holder !== holder) return;
            const renewal = setInterval(() => {
                try { if (read(key)?.holder === holder) write(key, { holder, until: now() + 60000 }); } catch { /* no permission to delete payloads */ }
            }, 20000);
            try { return await task(); }
            finally { clearInterval(renewal); if (read(key)?.holder === holder) guarded(() => storage.removeItem(key)); }
        }
    };
}
