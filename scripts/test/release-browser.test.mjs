import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';

test('10 Edge measures actual React first dashboard render on three fresh documents', async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const parent = path.join(homedir(), '.codex/artifacts/nexlift-verification'); await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(path.join(parent, 'phase10-browser-')), profile = path.join(directory, 'profile'); await mkdir(profile);
    const processes = createBrowserProcesses({ root: directory, executable: process.platform === 'win32'
        ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium' });
    const require = createRequire(new URL('../../client/package.json', import.meta.url));
    const { createServer } = require('vite');
    const vite = await createServer({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.js'), envFile: false,
        server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    let ws;
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const debug = await processes.launch(profile), target = await (await fetch(debug + '/json/new?about:blank', { method: 'PUT' })).json();
        ws = new WebSocket(target.webSocketDebuggerUrl); const pending = new Map(); let sequence = 0;
        ws.onmessage = event => { const message = JSON.parse(event.data), task = pending.get(message.id); if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } };
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        const command = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 20000);
            pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async expression => { const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (value.exceptionDetails) throw Error('Browser evaluation failed'); return value.result?.value; };
        const measurements = [];
        await command('Network.enable'); await command('Network.setCacheDisabled', { cacheDisabled: true });
        for (let index = 0; index < 3; index++) {
            await command('Page.navigate', { url: 'about:blank' });
            await command('Page.navigate', { url: origin + '/test/frontend-harness.html' });
            await waitForState(() => evaluate("document.body.textContent.includes('Confirmado A')"), 'dashboard render');
            const measured = await evaluate(`({dashboardVisibleMs:performance.now(),firstContentfulPaintMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime??null,
                resources:performance.getEntriesByType('resource').length,homeRequests:window.frontend.reads.filter(x=>x.domain==='home').length})`);
            assert.equal(measured.homeRequests, 1); assert(measured.dashboardVisibleMs > 0); measurements.push(measured);
        }
        const sorted = measurements.map(m => m.dashboardVisibleMs).sort((a, b) => a - b);
        await mkdir(path.join(root, 'server/audit/release'), { recursive: true });
        await writeFile(path.join(root, 'server/audit/release/browser-performance.json'), JSON.stringify({ browser: 'Edge desktop',
            mode: 'Vite development, synthetic HTTP harness, disabled browser cache, warm compiler', measurements,
            p50: sorted[1], p95: sorted[2], n: 3, note: 'Small descriptive sample, polled upper bound to visible dashboard; not Lighthouse, production load or physical iPhone.' }, null, 2));
    } finally { ws?.close(); await processes.close(); await vite.close(); }
});
