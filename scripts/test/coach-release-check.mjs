import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url)), source = process.env.NEXLIFT_COACH_SOURCE;
assert(source && path.isAbsolute(source));
const apiSource = process.env.NEXLIFT_V4_SOURCE || root;
const from = relative => import(pathToFileURL(path.join(source, relative)).href);

test('release: actual v4 API client reads/writes Coach backend, lost-response replay stays read-only, release gate validates Coach expansion', async () => {
    const fixture = await from('server/test/fixtures/phase6-environment.js');
    const { target, migrations, baseline, operations, history, seed, close } = fixture;
    const { createRuntime } = await from('server/src/app/runtime.js'), { createExpressApp } = await from('server/src/app/createExpressApp.js');
    const { fakeProviders } = await from('server/test/fixtures/phase7-providers.js');
    const { releasePreflight } = await from('server/deploy/release-preflight.mjs');
    const jwt = createRequire(path.join(source, 'server/package.json'))('jsonwebtoken');
    let server, vite;
    const previousStorage = globalThis.localStorage, originalFetch = globalThis.fetch;
    try {
        const db = await target('c11aa'); assert.equal((await migrations(db, [baseline, operations, history, '202610230001_coach'])).status, 0); seed(db);
        const secret = 'synthetic-compatibility-secret'.padEnd(64, 'x');
        const runtime = createRuntime({ prisma: db.client, config: { nodeEnv: 'test', jwtSecret: secret, coachEnabled: true }, providers: fakeProviders() });
        const app = createExpressApp({ runtime }); server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
        const base = `http://127.0.0.1:${server.address().port}`;
        const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: i => [...values.keys()][i] ?? null, get length() { return values.size; } };
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
        const session = id => { storage.setItem('nexlift_token', jwt.sign({ userId: id, tokenVersion: 0 }, secret)); storage.setItem('nexlift_user', JSON.stringify({ id })); };
        session('A');
        const { createServer } = createRequire(new URL('../../client/package.json', import.meta.url))('vite');
        vite = await createServer({ root: path.join(apiSource, 'client'), configFile: false, envFile: false, logLevel: 'error', server: { middlewareMode: true },
            define: { 'import.meta.env.VITE_API_URL': JSON.stringify(base + '/api'), 'import.meta.env.PROD': 'true',
                'import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED': '"false"', 'import.meta.env.VITE_INDEXEDDB_ENABLED': '"false"' } });
        const client = await vite.ssrLoadModule('/src/services/api.js'), { api } = client;
        assert.equal(client.operationsEnabled, false);
        assert.equal((await api.getProfile(storage.getItem('nexlift_token'))).id, 'A');
        assert((await api.getRoutines()).length > 0); assert(await api.getHome()); assert(Array.isArray(await api.getExerciseHistory('ea')));
        const before = await db.raw.workoutLog.count(), beforeCoach = await db.raw.coachCheckIn.count();
        let lost = false, mutationCount = 0;
        globalThis.fetch = async (url, options) => {
            const response = await originalFetch(url, options);
            if (options?.method === 'POST' && String(url).endsWith('/workouts/log')) {
                mutationCount++; if (!lost) { lost = true; throw new TypeError('synthetic lost acknowledgement'); }
            }
            return response;
        };
        const result = await api.logWorkout('ea', [{ weight: 87.5, reps: 8, rpe: 8, completed: true }]);
        assert.equal(result.queued, true); assert.equal(await db.raw.workoutLog.count(), before + 1);
        // Keep the next inspection eligible, without enabling mutation replay.
        for (const [key, value] of values) if (key.startsWith('nexlift_offline_op_v2:')) { const item = JSON.parse(value); item.nextRetryAt = null; storage.setItem(key, JSON.stringify(item)); }
        await client.replayOfflineQueue(); await client.replayOfflineQueue(); assert.equal(mutationCount, 1); assert.equal(await db.raw.workoutLog.count(), before + 1);
        const answer = await runtime.services.coach.ask('A', { message: '¿Cómo va mi volumen semanal?', days: 56 }); assert.equal(answer.mode, 'deterministic'); assert(answer.text.length); assert.equal(await db.raw.coachCheckIn.count(), beforeCoach);
        session('B'); assert.deepEqual(await api.getExerciseHistory('ea'), []); assert.equal(mutationCount, 1);
        assert.equal((await releasePreflight(db.raw, { phase: 'coach' })).coachReady, true);
        for (const name of [baseline, operations, history]) assert.deepEqual(await readFile(path.join(source, 'server/prisma/migrations', name, 'migration.sql')), await readFile(path.join(root, 'server/prisma/migrations', name, 'migration.sql')));
        await mkdir(path.join(root, 'server/audit/hotfix'), { recursive: true });
        await writeFile(path.join(root, 'server/audit/hotfix/coach-compatibility.json'), JSON.stringify({ at: new Date().toISOString(), coachCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
            actualV4ApiModule: !!process.env.NEXLIFT_V4_SOURCE, fullOldPhysicalPWA: false, postgres: db.version, migrationsApplied: 4, historicalMigrationsUnchanged: true,
            lostResponseMutationAttempts: mutationCount, retainedNewWorkoutRows: 1, offlineOperationsEnabled: false, assistantWithoutProvider: true, assistantCheckInWrites: 0,
            crossAccountReadRejected: true, releasePreflightAcceptedExactExpansion: true, productionAccessed: false }, null, 2) + '\n');
    } finally {
        globalThis.fetch = originalFetch; Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage });
        await vite?.close(); if (server) await new Promise(resolve => server.close(resolve)); await close();
    }
});
