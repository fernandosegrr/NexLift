import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { cappedEpley1RM } from '../../packages/shared/dist/index.js';
import * as client from '../../client/src/utils/exerciseName.js';
import * as server from '../../server/src/utils/exerciseName.js';
import * as oldClient from '../fixtures/phase51/client/exerciseName.js';
import * as oldServer from '../fixtures/phase51/server/exerciseName.js';
import { trainingRoot as root } from '../lib/training-characterization.mjs';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';
const require=createRequire(new URL('../../client/package.json',import.meta.url));
const outcome=task=>{try{return {value:task()};}catch(error){return {error:error.constructor.name};}};

test('5.1 extracted Epley body matches both received implementations after type-only erasure',async()=>{
    const source=await readFile(path.join(root,'packages/shared/src/domain/training/performance.ts'),'utf8');
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const ast=text=>ts.createSourceFile('test.js',text,ts.ScriptTarget.Latest,true);
    const body=text=>ast(text).statements.find(n=>ts.isFunctionDeclaration(n)&&['cappedEpley1RM','epley1RM'].includes(n.name.text)).body.getText().replace(/\s+/g,'');
    for(const target of ['client','server']) {
        assert.equal(body(js),body(await readFile(path.join(root,`scripts/fixtures/phase51/${target}/exerciseName.js`),'utf8')));
        const current=await readFile(path.join(root,`${target}/src/utils/exerciseName.js`),'utf8');
        assert(!current.includes('function epley1RM('));assert(current.includes('../generated/training.'));
    }
});
test('5.1 all delivered ports exactly match legacy outcomes over coercion and IEEE-754 boundaries',()=>{
    const inputs=[undefined,null,'','0','80.25','junk','10junk',0,-0,-1,0.5,1,2,10.5,36,36.0000001,37,1000,2000,NaN,Infinity,-Infinity,true,false,[],[80],{},Symbol('synthetic')];
    for(const w of inputs) for(const r of inputs) {
        const expected=outcome(()=>oldClient.epley1RM(w,r));
        for(const fn of [oldServer.epley1RM,cappedEpley1RM,client.epley1RM,server.epley1RM]) assert.deepEqual(outcome(()=>fn(w,r)),expected);
    }
});
test('5.1 capped Epley properties hold on valid API-domain inputs with exact deterministic comparisons',()=>{
    let seed=0x51a1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<2000;i++) {
        const weight=Math.round(random()*200000)/100,reps=1+Math.floor(random()*1000);
        const result=cappedEpley1RM(weight,reps);
        assert(Number.isFinite(result)&&result>=0);assert.equal(result,cappedEpley1RM(weight,reps));
        assert.equal(result,oldClient.epley1RM(weight,reps));
        assert(cappedEpley1RM(weight+0.25,reps)>=result);
        assert(cappedEpley1RM(weight,reps+1)>=result);
        if(reps>36) assert.equal(result,cappedEpley1RM(weight,36));
    }
});
test('5.1 migrated history and goal evidence pipelines retain unilateral values, ordering and names',()=>{
    const input=[{date:'2026-10-01T18:00:00Z',exercise:{name:'Press de banca',muscleGroup:'Pecho'},sets:[{weight:80,reps:37},{weight:85,reps:1,weightRight:75,repsRight:2}]},
        {date:'2026-10-03T18:00:00Z',exercise:{name:'Press banca'},sets:[{weight:90,reps:2}]}];
    const before=structuredClone(input);
    for(const [actual,old] of [[client,oldClient],[server,oldServer]]) {
        assert.deepEqual(actual.groupHistoryByExercise(input),old.groupHistoryByExercise(input));
        const history=[...actual.groupHistoryByExercise(input).values()][0].sessions;
        for(const target of [1,5,10,37]) assert.equal(actual.bestOneRepMaxForTarget(history,target,3),old.bestOneRepMaxForTarget(history,target,3));
    }
    assert.deepEqual(input,before);
});
test('5.1 compiled client ESM/server CJS run with native TypeScript stripping disabled and no runtime shared imports',async()=>{
    const cjs=require(path.join(root,'server/src/generated/training.cjs'));
    assert.equal(cjs.cappedEpley1RM(80,10),cappedEpley1RM(80,10));
    for(const relative of ['client/src/generated/training.js','server/src/generated/training.cjs']) {
        const source=await readFile(path.join(root,relative),'utf8');
        const ast=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true);
        assert(!ast.statements.some(ts.isImportDeclaration));assert(!source.includes('require("@nexlift/shared")'));
    }
    const run=spawnSync(process.execPath,['--no-experimental-strip-types','--input-type=module','-e',
        "import {epley1RM} from './server/src/utils/exerciseName.js';if(epley1RM(80,37)!==176)process.exit(1)"],{cwd:root,encoding:'utf8',windowsHide:true});
    assert.equal(run.status,0,run.stderr);
});
test('5.1 generated maps point to exact source bytes and declarations are actually emitted',async()=>{
    for(const file of ['client/src/generated/training.js','server/src/generated/training.cjs']) {
        const source=await readFile(path.join(root,file),'utf8');
        const map=JSON.parse(Buffer.from(source.match(/base64,([^\s]+)/)[1],'base64').toString('utf8'));
        assert(map.sources.some(s=>s.endsWith('/domain/training/performance.js')));
        for(let i=0;i<map.sources.length;i++) {
            assert(!path.isAbsolute(map.sources[i]));
            assert.equal(map.sourcesContent[i],await readFile(path.resolve(root,path.dirname(file),map.sources[i]),'utf8'));
            // The package export resolves tsc's ESM distribution. Verify its
            // second map hop reaches the exact strict TypeScript source too.
            const emitted=path.resolve(root,path.dirname(file),map.sources[i]);
            const upstream=JSON.parse(await readFile(emitted+'.map','utf8'));
            for(let j=0;j<upstream.sources.length;j++) assert.equal(upstream.sourcesContent[j],await readFile(path.resolve(path.dirname(emitted),upstream.sources[j]),'utf8'));
        }
    }
    assert.match(await readFile(path.join(root,'packages/shared/dist/domain/training/performance.d.ts'),'utf8'),/cappedEpley1RM\(weight: unknown, reps: unknown\): number/);
    for(const target of ['client','server']) assert.match(await readFile(path.join(root,target,'build/domain/training.d.ts'),'utf8'),/cappedEpley1RM/);
});
test('5.1 strict compiler rejects four controlled training contract misuses',()=>{
    const configFile=path.join(root,'packages/shared/tsconfig.json');
    const config=ts.readConfigFile(configFile,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(configFile),undefined,configFile);
    assert.equal(parsed.options.strict,true);
    const file=path.join(root,'packages/shared/test/fixtures/training.ts'),host=ts.createCompilerHost(parsed.options),read=host.readFile.bind(host);
    assert(parsed.fileNames.some(name=>path.resolve(name)===file));
    assert.equal(ts.getPreEmitDiagnostics(ts.createProgram([file],parsed.options,host)).length,0);
    host.readFile=name=>path.resolve(name)===file?read(name).replaceAll('@ts-expect-error','expected error'):read(name);
    const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([file],parsed.options,host));
    assert.equal(diagnostics.length,4);assert(diagnostics.every(d=>path.resolve(d.file.fileName)===file));
});
async function cdp(url) {
    const ws=new WebSocket(url),pending=new Map();let sequence=0;
    ws.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
    ws.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('closed'));}pending.clear();};
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    return {close:()=>ws.close(),command:(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));})};
}
test('5.1 real Edge React consumer imports shared calculation through the existing history/goal modules',async()=>{
    const parent=await realpath(tmpdir()),isolated=await mkdtemp(path.join(parent,'nexlift-phase51-browser-')),profile=path.join(isolated,'owned-profile');await mkdir(profile);
    const executable=process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium';
    const processes=createBrowserProcesses({root:isolated,executable});const {createServer}=require('vite');
    const vite=await createServer({root:path.join(root,'client'),configFile:path.join(root,'client/vite.config.js'),envFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
    try {
        await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
        const debug=await processes.launch(profile),target=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json(),page=await cdp(target.webSocketDebuggerUrl);
        const evaluate=async expression=>{const r=await page.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;};
        try {
            await page.command('Page.navigate',{url:origin+'/test/phase51-harness.html'});
            await waitForState(()=>evaluate("document.querySelector('#estimate')?.textContent==='106.66666666666666'"),'shared estimate rendered');
            assert.equal(await evaluate("document.querySelector('#goal').textContent"),'100');
            await evaluate("document.querySelector('button').click()");
            await waitForState(()=>evaluate("document.querySelector('#estimate').textContent==='176'&&document.querySelector('#history').textContent==='176'"),'high reps capped');
            await evaluate("document.querySelectorAll('button')[1].click()");
            await waitForState(()=>evaluate("document.querySelector('#estimate').textContent==='80'"),'single unchanged');
        } finally {page.close();}
        await writeFile(path.join(isolated,'evidence.json'),JSON.stringify({launches:processes.launches,sharedReactConsumer:true,productionTouched:false},null,2));
        console.log(`Phase 5.1 browser evidence: ${isolated}`);
    } finally {await processes.close();await vite.close();}
});
