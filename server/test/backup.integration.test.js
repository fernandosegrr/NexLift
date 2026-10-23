import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createTestSchema, seedBackupFixture, syntheticRow } from './fixtures/backup-fixture.js';
import { ENTITY_NAMES, MODELS, EXCLUDED_MODELS, delegate, jsonCopy, checksum, canonical, sealBackup, validateBackup, PROFILE_FIELDS } from '../src/services/backupFormat.js';
import { exportBackup } from '../src/services/backupExport.js';
import { restoreBackup, mappedId } from '../src/services/backupRestore.js';
import { readBackup } from '../src/services/backupLegacy.js';
import { createExportBackupHandler, createImportBackupHandler } from '../src/routes/backup.js';
import { dumpPostgres, restorePostgres } from '../src/services/postgresBackup.js';

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.NEXLIFT_BACKUP_TEST_PORT);
assert.equal(url.username, 'nexlift_backup_test');
assert.equal(url.pathname, '/nexlift_backup_test');
assert.match(path.basename(process.env.NEXLIFT_BACKUP_TEST_ROOT || ''), /^nexlift-backup-tests-/);
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const emptyUrl = new URL(url); emptyUrl.pathname = '/nexlift_backup_empty';
const pgUrl = new URL(url); pgUrl.pathname = '/nexlift_backup_pgrestore';
const empty = new PrismaClient({ datasources: { db: { url: emptyUrl.href } } });
const pgTarget = new PrismaClient({ datasources: { db: { url: pgUrl.href } } });
let server, base;
let ids;
before(async () => {
    await createTestSchema(prisma);
    await createTestSchema(empty);
    const app = express(); app.use(express.json({ limit: '10mb' }));
    app.use((req, res, next) => { req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A'; next(); });
    app.get('/api/backup/export', createExportBackupHandler({ prisma }));
    app.post('/api/backup/import', createImportBackupHandler({ prisma }));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
    // Only our new disposable database. The safety assertions above run first.
    await prisma.$executeRawUnsafe(`TRUNCATE ${Object.keys(MODELS).map(n => `"${n}"`).join(',')} CASCADE`);
    ids = await seedBackupFixture(prisma);
    await prisma.user.create({ data: syntheticRow('User', 'B', { username: 'b', email: 'b@synthetic.invalid', passwordHash: 'B_HASH_UNTOUCHED', isActive: true }) });
});
after(async () => {
    if (server) await new Promise(r => server.close(r));
    await Promise.all([prisma.$disconnect(), empty.$disconnect(), pgTarget.$disconnect()]);
});
const snapshot = async db => Object.fromEntries(await Promise.all(Object.keys(MODELS).map(async n => [n, jsonCopy(await db[delegate(n)].findMany({ orderBy: { id: 'asc' } }))])));
const backup = () => exportBackup(prisma, 'A', { pageSize: 2 });
const post = async (data, suffix = '', user = 'A') => {
    const res = await fetch(`${base}/api/backup/import${suffix}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user}` }, body: JSON.stringify(data) });
    return { status: res.status, body: await res.json() };
};
async function compareMapped(b, db, result) {
    for (const name of ENTITY_NAMES.filter(n => n !== 'User')) {
        for (const row of b.data[name]) {
            const expected = { ...row, id: result.idMap[name][row.id] };
            for (const r of MODELS[name].fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) expected[r.relationFromFields[0]] = result.idMap[r.type][row[r.relationFromFields[0]]];
            const actual = jsonCopy(await db[delegate(name)].findUnique({ where: { id: expected.id } }));
            assert.deepEqual(actual, expected, `${name} full scalar data and mapped relations`);
        }
    }
}

test('los 17 modelos reales están clasificados explícitamente', () => {
    assert.equal(Object.keys(MODELS).length, 17);
    assert.deepEqual([...ENTITY_NAMES, ...Object.keys(EXCLUDED_MODELS)].sort(), Object.keys(MODELS).sort());
});
test('exportación paginada sin truncamiento con conteos independientes', async () => {
    for (let i = 0; i < 1103; i++) await prisma.restLog.create({ data: { id: `rest-${i}`, userId: 'A', date: new Date('2020-01-02T06:00:00Z') } });
    const b = await exportBackup(prisma, 'A', { pageSize: 97 });
    assert.equal(b.data.RestLog.length, 1104);
    assert.equal(b.manifest.RestLog.count, 1104);
    assert.equal(b.data.Routine.length, 3);
    assert.deepEqual(validateBackup(b), b);
});
test('exportación no contiene hashes, tokens, secretos push ni credenciales de otra cuenta', async () => {
    const b = await backup(); const text = JSON.stringify(b);
    for (const secret of ['passwordHash', 'securityAnswerHash', 'securityQuestion', 'tokenVersion', 'SYNTHETIC_PASSWORD_HASH', 'PUSH_AUTH_SECRET', 'PUSH_KEY_SECRET', 'B_HASH_UNTOUCHED', 'b@synthetic.invalid']) assert.ok(!text.includes(secret), secret);
    assert.equal(b.media.binaryFilesIncluded, false);
    assert.equal(b.data.BodyLog[0].photoUrl, 'https://example.invalid/body.jpg');
});
test('round-trip en cuenta nueva compara todos los campos y FK de las 14 entidades relacionadas', async () => {
    const b = await backup(); const oldA = await snapshot(prisma);
    const r = await restoreBackup(prisma, b, 'B', { dryRun: false });
    assert.equal(r.complete, true); assert.ok(r.plannedCreates > 0);
    await compareMapped(b, prisma, r);
    for (const [name, rows] of Object.entries(oldA)) {
        for (const row of rows) assert.deepEqual(jsonCopy(await prisma[delegate(name)].findUnique({ where: { id: row.id } })), row);
    }
});
test('restauración repetida no duplica ni actualiza timestamps', async () => {
    const b = await backup(); await restoreBackup(prisma, b, 'B', { dryRun: false });
    const before = await snapshot(prisma);
    const r = await restoreBackup(prisma, b, 'B', { dryRun: false });
    assert.equal(r.plannedCreates, 0); assert.deepEqual(await snapshot(prisma), before);
    assert.equal(r.stats.SetLog.unchanged, 1);
});
test('misma cuenta preserva IDs originales y datos existentes idénticos', async () => {
    const b = await backup(); const before = await snapshot(prisma);
    const r = await restoreBackup(prisma, b, 'A', { dryRun: false });
    assert.equal(r.plannedCreates, 0); assert.equal(r.idMap.Exercise[ids.Exercise], ids.Exercise);
    assert.deepEqual(await snapshot(prisma), before);
});
test('dry-run HTTP no escribe y expone conteos/mapas concretos', async () => {
    const b = await backup(); const before = await snapshot(prisma);
    const r = await post(b, '?dryRun=true', 'B');
    assert.equal(r.status, 200); assert.equal(r.body.dryRun, true); assert.ok(r.body.plannedCreates > 0);
    assert.equal(r.body.stats.SetLog.created, 0); assert.equal(r.body.stats.SetLog.wouldCreate, 1);
    assert.deepEqual(await snapshot(prisma), before);
});
test('opciones dry-run ambiguas o mal escritas se rechazan sin caer en modo escritura', async () => {
    const b = await backup(); const before = await snapshot(prisma);
    for (const suffix of ['?dryRun=1', '?dryRun=TRUE', '?dryRun=true&dryRun=false', '?dry-run=true', '?restoreProfile=yes']) {
        const r = await post(b, suffix, 'B'); assert.equal(r.status, 400, suffix); assert.equal(r.body.success, false);
    }
    assert.deepEqual(await snapshot(prisma), before);
});
test('restauración a base inicialmente vacía con cuenta preregistrada, luego repetida', async () => {
    const b = await backup();
    assert.equal(await empty.routine.count(), 0);
    await empty.user.create({ data: syntheticRow('User', 'A', { username: 'a', email: 'A@synthetic.invalid', passwordHash: 'NEW_ACCOUNT_NOT_IMPORTED' }) });
    const r = await restoreBackup(empty, b, 'A', { dryRun: false, restoreProfile: true });
    await compareMapped(b, empty, r);
    const user = await empty.user.findUnique({ where: { id: 'A' } });
    for (const k of PROFILE_FIELDS) assert.deepEqual(jsonCopy(user)[k], b.data.User[0][k]);
    assert.equal(user.passwordHash, 'NEW_ACCOUNT_NOT_IMPORTED');
    assert.equal((await restoreBackup(empty, b, 'A', { dryRun: false })).plannedCreates, 0);
});
test('fallo SQL a mitad de restauración revierte cada tabla y el perfil', async () => {
    const b = await backup(); const before = await snapshot(prisma);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_backup_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = 'B' THEN RAISE EXCEPTION 'synthetic mid-restore failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_backup_test BEFORE INSERT ON "BodyLog" FOR EACH ROW EXECUTE FUNCTION fail_backup_test()');
    try {
        await assert.rejects(restoreBackup(prisma, b, 'B', { dryRun: false, restoreProfile: true }), e => e.status === 500 && e.details.rolledBack && Object.values(e.details.stats).every(s => s.created === 0));
        assert.deepEqual(await snapshot(prisma), before);
    } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER fail_backup_test ON "BodyLog"');
        await prisma.$executeRawUnsafe('DROP FUNCTION fail_backup_test()');
    }
});
test('ID ajeno en respaldo que afirma ser del destino no modifica ninguna cuenta', async () => {
    const b = await backup();
    const d = jsonCopy(b.data); d.User[0].id = 'B';
    for (const rows of Object.values(d)) for (const r of rows) if (Object.hasOwn(r, 'userId')) r.userId = 'B';
    const forged = sealBackup(d); const before = await snapshot(prisma);
    const r = await post(forged, '', 'B');
    assert.equal(r.status, 409); assert.equal(r.body.success, false);
    assert.deepEqual(await snapshot(prisma), before);
});
test('IDs remapeados preexistentes incompatibles producen conflicto y cero escrituras', async () => {
    const b = await backup(); const id = mappedId(b.source, 'B', 'Routine', ids.Routine);
    await prisma.routine.create({ data: { id, name: 'Datos recientes de B', userId: 'B' } });
    const before = await snapshot(prisma); const r = await post(b, '', 'B');
    assert.equal(r.status, 409); assert.deepEqual(await snapshot(prisma), before);
});
test('TrainingProfile único diferente se rechaza antes de escribir', async () => {
    const b = await backup();
    await prisma.trainingProfile.create({ data: syntheticRow('TrainingProfile', 'existing-profile-B', { userId: 'B' }) });
    const before = await snapshot(prisma); await assert.rejects(restoreBackup(prisma, b, 'B', { dryRun: false }), e => e.status === 409);
    assert.deepEqual(await snapshot(prisma), before);
});
test('cuenta inexistente no se crea ni recibe credenciales del backup', async () => {
    const before = await snapshot(prisma); await assert.rejects(restoreBackup(prisma, await backup(), 'MISSING', { dryRun: false }), e => e.status === 404);
    assert.deepEqual(await snapshot(prisma), before);
});
for (const [title, mutate] of [
    ['checksum global corrupto', b => { b.data.SetLog[0].rpe = 10; }],
    ['entidad ausente', b => { delete b.data.CardioSegment; }],
    ['conteo falso', b => { b.manifest.BodyLog.count++; delete b.integrity; b.integrity = { algorithm: 'sha256', sha256: checksum(b) }; }],
    ['versión futura', b => { b.backupSchemaVersion = 99; }],
    ['referencia inexistente', b => { b.data.WorkoutLog[0].exerciseId = 'MISSING'; Object.assign(b, sealBackup(b.data)); }],
    ['serie duplicada', b => { b.data.SetLog.push(b.data.SetLog[0]); Object.assign(b, sealBackup(b.data)); }],
    ['tipo incorrecto de RIR', b => { b.data.SetLog[0].rpe = 2.5; Object.assign(b, sealBackup(b.data)); }],
    ['fecha imposible/no canónica', b => { b.data.RestLog[0].date = '2026-02-30T06:00:00.000Z'; Object.assign(b, sealBackup(b.data)); }],
    ['secreto inyectado como campo', b => { b.data.User[0].passwordHash = 'FORBIDDEN'; Object.assign(b, sealBackup(b.data)); }],
    ['FK de otra cuenta', b => { b.data.BodyLog[0].userId = 'B'; Object.assign(b, sealBackup(b.data)); }]
]) test(`archivo inválido: ${title}, rechazado sin escrituras`, async () => {
    const b = await backup(); mutate(b); const before = await snapshot(prisma);
    const r = await post(b); assert.equal(r.status, 422); assert.equal(r.body.success, false);
    assert.deepEqual(await snapshot(prisma), before);
});
test('rutinas IA, manuales y papelera permanecen diferenciadas', async () => {
    const b = await backup(); const r = await restoreBackup(prisma, b, 'B', { dryRun: false }); await compareMapped(b, prisma, r);
    const rows = await prisma.routine.findMany({ where: { userId: 'B' } });
    assert.equal(rows.filter(r => r.source === 'ai').length, 1);
    assert.equal(rows.filter(r => r.name === 'ARCHIVED_HISTORY_DO_NOT_DELETE').length, 1);
});
test('RIR sin conversión, ambos lados, series incompletas y fechas CDMX exactas', async () => {
    const b = await backup(); const r = await restoreBackup(prisma, b, 'B', { dryRun: false });
    const set = await prisma.setLog.findUnique({ where: { id: r.idMap.SetLog[ids.SetLog] } });
    assert.equal(set.rpe, 3); assert.equal(set.weightRight, 15.25); assert.equal(set.repsRight, 9); assert.equal(set.completed, false);
    const log = await prisma.workoutLog.findUnique({ where: { id: r.idMap.WorkoutLog[ids.WorkoutLog] } });
    assert.equal(log.date.toISOString(), '2026-10-18T05:59:59.123Z');
});
test('perfil se aplica sólo explícitamente sin cambiar identidad o credenciales', async () => {
    const b = await backup(); const before = await prisma.user.findUnique({ where: { id: 'B' } });
    await restoreBackup(prisma, b, 'B', { dryRun: false, restoreProfile: true });
    const after = await prisma.user.findUnique({ where: { id: 'B' } });
    for (const k of ['username', 'email', 'passwordHash', 'tokenVersion', 'securityAnswerHash', 'isActive', 'createdAt']) assert.deepEqual(after[k], before[k], k);
});
test('repetición con restauración de perfil también conserva updatedAt y no escribe', async () => {
    const b = await backup(); await restoreBackup(prisma, b, 'B', { dryRun: false, restoreProfile: true });
    const before = await snapshot(prisma);
    const r = await restoreBackup(prisma, b, 'B', { dryRun: false, restoreProfile: true });
    assert.equal(r.stats.User.updated, 0); assert.equal(r.stats.User.unchanged, 1);
    assert.deepEqual(await snapshot(prisma), before);
});
test('dos restauraciones concurrentes no duplican ni dejan resultados parciales', async () => {
    const b = await backup();
    const results = await Promise.allSettled([restoreBackup(prisma, b, 'B', { dryRun: false }), restoreBackup(prisma, b, 'B', { dryRun: false })]);
    const succeeded = results.filter(r => r.status === 'fulfilled'); assert.ok(succeeded.length >= 1);
    for (const r of results.filter(r => r.status === 'rejected')) assert.equal(r.reason.status, 409);
    await compareMapped(b, prisma, succeeded[0].value);
    assert.equal(await prisma.setLog.count(), 2);
});
test('fallo de verificación posterior revierte escrituras aunque SQL haya aceptado el dato', async () => {
    const b = await backup(); const before = await snapshot(prisma);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION alter_backup_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW."weightRight" := 999; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER alter_backup_test BEFORE INSERT ON "SetLog" FOR EACH ROW EXECUTE FUNCTION alter_backup_test()');
    try {
        await assert.rejects(restoreBackup(prisma, b, 'B', { dryRun: false }), /Verificación/);
        assert.deepEqual(await snapshot(prisma), before);
    } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER alter_backup_test ON "SetLog"');
        await prisma.$executeRawUnsafe('DROP FUNCTION alter_backup_test()');
    }
});
test('respaldo más reciente del mismo origen reutiliza el mapa y detecta cambios en lugar de sobrescribir', async () => {
    const b = await backup(); await restoreBackup(prisma, b, 'B', { dryRun: false });
    await prisma.setLog.update({ where: { id: ids.SetLog }, data: { rpe: 1 } });
    const newer = await backup(); const before = await snapshot(prisma);
    await assert.rejects(restoreBackup(prisma, newer, 'B', { dryRun: false }), e => e.status === 409);
    assert.deepEqual(await snapshot(prisma), before);
});
test('exportación HTTP está aislada y no se almacena en caché', async () => {
    const res = await fetch(`${base}/api/backup/export`, { headers: { Authorization: 'Bearer B' } });
    assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store');
    const b = await res.json(); assert.equal(b.source.userId, 'B'); assert.equal(b.data.WorkoutLog.length, 0);
});
test('transacciones de exportación usan un único snapshot RepeatableRead', async () => {
    let changed = false;
    const wrapped = { $transaction: (fn, opts) => {
        assert.equal(opts.isolationLevel, 'RepeatableRead');
        return prisma.$transaction(async tx => {
            const proxy = new Proxy(tx, { get(t, key) {
                if (key === 'restLog') return new Proxy(t.restLog, { get(model, action) {
                    if (action === 'count') return async (...args) => {
                        const n = await model.count(...args);
                        await prisma.restLog.create({ data: { id: 'concurrent-rest', userId: 'A' } }); changed = true; return n;
                    };
                    return typeof model[action] === 'function' ? model[action].bind(model) : model[action];
                } });
                return typeof t[key] === 'function' ? t[key].bind(t) : t[key];
            } });
            return fn(proxy);
        }, opts);
    } };
    const b = await exportBackup(wrapped, 'A'); assert.equal(changed, true);
    assert.equal(b.data.RestLog.length, 1); assert.equal(await prisma.restLog.count({ where: { userId: 'A' } }), 2);
});

async function legacyDaily() {
    const b = await backup(); const d = b.data;
    return { version: 1, generatedAt: b.generatedAt, user: d.User[0],
        routines: d.Routine.map(r => ({ ...r, days: d.RoutineDay.filter(day => day.routineId === r.id).map(day => ({ ...day, exercises: d.Exercise.filter(e => e.routineDayId === day.id) })), blocks: d.RoutineBlock.filter(bl => bl.routineId === r.id) })),
        workoutLogs: d.WorkoutLog.map(w => ({ ...w, sets: d.SetLog.filter(s => s.workoutLogId === w.id) })), bodyLogs: d.BodyLog, personalRecords: d.PersonalRecord, goals: d.Goal, restLogs: d.RestLog };
}
const legacyManual = () => ({ version: '2.7.0', exportDate: '2026-10-18T06:00:01.000Z',
    routines: [{ name: 'Legacy', days: [{ dayName: 'Lunes', exercises: [{ name: 'Press', targetSets: 3, targetReps: '8-12', isUnilateral: true }] }] }],
    workouts: [{ date: '2025-01-01T05:59:59.000Z', exerciseName: 'Press', sets: [{ weight: 10, reps: 8, rpe: 2, weightRight: 8, repsRight: 7 }] }], bodyLogs: [{ date: '2025-01-01T06:00:00.000Z', weight: 71 }], personalRecords: [] });
test('legacy diario conserva IDs/relaciones y enumera entidades ausentes sin modificar original', async () => {
    const old = await legacyDaily(); const original = JSON.stringify(old);
    const dry = await restoreBackup(prisma, old, 'B');
    assert.equal(dry.complete, false); assert.ok(dry.warnings.some(w => w.includes('CardioSession')));
    const r = await restoreBackup(prisma, old, 'B', { dryRun: false, allowIncomplete: true });
    await compareMapped(readBackup(old).backup, prisma, r); assert.equal(JSON.stringify(old), original);
});
test('legacy manual 2.7 restaura datos conocidos, no inventa fechas históricas y es repetible', async () => {
    const old = legacyManual(); const copy = JSON.stringify(old);
    const r = await restoreBackup(prisma, old, 'B', { dryRun: false, allowIncomplete: true });
    assert.equal(r.complete, false); assert.ok(r.warnings.some(w => w.includes('createdAt')));
    const log = await prisma.workoutLog.findFirst({ where: { exercise: { routineDay: { routine: { userId: 'B' } } } }, include: { sets: true } });
    assert.equal(log.date.toISOString(), old.workouts[0].date); assert.equal(log.sets[0].rpe, 2);
    assert.equal(log.sets[0].weightRight, 8); assert.equal(log.sets[0].repsRight, 7);
    const before = await snapshot(prisma); assert.equal((await restoreBackup(prisma, old, 'B', { dryRun: false, allowIncomplete: true })).plannedCreates, 0);
    assert.deepEqual(await snapshot(prisma), before); assert.equal(JSON.stringify(old), copy);
});
test('legacy no se aplica sin aceptación explícita de omisiones', async () => {
    const before = await snapshot(prisma); const r = await post(legacyManual(), '', 'B');
    assert.equal(r.status, 422); assert.equal(r.body.incomplete, true); assert.deepEqual(await snapshot(prisma), before);
});
test('legacy con ejercicio por nombre ambiguo falla indicando relación ausente', async () => {
    const old = legacyManual(); old.routines[0].days[0].exercises.push({ ...old.routines[0].days[0].exercises[0] });
    assert.throws(() => readBackup(old), /ambiguo/);
});
test('legacy con ejercicio irrecuperable no descarta entrenamientos silenciosamente', () => {
    const old = legacyManual(); old.workouts[0].exerciseName = 'Ausente'; assert.throws(() => readBackup(old), /exerciseId/);
});
test('formato desconocido y colección legacy ausente no se interpretan como vacío', () => {
    assert.throws(() => readBackup({ version: 100 }), /desconocido/);
    const old = legacyManual(); delete old.bodyLogs; assert.throws(() => readBackup(old), /bodyLogs/);
});
test('simulacro de un archivo concreto genera comprobante sólo tras restaurar y comparar en otro clúster nuevo', async () => {
    const b = await backup();
    const file = path.join(process.env.NEXLIFT_BACKUP_TEST_ROOT, 'synthetic.json');
    const receipt = path.join(process.env.NEXLIFT_BACKUP_TEST_ROOT, 'verified.json');
    await writeFile(file, JSON.stringify(b));
    const result = spawnSync(process.execPath, ['test/run-backup-integration.mjs', `--verify-file=${file}`, `--receipt=${receipt}`], { encoding: 'utf8', windowsHide: true, env: { ...process.env } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const proof = JSON.parse(await readFile(receipt, 'utf8'));
    assert.equal(proof.restoreVerified, true); assert.equal(proof.secondExecutionCreated, 0); assert.equal(proof.backupChecksum, b.integrity.sha256);
    for (const name of ENTITY_NAMES) assert.equal(proof.entities[name].original, proof.entities[name].restored);
});

test('PostgreSQL real: pg_dump/pg_restore esquema y datos seguros, credenciales excluidas, destino vacío', async () => {
    const directory = path.join(process.env.NEXLIFT_BACKUP_TEST_ROOT, 'bundle');
    const bin = process.env.NEXLIFT_TEST_PG_BIN;
    const expected = await backup();
    const catalog = db => db.$queryRaw`SELECT c.relname AS name, c.relkind AS kind, COALESCE(pg_get_indexdef(i.indexrelid), '') AS definition FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_index i ON i.indexrelid = c.oid WHERE n.nspname = 'public' ORDER BY c.relname`;
    const expectedSchema = await catalog(prisma);
    const m = await dumpPostgres({ prisma, url: url.href, directory, bin });
    assert.equal(m.users, 2); assert.equal(m.credentialRecovery, 'RESET_REQUIRED');
    const safeUsers = await readFile(path.join(directory, 'users.safe.json'), 'utf8');
    assert.ok(!safeUsers.includes('passwordHash')); assert.ok(!safeUsers.includes('SYNTHETIC_SECURITY'));
    const result = await restorePostgres({ prisma: pgTarget, url: pgUrl.href, directory, bin });
    assert.equal(result.requiresCredentialReset, true);
    const roundtrip = await exportBackup(pgTarget, 'A'); assert.deepEqual(roundtrip.data, expected.data);
    assert.deepEqual(await catalog(pgTarget), expectedSchema);
    for (const name of ENTITY_NAMES.filter(n => n !== 'User')) assert.equal(await pgTarget[delegate(name)].count(), await prisma[delegate(name)].count(), name);
    assert.equal(await pgTarget.pushSubscription.count(), 0); assert.equal(await pgTarget.pendingReminder.count(), 0);
    const user = await pgTarget.user.findUnique({ where: { id: 'A' } }); assert.equal(user.isActive, false); assert.equal(user.passwordHash, '!NEXLIFT_CREDENTIALS_EXCLUDED!'); assert.equal(user.securityAnswerHash, null);
    const before = await snapshot(pgTarget);
    await assert.rejects(restorePostgres({ prisma: pgTarget, url: pgUrl.href, directory, bin }), e => e.status === 409);
    assert.deepEqual(await snapshot(pgTarget), before);
    await assert.rejects(dumpPostgres({ prisma, url: url.href, directory, bin }), /EEXIST/);
    const failureUrl = new URL(url); failureUrl.pathname = '/nexlift_backup_pgfailure';
    const failedTarget = new PrismaClient({ datasources: { db: { url: failureUrl.href } } });
    try {
        const altered = jsonCopy(m); altered.entities.CardioSegment.digest = '0'.repeat(32);
        await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(altered));
        await assert.rejects(restorePostgres({ prisma: failedTarget, url: failureUrl.href, directory, bin }), /psql/);
        const tables = await failedTarget.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
        assert.equal(tables.length, 0, 'Failed recovery must roll back schema and every data row.');
        await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(m));
        await restorePostgres({ prisma: failedTarget, url: failureUrl.href, directory, bin });
        assert.deepEqual((await exportBackup(failedTarget, 'A')).data, expected.data);
    } finally { await failedTarget.$disconnect(); }
    await writeFile(path.join(directory, 'users.safe.json'), safeUsers + ' ');
    await assert.rejects(restorePostgres({ prisma: pgTarget, url: pgUrl.href, directory, bin }), /Checksum/);
});
