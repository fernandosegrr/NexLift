// Targeted release regressions only. No operational URLs, Docker or providers.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { cleanStageEnvironment } from '../server/staging/environment.mjs';
assert.equal(process.versions.node, '24.22.1'); assert.equal(process.argv.length, 2);
const root = fileURLToPath(new URL('../', import.meta.url));
const parent = path.join(homedir(), '.codex/artifacts'); await mkdir(parent, { recursive: true });
const logs = await mkdtemp(path.join(parent, 'nexlift-hotfix-validation-'));
const npm = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
const env = { ...cleanStageEnvironment(), PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || process.env.Path || ''}`, CI: 'true', DATABASE_URL: '', NODE_ENV: 'test', PRISMA_SKIP_POSTINSTALL_GENERATE: 'true' };
const results = [], destination = path.join(root, 'server/audit/hotfix/validation.json');
await mkdir(path.dirname(destination), { recursive: true });
for (const [name, args] of [
    ['generate', [npm, 'run', 'db:generate']],
    ['build', [npm, 'run', 'build']],
    ['typescript', [npm, 'run', 'check:typescript']],
    ['client', [npm, 'run', 'test:client']],
    ['frontend', [npm, 'run', 'test:frontend']],
    ['http-sw-jobs', ['--test', 'server/test/availability-sw.test.js', 'server/test/stabilization-sw.test.js', 'server/test/phase7-http.test.js', 'server/test/phase7-notifications.test.js', 'server/test/phase10-release.test.js']],
    ['postgres-release', [npm, 'run', 'test:release:integration']],
    ['availability-browser', ['--test', 'scripts/test/availability-browser.test.mjs']],
    ['bundle', [npm, 'run', 'check:bundle']],
    ['tooling-lint', [npm, 'run', 'lint:tooling']],
    ['release-lint', [npm, 'run', 'lint:release']],
]) {
    const startedAt = new Date().toISOString(), started = Date.now();
    const result = spawnSync(process.execPath, args, { cwd: root, env: { ...env, NODE_ENV: name === 'build' ? 'production' : 'test' }, windowsHide: true, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
    const output = (result.stdout || '') + (result.stderr || ''), plain = stripVTControlCharacters(output);
    await writeFile(path.join(logs, name + '.private.log'), output);
    const row = { name, startedAt, milliseconds: Date.now() - started, exit: result.status,
        tests: [...plain.matchAll(/(?:ℹ |# )tests (\d+)|Tests\s+(\d+) passed/g)].reduce((n, m) => n + Number(m[1] || m[2]), 0) };
    results.push(row);
    await writeFile(destination, JSON.stringify({ source: 'main + availability hotfix', node: process.versions.node, logs, productionAccessed: false, dockerExecuted: false, physicalIOS: false, complete: false, results }, null, 2) + '\n');
    console.log(JSON.stringify(row));
    assert(!result.error && result.status === 0, `${name} failed; inspect ${path.join(logs, name + '.private.log')}`);
}
await writeFile(destination, JSON.stringify({ source: 'main + availability hotfix', node: process.versions.node, logs, productionAccessed: false, dockerExecuted: false, physicalIOS: false,
    complete: true, testExecutions: results.reduce((n, row) => n + row.tests, 0), fullHistoricalMatrixRerun: false, results }, null, 2) + '\n');
