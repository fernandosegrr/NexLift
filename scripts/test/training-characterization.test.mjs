import test from 'node:test';
import { linearRegression, trainingSessionLoadSummary } from '../../packages/shared/dist/index.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import * as logic from '../../server/src/logic.js';
import * as smart from '../../client/src/utils/smartLoading.js';
import * as clientHistory from '../../client/src/utils/exerciseName.js';
import * as serverHistory from '../../server/src/utils/exerciseName.js';
import * as dates from '../../client/src/utils/dates.js';
import { recalcPRForExercise } from '../../server/src/services/personalRecords.js';
import { parseOperation } from '../../server/src/services/operationContract.js';
import { sourceFunction, trainingRoot } from '../lib/training-characterization.mjs';
const strength = await sourceFunction('client/src/utils/strength.js', 'epley1RM');
const pdf = await sourceFunction('client/src/utils/dayPdf.js', 'epley');
const estimate = await sourceFunction('client/src/pages/Workout.jsx', 'estimate1RM', { effectiveSet: logic.effectiveWorkoutSet });
const workoutVolume = await sourceFunction('client/src/pages/Workout.jsx', 'sessionVolumeFromSets');
const pdfVolume = await sourceFunction('scripts/fixtures/phase5complete/dayPdf.reference.txt', 'sessionVolume');
const reportVolume = await sourceFunction('client/src/pages/ExportReport.jsx', 'calculateVolume', { trainingSessionLoadSummary });
const regression = linearRegression;
const plan = await sourceFunction('client/src/utils/goalPlanner.js', 'generatePeriodizedPlan');
const s = (weight=80,reps=10,rpe=8,extra={}) => ({weight,reps,rpe,...extra});
const sessions = (...sets) => [{date:'2026-10-01T18:00:00Z',sets}];
const logs = values => values.map((weight,i)=>({date:new Date(`2026-10-${String(i+1).padStart(2,'0')}T18:00:00Z`),sets:[s(weight,1)]}));
async function pr(input) {
    const calls=[];
    const client={workoutLog:{findMany:async query=>{calls.push({query});return input;}},personalRecord:{
        deleteMany:async query=>calls.push({delete:query}),create:async query=>{calls.push({create:query});return query.data;}}};
    return {result:await recalcPRForExercise(client,'Press Sintético','synthetic-owner'),calls};
}

test('5.1 Epley variants reproduce 80 kg x 10 without conflating rounding policies',async()=>{
    assert.equal(clientHistory.epley1RM(80,10),80*(1+10/30));
    assert.equal(serverHistory.epley1RM(80,10),106.66666666666666);
    assert.equal(strength(80,10),106.7); assert.equal(pdf(80,10),106.66666666666666);
    assert.equal(estimate(s()),106.66666666666666);
    assert.equal((await pr(logs([80]).map(l=>({...l,sets:[s()]})))).result.estimated1RM,106.66666666666666);
});
test('5.1 single and >=37-rep policies are intentionally different',async()=>{
    assert.equal(estimate(s(80,1)),80*(1+1/30)); assert.equal(pdf(80,1),80);
    assert.equal(clientHistory.epley1RM(80,37),176); assert.equal(clientHistory.epley1RM(80,1000),176);
    assert.equal((await pr([{date:new Date(0),sets:[s(80,37)]}])).result.estimated1RM,80);
    assert.equal(strength(80,37),178.7); assert.equal(pdf(80,37),80*(1+37/30));
});
test('5.1 capped Epley preserves historical coercion, missing values, decimals and errors',()=>{
    for(const fn of [clientHistory.epley1RM,serverHistory.epley1RM]) {
        for(const value of [undefined,null,'',0,-1,NaN]) assert.equal(fn(value,10),0);
        assert.equal(fn('80.25','10.5'),80.25*(1+10.5/30)); assert.equal(fn(80,0.5),80*(1+0.5/30));
        assert.equal(fn(Infinity,1),Infinity);assert.equal(fn(80,Infinity),176);
        assert.equal(fn(true,true),1);assert.throws(()=>fn(Symbol('x'),10),TypeError);
    }
});
test('5.1 PR unilateral strongest side, missing-side fallback and incomplete sets remain historical',async()=>{
    const {result}=await pr([{date:new Date(0),sets:[s(80,10,8,{completed:false,weightRight:100,repsRight:null})]}]);
    assert.equal(result.weight,100);assert.equal(result.reps,10);
    assert.deepEqual(logic.effectiveWorkoutSet(s(80,10,8,{completed:false,weightRight:100,repsRight:8})),{weight:80,reps:8,rir:2});
});
test('5.1 PR exact ties retain first encountered session/set; transaction port and account filter stay explicit',async()=>{
    const a={date:new Date('2026-01-01Z'),sets:[s(80,10),s(80,10)]};
    const b={date:new Date('2026-01-02Z'),sets:[s(80,10)]};
    const {result,calls}=await pr([a,b]);assert.equal(result.date,a.date);assert.equal(result.weight,80);
    assert.deepEqual(calls[0].query.orderBy,{date:'asc'});
    assert.equal(calls[0].query.where.exercise.routineDay.routine.userId,'synthetic-owner');
    assert.equal(calls[1].delete.where.userId,'synthetic-owner');assert.equal(calls.length,3);
});
test('5.1 mathematically equal Epley scores can differ by one IEEE-754 step; PR compares exactly',async()=>{
    const first=80*(1+10/30),second=100*(1+2/30);
    assert.equal(first,106.66666666666666);assert.equal(second,106.66666666666667);
    const {result}=await pr([{date:new Date(0),sets:[s(80,10),s(100,2)]}]);
    assert.equal(result.weight,100);assert.equal(result.estimated1RM,second);
});
test('5.1 PR no work deletes derived record through caller; no fabricated zero record',async()=>{
    const {result,calls}=await pr([{date:new Date(0),sets:[s(0,10),s(80,0)]}]);
    assert.equal(result,null);assert.equal(calls.length,2);
});
test('5.1 RIR 0..4 has matching stored effort across normal, unilateral and Shortcut boundaries',()=>{
    for(let rir=0;rir<=4;rir++) {
        const stored=10-rir;
        assert.equal(logic.convertShortcutRir(rir),stored);
        const manual=logic.sanitizeSets([s(80,10,stored,{weightRight:75,repsRight:9})]);
        assert.equal(manual.sets[0].rpe,stored);assert.equal(logic.effectiveWorkoutSet(manual.sets[0]).rir,rir);
        for(const payload of [{rir},{rpe:rir},{rpe:stored}]) {
            const result=logic.sanitizeShortcutLogSet({exerciseId:'synthetic',weight:80,reps:10,...payload});
            assert.equal(result.clean.rawRir,rir);assert.equal(result.clean.set.rpe,stored);
        }
        const operation=parseOperation({operationId:'12345678-1234-4000-8000-123456789abc',kind:'workout.create',source:'shortcut',performedAt:'2026-10-18T23:30:00-06:00',exerciseId:'synthetic',sets:[{weight:80,reps:10,rir,rpe:stored}]});
        assert.equal(operation.sets[0].rpe,stored);assert.equal(operation.performedDay,'2026-10-18');
    }
});
test('5.1 Shortcut precedence, missing fallback and rpe=5 rejection differ from persisted legacy rows',()=>{
    assert.equal(logic.sanitizeShortcutLogSet({exerciseId:'e',weight:80,reps:10}).clean.set.rpe,10);
    assert.equal(logic.sanitizeShortcutLogSet({exerciseId:'e',weight:80,reps:10,rpe:9,rir:3}).clean.set.rpe,7);
    assert(logic.sanitizeShortcutLogSet({exerciseId:'e',weight:80,reps:10,rpe:5}).error);
    assert.equal(logic.sanitizeSets([s(80,10,5)]).sets[0].rpe,5);
    assert(logic.sanitizeSets([s(80,10,null)]).error);assert.equal(logic.convertShortcutRir(null),null);
    assert.equal(logic.convertShortcutRir('2junk'),8);
});
test('5.1 series validator keeps actual limits and legacy parseFloat/parseInt coercions',()=>{
    assert.equal(logic.sanitizeSets([s(2000,1000,0)]).sets[0].reps,1000);
    assert.equal(logic.sanitizeSets([s(0,0,null,{completed:false})]).sets[0].completed,false);
    assert.equal(logic.sanitizeSets([s('80.5kg','10.9',8)]).sets[0].reps,10);
    for(const value of [[],Array.from({length:51},()=>s()),[s(2000.1,1)], [s(1,1001)]]) assert(logic.sanitizeSets(value).error);
});
test('5.1 Smart inter-session golden progression and insufficient history',()=>{
    for(const api of [logic,smart]) {
        assert.equal(api.computeWorkoutSuggestion([], '8-12',2.5),null);
        assert.equal(api.computeWorkoutSuggestion([{sets:[]}],'8-12',2.5),null);
        assert.deepEqual(api.computeWorkoutSuggestion(sessions(s(80,10,8)),'8-12',2.5),{weight:80,reps:11,rationale:'Hiciste 80kg × 10 (RIR 2): mantén el peso y apunta a 11 reps.',basedOn:1,phase:null});
        const top=api.computeWorkoutSuggestion(sessions(s(80,12,9),s(80,8,8)),'8-12',2.5);
        assert.equal(top.weight,82.5);assert.equal(top.reps,8);
        const comfortable=api.computeWorkoutSuggestion(sessions(s(80,12,7),s(80,8,7)),'8-12',2.5);
        assert.equal(comfortable.weight,80);assert.equal(comfortable.reps,9);
    }
});
test('5.1 Smart inter uses first supplied session only; basedOn is metadata, not a trend',()=>{
    const first=sessions(s(80,10));const extra=[...first,...sessions(s(200,20))];
    const a=smart.computeWorkoutSuggestion(first,'8-12',2.5), b=smart.computeWorkoutSuggestion(extra,'8-12',2.5);
    assert.deepEqual({...a,basedOn:2},b);
    assert.equal(smart.computeWorkoutSuggestion([{sets:[]},...first],'8-12',2.5),null);
});
test('5.1 Smart work reference protects singles, excludes drops and anchors heavy low-RIR sets',()=>{
    const effective=arr=>arr.map(logic.effectiveWorkoutSet);
    assert.equal(smart.pickWorkReference(effective([s(110,1),s(100,4),s(100,3)]),8).weight,100);
    assert.equal(smart.pickWorkReference(effective([s(100,5,9),s(80,12,7)]),8).weight,100);
    assert.equal(smart.pickWorkReference(effective([s(100,8),s(50,20)]),8).weight,100);
});
test('5.1 Smart rep phases, regex increments and fractional grid preserve boundary behavior',()=>{
    assert.deepEqual(smart.parseRepRange('12-8'),{lo:8,hi:12});assert.deepEqual(smart.parseRepRange('AMRAP'),{lo:8,hi:12});
    assert.deepEqual(smart.parseRepRange('2.5'),{lo:2,hi:5});assert.deepEqual(smart.parseRepRange('-4'),{lo:4,hi:4});
    assert.deepEqual(smart.adjustRepRangeForPhase(5,9,'intensification'),{lo:3,hi:5});
    assert.deepEqual(smart.adjustRepRangeForPhase(8,11,'accumulation'),{lo:8,hi:17});
    assert.equal(smart.resolveWeightIncrement(null,'Prensa'),5);assert.equal(smart.resolveWeightIncrement('otro','Prensa'),2.5);
    assert.equal(smart.roundWorkoutWeight(9.3,2.5,6.8),9.5);assert.equal(smart.roundWorkoutWeight(82.4,2.5,80),82.5);
    assert.equal(smart.roundWorkoutWeight(9.3,0,6.8),9.5);
});
test('5.1 Smart intra failure backoff, fatigue, comfort and missing RIR goldens',()=>{
    for(const api of [logic,smart]) {
        const next=api.suggestNextSetFromToday([{weight:80,reps:8,rir:0}],{lo:8,hi:12,increment:2.5});
        assert.equal(next.weight,70);assert.equal(next.reps,10);
        assert.equal(api.suggestNextSetFromToday([{weight:80,reps:8}],{}),null);
        const fatigued=api.suggestNextSetFromToday([{weight:80,reps:10,rir:3},{weight:80,reps:8,rir:1}]);
        assert.equal(fatigued.weight,80);assert.equal(fatigued.reps,8);
        assert.equal(api.suggestNextSetFromToday([{weight:80,reps:8,rir:3}]).reps,10);
    }
});
test('5.1 Smart intra depends on chronological set order; inter ignores completed flag historically',()=>{
    const ordered=[{weight:80,reps:10,rir:3},{weight:80,reps:8,rir:0}];
    assert.notDeepEqual(smart.suggestNextSetFromToday(ordered),smart.suggestNextSetFromToday([...ordered].reverse()));
    assert.deepEqual(smart.computeWorkoutSuggestion(sessions(s(80,10,8,{completed:false})),'8-12',2.5),smart.computeWorkoutSuggestion(sessions(s()),'8-12',2.5));
});
test('5.1 Smart parity/property grid is deterministic and does not mutate synthetic histories',()=>{
    for(const phase of [null,'deload','accumulation','intensification']) for(const weight of [0.5,6.8,80,2000]) for(const reps of [1,2,8,12,37,1000]) for(const rir of [0,1,2,3,4]) {
        const input=sessions(s(weight,reps,10-rir)); const before=structuredClone(input);
        const a=smart.computeWorkoutSuggestion(input,'8-12',2.5,phase);
        assert.deepEqual(a,logic.computeWorkoutSuggestion(input,'8-12',2.5,phase));assert.deepEqual(input,before);
        assert.deepEqual(a,smart.computeWorkoutSuggestion(input,'8-12',2.5,phase));
        if(a) assert(Number.isFinite(a.weight)&&Number.isFinite(a.reps));
    }
});
test('5.1 volume variants expose zero-right and partial-right semantics without unifying them',()=>{
    const zero=[s(80,10,8,{weightRight:0,repsRight:0,completed:false})];
    assert.equal(workoutVolume(zero),800);assert.equal(pdfVolume({sets:zero}),1600);assert.equal(reportVolume([{sets:zero}]).volume,800);
    const partial=[s(80,10,8,{weightRight:60})];
    assert.equal(workoutVolume(partial),800);assert.equal(pdfVolume({sets:partial}),1400);assert.equal(reportVolume([{sets:partial}]).volume,1400);
    assert.equal(workoutVolume([]),0);assert.equal(workoutVolume(null),0);
});
test('5.1 volume finite valid series is nonnegative and preserves arrays; no floating-point order promise',()=>{
    const input=Object.freeze([Object.freeze(s(80.5,10)),Object.freeze(s(60,8,8,{weightRight:55,repsRight:7}))]);
    assert.equal(workoutVolume(input),1670);assert.equal(workoutVolume([...input].reverse()),1670);
    assert(workoutVolume([s(-1,10)])===0);
});
test('5.1 plateau counts civil days, requires four and treats equal peaks as stalled',()=>{
    assert.equal(logic.detectPlateauForExercise(logs([100,100,100])),false);
    assert.equal(logic.detectPlateauForExercise(logs([100,100,100,100])),true);
    assert.equal(logic.detectPlateauForExercise(logs([100,100,100,101])),false);
    assert.equal(logic.detectPlateauForExercise([...logs([100,100,100]),{...logs([100])[0],sets:[s(200,1)]}]),false);
    assert.equal(logic.detectPlateauForExercise(logs([0,0,0,0])),true);
});
test('5.1 plateau six-day window, incomplete data, unilateral and high-rep discrepancy',()=>{
    assert.equal(logic.detectPlateauForExercise(logs([999,100,100,100,100,100,101])),false);
    const input=logs([100,100,100,100]).map(l=>({...l,sets:[s(100,1,8,{completed:false,weightRight:80,repsRight:1})]}));
    assert.equal(logic.detectPlateauForExercise(input),true);
    const mixed=logs([100,100,80,80]);mixed[2].sets=[s(80,37)];mixed[3].sets=[s(80,37)];
    assert.equal(logic.detectPlateauForExercise(mixed),true);
    const grouped=clientHistory.groupHistoryByExercise(mixed.map(l=>({...l,exercise:{name:'Press sintético'}})));
    assert.equal(clientHistory.detectPlateau([...grouped.values()][0].sessions).isPlateaued,false);
});
test('5.1 CDMX midnight, Sunday and original offline instant remain distinct from UTC date',()=>{
    for(const [iso,key] of [['2026-10-19T05:59:59.999Z','2026-10-18'],['2026-10-19T06:00:00Z','2026-10-19'],['2026-02-01T05:59:59Z','2026-01-31'],['2026-01-01T05:59:59Z','2025-12-31']]) {
        const instant=new Date(iso);assert.equal(logic.mexicoCityDateStr(instant),key);assert.equal(dates.mexicoCityDateStr(instant),key);
    }
    assert.equal(dates.mexicoCityDayOfWeek('2026-10-19T05:59:59Z'),0);
    assert.equal(logic.mexicoCityDateStr(new Date('2026-10-18T23:30:00-06:00')),'2026-10-18');
    assert.deepEqual(dates.mexicoCityLastNDays(3,'2026-02-01T18:00:00Z'),['2026-01-30','2026-01-31','2026-02-01']);
    const range=logic.parseCdmxDateRangeQuery('2026-01-31','2026-02-01');
    assert.equal(range.gte.toISOString(),'2026-01-31T06:00:00.000Z');assert.equal(range.lt.toISOString(),'2026-02-02T06:00:00.000Z');
});
test('5.1 explicit CDMX helpers ignore process timezone while history grouping exposes its dependency',()=>{
    const code=`import * as h from ${JSON.stringify(pathToFileURL(path.join(trainingRoot,'server/src/utils/exerciseName.js')).href)};import * as l from ${JSON.stringify(pathToFileURL(path.join(trainingRoot,'server/src/logic.js')).href)};const d=new Date('2026-10-19T05:30:00Z');console.log(JSON.stringify({civil:l.mexicoCityDateStr(d),group:[...h.groupHistoryByExercise([{date:d,exercise:{name:'Synthetic'},sets:[{weight:80,reps:10}]}]).values()][0].sessions[0].date}));`;
    const results=['UTC','America/Mexico_City','Asia/Tokyo'].map(TZ=>{
        const run=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ},encoding:'utf8',windowsHide:true});
        assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);
    });
    assert(results.every(r=>r.civil==='2026-10-18'));assert.deepEqual(results.map(r=>r.group),['2026-10-19','2026-10-18','2026-10-19']);
});
test('5.1 historical DST offset and fixed-24h day-bounds limitation are recorded, not corrected',()=>{
    assert.equal(logic.mexicoCityUtcOffsetMinutes(new Date('2021-07-01T12:00:00Z')),-300);
    assert.equal(logic.mexicoCityUtcOffsetMinutes(new Date('2021-01-01T12:00:00Z')),-360);
    const after=new Date('2021-04-04T12:00:00Z'); const bounds=logic.mexicoCityDayBounds(after);
    assert.equal(bounds.start.toISOString(),'2021-04-04T05:00:00.000Z');
    assert.equal(logic.mexicoCityDateStr(bounds.start),'2021-04-03');
    assert.equal(bounds.end-bounds.start,86400000);
});
test('5.1 mesocycle week uses elapsed seven-day durations and does not clamp duration or future starts',()=>{
    const block={startedAt:new Date('2026-01-30T18:00:00Z'),durationWeeks:1};
    assert.equal(logic.currentWeekInBlock(block,new Date('2026-02-06T17:59:59Z')),1);
    assert.equal(logic.currentWeekInBlock(block,new Date('2026-02-06T18:00:00Z')),2);
    assert.equal(logic.currentWeekInBlock(block,new Date('2026-01-30T17:59:59Z')),0);
    assert.equal(logic.currentWeekInBlock({startedAt:null},new Date(0)),null);
});
test('5.1 newest started block has priority regardless of duration; ties choose first',()=>{
    const a={startedAt:new Date('2026-01-01Z'),phase:'custom',durationWeeks:1};
    const b={startedAt:new Date('2026-02-01Z'),phase:'accumulation'};
    assert.equal(logic.getActiveBlock([a,b,{startedAt:null}]),b);
    assert.equal(logic.getActiveBlock([a,{...a}]),a);
    assert.equal(logic.getRoutinePhaseStatus({blocks:[a],adaptiveDeloadUntil:new Date('2099-01-01Z')}).phase,'custom');
    assert.equal(logic.getRoutinePhaseStatus({blocks:[],adaptiveDeloadUntil:new Date('2000-01-01Z')}).phase,null);
});
test('5.1 goal regression handles constant x, constant strength and exact linear trend',()=>{
    assert.deepEqual(regression([]),{slope:0,r2:0});
    assert.deepEqual(regression([{x:0,y:10},{x:0,y:20}]),{slope:0,r2:0});
    assert.deepEqual(regression([{x:0,y:10},{x:1,y:10}]),{slope:0,r2:0});
    assert.deepEqual(regression([{x:0,y:10},{x:1,y:12},{x:2,y:14}]),{slope:2,r2:1});
});
test('5.1 goal plan grid, frequency argument and invalid gap preserve current semantics',()=>{
    assert.deepEqual(plan(100,99,1,1),[]);assert.deepEqual(plan(100,110,0,1),[]);
    const a=plan(100,110,1,1,1),b=plan(100,110,1,1,7);
    assert.deepEqual(a,b);assert.equal(a.length,11);assert(a.every(w=>w.weight%5===0));
    assert.equal(a.at(-1).phase,'¡SEMANA DE TEST!');assert.equal(a.at(-1).weight,110);
});
test('5.1 goal target eligibility filters distant reps and keeps last three eligible days',()=>{
    const input=[{sets:[{weight:100,reps:7},{weight:115,reps:1}]},{sets:[{weight:120,reps:8}]}];
    assert.equal(clientHistory.bestOneRepMaxForTarget(input,1,3),115);
    assert.equal(serverHistory.bestOneRepMaxForTarget(input,1,3),115);
    assert.equal(clientHistory.bestOneRepMaxForTarget([{sets:[{weight:120,reps:8}]}],1),0);
});
