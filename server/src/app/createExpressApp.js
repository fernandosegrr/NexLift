import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoutes } from './routes.js';
import { createAuthenticator } from '../modules/auth/authenticate.js';
import { ResponseOutput, createRateLimiter } from '../generated/http.cjs';
import { requestContext, safeErrorHandler } from '../operations/telemetry.js';
import { createHealthHandlers } from '../operations/health.js';
import { trustedProxy, securityHeaders, privateApi } from './security.js';

// Reference/recovery transport; shares all domain handlers and services with
// Fastify. No application, Prisma connection or background jobs at import time.
export function createExpressApp({ runtime, schemaCheck }) {
    const app = express(), { config, prisma } = runtime;
    const isApi = pathname => { try { return /^\/api(?:\/|$)/i.test(decodeURIComponent(pathname)); } catch { return true; } };
    const authenticate = createAuthenticator({ prisma, secret: config.jwtSecret });
    const limit = createRateLimiter();
    app.disable('etag');
    app.use(requestContext); app.set('trust proxy', trustedProxy(config.trustedProxyCidrs));
    app.use((req, res, next) => {
        res.set(securityHeaders(config));
        if (privateApi(req.path)) {
            res.set('Cache-Control', 'no-store');
            delete req.headers['if-none-match']; delete req.headers['if-modified-since'];
        }
        next();
    });
    const allowlist = (config.corsOrigin || '').split(',').map(s => s.trim()).filter(Boolean);
    app.use(cors({ origin: allowlist.length ? allowlist : config.nodeEnv === 'production' ? false : true }));
    app.use(helmet({ contentSecurityPolicy: false })); app.use(compression({ threshold: 1024 }));
    app.use(express.json({ limit: '10mb' }));
    const staticRoot = config.staticRoot ?? fileURLToPath(new URL('../../../client/dist/', import.meta.url));
    // API paths are never served from the public filesystem, even on a typo.
    const staticHandler = express.static(staticRoot, { maxAge: '1y', setHeaders(res, filename) {
        if (filename.endsWith('.html') || filename.endsWith(`${path.sep}sw.js`)) res.setHeader('Cache-Control', 'no-cache');
        else if (filename.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } });
    app.use((req, res, next) => isApi(req.path) ? next() : staticHandler(req, res, next));
    for (const route of buildRoutes(runtime.services)) app[route.method.toLowerCase()](route.path, async (req, res, next) => {
        try {
            const input = { body: req.body ?? {}, query: req.query, params: req.params, headers: req.headers,
                ip: req.ip, path: route.path, requestId: req.requestId, method: req.method };
            const send = result => { res.set(result.headers).status(result.status).json(result.body); };
            for (const guard of route.guards) {
                if (guard.kind === 'auth') {
                    const session = runtime.services.webSessions.resolve(input);
                    if ('status' in session) return send(session);
                    const decision = await authenticate({ authorization: session.authorization, requestId: req.requestId });
                    if ('status' in decision) return send(decision);
                    input.userId = decision.userId;
                } else {
                    const rejected = limit(input, guard.policy);
                    if (rejected) return send(rejected);
                }
            }
            const output = new ResponseOutput();
            await route.handler(input, output);
            if (!output.sent) throw new Error('Incomplete controller result');
            send(output.result);
        } catch (error) { next(error); }
    });
    const health = createHealthHandlers({ prisma, schemaCheck, isClosing: runtime.isClosing });
    app.get('/api/health', health.live); app.get('/api/ready', health.ready);
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
    app.use((req, res, next) => isApi(req.path) ? res.status(404).json({ error: 'Not found' }) : next());
    app.get('*', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(staticRoot, 'index.html')));
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    app.use(safeErrorHandler);
    return app;
}
