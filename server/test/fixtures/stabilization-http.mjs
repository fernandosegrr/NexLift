// Synthetic IPC-only HTTP host. Never imported by the application entrypoint.
import express from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '../../src/services/historyPersistence.js';
import { installEgressGuard } from '../../staging/egress.mjs';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { mountOperationRoutes } from '../../src/routes/operations.js';
import { createWorkoutHandlers } from '../../src/routes/workouts.js';

if (!process.send || !process.env.NEXLIFT_SYNC_TEST || !process.env.NEXLIFT_OPS_TEST_ROOT) throw new Error('Disposable IPC runner required');
const url = new URL(process.env.NEXLIFT_OPS_TEST_URL);
const allowed = process.env.NEXLIFT_PHASE6_OFFLINE_A
    ? [process.env.NEXLIFT_PHASE6_OFFLINE_A, process.env.NEXLIFT_PHASE6_OFFLINE_B].map(name => {
        if (!/^nexlift_ops_test_phase6_[a-f0-9_]+$/.test(name)) throw new Error('Invalid Phase6 disposable identity');
        return '/' + name;
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
    // Keep this boundary armed until the controller explicitly releases it:
    // Chromium may transparently retry a connection lost before HTTP headers.
    context.run({ fault: selected, res }, next);
});
const auth = createAuthMiddleware({ prisma, secret: 'synthetic-sync-jwt', log: () => {} });
mountOperationRoutes(app, { prisma, authMiddleware: auth, offlineSyncEnabled: true, resolutionEnabled: true });
const handlers = createWorkoutHandlers({ prisma, logger: { error() {} } });
app.post('/api/shortcuts/log-set', auth, handlers.logShortcutSet);
app.get('/api/routines', auth, async (req,res) => res.set('Cache-Control','no-store').json(await db.routine.findMany({where:{userId:req.userId},include:{days:{include:{exercises:true}}}})));
app.get('/api/workouts/exercise/:id/history',auth,async(req,res)=>res.set('Cache-Control','no-store').json(await db.workoutLog.findMany({where:{exerciseId:req.params.id,exercise:{routineDay:{routine:{userId:req.userId}}}},include:{sets:{orderBy:{setNumber:'asc'}}},orderBy:{date:'desc'}})));
app.get('/api/goals',auth,(req,res)=>res.json([]));
app.get('/api/auth/me', auth, async (req, res) => res.json({ id: req.userId, username: req.userId, firstName: 'Ensayo' }));
const server = app.listen(Number(process.env.NEXLIFT_CONFLICT_HTTP_PORT) || 0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('message', async message => {
    if (message && Object.hasOwn(message, 'fault')) { fault = message.fault; process.send({ fault }); return; }
    if (message !== 'stop') return;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await db.$disconnect(); process.exit(0);
});
