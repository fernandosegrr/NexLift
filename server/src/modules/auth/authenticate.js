import jwt from 'jsonwebtoken';
import { isDependencyUnavailable } from '../../operations/errors.js';
import { operationalLog } from '../../operations/telemetry.js';

// Authentication is independent of both transports. A SQL outage is never
// confused with an invalid JWT. The owner always comes from the verified token.
export function createAuthenticator({ prisma, secret, log = operationalLog }) {
    return async ({ authorization, requestId }) => {
        const failed = (status, error, headers = {}) => ({ status, body: { error }, headers });
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return failed(401, 'No autorizado');
        let decoded;
        try {
            decoded = jwt.verify(authorization.substring(7), secret, { algorithms: ['HS256'] });
            if (!decoded || typeof decoded !== 'object' || typeof decoded.userId !== 'string' || !decoded.userId
                || (decoded.tokenVersion !== undefined && (!Number.isInteger(decoded.tokenVersion) || decoded.tokenVersion < 0))) return failed(401, 'Token inválido o expirado');
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) return failed(401, 'Token inválido o expirado');
            log({ event: 'auth_error', category: 'internal', requestId, status: 500 });
            return failed(500, 'Error interno del servidor');
        }
        try {
            const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { isActive: true, tokenVersion: true } });
            if (!user || !user.isActive || user.tokenVersion !== (decoded.tokenVersion ?? 0)) return failed(401, 'Token inválido o expirado');
        } catch (error) {
            const transient = isDependencyUnavailable(error), status = transient ? 503 : 500;
            log({ event: 'auth_error', category: transient ? 'dependency_unavailable' : 'internal', requestId, status });
            return failed(status, transient ? 'Servicio temporalmente no disponible' : 'Error interno del servidor', transient ? { 'Retry-After': '5' } : {});
        }
        return { userId: decoded.userId };
    };
}
