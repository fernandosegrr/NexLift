import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createECDH } from 'node:crypto';
import { createApp } from '../build/app/createApp.js';
import { createExpressApp } from '../src/app/createExpressApp.js';
import { createRuntime } from '../src/app/runtime.js';
import { buildRoutes } from '../src/app/routes.js';
import { ResponseOutput } from '../src/generated/http.cjs';
import { fakeProviders } from './fixtures/phase7-providers.js';
import { target, migrations, baseline, operations, history, seed, rows, sql, close, tables, env, marker } from './fixtures/phase6-environment.js';
import { mexicoCityDateStr, mexicoCityDayBounds, evaluateCreatineReminderStage } from '../src/logic.js';

const peers = [], secret = 'synthetic-phase9-sql-secret';
const keys = { p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') };
const auth = owner => `Bearer ${jwt.sign({ userId: owner, tokenVersion: 0 }, secret, { expiresIn: '365d' })}`;
const evidence = { productionTouched: false, persistentDatabaseAccessed: false, cases: [], routes: [], provider: 'simulated acceptance only' };
async function call(peer, path, body, options = {}) {
    const response = await fetch(peer.base + path, { method: body === undefined ? 'GET' : 'POST', ...options,
        headers: { authorization: auth('A'), 'content-type': 'application/json', ...options.headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json(), headers: response.headers };
}
before(async () => {
    for (const framework of ['express', 'fastify']) {
        const db = await target(framework === 'express' ? 'e9' : 'f9');
        assert.equal((await migrations(db, [baseline, operations, history])).status, 0);
        const sends = [], failures = [], mode = { status: null, retries: 0, gate: null, onSend: null };
        const providers = fakeProviders({ vapidConfigured: true, webpush: { sendNotification: async (_sub, payload, options) => {
            mode.onSend?.();
            if (mode.gate) await mode.gate;
            if (mode.status) { failures.push(mode.status); const statusCode = mode.status; if (mode.retries++ === 0 && [429, 503].includes(statusCode)) mode.status = null;
                throw Object.assign(Error('SENSITIVE_ENDPOINT_TOKEN_PASSWORD'), { statusCode, headers: { 'retry-after': '0' } }); }
            sends.push({ payload: JSON.parse(payload), options });
        } } });
        const runtime = createRuntime({ prisma: db.client, config: { jwtSecret: secret, nodeEnv: 'test', offlineSyncEnabled: true, resolutionEnabled: true }, providers });
        const app = framework === 'express' ? createExpressApp({ runtime }) : await createApp({ runtime });
        let server;
        if (framework === 'express') { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); }
        else { await app.listen({ host: '127.0.0.1', port: 0 }); server = app.server; }
        peers.push({ framework, db, runtime, app, server, sends, failures, mode, base: `http://127.0.0.1:${server.address().port}` });
    }
});
beforeEach(async context => {
    evidence.cases.push(context.name);
    for (const peer of peers) {
        peer.runtime.services.cancelPending();
        sql(peer.db, `TRUNCATE ${tables.map(t => `"${t}"`).join(',')}, nexlift_operations."IdempotencyRecord" CASCADE;`);
        seed(peer.db); peer.sends.length = 0; peer.failures.length = 0; Object.assign(peer.mode, { status: null, retries: 0, gate: null });
        await peer.db.raw.pendingReminder.deleteMany();
        await peer.db.raw.pushSubscription.updateMany({ data: { endpoint: 'https://synthetic.invalid/device-a' } });
        await peer.db.raw.pushSubscription.create({ data: { userId: 'B', endpoint: 'https://synthetic.invalid/device-b', ...keys } });
        await peer.db.raw.user.updateMany({ data: { passwordHash: await bcrypt.hash('Synthetic123', 4), securityAnswerHash: await bcrypt.hash('synthetic', 4), securityQuestion: 'Synthetic?' } });
    }
});
after(async () => {
    for (const peer of peers) {
        if (peer.app.close) await peer.app.close(); else { peer.server.closeAllConnections(); await new Promise(resolve => peer.server.close(resolve)); }
        await peer.runtime.stopBackground();
    }
    await close();
    const dest = new URL('../audit/security/', import.meta.url); await mkdir(dest, { recursive: true });
    await writeFile(new URL('integration-evidence.json', dest), JSON.stringify(evidence, null, 2) + '\n');
});

test('9 SQL/HTTP: every current route has reviewed guards and private routes reject missing credentials', async () => {
    const routes = buildRoutes(peers[0].runtime.services); evidence.routes = routes.map(r => ({ method: r.method, path: r.path, domain: r.domain,
        guards: r.guards.map(g => g.kind), owner: 'verified identity only' }));
    assert.equal(routes.length, 77); // 73 received + 3 disabled rehearsal routes + compatible reminder cancellation; probes are separate.
    for (const peer of peers) for (const route of routes.filter(r => r.guards.some(g => g.kind === 'auth'))) {
        const response = await call(peer, route.path.replace(/:[^/]+/g, 'foreign'), route.method === 'GET' ? undefined : {},
            { method: route.method, headers: { authorization: '' } });
        assert.equal(response.status, 401, route.path); assert.equal(response.headers.get('cache-control'), 'no-store');
    }
});
test('9 SQL/HTTP: every route with resource parameters preserves the second account under owner spoofing', async () => {
    for (const peer of peers) {
        const beforeB = (await rows(peer.db)).User.find(row => row.id === 'B');
        const protectedTables = ['Routine', 'Exercise', 'WorkoutLog', 'SetLog', 'BodyLog', 'Goal'];
        const beforeRows = await rows(peer.db);
        for (const route of buildRoutes(peer.runtime.services).filter(r => r.path.includes(':'))) {
            const path = route.path.replace(/:([A-Za-z]+)/g, (_all, name) => ({ id: 'rb', logId: 'wb', exerciseId: 'eb', routineDayId: 'db', exerciseName: 'Press', operationId: '00000000-0000-4000-8000-000000000001' })[name] || 'foreign');
            const response = await call(peer, path, route.method === 'GET' ? undefined : { userId: 'B', ownerId: 'B', muscleGroup: 'attack', sets: [{ weight: 999, reps: 1, completed: true }], name: 'attack' }, { method: route.method });
            assert(response.status < 500, `${route.method} ${path}: ${JSON.stringify(response.body)}`);
        }
        const afterRows = await rows(peer.db);
        assert.deepEqual(afterRows.User.find(row => row.id === 'B'), beforeB);
        for (const table of protectedTables) assert.deepEqual(afterRows[table], beforeRows[table], table);
    }
});
test('9 SQL/HTTP: backups exclude credentials and cannot export the other account through query or body', async () => {
    for (const peer of peers) {
        const response = await call(peer, '/api/backup/export?userId=B'); assert.equal(response.status, 200);
        assert.equal(response.body.source.userId, 'A');
        assert.doesNotMatch(JSON.stringify(response.body), /passwordHash|securityAnswerHash|tokenVersion|b@synthetic|SYNTHETIC_SECRET/);
    }
});
test('9 SQL/HTTP: endpoint ownership cannot be stolen concurrently by a second account', async () => {
    for (const peer of peers) {
        const endpoint = 'https://synthetic.invalid/owned';
        await peer.db.raw.pushSubscription.create({ data: { userId: 'B', endpoint, ...keys } });
        const before = await peer.db.raw.pushSubscription.findUnique({ where: { endpoint } });
        const responses = await Promise.all(Array.from({ length: 4 }, () => call(peer, '/api/push/subscribe', { endpoint, keys, userId: 'B' })));
        responses.forEach(response => assert.equal(response.status, 409));
        assert.deepEqual(await peer.db.raw.pushSubscription.findUnique({ where: { endpoint } }), before);
    }
});
test('9 SQL/HTTP: subscription response excludes capability and keys, deletion is account scoped', async () => {
    for (const peer of peers) {
        const endpoint = 'https://synthetic.invalid/new';
        const response = await call(peer, '/api/push/subscribe', { endpoint, keys }); assert.equal(response.status, 201);
        assert.doesNotMatch(JSON.stringify(response.body), /endpoint|p256dh|auth"/);
        assert.equal((await call(peer, '/api/push/subscribe', { endpoint }, { method: 'DELETE', headers: { authorization: auth('B') } })).status, 200);
        assert(await peer.db.raw.pushSubscription.findUnique({ where: { endpoint } }));
    }
});
test('9 SQL/HTTP: provider 404 and 410 retire only the expired subscription', async () => {
    for (const peer of peers) for (const status of [404, 410]) {
        await peer.db.raw.pushSubscription.deleteMany({ where: { userId: 'A' } });
        await peer.db.raw.pushSubscription.create({ data: { userId: 'A', endpoint: `https://synthetic.invalid/expired-${status}`, ...keys } });
        peer.mode.status = status;
        const accepted = await peer.runtime.services.sendPushToUser('A', { title: 'Synthetic' }); assert.equal(accepted, 0);
        assert.equal(await peer.db.raw.pushSubscription.count({ where: { userId: 'A' } }), 0);
        assert(await peer.db.raw.pushSubscription.count({ where: { userId: 'B' } }));
        const rotating = await peer.db.raw.pushSubscription.create({ data: { userId: 'A', endpoint: `https://synthetic.invalid/rotation-${status}`, ...keys } });
        let release, entered;
        peer.mode.gate = new Promise(resolve => { release = resolve; });
        const providerEntered = new Promise(resolve => { entered = resolve; });
        peer.mode.onSend = () => { entered(); peer.mode.onSend = null; };
        const oldSend = peer.runtime.services.sendPushToUser('A', { title: 'Synthetic rotation' });
        await providerEntered;
        const renewed = createECDH('prime256v1').generateKeys().toString('base64url');
        await peer.db.raw.pushSubscription.update({ where: { id: rotating.id }, data: { p256dh: renewed } });
        release(); await oldSend; peer.mode.gate = null;
        assert.equal((await peer.db.raw.pushSubscription.findUnique({ where: { id: rotating.id } }))?.p256dh, renewed, 'A stale expiry response must preserve renewed encryption keys');
        await peer.db.raw.pushSubscription.delete({ where: { id: rotating.id } });
    }
});
test('9 SQL/HTTP: explicit transient provider refusal has one bounded retry and accurate acceptance count', async () => {
    for (const peer of peers) {
        peer.mode.status = 503;
        assert.equal(await peer.runtime.services.sendPushToUser('A', { title: 'Synthetic' }), 1);
        assert.deepEqual(peer.failures, [503]); assert.equal(peer.sends.length, 1);
        assert.deepEqual(peer.sends[0].options, { TTL: 300, timeout: 10000 });
    }
});
test('9 SQL/HTTP: test push distinguishes attempted devices from provider acceptance', async () => {
    for (const peer of peers) {
        peer.mode.status = 500;
        const result = await call(peer, '/api/push/test-creatine', {}); assert.equal(result.status, 200);
        assert.equal(result.body.sentTo, 0); assert.equal(result.body.attempted, 1); assert.equal(result.body.status, 'not_accepted');
    }
});
test('9 SQL: cancelled and replaced rest reminders cannot consume the latest durable event', async () => {
    for (const peer of peers) {
        const old = await peer.db.raw.pendingReminder.create({ data: { userId: 'A', exerciseId: 'ea', fireAt: new Date(Date.now() - 100) } });
        await peer.db.raw.pendingReminder.update({ where: { id: old.id }, data: { fireAt: new Date(Date.now() + 60000) } });
        await peer.runtime.services.firePendingReminder('A', 'ea', 'Private Press', null, old);
        assert.equal(peer.sends.length, 0); assert.equal(await peer.db.raw.pendingReminder.count(), 1);
        await peer.db.raw.pendingReminder.deleteMany();
        await peer.runtime.services.firePendingReminder('A', 'ea', 'Private Press', null, old);
        assert.equal(peer.sends.length, 0);
    }
});
test('9 SQL: concurrent schedules keep one durable rest event and one private provider message', async () => {
    for (const peer of peers) {
        await Promise.all(Array.from({ length: 5 }, () => peer.runtime.services.scheduleRestReminder('A', { id: 'ea', name: 'Private Press', restSeconds: .08 }, 'Secret Squat')));
        assert.equal(await peer.db.raw.pendingReminder.count(), 1); await delay(180);
        assert.equal(peer.sends.length, 1); assert.doesNotMatch(JSON.stringify(peer.sends), /Private Press|Secret Squat/);
        assert.equal(await peer.db.raw.pendingReminder.count(), 0);
    }
});
test('9 SQL/lifecycle: closing pauses sends while an accepted HTTP request can persist its reminder for restart', async () => {
    for (const peer of peers) {
        let sends = 0;
        const closing = createRuntime({ prisma: peer.db.client, config: { jwtSecret: secret, nodeEnv: 'test' },
            providers: fakeProviders({ vapidConfigured: true, webpush: { sendNotification: async () => { sends++; } } }) });
        closing.markClosing();
        await closing.services.scheduleRestReminder('A', { id: 'ea', name: 'Press', restSeconds: .02 });
        await delay(40); assert.equal(sends, 0); assert.equal(await peer.db.raw.pendingReminder.count(), 1);
        await closing.stopBackground();
        await peer.runtime.services.restorePendingReminders(); assert.equal(peer.sends.length, 1);
        assert.equal(await peer.db.raw.pendingReminder.count(), 0);
    }
});
test('9 SQL/HTTP: an acknowledged rest cancellation is idempotent, account scoped and survives restart', async () => {
    for (const peer of peers) {
        await peer.db.raw.exercise.update({ where: { id: 'ea' }, data: { restSeconds: 1 } });
        const scheduled = await call(peer, '/api/workouts/rest-reminder', { exerciseId: 'ea' }); assert.equal(scheduled.status, 202);
        const receipt = { reminderId: scheduled.body.reminder.id, fireAt: scheduled.body.reminder.fireAt, userId: 'A' };
        const foreign = await call(peer, '/api/workouts/rest-reminder', receipt, { method: 'DELETE', headers: { authorization: auth('B') } });
        assert.equal(foreign.status, 200); assert.equal(foreign.body.cancelled, false); assert.equal(await peer.db.raw.pendingReminder.count(), 1);
        const cancelled = await call(peer, '/api/workouts/rest-reminder', { ...receipt, userId: 'B' }, { method: 'DELETE' });
        assert.equal(cancelled.status, 200); assert.equal(cancelled.body.cancelled, true);
        assert.equal((await call(peer, '/api/workouts/rest-reminder', receipt, { method: 'DELETE' })).body.cancelled, false);
        await delay(1150); await peer.runtime.services.restorePendingReminders();
        assert.equal(peer.sends.length, 0); assert.equal(await peer.db.raw.pendingReminder.count(), 0);
    }
});
test('9 SQL/HTTP: delayed cancellation of an old generation cannot cancel its replacement', async () => {
    for (const peer of peers) {
        const first = await call(peer, '/api/workouts/rest-reminder', { exerciseId: 'ea' });
        const second = await call(peer, '/api/workouts/rest-reminder', { exerciseId: 'ea' });
        assert.notEqual(first.body.reminder.id, second.body.reminder.id);
        const cancelled = await call(peer, '/api/workouts/rest-reminder', { reminderId: first.body.reminder.id, fireAt: first.body.reminder.fireAt }, { method: 'DELETE' });
        assert.equal(cancelled.status, 200); assert.equal(cancelled.body.cancelled, false);
        assert.equal((await peer.db.raw.pendingReminder.findFirst({ where: { userId: 'A', exerciseId: 'ea' } })).id, second.body.reminder.id);
        assert.equal((await call(peer, '/api/workouts/rest-reminder', { reminderId: second.body.reminder.id, fireAt: second.body.reminder.fireAt }, { method: 'DELETE' })).body.cancelled, true);
    }
});
async function workers(peer, action) {
    const children = [0, 1].map(() => fork(new URL('./fixtures/phase9-worker.js', import.meta.url), [], {
        env: { ...env, NEXLIFT_PHASE9_URL: peer.db.url, NEXLIFT_PHASE6_MARKER: marker }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true
    }));
    try {
        await Promise.all(children.map(async child => { const [message] = await once(child, 'message'); assert.equal(message.ready, true); }));
        const replies = children.map(child => once(child, 'message')); const exits = children.map(child => once(child, 'exit'));
        children.forEach(child => child.send(action)); const result = await Promise.all(replies); const ended = await Promise.all(exits);
        ended.forEach(([code]) => assert.equal(code, 0)); return result.reduce((sum, [row]) => sum + row.accepted, 0);
    } finally { for (const child of children) if (child.exitCode === null) child.kill(); }
}
test('9 SQL/processes: simultaneous restoration by two backends consumes a rest reminder once', async () => {
    for (const peer of peers) {
        await peer.db.raw.pendingReminder.create({ data: { userId: 'A', exerciseId: 'ea', fireAt: new Date(Date.now() - 100) } });
        assert.equal(await workers(peer, 'restorePendingReminders'), 1); assert.equal(await peer.db.raw.pendingReminder.count(), 0);
        assert.equal(await workers(peer, 'restorePendingReminders'), 0);
    }
});
test('9 SQL/processes: creatine stages are claimed once across two independent application processes', async () => {
    for (const peer of peers) {
        await peer.db.raw.user.update({ where: { id: 'A' }, data: { creatineReminderEnabled: true, creatineReminderTime: '00:00' } });
        const expected = evaluateCreatineReminderStage(new Date(), '00:00', null, 0);
        assert(expected, 'Current civil time must allow a stage');
        assert.equal(await workers(peer, 'checkCreatineReminders'), 1);
        assert.equal(await workers(peer, 'checkCreatineReminders'), 0);
        const user = await peer.db.raw.user.findUnique({ where: { id: 'A' } }); assert.equal(user.lastCreatineReminderStage, expected.stage);
    }
});
test('9 SQL/processes: reengagement daily claim survives competing processes and restart', async () => {
    for (const peer of peers) {
        await peer.db.raw.workoutLog.deleteMany({ where: { userId: 'A' } });
        for (let n = 0; n < 5; n++) await peer.db.raw.workoutLog.create({ data: { userId: 'A', exerciseId: 'ea',
            exerciseNameSnapshot: 'Press', date: new Date(Date.now() - 4 * 86400000 - n * 1000) } });
        assert.equal(await workers(peer, 'checkReengagementReminders'), 1);
        assert.equal(await workers(peer, 'checkReengagementReminders'), 0);
    }
});
test('9 SQL/processes: abrupt crash before provider acceptance rolls back the rest claim for restart', async () => {
    for (const peer of peers) {
        await peer.db.raw.pendingReminder.create({ data: { userId: 'A', exerciseId: 'ea', fireAt: new Date(Date.now() - 100) } });
        const child = fork(new URL('./fixtures/phase9-worker.js', import.meta.url), [], { env: { ...env, NEXLIFT_PHASE9_URL: peer.db.url,
            NEXLIFT_PHASE6_MARKER: marker }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
        try {
            const [ready] = await once(child, 'message'); assert(ready.ready);
            const claimed = once(child, 'message'); child.send({ action: 'restorePendingReminders', crashBeforeSend: true });
            assert.equal((await claimed)[0].claimed, true);
            const ended = once(child, 'exit'); child.kill(); await ended;
            assert.equal(await peer.db.raw.pendingReminder.count(), 1);
            assert.equal(await workers(peer, 'restorePendingReminders'), 1);
            assert.equal(await peer.db.raw.pendingReminder.count(), 0);
        } finally { if (child.exitCode === null) child.kill(); }
    }
});
test('9 SQL: disabled category and recorded dose prevent creatine messages', async () => {
    for (const peer of peers) {
        await peer.db.raw.user.update({ where: { id: 'A' }, data: { creatineReminderEnabled: false, creatineReminderTime: '00:00' } });
        await peer.runtime.services.checkCreatineReminders(); assert.equal(peer.sends.length, 0);
        await peer.db.raw.user.update({ where: { id: 'A' }, data: { creatineReminderEnabled: true } });
        await peer.db.raw.bodyLog.create({ data: { userId: 'A', date: new Date(), creatineTaken: true } });
        await peer.runtime.services.checkCreatineReminders(); assert.equal(peer.sends.length, 0);
    }
});
test('9 SQL: stale reminders are discarded on restart and forged reminder owner never receives exercise data', async () => {
    for (const peer of peers) {
        await peer.db.raw.pendingReminder.create({ data: { userId: 'A', exerciseId: 'ea', fireAt: new Date(Date.now() - 600000) } });
        await assert.rejects(peer.db.raw.pendingReminder.create({ data: { userId: 'B', exerciseId: 'ea', fireAt: new Date(Date.now() - 100) } }), /Related exercise belongs to another account/);
        await peer.runtime.services.firePendingReminder('B', 'ea', 'private', null, { id: 'forged', fireAt: new Date(Date.now() - 100) });
        await peer.runtime.services.restorePendingReminders(); assert.equal(peer.sends.length, 0);
        assert.equal(await peer.db.raw.pendingReminder.count({ where: { userId: 'A' } }), 0);
    }
});
test('9 SQL: logout removal during a multi-device send prevents the removed device attempt', async () => {
    for (const peer of peers) {
        await peer.db.raw.pushSubscription.create({ data: { userId: 'A', endpoint: 'https://synthetic.invalid/device-2', ...keys } });
        let release; peer.mode.gate = new Promise(resolve => { release = resolve; });
        const sending = peer.runtime.services.sendPushToUser('A', { title: 'Synthetic' }); await delay(20);
        await peer.db.raw.pushSubscription.deleteMany({ where: { userId: 'A' } }); release(); await sending;
        assert(peer.sends.length <= 1, 'Only already in-flight provider request may complete');
    }
});
test('9 SQL/HTTP: login repetition is bounded under concurrency with generic credentials failures', async () => {
    for (const peer of peers) {
        const responses = await Promise.all(Array.from({ length: 15 }, () => call(peer, '/api/auth/login', { username: 'a', password: 'wrong' })));
        assert(responses.some(r => r.status === 429)); responses.forEach(r => assert([401, 429].includes(r.status)));
        for (const r of responses.filter(r => r.status === 401)) assert.equal(r.body.error, 'Credenciales inválidas');
    }
});
test('9 SQL/auth: concurrent credential updates cannot revoke the winning replacement token a second time', async () => {
    for (const peer of peers) {
        let arrived = 0, release;
        const barrier = new Promise(resolve => { release = resolve; });
        const prisma = { user: {
            findUnique: async query => { const user = await peer.db.client.user.findUnique(query); if (++arrived === 2) release(); await barrier; return user; },
            update: query => peer.db.client.user.update(query)
        } };
        const runtime = createRuntime({ prisma, config: { jwtSecret: secret, nodeEnv: 'test' }, providers: fakeProviders() });
        try {
            const route = buildRoutes(runtime.services).find(r => r.method === 'PUT' && r.path === '/api/auth/password');
            const responses = [new ResponseOutput(), new ResponseOutput()];
            await Promise.all(responses.map(output => route.handler({ userId: 'A', path: route.path,
                body: { currentPassword: 'Synthetic123', newPassword: 'Concurrent123' } }, output)));
            assert.deepEqual(responses.map(output => output.result.status).sort(), [200, 409]);
            const winner = responses.find(output => output.result.status === 200).result.body.token;
            assert.equal(jwt.verify(winner, secret).tokenVersion, 1);
            assert.equal((await peer.db.raw.user.findUnique({ where: { id: 'A' } })).tokenVersion, 1);
            assert.equal((await call(peer, '/api/auth/me', undefined, { headers: { authorization: `Bearer ${winner}` } })).status, 200);
            assert.equal((await call(peer, '/api/auth/me')).status, 401);
        } finally { await runtime.stopBackground(); }
    }
});
test('9 time: CDMX midnight, Sunday, week, month and year boundaries preserve stage/date semantics', () => {
    for (const date of ['2026-01-01', '2026-02-01', '2026-11-01', '2027-01-01']) {
        const instant = new Date(date + 'T06:00:00.000Z'); assert.equal(mexicoCityDateStr(instant), date);
        const bounds = mexicoCityDayBounds(instant); assert.equal(bounds.start.getTime(), instant.getTime());
        assert.equal(bounds.end - bounds.start, 86400000);
        assert.notEqual(mexicoCityDateStr(new Date(instant - 1)), date);
    }
});
