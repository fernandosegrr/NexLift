import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import * as domain from '../../packages/shared/dist/index.js';
import * as client from '../../client/src/utils/exerciseName.js';
import * as server from '../../server/src/utils/exerciseName.js';
import * as logic from '../../server/src/logic.js';
import * as dates from '../../client/src/utils/dates.js';
import * as oldClient from '../fixtures/phase51/client/exerciseName.js';
import * as oldServer from '../fixtures/phase51/server/exerciseName.js';
import { sourceFunction, trainingRoot as root } from '../lib/training-characterization.mjs';
import { inspectSharedSource } from '../lib/boundaries.mjs';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const cjs = require(path.join(root, 'server/src/generated/training.cjs'));
const fixture = 'scripts/fixtures/phase5complete/';
const golden = JSON.parse(await readFile(path.join(root, fixture, 'golden.json'), 'utf8'));
const oldLogic = {};
for (const name of ['mexicoCityDateStr', 'mexicoCityUtcOffsetMinutes', 'getActiveBlock', 'currentWeekInBlock']) oldLogic[name] = await sourceFunction(fixture + 'logic.reference.txt', name, { APP_TIMEZONE: 'America/Mexico_City' });
oldLogic.detectPlateauForExercise = await sourceFunction(fixture + 'logic.reference.txt', 'detectPlateauForExercise', { ...oldLogic, effectiveWorkoutSet: logic.effectiveWorkoutSet });
oldLogic.mexicoCityDayBounds = await sourceFunction(fixture + 'logic.reference.txt', 'mexicoCityDayBounds', oldLogic);
const oldRegression = await sourceFunction(fixture + 'goal.reference.txt', 'linearRegression');
const oldPdfVolume = await sourceFunction(fixture + 'dayPdf.reference.txt', 'sessionVolume');
const oldReportVolume = await sourceFunction(fixture + 'report.reference.txt', 'calculateVolume');
const makeLogs = values => values.map((weight, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1, 18)), sets: [{ weight, reps: 1, rpe: 8 }] }));
const actualPdfVolume = await sourceFunction('client/src/utils/dayPdf.js', 'sessionVolume', domain);

test('5.4 captured golden corpus retains received plateau/regression/volume/date expectations', () => {
    assert.equal(golden.cases.length, 26);
    for (const row of golden.cases) {
        if (row.kind === 'plateau') {
            assert.deepEqual(domain.detectPlateau(row.values.map(best1RM => ({best1RM}))), row.expected);
            assert.equal(domain.detectPlateauForExercise(makeLogs(row.values)), row.backend);
        } else if (row.kind === 'regression') assert.deepEqual(domain.linearRegression(row.points), row.expected);
        else if (row.kind === 'calendar') {
            const bounds = domain.legacyTrainingDayBounds(new Date(row.iso));
            assert.deepEqual(JSON.parse(JSON.stringify(bounds)), row.legacyBounds);
        } else if (!row.legacyPdf?.nonfinite) assert.equal(domain.trainingLoadVolume(row.sets, 'legacy-pdf-zero-fallback'), row.legacyPdf);
    }
});
test('5.4 plateau explicitly retains backend PR-range and frontend capped-evidence policies', () => {
    const logs = makeLogs([100,100,80,80]); logs[2].sets[0].reps = 37; logs[3].sets[0].reps = 37;
    assert.equal(logic.detectPlateauForExercise(logs), true);
    const groups = client.groupHistoryByExercise(logs.map(l => ({...l, exercise: {name: 'Press'}})));
    assert.equal(client.detectPlateau([...groups.values()][0].sessions).isPlateaued, false);
    assert.equal(cjs.detectPlateauForExercise(logs), oldLogic.detectPlateauForExercise(logs));
});
test('5.4 repeated/unsorted logs collapse by CDMX day without mutating order or evidence', () => {
    const logs = makeLogs([100,100,100,100]);
    logs.push({...logs[0], sets: [{weight: 110, reps: 1}]}); logs.reverse();
    const before = structuredClone(logs);
    assert.equal(domain.detectPlateauForExercise(logs), oldLogic.detectPlateauForExercise(logs));
    assert.equal(domain.detectPlateauForExercise(logs), true); assert.deepEqual(logs, before);
    assert.equal(domain.detectPlateauForExercise(logs.slice(0,3)), false);
});
test('5.4 exact 4/5/6 session windows retain ties, recent progress and discarded ancient peaks', () => {
    for (const values of [[100,100,100],[100,100,100,100],[100,100,100,100,101],[100,100,100,100,100,101],[999,100,100,100,100,100,101]]) {
        const sessions = values.map(best1RM => ({best1RM}));
        for (const api of [domain, client, server, cjs]) assert.deepEqual(api.detectPlateau(sessions), oldClient.detectPlateau(sessions));
    }
});
test('5.4 zero-work and incomplete days remain compatibility signals and are never labelled measured fatigue', () => {
    for (const values of [[0,0,0,0],[100,100,100,100]]) {
        const logs = makeLogs(values).map(l => ({...l, sets: l.sets.map(s => ({...s, completed: false}))}));
        assert.equal(domain.detectPlateauForExercise(logs), true);
        assert.equal(domain.detectPlateauForExercise(logs), oldLogic.detectPlateauForExercise(logs));
    }
});
test('5.4 plateau weak-side minima preserve zero/partial sides and do not adjust scores for effort', () => {
    for (const extra of [{weightRight:80,repsRight:1},{weightRight:0,repsRight:0},{weightRight:60},{repsRight:0},{rpe:0},{rpe:10},{rir:4}]) {
        const logs = makeLogs([100,100,100,100]).map(l => ({...l,sets:l.sets.map(s=>({...s,...extra}))}));
        assert.equal(domain.detectPlateauForExercise(logs), oldLogic.detectPlateauForExercise(logs));
    }
});
test('5.4 exercise identity has one source and preserves variants/equipment distinctions', () => {
    const names = [null,undefined,'','A1. Press de banca','Press banca','Elevaciones laterales (hombros)','elev. lat.','Curl martillo (bíceps)','Press inclinado (mancuernas)','Press inclinado (hammer o smith)','Dominadas y remo'];
    for (const name of names) for (const api of [domain,client,server,cjs]) {
        assert.equal(api.normalizeExerciseName(name),oldClient.normalizeExerciseName(name));
        assert.equal(api.canonicalExerciseKey(name),oldServer.canonicalExerciseKey(name));
    }
    assert.notEqual(domain.canonicalExerciseKey(names.at(-3)), domain.canonicalExerciseKey(names.at(-2)));
});
test('5.4 history canonical grouping preserves coercion, sides, complete sets and selected names/muscle', () => {
    const history = [{date:'2026-01-01T18:00:00Z',exercise:{name:'Press de banca',muscleGroup:'Pecho'},sets:[{weight:'80.5kg',reps:'10.9',weightRight:'70',repsRight:8}]},
        {date:'2026-01-02T18:00:00Z',exercise:{name:'Press banca'},sets:[{weight:90,reps:1},{weight:80,reps:37,completed:false}]}, {date:'bad',sets:[]}];
    for (const [actual, old] of [[client,oldClient],[server,oldServer]]) assert.deepEqual(actual.groupHistoryByExercise(history),old.groupHistoryByExercise(history));
});
test('5.4 legacy goal calendar remains explicit while CDMX grouping is selectable independently', () => {
    const input=[{date:'2026-10-19T05:30:00Z',exercise:{name:'Press'},sets:[{weight:80,reps:10}]}];
    assert.deepEqual(client.groupHistoryByExercise(input),oldClient.groupHistoryByExercise(input));
    assert.equal([...client.groupHistoryByExercise(input,{calendarPolicy:'cdmx-civil'}).values()][0].sessions[0].date,'2026-10-18');
    assert.throws(()=>client.groupHistoryByExercise(input,{calendarPolicy:'invented'}),RangeError);
});
test('5.4 recent/target evidence preserves last eligible sessions and excludes distant-rep extrapolation', () => {
    const sessions=[{sets:[{weight:115,reps:1},{weight:100,reps:7}],best1RM:123},{sets:[{weight:200,reps:12}],best1RM:280},{weight:116,reps:1,best1RM:116}];
    for(const api of [domain,client,server,cjs]) for(const n of [0,1,3,5]) {
        assert.equal(api.best1RMRecent(sessions,n),oldClient.best1RMRecent(sessions,n));
        for(const target of [1,5,10,37]) assert.equal(api.bestOneRepMaxForTarget(sessions,target,n),oldServer.bestOneRepMaxForTarget(sessions,target,n));
    }
});
test('5.4 regression retains sample-index slope, degenerate variance and exact negative/curved trends',()=>{
    for(const points of [[],[{x:1,y:1}],[{x:0,y:1},{x:0,y:2}],[{x:0,y:12},{x:1,y:10},{x:2,y:8}],Array.from({length:120},(_,x)=>({x,y:100+Math.sin(x)*3}))]) {
        assert.deepEqual(domain.linearRegression(points),oldRegression(points)); assert.deepEqual(cjs.linearRegression(points),oldRegression(points));
    }
});
test('5.4 blocks preserve newest-start/ties/future dates and elapsed weeks across year/DST/long absence',()=>{
    const a={phase:'custom',startedAt:new Date('2025-12-28T18:00:00Z'),durationWeeks:1},b={...a,phase:'intensification',startedAt:new Date('2026-01-04T18:00:00Z')};
    for(const blocks of [null,[],[a,b],[a,{...a}],[b,a,{phase:'deload',startedAt:null}]]) assert.equal(domain.getActiveTrainingBlock(blocks),oldLogic.getActiveBlock(blocks));
    for(const iso of ['2025-12-28T17:59:59Z','2026-01-04T17:59:59Z','2026-01-04T18:00:00Z','2027-04-04T18:00:00Z'])assert.equal(domain.elapsedWeekInBlock(a,new Date(iso)),oldLogic.currentWeekInBlock(a,new Date(iso)));
    assert.equal(domain.elapsedWeekInBlock({phase:'custom',startedAt:null},new Date(0)),null);
});
test('5.4 phase priority and strict adaptive expiry keep duration informational with explicit now',()=>{
    const now=new Date('2026-01-01T00:00:00Z'),block={phase:'accumulation',startedAt:new Date('2020-01-01Z'),durationWeeks:1};
    assert.deepEqual(domain.routinePhaseStatusAt({blocks:[block],adaptiveDeloadUntil:new Date('2099-01-01Z')},now),{isDeload:false,source:'block',phase:'accumulation',block});
    assert.deepEqual(domain.routinePhaseStatusAt({blocks:[],adaptiveDeloadUntil:now},now),{isDeload:false,source:null,phase:null});
    assert.equal(domain.routinePhaseStatusAt({adaptiveDeloadUntil:new Date(now.getTime()+1)},now).source,'adaptive');
});
test('5.4 load policies separate recorded sides, left-only, missing-right inheritance and the PDF defect',()=>{
    const zeros=[{weight:80,reps:10,weightRight:0,repsRight:0}],partial=[{weight:80,reps:10,weightRight:60}];
    assert.equal(domain.trainingLoadVolume(zeros,'inherit-missing-right'),800);assert.equal(domain.trainingLoadVolume(zeros,'legacy-pdf-zero-fallback'),1600);
    assert.equal(domain.trainingLoadVolume(partial,'recorded-sides'),800);assert.equal(domain.trainingLoadVolume(partial,'inherit-missing-right'),1400);
    assert.equal(domain.trainingLoadVolume(partial,'left-only'),800);assert.equal(actualPdfVolume({sets:zeros}),800);
    assert.equal(oldPdfVolume({sets:zeros}),1600);assert.equal(actualPdfVolume({sets:partial}),1400);
});
test('5.4 volume fold retains floating-point addition order across sessions and counts rows independently',()=>{
    const sessions=[{sets:[{weight:1e16,reps:1,weightRight:1,repsRight:1},{weight:-1e16,reps:1}]},{sets:[{weight:.1,reps:3,completed:false}]},{sets:null}];
    assert.deepEqual(domain.trainingSessionLoadSummary(sessions),oldReportVolume(sessions));
    assert.equal(domain.trainingSessionLoadSummary(sessions).sets,3);
    assert.equal(domain.trainingLoadVolume(sessions[0].sets,'recorded-sides'),sessions[0].sets.reduce((a,s)=>a+(s.weight||0)*(s.reps||0)+(s.weightRight||0)*(s.repsRight||0),0));
});
test('5.4 both actual PDF consumers and export summary delegate to explicit shared volume policies',async()=>{
    const session=await readFile(path.join(root,'client/src/utils/sessionPdf.js'),'utf8');
    assert.match(session,/const volume = trainingLoadVolume\(sets, 'inherit-missing-right'\)/);assert(!session.includes('volume +='));
    const calculate=await sourceFunction('client/src/pages/ExportReport.jsx','calculateVolume',domain);
    const input=[{sets:[{weight:80,reps:10,weightRight:0,repsRight:0}]}];assert.deepEqual(calculate(input),{volume:800,sets:1});
});
test('5.4 corrected CDMX civil bounds reproduce both 2021 DST defects with 23/25-hour days',()=>{
    for(const [iso,start,end,hours] of [['2021-04-04T12:00:00Z','2021-04-04T06:00:00.000Z','2021-04-05T05:00:00.000Z',23],['2021-10-31T12:00:00Z','2021-10-31T05:00:00.000Z','2021-11-01T06:00:00.000Z',25]]) {
        const corrected=domain.trainingCivilDayBounds(iso),legacy=oldLogic.mexicoCityDayBounds(new Date(iso));
        assert.equal(corrected.start.toISOString(),start);assert.equal(corrected.end.toISOString(),end);assert.equal((corrected.end-corrected.start)/3600000,hours);
        assert.notDeepEqual(corrected,legacy);assert.deepEqual(logic.mexicoCityDayBounds(new Date(iso)),legacy);
        assert.equal(domain.trainingCivilDate(corrected.start),corrected.dateStr);assert.equal(domain.trainingCivilDate(new Date(corrected.end-1)),corrected.dateStr);
    }
});
test('5.4 actual frontend civil-day iteration fixes DST duplicate/missing keys without altering instants',async()=>{
    const old=await sourceFunction(fixture+'dates.reference.txt','mexicoCityLastNDays',{mexicoCityDateStr:domain.trainingCivilDate});
    const anchor='2021-04-05T05:30:00Z';assert.deepEqual(dates.mexicoCityLastNDays(3,anchor),['2021-04-03','2021-04-04','2021-04-05']);
    assert.notDeepEqual(old(3,anchor),dates.mexicoCityLastNDays(3,anchor));
    for(const iso of ['2021-10-31T05:30:00Z','2026-01-01T05:59:59Z','2026-03-01T12:00:00Z']){
        const days=dates.mexicoCityLastNDays(400,iso);assert.equal(new Set(days).size,400);assert.equal(days.at(-1),domain.trainingCivilDate(iso));
    }
});
test('5.4 Monday/Sunday and month/year civil shifts have explicit calendar meaning',()=>{
    assert.deepEqual(domain.trainingCivilWeek('2026-01-04T18:00:00Z'),{startDay:'2025-12-29',endDayExclusive:'2026-01-05'});
    assert.equal(domain.shiftTrainingCivilDate('2024-03-01',-1),'2024-02-29');assert.equal(domain.shiftTrainingCivilDate('2026-01-01',-1),'2025-12-31');
    assert.throws(()=>domain.shiftTrainingCivilDate('2026-02-30',1),RangeError);assert.throws(()=>domain.lastTrainingCivilDays(Infinity,new Date(0)),RangeError);
});
test('5.4 corrected civil analytics are identical under UTC, CDMX, Tokyo and Los Angeles',()=>{
    const url=pathToFileURL(path.join(root,'packages/shared/dist/index.js')).href;
    const code=`import * as d from ${JSON.stringify(url)};console.log(JSON.stringify({bounds:d.trainingCivilDayBounds('2021-04-04T12:00:00Z'),week:d.trainingCivilWeek('2026-01-04T18:00:00Z'),days:d.lastTrainingCivilDays(3,'2021-04-05T05:30:00Z')}));`;
    const outputs=['UTC','America/Mexico_City','Asia/Tokyo','America/Los_Angeles'].map(TZ=>{const r=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ},windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);});
    for(const result of outputs)assert.deepEqual(result,outputs[0]);
});
test('5.4 frozen history, sets, routines and observations are never mutated by the integrated engine',()=>{
    const row=Object.freeze({weight:100,reps:10,rpe:8,weightRight:80,repsRight:8,completed:false});
    const logs=Object.freeze(makeLogs([100,100,100,100]).map(l=>Object.freeze({...l,sets:Object.freeze([row])}))),before=structuredClone(logs);
    domain.detectPlateauForExercise(logs);domain.trainingLoadVolume(logs[0].sets,'recorded-sides');domain.computeWorkoutSuggestion(logs,'8-12',2.5);
    domain.selectHistoricalPersonalRecord(logs);domain.linearRegression(Object.freeze([Object.freeze({x:0,y:1}),Object.freeze({x:1,y:2})]));assert.deepEqual(logs,before);
});
test('5.4 seeded valid histories remain exact against received plateau/history/volume/regression implementations',()=>{
    let seed=0x5455;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<160;i++){
        const logs=makeLogs(Array.from({length:Math.floor(random()*30)},()=>Math.floor(random()*200))).map(l=>({...l,exercise:{name:'Press banca'},sets:[{weight:l.sets[0].weight,reps:1+Math.floor(random()*50),rpe:Math.floor(random()*11),weightRight:Math.floor(random()*100),repsRight:Math.floor(random()*15),completed:random()>.5}]}));
        assert.equal(domain.detectPlateauForExercise(logs),oldLogic.detectPlateauForExercise(logs));assert.deepEqual(client.groupHistoryByExercise(logs),oldClient.groupHistoryByExercise(logs));
        assert.deepEqual(domain.trainingSessionLoadSummary(logs),oldReportVolume(logs));
        const points=logs.map((l,x)=>({x,y:l.sets[0].weight}));assert.deepEqual(domain.linearRegression(points),oldRegression(points));
    }
});
test('5.5 complete pipeline distinguishes PR strongest side, Smart weakest side, plateau and phase/volume',()=>{
    const logs=makeLogs([100,100,100,100]).map(l=>({...l,sets:[{weight:100,reps:12,rpe:9,weightRight:80,repsRight:8}]}));
    const pr=domain.selectHistoricalPersonalRecord(logs),suggestion=domain.computeWorkoutSuggestion(logs,'8-12',2.5,'intensification');
    assert.equal(pr.weight,100);assert.equal(suggestion.weight,82.5);assert.equal(suggestion.reps,4);assert.equal(domain.detectPlateauForExercise(logs),true);
    assert.equal(domain.trainingLoadVolume(logs[0].sets,'recorded-sides'),1840);assert.equal(domain.storedRpeToFormRir(logs[0].sets[0].rpe),1);
    const status=domain.routinePhaseStatusAt({blocks:[{phase:'intensification',startedAt:new Date('2025-01-01Z'),durationWeeks:4}]},new Date('2026-01-01Z'));assert.equal(status.phase,'intensification');
});
test('5.5 strict analysis fixtures reject eight invalid policy/clock/mutation/metric boundaries',()=>{
    const configFile=path.join(root,'packages/shared/tsconfig.json'),config=ts.readConfigFile(configFile,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(configFile),undefined,configFile);
    const file=path.join(root,'packages/shared/test/fixtures/analysis.ts'),host=ts.createCompilerHost(parsed.options),read=host.readFile.bind(host);
    assert(parsed.options.strict);assert.equal(ts.getPreEmitDiagnostics(ts.createProgram([file],parsed.options,host)).length,0);
    host.readFile=name=>path.resolve(name)===file?read(name).replaceAll('@ts-expect-error','expected error'):read(name);
    const errors=ts.getPreEmitDiagnostics(ts.createProgram([file],parsed.options,host));assert.equal(errors.length,8);assert(errors.every(d=>path.resolve(d.file.fileName)===file));
});
test('5.5 analysis modules are pure, strict and acyclic and generated runtime has no platform imports',async()=>{
    const directory=path.join(root,'packages/shared/src/domain/training'),files=(await readdir(directory)).filter(f=>f.endsWith('.ts')),graph=new Map();
    for(const file of files){const source=await readFile(path.join(directory,file),'utf8');assert.deepEqual(inspectSharedSource(source,path.join(directory,file),path.join(root,'packages/shared/src')),[]);
        const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);graph.set(file,ast.statements.filter(ts.isImportDeclaration).map(n=>n.moduleSpecifier.text.replace('.js','.ts').replace('./','')).filter(n=>files.includes(n)));
        const scan=n=>{assert(n.kind!==ts.SyntaxKind.AnyKeyword);assert(!ts.isAsExpression(n)||n.type.getText(ast)==='const');if(ts.isNewExpression(n)&&n.expression.getText(ast)==='Date')assert(n.arguments?.length);ts.forEachChild(n,scan);};scan(ast);
    }
    function visit(name,stack=[]){assert(!stack.includes(name),'circular '+[...stack,name].join(' -> '));for(const next of graph.get(name)||[])visit(next,[...stack,name]);}for(const name of graph.keys())visit(name);
});
test('5.5 shared/client/server ESM/CJS ports work with native TypeScript stripping disabled',()=>{
    const run=spawnSync(process.execPath,['--no-experimental-strip-types','--input-type=module','-e',"import {detectPlateauForExercise,trainingLoadVolume} from './server/src/generated/training.cjs';import {canonicalExerciseKey} from './client/src/utils/exerciseName.js';if(detectPlateauForExercise([])!==false||trainingLoadVolume([{weight:80,reps:10,weightRight:0,repsRight:0}],'inherit-missing-right')!==800||canonicalExerciseKey('Press de banca')!=='press banca')process.exit(1)"],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);
});
test('5.5 received reference snapshots retain their independently captured hashes',async()=>{
    const hashes=JSON.parse(await readFile(path.join(root,fixture,'hashes.json'),'utf8'));
    for(const [name,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(path.join(root,fixture,name))).digest('hex'),hash);
});
test('5.5 every nonselected logic function and the reversible route edit remain byte-exact',async()=>{
    const proof=JSON.parse(await readFile(path.join(root,fixture,'logic-port.json'),'utf8')),current=await readFile(path.join(root,'server/src/logic.js'),'utf8'),ast=ts.createSourceFile('logic.js',current,ts.ScriptTarget.Latest,true);
    for(const row of proof.originalFunctions)assert.equal(ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===row.name)?.getText(ast),row.after,row.name);
    assert.equal(proof.originalFunctions.filter(r=>r.before!==r.after).length,8);
});
test('5.5 synthetic performance measures empty/short/500-session/5000-set discontinuous unilateral histories',()=>{
    const measurements=[];
    for(const sessions of [0,10,100,500]){
        const history=Array.from({length:sessions},(_,i)=>({date:new Date(Date.UTC(2020,0,1+i*3,18)),exercise:{name:'Synthetic press'},sets:Array.from({length:10},(_,j)=>({weight:80+j,reps:8+j%4,rpe:8,weightRight:75+j,repsRight:8,completed:j%3!==0}))}));
        const before=structuredClone(history),row={sessions,sets:sessions*10,iterations:3,oldMs:[],sharedMs:[]};
        for(let round=0;round<3;round++)for(const [key,api]of [['oldMs',oldLogic],['sharedMs',domain]]){const start=performance.now();for(let i=0;i<3;i++)api.detectPlateauForExercise(history);row[key].push(performance.now()-start);}
        assert.equal(domain.detectPlateauForExercise(history),oldLogic.detectPlateauForExercise(history));assert.deepEqual(history,before);
        const start=performance.now();domain.trainingSessionLoadSummary(history);client.groupHistoryByExercise(history,{calendarPolicy:'cdmx-civil'});domain.computeWorkoutSuggestion(history,'8-12',2.5);row.combinedReadMs=performance.now()-start;measurements.push(row);
    }
    const blocks=Array.from({length:200},(_,i)=>({phase:i%3===0?'deload':'accumulation',startedAt:new Date(Date.UTC(2020,0,1+i*28,18)),durationWeeks:4})),now=new Date('2026-10-21T18:00:00Z');
    const start=performance.now();for(let i=0;i<100;i++){assert.equal(domain.getActiveTrainingBlock(blocks),oldLogic.getActiveBlock(blocks));domain.routinePhaseStatusAt({blocks},now);}
    console.log('Phase5 analysis performance: '+JSON.stringify({measurements,mesocycles:{blocks:200,iterations:100,ms:performance.now()-start},newQueries:0,persistentCache:false}));
});

async function cdp(url){const ws=new WebSocket(url),pending=new Map();let sequence=0;ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});return{close:()=>ws.close(),command:(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));})};}
test('5.5 real Edge/React Progress and both actual jsPDF exports show corrected zero-right volume',async()=>{
    const isolated=await mkdtemp(path.join(await realpath(tmpdir()),'nexlift-analysis-browser-')),profile=path.join(isolated,'owned-profile');await mkdir(profile);
    const processes=createBrowserProcesses({root:isolated,executable:process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium'}),{createServer}=require('vite');
    const vite=await createServer({root:path.join(root,'client'),configFile:path.join(root,'client/vite.config.js'),envFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
    try{await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`,debug=await processes.launch(profile),target=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json(),page=await cdp(target.webSocketDebuggerUrl);
        const evaluate=async expression=>{const r=await page.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
        try{await page.command('Page.navigate',{url:origin+'/test/analysis-harness.html'});await waitForState(()=>evaluate("!!window.analysisReady && document.body.textContent.includes('Volumen esta semana')"),'actual Progress ready');
            assert.equal(await evaluate('window.analysis.syntheticWrites'),0);
            await waitForState(()=>evaluate("document.querySelector('[aria-label=\"Día a exportar\"]')?.value==='2026-10-19'"),'actual day selector ready');
            await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Descargar').click()");
            await waitForState(()=>evaluate('window.analysis.pdfs.length===1'),'actual Progress PDF handler');
            assert.deepEqual(await evaluate('window.analysis.historyRequests'),[[80,{dateFrom:'2026-10-19',dateTo:'2026-10-19'}]]);
            await evaluate('window.analysis.exportSessionPdf()');await waitForState(()=>evaluate('window.analysis.pdfs.length===2'),'real PDFs saved');
            const pdfs=await evaluate('window.analysis.pdfs');for(const pdf of pdfs){assert(pdf.bytes>2000);assert(pdf.pages>=1);assert(pdf.content.includes('800'));assert(!pdf.content.includes('(1.600 kg')&&!pdf.content.includes('(1,600 kg'));}
            await writeFile(path.join(isolated,'pdf-evidence.json'),JSON.stringify({pdfs,launches:processes.launches,actualProgress:true,actualJsPDF:true,productionTouched:false},null,2));
            console.log('Phase5 browser evidence: '+isolated);
        }finally{page.close();}
    }finally{await processes.close();await vite.close();}
});
