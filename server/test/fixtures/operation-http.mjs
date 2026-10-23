import express from 'express';
import { PrismaClient } from '@prisma/client';
import { installEgressGuard } from '../../staging/egress.mjs';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { mountOperationRoutes } from '../../src/routes/operations.js';
import { createWorkoutHandlers } from '../../src/routes/workouts.js';

if (!process.env.NEXLIFT_OPS_TEST_ROOT || !process.send) throw new Error('Disposable IPC runner required');
const u = new URL(process.env.NEXLIFT_OPS_TEST_URL);
if (u.hostname !== '127.0.0.1' || u.port !== process.env.NEXLIFT_OPS_TEST_PORT || u.pathname !== '/nexlift_ops_test_empty') throw new Error('Unexpected test target');
u.username = 'nexlift_ops_http';
installEgressGuard();
const prisma = new PrismaClient({ datasources: { db: { url: u.href } } });
const authPrisma = new Proxy(prisma, { get(target, key) {
    if (key !== 'user') return target[key];
    return { async findUnique(args) {
        try { return await target.user.findUnique(args); }
        catch (error) { process.send({ diagnostic: error.code }); throw error; }
    } };
} });
const app = express(); app.use(express.json());
const auth = createAuthMiddleware({ prisma: authPrisma, secret: 'synthetic-operation-jwt', log: () => {} });
mountOperationRoutes(app, { prisma, authMiddleware: auth });
const handlers = createWorkoutHandlers({ prisma, logger: { error() {} } });
app.post('/api/workouts/log', auth, handlers.logWorkout);
app.put('/api/workouts/:logId', auth, handlers.updateWorkout);
app.delete('/api/workouts/:logId', auth, handlers.deleteWorkout);
app.post('/api/shortcuts/log-set', auth, handlers.logShortcutSet);
app.use((error, req, res, next) => { if (res.headersSent) return next(error); res.status(400).json({ code: 'INVALID_JSON' }); });
const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('message', async message => {
    if (message !== 'stop') return;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); process.exit(0);
});
