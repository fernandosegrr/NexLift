import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { auditDir, inspectSql, compareCatalog, canRunDiagnostics, loadDeclared, cleanEnvironment, runPg } from '../audit/postgresql/audit-tools.mjs';
import { parseInspectionArgs, inspectCopy } from '../audit/postgresql/inspect-authorized-copy.mjs';

// Refuse to instantiate a database client unless the disposable runner selected it.
const port = process.env.NEXLIFT_SCHEMA_AUDIT_PORT;
const url = new URL(process.env.DATABASE_URL || 'file:///not-a-database');
if (!port || url.hostname!=='127.0.0.1' || url.port!==port || url.username!=='nexlift_schema_audit'
    || url.password || url.pathname!=='/nexlift_schema_audit' || url.protocol!=='postgresql:' || url.search || url.hash) {
    throw new Error('Run only through run-schema-audit.mjs; isolated database required.');
}
const prisma = new PrismaClient();
const peer = new PrismaClient();
const connection = { args: ['-h','127.0.0.1','-p',port,'-U','nexlift_schema_audit','-d','nexlift_schema_audit'] };
const expected = loadDeclared().catalog;
const models = Prisma.dmmf.datamodel.models;
const quote = s => '"'+s.replaceAll('"','""')+'"';
const sqlState = code => error => error.meta?.code===code;
const inspect = file => inspectSql(file,connection);
const check = name => inspect('diagnostics.sql').find(r=>r.check===name)?.count;
const changeHistoryFk = async action => {
    assert.ok(['CASCADE','RESTRICT','NO ACTION DEFERRABLE INITIALLY DEFERRED'].includes(action));
    const [onDelete, suffix] = action==='NO ACTION DEFERRABLE INITIALLY DEFERRED' ? ['NO ACTION','DEFERRABLE INITIALLY DEFERRED'] : [action,''];
    await prisma.$executeRawUnsafe('ALTER TABLE "WorkoutLog" DROP CONSTRAINT IF EXISTS "WorkoutLog_exerciseId_fkey"');
    await prisma.$executeRawUnsafe(`ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"(id) ON DELETE ${onDelete} ON UPDATE CASCADE ${suffix}`);
};
async function seed() {
    await prisma.$executeRawUnsafe('TRUNCATE '+models.map(m=>quote(m.name)).join(',')+' CASCADE');
    for (const p of ['a','b']) {
        await prisma.user.create({data:{ id:p,username:p,email:`${p}@example.invalid`,passwordHash:'synthetic-hash',firstName:'Synthetic',lastName:'Test' }});
        await prisma.routine.create({data:{id:`${p}-r`,userId:p,name:'Synthetic',days:{create:{id:`${p}-d`,dayName:'Lunes',weekday:1,exercises:{create:{id:`${p}-e`,name:'Press',targetSets:3,targetReps:'8-12'}}}}}});
    }
    await prisma.routineBlock.create({data:{id:'block',routineId:'a-r',name:'Synthetic'}});
    await prisma.workoutLog.create({data:{id:'workout',exerciseId:'a-e',date:new Date('2020-01-02T06:00:00.000Z'),sets:{create:{id:'set',setNumber:1,weight:80,reps:10}}}});
    await prisma.personalRecord.create({data:{id:'pr',userId:'a',exerciseName:'press',weight:80,reps:10,estimated1RM:80*(1+10/30)}});
    await prisma.bodyLog.create({data:{id:'body',userId:'a',weight:80}});
    await prisma.restLog.create({data:{id:'rest',userId:'a'}});
    await prisma.goal.create({data:{id:'goal',userId:'a',exerciseName:'Press',targetWeight:90,targetReps:10,completedWeeks:[]}});
    await prisma.pushSubscription.create({data:{id:'push',userId:'a',endpoint:'https://example.invalid/synthetic',p256dh:'synthetic',auth:'synthetic'}});
    await prisma.pendingReminder.create({data:{id:'reminder',userId:'a',exerciseId:'a-e',fireAt:new Date('2030-01-01T00:00:00.000Z')}});
    await prisma.suggestionLog.create({data:{id:'suggestion',userId:'a',exerciseId:'a-e',suggestedWeight:80,suggestedReps:10,source:'client'}});
    await prisma.trainingProfile.create({data:{id:'profile',userId:'a',goal:'strength',daysPerWeek:3,equipment:['barbell'],experienceLevel:'intermediate'}});
    await prisma.cardioSession.create({data:{id:'cardio',userId:'a',segments:{create:{id:'segment',durationMin:10}}}});
}
before(async()=>{ await prisma.$connect(); await peer.$connect(); });
beforeEach(seed);
after(async()=>{ await prisma.$disconnect(); await peer.$disconnect(); });

test('full 17-model catalog equals the declared reconstruction, including all FK actions and indexes',()=>{
    const [actual]=inspect('catalog.sql');
    assert.equal(actual.tables.length,17);
    assert.deepEqual(compareCatalog(expected,actual),[]);
    assert.ok(actual.foreignKeys.every(f=>f.onDelete==='CASCADE' && f.onUpdate==='CASCADE' && !f.deferrable && f.validated));
    assert.ok(actual.foreignKeys.every(f=>f.triggerModes.join()==='O'));
});
test('the same SQL reconstructs an independent empty database without Prisma migration activation',()=>{
    const [second]=inspectSql('catalog.sql',{args:[...connection.args.slice(0,-1),'nexlift_schema_rebuild']});
    assert.deepEqual(compareCatalog(expected,second),[]);
    assert.ok(!second.tables.some(t=>t.name==='_prisma_migrations'));
});

for (const model of models) for (const relation of model.fields.filter(f=>f.relationFromFields?.length)) {
    test(`installed FK rejects an orphan: ${model.name}.${relation.relationFromFields.join(',')}`,async()=>{
        const delegate=model.name[0].toLowerCase()+model.name.slice(1);
        const row=await prisma[delegate].findFirst();
        assert.ok(row);
        const field=relation.relationFromFields[0];
        await assert.rejects(prisma.$executeRawUnsafe(`UPDATE ${quote(model.name)} SET ${quote(field)}=$1 WHERE id=$2`,'synthetic-missing-parent',row.id),sqlState('23503'));
        assert.equal((await prisma[delegate].findUnique({where:{id:row.id}}))[field],row[field]);
    });
}
test('direct exercise delete cascades workout, sets, reminder and suggestion, but leaves a stale PR',async()=>{
    await prisma.exercise.delete({where:{id:'a-e'}});
    for (const name of ['workoutLog','setLog','pendingReminder','suggestionLog']) assert.equal(await prisma[name].count(),0);
    assert.equal(await prisma.personalRecord.count(),1);
    assert.equal(check('pr_without_name_matched_history_informational'),1);
});
for (const [delegate,id] of [['routineDay','a-d'],['routine','a-r']]) test(`direct ${delegate} delete erases the entire workout history chain`,async()=>{
    await prisma[delegate].delete({where:{id}});
    assert.equal(await prisma.workoutLog.count(),0);
    assert.equal(await prisma.setLog.count(),0);
    assert.equal(await prisma.personalRecord.count(),1);
});
test('explicit workout and cardio session deletions cascade their component rows',async()=>{
    await prisma.workoutLog.delete({where:{id:'workout'}});
    await prisma.cardioSession.delete({where:{id:'cardio'}});
    assert.equal(await prisma.setLog.count(),0);
    assert.equal(await prisma.cardioSegment.count(),0);
    assert.equal(await prisma.exercise.count(),2);
});
test('deleting an account cascades its graph; the other account and legacy NULL owners survive',async()=>{
    await prisma.routine.create({data:{id:'legacy',name:'Unassigned'}});
    await prisma.personalRecord.create({data:{id:'legacy-pr',exerciseName:'legacy',weight:1,reps:1}});
    await prisma.user.delete({where:{id:'a'}});
    assert.equal(await prisma.routine.count({where:{userId:'a'}}),0);
    assert.equal(await prisma.setLog.count(),0);
    assert.equal(await prisma.personalRecord.count({where:{userId:'a'}}),0);
    assert.equal(await prisma.routine.count({where:{userId:'b'}}),1);
    assert.equal(await prisma.personalRecord.count({where:{userId:null}}),1);
    assert.equal(await prisma.routine.count({where:{userId:null}}),1);
});
test('ON UPDATE CASCADE propagates primary-key changes through installed FKs',async()=>{
    await prisma.user.update({where:{id:'a'},data:{id:'a-renamed'}});
    assert.equal((await prisma.routine.findUnique({where:{id:'a-r'}})).userId,'a-renamed');
    assert.equal((await prisma.personalRecord.findUnique({where:{id:'pr'}})).userId,'a-renamed');
    await prisma.exercise.update({where:{id:'a-e'},data:{id:'a-e-renamed'}});
    assert.equal((await prisma.workoutLog.findUnique({where:{id:'workout'}})).exerciseId,'a-e-renamed');
});
test('a failed transaction rolls back cascade deletion and preserves exact history',async()=>{
    await assert.rejects(prisma.$transaction(async tx=>{
        await tx.routine.delete({where:{id:'a-r'}});
        await tx.$queryRawUnsafe('SELECT 1/0');
    }),sqlState('22012'));
    assert.equal(await prisma.routine.count({where:{id:'a-r'}}),1);
    assert.equal((await prisma.setLog.findUnique({where:{id:'set'}})).weight,80);
});
test('RESTRICT prototype blocks direct and indirect history loss; account deletion requires an explicit workflow',async()=>{
    await changeHistoryFk('RESTRICT');
    try {
        // PostgreSQL 18 reports restrict_violation 23001. This installed Prisma
        // Client exposes it as UnknownRequestError, rather than assuming P2003.
        await assert.rejects(prisma.exercise.delete({where:{id:'a-e'}}),e=>e instanceof Prisma.PrismaClientUnknownRequestError && /23001/.test(e.message));
        for (const [delegate,id] of [['exercise','a-e'],['routineDay','a-d'],['routine','a-r'],['user','a']]) {
            const model=models.find(m=>m.name[0].toLowerCase()+m.name.slice(1)===delegate).name;
            await assert.rejects(prisma.$executeRawUnsafe(`DELETE FROM ${quote(model)} WHERE id=$1`,id),sqlState('23001'));
            assert.equal(await prisma.workoutLog.count(),1);
        }
        await prisma.$transaction(async tx=>{
            await tx.workoutLog.deleteMany({where:{exercise:{routineDay:{routine:{userId:'a'}}}}});
            await tx.user.delete({where:{id:'a'}});
        });
        assert.equal(await prisma.user.count({where:{id:'b'}}),1);
    } finally { await changeHistoryFk('CASCADE'); }
});
test('RESTRICT prototype permits archival by moving the SAME exercise ID before routine deletion',async()=>{
    await changeHistoryFk('RESTRICT');
    try {
        await prisma.$transaction(async tx=>{
            await tx.routine.create({data:{id:'bin',userId:'a',name:'ARCHIVED_HISTORY_DO_NOT_DELETE',days:{create:{id:'bin-day',dayName:'Bin'}}}});
            await tx.exercise.update({where:{id:'a-e'},data:{routineDayId:'bin-day'}});
            await tx.routine.delete({where:{id:'a-r'}});
        });
        assert.equal((await prisma.workoutLog.findUnique({where:{id:'workout'}})).exerciseId,'a-e');
        assert.equal(await prisma.setLog.count(),1);
    } finally { await changeHistoryFk('CASCADE'); }
});
test('deferred NO ACTION prototype rejects an invalid commit but permits reparenting within the transaction',async()=>{
    await changeHistoryFk('NO ACTION DEFERRABLE INITIALLY DEFERRED');
    try {
        await assert.rejects(prisma.$transaction(async tx=>{ await tx.exercise.delete({where:{id:'a-e'}}); }),e=>['P2003','P2010'].includes(e.code));
        assert.equal(await prisma.workoutLog.count(),1);
        await prisma.$transaction(async tx=>{
            await tx.exercise.delete({where:{id:'a-e'}});
            await tx.exercise.create({data:{id:'a-replacement',routineDayId:'a-d',name:'Press',targetSets:3,targetReps:'8-12'}});
            await tx.workoutLog.update({where:{id:'workout'},data:{exerciseId:'a-replacement'}});
        });
        assert.equal(await prisma.setLog.count(),1);
    } finally { await changeHistoryFk('CASCADE'); }
});
test('independent FKs allow cross-owner reminder/suggestion and reparenting silently transfers history ownership',async()=>{
    await prisma.pendingReminder.update({where:{id:'reminder'},data:{userId:'b'}});
    await prisma.suggestionLog.update({where:{id:'suggestion'},data:{userId:'b'}});
    assert.equal(check('reminder_owner_mismatch_or_unowned'),1);
    assert.equal(check('suggestion_owner_mismatch_or_unowned'),1);
    await prisma.exercise.update({where:{id:'a-e'},data:{routineDayId:'b-d'}});
    assert.equal(await prisma.workoutLog.count({where:{exercise:{routineDay:{routine:{userId:'b'}}}}}),1);
});
test('schema allows duplicate case-insensitive PRs; aggregate detector exposes them without names',async()=>{
    await prisma.personalRecord.create({data:{userId:'a',exerciseName:'PRESS',weight:90,reps:1}});
    assert.equal(check('pr_case_duplicate_groups'),1);
    assert.ok(!JSON.stringify(inspect('diagnostics.sql')).includes('Press'));
});
test('candidate expression unique index is incompatible with existing PR duplicates; no cleanup is automatic',async()=>{
    await prisma.personalRecord.create({data:{userId:'a',exerciseName:'PRESS',weight:90,reps:1}});
    await assert.rejects(prisma.$executeRawUnsafe('CREATE UNIQUE INDEX audit_pr_unique ON "PersonalRecord" ("userId",lower("exerciseName")) WHERE "userId" IS NOT NULL'),sqlState('23505'));
    assert.equal(await prisma.personalRecord.count(),2);
});
test('prototype PR uniqueness protects an absent PR against two independent database writers',async()=>{
    await prisma.personalRecord.deleteMany();
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX audit_pr_unique ON "PersonalRecord" ("userId",lower("exerciseName")) WHERE "userId" IS NOT NULL');
    try {
        const settled=await Promise.allSettled([prisma.personalRecord.create({data:{userId:'a',exerciseName:'press',weight:80,reps:10}}),peer.personalRecord.create({data:{userId:'a',exerciseName:'PRESS',weight:90,reps:10}})]);
        assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(settled.find(r=>r.status==='rejected').reason.code,'P2002');
        assert.equal(await prisma.personalRecord.count(),1);
    } finally { await prisma.$executeRawUnsafe('DROP INDEX audit_pr_unique'); }
});
test('active routine and AI day uniqueness are currently application conventions',async()=>{
    await prisma.routine.update({where:{id:'a-r'},data:{isActive:true,source:'ai'}});
    await prisma.routine.create({data:{userId:'a',name:'Second',isActive:true,source:'ai'}});
    await prisma.routineDay.createMany({data:[{routineId:'a-r',dayName:'2026-01-01'},{routineId:'a-r',dayName:'2026-01-01'}]});
    assert.equal(check('active_routine_duplicate_owners'),1);
    assert.equal(check('ai_routine_duplicate_owners'),1);
    assert.equal(check('ai_day_duplicate_groups'),1);
    await assert.rejects(prisma.$executeRawUnsafe('CREATE UNIQUE INDEX audit_active_unique ON "Routine" ("userId") WHERE "isActive" AND "userId" IS NOT NULL'),sqlState('23505'));
});
test('multiple same-day workout sessions and duplicate set numbers are accepted and separately classified',async()=>{
    await prisma.workoutLog.create({data:{exerciseId:'a-e',date:new Date('2020-01-02T12:00:00Z')}});
    await prisma.setLog.create({data:{workoutLogId:'workout',setNumber:1,weight:20,reps:10}});
    assert.equal(check('multiple_sessions_per_exercise_cdmx_day_groups_informational'),1);
    assert.equal(check('set_number_duplicate_groups'),1);
    await assert.rejects(prisma.$executeRawUnsafe('CREATE UNIQUE INDEX audit_set_unique ON "SetLog" ("workoutLogId","setNumber")'),sqlState('23505'));
});
test('nullable legacy owners are distinct from FK orphans, including descendants',async()=>{
    await prisma.routine.update({where:{id:'a-r'},data:{userId:null}});
    const aggregate=inspect('counts-and-orphans.sql');
    assert.equal(aggregate.find(r=>r.check==='owner_null' && r.table==='Routine').count,1);
    assert.ok(aggregate.filter(r=>r.check==='orphan_fk').every(r=>r.count===0));
    assert.equal(check('workouts_under_unowned_routines'),1);
    assert.equal(check('sets_under_unowned_routines'),1);
});
test('read-only diagnostics find invalid weekday and NaN/Infinity accepted by the current DB schema',async()=>{
    await prisma.$executeRawUnsafe('UPDATE "RoutineDay" SET weekday=9 WHERE id=$1','a-d');
    await prisma.$executeRawUnsafe('UPDATE "SetLog" SET weight=\'NaN\'::float8,"weightRight"=\'Infinity\'::float8 WHERE id=$1','set');
    assert.equal(check('weekday_out_of_range'),1);
    assert.equal(check('nonfinite_set_weights'),1);
});
test('candidate CHECK NOT VALID blocks new invalid data but validation waits for historical remediation',async()=>{
    await prisma.routineDay.update({where:{id:'a-d'},data:{weekday:9}});
    await prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" ADD CONSTRAINT audit_weekday CHECK (weekday BETWEEN 0 AND 6) NOT VALID');
    try {
        await assert.rejects(prisma.$executeRawUnsafe('UPDATE "RoutineDay" SET weekday=10 WHERE id=$1','b-d'),sqlState('23514'));
        await assert.rejects(prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" VALIDATE CONSTRAINT audit_weekday'),sqlState('23514'));
        await prisma.routineDay.update({where:{id:'a-d'},data:{weekday:0}});
        await prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" VALIDATE CONSTRAINT audit_weekday');
    } finally { await prisma.$executeRawUnsafe('ALTER TABLE "RoutineDay" DROP CONSTRAINT audit_weekday'); }
});
test('catalog diff detects actual drift in FK action, default, nullable column and extra index',async()=>{
    await changeHistoryFk('RESTRICT');
    await prisma.$executeRawUnsafe('ALTER TABLE "Exercise" ALTER COLUMN "isUnilateral" SET DEFAULT true');
    await prisma.$executeRawUnsafe('ALTER TABLE "Exercise" ALTER COLUMN "targetReps" DROP NOT NULL');
    await prisma.$executeRawUnsafe('CREATE INDEX audit_extra ON "Exercise" ("restSeconds")');
    try {
        const [actual]=inspect('catalog.sql');
        const diffs=compareCatalog(expected,actual);
        assert.ok(diffs.some(d=>d.section==='foreignKeys' && d.key.includes('WorkoutLog_exerciseId_fkey')));
        assert.ok(diffs.some(d=>d.section==='columns' && d.key.includes('isUnilateral')));
        assert.ok(diffs.some(d=>d.section==='columns' && d.key.includes('targetReps')));
        assert.ok(diffs.some(d=>d.section==='indexes' && d.difference==='extra'));
        assert.equal(canRunDiagnostics(expected,actual),false);
    } finally {
        await prisma.$executeRawUnsafe('DROP INDEX audit_extra');
        await prisma.$executeRawUnsafe('ALTER TABLE "Exercise" ALTER COLUMN "isUnilateral" SET DEFAULT false');
        await prisma.$executeRawUnsafe('ALTER TABLE "Exercise" ALTER COLUMN "targetReps" SET NOT NULL');
        await changeHistoryFk('CASCADE');
    }
});
test('declared-FK orphan script works even when the installed constraint is missing',async()=>{
    await prisma.$executeRawUnsafe('ALTER TABLE "WorkoutLog" DROP CONSTRAINT "WorkoutLog_exerciseId_fkey"');
    try {
        await prisma.$executeRawUnsafe('UPDATE "WorkoutLog" SET "exerciseId"=$1 WHERE id=$2','missing','workout');
        assert.equal(inspect('declared-orphans.sql').find(r=>r.table==='WorkoutLog').count,1);
        assert.ok(compareCatalog(expected,inspect('catalog.sql')[0]).some(d=>d.section==='foreignKeys' && d.difference==='missing'));
    } finally {
        await prisma.$executeRawUnsafe('UPDATE "WorkoutLog" SET "exerciseId"=$1 WHERE id=$2','a-e','workout');
        await changeHistoryFk('CASCADE');
    }
});
test('all inspection scripts execute in read-only transactions and leave rows unchanged',async()=>{
    const beforeRows=await prisma.workoutLog.findMany({include:{sets:true}});
    for (const file of ['catalog.sql','counts-and-orphans.sql','declared-orphans.sql','diagnostics.sql']) {
        assert.match(readFileSync(path.join(auditDir,file),'utf8'),/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
        assert.ok(inspect(file).length>0);
    }
    assert.deepEqual(await prisma.workoutLog.findMany({include:{sets:true}}),beforeRows);
    const output=runPg('psql',['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1',...connection.args,'-c','SHOW default_transaction_read_only'],{env:{...cleanEnvironment(),PGOPTIONS:'-c default_transaction_read_only=on'}});
    assert.equal(output.trim(),'on');
});
test('date diagnostics bucket UTC history without exposing dates or personal data',()=>{
    const rows=inspect('diagnostics.sql');
    assert.deepEqual(rows.find(r=>r.check==='workout_year_bucket'),{check:'workout_year_bucket',year:2020,count:1});
    const text=JSON.stringify(rows);
    for (const secret of ['example.invalid','synthetic-hash','p256dh','2020-01-02','a-e','workoutLogId']) assert.ok(!text.includes(secret));
});
test('future-copy wrapper refuses implicit connections and URLs before invoking PostgreSQL',()=>{
    for (const args of [[],['--confirm-authorized-copy'],['--url=postgresql://secret'],['--service-file=relative','--service=test','--confirm-authorized-copy']]) {
        assert.throws(()=>parseInspectionArgs(args));
        assert.throws(()=>inspectCopy(args));
    }
    assert.ok(!Object.keys(cleanEnvironment()).some(k=>/^(PG|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$)/i.test(k)));
});
test('Prisma-side CUID/updatedAt and arrays differ from database defaults/nullability',()=>{
    const columns=expected.columns;
    assert.equal(columns.find(c=>c.table==='User' && c.name==='id').default,null);
    assert.equal(columns.find(c=>c.table==='User' && c.name==='updatedAt').default,null);
    assert.equal(columns.find(c=>c.table==='Goal' && c.name==='completedWeeks').nullable,true);
    assert.equal(columns.find(c=>c.table==='TrainingProfile' && c.name==='equipment').nullable,true);
});
test('final catalog contains no persistent prototype constraints or activated migrations',()=>{
    assert.deepEqual(compareCatalog(expected,inspect('catalog.sql')[0]),[]);
});

for (const [name,delegate,data] of [
    ['username','user',{username:'a',email:'unique@example.invalid',passwordHash:'synthetic',firstName:'Synthetic',lastName:'Test'}],
    ['email','user',{username:'unique',email:'a@example.invalid',passwordHash:'synthetic',firstName:'Synthetic',lastName:'Test'}],
    ['TrainingProfile.userId','trainingProfile',{userId:'a',goal:'strength',daysPerWeek:3,equipment:[],experienceLevel:'intermediate'}],
    ['PushSubscription.endpoint','pushSubscription',{userId:'b',endpoint:'https://example.invalid/synthetic',p256dh:'synthetic',auth:'synthetic'}],
    ['PendingReminder.userId/exerciseId','pendingReminder',{userId:'a',exerciseId:'a-e',fireAt:new Date('2030-01-01T00:00:00.000Z')}]
]) test(`existing unique constraint rejects duplicates: ${name}`,async()=>{
    await assert.rejects(prisma[delegate].create({data}),e=>e.code==='P2002');
});
test('catalog detects disabled FK triggers, which a constraint declaration alone cannot establish',async()=>{
    await prisma.$executeRawUnsafe('ALTER TABLE "WorkoutLog" DISABLE TRIGGER ALL');
    try {
        const [actual]=inspect('catalog.sql');
        assert.equal(actual.foreignKeys.find(f=>f.table==='WorkoutLog').triggerModes.join(),'D,O');
        assert.ok(compareCatalog(expected,actual).some(d=>d.section==='foreignKeys' && d.difference==='changed'));
    } finally { await prisma.$executeRawUnsafe('ALTER TABLE "WorkoutLog" ENABLE TRIGGER ALL'); }
});
test('sensitive column defaults are fingerprinted without printing their contents',async()=>{
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ALTER COLUMN "passwordHash" SET DEFAULT \'synthetic-secret-default\'');
    try {
        const [actual]=inspect('catalog.sql');
        assert.ok(!JSON.stringify(actual).includes('synthetic-secret-default'));
        assert.match(actual.columns.find(c=>c.table==='User' && c.name==='passwordHash').default,/redacted metadata fingerprint/);
    } finally { await prisma.$executeRawUnsafe('ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT'); }
});
test('future-copy wrapper executes all read-only inspections using only the runner-created synthetic service',()=>{
    const report=inspectCopy(['--confirm-authorized-copy',`--service-file=${process.env.NEXLIFT_SCHEMA_AUDIT_SERVICE_FILE}`,'--service=nexlift_synthetic_copy']);
    assert.deepEqual(report.differences,[]);
    assert.equal(report.diagnosticsSkipped,null);
    assert.equal(report.declaredOrphans.length,18);
    assert.ok(report.declaredOrphans.every(r=>r.count===0));
    assert.equal(report.countsAndOrphans.find(r=>r.check==='entity_count' && r.table==='SetLog').count,1);
    assert.ok(!JSON.stringify(report).includes('synthetic-hash'));
});
