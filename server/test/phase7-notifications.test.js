import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createRuntime } from '../src/app/runtime.js';
import { fakeProviders } from './fixtures/phase7-providers.js';

function fixture({ pending = [], subscribed = true, send, configured = true, upsert } = {}) {
    const calls = { restore: 0, upsert: [], delete: [], sends: [], expired: [] };
    const rows = new Map(pending.map(row => [row.id, row]));
    const prisma = { pendingReminder: {
        findMany: async () => { calls.restore++; return pending; },
        upsert: async data => { calls.upsert.push(data); if (upsert) await upsert(); const row = { id: data.create.exerciseId, ...data.create }; for (const [id, old] of rows) if (old.userId === row.userId && old.exerciseId === row.exerciseId) rows.delete(id); rows.set(row.id, row); return row; },
        updateMany: async data => ({ count: rows.get(data.where.id)?.fireAt.getTime() === data.where.fireAt.getTime() ? 1 : 0 }),
        deleteMany: async data => { calls.delete.push(data); const row = rows.get(data.where.id); const matches = row && (!data.where.fireAt || row.fireAt.getTime() === data.where.fireAt.getTime()); if (matches) rows.delete(row.id); return { count: matches ? 1 : 0 }; }
    }, pushSubscription: {
        findMany: async () => subscribed ? [{ id: 'sub', endpoint: 'https://synthetic.invalid/push', p256dh: 'fake', auth: 'fake' }] : [],
        findFirst: async () => subscribed ? { id: 'sub' } : null,
        deleteMany: async data => calls.expired.push(data)
    }, user: { findUnique: async () => ({ isActive: true, creatineReminderEnabled: true }) }, exercise: { findFirst: async () => ({ id: 'ex' }) } };
    prisma.$transaction = async fn => fn(prisma);
    const runtime = createRuntime({ prisma, config: { jwtSecret: 'synthetic-jwt', nodeEnv: 'test' }, providers: fakeProviders({
        vapidConfigured: configured, webpush: { sendNotification: async (sub, payload) => { calls.sends.push({ sub, payload }); if (send) await send(); } }
    }) });
    return { runtime, calls, services: runtime.services };
}
const exercise = { id: 'ex', name: 'Press', restSeconds: .02 };
test('7 notifications: unconfigured reminders have no persistence or provider effects', async () => {
    const f = fixture({ configured: false }); await f.services.scheduleRestReminder('A', exercise); await f.runtime.startBackground();
    assert.equal(f.calls.restore, 0); assert.equal(f.calls.upsert.length, 0); await f.runtime.stopBackground();
});
test('7 notifications: sequential and concurrent reminders deduplicate by owner/exercise with private lock-screen text', async () => {
    const f = fixture({ upsert: () => delay(10) });
    await f.services.scheduleRestReminder('A', exercise, 'Row'); await f.services.scheduleRestReminder('A', exercise, 'Squat');
    await delay(80); assert.equal(f.calls.sends.length, 1); assert.equal(JSON.parse(f.calls.sends[0].payload).body, 'Tu descanso terminó. Abre NexLift para continuar.');
    assert.equal(f.calls.upsert.length, 2); assert.equal(f.calls.delete.length, 1);
    await Promise.all([f.services.scheduleRestReminder('A', exercise, 'Row'), f.services.scheduleRestReminder('A', exercise, 'Final exercise')]);
    await delay(80); assert.equal(f.calls.sends.length, 2); assert.equal(JSON.parse(f.calls.sends[1].payload).body, 'Tu descanso terminó. Abre NexLift para continuar.');
    assert.equal(f.calls.upsert.length, 4); await f.runtime.stopBackground();
});
test('7 notifications: restoration schedules future, sends recent and discards expired reminders', async () => {
    const now = Date.now(), entry = (id, offset) => ({ id, userId: 'A', exerciseId: id, fireAt: new Date(now + offset), exercise: { name: 'Press' } });
    const f = fixture({ pending: [entry('future', 1000), entry('recent', -1000), entry('old', -360000)] });
    await f.runtime.startBackground(); assert.equal(f.calls.sends.length, 1); assert.equal(f.calls.delete.length, 2);
    await f.runtime.stopBackground(); await delay(30); assert.equal(f.calls.sends.length, 1);
});
test('7 notifications: repeated background start restores only once and shutdown prevents timer sends', async () => {
    const f = fixture(); await Promise.all([f.runtime.startBackground(), f.runtime.startBackground(), f.runtime.startBackground()]);
    assert.equal(f.calls.restore, 1); await f.services.scheduleRestReminder('A', exercise); await f.runtime.stopBackground();
    await delay(60); assert.equal(f.calls.sends.length, 0); await assert.rejects(f.runtime.startBackground());
});
test('7 notifications: expired push subscriptions are pruned and JSON object payload is encoded', async () => {
    const f = fixture({ send: async () => { throw Object.assign(new Error('Synthetic expired'), { statusCode: 410 }); } });
    await f.services.sendPushToUser('A', { title: 'Synthetic push' });
    assert.equal(f.calls.expired.length, 1); assert.equal(typeof f.calls.sends[0].payload, 'string'); await f.runtime.stopBackground();
});
test('7 notifications: provider failures remain handled and pending reminder is retired', async () => {
    const f = fixture({ send: async () => { throw new Error('Synthetic provider unavailable'); } });
    await f.services.scheduleRestReminder('A', exercise); await delay(80);
    assert.equal(f.calls.delete.length, 1); await f.runtime.stopBackground();
});
test('7 notifications: shutdown awaits in-flight persistence and removes subsequently created timer', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    const f = fixture({ upsert: () => gate });
    const scheduled = f.services.scheduleRestReminder('A', exercise);
    const lastAccepted = f.services.scheduleRestReminder('A', exercise, 'Last accepted'); await delay(1);
    let stopped = false; const closing = f.runtime.stopBackground().then(() => { stopped = true; });
    await delay(1); assert.equal(stopped, false); release(); await scheduled; await lastAccepted; await closing;
    assert.equal(f.calls.upsert.length, 2); assert.equal(f.calls.upsert.at(-1).create.nextExerciseName, 'Last accepted');
    await delay(60); assert.equal(f.calls.sends.length, 0);
});
test('7 lifecycle: two runtimes cannot start duplicate jobs on the same Prisma client', async () => {
    const prisma = {}, config = { jwtSecret: 'synthetic', nodeEnv: 'test' }, providers = fakeProviders();
    const a = createRuntime({ prisma, config, providers }), b = createRuntime({ prisma, config, providers });
    await a.startBackground(); await assert.rejects(b.startBackground(), /already owned/);
    await a.stopBackground(); await b.startBackground(); await b.stopBackground();
});
