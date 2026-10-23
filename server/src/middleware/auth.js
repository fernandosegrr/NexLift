import { createAuthenticator } from '../modules/auth/authenticate.js';
export function createAuthMiddleware(options) {
    const authenticate = createAuthenticator(options);
    return async function authMiddleware(req, res, next) {
        const decision = await authenticate({ authorization: req.headers.authorization, requestId: req.requestId });
        if ('status' in decision) {
            for (const [name, value] of Object.entries(decision.headers)) res.set(name, value);
            return res.status(decision.status).json(decision.body);
        }
        req.userId = decision.userId;
        return next();
    };
}
