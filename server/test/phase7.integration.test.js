import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createECDH } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fork, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { comparableIssuedToken } from './fixtures/token-comparison.js';
import { createApp } from '../build/app/createApp.js';
import { createExpressApp } from '../src/app/createExpressApp.js';
import { createRuntime } from '../src/app/runtime.js';
import { buildRoutes } from '../src/app/routes.js';
import { root, env, marker, target, migrations, baseline, operations, history, seed, rows, sql, close, tables } from './fixtures/phase6-environment.js';
import { validateBackup } from '../src/services/backupFormat.js';
import { sessionVersion, parseOperation, requestHash } from '../src/services/operationContract.js';
import { mexicoCityDateStr } from '../src/logic.js';

const secret = 'synthetic-phase7-integration-secret';
const evidence = { createdAt: new Date().toISOString(), productionTouched: false, databaseStatesIndependent: true, cases: [], benchmark: {} };
const peers = [], set = (weight = 80) => ({ weight, reps: 10, rpe: 8, completed: true });
const operation = more => ({ operationId: randomUUID(), kind: 'workout.create', source: 'pwa', performedAt: '2026-10-18T05:59:59.999Z', exerciseId: 'ea', sets: [set()], ...more });
const auth = (owner = 'A', version = 0) => `Bearer ${jwt.sign({ userId: owner, tokenVersion: version }, secret)}`;
const deterministic = async (incoming, existing) => incoming.map((ex, index) => ({ index,
    matchedId: existing.find(row => row.name.toLowerCase() === ex.name.toLowerCase())?.id ?? null, cleanedName: ex.name }));
const unavailable = async () => { throw new Error('Synthetic external failure'); };
function normalizer() {
    const ids = new Map(), hashes = new Map();
    function normalize(value, key = '') {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
            if (/^c[a-z0-9]{24}$/.test(value) || /^nx4_[a-f0-9]+$/.test(value)) { if (!ids.has(value)) ids.set(value, `generated-${ids.size}`); return ids.get(value); }
            if (['sessionVersion', 'expectedVersion'].includes(key) && /^[a-f0-9]{64}$/.test(value)) return '<derived-version>';
            if (key === 'sha256') return '<independently-validated-checksum>';
            if (key === 'requestHash' && hashes.has(value)) return hashes.get(value);
            if (['passwordHash', 'securityAnswerHash'].includes(key) && value.startsWith('$2')) return '<bcrypt-salted>';
            if (key === 'token') return normalize(comparableIssuedToken(value, secret));
            if (/^\d{4}-\d\d-\d\dT/.test(value) && Date.parse(value) > Date.now() - 3600000) return '<generated-time>';
            return value;
        }
        if (Array.isArray(value)) return value.map(v => normalize(v));
        if (typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalize(v, k)]));
        return value;
    }
    normalize.hashes = hashes;
    return normalize;
}
async function state(peer) {
    return { tables: await rows(peer.db), receipts: JSON.parse(JSON.stringify(await peer.db.raw.$queryRaw`SELECT * FROM nexlift_operations."IdempotencyRecord" ORDER BY "userId","operationId"`)) };
}
async function compareState() {
    const result = await Promise.all(peers.map(state));
    assert.deepEqual(peers[0].normalize(result[0]), peers[1].normalize(result[1]), 'All 17 tables and idempotency journal must match');
}
async function request(route, body, { method = body === undefined ? 'GET' : 'POST', owner = 'A', version = 0, raw, headers = {}, status } = {}) {
    if (typeof body === 'function' && (typeof route === 'string' && route === '/api/v1/workout-operations')) for (let i = 0; i < peers.length; i++) {
        const payload = body(peers[i], i), hash = requestHash(parseOperation(payload));
        peers[i].normalize.hashes.set(hash, `<verified-input-hash:${payload.operationId}>`);
    }
    const result = await Promise.all(peers.map(async (peer, i) => {
        const payload = typeof body === 'function' ? body(peer, i) : body;
        const pathname = typeof route === 'function' ? route(peer, i) : route;
        const response = await fetch(peer.base + pathname, { method, headers: { authorization: auth(owner, version), 'content-type': 'application/json', ...headers },
            ...(payload === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(payload) }), signal: AbortSignal.timeout(20000) });
        const value = await response.json();
        if (pathname === '/api/v1/workout-operations' && response.status < 300) {
            assert.equal(value.requestHash, requestHash(parseOperation(payload)));
            if (value.result?.workoutLog) assert.equal(value.result.sessionVersion, sessionVersion(value.result.workoutLog));
        }
        return { status: response.status, headers: Object.fromEntries(response.headers), body: value };
    }));
    if (status !== undefined) for (const r of result) assert.equal(r.status, status, JSON.stringify(r.body));
    assert.equal(result[0].status, result[1].status);
    assert.deepEqual(peers[0].normalize(result[0].body), peers[1].normalize(result[1].body));
    for (const header of ['cache-control', 'retry-after', 'content-type', 'x-content-type-options', 'x-frame-options']) assert.equal(result[0].headers[header], result[1].headers[header], header);
    return result;
}
before(async () => {
    for (const [i, framework] of ['express', 'fastify'].entries()) {
        const db = await target(i === 0 ? 'e7' : 'f7'); assert.equal((await migrations(db, [baseline, operations, history])).status, 0);
        const sends = [], providerFailures = [], providers = { cloudinaryConfigured: false, vapidConfigured: true,
            fetch: async () => { providerFailures.push('synthetic-photo-failure'); return unavailable(); },
            cloudinary: { uploader: { upload: unavailable } }, backupStore: { uploadBackup: unavailable, pruneOldBackups: unavailable },
            deduplicateExercises: deterministic, webpush: { sendNotification: async (sub, payload) => { sends.push({ sub, payload }); } } };
        const runtime = createRuntime({ prisma: db.client, config: { jwtSecret: secret, nodeEnv: 'test', offlineSyncEnabled: true, resolutionEnabled: true }, providers });
        const start = performance.now();
        const app = framework === 'express' ? createExpressApp({ runtime }) : await createApp({ runtime });
        let server;
        if (framework === 'express') { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); }
        else { await app.listen({ host: '127.0.0.1', port: 0 }); server = app.server; }
        evidence.benchmark[framework] = { startupMs: performance.now() - start };
        peers.push({ db, app, server, runtime, base: `http://127.0.0.1:${server.address().port}`, normalize: normalizer(), sends, providerFailures });
    }
});
beforeEach(async context => {
    evidence.cases.push(context.name);
    for (const peer of peers) {
        peer.runtime.services.cancelPending();
        // These clients are connected only to independently identified disposable databases.
        sql(peer.db, `TRUNCATE ${tables.map(t => `"${t}"`).join(',')}, nexlift_operations."IdempotencyRecord" CASCADE;`);
        seed(peer.db);
        await peer.db.raw.pushSubscription.updateMany({ data: { endpoint: 'https://synthetic.invalid/push' } });
        await peer.db.raw.user.updateMany({ data: { passwordHash: await bcrypt.hash('Synthetic123', 4), securityQuestion: 'Synthetic?', securityAnswerHash: await bcrypt.hash('synthetic', 4) } });
        peer.normalize = normalizer(); peer.sends.length = 0; peer.providerFailures.length = 0;
    }
});
after(async () => {
    for (const peer of peers) {
        if (peer.app.close) await peer.app.close(); else { peer.server.closeAllConnections(); await new Promise(resolve => peer.server.close(resolve)); }
        await peer.runtime.stopBackground();
    }
    await close();
    const dest = new URL('../audit/backend/', import.meta.url); await mkdir(dest, { recursive: true });
    await writeFile(new URL('phase7-evidence.json', dest), JSON.stringify(evidence, null, 2) + '\n');
});

test('7 SQL/HTTP: all read endpoints return equivalent types, values and query contracts', async () => {
    const routes = buildRoutes(peers[0].runtime.services).filter(r => r.method === 'GET' && !r.path.startsWith('/api/v1/') && !r.path.includes('/backup/export'));
    const values = { id: 'ra', exerciseId: 'ea', exerciseName: 'Press', logId: 'wa' };
    for (const route of routes) {
        const url = route.path.replace(/:([A-Za-z]+)/g, (_all, key) => values[key] || 'synthetic');
        const result = await request(url); assert.notEqual(result[0].status, 500, url);
    }
    for (const query of ['?limit=1&limit=2', '?limit[0]=1&limit[1]=2', '?dateFrom=2026-10-17&dateTo=2026-10-19', '?extra[x]=null', '?limit=1&exerciseId=ea']) await request('/api/workouts/history' + query);
    await compareState();
});
test('7 SQL/HTTP: registration, login and profile have compatible account contracts', async () => {
    const credentials = { username: 'new', email: 'new@synthetic.invalid', firstName: 'New', lastName: 'Account', password: 'Synthetic123', userId: 'B' };
    const registered = await request('/api/auth/register', credentials, { status: 201 });
    for (const r of registered) assert.notEqual(r.body.user.id, 'B');
    const login = await request('/api/auth/login', { username: 'new', password: credentials.password }, { status: 200 });
    assert(login[0].body.token); await compareState();
});
test('7 SQL/HTTP: password change revokes old tokens while returning a valid new token', async () => {
    const changed = await request('/api/auth/password', { currentPassword: 'Synthetic123', newPassword: 'Changed123' }, { method: 'PUT', status: 200 });
    for (const r of changed) assert.equal(jwt.verify(r.body.token, secret).tokenVersion, 1);
    await request('/api/auth/me', undefined, { status: 401 });
    await request('/api/auth/me', undefined, { version: 1, status: 200 }); await compareState();
});
test('7 SQL/HTTP: account recovery question, validation and token revocation remain compatible', async () => {
    await request('/api/auth/recover/question', { username: 'a' }, { status: 200 });
    await request('/api/auth/recover/verify', { username: 'a', answer: 'wrong', newPassword: 'Recovered123' }, { status: 401 });
    await request('/api/auth/recover/verify', { username: 'a', answer: 'synthetic', newPassword: 'Recovered123' }, { status: 200 });
    await request('/api/auth/me', undefined, { status: 401 }); await compareState();
});
test('7 SQL/HTTP: owner isolation rejects cross-account writes without state changes', async () => {
    const before = await Promise.all(peers.map(state));
    for (const [url, method, body] of [['/api/workouts/wb', 'PUT', { sets: [set(1)] }], ['/api/workouts/wb', 'DELETE'],
        ['/api/routines/rb', 'DELETE'], ['/api/routines/rb/blocks', 'POST', { name: 'Attack' }], ['/api/exercises/eb/muscle', 'PUT', { muscleGroup: 'Arms' }]])
        await request(url, body, { method, status: 404 });
    for (const [i, peer] of peers.entries()) assert.deepEqual(await state(peer), before[i]);
});
test('7 SQL/HTTP: import and edit routines preserve names, weekdays, validation and ownership', async () => {
    const body = { name: 'Imported', userId: 'B', days: [{ dayName: 'Lunes', weekday: 1, exercises: [{ name: 'New Press', targetSets: 2, targetReps: '8-12' }] }] };
    const made = await request('/api/routines/import', body, { status: 201 });
    await request((_p, i) => '/api/routines/' + made[i].body.routine.id, { ...body, name: 'Edited' }, { method: 'PUT', status: 200 });
    await request('/api/routines/import', { ...body, days: [...body.days, ...body.days] }, { status: 400 }); await compareState();
});
test('7 SQL/HTTP: deleting planning and archiving exercises preserves immutable workout history', async () => {
    await request('/api/routines/ra', undefined, { method: 'DELETE', status: 200 });
    const r = await request('/api/workouts/wa', undefined, { status: 200 });
    for (const value of r) assert.equal(value.body.exercise.name, 'Press');
    await request('/api/workouts/exercise/ea/history', undefined, { status: 200 }); await compareState();
});
test('7 SQL/HTTP: create, replace and delete sessions update PR atomically', async () => {
    const created = await request('/api/workouts/log', { exerciseId: 'ea', sets: [set(90)] }, { status: 201 });
    await request((_p, i) => '/api/workouts/' + created[i].body.workoutLog.id, { sets: [set(100)] }, { method: 'PUT', status: 200 });
    await request('/api/stats/prs', undefined, { status: 200 }); await compareState();
    await request((_p, i) => '/api/workouts/' + created[i].body.workoutLog.id, undefined, { method: 'DELETE', status: 200 }); await compareState();
});
test('7 SQL/HTTP: shortcut appends one set, legacy RIR maps to RPE, CDMX and rest remain compatible', async () => {
    const r = await request('/api/shortcuts/log-set?date=2026-10-18', { exerciseId: 'ea', weight: 85, reps: 8, rpe: 2 }, { status: 201 });
    for (const value of r) { const log = value.body.workoutLog; assert.equal(log.sets.at(-1).rpe, 8); assert.equal(mexicoCityDateStr(new Date(log.date)), '2026-10-18'); }
    await request('/api/shortcuts/log-set?date=2026-10-18', { exerciseId: 'ea', weight: 85, reps: 8, rpe: 1 }, { status: 201 });
    await request('/api/shortcuts/next-set?date=2026-10-18', undefined, { status: 200 }); await compareState();
});
test('7 SQL/HTTP: operation commit, receipt and lost-response retry preserve hash and exact acknowledgement', async () => {
    const input = operation(), r = await request('/api/v1/workout-operations', input, { status: 201 });
    const retried = await request('/api/v1/workout-operations', input, { status: 200 });
    for (let i = 0; i < 2; i++) {
        assert.deepEqual({ ...retried[i].body, replayed: false }, r[i].body);
        const [record] = await peers[i].db.raw.$queryRaw`SELECT * FROM nexlift_operations."IdempotencyRecord" WHERE "operationId"=${input.operationId}::uuid`;
        assert.equal(record.requestHash, requestHash(parseOperation(input)));
    }
    await request('/api/v1/workout-operations/' + input.operationId, undefined, { status: 200 }); await compareState();
});
test('7 SQL/HTTP: duplicate concurrent operations commit exactly once on each independent database', async () => {
    const input = operation();
    const results = await Promise.all(peers.map(peer => Promise.all(Array.from({ length: 5 }, async () => {
        const r = await fetch(peer.base + '/api/v1/workout-operations', { method: 'POST', headers: { authorization: auth(), 'content-type': 'application/json' }, body: JSON.stringify(input) });
        return { status: r.status, body: await r.json() };
    }))));
    for (let i = 0; i < 2; i++) {
        assert.deepEqual(results[i].map(r => r.status).sort(), [200, 200, 200, 200, 201]);
        const first = results[i].find(r => r.status === 201).body;
        for (const r of results[i]) assert.deepEqual({ ...r.body, replayed: false }, first);
    }
    assert.deepEqual(peers[0].normalize(results[0][0].body.result), peers[1].normalize(results[1][0].body.result));
    for (const peer of peers) assert.equal(await peer.db.raw.workoutLog.count({ where: { exerciseId: 'ea' } }), 2);
    await compareState();
});
test('7 SQL/HTTP: operation hash mismatch is 409 and foreign receipt is isolated', async () => {
    const input = operation(); await request('/api/v1/workout-operations', input, { status: 201 });
    await request('/api/v1/workout-operations', { ...input, sets: [set(999)] }, { status: 409 });
    await request('/api/v1/workout-operations/' + input.operationId, undefined, { owner: 'B', status: 404 }); await compareState();
});
test('7 SQL/HTTP: expectedVersion conflict and explicit resolution keep session and set identities', async () => {
    const initial = await request('/api/v1/workout-sessions/wa', undefined, { status: 200 });
    const valid = operation({ kind: 'workout.replaceSets', logId: 'wa', expectedVersion: initial[0].body.sessionVersion, exerciseId: undefined, sets: [set(95)] });
    await request('/api/v1/workout-operations', valid, { status: 200 });
    await request('/api/v1/workout-operations', { ...valid, operationId: randomUUID(), sets: [set(100)] }, { status: 409 });
    const latest = await request('/api/v1/workout-sessions/wa', undefined, { status: 200 });
    await request('/api/v1/workout-operations', (_p, i) => ({ ...valid, operationId: '12345678-1234-4000-8000-123456789abc', expectedVersion: latest[i].body.sessionVersion, sets: [set(100)] }), { status: 200 });
    await compareState();
});
test('7 SQL/HTTP: failed PR write rolls back session, sets and receipt together', async () => {
    for (const peer of peers) sql(peer.db, `CREATE FUNCTION phase7_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic SQL secret'; END $$; CREATE TRIGGER phase7_fail BEFORE INSERT OR UPDATE ON "PersonalRecord" FOR EACH ROW EXECUTE FUNCTION phase7_fail();`);
    const before = await Promise.all(peers.map(state));
    try {
        const r = await request('/api/v1/workout-operations', operation({ sets: [set(500)] }), { status: 500 });
        for (const response of r) assert(!JSON.stringify(response.body).includes('SQL secret'));
        for (const [i, peer] of peers.entries()) assert.deepEqual(await state(peer), before[i]);
    } finally { for (const peer of peers) sql(peer.db, 'DROP TRIGGER phase7_fail ON "PersonalRecord"; DROP FUNCTION phase7_fail();'); }
});
test('7 SQL/HTTP: mesocycle creation, edit, start and deletion retain domain rules', async () => {
    const r = await request('/api/routines/ra/blocks', { name: 'New block', phase: 'deload', durationWeeks: 2 }, { status: 201 });
    await request((_p, i) => `/api/routines/ra/blocks/${r[i].body.id}`, { name: 'Edited block' }, { method: 'PUT', status: 200 });
    await request((_p, i) => `/api/routines/ra/blocks/${r[i].body.id}/start`, {}, { status: 200 });
    await request((_p, i) => `/api/routines/ra/blocks/${r[i].body.id}`, undefined, { method: 'DELETE', status: 200 }); await compareState();
});
test('7 SQL/HTTP: body measurements, daily checkin and validation preserve nullable fields', async () => {
    await request('/api/body', { weight: 80, bodyFat: 20, userId: 'B' }, { status: 201 });
    await request('/api/body/checkin?date=2026-10-18', { creatineTaken: true, dietCompliant: false }, { method: 'PUT', status: 200 });
    await request('/api/body', { weight: -1 }, { status: 400 }); await compareState();
});
test('7 SQL/HTTP: goals CRUD and completed-week updates remain compatible', async () => {
    const r = await request('/api/goals', { exerciseName: 'Press', targetWeight: 120, targetReps: 5 }, { status: 201 });
    await request((_p, i) => `/api/goals/${r[i].body.id}/weeks`, { completedWeeks: [1, 2] }, { method: 'PUT', status: 200 });
    await request((_p, i) => `/api/goals/${r[i].body.id}`, undefined, { method: 'DELETE', status: 200 }); await compareState();
});
test('7 SQL/HTTP: backup export validates checksums and dry-run/restore is idempotent', async () => {
    const backup = await request('/api/backup/export', undefined, { status: 200 }); backup.forEach(r => validateBackup(r.body));
    await request('/api/backup/import?dryRun=true', (_p, i) => backup[i].body, { status: 200 });
    await request('/api/backup/import', (_p, i) => backup[i].body, { status: 200 });
    await request('/api/backup/import?extra=true', (_p, i) => backup[i].body, { status: 400 }); await compareState();
});
test('7 SQL/HTTP: push subscriptions, removal, preferences and external failure are isolated', async () => {
    await request('/api/push/subscribe', { endpoint: 'https://synthetic.invalid/second', keys: { p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } }, { status: 201 });
    await request('/api/push/creatine-reminder', { enabled: true, time: '17:30' }, { method: 'PUT', status: 200 });
    await request('/api/push/subscribe', { endpoint: 'https://synthetic.invalid/second' }, { method: 'DELETE', status: 200 });
    await request('/api/backup/run', {}, { status: 503 });
    await request('/api/auth/avatar', { image: 'data:image/png;base64,invalid' }, { status: 400 }); await compareState();
});
test('7 SQL/HTTP: append-set and rest operations preserve versions and receipts', async () => {
    const initial = await request('/api/v1/workout-sessions/wa', undefined, { status: 200 });
    const append = operation({ kind: 'workout.appendSet', logId: 'wa', exerciseId: undefined, expectedVersion: initial[0].body.sessionVersion, sets: [set(90)] });
    await request('/api/v1/workout-operations', append, { status: 201 });
    await request('/api/v1/workout-operations', operation({ kind: 'rest.create', exerciseId: undefined, sets: undefined, note: 'Synthetic rest' }), { status: 201 }); await compareState();
});
test('7 SQL/HTTP: capabilities and canonical sessionVersion have identical protocol semantics', async () => {
    await request('/api/v1/workout-capabilities', undefined, { status: 200 });
    const r = await request('/api/v1/workout-sessions/wa', undefined, { status: 200 });
    for (let i = 0; i < 2; i++) {
        const log = await peers[i].db.raw.workoutLog.findUnique({ where: { id: 'wa' }, include: { sets: true } });
        assert.equal(r[i].body.sessionVersion, sessionVersion(log));
    }
});
test('7 SQL/HTTP: profile, security question and avatar URL preserve contracts and revoke tokens', async () => {
    await request('/api/auth/profile', { firstName: 'Changed', lastName: 'Profile', phone: null, birthDate: '1990-10-18' }, { method: 'PUT', status: 200 });
    await request('/api/auth/avatar', { avatar: 'https://synthetic.invalid/avatar.png' }, { status: 200 });
    await request('/api/auth/security-question', { currentPassword: 'Synthetic123', question: 'New question?', answer: 'new answer' }, { method: 'PUT', status: 200 });
    await request('/api/auth/me', undefined, { status: 401 }); await compareState();
});
test('7 SQL/HTTP: routine activation, muscle edits and observed history keep separate identities', async () => {
    await request('/api/routines/ra/activate', {}, { method: 'PUT', status: 200 });
    await request('/api/exercises/ea/muscle', { muscleGroup: 'Pecho nuevo' }, { method: 'PUT', status: 200 });
    const r = await request('/api/workouts/wa', undefined, { status: 200 }); assert.equal(r[0].body.exercise.muscleGroup, 'pecho');
    await compareState();
});
test('7 SQL/HTTP: deterministic AI setup, today and reshuffle run without an external provider', async () => {
    const r = await request('/api/ai-routine/setup', { goal: 'strength', daysPerWeek: 3, equipment: ['barbell', 'dumbbell'], experienceLevel: 'beginner' }, { status: 200 });
    await request('/api/ai-routine/today', undefined, { status: 200 });
    await request((_p, i) => '/api/ai-routine/reshuffle/' + r[i].body.day.id, {}, { status: 200 }); await compareState();
});
test('7 SQL/HTTP: rest reminders, rest days, suggestion telemetry and correction route stay functional', async () => {
    await request('/api/workouts/rest-reminder', { exerciseId: 'ea', nextExerciseName: 'Row' }, { status: 202 });
    await Promise.all(peers.map(async p => { for (let n = 0; n < 30 && !await p.db.raw.pendingReminder.findUnique({ where: { userId_exerciseId: { userId: 'A', exerciseId: 'ea' } } }); n++) await new Promise(r => setTimeout(r, 10)); }));
    await request('/api/workouts/log-rest', { note: 'Rest' }, { status: 201 });
    await request('/api/suggestions/log', { exerciseId: 'ea', suggestedWeight: 80, suggestedReps: 10, source: 'client' }, { status: 201 });
    await request('/api/workouts/fix-weights', { exerciseName: 'Press', oldWeight: 80, newWeight: 82.5 }, { method: 'PUT', status: 200 }); await compareState();
});
test('7 SQL/HTTP: body log composition, habits and partial external photo failure preserve measurements', async () => {
    const photo = 'data:image/png;base64,iVBORw0KGgoAAAAN'; // image signature; fake transport always fails
    const result = await request('/api/body/log', { weight: 80, bodyFat: 20, creatineTaken: true, zeroLiquidCalories: false, photo }, { status: 201 });
    result.forEach(r => assert.equal(r.body.photoFailed, true));
    await request('/api/body/log', { photo }, { status: 502 });
    for (const peer of peers) { assert.equal(peer.providerFailures.length, 6); assert.equal(await peer.db.raw.bodyLog.count({ where: { userId: 'A' } }), 2); }
    await compareState();
});
test('7 SQL/HTTP: corrected test push route uses configured provider and JSON payload', async () => {
    await request('/api/push/test-creatine', {}, { status: 200 });
    for (const peer of peers) { assert.equal(peer.sends.length, 1); assert.equal(typeof peer.sends[0].payload, 'string'); }
    await compareState();
});
test('7 SQL/HTTP: operation deletion leaves its durable receipt after session removal', async () => {
    const current = await request('/api/v1/workout-sessions/wa', undefined, { status: 200 });
    const input = operation({ kind: 'workout.delete', logId: 'wa', expectedVersion: current[0].body.sessionVersion, exerciseId: undefined, sets: undefined });
    await request('/api/v1/workout-operations', input, { status: 200 });
    await request('/api/v1/workout-operations/' + input.operationId, undefined, { status: 200 });
    await request('/api/v1/workout-sessions/wa', undefined, { status: 404 }); await compareState();
});
test('7 entrypoint: built Fastify command starts, checks schema, serves JWT and drains SIGTERM/SIGINT', async () => {
    for (const signal of ['SIGTERM', 'SIGINT']) {
        const child = fork(new URL('./fixtures/phase7-process.mjs', import.meta.url), { env: { ...env, NODE_ENV: 'test',
            NEXLIFT_INFRA_REHEARSAL: 'true', NEXLIFT_FASTIFY_REHEARSAL: 'true', NEXLIFT_DISPOSABLE_MARKER: marker,
            JWT_SECRET: secret, DATABASE_URL: peers[1].db.url, PORT: '0', HOST: '127.0.0.1' }, silent: true });
        const logs = []; child.stderr.on('data', bytes => logs.push(bytes));
        try {
            const [message] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(Buffer.concat(logs).toString()); })]);
            for (const route of ['/api/health', '/api/ready', '/api/auth/me']) {
                const r = await fetch(`http://127.0.0.1:${message.port}${route}`, { headers: { authorization: auth() } }); assert.equal(r.status, 200); await r.arrayBuffer();
            }
            const exited = once(child, 'exit'); child.send(signal); child.send(signal); assert.equal((await exited)[0], 0);
            assert.equal(Buffer.concat(logs).toString().match(/shutdown_complete/g).length, 1);
        } finally { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } }
    }
});
test('7 compiled frontend: actual Vite build, SPA fallback and all referenced assets work on Fastify', async () => {
    const peer = peers[1], page = await fetch(peer.base + '/routines/deep-link'); assert.equal(page.status, 200);
    const html = await page.text(); assert.match(html, /<div id="root">/); assert.equal(page.headers.get('cache-control'), 'no-cache');
    const urls = [...html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)].map(m => m[1]); assert(urls.some(url => url.startsWith('/assets/')));
    for (const url of urls) { const response = await fetch(peer.base + url); assert.equal(response.status, 200, url); await response.arrayBuffer();
        if (url.startsWith('/assets/')) assert.match(response.headers.get('cache-control'), /immutable/);
    }
    const sw = await fetch(peer.base + '/sw.js'); assert.equal(sw.status, 200); assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.match(await sw.text(), /api/);
});
test('7 benchmark: sequential/concurrent health and PostgreSQL profile latency are measured equally', async () => {
    const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];
    for (const [i, framework] of ['express', 'fastify'].entries()) {
        const peer = peers[i];
        for (const route of ['/api/health', '/api/auth/me']) {
            const samples = [];
            for (let j = 0; j < 110; j++) { const start = performance.now(); const r = await fetch(peer.base + route, { headers: { authorization: auth() } }); assert.equal(r.status, 200); await r.arrayBuffer(); if (j >= 10) samples.push(performance.now() - start); }
            const start = performance.now();
            await Promise.all(Array.from({ length: 50 }, async () => { const r = await fetch(peer.base + route, { headers: { authorization: auth() } }); assert.equal(r.status, 200); await r.arrayBuffer(); }));
            evidence.benchmark[framework][route] = { samples: samples.length, medianMs: percentile(samples, .5), p95Ms: percentile(samples, .95), concurrent50Ms: performance.now() - start };
        }
    }
    evidence.benchmark.sharedProcessMemory = process.memoryUsage(); evidence.benchmark.memoryLimitation = 'Both apps run in one process; framework memory is not isolated';
    evidence.benchmark.independentProcesses = [];
    for (const framework of ['express', 'fastify']) {
        const result = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(new URL('./fixtures/phase7-benchmark.mjs', import.meta.url)), framework], { env, windowsHide: true, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); evidence.benchmark.independentProcesses.push(JSON.parse(result.stdout.trim()));
    }
    await writeFile(path.join(root, 'phase7-benchmark.json'), JSON.stringify(evidence.benchmark, null, 2));
});
