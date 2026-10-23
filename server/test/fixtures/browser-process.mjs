// Test-only process ownership. No user's browser or profile may enter here.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, rm, realpath, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitForState(task, label, timeout = 15000) {
    const start = Date.now(); let cause;
    while (Date.now() - start < timeout) {
        try { const result = await task(); if (result) return result; } catch (error) { cause = error; }
        await delay(100);
    }
    throw new Error(`Browser timeout: ${label}`, { cause });
}
async function version(origin) {
    return (await fetch(origin + '/json/version', { signal: AbortSignal.timeout(500) })).json();
}
export async function readBrowserReady(profile) {
    const [port, browserPath] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
    if (!/^\d+$/.test(port) || !browserPath?.startsWith('/devtools/browser/')) return false;
    const origin = `http://127.0.0.1:${port}`, current = await version(origin);
    if (new URL(current.webSocketDebuggerUrl).pathname !== browserPath) return false;
    return { origin, browserPath };
}
export function createBrowserProcesses({ root, executable }) {
    const owned = new Map(); const launches = [];
    async function scope(directory) {
        const parent = await realpath(root), profile = await realpath(directory);
        const relative = path.relative(parent, profile);
        assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Only a profile inside this test root is allowed');
        return profile;
    }
    async function closed(entry) {
        if (entry.origin) await waitForState(async () => {
            try { const current = await version(entry.origin); return new URL(current.webSocketDebuggerUrl).pathname !== entry.browserPath; } catch { return true; }
        }, 'owned previous debugging endpoint closed', 5000);
        if (entry.child.exitCode === null && entry.child.signalCode === null) {
            await waitForState(() => entry.child.exitCode !== null || entry.child.signalCode !== null, 'owned browser process exited', 5000);
        }
    }
    async function launch(directory) {
        const profile = await scope(directory), previous = owned.get(profile);
        if (previous) await closed(previous);
        // A stale file and a reused numeric port are both legitimate across a
        // restart. Verify the NEW browser UUID from BOTH readiness sources.
        await rm(path.join(profile, 'DevToolsActivePort'), { force: true });
        const child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
            '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-background-mode', '--disable-features=msEdgeSidebarV2',
            '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        const entry = { child, origin: null, browserPath: null, stderr: '', error: null }; owned.set(profile, entry);
        child.on('error', error => { entry.error = error; });
        child.stderr.on('data', chunk => { entry.stderr = (entry.stderr + chunk).slice(-32768); });
        try {
            const ready = await waitForState(async () => {
                if (entry.error) throw entry.error;
                return readBrowserReady(profile);
            }, 'new browser file and HTTP UUID agree');
            entry.origin = ready.origin;
            entry.browserPath = ready.browserPath;
            launches.push({ profile: path.relative(root, profile), port: new URL(ready.origin).port, browserPath: ready.browserPath });
            return ready.origin;
        } catch (error) {
            await appendFile(path.join(root, 'browser-start.private.log'), `${profile}\n${entry.stderr}\n${error.stack}\n`);
            throw error;
        }
    }
    async function close() {
        for (const entry of owned.values()) {
            if (entry.origin) {
                try {
                    const details = await version(entry.origin);
                    if (new URL(details.webSocketDebuggerUrl).pathname !== entry.browserPath) { await closed(entry); continue; }
                    const socket = new WebSocket(details.webSocketDebuggerUrl);
                    await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => { socket.close(); reject(new Error('Owned Browser.close timeout')); }, 5000);
                        socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })), { once: true });
                        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Owned browser socket failed')); }, { once: true });
                        socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
                    });
                } catch (error) {
                    try { await version(entry.origin); throw error; } catch (cause) { if (cause === error) throw cause; }
                }
            }
            if (entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill();
            await closed(entry);
        }
    }
    return { launch, close, launches };
}
