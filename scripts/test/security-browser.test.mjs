import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../client/package.json', import.meta.url));
async function connect(url) {
    const socket = new WebSocket(url), tasks = new Map(); let sequence = 0;
    socket.onmessage = event => { const message = JSON.parse(event.data), task = tasks.get(message.id); if (task) {
        tasks.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result);
    } };
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    return { close: () => socket.close(), command: (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { tasks.delete(id); reject(Error(method)); }, 15000);
        tasks.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    }) };
}
test('9 Edge/React: explicit stop awaits the real HTTP scheduling receipt; PWA unmount preserves a valid reminder', async () => {
    const isolated = await mkdtemp(path.join(await realpath(tmpdir()), 'nexlift-phase9-browser-')), profile = path.join(isolated, 'owned-profile'); await mkdir(profile);
    const processes = createBrowserProcesses({ root: isolated, executable: process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium' });
    const { createServer } = require('vite');
    const requests = [], pending = [];
    const handleApi = (request, response, next) => {
        if (!request.url.startsWith('/api/')) return next();
        if (request.url !== '/api/workouts/rest-reminder') { response.writeHead(404, { 'Content-Type': 'application/json' }).end('{}'); return; }
        let text = ''; request.on('data', chunk => { text += chunk; }); request.on('end', () => {
            const payload = JSON.parse(text || '{}');
            requests.push({ method: request.method, payload, authenticatedAsSyntheticA: request.headers.authorization === 'Bearer synthetic-rest-A' });
            if (request.method === 'POST') pending.push(response);
            else response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"cancelled":true}');
        });
    };
    // No project proxy/.env. Register before Vite's terminal middleware so every
    // synthetic API response belongs to this fixture, never another backend.
    const vite = await createServer({ root: path.join(root, 'client'), configFile: false, envFile: false,
        plugins: [{ name: 'phase9-owned-api', configureServer(server) { server.middlewares.use(handleApi); } }],
        define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    let page;
    const release = index => pending[index].writeHead(202, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify({ reminder: { id: `generation-${index}`, fireAt: '2026-10-22T17:00:00.000Z' } }));
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const debug = await processes.launch(profile), target = await (await fetch(debug + '/json/new?about:blank', { method: 'PUT' })).json();
        page = await connect(target.webSocketDebuggerUrl);
        await page.command('Network.enable');
        await page.command('Network.setBlockedURLs', { urls: ['http://localhost:3001/*', 'http://127.0.0.1:3001/*'] });
        const evaluate = async expression => { const result = await page.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; };
        await page.command('Page.navigate', { url: origin + '/test/security-rest-harness.html' });
        await waitForState(() => evaluate("!!document.getElementById('start')"), 'actual React rest controls');
        await evaluate("document.getElementById('start').click()"); await waitForState(() => pending.length === 1, 'HTTP schedule in flight');
        await evaluate("document.getElementById('stop').click()");
        await waitForState(() => evaluate("document.getElementById('seconds').textContent==='sin temporizador'"), 'local timer stopped');
        assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
        release(0); await waitForState(() => evaluate("document.getElementById('status').textContent==='Cancelado'"), 'HTTP cancellation acknowledged');
        assert.deepEqual(requests.filter(r => r.method === 'DELETE').map(r => r.payload), [{ reminderId: 'generation-0', fireAt: '2026-10-22T17:00:00.000Z' }]);
        assert(requests.every(r => r.authenticatedAsSyntheticA));
        await evaluate("document.getElementById('start').click()"); await waitForState(() => pending.length === 2, 'second valid reminder');
        release(1); await waitForState(() => evaluate("document.getElementById('status').textContent==='Programado'"), 'valid schedule confirmed');
        await evaluate('window.restRehearsal.unmount()');
        assert.equal(requests.filter(r => r.method === 'DELETE').length, 1, 'Unmount must preserve valid server reminder');
        const evidence = { browser: 'Microsoft Edge', reactHookAndApiReal: true, httpReal: true, receiptAwaited: true,
            ownerPreserved: true, explicitCancellationAcknowledged: true, unmountPreserved: true, requests, productionTouched: false };
        await mkdir(path.join(root, 'server/audit/security'), { recursive: true });
        await writeFile(path.join(root, 'server/audit/security/browser-cancellation-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    } finally {
        for (const response of pending) if (!response.writableEnded) response.writeHead(503).end('{}');
        page?.close(); await processes.close(); await vite.close();
    }
});
