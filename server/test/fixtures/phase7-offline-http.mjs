// Full Fastify application under the unchanged offline browser/SQL assertions.
// Only IPC can select synthetic connection-loss faults; no test HTTP endpoints.
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '../../src/services/historyPersistence.js';
import { createApp } from '../../build/app/createApp.js';
import { createRuntime } from '../../src/app/runtime.js';
import { installEgressGuard } from '../../staging/egress.mjs';
import { fakeProviders } from './phase7-providers.js';

if (!process.send || !process.env.NEXLIFT_SYNC_TEST || !process.env.NEXLIFT_OPS_TEST_ROOT) throw new Error('Disposable IPC runner required');
const url = new URL(process.env.NEXLIFT_OPS_TEST_URL);
const allowed = process.env.NEXLIFT_PHASE6_OFFLINE_A
    ? [process.env.NEXLIFT_PHASE6_OFFLINE_A, process.env.NEXLIFT_PHASE6_OFFLINE_B].map(name => {
        if (!/^nexlift_ops_test_phase6_[a-f0-9_]+$/.test(name)) throw new Error('Invalid disposable identity'); return '/' + name;
    }) : ['/nexlift_ops_test_empty', '/nexlift_ops_test_missing'];
if (url.hostname !== '127.0.0.1' || url.port !== process.env.NEXLIFT_OPS_TEST_PORT || !allowed.includes(url.pathname)) throw new Error('Invalid disposable target');
url.username = 'nexlift_sync_http'; url.searchParams.set('connection_limit', '2');
installEgressGuard();
const db = new PrismaClient({ datasources: { db: { url: url.href } } }), context = new AsyncLocalStorage();
let fault;
const prisma = new Proxy(db, { get(target, key) {
    if (key === '$transaction') return async (fn, options) => {
        const active = context.getStore();
        const result = await target.$transaction(async tx => {
            const value = await fn(tx);
            if (active?.fault === 'before') { active.res.destroy(); await tx.$executeRaw`SELECT 1 / 0`; }
            return value;
        }, options);
        if (active?.fault === 'after') active.res.destroy();
        return result;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
} });
const runtime = createRuntime({ prisma, config: { jwtSecret: 'synthetic-sync-jwt', nodeEnv: 'test', offlineSyncEnabled: true, resolutionEnabled: true }, providers: fakeProviders() });
const app = await createApp({ runtime, configure: async app => {
    app.addHook('onRequest', (req, reply, done) => {
        const selected = req.method === 'POST' && req.url.split('?')[0] === '/api/v1/workout-operations' ? fault : null;
        context.run({ fault: selected, res: reply.raw }, done);
    });
} });
await app.listen({ port: Number(process.env.NEXLIFT_CONFLICT_HTTP_PORT) || 0, host: '127.0.0.1' });
process.send({ port: app.server.address().port, transport: 'fastify', fullApi: true });
process.on('message', async message => {
    if (message && Object.hasOwn(message, 'fault')) { fault = message.fault; process.send({ fault }); return; }
    if (message !== 'stop') return;
    app.server.closeAllConnections(); await app.close(); await runtime.stopBackground(); await db.$disconnect(); process.exit(0);
});
