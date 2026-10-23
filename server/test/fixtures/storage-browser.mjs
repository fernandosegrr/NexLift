import { createBrowserProcesses } from './browser-process.mjs';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

async function until(task, label) {
    let error;
    for (let i = 0; i < 150; i++) {
        try { const value = await task(); if (value) return value; } catch (cause) { error = cause; }
        await delay(100);
    }
    throw new Error(`Browser timeout: ${label}`, { cause: error });
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
    const command = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
        pending.set(id, { resolve, reject, timer, method }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result?.value;
    };
    return { command, evaluate, close: () => socket.close() };
}
export async function runStorageBrowser({ root, backend, tokenA, tokenB, counts, t, db, fault }) {
    const { createServer } = await import('../../../client/node_modules/vite/dist/node/index.js');
    const react = (await import('../../../client/node_modules/@vitejs/plugin-react/dist/index.js')).default;
    const tailwind = (await import('../../../client/node_modules/@tailwindcss/vite/dist/index.mjs')).default;
    const vite = await createServer({ configFile: false, envFile: false, root: fileURLToPath(new URL('../../../client/', import.meta.url)),
        plugins: [react(), tailwind(), { name: 'storage-harness', transformIndexHtml: {
            order: 'post', handler(html, context) {
                if (context.path !== '/test/storage-harness.html') return html;
                // Vite still injects its reconnecting client with hmr:false.
                // This bare storage document must survive an actual freeze.
                return html.replace(/<script\b[^>]*\bsrc=["']\/@vite\/client["'][^>]*>\s*<\/script>\s*/g, '');
            }
        } }], logLevel: 'silent',
        define: { 'import.meta.env.VITE_INDEXEDDB_ENABLED': '"true"', 'import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED': '"true"', 'import.meta.env.VITE_API_URL': '"/api"' },
        // A frozen tab can close Vite's development socket; its reconnect then
        // reloads the document and discards the suspended test callback. The
        // deployed PWA has no HMR. Keep this a real frozen-document fence test.
        server: { hmr: false, host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { target: backend, changeOrigin: true } } } });
    let processes; const pages = [];
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const harnessHtml = await (await fetch(origin + '/test/storage-harness.html')).text();
        assert(!harnessHtml.includes('/@vite/client'), 'Bare storage harness must not contain Vite reconnect/reload code');
        const executable = process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium';
        if (!existsSync(executable)) throw new Error('Real Edge/Chromium required');
        const profile = path.join(root, 'phase33-browser'); await mkdir(profile);
        processes = createBrowserProcesses({ root, executable });
        const launch = () => processes.launch(profile);
        let debugging = await launch();
        async function page(app = false) {
            const target = await (await fetch(debugging + '/json/new?about:blank', { method: 'PUT' })).json();
            const connection = await cdp(target.webSocketDebuggerUrl); pages.push(connection);
            await connection.command('Page.enable'); await connection.command('Network.enable');
            await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}) { localStorage.setItem('nexlift_token',${JSON.stringify(tokenA)});localStorage.setItem('nexlift_user',JSON.stringify({id:'A',username:'A'})); }` });
            await connection.command('Page.navigate', { url: origin + (app ? '/' : '/test/storage-harness.html') });
            await until(() => connection.evaluate(`document.readyState==='complete'`), 'document');
            if (app) await until(() => connection.evaluate(`(async()=>{const {operationRuntime}=await import('/src/services/api.js');const r=operationRuntime(),s=r.transport.snapshot();return s&&await r.transport.bound(s)&&document.querySelector('main');})().then(Boolean)`), 'verified React app');
            return { ...connection, targetId: target.id };
        }
        let first = await page();
        const names = await first.evaluate(`import('/test/storage-cases.js').then(m=>m.caseNames)`);
        const settings = JSON.stringify({ tokenA, tokenB });
        for (let i = 0; i < names.length; i++) await t.test(names[i], async () => {
            const result = await first.evaluate(`import('/test/storage-cases.js').then(m=>m.runCase(${i},${settings}))`);
            assert.equal(result.passed, true);
        });
        await t.test('cierre real de pestaña con transacción activa conserva todo o revierte todo', async () => {
            const writer = await page();
            await writer.evaluate(`(async()=>{const {createStorageRuntime}=await import('/src/storage/runtime.js');
                window.atomic=createStorageRuntime({name:'nexlift-storage-test-atomic-close',identity:()=>({ownerId:'A'})});await window.atomic.ready();
                void window.atomic.db.transaction('rw',window.atomic.db.operations,window.atomic.db.metadata,async()=>{
                    for(let i=0;i<10000;i++){await window.atomic.db.operations.add({ownerId:'A',id:'atomic-'+i,status:'pending',dependsOn:[],createdAt:0});window.atomicProgress=i+1;}
                    await window.atomic.db.metadata.put({key:'atomic-completed',count:10000});
                }).catch(()=>{});return true;})()`);
            await until(() => writer.evaluate('window.atomicProgress>100&&window.atomicProgress<10000'), 'active native transaction');
            await writer.command('Target.closeTarget', { targetId: writer.targetId });
            const checked = await first.evaluate(`(async()=>{const {createStorageRuntime}=await import('/src/storage/runtime.js');const r=createStorageRuntime({name:'nexlift-storage-test-atomic-close',identity:()=>({ownerId:'A'})});await r.ready();const count=await r.db.operations.count(),marker=await r.db.metadata.get('atomic-completed');r.close();return {count,marker};})()`);
            assert([0, 10000].includes(checked.count)); assert.equal(!!checked.marker, checked.count === 10000);
        });
        await t.test('cerrar pestaña líder deja lease recuperable al vencer sin liberar el bloqueo', async () => {
            const writer = await page();
            await writer.evaluate(`(async()=>{const {createStorageRuntime}=await import('/src/storage/runtime.js');window.closedLeader=createStorageRuntime({name:'nexlift-storage-test-closed-leader',locks:null,identity:()=>({ownerId:'A'})});await window.closedLeader.ready();void window.closedLeader.store.withLock('A',async()=>{window.closedLeaseReady=true;await new Promise(()=>{});});return true;})()`);
            await until(() => writer.evaluate('window.closedLeaseReady===true'), 'lease holder');
            await writer.command('Target.closeTarget', { targetId: writer.targetId });
            const recovered = await first.evaluate(`(async()=>{const {createStorageRuntime}=await import('/src/storage/runtime.js');let clock=Date.now();const r=createStorageRuntime({name:'nexlift-storage-test-closed-leader',locks:null,now:()=>clock,identity:()=>({ownerId:'A'})});await r.ready();let before=false,after=false;await r.store.withLock('A',async()=>{before=true;});clock+=61000;await r.store.withLock('A',async()=>{after=true;});r.close();return {before,after};})()`);
            assert.deepEqual(recovered, { before: false, after: true });
        });
        await t.test('cierre real del navegador durante migración después de copiar y antes del comprobante', async () => {
            const seed = await first.evaluate(`(async()=>{
                const {normalizePayload,payloadHash}=await import('/src/services/operationProtocol.js');
                const payload=normalizePayload({operationId:crypto.randomUUID(),kind:'rest.create',source:'pwa',performedAt:'2026-10-20T05:59:59.999Z'});
                const item={format:1,id:payload.operationId,ownerId:'A',payload,requestHash:await payloadHash(payload),originalDay:'2026-10-19',createdAt:Date.now(),localOrder:1,dependsOn:[],initialStatus:'pending'};
                const key='nexlift_operation_v1:A:'+item.id+':payload';localStorage.setItem(key,JSON.stringify(item));
                const name='nexlift-storage-test-interrupted';
                const {createStorageRuntime}=await import('/src/storage/runtime.js');
                window.interrupted=createStorageRuntime({name,storage:localStorage,identity:()=>({ownerId:'A'}),checkpoint:async stage=>{if(stage==='before_receipt'){window.copyCommitted=true;await new Promise(()=>{});}}});
                void window.interrupted.ready();return {name,id:item.id,key,payload};
            })()`);
            await until(() => first.evaluate('window.copyCommitted===true'), 'committed copy checkpoint');
            await first.command('Browser.close'); 
            debugging = await launch(new URL(debugging).port); first = await page();
            const recovered = await first.evaluate(`(async()=>{const {createStorageRuntime}=await import('/src/storage/runtime.js');const r=createStorageRuntime({name:${JSON.stringify(seed.name)},identity:()=>({ownerId:'A'})});await r.ready();const rows=await r.store.list('A');const m=await r.db.metadata.get('migration');r.close();return {rows,m};})()`);
            assert.equal(recovered.rows.filter(row => row.id === seed.id).length, 1); assert.deepEqual(recovered.rows.find(row => row.id === seed.id).payload, seed.payload);
            assert.equal(recovered.m.verified, true);
            await first.evaluate(`localStorage.removeItem(${JSON.stringify(seed.key)});true`);
        });
        await t.test('dos pestañas reales: pestaña congelada pierde lease y no puede registrar respuesta tardía', async () => {
            const second = await page();
            assert.equal(await first.evaluate('performance.getEntriesByType("resource").some(r=>r.name.includes("/@vite/client"))'), false);
            const documentIdentity = await first.evaluate('window.leaseTestDocument=crypto.randomUUID()');
            await first.evaluate(`(async()=>{ const {createStorageRuntime}=await import('/src/storage/runtime.js');window.leader=createStorageRuntime({name:'nexlift-storage-test-tabs',locks:null,storage:localStorage,identity:()=>({ownerId:'A'})});await window.leader.ready();void window.leader.store.withLock('A',async()=>{window.hasLeadership=true;await new Promise(resolve=>window.resumeLeader=resolve);try{await window.leader.store.record('A','missing',{status:'pending'});}catch(e){window.lateError=e.code;}});return true;})()`);
            await until(() => first.evaluate('window.hasLeadership===true'), 'leader');
            await first.command('Page.setWebLifecycleState', { state: 'frozen' });
            const stolen = await second.evaluate(`(async()=>{const {createStorageRuntime}=await import('/src/storage/runtime.js');const r=createStorageRuntime({name:'nexlift-storage-test-tabs',locks:null,storage:localStorage,identity:()=>({ownerId:'A'})});await r.ready();await r.db.leases.update('sync:A',{until:0});let acquired=false;await r.store.withLock('A',async()=>{acquired=true;});r.close();return acquired;})()`);
            assert.equal(stolen, true); await first.command('Page.setWebLifecycleState', { state: 'active' });
            assert.equal(await first.evaluate('window.leaseTestDocument'), documentIdentity, 'Frozen document must survive reactivation');
            await first.evaluate('window.resumeLeader();true'); await until(() => first.evaluate('window.lateError'), 'stale writer rejection');
            assert.equal(await first.evaluate('window.leaseTestDocument'), documentIdentity, 'Fencing must reject on the original document');
            assert.equal(await first.evaluate('window.lateError'), 'LEADERSHIP_LOST'); await first.evaluate('window.leader.close();true');
        });
        // The actual application is also exercised, rather than only test DIs.
        const app = await page(true);
        await t.test('React usa Dexie, muestra estado y persiste offline antes de HTTP', async () => {
            const before = await counts();
            await app.command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
            const saved = await app.evaluate(`(async()=>{const {api}=await import('/src/services/api.js');const saved=await api.logWorkout('A-Exercise',[{weight:210,reps:8,rpe:8,completed:true,weightRight:180,repsRight:9}],'PWA Dexie',{ownerId:'A'});window.savedOperation=saved.operationId;return saved;})()`);
            assert.equal(saved.queued, true); assert.deepEqual(await counts(), before);
            await until(() => app.evaluate(`!!document.querySelector('[data-offline-storage]')&&document.body.textContent.includes('operaciones guardadas en este dispositivo')`), 'storage/pending UI');
            const found = await app.evaluate(`import('/src/storage/runtime.js').then(m=>m.getStorageRuntime().db.operations.get(['A',window.savedOperation]))`);
            assert.equal(found.id, saved.operationId);
        });
        await t.test('PWA reabre, reconecta desde IndexedDB, preserva unilateralidad y PR sin duplicados', async () => {
            const originalId = await app.evaluate('window.savedOperation'), before = await counts();
            await app.command('Browser.close'); 
            debugging = await launch(new URL(debugging).port); const reopened = await page(true), other = await page(true);
            await until(() => reopened.evaluate(`import('/src/services/api.js').then(async m=>(await m.operationRuntime().store.get('A',${JSON.stringify(originalId)}))?.status==='confirmed')`), 'IndexedDB automatic reconnect');
            await Promise.all([reopened.evaluate(`import('/src/services/api.js').then(m=>m.replayOfflineQueue())`), other.evaluate(`import('/src/services/api.js').then(m=>m.replayOfflineQueue())`)]);
            const item = await reopened.evaluate(`import('/src/services/api.js').then(m=>m.operationRuntime().store.get('A',${JSON.stringify(originalId)}))`);
            const log = await db.workoutLog.findUnique({ where: { id: item.receipt.result.workoutLog.id }, include: { sets: true } });
            assert.equal(log.sets[0].weightRight, 180); assert.equal(log.sets[0].rpe, 8);
            const prs = await db.personalRecord.findMany({ where: { userId: 'A' } }); assert(prs.some(row => row.weight === 210));
            const after = await counts(); assert.equal(after.logs, before.logs + 1); assert.equal(after.receipts, before.receipts + 1);
            await reopened.command('Page.reload'); await until(() => reopened.evaluate(`document.body.textContent.includes('Entrenamiento sincronizado')`), 'persisted UI');
            await reopened.evaluate(`navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>true)`);
            await until(() => reopened.evaluate('!!navigator.serviceWorker.controller'), 'actual service worker');
            await reopened.evaluate(`window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('pageshow'));true`); await delay(100);
            assert.deepEqual(await counts(), after);
            // Destroy HTTP reply only AFTER the actual PostgreSQL COMMIT.
            await fault('after');
            const lost = await reopened.evaluate(`import('/src/services/api.js').then(m=>m.api.logRestDay('Corte real después de commit'))`);
            assert.equal(lost.syncStatus, 'retry_scheduled');
        });
        return { browser: 'Microsoft Edge real', dexie: '4.4.6', realIndexedDB: true, realBrowserRestarts: 2,
            migrationInterruptedAfterCopy: true, simultaneousTabs: true, frozenTabFence: true, actualServiceWorker: true,
            largeQueue: 1000, productionTouched: false };
    } finally {
        for (const page of pages) page.close();
        await processes?.close();
        await vite.close();
    }
}
