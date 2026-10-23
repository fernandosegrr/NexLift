// Synthetic IPC-only HTTP host. Never imported by the application entrypoint.
import express from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { installEgressGuard } from '../../staging/egress.mjs';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { mountOperationRoutes } from '../../src/routes/operations.js';
import { createWorkoutHandlers } from '../../src/routes/workouts.js';

if (!process.send || !process.env.NEXLIFT_SYNC_TEST || !process.env.NEXLIFT_OPS_TEST_ROOT) throw new Error('Disposable IPC runner required');
const url = new URL(process.env.NEXLIFT_OPS_TEST_URL);
if (url.hostname !== '127.0.0.1' || url.port !== process.env.NEXLIFT_OPS_TEST_PORT || !['/nexlift_ops_test_empty', '/nexlift_ops_test_missing'].includes(url.pathname)) throw new Error('Invalid disposable target');
url.username = 'nexlift_sync_http'; url.searchParams.set('connection_limit', '2');
installEgressGuard();
const db = new PrismaClient({ datasources: { db: { url: url.href } } }), context = new AsyncLocalStorage();
let fault;
const prisma = new Proxy(db, { get(target, key) {
    if (key === '$transaction') return async (fn, options) => {
        const active = context.getStore();
        const result = await target.$transaction(async tx => {
            const value = await fn(tx);
            if (active?.fault === 'before') {
                active.res.destroy();
                // SQL failure AFTER workout/PR/receipt INSERT but BEFORE COMMIT.
                await tx.$executeRaw`SELECT 1 / 0`;
            }
            return value;
        }, options);
        // The actual database COMMIT has completed. Lose only its HTTP reply.
        if (active?.fault === 'after') active.res.destroy();
        return result;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
} });
const app = express(); app.use(express.json());
app.use((req, res, next) => {
    const selected = req.method === 'POST' && req.path === '/api/v1/workout-operations' ? fault : null;
    if (selected) fault = null;
    context.run({ fault: selected, res }, next);
});
const auth = createAuthMiddleware({ prisma, secret: 'synthetic-sync-jwt', log: () => {} });
mountOperationRoutes(app, { prisma, authMiddleware: auth, offlineSyncEnabled: true });
const handlers = createWorkoutHandlers({ prisma, logger: { error() {} } });
app.post('/api/shortcuts/log-set', auth, handlers.logShortcutSet);
app.get('/api/auth/me', auth, async (req, res) => res.json({ id: req.userId, username: req.userId, firstName: 'Ensayo' }));
const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('message', async message => {
    if (message?.fault) { fault = message.fault; process.send({ fault }); return; }
    if (message !== 'stop') return;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await db.$disconnect(); process.exit(0);
});
