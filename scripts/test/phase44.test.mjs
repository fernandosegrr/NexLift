import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as oldRoutine from '../fixtures/phase44/server/src/services/routineImportContract.js';
import * as routine from '../../server/src/services/routineImportContract.js';
import * as oldOperation from '../fixtures/phase44/server/src/services/operationContract.js';
import * as operation from '../../server/src/services/operationContract.js';
import * as oldPayload from '../fixtures/phase44/client/src/utils/routinePayload.js';
import * as payload from '../../client/src/utils/routinePayload.js';
import { operationLabels as previousLabels } from '../fixtures/phase44/operationLabels.js';
import { operationLabels } from '../../client/src/generated/operationLabels.js';
import { decodeRoutineImportResponse } from '../../client/src/generated/routineResponse.js';
import { createBrowserProcesses, waitForState, readBrowserReady } from '../../server/test/fixtures/browser-process.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../client/package.json',import.meta.url));
const {createServer}=require('vite'), React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
const outcome=task=>{try{return {value:task()};}catch(error){return {error:{name:error.name,message:error.message,status:error.status,code:error.code,details:error.details}};}};
test('4.4 browser readiness rejects stale UUIDs and accepts a reused numeric port',async()=>{
    const http=await import('node:http'),profile=await mkdtemp(path.join(tmpdir(),'nexlift-phase44-port-'));
    let browserPath='/devtools/browser/new';
    const server=http.createServer((req,res)=>res.end(JSON.stringify({webSocketDebuggerUrl:`ws://127.0.0.1:${server.address().port}${browserPath}`})));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
        const port=server.address().port;
        await writeFile(path.join(profile,'DevToolsActivePort'),`${port}\n/devtools/browser/stale`);
        assert.equal(await readBrowserReady(profile),false);
        await writeFile(path.join(profile,'DevToolsActivePort'),`${port}\n${browserPath}`);
        assert.equal((await readBrowserReady(profile)).origin,`http://127.0.0.1:${port}`);
        browserPath='/devtools/browser/restarted-same-port';
        assert.equal(await readBrowserReady(profile),false);
        await writeFile(path.join(profile,'DevToolsActivePort'),`${port}\n${browserPath}`);
        assert.equal((await readBrowserReady(profile)).browserPath,browserPath);
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('4.4 browser ownership rejects profiles outside its own test root before spawn',async()=>{
    const isolated=await mkdtemp(path.join(tmpdir(),'nexlift-phase44-scope-'));
    const manager=createBrowserProcesses({root:isolated,executable:'must-never-execute'});
    await assert.rejects(()=>manager.launch(tmpdir()),/Only a profile inside/);
});
test('4.4 backend routine adapter exactly matches received unknown-input failures',()=>{
    for(const input of [undefined,null,false,0,'',[],{}, {name:'R'}, {name:'R',days:[null]}, {name:'R',description:0,days:[]},
        {name:'R',days:[{dayName:'D',exercises:null}]}, {name:'R',days:[{dayName:'D',exercises:[null]}]},
        {name:'R',days:[{dayName:'D',weekday:8}]}, {name:'R',days:[{dayName:'D',isRestDay:true,exercises:[{name:'Remo'}]}]}])
        assert.deepEqual(outcome(()=>routine.normalizeRoutineImport(input)),outcome(()=>oldRoutine.normalizeRoutineImport(input)));
});
test('4.4 routine import and partial edits retain omission, aliases, provenance, Sunday and zeros',()=>{
    for(const editing of [false,true]) for(const days of [[],[{dayName:' Domingo ',weekday:0,id:'d'}],
        [{name:'Lunes',order:'0',exercises:[{id:'e',name:' Remo ',sets:'4',reps:'4 – 6',rest:0}]}],
        [{dayName:'D',exercises:[{id:'e',name:'Remo'}]}], [{dayName:'D',exercises:[{name:'Remo',sets:3,targetSets:4}]}],
        [{dayName:'D',order:0},{dayName:'E',order:0}], [{dayName:'D',weekday:0},{dayName:'E',weekday:0}]]) {
        const original=structuredClone(days);
        assert.deepEqual(outcome(()=>routine.normalizeRoutineDays(days,{editing})),outcome(()=>oldRoutine.normalizeRoutineDays(days,{editing})));
        assert.deepEqual(days,original);
    }
});
test('4.4 operation adapter keeps constructor identity and exact canonical hash',()=>{
    const input={operationId:'12345678-1234-4000-8000-123456789ABC',source:'pwa',kind:'rest.create',performedAt:'2026-10-18T05:59:59.999Z',note:''};
    const parsed=operation.parseOperation(input), old=oldOperation.parseOperation(input);
    assert.deepEqual(parsed,old);assert.equal(operation.requestHash(parsed),oldOperation.requestHash(old));
    for(const bad of [null,{}, {...input,operationId:'wrong'}, {...input,performedAt:'2026-02-30T00:00:00Z'}]) {
        assert.deepEqual(outcome(()=>operation.parseOperation(bad)),outcome(()=>oldOperation.parseOperation(bad)));
        assert.throws(()=>operation.parseOperation(bad),operation.OperationError);
    }
});
test('4.4 session hash preserves ordering, extensions, original dates and null notes',()=>{
    const log={id:'l',exerciseId:'e',date:'2026-10-18T00:59:59-05:00',sets:[{id:'b',setNumber:1,weight:0,rpe:0,completed:false},{id:'a',setNumber:1,weightRight:55,repsRight:8,completed:true}]};
    assert.equal(operation.sessionVersion(log),oldOperation.sessionVersion(log));
});
test('4.4 frontend routine construction is byte-for-byte JSON equivalent with extensions',()=>{
    const input={id:'r',name:' R ',extra:{x:1},days:[{dayName:' Domingo ',weekday:0,id:'d',exercises:[{id:'e',name:' Remo ',restSeconds:'',sets:'0',note:''}]}]};
    const original=structuredClone(input);
    assert.equal(JSON.stringify(payload.buildRoutineFormPayload(input)),JSON.stringify(oldPayload.buildRoutineFormPayload(input)));assert.deepEqual(input,original);
});
test('4.4 templates keep aliases, invalid inputs and missing references without coercion',()=>{
    const catalog=[{id:'e',name:'Remo',muscleGroup:'Espalda',defaultSets:0,restSeconds:0}];
    for(const ref of [{exerciseId:'e'}, {exerciseId:'e',sets:4,rest:0}, {exerciseId:'e',name:'Override',targetReps:'AMRAP'}, {exerciseId:'missing'}]) {
        const template={name:'R',days:[{dayName:'D',weekday:0,exercises:[ref]}]};
        assert.deepEqual(outcome(()=>payload.buildTemplateRoutinePayload(template,catalog)),outcome(()=>oldPayload.buildTemplateRoutinePayload(template,catalog)));
    }
});
test('4.4 presentation vocabulary is the exact existing operation label mapping',()=>assert.deepEqual(operationLabels,previousLabels));
test('4.4 HTTP decoder validates unknown JSON and preserves successful reference/extensions',async()=>{
    const result={routine:{name:'R',description:null,days:[]},extra:true};
    assert.equal(await decodeRoutineImportResponse({json:async()=>result}),result);
    for(const value of [null,{}, {routine:{name:'R',description:null,days:'wrong'}}]) await assert.rejects(()=>decodeRoutineImportResponse({json:async()=>value}),/Respuesta de importación incompatible/);
    const error=new Error('network');await assert.rejects(()=>decodeRoutineImportResponse({json:async()=>{throw error;}}),e=>e===error);
});
test('4.4 strict TSX and backend APIs reject all ten controlled misuses',async()=>{
    const configFile=path.join(root,'client/tsconfig.json'), config=ts.readConfigFile(configFile,ts.sys.readFile);
    const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(configFile),undefined,configFile);
    const viteConfig=(await import(new URL('../../client/vite.config.js',import.meta.url))).default;
    const emit=JSON.parse(viteConfig.esbuild.tsconfigRaw).compilerOptions;
    assert.equal(emit.target,ts.ScriptTarget[parsed.options.target]);
    assert.equal(emit.jsx,'react-jsx');assert.equal(parsed.options.jsx,ts.JsxEmit.ReactJSX);
    assert.equal(emit.verbatimModuleSyntax,parsed.options.verbatimModuleSyntax);
    assert.equal(emit.useDefineForClassFields,parsed.options.useDefineForClassFields ?? parsed.options.target>=ts.ScriptTarget.ES2022);
    assert.equal(parsed.options.strict,true);
    const file=path.join(root,'client/test/phase44-types.fixture.tsx'), host=ts.createCompilerHost(parsed.options), read=host.readFile.bind(host);
    const normal=ts.getPreEmitDiagnostics(ts.createProgram([file],parsed.options,host));
    assert.equal(normal.length,0,ts.formatDiagnosticsWithColorAndContext(normal,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
    host.readFile=name=>path.resolve(name)===file?read(name).replaceAll('@ts-expect-error','expected error'):read(name);
    const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([file],parsed.options,host));
    assert.equal(diagnostics.length,10,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
    assert(diagnostics.every(d=>path.resolve(d.file.fileName)===file));
});
test('4.4 TSX markup matches original JSX for all selected/taken/null states',async()=>{
    const {runInNewContext}=await import('node:vm');
    const load=async file=>{
        const source=await readFile(path.join(root,file),'utf8');
        const code=ts.transpileModule(source,{fileName:file,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
        const module={exports:{}};
        const localRequire=id=>id.endsWith('routineDays')?require(path.join(root,'client/src/utils/routineDays.js')):require(id);
        runInNewContext(code,{module,exports:module.exports,require:localRequire});
        return module.exports.default;
    };
    const New=await load('client/src/components/ui/WeekdayPicker.tsx');
    const Old=await load('scripts/fixtures/phase44/client/src/components/ui/WeekdayPicker.jsx');
    for(const value of [undefined,null,0,1,2,3,4,5,6]) for(const takenBy of [{},{0:'Pierna',1:'Torso'}]) {
        const props={value,takenBy,onChange:()=>{}};
        assert.equal(renderToStaticMarkup(React.createElement(New,props)),renderToStaticMarkup(React.createElement(Old,props)));
    }
});
async function cdp(url) {
    const ws=new WebSocket(url),pending=new Map();let sequence=0;
    ws.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
    ws.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('closed'));}pending.clear();};
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    return {close:()=>ws.close(),command:(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));})};
}
test('4.4 real Edge renders the JSX-to-TSX boundary and preserves click/clear/taken semantics across three restarts',async()=>{
    const parent=await realpath(tmpdir()), isolated=await mkdtemp(path.join(parent,'nexlift-phase44-browser-')),profile=path.join(isolated,'owned-profile');await mkdir(profile);
    const executable=process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium';
    const processes=createBrowserProcesses({root:isolated,executable});
    const vite=await createServer({root:path.join(root,'client'),configFile:path.join(root,'client/vite.config.js'),envFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
    try {
        await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
        for(let i=0;i<3;i++) {
            const debug=await processes.launch(profile),target=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json(),page=await cdp(target.webSocketDebuggerUrl);
            const evaluate=async expression=>{const r=await page.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;};
            try {
                await page.command('Page.navigate',{url:origin+'/test/phase44-harness.html'});
                await waitForState(()=>evaluate("document.querySelectorAll('[role=group] button').length===7"),'seven TSX chips');
                assert.equal(await evaluate("document.querySelector('output').textContent"),'Sin asignar');
                assert.equal(await evaluate("document.querySelector('[aria-label=Lunes]').title"),'Ya asignado a "Torso"');
                await evaluate("document.querySelector('[aria-label=Domingo]').click()");
                await waitForState(()=>evaluate("document.querySelector('output').textContent==='0'&&document.querySelector('[aria-label=Domingo]').getAttribute('aria-pressed')==='true'"),'Sunday selected');
                await evaluate("document.querySelector('[aria-label=Domingo]').click()");
                await waitForState(()=>evaluate("document.querySelector('output').textContent==='Sin asignar'"),'explicit null cleared');
                await evaluate("document.querySelector('[aria-label=Lunes]').click()");
                await waitForState(()=>evaluate("document.querySelector('output').textContent==='1'"),'taken day callback');
            } finally {page.close();await processes.close();}
        }
        await writeFile(path.join(isolated,'evidence.json'),JSON.stringify({launches:processes.launches,tsxClicks:true,productionTouched:false},null,2));
        console.log(`Phase 4.4 browser evidence: ${isolated}`);
    } finally {await processes.close();await vite.close();}
});
