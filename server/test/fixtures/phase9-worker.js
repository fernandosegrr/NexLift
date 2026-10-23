import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createRuntime } from '../../src/app/runtime.js';
import { fakeProviders } from './phase7-providers.js';

const target = new URL(process.env.NEXLIFT_PHASE9_URL);
assert.equal(target.hostname, '127.0.0.1');
assert.match(target.pathname, /^\/nexlift_ops_test_phase6_[a-f0-9_]+$/);
assert.match(process.env.NEXLIFT_PHASE6_MARKER, /^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$/);
const prisma = new PrismaClient({ datasources: { db: { url: target.href } } });
const [identity] = await prisma.$queryRaw`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()`;
assert.equal(identity.marker, process.env.NEXLIFT_PHASE6_MARKER);
let accepted = 0, crashBeforeSend = false;
const runtime = createRuntime({ prisma, config: { jwtSecret: 'synthetic-worker-only', nodeEnv: 'test' },
    providers: fakeProviders({ vapidConfigured: true, webpush: { sendNotification: async () => {
        if (crashBeforeSend) { process.send({ claimed: true }); await new Promise(() => {}); }
        accepted++;
    } } }) });
process.send({ ready: true });
process.once('message', async message => {
    try {
        const action = typeof message === 'string' ? message : message.action;
        crashBeforeSend = message.crashBeforeSend === true;
        assert(['restorePendingReminders', 'checkCreatineReminders', 'checkReengagementReminders'].includes(action));
        await runtime.services[action]();
        process.send({ accepted });
    } finally { await runtime.stopBackground(); await prisma.$disconnect(); process.disconnect(); }
});
