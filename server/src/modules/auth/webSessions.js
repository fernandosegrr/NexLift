import { randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const cookieName = '__Host-nexlift_session';
const failed = (status, error) => ({ status, body: { error }, headers: {} });
// Opt-in, single-process DEVELOPMENT bridge. No refresh tokens and no automatic
// credential migration. Restart deliberately requires a fresh Bearer exchange.
export function createWebSessions(config) {
    const enabled = config.nodeEnv !== 'production' && config.webSessionEnabled === true;
    if (enabled && (!config.webOrigin || new URL(config.webOrigin).origin !== config.webOrigin || !config.webOrigin.startsWith('https://')))
        throw new Error('Web session rehearsal requires an exact HTTPS origin');
    const sessions = new Map();
    const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b)
        && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    const idOf = headers => {
        const values = (headers.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${cookieName}=`));
        return values.length === 1 ? values[0].slice(cookieName.length + 1) : '';
    };
    const cookie = (id, age) => `${cookieName}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
    const sweep = () => { for (const [id, session] of sessions) if (session.expires <= Date.now()) sessions.delete(id); };
    return {
        resolve(input) {
            if (input.headers.authorization) return { authorization: input.headers.authorization };
            if (!enabled) return {};
            sweep();
            const session = sessions.get(idOf(input.headers));
            if (!session) return {};
            if (!['GET', 'HEAD', 'OPTIONS'].includes(input.method)
                && (input.headers.origin !== config.webOrigin || !same(input.headers['x-nexlift-csrf'], session.csrf)))
                return failed(403, 'Solicitud no autorizada');
            return { authorization: session.authorization };
        },
        exchange(input) {
            if (!enabled) return failed(404, 'Not found');
            if (input.headers.origin !== config.webOrigin || input.headers['x-nexlift-web-session'] !== '1'
                || !input.headers.authorization?.startsWith('Bearer ')) return failed(403, 'Solicitud no autorizada');
            const decoded = jwt.verify(input.headers.authorization.slice(7), config.jwtSecret, { algorithms: ['HS256'] });
            if (!decoded.exp || decoded.exp * 1000 <= Date.now()) return failed(401, 'Token inválido o expirado');
            sweep();
            if (sessions.size >= 10000) return failed(503, 'Servicio temporalmente no disponible');
            sessions.delete(idOf(input.headers));
            const id = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
            sessions.set(id, { csrf, authorization: input.headers.authorization, expires: decoded.exp * 1000 });
            return { status: 201, headers: { 'Set-Cookie': cookie(id, Math.max(1, Math.floor(decoded.exp - Date.now() / 1000))) }, body: { csrf, userId: input.userId } };
        },
        inspect(input) {
            if (!enabled) return failed(404, 'Not found');
            const session = sessions.get(idOf(input.headers));
            return session ? { status: 200, headers: {}, body: { csrf: session.csrf, userId: input.userId } } : failed(401, 'No autorizado');
        },
        logout(input) {
            if (!enabled) return failed(404, 'Not found');
            if (input.headers.origin !== config.webOrigin || !same(input.headers['x-nexlift-csrf'], sessions.get(idOf(input.headers))?.csrf))
                return failed(403, 'Solicitud no autorizada');
            sessions.delete(idOf(input.headers));
            return { status: 200, headers: { 'Set-Cookie': cookie('', 0) }, body: { message: 'Sesión cerrada' } };
        },
        clear() { sessions.clear(); }
    };
}
