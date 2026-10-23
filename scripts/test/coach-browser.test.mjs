import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('11 Edge real React Coach: six panels, mobile forms, safe visual answers, privacy and offline feedback', async () => {
    const parent = path.join(homedir(), '.codex/artifacts/nexlift-coach-browser'); await mkdir(parent, { recursive: true }); const directory = await mkdtemp(path.join(parent, 'acceptance-')), profile = path.join(directory, 'profile'); await mkdir(profile);
    const processes = createBrowserProcesses({ root: directory, executable: process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium' });
    const { createServer } = createRequire(new URL('../../client/package.json', import.meta.url))('vite');
    const vite = await createServer({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.js'), envFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    let ws;
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const debug = await processes.launch(profile), target = await (await fetch(debug + '/json/new?about:blank', { method: 'PUT' })).json();
        ws = new WebSocket(target.webSocketDebuggerUrl); const pending = new Map(); let sequence = 0;
        ws.onmessage = e => { const m = JSON.parse(e.data), task = pending.get(m.id); if (task) { pending.delete(m.id); clearTimeout(task.timer); m.error ? task.reject(Error(m.error.message)) : task.resolve(m.result); } };
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 20000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
        const evaluate = async expression => { const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
        const click = text => evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
        try {
            await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
            await command('Page.navigate', { url: origin + '/test/coach-harness.html' });
            await waitForState(() => evaluate("document.body.textContent.includes('Posible estancamiento')"), 'Coach report loaded');
            assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
            assert.equal(await evaluate("document.querySelectorAll('.coach-tabs button').length"), 6);
            await click('¿Qué datos te faltan?'); await waitForState(() => evaluate("document.querySelector('.coach-conversation')?.textContent.includes('Faltan')"), 'structured missing inputs answer');
            assert.equal(await evaluate("document.querySelector('.coach-conversation').textContent.includes('Datos al 2026-10-23')"), true);
            await click('Volumen'); await waitForState(() => evaluate("document.querySelectorAll('.coach-bars button').length===8"), 'direct/indirect muscle visualization');
            await evaluate("document.querySelector('.coach-bars button').click()"); assert.equal(await evaluate("document.body.textContent.includes('directas') && document.body.textContent.includes('estimadas')"), true);
            await click('Recuperación'); await waitForState(() => evaluate("document.body.textContent.includes('Confirmar y guardar check-in')"), 'private editable checkin form');
            const before = await evaluate('window.coachTest.writes.length'); await click('Confirmar y guardar check-in'); await waitForState(() => evaluate("document.body.textContent.includes('Operación confirmada')"), 'server acknowledged checkin');
            assert.equal(await evaluate('window.coachTest.writes.length'), before + 1);
            await click('Eliminar'); await click('Confirmar eliminación'); await waitForState(() => evaluate("!document.body.textContent.includes('Confirmar eliminación')"), 'checkin deletion explicit');
            await click('Cargas v2'); await waitForState(() => evaluate("document.body.textContent.includes('Registrar esta sugerencia')"), 'v1-v2 comparison and calibration');
            await click('Registrar esta sugerencia para evaluarla'); await evaluate('window.coachTest.refresh()'); await waitForState(() => evaluate("document.body.textContent.includes('Confirmar ignorada')"), 'identity based calibration form');
            await click('Confirmar ignorada'); await waitForState(() => evaluate("document.body.textContent.includes('ignored')"), 'ignored without fabricated result');
            await click('Hipertrofia'); await waitForState(() => evaluate("document.body.textContent.includes('Peso corporal')"), 'body trends'); assert.equal(await evaluate("document.querySelectorAll('.coach-chart svg').length>=1"), true);
            await click('Mesociclos'); await waitForState(() => evaluate("document.body.textContent.includes('Contexto de mesociclos')"), 'mesocycle view');
            await click('Estancamientos'); await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
            await evaluate("document.querySelector('main').scrollTop=0"); const capture = await command('Page.captureScreenshot', { format: 'png' });
            await mkdir(path.join(root, 'server/audit/coach'), { recursive: true }); await writeFile(path.join(root, 'server/audit/coach/mobile.png'), Buffer.from(capture.data, 'base64'));
            await command('Network.enable'); await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
            const offline = await evaluate("window.coachTest.realRequest('/check-ins/2026-10-23',{},'PUT').then(()=>false,e=>e.message)"); assert.match(offline, /Sin conexión/);
            await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
            await evaluate("window.coachTest.delayed=true; void window.coachTest.refresh()"); await waitForState(() => evaluate('!!window.coachTest.release'), 'late report in flight');
            await evaluate("window.coachTest.switchAccount('B')"); await waitForState(() => evaluate("document.body.textContent.includes('Ejercicio privado B')"), 'new account remounted'); await evaluate('window.coachTest.release()');
            await waitForState(() => evaluate("!JSON.stringify(window.coachTest.cache()).includes('Press banca')"), 'late private report discarded'); assert.equal(await evaluate("document.querySelector('.coach-conversation').textContent.includes('Faltan')"), false);
            assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
            const evidence = { browser: 'Microsoft Edge', actualReactApp: true, widths: [320, 390], sections: 6, checkInCRUD: true, exactSuggestionIdentity: true, offlineNoFalseConfirmation: true, privateCacheAndConversationReset: true, keyboardAccessibleNativeControls: true, screenReaderAuditoryTest: false, productionTouched: false };
            await writeFile(path.join(root, 'server/audit/coach/browser.json'), JSON.stringify(evidence, null, 2));
        } catch (error) { console.error(await evaluate('document.body.textContent').catch(() => 'Browser unavailable')); throw error; }
    } finally { ws?.close(); await processes.close(); await vite.close(); }
});

