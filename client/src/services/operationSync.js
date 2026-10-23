import { classifyApiFailure } from '../generated/contracts.js';
import { normalizePayload, payloadHash, verifyCapability, verifyReceipt } from './operationProtocol.js';
import { mexicoCityDateStr } from '../utils/dates.js';
import { verifySnapshot } from './sessionChanges.js';

const recoverable = new Set(['pending', 'syncing', 'retry_scheduled', 'paused_auth']);
import { operationLabels } from '../generated/operationLabels.js';
export { operationLabels };
export function retryDeadline(attempt, retryAfter, now) {
    const base = now + Math.min(300000, 5000 * 2 ** Math.min(16, Math.max(0, attempt - 1)));
    if (!retryAfter) return base;
    const value = /^\d+(?:\.\d+)?$/.test(retryAfter) ? now + Number(retryAfter) * 1000 : Date.parse(retryAfter);
    return Number.isFinite(value) ? Math.max(base, value) : base;
}
export function createOperationSync({ store, transport, enabled = false, legacyBarrier = () => false,
    now = Date.now, uuid = () => crypto.randomUUID(), online = () => globalThis.navigator?.onLine !== false,
    setTimer = setTimeout, clearTimer = clearTimeout }) {
    const settled = item => item.status === 'confirmed' || (store.supportsPreserved === true && item.status === 'resolved_preserved');
    let running = null, timer, stopped = false, wakeAgain = false, resumeRequested = false;
    const event = (item, patch) => store.record(item.ownerId, item.id, patch);
    async function capability(session) {
        const response = await transport.request(session, '/v1/workout-capabilities');
        if (response.status !== 200) throw Object.assign(new Error('Respuesta de capacidad inesperada.'), { code: 'INCOMPATIBLE_OPERATION' });
        verifyCapability(response.body, session.ownerId);
        await transport.remember({ id: response.body.userId }, session.token);
        transport.assertSession(session);
    }
    async function classify(item, error) {
        if (error.isStorageError) throw error;
        // A late response from A must not change the journal/UI while B is active.
        if (error.sessionChanged) return;
        const base = { attempts: item.attempts, lastError: error.message,
            errorCode: error.body?.code || error.code || null, nextRetryAt: null };
        const failure = classifyApiFailure(error.status, error.body);
        if (failure === 'authentication') return event(item, { ...base, status: 'paused_auth' });
        if (failure === 'forbidden') return event(item, { ...base, status: 'blocked_forbidden' });
        if (failure === 'conflict') return event(item, { ...base, status: 'conflict' });
        if (failure === 'validation') return event(item, { ...base, status: 'blocked_validation' });
        if (error.code === 'INCOMPATIBLE_OPERATION') return event(item, { ...base, status: 'blocked_incompatible' });
        const temporary = error.network || failure === 'recoverable';
        return event(item, { ...base, status: temporary ? 'retry_scheduled' : 'blocked_incompatible',
            nextRetryAt: temporary ? retryDeadline(Math.max(1, item.attempts), error.retryAfter, now()) : null });
    }
    async function schedule() {
        clearTimer(timer); timer = undefined;
        const session = transport.snapshot();
        if (stopped || !enabled || !session || !online()) return;
        let items = await store.list(session.ownerId, { includeHistory: false });
        if (store.processingList) items = await store.processingList(session.ownerId, items);
        const head = items.find(i => !settled(i));
        if (!transport.same(session) || !head) return;
        // Another tab can disappear while holding a lock/lease. Reinspect an
        // unfinished head periodically, without a zero-delay competition loop.
        const next = head.status === 'retry_scheduled' ? head.nextRetryAt
            : ['pending', 'syncing'].includes(head.status) ? now() + 60000 : null;
        if (!next) return;
        timer = setTimer(() => { void run().catch(() => {}); }, Math.min(2147483647, Math.max(1000, next - now())));
    }
    async function work({ resumeAuth = false } = {}) {
        const session = transport.snapshot();
        if (!enabled || stopped || !session || !online()) return;
        await store.withLock(session.ownerId, async () => {
            transport.assertSession(session);
            let items = await store.list(session.ownerId, { includeHistory: false });
            if (store.processingList) items = await store.processingList(session.ownerId, items);
            const head = items.find(item => !settled(item));
            if (!head || !recoverable.has(head.status) || head.nextRetryAt > now() || (head.status === 'paused_auth' && !resumeAuth)) return;
            let active = head;
            try {
                // Account identity is confirmed by auth middleware and the SQL
                // journal is inspected BEFORE any receipt query or POST.
                active = await event(head, { status: 'syncing', attempts: head.attempts + 1, nextRetryAt: null });
                await capability(session);
                items = await store.list(session.ownerId, { includeHistory: false });
                if (store.processingList) items = await store.processingList(session.ownerId, items);
                for (let item of items) {
                    transport.assertSession(session);
                    if (settled(item)) continue;
                    if (!recoverable.has(item.status) || item.nextRetryAt > now() || (item.status === 'paused_auth' && !resumeAuth)) break;
                    active = item;
                    if (await payloadHash(item.payload) !== item.requestHash) throw Object.assign(new Error('El contenido local cambió. Se conserva para revisión.'), { code: 'INCOMPATIBLE_OPERATION' });
                    transport.assertSession(session);
                    if (item.payload.changes || item.payload.resolution) {
                        const response = await transport.request(session, '/v1/workout-capabilities');
                        if (response.body?.resolutions?.version !== 1 || response.body.resolutions.partialSets !== true || response.body.resolutions.stableSetIds !== true) throw Object.assign(new Error('El servidor aún no permite resolver cambios parciales. Los datos se conservan.'), { code: 'INCOMPATIBLE_OPERATION' });
                        if (item.payload.kind === 'workout.delete' && response.body.resolutions.deleteResolution !== true) throw Object.assign(new Error('El servidor aún no permite resolver esta eliminación. Se conserva la propuesta.'), { code: 'INCOMPATIBLE_OPERATION' });
                    }
                    if (legacyBarrier(item) || item.dependsOn.length) {
                        await event(item, { status: 'blocked_dependency', lastError: 'Revisa los registros anteriores. No se cambió la versión esperada.' }); break;
                    }
                    if (item.id === head.id) active = item;
                    else active = item = await event(item, { status: 'syncing', attempts: item.attempts + 1, nextRetryAt: null });
                    let response;
                    // Always query first: includes reloads and a local failure to
                    // save a previous acknowledgement, with no mutable sent flag.
                    try { response = await transport.request(session, `/v1/workout-operations/${item.id}`); }
                    catch (error) { if (error.status !== 404 || error.body?.code !== 'OPERATION_NOT_FOUND') throw error; }
                    transport.assertSession(session);
                    response ??= await transport.request(session, '/v1/workout-operations', { method: 'POST', payload: item.payload });
                    verifyReceipt(item, response.body, response.status);
                    transport.assertSession(session);
                    await event(item, { status: 'confirmed', receipt: response.body, confirmedAt: now(), lastError: null, nextRetryAt: null });
                }
            } catch (error) { await classify(active, error); }
        });
    }
    async function run(options) {
        if (options?.resumeAuth) resumeRequested = true;
        if (running) { wakeAgain = true; return running; }
        const resumeAuth = resumeRequested; resumeRequested = false;
        running = work({ resumeAuth }).catch(error => { if (!error.sessionChanged) throw error; }).finally(async () => {
            running = null; await schedule();
            if (wakeAgain) { wakeAgain = false; if (!stopped) void run().catch(() => {}); }
        });
        return running;
    }
    async function capture(kind, input, context = {}) {
        if (!enabled) throw new Error('La sincronización idempotente está deshabilitada.');
        const session = transport.snapshot();
        if (!session || (context.ownerId && context.ownerId !== session.ownerId)) throw new Error('Inicia sesión con la cuenta propietaria del formulario.');
        if (!await transport.bound(session)) {
            if (!online()) throw new Error('Esta sesión aún no fue verificada por el servidor. Conserva el borrador y verifica la cuenta con conexión.');
            await capability(session);
        }
        transport.assertSession(session);
        const payload = normalizePayload({ ...input, kind, source: 'pwa', performedAt: context.performedAt ?? new Date(now()).toISOString(), operationId: uuid() });
        const requestHash = await payloadHash(payload);
        const earlier = await store.list(session.ownerId, { includeHistory: false });
        transport.assertSession(session);
        const dependsOn = payload.logId ? earlier.filter(item => !settled(item) && item.payload.logId === payload.logId).map(item => item.id) : [];
        const baseSnapshot = context.baseSnapshot ? await verifySnapshot(context.baseSnapshot, session.ownerId, payload.logId, payload.expectedVersion) : null;
        transport.assertSession(session);
        const item = await store.create({ format: 1, id: payload.operationId, ownerId: session.ownerId,
            payload, requestHash, originalDay: mexicoCityDateStr(new Date(payload.performedAt)), createdAt: now(),
            localOrder: 1 + Math.max(0, ...earlier.map(item => item.localOrder || 0)),
            dependsOn, initialStatus: dependsOn.length ? 'blocked_dependency' : 'pending', ...(baseSnapshot ? { baseSnapshot } : {}) });
        // The immutable envelope exists before any mutation HTTP request.
        await run();
        const current = await store.get(item.ownerId, item.id);
        if (current.status === 'confirmed' && transport.same(session)) return { ...current.receipt.result,
            syncStatus: 'confirmed', operationId: item.id, receipt: current.receipt };
        return { queued: true, syncStatus: current.status, operationId: item.id,
            reason: operationLabels[current.status] || 'Guardado en este dispositivo; pendiente de confirmar' };
    }
    return { capture, run, store, transport, enabled,
        async retry() {
            const session = transport.snapshot();
            if (!session || !enabled) return;
            // Retry-After is mandatory even for manual retries. Authentication
            // resumes only after capability() verifies the current credential.
            return run({ resumeAuth: true });
        },
        start(events = globalThis.window, document = globalThis.document) {
            stopped = false;
            const wake = () => { void run().catch(() => {}); };
            const visible = () => { if (document?.visibilityState !== 'hidden') wake(); };
            for (const name of ['online', 'pageshow', 'focus', 'nexlift-session-change', 'storage']) events?.addEventListener(name, wake);
            document?.addEventListener('visibilitychange', visible);
            wake();
            return () => {
                stopped = true; clearTimer(timer);
                for (const name of ['online', 'pageshow', 'focus', 'nexlift-session-change', 'storage']) events?.removeEventListener(name, wake);
                document?.removeEventListener('visibilitychange', visible);
            };
        }
    };
}
