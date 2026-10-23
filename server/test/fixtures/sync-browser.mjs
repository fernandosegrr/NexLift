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
export async function runBrowserSync({ root, backend, token, counts }) {
    const { createServer } = await import('../../../client/node_modules/vite/dist/node/index.js');
    const react = (await import('../../../client/node_modules/@vitejs/plugin-react/dist/index.js')).default;
    const tailwind = (await import('../../../client/node_modules/@tailwindcss/vite/dist/index.mjs')).default;
    const vite = await createServer({ configFile: false, envFile: false, root: fileURLToPath(new URL('../../../client/', import.meta.url)),
        plugins: [react(), tailwind()], logLevel: 'silent',
        define: { 'import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED': '"true"', 'import.meta.env.VITE_API_URL': '"/api"' },
        server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { target: backend, changeOrigin: true } } } });
    let processes; const pages = [];
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const executable = process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium';
        if (!existsSync(executable)) throw new Error('Real Chromium/Edge required for browser verification');
        const profile = path.join(root, 'phase32-browser'); await mkdir(profile);
        processes = createBrowserProcesses({ root, executable });
        const launch = () => processes.launch(profile);
        let debugging = await launch();
        async function page() {
            const target = await (await fetch(debugging + '/json/new?about:blank', { method: 'PUT' })).json();
            const connection = await cdp(target.webSocketDebuggerUrl); pages.push(connection);
            await connection.command('Page.enable'); await connection.command('Network.enable');
            await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}) { localStorage.setItem('nexlift_token',${JSON.stringify(token)});localStorage.setItem('nexlift_user',JSON.stringify({id:'A',username:'A'})); }` });
            await connection.command('Page.navigate', { url: origin });
            await until(() => connection.evaluate(`!!document.querySelector('main')`), 'React app');
            await until(() => connection.evaluate(`(async()=>{ const {operationRuntime}=await import('/src/services/api.js');const r=operationRuntime(),s=r.transport.snapshot();return s&&await r.transport.bound(s); })()`), 'server-verified browser identity');
            return { ...connection, targetId: target.id };
        }
        const first = await page(), old = await counts();
        await first.command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
        const saved = await first.evaluate(`(async()=>{ const {api}=await import('/src/services/api.js');return api.logWorkout('A-Exercise',[{weight:55,reps:7,rpe:8,completed:true}], 'Navegador real', {ownerId:'A'}); })()`);
        assert.equal(saved.queued, true); assert.equal(saved.syncStatus, 'pending');
        await until(() => first.evaluate(`document.body.textContent.includes('operaciones guardadas en este dispositivo')`), 'pending status UI');
        assert.deepEqual(await counts(), old);
        await first.command('Browser.close');
        
        debugging = await launch(new URL(debugging).port);
        const second = await page();
        await until(() => second.evaluate(`(async()=>{const {operationRuntime}=await import('/src/services/api.js');return (await operationRuntime().store.list('A')).find(i=>i.id===${JSON.stringify(saved.operationId)})?.status==='confirmed';})()`), 'automatic reconnect');
        const third = await page();
        await Promise.all([third.evaluate(`import('/src/services/api.js').then(m=>m.replayOfflineQueue())`), second.evaluate(`import('/src/services/api.js').then(m=>m.replayOfflineQueue())`)]);
        await until(() => second.evaluate(`document.body.textContent.includes('Entrenamiento sincronizado')`), 'confirmed status UI');
        const committed = await counts(); assert.equal(committed.logs, old.logs + 1); assert.equal(committed.sets, old.sets + 1); assert.equal(committed.receipts, old.receipts + 1);
        await second.command('Page.reload'); await until(() => second.evaluate(`document.body.textContent.includes('Entrenamiento sincronizado')`), 'reload status UI');
        await second.evaluate(`window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));`);
        await delay(100); assert.deepEqual(await counts(), committed);
        await second.evaluate(`navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>true)`);
        await until(() => second.evaluate(`!!navigator.serviceWorker.controller && !!document.querySelector('main')`), 'controlled app');
        const fresh = await second.evaluate(`(async()=>{ const cache=await caches.open('phase32-fake-api');await cache.put('/api/v1/workout-capabilities', new Response(JSON.stringify({userId:'WRONG',ready:false})));return (await fetch('/api/v1/workout-capabilities',{headers:{Authorization:'Bearer '+localStorage.getItem('nexlift_token')}})).json(); })()`);
        assert.equal(fresh.userId, 'A'); assert.equal(fresh.ready, true);
        return { browser: 'Real headless Microsoft Edge/Chromium', automaticReconnect: true, actualWebLocks: true, realReload: true, realBrowserRestart: true,
            actualServiceWorker: true, pendingAndConfirmedUI: true, duplicateDatabaseEffects: 0 };
    } finally {
        for (const page of pages) page.close();
        await processes?.close();
        await vite.close();
    }
}
