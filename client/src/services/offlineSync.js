// Safety policy for the current API (no persistent idempotency, conditional PUT,
// original-date create, or operation receipt lookup). Replay is read-only until
// those contracts exist: a lost response is never permission to repeat a write.
import { mexicoCityDateStr } from '../utils/dates.js';
import { getQueue, getSessionIdentity, enqueueWrite, updateQueueItem } from './offlineQueue.js';

const MAX_ATTEMPTS = 5;
let running = false;
let retryTimer;
const inFlight = new Set();
const reasons = {
    unknown_owner: 'Propietario desconocido: se conservan los datos y se requiere revisión.',
    original_day: 'La operación pertenece a otro día de CDMX. La API actual no permite enviarla con su fecha original.',
    remote_exists: 'Hay una versión remota. Se conservaron ambas versiones para revisión; no se reemplazaron series.',
    unsafe_create: 'Se conserva localmente. Crear automáticamente podría duplicar el registro o cambiar su fecha; requiere revisión.',
    uncertain_write: 'El servidor pudo haber guardado la operación. Se requiere revisión antes de repetirla.',
    invalid_receipt: 'La respuesta no confirma los datos enviados. Se conserva la operación para revisión.',
    auth: 'Sincronización pausada: inicia sesión con la cuenta propietaria.',
    session_changed: 'La sesión cambió durante el envío. Los datos permanecen vinculados a su propietario.',
    retry_limit: 'Se alcanzó el límite de reintentos. Los datos se conservan para revisión.',
    validation: 'El servidor rechazó los datos. Se conservan para revisión.',
    conflict: 'Conflicto con el servidor. Los datos locales y la respuesta remota se conservan.',
    unsupported: 'La operación no se reconoce. Los datos se conservan para revisión.'
};
export function syncReason(item) { return reasons[item.reason] || item.lastError || 'Pendiente de sincronizar'; }

function sameSession(identity) {
    const current = getSessionIdentity();
    return current?.ownerId === identity?.ownerId && current?.token === identity?.token;
}
function problem(reason, status = 'blocked', extra = {}) {
    return Object.assign(new Error(reasons[reason] || reason), { reason, syncStatus: status, ...extra });
}
export function equivalentSets(local, remote) {
    if (!Array.isArray(local) || !Array.isArray(remote) || local.length !== remote.length) return false;
    const fields = ['weight', 'reps', 'rpe', 'weightRight', 'repsRight', 'completed'];
    if ([...local, ...remote].some(set => !set || typeof set !== 'object')) return false;
    const ordered = [...remote].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
    return local.every((set, i) => fields.every(field => {
        const expected = field === 'completed' ? (set[field] ?? true) : (set[field] ?? null);
        const actual = field === 'completed' ? ordered[i][field] : (ordered[i][field] ?? null);
        return actual === expected;
    }));
}

async function request(url, identity, options = {}) {
    if (!sameSession(identity)) throw problem('session_changed', 'paused');
    let res;
    try {
        res = await fetch(url, {
            ...options, cache: 'no-store',
            signal: AbortSignal.timeout(15000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${identity.token}` }
        });
    } catch (cause) {
        throw Object.assign(new Error('Error temporal de red; los datos se conservan.'), { isNetworkError: true, cause });
    }
    if (!sameSession(identity)) throw problem('session_changed', 'paused');
    let body;
    try { body = await res.json(); } catch { body = undefined; }
    if (!sameSession(identity)) throw problem('session_changed', 'paused');
    if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}: se conserva la operación.`), {
            status: res.status, retryAfter: res.headers.get('Retry-After'), remote: body
        });
    }
    return { body, status: res.status };
}

function classify(item, error) {
    if (error.isStorageError) throw error;
    const attempts = (item.attempts || 0) + 1;
    const base = { attempts, lastError: error.message, nextRetryAt: null };
    if (error.remote !== undefined) base.remote = error.remote;
    if (error.syncStatus) return { ...base, status: error.syncStatus, reason: error.reason };
    if (error.status === 401) return { ...base, status: 'paused', reason: 'auth' };
    if (error.status === 409) return { ...base, status: 'conflict', reason: 'conflict' };
    const transient = error.isNetworkError || error.status === 408 || error.status === 429 || error.status >= 500;
    if (!transient) return { ...base, status: 'blocked', reason: 'validation' };
    if (attempts >= MAX_ATTEMPTS) return { ...base, status: 'blocked', reason: 'retry_limit' };
    let retryAt = Date.now() + Math.min(300000, 5000 * 2 ** (attempts - 1));
    if (error.retryAfter) {
        const seconds = Number(error.retryAfter);
        const deadline = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(error.retryAfter);
        if (Number.isFinite(deadline)) retryAt = Math.max(retryAt, deadline);
    }
    return { ...base, status: 'temporary_error', reason: null, nextRetryAt: retryAt };
}

function assertReceipt(item, body, status) {
    const log = item.op === 'logRestDay' ? body?.restLog : body?.workoutLog;
    const date = new Date(log?.date);
    let valid = status === (item.op === 'updateWorkoutSession' ? 200 : 201)
        && typeof log?.id === 'string' && log.id.length > 0
        && typeof log.date === 'string' && Number.isFinite(date.getTime());
    if (item.op === 'logRestDay') {
        valid &&= log.userId === item.ownerId && log.note === (item.payload.note || 'Día de descanso');
    } else {
        valid &&= equivalentSets(item.payload.sets, log?.sets);
        valid &&= item.op === 'updateWorkoutSession'
            ? log.id === item.payload.logId
            : log.exerciseId === item.payload.exerciseId && (log.notes ?? null) === (item.payload.notes ?? null);
    }
    if (item.op !== 'updateWorkoutSession' && valid) valid &&= mexicoCityDateStr(date) === item.originalDay;
    if (!valid) throw problem('invalid_receipt', 'blocked', { remote: body });
    return body;
}

// Only an explicit foreground user action can perform the original mutation.
// The durable journal must succeed before the first network byte is sent.
export async function submitWorkoutWrite(apiUrl, op, payload, context = {}) {
    const identity = getSessionIdentity();
    if (!identity) throw problem('auth', 'paused');
    if (context.ownerId && context.ownerId !== identity.ownerId) throw problem('session_changed', 'paused');
    const earlier = getQueue().find(item => item.ownerId === identity.ownerId && (
        (payload.exerciseId && item.payload?.exerciseId === payload.exerciseId)
        || (payload.logId && item.payload?.logId === payload.logId)
        || (op === 'logRestDay' && item.op === op && item.originalDay === mexicoCityDateStr())
    ));
    let item = enqueueWrite(op, payload, { ownerId: identity.ownerId, timestamp: Date.now() });
    payload = item.payload; // send the exact durable snapshot, even if a caller mutates its form
    if (earlier) {
        item = updateQueueItem(item.id, { status: 'conflict', reason: 'conflict',
            remote: { localOperationId: earlier.id, payload: earlier.payload } });
        return { queued: true, syncStatus: item.status, operationId: item.id, reason: syncReason(item) };
    }
    if (globalThis.navigator?.onLine === false) return { queued: true, syncStatus: item.status, operationId: item.id };
    inFlight.add(item.id);
    const send = async () => {
        try {
            // Another tab may have inspected this operation while waiting for a lock.
            const current = getQueue().find(candidate => candidate.id === item.id);
            if (!current || current.status !== 'pending') {
                return { queued: true, syncStatus: current?.status || 'blocked', operationId: item.id,
                    reason: current ? syncReason(current) : reasons.uncertain_write };
            }
            item = updateQueueItem(item.id, { status: 'syncing', mutationDispatched: true });
            const path = op === 'logRestDay' ? '/workouts/log-rest'
                : op === 'updateWorkoutSession' ? `/workouts/${encodeURIComponent(payload.logId)}` : '/workouts/log';
            const sent = op === 'logRestDay' ? { note: payload.note }
                : op === 'updateWorkoutSession' ? { sets: payload.sets } : payload;
            const { body, status } = await request(`${apiUrl}${path}`, identity, {
                method: op === 'updateWorkoutSession' ? 'PUT' : 'POST', body: JSON.stringify(sent)
            });
            assertReceipt(item, body, status);
            updateQueueItem(item.id, { status: 'synced', receipt: body, confirmedAt: Date.now(), reason: null });
            return { ...body, syncStatus: 'synced', operationId: item.id };
        } catch (error) {
            if (error.isStorageError) throw error;
            item = updateQueueItem(item.id, classify(item, error));
            scheduleRetry(apiUrl);
            return { queued: true, syncStatus: item.status, operationId: item.id, reason: syncReason(item) };
        } finally { inFlight.delete(item.id); }
    };
    if (globalThis.navigator?.locks) return navigator.locks.request('nexlift-offline-replay', {}, send);
    return send();
}

async function inspectOne(apiUrl, item, identity) {
    if (item.op !== 'updateWorkoutSession' && item.originalDay !== mexicoCityDateStr()) throw problem('original_day');
    if (item.op === 'logRestDay') throw problem(item.mutationDispatched ? 'uncertain_write' : 'unsafe_create');
    if (!['logWorkout', 'updateWorkoutSession'].includes(item.op)) throw problem('unsupported');
    const path = item.op === 'logWorkout'
        ? `/workouts/today-log?exerciseId=${encodeURIComponent(item.payload.exerciseId)}`
        : `/workouts/${encodeURIComponent(item.payload.logId)}`;
    const { body, status } = await request(`${apiUrl}${path}`, identity);
    if (status !== 200 || (body !== null && (typeof body?.id !== 'string' || !Array.isArray(body?.sets)))) {
        throw problem('invalid_receipt', 'blocked', { remote: body });
    }
    // Even matching sets cannot prove which operation produced them. A GET is
    // evidence for review, never a receipt for this local mutation.
    if (body) throw problem('remote_exists', 'conflict', { remote: body });
    throw problem(item.mutationDispatched ? 'uncertain_write' : 'unsafe_create');
}

function scheduleRetry(apiUrl) {
    clearTimeout(retryTimer);
    const ownerId = getSessionIdentity()?.ownerId;
    const next = getQueue().find(item => !item.legacy && item.ownerId === ownerId);
    if (next?.status === 'temporary_error' && next.nextRetryAt) retryTimer = setTimeout(() => { void replayQueue(apiUrl).catch(() => {}); },
        Math.min(2147483647, Math.max(0, next.nextRetryAt - Date.now())));
}

export async function replayQueue(apiUrl, { onItemFailed, resumeAuth = false } = {}) {
    if (running || !getSessionIdentity() || globalThis.navigator?.onLine === false) return;
    running = true;
    try {
        const run = async () => {
            const identity = getSessionIdentity();
            if (!identity) return;
            for (let item of getQueue()) {
                if (!sameSession(identity)) break;
                if (item.legacy || item.ownerId !== identity.ownerId) continue;
                if (inFlight.has(item.id) || (item.status === 'paused' && !resumeAuth)) break;
                if (['blocked', 'conflict'].includes(item.status)) break; // FIFO, including conflicts
                if (item.nextRetryAt > Date.now()) break;
                // A crashed foreground request is ambiguous, even after reload.
                item = updateQueueItem(item.id, { status: 'syncing' });
                try { await inspectOne(apiUrl, item, identity); }
                catch (error) {
                    if (error.isStorageError) throw error;
                    item = updateQueueItem(item.id, classify(item, error));
                    try { onItemFailed?.(item, error); } catch { /* callback cannot lose data */ }
                    break;
                }
            }
        };
        // All automatic work is read-only. Share the foreground lock so an
        // inspection cannot race the original acknowledgement in another tab.
        if (globalThis.navigator?.locks) {
            await navigator.locks.request('nexlift-offline-replay', { ifAvailable: true }, lock => lock ? run() : undefined);
        } else await run();
    } finally { running = false; scheduleRetry(apiUrl); }
}
