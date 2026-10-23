import { readBackendSource } from '../../scripts/lib/backend-source.mjs';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import express from 'express';
import * as logic from '../src/logic.js';
import training from '../src/generated/training.cjs';
import { sourceFunction } from '../../scripts/lib/training-characterization.mjs';
import { createWorkoutHandlers } from '../src/routes/workouts.js';
import { prisma, schema, seed, snapshot, addLog, set, listen } from './fixtures/workout-test-db.js';
const require = createRequire(new URL('../../package.json', import.meta.url)), ts = require('typescript');
const source = await readBackendSource();
const ast = ts.createSourceFile('index.js', source, ts.ScriptTarget.Latest, true);
const routes = new Map();
function visit(n) {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'app.get' && ['/api/stats/plateaus', '/api/stats/overview'].includes(n.arguments[0]?.text)) routes.set(n.arguments[0].text, n.arguments.at(-1).getText(ast));
    ts.forEachChild(n, visit);
}
visit(ast); assert.equal(routes.size, 2);
const bindings = { ...logic, ...training, prisma, HISTORY_SESSIONS_WINDOW: 10, setPrivateCache: (res, seconds) => res.set('Cache-Control', `private,max-age=${seconds}`) };
const evaluateDeload = await sourceFunction('server/src/index.js', 'maybeEvaluateAdaptiveDeload', {
    ...bindings, ADAPTIVE_DELOAD_COOLDOWN_MS: 604800000, ADAPTIVE_DELOAD_WINDOW_MS: 604800000, ADAPTIVE_DELOAD_VOLUME_DROP_RATIO: .85, ADAPTIVE_DELOAD_MIN_PLATEAUS: 3
});
let server, request;
before(async () => {
    await schema();
    await prisma.$executeRawUnsafe('CREATE TABLE "RestLog" (id TEXT PRIMARY KEY, date TIMESTAMP(3) NOT NULL, "userId" TEXT REFERENCES "User"(id))');
    await prisma.$executeRawUnsafe('CREATE TABLE "RoutineBlock" (id TEXT PRIMARY KEY, "routineId" TEXT NOT NULL REFERENCES "Routine"(id), name TEXT NOT NULL, phase TEXT NOT NULL, "order" INTEGER NOT NULL, "durationWeeks" INTEGER NOT NULL, "startedAt" TIMESTAMP(3))');
    const app = express(); app.use(express.json()); app.use((req, res, next) => { req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A'; next(); });
    for (const [route, code] of routes) app.get(route, new Function(...Object.keys(bindings), `return (${code});`)(...Object.values(bindings)));
    const handlers = createWorkoutHandlers({ prisma, logger: { error: () => {} } });
    app.put('/api/workouts/:logId', handlers.updateWorkout); app.delete('/api/workouts/:logId', handlers.deleteWorkout);
    ({ server, request } = await listen(app));
});
beforeEach(async () => { await seed(); await prisma.routine.update({where:{id:'a-routine'},data:{isActive:true}}); });
after(async () => { if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await prisma.$disconnect(); });
const stats = user => request('/api/stats/overview', undefined, 'GET', user);
const plateaus = user => request('/api/stats/plateaus', undefined, 'GET', user);
const ago = days => new Date(Date.now() - days * 86400000).toISOString();

test('5.5 actual overview HTTP/PG preserves recorded-side zero/partial volume, row counts and owner isolation', async () => {
    await addLog('zero','a-ex',[set(80,10,{weightRight:0,repsRight:0})],ago(1));
    await addLog('partial','a-uni',[set(80,10,{weightRight:60,repsRight:null,completed:false})],ago(2));
    await addLog('foreign','b-ex',[set(500,10)],ago(1));
    const before=await snapshot(),result=await stats();assert.equal(result.status,200);assert.equal(result.body.weeklyVolume,1600);assert.equal(result.body.totalWorkouts,2);
    assert.equal((await stats('B')).body.weeklyVolume,5000);assert.deepEqual(await snapshot(),before);
    assert.equal(result.body.weeklyVolume,Math.round(training.trainingLoadVolume(before.sets.filter(s=>s.workoutLogId!=='foreign'),'recorded-sides')));
});
test('5.5 actual plateau HTTP/PG keeps by-name aggregation distinct from per-ID triggers and PR evidence', async () => {
    for(let i=0;i<4;i++)await addLog('plateau-'+i,i%2?'a-ex2':'a-ex',[set(100,1,{completed:false})],ago(i+1));
    assert.equal((await plateaus()).body.plateauCount,0);
    assert.equal((await request('/api/workouts/plateau-0',{sets:[set(100,1,{completed:false})]},'PUT')).status,200);
    const before=await snapshot(),result=await plateaus();assert.equal(result.status,200);assert.deepEqual(result.body.plateaued,['press']);assert.equal(result.body.window,10);
    const perId=await prisma.workoutLog.findMany({where:{exerciseId:'a-ex'},include:{sets:true}});assert.equal(logic.detectPlateauForExercise(perId),false);
    assert.equal((await plateaus('B')).body.plateauCount,0);assert.deepEqual(await snapshot(),before);
});
test('5.5 edit/delete integration recomputes real stats, weak-side plateau and strongest-side transactional PR',async()=>{
    await addLog('edit','a-uni',[set(100,12,{weightRight:80,repsRight:8})],ago(1));
    const edited=await request('/api/workouts/edit',{sets:[set(90,12,{weightRight:70,repsRight:12,rpe:9})]},'PUT');assert.equal(edited.status,200);
    assert.equal((await stats()).body.weeklyVolume,1920);
    const pr=await prisma.personalRecord.findFirst({where:{userId:'A'}});assert.equal(pr.weight,90);
    assert.equal(training.computeWorkoutSuggestion([{sets:edited.body.workoutLog.sets}],'8-12',2.5).weight,72.5);
    assert.equal((await request('/api/workouts/edit',undefined,'DELETE')).status,200);assert.equal((await stats()).body.weeklyVolume,0);assert.equal(await prisma.personalRecord.count(),0);assert.equal((await plateaus()).body.plateauCount,0);
});
test('5.5 actual adaptive-deload orchestration retains thresholds, SQL updates, cooldown and block priority',async()=>{
    for(const exerciseId of ['a-ex','a-ex2','a-uni'])for(let i=0;i<4;i++)await addLog(exerciseId+'-'+i,exerciseId,[set(100,1)],ago(10+i));
    let routine=await prisma.routine.findUnique({where:{id:'a-routine'},include:{days:{include:{exercises:true}},blocks:true}});
    const start=Date.now();await evaluateDeload(routine,'A');
    const activated=await prisma.routine.findUnique({where:{id:'a-routine'}});assert(activated.adaptiveDeloadUntil);assert(activated.lastAdaptiveCheckAt);
    assert(activated.adaptiveDeloadUntil.getTime()>=start+604800000);assert.equal(activated.adaptiveDeloadUntil-activated.lastAdaptiveCheckAt,604800000);
    await evaluateDeload({...routine,...activated},'A');assert.deepEqual(await prisma.routine.findUnique({where:{id:'a-routine'}}),activated);
    await prisma.routine.update({where:{id:'a-routine'},data:{adaptiveDeloadUntil:null,lastAdaptiveCheckAt:null}});
    routine={...routine,blocks:[{phase:'deload',startedAt:new Date('2020-01-01Z'),durationWeeks:1}]};await evaluateDeload(routine,'A');
    assert.equal((await prisma.routine.findUnique({where:{id:'a-routine'}})).lastAdaptiveCheckAt,null);
});
