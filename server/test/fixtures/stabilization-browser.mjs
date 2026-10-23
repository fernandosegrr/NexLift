import { createBrowserProcesses } from './browser-process.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { fileURLToPath } from 'node:url';

async function until(task, label, timeoutMs = 15000) {
    let error;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try { const value = await task(); if (value) return value; } catch (cause) { error = cause; }
        await delay(100);
    }
    throw new Error(`Browser timeout: ${label}`, { cause: error });
}

export async function runStabilizationBrowser({ root, backend, tokenA, tokenB, expiredToken, revokedToken, counts, t, db, fault, restart, postgres }) {
    const { build } = await import('../../../client/node_modules/vite/dist/node/index.js');
    const react = (await import('../../../client/node_modules/@vitejs/plugin-react/dist/index.js')).default;
    const tailwind = (await import('../../../client/node_modules/@tailwindcss/vite/dist/index.mjs')).default;
    // NODE_ENV=test previously selected development React + StrictMode effect
    // replay while this fixture forced PROD/SW=true. Keep Vite's JSX transform
    // and React's runtime consistently production, restoring the test process.
    async function productionBuild(config) {
        const previous = process.env.NODE_ENV;
        try { process.env.NODE_ENV = 'production'; return await build(config); }
        finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
    }
    const clientRoot=fileURLToPath(new URL('../../../client/',import.meta.url)), dist=path.join(root,'built-client');
    await productionBuild({configFile:false,envFile:false,root:clientRoot,plugins:[react(),tailwind()],logLevel:'silent',
        define:{'process.env.NODE_ENV':'"production"','import.meta.env.VITE_INDEXEDDB_ENABLED':'"true"','import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED':'"true"',
            'import.meta.env.VITE_CONFLICT_RESOLUTION_ENABLED':'"true"','import.meta.env.VITE_API_URL':'"/api"','import.meta.env.PROD':'true'},
        build:{outDir:dist,emptyOutDir:false,manifest:true,rollupOptions:{input:{app:path.join(clientRoot,'index.html'),test:path.join(clientRoot,'test/stabilization-harness.html')}}}});
    const manifest=JSON.parse(await readFile(path.join(dist,'.vite/manifest.json'),'utf8'));
    let bridge='/'+manifest['test/stabilization-harness.html'].file;
    let apiOffline=false, release=1, oldMode=false; const requests=[];
    const oldDist=path.join(root,'built-client-v2');
    const host=express();
    host.use('/api',(req,res)=>{
        const entry={method:req.method,path:req.originalUrl};requests.push(entry);
        if(req.method==='POST'&&req.originalUrl==='/api/v1/workout-operations'){
            const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{try{entry.operationId=JSON.parse(Buffer.concat(chunks)).operationId;}catch{/* malformed body remains evidence */}});
        }
        if(apiOffline){res.destroy();return;}
        const target=new URL(req.originalUrl,backend);
        const upstream=http.request(target,{method:req.method,headers:req.headers},response=>{
            res.writeHead(response.statusCode,response.headers); response.pipe(res);
        });upstream.on('error',()=>res.destroy());req.pipe(upstream);
    });
    host.get('/sw.js',async(req,res)=>res.set('Cache-Control','no-store').type('js').send((await readFile(path.join(clientRoot,'public/sw.js'),'utf8')).replace(/const VERSION = '[^']+';/,`const VERSION = 'v35-isolated-${release}';`)));
    host.use((req,res,next)=>{if(oldMode&&!req.path.startsWith('/assets/'))res.sendFile(path.join(oldDist,'index.html'));else next();});
    host.use(express.static(dist));host.use(express.static(oldDist));host.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')));
    const server=await new Promise(resolve=>{const value=host.listen(0,'127.0.0.1',()=>resolve(value));});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const executable='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    assert(existsSync(executable),'Real Edge required');
    const processes=createBrowserProcesses({root,executable});
    const pages=[],profile=path.join(root,'phase35-browser');await mkdir(profile);
    let debugging;
    const launch=(directory=profile)=>processes.launch(directory);
    async function page({route='/workout/A-RoutineDay',debug=debugging,owner='A',token=tokenA}={}){
        const target=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();
        const connection=await cdp(target.webSocketDebuggerUrl);pages.push(connection);
        await connection.command('Page.enable');await connection.command('Network.enable');
        await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: "window.__phase8Events=[];for(const event of ['online','offline','pageshow','focus','pagehide'])window.addEventListener(event,()=>window.__phase8Events.push({event,online:navigator.onLine,route:location.pathname,at:performance.now()}));" });
        await connection.command('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(origin)}){if(!localStorage.getItem('nexlift_token')){localStorage.setItem('nexlift_token',${JSON.stringify(token)});localStorage.setItem('nexlift_user',JSON.stringify({id:${JSON.stringify(owner)},username:${JSON.stringify(owner)}}));}}`});
        await connection.command('Page.navigate',{url:origin+route});
        await until(()=>connection.evaluate(`document.readyState==='complete'`),'document');
        if (!route.includes('/test/')) await until(()=>connection.evaluate(`!!navigator.serviceWorker.controller`),'real SW control');
        await until(()=>connection.evaluate(`import(${JSON.stringify(bridge)}).then(()=>true)`),'compiled bridge after navigation');
        return {...connection,targetId:target.id};
    }
    const attach=connection=>until(()=>connection.evaluate(`import(${JSON.stringify(bridge)}).then(()=>true)`),'compiled bridge attached');
    const state=connection=>connection.evaluate(`phase35.state()`);
    async function verified(connection){
        await until(()=>connection.evaluate(`!!document.querySelector('main')&&!!document.querySelector('[aria-label="Serie 1 peso"]')`),'Workout form');
        await until(()=>connection.evaluate(`(async()=>{const r=phase35.operationRuntime(),s=r.transport.snapshot();return s&&await r.transport.bound(s);})()`),'verified account');
    }
    async function saveForm(connection,weight=91){
        for(let i=1;i<=2;i++){
            await connection.evaluate(`phase35.input('[aria-label="Serie ${i} peso"]',${weight+i});true`);
            await connection.evaluate(`phase35.input('[aria-label="Serie ${i} reps"]',8);true`);
            await connection.evaluate(`document.querySelectorAll('[aria-label="RIR 2"]')[${i-1}].click();true`);
            await connection.evaluate(`document.querySelector('[aria-label="Marcar serie ${i} completada"]').click();true`);
        }
        await connection.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Guardar y finalizar').click();true`);
    }
    // Test-only observation. Original actions, assertions and timeouts remain
    // unchanged. Emit before runner cleanup removes its own disposable root.
    const diagnose=async name=>{
        const expression=`(async()=>({ready:document.readyState,route:location.pathname,
            online:navigator.onLine,navigation:performance.getEntriesByType('navigation')[0]?.type,visibility:document.visibilityState,body:document.body.textContent.slice(0,2000),
            events:window.__phase8Events||[],locks:await navigator.locks.query(),
            leases:typeof phase35==='undefined'?[]:await phase35.getStorageRuntime().db.leases.toArray(),
            fields:[...document.querySelectorAll('input[type="number"]')].map(e=>({label:e.getAttribute('aria-label'),value:e.value})),
            alerts:[...document.querySelectorAll('[role="alert"],[role="status"]')].map(e=>e.textContent.slice(0,400)),
            operations:typeof phase35==='undefined'?[]:(await phase35.state()).map(r=>({id:r.id,status:r.status,lastError:r.lastError,attempts:r.attempts})),
            drafts:typeof phase35==='undefined'?[]:(await phase35.getStorageRuntime().drafts.list('A')).map(r=>({resourceId:r.resourceId,data:r.data})),
            caches:await caches.keys()}))()`;
        const observations=await Promise.allSettled(pages.filter(p=>p.isOpen()).map(p=>p.evaluate(expression,2000)));
        console.log('PHASE52_OFFLINE_DIAGNOSTIC '+JSON.stringify({name,apiOffline,release,oldMode,requests:requests.slice(-60),observations}));
    };
    const check=async(name,task)=>{let failure;await t.test(name,async()=>{try{await task();}catch(error){failure=error;try{await diagnose(name);}catch{/* Diagnostics cannot replace the failure. */}throw error;}});if(failure)throw failure;};
    const metrics=[],settings={tokenA,tokenB,expiredToken,revokedToken};
    try{
        debugging=await launch();let app=await page();await verified(app);
        await check('borrador unilateral de Workout conserva modo y ambos lados tras reabrir offline',async()=>{
            await app.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Bilateral').click();true`);
            // A programmatic CDP click can return before React commits the
            // unilateral controls. Observe that commit before entering values.
            await until(()=>app.evaluate(`!!document.querySelector('[aria-label="Serie 1 peso izquierdo"]')&&!!document.querySelector('[aria-label="Serie 1 peso derecho"]')`),'unilateral controls committed');
            await app.evaluate(`phase35.input('[aria-label="Serie 1 peso izquierdo"]',101);true`);
            await app.evaluate(`phase35.input('[aria-label="Serie 1 reps izquierdas"]',9);true`);
            await app.evaluate(`phase35.input('[aria-label="Serie 1 peso derecho"]',81);true`);
            await app.evaluate(`phase35.input('[aria-label="Serie 1 reps derechas"]',7);true`);
            await until(()=>app.evaluate(`phase35.getStorageRuntime().drafts.list('A').then(rows=>rows.some(x=>x.data.workoutData?.['A-Exercise']?.[0]?.weightR==='81'&&x.data.workoutData?.['A-Exercise']?.[0]?.repsR==='7'))`),'draft sides committed');
            apiOffline=true;await app.command('Browser.close');await until(async()=>{try{await fetch(debugging+'/json/version');return false;}catch{return true;}},'draft browser closed');
            debugging=await launch();app=await page();
            await until(()=>app.evaluate(`!!document.querySelector('[aria-label="Serie 1 peso derecho"]')`),'unilateral mode restored');
            assert.equal(await app.evaluate(`document.querySelector('[aria-label="Serie 1 peso derecho"]').value`),'81');
            assert.equal(await app.evaluate(`document.querySelector('[aria-label="Serie 1 reps derechas"]').value`),'7');
            assert.equal((await state(app)).length,0);
            await app.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Unilateral').click();true`);
        });
        await check('A: formulario real offline guarda en Dexie y no confirma antes del commit',async()=>{
            const before=await counts();apiOffline=true;
            await app.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
            await saveForm(app);
            await until(async()=>(await state(app)).length===1,'durable form operation');
            const rows=await state(app);assert.equal(rows[0].status,'pending');assert.equal(rows[0].payload.sets.length,2);
            assert.deepEqual(await counts(),before);assert.equal(await app.evaluate(`document.body.textContent.includes('Entrenamiento sincronizado')`),false);
        });
        await check('A: PWA reabierta sin API recupera formulario y mantiene bloqueo contra doble guardado',async()=>{
            await app.command('Browser.close');await until(async()=>{try{await fetch(debugging+'/json/version');return false;}catch{return true;}},'browser closed');
            debugging=await launch();app=await page();
            await until(()=>app.evaluate(`document.body.textContent.includes('Ensayo offline')`),'offline draft context');
            assert.equal((await state(app)).length,1);
            assert.equal(await app.evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Guardar y finalizar')`),false);
            await app.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
            await app.command('Page.reload');
            await until(()=>app.evaluate(`document.body.textContent.includes('Ensayo offline')`),'cached built shell without network');
            await attach(app);assert.equal((await state(app)).length,1);
        });
        await check('A: reconexion automatica confirma SQL, PR, acuse y panel una sola vez',async()=>{
            const before=await counts(), id=(await state(app))[0].id;apiOffline=false;
            await app.command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
            await app.evaluate(`window.dispatchEvent(new Event('online'));true`);
            await until(async()=>(await state(app))[0]?.status==='confirmed','confirmed form');
            const row=(await state(app))[0],log=await db.workoutLog.findUnique({where:{id:row.receipt.result.workoutLog.id},include:{sets:true}});
            assert.equal(log.sets.length,2);assert.equal(log.sets[0].weight,92);assert.equal(row.id,id);
            const after=await counts();assert.equal(after.logs,before.logs+1);assert.equal(after.receipts,before.receipts+1);
            await until(()=>app.evaluate(`document.body.textContent.includes('Entrenamiento sincronizado')`),'true UI receipt');
            const prs=await db.personalRecord.findMany({where:{userId:'A'}});assert(prs.some(pr=>pr.weight===93));
            await app.evaluate(`window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('pageshow'));true`);await delay(100);
            assert.deepEqual(await counts(),after);
        });
        await check('B: COMMIT real sin respuesta, reinicio backend y navegador recuperan el mismo acuse',async()=>{
            const before=await counts();await fault('after');
            const result=await app.evaluate(`phase35.lostReply(${JSON.stringify(settings)})`);
            assert.equal(result.syncStatus,'retry_scheduled');const id=result.operationId;
            await fault(null);const posts=requests.filter(x=>x.operationId===id&&x.method==='POST').length;assert(posts>=1);
            await restart();await app.command('Browser.close');await until(async()=>{try{await fetch(debugging+'/json/version');return false;}catch{return true;}},'browser closed');
            debugging=await launch();app=await page();await attach(app);
            const recovered=await app.evaluate(`phase35.recoverReply(${JSON.stringify(result)},${JSON.stringify(settings)})`);
            assert.equal(recovered.id,id);assert.equal(recovered.status,'confirmed');assert.equal(recovered.receipt.replayed,true);
            assert(!(await state(app)).some(row=>row.id===id));
            const after=await counts();assert.equal(after.rest,before.rest+1);assert.equal(after.receipts,before.receipts+1);
            assert.equal(requests.filter(x=>x.operationId===id&&x.method==='POST').length,posts);
        });
        await check('E: parada real PostgreSQL conserva operacion y autenticacion; no comunica exito',async()=>{
            const before=await counts();await postgres(false);
            try{
                const saved=await app.evaluate(`phase35.api.logRestDay('PostgreSQL caido 3.5',{ownerId:'A'})`);
                assert.equal(saved.syncStatus,'retry_scheduled');assert.equal(await app.evaluate(`JSON.parse(localStorage.nexlift_user).id`),'A');
                const row=(await state(app)).find(x=>x.id===saved.operationId);assert(!row.receipt);assert.equal(row.payload.note,'PostgreSQL caido 3.5');
            }finally{await postgres(true);}
            await app.evaluate(`window.dispatchEvent(new Event('online'));true`);
            await until(async()=>(await state(app)).every(x=>x.status==='confirmed'),'PG recovered');
            const after=await counts();assert.equal(after.rest,before.rest+1);
        });
        await check('envio HTTP interrumpido antes del COMMIT revierte SQL; mismo UUID puede completar despues',async()=>{
            const before=await counts();await fault('before');
            const saved=await app.evaluate(`phase35.lostReply(${JSON.stringify(settings)})`);
            assert.equal(saved.syncStatus,'retry_scheduled');assert.deepEqual(await counts(),before);await fault(null);
            const recovered=await app.evaluate(`phase35.recoverReply(${JSON.stringify(saved)},${JSON.stringify(settings)})`);
            assert.equal(recovered.status,'confirmed');assert.equal((await counts()).receipts,before.receipts+1);
        });
        let other,otherDebug,conflictId,attemptId,logId;
        const otherProfile=path.join(root,'independent-device');await mkdir(otherProfile);
        await check('D: dos procesos Edge independientes editan la misma serie; el segundo offline obtiene 409',async()=>{
            logId=(await state(app))[0].receipt.result.workoutLog.id;
            await app.command('Page.navigate',{url:origin+'/session/'+logId+'/edit'});await attach(app);
            await until(()=>app.evaluate(`!!document.querySelector('textarea[aria-label="Notas del entrenamiento"]')`),'first session editor');
            otherDebug=await launch(otherProfile);other=await page({debug:otherDebug,route:'/session/'+logId+'/edit'});
            await until(()=>other.evaluate(`!!document.querySelector('textarea[aria-label="Notas del entrenamiento"]')`),'independent editor');
            await other.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
            await app.evaluate(`phase35.input('input[type="number"]',121);true`);
            await app.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Guardar').click();true`);
            await until(async()=> (await db.workoutLog.findUnique({where:{id:logId},include:{sets:{orderBy:{setNumber:'asc'}}}})).sets[0].weight===121,'first remote edit');
            await other.evaluate(`phase35.input('input[type="number"]',131);true`);
            await other.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Guardar').click();true`);
            await until(async()=>(await state(other)).some(x=>x.payload.logId===logId),'offline edit durable');
            conflictId=(await state(other)).find(x=>x.payload.logId===logId).id;
            await other.command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
            await other.evaluate(`window.dispatchEvent(new Event('online'));true`);
            await until(async()=>(await state(other)).find(x=>x.id===conflictId)?.status==='conflict','version conflict');
            await until(()=>other.evaluate(`!!document.querySelector('[data-conflict-status]')`),'real conflict UI');
        });
        await check('D: lectura remota interrumpida conserva original; comparacion reanudada muestra tres valores',async()=>{
            apiOffline=true;
            await other.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Ver diferencias').click();true`);
            await until(()=>other.evaluate(`!!document.querySelector('[data-conflict-status] [role="alert"]')`),'remote read failed');
            const row=(await state(other)).find(x=>x.id===conflictId);assert.equal(row.payload.changes.updates[0].fields.weight,131);
            apiOffline=false;
            await other.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Ver diferencias').click();true`);
            await until(()=>other.evaluate(`!!document.querySelector('[aria-label="Comparación del entrenamiento"]')`),'three-way comparison');
            assert(await other.evaluate(`document.querySelector('[aria-label="Comparación del entrenamiento"]').textContent.includes('121')&&document.querySelector('[aria-label="Comparación del entrenamiento"]').textContent.includes('131')`));
        });
        await check('D: decision preparada antes del envio sobrevive cierre; original y UUID nuevo son distintos',async()=>{
            const before=await counts();
            await other.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Vista previa: aplicar mis cambios').click();true`);
            await until(()=>other.evaluate(`!!document.querySelector('[data-conflict-preview]')`),'resolution preview');
            // Fault in the test adapter only: pause between durable prepare and
            // invoking the existing engine. No application hook or new engine.
            await other.evaluate(`{const r=phase35.operationRuntime();r.run=async()=>{};}true`);
            await other.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Confirmar resolución').click();true`);
            await until(async()=>(await state(other)).some(x=>x.payload.resolution),'prepared resolution');
            const rows=await state(other),attempt=rows.find(x=>x.payload.resolution);attemptId=attempt.id;
            assert.notEqual(attemptId,conflictId);assert.equal(attempt.status,'pending');assert.deepEqual(await counts(),before);
            await other.command('Browser.close');await until(async()=>{try{await fetch(otherDebug+'/json/version');return false;}catch{return true;}},'independent process closed');
        });
        await check('D/G: reabrir y reintentar desde dos pestañas confirma una decision e historial intacto',async()=>{
            const before=await counts();otherDebug=await launch(otherProfile);other=await page({debug:otherDebug,route:'/settings'});
            await until(async()=>(await state(other)).find(x=>x.id===attemptId)?.status==='confirmed','resolution recovered');
            const same=await page({debug:otherDebug,route:'/settings'});
            await Promise.all([other.evaluate('phase35.operationRuntime().retry()'),same.evaluate('phase35.operationRuntime().retry()')]);
            const rows=await state(other);assert.equal(rows.find(x=>x.id===conflictId).status,'resolved_preserved');
            assert.equal(rows.find(x=>x.id===conflictId).payload.changes.updates[0].fields.weight,131);
            const conflict=await other.evaluate(`phase35.getStorageRuntime().conflicts.get('A',${JSON.stringify(conflictId)})`);
            assert.equal(conflict.status,'resolved_local');assert(conflict.history.some(h=>h.type==='decision_prepared'));
            const log=await db.workoutLog.findUnique({where:{id:logId},include:{sets:{orderBy:{setNumber:'asc'}}}});assert.equal(log.sets[0].weight,131);
            const after=await counts();assert.equal(after.receipts,before.receipts+1);assert.equal(after.logs,before.logs);
        });
        const harness=await page({route:'/test/stabilization-harness.html',owner:'B',token:tokenB});
        const names=await harness.evaluate('phase35.caseNames');
        for(let i=0;i<names.length;i++)await check(names[i],async()=>{
            const result=await harness.evaluate(`phase35.runCase(${i},${JSON.stringify(settings)})`);assert.equal(result.passed,true);
        });
        await harness.evaluate(`phase35.configure(${JSON.stringify(settings)});true`);
        for(const size of [10,100,1000,5000])await check(`carga ${size}: IDB real, reinicio, HTTP y PostgreSQL sin duplicados`,async()=>{
            const before=await counts(),result=await harness.evaluate(`phase35.load(${size})`);metrics.push(result);
            const after=await counts();assert.equal(after.logs,before.logs+result.workouts);assert.equal(after.receipts,before.receipts+size);
        });
        const visualProfile=path.join(root,'visual-load');await mkdir(visualProfile);
        let visual;
        await check('1000 operaciones con React visible sincronizan; panel pagina y conserva todos los registros',async()=>{
            const debug=await launch(visualProfile);visual=await page({debug,route:'/settings',owner:'B',token:tokenB});
            await until(()=>visual.evaluate(`(async()=>{const r=phase35.operationRuntime(),s=r.transport.snapshot();return s&&await r.transport.bound(s);})()`),'B verified');
            const before=await counts(),saved=await visual.evaluate('phase35.visibleLoad(1000)');
            const began=Date.now();await visual.evaluate('phase35.operationRuntime().run()');
            await until(()=>visual.evaluate(`phase35.operationRuntime().store.list('B',{includeHistory:false}).then(rows=>rows.length===1000&&rows.every(x=>x.status==='confirmed'))`),'1000 confirmed with UI mounted',180000);
            await until(()=>visual.evaluate(`document.querySelectorAll('[data-operation-list] > li').length===50`),'paged journal');
            assert.equal((await counts()).receipts,before.receipts+1000);assert.equal(saved.ids.length,1000);
            metrics.push({visual:true,size:1000,syncMs:Date.now()-began,renderedRows:50,retainedRows:1000});
        });
        await check('5000 pendientes adicionales no saturan DOM ni desaparecen detras del primer bloqueo',async()=>{
            apiOffline=true;const before=await counts(),started=Date.now();await visual.evaluate('phase35.visibleLoad(5000,true)');
            await until(()=>visual.evaluate(`document.body.textContent.includes('50 de 6000')`),'6000 retained / 50 visible');
            const summary=await visual.evaluate(`phase35.getStorageRuntime().summary('B')`);assert.equal(summary.pending,5000);
            await visual.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Ver 50 registros')).click();true`);
            await until(()=>visual.evaluate(`document.querySelectorAll('[data-operation-list] > li').length===100`),'next page accessible');
            assert.deepEqual(await counts(),before);apiOffline=false;
            metrics.push({visual:true,size:5000,displayMs:Date.now()-started,renderedRows:100,retainedRows:6000,pending:5000});
        });
        await check('actualizacion real de SW y frontend: IDB v2 a v3 conserva operacion y originales',async()=>{
            await productionBuild({configFile:false,envFile:false,root:clientRoot,plugins:[react(),tailwind()],logLevel:'silent',
                define:{'process.env.NODE_ENV':'"production"','import.meta.env.VITE_INDEXEDDB_ENABLED':'"true"','import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED':'"true"',
                    'import.meta.env.VITE_CONFLICT_RESOLUTION_ENABLED':'"false"','import.meta.env.VITE_API_URL':'"/api"','import.meta.env.PROD':'true'},
                build:{outDir:oldDist,emptyOutDir:false,manifest:true,rollupOptions:{input:{app:path.join(clientRoot,'index.html'),test:path.join(clientRoot,'test/stabilization-harness.html')}}}});
            const oldManifest=JSON.parse(await readFile(path.join(oldDist,'.vite/manifest.json'),'utf8'));
            oldMode=true;bridge='/'+oldManifest['test/stabilization-harness.html'].file;
            const updateProfile=path.join(root,'pwa-upgrade');await mkdir(updateProfile);const updateDebug=await launch(updateProfile);
            const update=await page({debug:updateDebug});await verified(update);
            assert.equal(await update.evaluate(`phase35.getStorageRuntime().db.backendDB().version`),20);
            apiOffline=true;const before=await counts();
            const saved=await update.evaluate(`phase35.api.logRestDay('Pendiente durante actualizacion',{ownerId:'A'})`);
            const original=(await state(update)).find(x=>x.id===saved.operationId);
            await update.evaluate(`localStorage.setItem('workout_legacy35','{"sets":[{"weight":45}]}');true`);
            oldMode=false;release=2;bridge='/'+manifest['test/stabilization-harness.html'].file;
            try { await update.evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>true)`); }
            catch(error) { if(!/Inspected target navigated|Execution context was destroyed/.test(error.message))throw error; }
            // The availability SW deliberately waits while a document is open.
            // Verify the old page and pending operation survive, then model the
            // user closing/reopening this test tab. Never force skipWaiting.
            await until(()=>update.evaluate(`navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)`),'new SW waits for open document');
            assert.equal(await update.evaluate(`!!document.querySelector('script[src="/${oldManifest['index.html'].file}"]')`),true);
            assert.deepEqual((await state(update)).find(x=>x.id===saved.operationId).payload,original.payload);
            await update.command('Page.navigate',{url:'about:blank'});
            await until(()=>update.evaluate(`location.href==='about:blank'&&document.readyState==='complete'`),'test document closed');
            await update.command('Page.navigate',{url:origin+'/workout/A-RoutineDay'});
            await until(()=>update.evaluate(`(async()=>!!document.querySelector('script[src="/${manifest['index.html'].file}"]')
                &&(await caches.keys()).includes('nexlift-static-v35-isolated-2')
                &&(await indexedDB.databases()).some(d=>d.name==='nexlift-offline'&&d.version===30))()`),'new frontend / active SW / additive upgrade');
            await attach(update);
            const recovered=(await state(update)).find(x=>x.id===saved.operationId);assert.deepEqual(recovered.payload,original.payload);
            assert.equal(await update.evaluate(`localStorage.getItem('workout_legacy35')`),'{"sets":[{"weight":45}]}');
            apiOffline=false;await update.evaluate(`window.dispatchEvent(new Event('online'));true`);
            await until(async()=>(await state(update)).find(x=>x.id===saved.operationId)?.status==='confirmed','sync after SW upgrade');
            assert.equal((await counts()).receipts,before.receipts+1);
            const cached=await update.evaluate(`(async()=>{const out=[];for(const key of await caches.keys())for(const request of await(await caches.open(key)).keys())out.push({url:request.url,auth:request.headers.has('Authorization')});return out;})()`);
            assert(cached.every(row=>!new URL(row.url).pathname.startsWith('/api')&&!row.auth));
        });
        return {browser:'Microsoft Edge real',compiledReact:true,realIndexedDB:true,realPostgres:true,
            actualForm:true,browserRestart:true,backendRestart:true,postgresStopStart:true,twoBrowserProcesses:true,
            actualServiceWorkerUpdate:true,deferredActivationWithoutForcedReload:true,physicalIndexedDbUpgrade:'20 -> 30',load:metrics};
    }finally{
        for(const p of pages)p.close();
        await processes.close();
        server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    }
}
async function cdp(url) {
    const socket = new WebSocket(url), pending = new Map(); let sequence = 0;
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data), entry = pending.get(message.id);
        if (!entry) return; pending.delete(message.id); clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    });
    socket.addEventListener('close', () => {
        // Chromium may close the connection before sending Browser.close's
        // acknowledgement. All OTHER pending commands must still fail.
        for (const entry of pending.values()) {
            clearTimeout(entry.timer);
            if (entry.method === 'Browser.close') entry.resolve({});
            else entry.reject(new Error('CDP connection closed'));
        }
        pending.clear();
    });
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const command = (method, params = {}, timeoutMs = 600000) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timer, method }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression, timeoutMs = 600000) => {
        const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result?.value;
    };
    return { command, evaluate, isOpen: () => socket.readyState === WebSocket.OPEN, close: () => socket.close() };
}
