import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, cp, writeFile, symlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { historyClient } from '../../src/services/historyPersistence.js';
import { cleanStageEnvironment } from '../../staging/environment.mjs';
import { serverDir, pgExecutable } from '../../audit/postgresql/audit-tools.mjs';

export const root = process.env.NEXLIFT_PHASE6_ROOT, port = process.env.NEXLIFT_PHASE6_PORT;
assert(root && port && /^\d+$/.test(port));
assert.equal(path.dirname(await realpath(root)), await realpath(path.join(homedir(), '.codex/artifacts/nexlift-phase6-trials')));
const data = path.join(root, 'data'), pid = (await readFile(path.join(data, 'postmaster.pid'), 'utf8')).split(/\r?\n/);
assert.equal(await realpath(pid[1]), await realpath(data)); assert.equal(pid[3], port);
export const marker = process.env.NEXLIFT_PHASE6_MARKER;
assert.match(marker, /^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$/);
export const env = { ...cleanStageEnvironment(), NODE_ENV: 'test', DATABASE_URL: '', OPENAI_API_KEY: '',
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
const clients = [];
export function pg(name, args, input) {
    const result = spawnSync(pgExecutable(name), args, { env, input, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`); return result.stdout;
}
export async function target(label, { marked = true } = {}) {
    assert.match(label, /^[a-f0-9_]+$/);
    const name = `nexlift_ops_test_phase6_${label}_${randomUUID().replaceAll('-', '')}`;
    const args = ['-h', '127.0.0.1', '-p', port, '-U', 'nexlift_phase6_test', '-d', name];
    pg('createdb', args.slice(0, -2).concat(name));
    const url = `postgresql://nexlift_phase6_test@127.0.0.1:${port}/${name}`;
    const raw = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: 'event', level: 'query' }] }); clients.push(raw);
    let queryCount = 0; raw.$on('query', () => { queryCount++; });
    const [identity] = await raw.$queryRaw`SELECT current_setting('data_directory') AS data, inet_server_port()::text AS port, version() AS version`;
    assert.equal(await realpath(identity.data), await realpath(data)); assert.equal(identity.port, port);
    if (marked) {
        await raw.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
        for (const setting of ['nexlift.phase31_disposable', 'nexlift.phase6_disposable'])
            await raw.$executeRawUnsafe(`ALTER DATABASE "${name}" SET ${setting} TO '${marker}'`);
    }
    const work = path.join(root, name); await mkdir(path.join(work, 'prisma/migrations'), { recursive: true });
    await cp(path.join(serverDir, 'prisma/schema.prisma'), path.join(work, 'prisma/schema.prisma'));
    await cp(path.join(serverDir, 'prisma/migrations/migration_lock.toml'), path.join(work, 'prisma/migrations/migration_lock.toml'));
    return { name, url, args, raw, client: historyClient(raw), work, version: identity.version, queryCount: () => queryCount };
}
export const sql = (t, text) => pg('psql', ['-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', ...t.args, '-f', '-'], text);
export async function migrations(t, names) {
    for (const name of names) await cp(path.join(serverDir, 'prisma/migrations', name), path.join(t.work, 'prisma/migrations', name), { recursive: true });
    const result = spawnSync(process.execPath, [path.join(serverDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(t.work, 'prisma/schema.prisma')], {
        cwd: t.work, env: { ...env, DATABASE_URL: t.url }, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
    });
    await writeFile(path.join(t.work, `migration-${Date.now()}.private.log`), (result.stdout || '') + (result.stderr || ''));
    return result;
}
export const baseline = '0_init', operations = '202610180001_phase31_operations', history = '202610220001_phase6_history';
export const tables = ['User', 'Routine', 'RoutineBlock', 'RoutineDay', 'Exercise', 'WorkoutLog', 'SetLog', 'PersonalRecord', 'BodyLog', 'Goal', 'RestLog', 'CardioSession', 'CardioSegment', 'TrainingProfile', 'SuggestionLog', 'PendingReminder', 'PushSubscription'];
export async function rows(t, legacy = false) {
    const old = JSON.parse(await readFile(new URL('../../audit/postgresql/declared-catalog.json', import.meta.url), 'utf8')).catalog;
    const out = {};
    for (const table of tables) {
        const cols = legacy ? old.columns.filter(c => c.table === table).map(c => `"${c.name}"`).join(',') : '*';
        out[table] = JSON.parse(JSON.stringify(await t.raw.$queryRawUnsafe(`SELECT ${cols} FROM "${table}" ORDER BY id`)));
    }
    return out;
}
export async function catalog(t) {
    const source = await readFile(new URL('../../audit/postgresql/catalog.sql', import.meta.url), 'utf8');
    return t.raw.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog');
        const [row] = await tx.$queryRawUnsafe(source.slice(source.indexOf('WITH tables AS'), source.lastIndexOf('COMMIT;')));
        return Object.values(row)[0];
    });
}
export const close = () => Promise.all(clients.map(c => c.$disconnect()));

// Generate the actual received Prisma client in a separate output. This proves
// old-client/new-database compatibility and captures genuine v4 float encoding.
const legacySchema = (await readFile(new URL('../../../scripts/fixtures/phase6/legacy-schema.prisma', import.meta.url), 'utf8'))
    .replace('generator client {', `generator client {\n  output = ${JSON.stringify(path.join(root, 'legacy-client').replaceAll('\\', '/'))}`);
await symlink(path.join(serverDir, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
await writeFile(path.join(root, 'legacy.prisma'), legacySchema);
const generated = spawnSync(process.execPath, [path.join(serverDir, 'node_modules/prisma/build/index.js'), 'generate', '--schema', path.join(root, 'legacy.prisma')], {
    cwd: root, env: { ...env, PRISMA_GENERATE_SKIP_AUTOINSTALL: 'true' }, windowsHide: true, encoding: 'utf8'
});
assert.equal(generated.status, 0, generated.stderr);
const legacy = await import(pathToFileURL(path.join(root, 'legacy-client/index.js')).href);
export function legacyClient(t) {
    const client = new legacy.PrismaClient({ datasources: { db: { url: t.url } } }); clients.push(client); return client;
}

export function seed(t) {
    sql(t, `
      INSERT INTO "User" (id,username,email,"passwordHash","firstName","lastName","updatedAt") VALUES
        ('A','a','a@synthetic.invalid','SYNTHETIC_SECRET','Ana','A',now()),('B','b','b@synthetic.invalid','SYNTHETIC_SECRET','Ben','B',now());
      INSERT INTO "Routine" (id,name,"userId","updatedAt") VALUES ('ra','Plan A','A',now()),('ra2','Another plan','A',now()),('rb','Plan B','B',now());
      INSERT INTO "RoutineDay" (id,"dayName","routineId",weekday) VALUES ('da','Lunes','ra',1),('da2','Custom day','ra2',NULL),('db','Lunes','rb',1);
      INSERT INTO "Exercise" (id,name,"muscleGroup","targetSets","targetReps","isUnilateral","routineDayId") VALUES
        ('ea','Press','pecho',2,'8-12',false,'da'),('ea2','Press',NULL,3,'8-12',false,'da2'),
        ('eu','Personalizado unilateral',NULL,2,'6-8',true,'da'),('eb','Press','pecho',2,'8-12',false,'db');
      UPDATE "Exercise" SET "order"=1 WHERE id='eu';
      INSERT INTO "WorkoutLog" (id,date,"exerciseId",notes) VALUES
        ('wa','2020-01-01 12:00:00.123','ea','Old offline work'),('wa2','2020-01-01 12:00:00.123','ea2',NULL),
        ('wu','2026-10-18 05:59:59.999','eu',NULL),('wb','2026-10-18 05:59:59.999','eb',NULL);
      INSERT INTO "SetLog" (id,"setNumber",weight,reps,rpe,completed,"weightRight","repsRight","workoutLogId") VALUES
        ('sa',1,80,10,8,true,NULL,NULL,'wa'),('sa0',3,0,0,NULL,false,0,0,'wa'),
        ('sa2',1,80,10,8,true,NULL,NULL,'wa2'),('su',1,50,8,9,false,60,8,'wu'),('sb',1,200,10,8,true,NULL,NULL,'wb');
      INSERT INTO "PersonalRecord" (id,"exerciseName",weight,reps,"estimated1RM",date,"userId") VALUES
        ('pa','press',80,10,106.66666666666666,'2020-01-01 12:00:00.123','A');
      INSERT INTO "RoutineBlock" (id,name,"routineId",phase,"startedAt") VALUES ('ba','Block','ra','accumulation','2020-01-01');
      INSERT INTO "BodyLog" (id,"userId",weight,"photoUrl","zeroLiquidCalories") VALUES ('body','A',0,'https://example.invalid/photo',NULL);
      INSERT INTO "Goal" (id,"userId","exerciseName","targetWeight","targetReps","completedWeeks") VALUES ('goal','A','Press',100,10,ARRAY[1,3]);
      INSERT INTO "RestLog" (id,"userId",date,note) VALUES ('rest','A','2020-01-01','Rest recorded');
      INSERT INTO "CardioSession" (id,"userId","updatedAt") VALUES ('cardio','A',now());
      INSERT INTO "CardioSegment" (id,"sessionId","durationMin",incline,speed) VALUES ('segment','cardio',2.5,0,NULL);
      INSERT INTO "TrainingProfile" (id,"userId",goal,"daysPerWeek",equipment,"experienceLevel","updatedAt") VALUES ('profile','A','strength',3,ARRAY['barbell'],'beginner',now());
      INSERT INTO "SuggestionLog" (id,"userId","exerciseId","suggestedWeight","suggestedReps",source) VALUES ('suggestion','A','ea2',80,10,'client');
      INSERT INTO "PendingReminder" (id,"userId","exerciseId","fireAt") VALUES ('reminder','A','ea',now());
      INSERT INTO "PushSubscription" (id,"userId",endpoint,p256dh,auth) VALUES ('push','A','https://example.invalid/push','SYNTHETIC_PUSH_KEY','SYNTHETIC_PUSH_AUTH');
    `);
}
