import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { target, migrations, baseline, operations, history, seed, rows, sql, close, root, legacyClient } from './fixtures/phase6-environment.js';
import { checksum, COACH_ENTITIES, HISTORY_FIELDS } from '../src/services/backupFormat.js';
import { readBackup } from '../src/services/backupLegacy.js';
import { createCoachService } from '../src/modules/coach/service.js';
import { createRuntime } from '../src/app/runtime.js';
import { createExpressApp } from '../src/app/createExpressApp.js';
import { createApp } from '../build/app/createApp.js';
import { fakeProviders } from './fixtures/phase7-providers.js';
import { exportBackup } from '../src/services/backupExport.js';
import { restoreBackup } from '../src/services/backupRestore.js';
import { dumpSystemPostgres, restoreSystemPostgres } from '../src/services/postgresSystemBackup.js';
const coachMigration = '202610230001_coach', chain = [baseline, operations, history, coachMigration];
const secret = 'synthetic-coach-jwt-secret'.padEnd(64, 'x');
const evidence = { productionTouched: false, providersCalled: false, transports: {}, performance: {} };
let db, service;
const config = { directMuscle: 'chest', secondaryMuscles: ['triceps'], indirectWeight: 0.5, equipment: 'barbell', increment: 0.25, availableLoads: [] };
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
before(async () => {
    db = await target('c11'); assert.equal((await migrations(db, [baseline, operations, history])).status, 0); seed(db);
    const original = await rows(db); assert.equal((await migrations(db, [coachMigration])).status, 0); assert.deepEqual(await rows(db), original);
    service = createCoachService({ prisma: db.client });
    await db.raw.routineBlock.update({ where: { id: 'ba' }, data: { phase: 'custom' } });
    await db.raw.exercise.update({ where: { id: 'ea' }, data: { name: 'Press banca' } });
    for (let n = 0; n < 10; n++) await db.client.workoutLog.create({ data: { id: `coachlog${n}`, exerciseId: 'ea', date: new Date(Date.now() - (40 - n * 4) * 86400000), sets: { create: [1, 2, 3].map(k => ({ id: `coachset${n}_${k}`, setNumber: k, weight: 80, reps: 12, rpe: 8, completed: true })) } } });
});
after(async () => { await close(); await mkdir(new URL('../audit/coach/', import.meta.url), { recursive: true }); await writeFile(new URL('../audit/coach/integration.json', import.meta.url), JSON.stringify(evidence, null, 2)); });
test('11 additive migration preserves every historical scalar and reruns idempotently', async () => { const before = await rows(db); assert.equal((await migrations(db, chain)).status, 0); assert.deepEqual(await rows(db), before); evidence.migrations = { oldRowsPreserved: true, applied: 4, PostgreSQL: db.version }; });
test('11 migration guard rejects an unmarked local database without creating Coach tables', async () => { const t = await target('c110', { marked: false }); sql(t, 'CREATE TABLE "User"(id TEXT PRIMARY KEY);'); const r = await migrations(t, [coachMigration]); assert.notEqual(r.status, 0); assert.equal((await t.raw.$queryRaw`SELECT to_regclass('public."CoachCheckIn"')::text AS table`)[0].table, null); });
test('11 private editable optional check-ins are isolated and can be deleted', async () => { await service.saveCheckIn('A', date(), { sleepHours: 7, fatigue: 4, soreness: { legs: 2 } }); assert.equal((await service.checkIns('B')).length, 0); await service.saveCheckIn('A', date(), { energy: 3 }); assert.equal((await service.checkIns('A'))[0].sleepHours, null); await service.deleteCheckIn('B', date()); assert.equal((await service.checkIns('A')).length, 1); await service.deleteCheckIn('A', date()); assert.equal((await service.checkIns('A')).length, 0); });
test('11 user cannot classify another account exercise and database trigger enforces ownership', async () => { await assert.rejects(service.config('B', 'ea', config), /disponible/); await assert.rejects(db.raw.coachExerciseConfig.create({ data: { userId: 'B', exerciseId: 'ea', ...config } })); assert.equal(await db.raw.coachExerciseConfig.count(), 0); });
test('11 report uses authorized snapshot identity, not mutable exercise labels or notes', async () => { const before = await rows(db), r = await service.report('A', 56); assert(r.plateaus.some(p => p.exerciseId === 'ea')); assert(!r.plateaus.some(p => p.exerciseId === 'eb')); assert(!JSON.stringify(r).includes('Old offline work')); assert(!JSON.stringify(r).includes('SYNTHETIC_SECRET')); assert.deepEqual(await rows(db), before); });
test('11 current-month questions freeze the exact authorized presentation data with the answer', async () => {
    const answer = await service.ask('A', { message: '¿Qué músculos entrené menos este mes?', days: 365 });
    assert.equal(answer.analysis.days, Number(date().slice(-2))); assert.deepEqual(answer.text, answer.factIds.map(id => answer.analysis.facts.find(f => f.id === id).text));
    assert.deepEqual(answer.analysis.hypertrophy.photos, []); const before = JSON.stringify(answer.analysis);
    await service.report('A', 28); assert.equal(JSON.stringify(answer.analysis), before);
});
test('11 measurement can be corrected and deleted without invented body values', async () => { const m = await service.measure('A', { date: date(), zone: 'biceps', cm: 34, quality: 'consistent' }); await service.measure('A', { date: date(), zone: 'biceps', cm: 34.5, quality: 'variable' }); assert.equal((await service.report('A', 56)).hypertrophy.measurements[0].cm, 34.5); await service.deleteMeasure('B', m.id); assert.equal(await db.raw.coachMeasurement.count(), 1); await service.deleteMeasure('A', m.id); assert.equal(await db.raw.coachMeasurement.count(), 0); });
test('11 calibration links exact subsequent series and detects edits and deletions', async () => {
    await service.config('A', 'ea', config); const s = await service.present('A', 'ea'); assert.equal(s.payload.recommendation.weight, 80.25);
    await assert.rejects(service.feedback('B', s.id, { outcome: 'ignored', confirm: true }), /disponible/);
    await assert.rejects(service.feedback('A', s.id, { outcome: 'accepted', resultSetId: 'coachset9_1', confirm: true }), /posterior/);
    const log = await db.client.workoutLog.create({ data: { exerciseId: 'ea', date: new Date(Date.now() + 2000), sets: { create: { weight: 80.25, reps: 8, rpe: 8, completed: true, setNumber: 1 } } }, include: { sets: true } });
    await assert.rejects(service.feedback('A', s.id, { outcome: 'accepted', resultSetId: log.sets[0].id, confirm: false }), /Confirma/);
    await service.feedback('A', s.id, { outcome: 'accepted', resultSetId: log.sets[0].id, confirm: true });
    assert.equal((await service.suggestions('A'))[0].evaluation, 'linked'); await db.raw.setLog.update({ where: { id: log.sets[0].id }, data: { reps: 7 } });
    assert.equal((await service.suggestions('A'))[0].evaluation, 'edited'); await db.raw.workoutLog.delete({ where: { id: log.id } }); assert.equal((await service.suggestions('A'))[0].evaluation, 'deleted');
});
test('11 ignored recommendation stores no fabricated result association', async () => { const s = await service.present('A', 'ea'); await service.feedback('A', s.id, { outcome: 'ignored', confirm: true }); const saved = (await service.suggestions('A')).find(x => x.id === s.id); assert.equal(saved.resultSetId, null); assert.equal(saved.evaluation, 'ignored'); });
test('11 current-session loading and stale preview checks never write confirmed training', async () => {
    const before = await rows(db);
    const result = await service.evaluate('A', 'ea', { currentSets: [{ weight: 80, reps: 8, rpe: 10, completed: true }] });
    assert.equal(result.reference.source, 'current-input'); assert.equal(result.rule, 'effort-hold');
    await assert.rejects(service.present('A', 'ea', { weight: 999, reps: 8, referenceId: 'x', rule: 'invented' }), /cambió/);
    assert.deepEqual(await rows(db), before);
});
test('11 older portable backups upgrade only after original checksums validate', async () => {
    const source = await exportBackup(db.raw, 'A');
    for (const version of [4, 5]) {
        const b = structuredClone(source); b.backupSchemaVersion = version;
        for (const name of COACH_ENTITIES) { delete b.data[name]; delete b.manifest[name]; }
        if (version === 4) for (const [name, fields] of Object.entries(HISTORY_FIELDS)) for (const row of b.data[name]) for (const field of fields) delete row[field];
        for (const [name, data] of Object.entries(b.data)) b.manifest[name] = { count: data.length, sha256: checksum(data) };
        delete b.integrity; b.integrity = { algorithm: 'sha256', sha256: checksum(b) };
        const restored = readBackup(b).backup; assert.equal(restored.backupSchemaVersion, 6); assert.equal(restored.data.CoachCheckIn.length, 0);
        b.data.SetLog[0].weight++; assert.throws(() => readBackup(b), /Checksum/);
    }
});
test('11 retention purges only expired Coach records and keeps training and current check-ins', async () => {
    const before = await rows(db);
    await db.raw.coachCheckIn.create({ data: { userId: 'A', date: '2020-01-01', soreness: {} } });
    await service.purgeExpired(); assert.equal(await db.raw.coachCheckIn.count({ where: { date: '2020-01-01' } }), 0);
    assert.deepEqual(await rows(db), before);
});
test('11 received legacy Prisma client still writes into Coach-expanded PostgreSQL without rewriting IDs', async () => {
    const old = legacyClient(db), count = await db.raw.workoutLog.count();
    const log = await old.workoutLog.create({ data: { exerciseId: 'ea', sets: { create: { setNumber: 1, weight: 80, reps: 10, rpe: 8, completed: true } } } });
    const current = await db.raw.workoutLog.findUnique({ where: { id: log.id } }); assert.equal(current.userId, 'A'); assert.equal(current.exerciseNameSnapshot, 'Press banca'); assert.equal(await db.raw.workoutLog.count(), count + 1);
    await db.raw.workoutLog.delete({ where: { id: log.id } });
});
test('11 backup v6 includes private Coach data and restores it transactionally to the same owner', async () => {
    await service.saveCheckIn('A', date(), { sleepHours: 7.5, energy: 3 }); const m = await service.measure('A', { date: date(), zone: 'biceps', cm: 34.5, quality: 'consistent' });
    const b = await exportBackup(db.raw, 'A'); assert.equal(b.backupSchemaVersion, 6); assert.equal(b.data.CoachCheckIn.length, 1); assert(b.data.CoachSuggestion.length);
    await service.deleteCheckIn('A', date()); await service.deleteMeasure('A', m.id); assert((await restoreBackup(db.raw, b, 'A', { dryRun: false })).ok); assert.equal((await service.checkIns('A')).length, 1); evidence.portable = { version: 6, restored: true, originalCredentialsExcluded: !JSON.stringify(b).includes('SYNTHETIC_SECRET') };
});
test('11 complete PostgreSQL backup restores Coach, history and migration checksums', async () => {
    const directory = path.join(root, 'coach-full'), options = { prisma: db.raw, url: db.url, directory, bin: process.env.NEXLIFT_TEST_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : undefined), acknowledgeSensitive: true };
    const manifest = await dumpSystemPostgres(options), recovered = await target('c111'); await restoreSystemPostgres({ ...options, prisma: recovered.raw, url: recovered.url });
    assert.deepEqual(await rows(recovered), await rows(db)); assert.deepEqual(await recovered.raw.coachCheckIn.findMany(), await db.raw.coachCheckIn.findMany()); assert.deepEqual(await recovered.raw.coachSuggestion.findMany({ orderBy: { id: 'asc' } }), await db.raw.coachSuggestion.findMany({ orderBy: { id: 'asc' } }));
    evidence.fullBackup = { restored: true, archiveHash: manifest.archiveSha256, coachEntities: Object.keys(manifest.entities).filter(n => n.startsWith('Coach')) };
});
for (const transport of ['express', 'fastify']) {
    test(`11 ${transport} HTTP authenticates and enforces account ownership for every Coach mutation`, async () => {
        const runtime = createRuntime({ prisma: db.client, config: { jwtSecret: secret, nodeEnv: 'test', coachEnabled: true }, providers: fakeProviders() });
        let app, server, base;
        if (transport === 'express') { app = createExpressApp({ runtime }); server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}`; }
        else { app = await createApp({ runtime }); await app.listen({ port: 0, host: '127.0.0.1' }); base = `http://127.0.0.1:${app.server.address().port}`; }
        const request = (path, { user = 'A', body, method = 'GET' } = {}) => fetch(base + '/api/coach' + path, { method, headers: { ...(user ? { authorization: `Bearer ${jwt.sign({ userId: user, tokenVersion: 0 }, secret)}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        try {
            assert.equal((await request('/report', { user: null })).status, 401);
            const report = await request('/report?days=56'); assert.equal(report.status, 200); assert.match(report.headers.get('cache-control'), /no-store/); assert.equal((await report.json()).version, 'coach-1');
            assert.equal((await request('/exercises/eb/config', { method: 'PUT', body: config })).status, 404);
            assert.equal((await request('/check-ins/' + date(), { method: 'PUT', body: { energy: 3, userId: 'B' } })).status, 422);
            assert.equal((await request('/ask', { method: 'POST', body: { message: '¿Cómo va mi volumen semanal?', useProvider: false } })).status, 200);
            assert.equal((await request('/ask', { method: 'POST', body: { message: 'volumen', exerciseId: 'eb' } })).status, 404);
            assert.equal((await request('/ask', { method: 'POST', body: { message: 'x'.repeat(1201) } })).status, 422);
            assert.equal((await request('/check-ins/' + date(), { method: 'PUT', body: { fatigue: 5 } })).status, 200);
            const readings = await (await request('/check-ins', { user: 'B' })).json(); assert.equal(readings.length, 0);
            let status; for (let n = 0; n < 21; n++) status = (await request('/ask', { method: 'POST', body: { message: 'volumen' } })).status;
            assert.equal(status, 429); evidence.transports[transport] = { jwt: true, isolation: true, rateLimit: true, structuredFallback: true };
        } finally { if (server) await new Promise(resolve => server.close(resolve)); else await app.close(); await runtime.stopBackground(); }
    });
}
test('11 Coach endpoints remain absent under production config even with explicit feature flag', async () => {
    const runtime = createRuntime({ prisma: db.client, config: { jwtSecret: secret, nodeEnv: 'production', coachEnabled: true }, providers: fakeProviders() });
    const app = await createApp({ runtime }); try { assert.equal((await app.inject('/api/coach/report')).statusCode, 404); } finally { await app.close(); await runtime.stopBackground(); }
});
test('11 bounded SQL query count and real report latency are recorded without N+1', async () => { const count = db.queryCount(), samples = []; for (let n = 0; n < 5; n++) { const start = performance.now(); await service.report('A', 56); samples.push(performance.now() - start); } const queries = db.queryCount() - count; assert(queries < 100); evidence.performance = { reportMilliseconds: samples, sqlQueriesForFiveReports: queries, note: 'Local disposable PostgreSQL, synthetic history, not production latency' }; });
