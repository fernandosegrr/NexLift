import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import staticFiles from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { buildRoutes } from './routes.js';
import { ResponseOutput } from './contracts.js';
import type { HttpResult, RequestInput } from './contracts.js';
import type { ApplicationRuntime } from './runtime.js';
import { createAuthenticator } from '../modules/auth/authenticate.js';
import { createRateLimiter } from './rateLimit.js';
import { installHttpBoundary, parseQuery } from './http.js';
import { trustedProxy, securityHeaders, privateApi } from './security.js';
import { operationalLog } from '../operations/telemetry.js';

function send(reply: FastifyReply, result: HttpResult): FastifyReply {
    return reply.code(result.status).headers(result.headers).send(result.body);
}
function inputOf(request: FastifyRequest): RequestInput {
    return { body: request.body ?? {}, query: request.query as Record<string, unknown>, params: request.params as Record<string, string>,
        headers: request.headers, ip: request.ip, path: (request.raw.url ?? '/').split('?')[0] ?? '/', requestId: request.id, method: request.method };
}

export async function createApp({ runtime, schemaCheck, configure }: { runtime: ApplicationRuntime; schemaCheck?: () => Promise<unknown>;
    configure?: (app: FastifyInstance) => Promise<void> }): Promise<FastifyInstance> {
    const { config, prisma } = runtime;
    const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024, trustProxy: trustedProxy(config.trustedProxyCidrs),
        requestTimeout: 30000, connectionTimeout: 30000, keepAliveTimeout: 5000,
        routerOptions: { caseSensitive: false, ignoreTrailingSlash: true, maxParamLength: 16384, querystringParser: parseQuery },
        exposeHeadRoutes: true, return503OnClosing: true });
    installHttpBoundary(app);
    app.addHook('onResponse', async (request, reply) => {
        operationalLog({ event: 'http_complete', category: 'http', module: 'http', requestId: request.id,
            status: reply.statusCode, durationMs: reply.elapsedTime });
    });
    app.addHook('onRequest', async (request, reply) => {
        reply.headers(securityHeaders(config));
        if (privateApi((request.raw.url ?? '/').split('?')[0] ?? '/')) reply.header('Cache-Control', 'no-store');
    });
    if (configure) await configure(app);
    const allowlist = (config.corsOrigin || '').split(',').map(s => s.trim()).filter(Boolean);
    await app.register(cors, { origin: allowlist.length ? allowlist : config.nodeEnv === 'production' ? false : true,
        strictPreflight: false, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE' });
    await app.register(helmet, { contentSecurityPolicy: false });
    await app.register(compress, { threshold: 1024, encodings: ['br', 'gzip', 'deflate', 'identity'], requestEncodings: ['gzip', 'deflate', 'identity'],
        onInvalidRequestPayload: () => Object.assign(new Error('Invalid compressed entity'), { statusCode: 500 }) });
    const authenticate = createAuthenticator({ prisma, secret: config.jwtSecret });
    const limit = createRateLimiter();
    // Each route carries its own ordered guards. Authentication cannot disappear
    // through Fastify plugin encapsulation, prefixes or public-route registration.
    for (const route of buildRoutes(runtime.services)) {
        const contexts = new WeakMap<FastifyRequest, RequestInput>();
        app.route({ method: route.method, url: route.path,
            preHandler: async (request, reply) => {
                const input = inputOf(request); input.path = route.path; contexts.set(request, input);
                for (const guard of route.guards) {
                    if (guard.kind === 'auth') {
                        const session = runtime.services.webSessions.resolve(input);
                        if ('status' in session) return send(reply, session);
                        const decision = await authenticate({ authorization: session.authorization, requestId: request.id });
                        if ('status' in decision) return send(reply, decision);
                        input.userId = decision.userId;
                    } else {
                        const rejected = limit(input, guard.policy);
                        if (rejected) return send(reply, rejected);
                    }
                }
            },
            handler: async (request, reply) => {
                const input = contexts.get(request);
                if (!input) throw new Error('Missing request context');
                const output = new ResponseOutput();
                await route.handler(input, output);
                if (!output.sent) throw new Error('Incomplete controller result');
                return send(reply, output.result);
            }
        });
    }
    app.get('/api/health', async (_request, reply) => reply.header('Cache-Control', 'no-store').code(runtime.isClosing() ? 503 : 200)
        .send({ status: runtime.isClosing() ? 'unavailable' : 'ok', timestamp: new Date().toISOString() }));
    app.get('/api/ready', async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
        try {
            if (runtime.isClosing()) throw new Error('Closing');
            await prisma.$transaction(async tx => {
                await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '2000ms'");
                await tx.$queryRawUnsafe('SELECT 1');
            }, { maxWait: 2000, timeout: 3000 });
            if (schemaCheck) await schemaCheck();
            if (runtime.isClosing()) throw new Error('Closing');
            return reply.send({ status: 'ready' });
        } catch { return reply.code(503).send({ status: 'unavailable' }); }
    });
    const staticRoot = config.staticRoot ?? fileURLToPath(new URL('../../../client/dist/', import.meta.url));
    if (existsSync(staticRoot)) {
        await app.register(staticFiles, { root: staticRoot, maxAge: '1y',
            allowedPath: pathname => !/^\/api(?:\/|$)/i.test(pathname),
            setHeaders: (response, filename) => {
                if (filename.endsWith('.js')) response.header('Content-Type', 'application/javascript; charset=utf-8');
                if (filename.endsWith('.html')) response.header('Cache-Control', 'no-cache');
                else if (filename.includes(`${path.sep}assets${path.sep}`)) response.header('Cache-Control', 'public, max-age=31536000, immutable');
                else if (filename.endsWith(`${path.sep}sw.js`)) response.header('Cache-Control', 'no-cache');
            } });
    }
    app.setNotFoundHandler((request, reply) => {
        let pathname: string;
        try { pathname = decodeURIComponent((request.raw.url ?? '/').split('?')[0] ?? '/'); } catch { return reply.code(400).send({ error: 'Solicitud inválida' }); }
        if (/^\/api(?:\/|$)/i.test(pathname) || !['GET', 'HEAD'].includes(request.method) || !existsSync(path.join(staticRoot, 'index.html')))
            return reply.code(404).send({ error: 'Not found' });
        return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
    app.addHook('preClose', async () => { runtime.markClosing(); });
    // App factories never own/disconnect an injected Prisma client. The explicit
    // process entrypoint drains HTTP, then jobs, then that single client.
    await app.ready();
    return app;
}
