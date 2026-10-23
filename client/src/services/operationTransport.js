import { getSessionIdentity } from './offlineQueue.js';
import { sha256 } from './operationProtocol.js';

const BINDING_PREFIX = 'nexlift_verified_identity_v1:';
export function createOperationTransport({ apiUrl, identity = getSessionIdentity, storage = globalThis.localStorage,
    fetcher = (...args) => fetch(...args), events = globalThis.window }) {
    let generation = 0;
    const invalidate = () => { generation++; };
    events?.addEventListener('nexlift-session-change', invalidate);
    events?.addEventListener('storage', event => {
        if (event.key === null || ['nexlift_token', 'nexlift_user'].includes(event.key)) invalidate();
    });
    const snapshot = () => { const current = identity(); return current ? { ...current, generation } : null; };
    const same = session => {
        const current = snapshot();
        return current && current.ownerId === session?.ownerId && current.token === session.token && current.generation === session.generation;
    };
    const assertSession = session => {
        if (!same(session)) throw Object.assign(new Error('La sesión cambió. Los datos permanecen vinculados a su propietario.'), { sessionChanged: true });
    };
    async function request(session, path, { method = 'GET', payload } = {}) {
        assertSession(session);
        let response;
        try {
            response = await fetcher(apiUrl + path, { method, cache: 'no-store', signal: AbortSignal.timeout(15000),
                headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
                ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
        } catch (cause) {
            assertSession(session);
            throw Object.assign(new Error('Error de red o tiempo de espera. Se conserva la operación.'), { network: true, cause });
        }
        assertSession(session);
        let body;
        try { body = await response.json(); } catch { body = null; }
        assertSession(session);
        const result = { status: response.status, body, retryAfter: response.headers.get('Retry-After') };
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}: se conservan los datos.`), result);
        return result;
    }
    async function remember(profile, token) {
        const session = snapshot();
        if (!session || session.token !== token || session.ownerId !== profile?.id) return;
        const credentialDigest = await sha256(token);
        assertSession(session);
        // Credential digest binds an earlier server verification to this exact
        // login, without storing the token inside the journal or binding record.
        storage.setItem(`${BINDING_PREFIX}${encodeURIComponent(profile.id)}`, JSON.stringify({ ownerId: profile.id, credentialDigest, verifiedAt: Date.now() }));
    }
    async function bound(session) {
        const proof = JSON.parse(storage.getItem(`${BINDING_PREFIX}${encodeURIComponent(session.ownerId)}`) || 'null');
        const hash = await sha256(session.token); assertSession(session);
        return proof?.ownerId === session.ownerId && proof.credentialDigest === hash && Number.isFinite(proof.verifiedAt);
    }
    return { snapshot, same, assertSession, request, remember, bound };
}
