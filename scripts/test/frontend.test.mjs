import { assertLintSubset } from '../lib/lint-baseline.mjs';
import test from 'node:test';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, realpath, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../client/package.json', import.meta.url));
async function cdp(url) {
    const ws = new WebSocket(url), pending = new Map(); let sequence = 0;
    ws.onmessage = e => { const message = JSON.parse(e.data), task = pending.get(message.id); if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } };
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    return { close: () => ws.close(), command: (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 15000);
        pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
    }) };
}

test('8 Edge actual App: remote cache, invalidation, account switch, ignored late response and mobile layout', async () => {
    const isolated = await mkdtemp(path.join(await realpath(tmpdir()), 'nexlift-phase8-browser-')), profile = path.join(isolated, 'owned-profile'); await mkdir(profile);
    const processes = createBrowserProcesses({ root: isolated, executable: process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium' });
    const { createServer } = require('vite');
    const vite = await createServer({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.js'), envFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const debug = await processes.launch(profile), target = await (await fetch(debug + '/json/new?about:blank', { method: 'PUT' })).json(), page = await cdp(target.webSocketDebuggerUrl);
        const evaluate = async expression => { const result = await page.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; };
        try {
            await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
            await page.command('Page.navigate', { url: origin + '/test/frontend-harness.html' });
            await waitForState(() => evaluate("document.body.textContent.includes('Confirmado A')"), 'actual account A Dashboard');
            assert.equal(await evaluate("window.frontend.reads.filter(x=>x.domain==='home').length"), 1);
            await evaluate("[...document.querySelectorAll('a[href=\"/routines\"]')].at(-1).click()");
            await waitForState(() => evaluate("document.body.textContent.includes('Mis Rutinas') && document.body.textContent.includes('Confirmado A')"), 'actual Routines');
            await evaluate("[...document.querySelectorAll('a[href=\"/\"]')].at(-1).click()");
            await waitForState(() => evaluate("document.body.textContent.includes('Confirmado A') && !document.body.textContent.includes('Mis Rutinas')"), 'cached Dashboard remount');
            assert.equal(await evaluate("window.frontend.reads.filter(x=>x.domain==='home').length"), 1);
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
            await evaluate("localStorage.setItem('workout-unrelated-draft','preserved'); window.frontend.delay=true; void window.frontend.refresh()");
            await waitForState(() => evaluate('!!window.frontend.release'), 'delayed A response in flight');
            await evaluate("window.frontend.switchAccount('B')");
            await waitForState(() => evaluate("document.body.textContent.includes('Confirmado B')"), 'account B rendered');
            await evaluate('window.frontend.release()');
            await waitForState(() => evaluate("!JSON.stringify(window.frontend.cache()).includes('Confirmado A')"), 'old private cache absent');
            assert.equal(await evaluate("document.body.textContent.includes('Confirmado A')"), false);
            assert.equal(await evaluate("localStorage.getItem('workout-unrelated-draft')"), 'preserved');
            await evaluate('void window.frontend.refresh()');
            await waitForState(() => evaluate("window.frontend.reads.filter(x=>x.domain==='home' && x.owner==='B').length===2"), 'confirmed remote invalidation');
            await page.command('Network.enable');
            await page.command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
            await waitForState(() => evaluate("document.body.textContent.includes('Sin conexión.')"), 'visible offline status');
            assert.equal(await evaluate("localStorage.getItem('workout-unrelated-draft')"), 'preserved');
            await page.command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
            await waitForState(() => evaluate("!document.body.textContent.includes('Sin conexión.')"), 'connection recovered without deleting drafts');
            const evidence = { browser: 'Microsoft Edge', actualApp: true, mobile: { width: 390, height: 844 }, reads: await evaluate('window.frontend.reads'), privateCacheIsolated: true, localDraftPreserved: true, launches: processes.launches, productionTouched: false };
            await mkdir(path.join(root, 'server/audit/frontend'), { recursive: true });
            await writeFile(path.join(root, 'server/audit/frontend/browser-evidence.json'), JSON.stringify(evidence, null, 2));
            // The second scenario mounts the exact extracted production components.
            await page.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
            await evaluate('window.frontend.editor()');
            await waitForState(() => evaluate("!!document.getElementById('callback-version')"), 'extracted training editor');
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
            await evaluate("document.getElementById('callback-version').click()");
            await waitForState(() => evaluate("document.getElementById('callback-version').textContent.includes('2')"), 'new callback render');
            await evaluate("document.querySelector('[aria-label=\"Marcar serie 1 completada\"]').click()");
            assert.deepEqual(await evaluate('window.frontend.actions'), [2]);
            assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Serie 1 peso derecho\"]')"), true);
            await evaluate("document.getElementById('open-rir').focus(); document.getElementById('open-rir').click()");
            await waitForState(() => evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"), 'dialog initial focus');
            assert.equal(await evaluate("document.querySelector('[role=dialog]').getAttribute('aria-modal')"), 'true');
            await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 });
            assert.equal(await evaluate("document.activeElement.textContent.trim()"), 'Cancelar');
            await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
            await waitForState(() => evaluate("!document.querySelector('[role=dialog]') && document.activeElement.id==='open-rir'"), 'Escape and focus restored');
            const finalEvidence = { ...evidence, callbackCurrent: true, unilateralLabels: true, dialogKeyboard: true, offlineStatus: true };
            await writeFile(path.join(isolated, 'evidence.json'), JSON.stringify(finalEvidence));
            await writeFile(path.join(root, 'server/audit/frontend/browser-evidence.json'), JSON.stringify(finalEvidence, null, 2));
        } catch (error) {
            await writeFile(path.join(isolated, 'failure.json'), JSON.stringify(await evaluate('({body:document.body.textContent,reads:window.frontend?.reads})').catch(() => ({}))));
            throw error;
        } finally { page.close(); }
    } finally { await processes.close(); await vite.close(); }
});

test('8 private reads and cache adapter never replace the offline protocol or service worker', async () => {
    for (const file of ['main.jsx', 'pages/Workout.jsx', 'pages/EditSession.jsx', 'pages/Dashboard.jsx', 'pages/Progress.jsx', 'pages/Routines.jsx', 'pages/RoutineDetail.jsx', 'pages/BodyTracking.jsx', 'app/RemoteProvider.jsx']) {
        const source = await readFile(path.join(root, 'client/src', file), 'utf8');
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX), bindings = new Set(), tags = new Set();
        const visit = node => {
            if ((ts.isImportClause(node) || ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) bindings.add(node.name.text);
            if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && /^[A-Z]/.test(node.tagName.text)) tags.add(node.tagName.text);
            ts.forEachChild(node, visit);
        };
        visit(ast);
        for (const tag of tags) assert(bindings.has(tag), `${file}: unbound JSX component ${tag}`);
    }
    const message = { ruleId: 'test-rule', severity: 2, message: 'Received finding' };
    const baseline = { findings: [{ file: 'received.jsx', messages: [message] }] };
    assert.doesNotThrow(() => assertLintSubset([], root, baseline));
    assert.throws(() => assertLintSubset([{ filePath: path.join(root, 'new.jsx'), messages: [message] }], root, baseline), /New lint finding/);
    const remote = await readFile(path.join(root, 'client/src/app/remote.ts'), 'utf8');
    assert(!/indexedDB|deleteDatabase|enqueueWrite|\.capture\(|persistQueryClient/.test(remote));
    const bridge = await readFile(path.join(root, 'client/src/app/RemoteProvider.jsx'), 'utf8');
    assert.match(bridge, /status === 'confirmed' && x.receipt/);
    assert.match(bridge, /status === 'synced' && x.receipt/);
    const sw = await readFile(path.join(root, 'client/public/sw.js'), 'utf8');
    assert.match(sw, /request.headers.has\('Authorization'\)/);
    assert(!/indexedDB\.deleteDatabase|localStorage\.clear/.test(sw));
});

test('8 first PWA installation caches its initial assets and reopens after a full offline browser restart', async () => {
    const isolated = await mkdtemp(path.join(await realpath(tmpdir()), 'nexlift-phase8-pwa-'));
    const dist = path.join(isolated, 'dist'), profile = path.join(isolated, 'owned-profile'); await mkdir(profile);
    const { build } = require('vite');
    const previous = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'production';
        await build({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.js'), envFile: false, logLevel: 'error', build: { outDir: dist, emptyOutDir: false } });
    } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
    let offline = false;
    const server = http.createServer(async (request, response) => {
        if (offline) { response.destroy(); return; }
        try {
            const url = new URL(request.url, 'http://127.0.0.1');
            const relative = url.pathname === '/login' || url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
            const file = path.resolve(dist, relative);
            assert(file.startsWith(dist + path.sep));
            const bytes = await readFile(file);
            response.setHeader('Cache-Control', 'no-cache');
            response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream');
            response.end(bytes);
        } catch { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const processes = createBrowserProcesses({ root: isolated, executable: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    async function open() {
        const debug = await processes.launch(profile), target = await (await fetch(debug + '/json/new?about:blank', { method: 'PUT' })).json(), page = await cdp(target.webSocketDebuggerUrl);
        const evaluate = async expression => { const result = await page.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; };
        await page.command('Page.navigate', { url: origin + '/login' });
        return { page, evaluate };
    }
    let current;
    try {
        current = await open();
        await waitForState(() => current.evaluate("!!navigator.serviceWorker.controller && !!document.getElementById('login-username')"), 'first controlled PWA');
        assert.equal(await current.evaluate("performance.getEntriesByType('navigation')[0].type"), 'navigate');
        const assets = await current.evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(name=>new URL(name).pathname.startsWith('/assets/') || new URL(name).pathname==='/logo.png')");
        assert(assets.length >= 3);
        await waitForState(() => current.evaluate(`Promise.all(${JSON.stringify(assets)}.map(url=>caches.match(url))).then(rows=>rows.every(Boolean))`), 'first-install initial assets cached');
        current.page.close(); await processes.close();
        offline = true;
        current = await open();
        await waitForState(() => current.evaluate("!!document.getElementById('login-username')"), 'PWA fully offline cold restart');
        await writeFile(path.join(root, 'server/audit/frontend/pwa-first-install.json'), JSON.stringify({ realEdge: true, firstClaimReloaded: false, initialAssetsCached: assets.length, browserRestart: true, networkAndApiUnavailable: true, actualCompiledApp: true, productionTouched: false }, null, 2));
    } finally {
        current?.page.close(); await processes.close();
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
});
