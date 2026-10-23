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
export async function runConflictBrowser({ root, backend, tokenA, tokenB, counts, t, db, fault, restart }) {
    const { createServer } = await import('../../../client/node_modules/vite/dist/node/index.js');
    const react = (await import('../../../client/node_modules/@vitejs/plugin-react/dist/index.js')).default;
    const tailwind = (await import('../../../client/node_modules/@tailwindcss/vite/dist/index.mjs')).default;
    const vite = await createServer({ configFile: false, envFile: false, root: fileURLToPath(new URL('../../../client/', import.meta.url)),
        plugins: [react(), tailwind()], logLevel: 'silent',
        define: { 'import.meta.env.VITE_INDEXEDDB_ENABLED': '"true"', 'import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED': '"true"', 'import.meta.env.VITE_CONFLICT_RESOLUTION_ENABLED': '"true"', 'import.meta.env.VITE_API_URL': '"/api"' },
        server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { target: backend, changeOrigin: true } } } });
    let processes; const pages = [];
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const executable = process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium';
        if (!existsSync(executable)) throw new Error('Real Edge/Chromium required');
        const profile = path.join(root, 'phase34-browser'); await mkdir(profile);
        processes = createBrowserProcesses({ root, executable });
        const launch = () => processes.launch(profile);
        let debugging = await launch();
        async function page(app = false) {
            const target = await (await fetch(debugging + '/json/new?about:blank', { method: 'PUT' })).json();
            const connection = await cdp(target.webSocketDebuggerUrl); pages.push(connection);
            await connection.command('Page.enable'); await connection.command('Network.enable');
            await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}) { localStorage.setItem('nexlift_token',${JSON.stringify(tokenA)});localStorage.setItem('nexlift_user',JSON.stringify({id:'A',username:'A'})); }` });
            await connection.command('Page.navigate', { url: origin + (app ? '/' : '/test/conflict-harness.html') });
            await until(() => connection.evaluate(`document.readyState==='complete'`), 'document');
            if (app) await until(() => connection.evaluate(`(async()=>{const {operationRuntime}=await import('/src/services/api.js');const r=operationRuntime(),s=r.transport.snapshot();return s&&await r.transport.bound(s)&&document.querySelector('main');})().then(Boolean)`), 'verified React app');
            return { ...connection, targetId: target.id };
        }
        let first = await page();
        const names = await first.evaluate(`import('/test/conflict-cases.js').then(m=>m.caseNames)`);
        const settings = JSON.stringify({ tokenA, tokenB });
        for (let i = 0; i < names.length; i++) await t.test(names[i], async () => {
            const result = await first.evaluate(`import('/test/conflict-cases.js').then(m=>m.runCase(${i},${settings}))`);
            assert.equal(result.passed, true);
        });

        await t.test('dos pestañas Edge reales conservan una sola decisión atómica', async () => {
            const prepared = await first.evaluate(`import('/test/conflict-cases.js').then(m=>m.prepareSharedDecision())`);
            const second = await page();
            const expression = `import('/test/conflict-cases.js').then(m=>m.confirmSharedDecision(${JSON.stringify(prepared)},${settings}))`;
            const result = await Promise.all([first.evaluate(expression), second.evaluate(expression)]);
            assert.equal(result.filter(r=>r.prepared).length,1);
            const count = await second.evaluate(`import('/src/storage/database.js').then(async m=>{const d=m.createDatabase({name:${JSON.stringify(prepared.name)},conflictsEnabled:true});await d.open();const n=await d.operations.count();d.close();return n;})`);
            assert.equal(count,2);
        });

        await t.test('cierre de navegador durante decisión pendiente y respuesta perdida tras COMMIT', async () => {
            await first.evaluate(`import('/test/conflict-cases.js').then(m=>m.prepareLostReply())`);
            await fault('after');
            const saved = await first.evaluate(`import('/test/conflict-cases.js').then(m=>m.sendLostReply())`);
            assert.equal(saved.status,'retry_scheduled');
            const before = await counts();
            await first.command('Browser.close'); 
            await restart();
            debugging = await launch(new URL(debugging).port); first = await page();
            const result = await first.evaluate(`import('/test/conflict-cases.js').then(m=>m.recoverLostReply(${JSON.stringify(saved)},${settings}))`);
            assert.equal(result.status,'confirmed'); assert.deepEqual(await counts(),before);
            assert.equal((await db.setLog.findUnique({where:{id:result.setId}})).weight,277);
        });
        await t.test('interfaz React compara campos, prepara vista previa, conserva originales y sobrevive recarga', async () => {
            await first.evaluate(`import('/test/conflict-cases.js').then(m=>m.seedVisibleConflict())`);
            const app = await page(true);
            await until(()=>app.evaluate(`document.querySelector('[data-conflict-status]')?.textContent.includes('Este entrenamiento cambió')`),'conflict panel');
            await app.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Ver diferencias').click();true`);
            await until(()=>app.evaluate(`!!document.querySelector('[aria-label="Comparación del entrenamiento"]')`),'comparison');
            assert(await app.evaluate(`document.body.textContent.includes('Original')&&document.body.textContent.includes('Servidor')`));
            await app.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Vista previa: aplicar mis cambios').click();true`);
            await until(()=>app.evaluate(`!!document.querySelector('[data-conflict-preview]')`),'preview without write');
            assert(await app.evaluate(`document.querySelector('[data-conflict-preview]').textContent.includes('UI local')`));
            await app.evaluate(`{const s=document.querySelector('select[aria-label="Conservar session:notes"]');s.value='local';s.dispatchEvent(new Event('change',{bubbles:true}));}true`);
            await app.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Revisar selección manual').click();true`);
            await until(()=>app.evaluate(`!!document.querySelector('[data-conflict-preview]')`),'manual preview');
            await app.evaluate(`[...document.querySelectorAll('[data-conflict-status] button')].find(b=>b.textContent==='Confirmar resolución').click();true`);
            await until(()=>app.evaluate(`document.querySelector('[data-conflict-status]')?.textContent.includes('Resuelto; originales conservados')`),'manual resolution confirmed');
            assert(await db.workoutLog.count({where:{notes:'UI local'}})===1);
            await app.command('Page.reload');
            await until(()=>app.evaluate(`!!document.querySelector('[data-conflict-status]')`),'persisted conflicts');
        });
        await t.test('borrador anterior sin campo notes recupera las notas base y guardar no las borra', async () => {
            const app = await page(true);
            const logId = await app.evaluate(`(async()=>{const {api}=await import('/src/services/api.js');const {getStorageRuntime}=await import('/src/storage/runtime.js');
                const created=await api.logWorkout('A-Exercise',[{weight:77,reps:8,rpe:8,completed:true}],'Nota original conservada',{ownerId:'A'});
                const session=await api.getWorkoutSession(created.workoutLog.id);
                const sets=session.sets.map(s=>({id:s.id,weight:String(s.weight),reps:String(s.reps),weightRight:'',repsRight:'',rir:10-s.rpe,completed:s.completed}));
                await getStorageRuntime().drafts.editor('session',session.id,'A').save({session,sets,isUnilateral:false});return session.id;})()`);
            const before = await counts();
            await app.command('Page.navigate',{url:origin+'/session/'+logId+'/edit'});
            await until(()=>app.evaluate(`!!document.querySelector('textarea[aria-label="Notas del entrenamiento"]')`),'recovered notes');
            assert.equal(await app.evaluate(`document.querySelector('textarea[aria-label="Notas del entrenamiento"]').value`),'Nota original conservada');
            await app.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Guardar').click();true`);
            await until(()=>app.evaluate(`location.pathname==='/settings'`),'unchanged draft saved');
            assert.equal((await db.workoutLog.findUnique({where:{id:logId}})).notes,'Nota original conservada');
            assert.deepEqual(await counts(),before);
        });
        return {browser:'Microsoft Edge real',realIndexedDB:true,realPostgres:true,independentClients:true,
            physicalBrowserRestart:true,serverRestart:true,productionTouched:false};
    } finally {
        for(const page of pages) page.close();
        await processes?.close();
        await vite.close();
    }
}
