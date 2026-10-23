import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));

test('availability Edge: production React workout, real SW, proxy outage, suspend/resume and update preserve private drafts', async () => {
    const parent = path.join(homedir(), '.codex/artifacts/nexlift-verification'); await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(path.join(parent, 'availability-browser-')), profile = path.join(directory, 'profile'); await mkdir(profile);
    const processes = createBrowserProcesses({ root: directory, executable: process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium' });
    let mode = 200, revision = 1, socketDown = false;
    const events = [], requests = [], sockets = new Set();
    const event = (name, detail = {}) => events.push({ at: new Date().toISOString(), name, ...detail });
    const exercise = { id: 'ex', name: 'Press sintético', muscleGroup: 'Pecho', targetSets: 3, targetReps: '8-12', restSeconds: 60, isUnilateral: false };
    const routine = { id: 'routine', name: 'Rutina sintética', isActive: true, days: [{ id: 'day', dayName: 'Día sintético', exercises: [exercise] }] };
    const server = createServer(async (req, res) => {
        const pathname = new URL(req.url, 'http://local.invalid').pathname;
        requests.push({ at: new Date().toISOString(), pathname, method: req.method });
        if (socketDown) { req.socket.destroy(); return; }
        if (mode !== 200 && pathname !== '/sw.js') { res.writeHead(mode, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('Service is not reachable'); return; }
        if (pathname.startsWith('/api/')) {
            const owner = req.headers.authorization?.includes('synthetic-B') ? 'B' : 'A';
            let body = [];
            if (pathname === '/api/auth/me') body = { id: owner, username: owner, isActive: true };
            else if (pathname === '/api/routines') body = [routine];
            else if (pathname === '/api/stats/home') body = { stats: { totalWorkouts: 11 }, activeRoutine: routine, prs: [], consistencyCounts: {}, plateauCount: 0 };
            else if (pathname === '/api/workouts/today-log') body = null;
            else if (pathname === '/api/push/vapid-public-key') body = {};
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); return;
        }
        try {
            const asset = pathname.startsWith('/assets/');
            const filename = pathname === '/sw.js' ? 'sw.js' : asset ? pathname.slice(1) : /\.(png|json|ico)$/.test(pathname) ? pathname.slice(1) : 'index.html';
            const bytes = await readFile(path.join(root, 'client/dist', filename));
            const type = filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.png') ? 'image/png' : filename.endsWith('.json') ? 'application/json' : 'text/html';
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': asset ? 'public,max-age=31536000,immutable' : 'no-store' });
            res.end(filename === 'sw.js' ? Buffer.concat([bytes, Buffer.from(`\n// synthetic revision ${revision}\n`)]) : bytes);
        } catch { res.writeHead(404).end(); }
    });
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
    let ws;
    try {
        const debug = await processes.launch(profile), target = await (await fetch(debug + '/json/new?about:blank', { method: 'PUT' })).json();
        ws = new WebSocket(target.webSocketDebuggerUrl); const pending = new Map(); let sequence = 0;
        ws.onmessage = e => { const m = JSON.parse(e.data), task = pending.get(m.id); if (task) { pending.delete(m.id); clearTimeout(task.timer); m.error ? task.reject(Error(m.error.message)) : task.resolve(m.result); } };
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 20000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
        const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; };
        await command('Page.enable'); await command('Network.enable');
        await command('Page.navigate', { url: origin + '/login' });
        await waitForState(() => evaluate('!!document.querySelector("#root")'), 'first shell');
        await evaluate(`localStorage.setItem('nexlift_token','x.'+btoa(JSON.stringify({userId:'A'}))+'.x'); localStorage.setItem('nexlift_user',JSON.stringify({id:'A',username:'A'}));`);
        await command('Page.navigate', { url: origin + '/workout/day' });
        await waitForState(() => evaluate("document.body.textContent.includes('Press sintético') && !!document.querySelector('input')"), 'real React workout');
        await waitForState(() => evaluate('!!navigator.serviceWorker.controller'), 'controlled worker');
        await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('availability-private',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts','readwrite');t.objectStore('drafts').put({ownerId:'A',reps:8},'A');t.objectStore('drafts').put({ownerId:'B',reps:12},'B');t.oncomplete=()=>{db.close();resolve(true)};t.onerror=reject};r.onerror=reject})`);
        await evaluate(`{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'82.5');input.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await waitForState(() => evaluate("Object.keys(localStorage).some(k=>k.startsWith('nexlift_draft_v2:') && localStorage.getItem(k).includes('82.5'))"), 'durable real workout draft');
        const timeOrigin = await evaluate('performance.timeOrigin'), before = await evaluate('Object.fromEntries(Object.entries(localStorage))');
        event('workout_draft_saved'); revision++;
        await evaluate('window.workerChanges=0; navigator.serviceWorker.addEventListener("controllerchange",()=>window.workerChanges++); navigator.serviceWorker.getRegistration().then(r=>r.update())');
        await waitForState(() => evaluate('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)'), 'real worker update waiting safely');
        // Simulate the automatic message sent by the already deployed v4 UI.
        await evaluate('navigator.serviceWorker.getRegistration().then(r=>r.waiting.postMessage({type:"SKIP_WAITING"}))');
        assert.equal(await evaluate('window.workerChanges'), 0);
        assert.equal(await evaluate('performance.timeOrigin'), timeOrigin);
        assert.equal(await evaluate("document.querySelector('input').value"), '82.5'); event('worker_update_waiting_without_reload');
        await command('Page.setWebLifecycleState', { state: 'frozen' }); event('browser_frozen');
        mode = 503; await command('Page.setWebLifecycleState', { state: 'active' }); event('browser_resumed_backend_503');
        assert.equal(await evaluate('performance.timeOrigin'), timeOrigin); assert.equal(await evaluate("document.querySelector('input').value"), '82.5');
        for (const status of [502, 503]) {
            mode = status; await command('Page.navigate', { url: origin + '/workout/day' });
            await waitForState(() => evaluate("!!document.querySelector('#root') && !document.body.textContent.includes('Service is not reachable')"), `proxy ${status} shell fallback`);
            assert.equal(await evaluate("localStorage.getItem('nexlift_token')"), before.nexlift_token); event('proxy_navigation_shell', { status });
        }
        // A refused/destroyed upstream socket is distinct from an HTTP error.
        socketDown = true; await command('Page.navigate', { url: origin + '/workout/day' });
        await waitForState(() => evaluate("!!document.querySelector('#root')"), 'unavailable socket shell'); event('socket_unavailable_shell');
        socketDown = false; mode = 200;
        await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'cellular4g' });
        await command('Network.emulateNetworkConditions', { offline: false, latency: 10, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' });
        const resumedDocument = await evaluate('performance.timeOrigin');
        // Allow the bounded event cooldown; no navigation/reload is requested.
        await evaluate('new Promise(resolve=>setTimeout(resolve,5500)).then(()=>window.dispatchEvent(new Event("pageshow")))');
        await waitForState(() => evaluate("document.body.textContent.includes('Press sintético') && document.querySelector('input')?.value==='82.5'"), 'network recovered real draft');
        assert.equal(await evaluate('performance.timeOrigin'), resumedDocument);
        event('recovered_workout_draft');
        const privateRows = await evaluate(`new Promise(resolve=>{const r=indexedDB.open('availability-private');r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts'),q=t.objectStore('drafts').getAll();q.onsuccess=()=>{resolve(q.result);db.close()}}})`);
        assert.deepEqual(privateRows, [{ ownerId: 'A', reps: 8 }, { ownerId: 'B', reps: 12 }]);
        // The installed worker must contain no private HTTP responses.
        const cached = await evaluate(`caches.keys().then(keys=>Promise.all(keys.map(async key=>({key,urls:(await (await caches.open(key)).keys()).map(r=>new URL(r.url).pathname)}))))`);
        assert(!cached.some(c => c.urls.some(url => url.startsWith('/api/'))));
        assert.equal(requests.filter(r => !['GET', 'HEAD'].includes(r.method)).length, 0);
        const after = await evaluate('Object.fromEntries(Object.entries(localStorage))');
        for (const [key, value] of Object.entries(before)) assert.equal(after[key], value, `original durable key ${key} preserved`);
        await mkdir(path.join(root, 'server/audit/hotfix'), { recursive: true });
        await writeFile(path.join(root, 'server/audit/hotfix/browser-evidence.json'), JSON.stringify({ executedAt: new Date().toISOString(), browser: 'Edge desktop', realProductionReact: true, realServiceWorker: true, physicalIOS: false,
            networkChange: 'CDP cellular4g → offline → wifi; no physical radios', suspension: 'CDP frozen → active; no iOS OS termination', events, requests, noMutations: true, indexedDBRowsPreserved: privateRows.length, caches: cached }, null, 2));
    } finally { ws?.close(); await processes.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
});
