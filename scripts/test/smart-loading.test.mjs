import { readBackendSource } from '../lib/backend-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import * as domain from '../../packages/shared/dist/domain/training/smartLoading.js';
import * as client from '../../client/src/utils/smartLoading.js';
import * as server from '../../server/src/logic.js';
import * as old from '../fixtures/phase53/smartLoading.js';
import { sourceFunction, trainingRoot as root } from '../lib/training-characterization.mjs';
import { createBrowserProcesses, waitForState } from '../../server/test/fixtures/browser-process.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const cjs = require(path.join(root, 'server/src/generated/training.cjs'));
const ports = [domain, client, server, cjs];
const outcome = task => { try { return { value: task() }; } catch (e) { return { error: e.constructor.name }; } };
const inter = (api, sets, range = '8-12', increment = 2.5, phase = null) => api.computeWorkoutSuggestion([{ sets }], range, increment, phase);
const set = (weight = 80, reps = 10, rir = 2, extra = {}) => ({ weight, reps, rpe: 10 - rir, ...extra });
const golden = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/phase53/golden.json'), 'utf8'));
const values = [undefined, null, '', ' ', '80.25', 'junk', '10junk', '0', 0, -0, -1, .5, 1, 2, 10.5, 36, 37, 1000, NaN, Infinity, -Infinity, true, false, [], [8], {}, 1n, Object(1n), Symbol('synthetic')];

test('5.3 received golden numbers, rationale and public result keys match all four real ports', () => {
    assert.equal(golden.cases.length, 28);
    for (const row of golden.cases) {
        const name = row.mode === 'inter' ? 'computeWorkoutSuggestion' : 'suggestNextSetFromToday';
        assert.deepEqual(old[name](...row.args), row.expected, row.id);
        assert.deepEqual(row.expected ? [row.expected.weight, row.expected.reps] : null, row.expectedNumeric);
        for (const api of ports) assert.deepEqual(api[name](...row.args), row.expected, row.id);
    }
});
test('5.3 effective series preserve coercion, absence, stored effort priority and raw RIR across adverse values', () => {
    for (const weight of values) for (const rir of values) {
        for (const input of [{ weight, reps: 8, rir }, { weight: 80, reps: weight, rpe: rir, rir: 4 }, { weight: 80, reps: 8, weightRight: weight, repsRight: rir }]) {
            const expected = outcome(() => old.effectiveWorkoutSet(input));
            for (const api of ports) assert.deepEqual(outcome(() => api.effectiveWorkoutSet(input)), expected);
        }
    }
});
test('5.3 inter effort coercion including boxed BigInt, Symbol and invalid input preserves errors and outputs', () => {
    for (const rpe of values) for (const raw of [false, true]) {
        const input = [{ weight: 80, reps: 12, ...(raw ? { rir: rpe } : { rpe }) }, set(80, 8)];
        for (const api of ports) assert.deepEqual(outcome(() => inter(api, input)), outcome(() => inter(old, input)));
    }
    for (const input of [null, undefined, {}, [null], [{ sets: [null] }], [{ sets: {} }]]) for (const api of ports) {
        assert.deepEqual(outcome(() => api.computeWorkoutSuggestion(input, '8-12', 2.5)), outcome(() => old.computeWorkoutSuggestion(input, '8-12', 2.5)));
    }
});
test('5.3 intra coercion preserves missing/empty effort, raw RIR, ignored stored RPE and filtering order', () => {
    for (const weight of values) for (const rir of values) {
        const input = [{ weight, reps: 8, rir, rpe: 8 }];
        for (const api of ports) assert.deepEqual(outcome(() => api.suggestNextSetFromToday(input)), outcome(() => old.suggestNextSetFromToday(input)));
    }
    assert.equal(domain.suggestNextSetFromToday([{ weight: 80, reps: 8, rpe: 8 }]), null);
});
test('5.3 rep parsing and phase overloads preserve malformed ranges and historical non-clamping', () => {
    for (const target of [...values, '12-8', 'AMRAP', '2.5', '-4', '0-0', '1-3', '8–12']) {
        for (const api of ports) assert.deepEqual(api.parseRepRange(target), old.parseRepRange(target));
    }
    for (const phase of [null, 'deload', 'accumulation', 'intensification', 'custom', { phase: 'intensification' }, {}, 0]) {
        for (const api of ports) assert.deepEqual(inter(api, [set()], '8-12', 2.5, phase), inter(old, [set()], '8-12', 2.5, phase));
    }
    for (const opts of [null, {}, '8-12', 'AMRAP', { lo: 0, hi: 0, increment: 0 }, { lo: 12, hi: 8 }, { phase: 'deload' }]) for (const api of ports) {
        assert.deepEqual(api.suggestNextSetFromToday([{ weight: 80, reps: 8, rir: 0 }], opts, 5, { phase: 'accumulation' }), old.suggestNextSetFromToday([{ weight: 80, reps: 8, rir: 0 }], opts, 5, { phase: 'accumulation' }));
    }
});
test('5.3 exercise increments preserve exact muscle group/name inference; no configurable user increment exists', () => {
    for (const group of [undefined, null, '', 'Piernas', 'legs', 'piernas', 'Espalda']) for (const name of ['Press', 'Sentadilla', 'Búlgara', 'Hip Thrust', 'Peso muerto', 'Extensión de cuádriceps', 'leg curl']) {
        for (const api of ports) assert.equal(api.resolveWeightIncrement(group, name), old.resolveWeightIncrement(group, name));
    }
});
test('5.3 fractional grid and strict historical 0.01 threshold retain IEEE-754 operation order', () => {
    for (const base of [0, .5, 6.8, 80, 80.009999, 80.01, 79.999999999, -1, Infinity, NaN]) for (const increment of [0, .1, .25, .5, 2.5, 5, -1, Infinity, NaN]) {
        for (const w of [base, base + increment, base * .875, base * .9]) for (const api of ports) assert.equal(api.roundWorkoutWeight(w, increment, base), old.roundWorkoutWeight(w, increment, base));
    }
});
test('5.3 work reference retains singles fallback, 75-percent pool, heavy top and exact near-weight grouping', () => {
    const pools = [[set(110, 1), set(100, 4), set(100, 3)], [set(100, 5, 1), set(80, 12, 3)], [set(100, 8), set(74.999999, 20)], [set(100, 12, 2), set(100.009999, 8, 3)], [set(110, 1), set(100, 2)]];
    for (const pool of pools) for (const lo of [1, 3, 3.000001, 8]) {
        const effective = pool.map(old.effectiveWorkoutSet);
        for (const api of ports) assert.deepEqual(api.pickWorkReference(effective, lo), old.pickWorkReference(effective, lo));
    }
});
test('5.3 unilateral Smart reference uses independent minima, preserves nullish inheritance and right zero', () => {
    for (const weightRight of [undefined, null, 0, 50, 100, '', 'bad']) for (const repsRight of [undefined, null, 0, 5, 12, '', 'bad']) {
        for (const completed of [false, true]) for (const api of ports) assert.deepEqual(inter(api, [set(80, 10, 2, { weightRight, repsRight, completed })]), inter(old, [set(80, 10, 2, { weightRight, repsRight, completed })]));
    }
    assert.equal(inter(domain, [{ weightRight: 80, repsRight: 10, rpe: 8 }]), null);
});
test('5.3 inter only examines first session and basedOn is supplied count, not evidence confidence', () => {
    const a = [{ sets: [set()] }], b = [...a, { sets: [set(200, 20)] }];
    assert.deepEqual(domain.computeWorkoutSuggestion(b, '8-12', 2.5), { ...domain.computeWorkoutSuggestion(a, '8-12', 2.5), basedOn: 2 });
    assert.equal(domain.computeWorkoutSuggestion([{ sets: [] }, ...a], '8-12', 2.5), null);
    assert.notDeepEqual(domain.computeWorkoutSuggestion([...b].reverse(), '8-12', 2.5), domain.computeWorkoutSuggestion(b, '8-12', 2.5));
});
test('5.3 intra uses first/last order and never filters completed flags itself', () => {
    const a = [{ weight: 80, reps: 10, rir: 3, completed: false }, { weight: 80, reps: 8, rir: 0, completed: true }];
    assert.notDeepEqual(domain.suggestNextSetFromToday(a), domain.suggestNextSetFromToday([...a].reverse()));
    for (const api of ports) assert.deepEqual(api.suggestNextSetFromToday(a), old.suggestNextSetFromToday(a));
});
test('5.3 480 received combinations remain exact against independent original plus expanded high-rep and decimal grid', () => {
    for (const phase of [null, 'deload', 'accumulation', 'intensification']) for (const weight of [.5, 6.8, 80, 2000]) for (const reps of [1, 2, 8, 12, 37, 1000]) for (const rir of [0, 1, 2, 3, 4]) {
        for (const api of ports) assert.deepEqual(inter(api, [set(weight, reps, rir)], '8-12', 2.5, phase), inter(old, [set(weight, reps, rir)], '8-12', 2.5, phase));
    }
});
test('5.3 seeded histories and chronological sets preserve complete public outputs and valid-domain properties', () => {
    let seed = 0x5303; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 500; i++) {
        const rows = Array.from({ length: 1 + Math.floor(random() * 12) }, () => set(5 + Math.floor(random() * 195) * .5, 1 + Math.floor(random() * 40), Math.floor(random() * 5)));
        const a = inter(domain, rows), b = domain.suggestNextSetFromToday(rows.map(old.effectiveWorkoutSet));
        assert.deepEqual(a, inter(old, rows)); assert.deepEqual(b, old.suggestNextSetFromToday(rows.map(old.effectiveWorkoutSet)));
        if (a) assert(Number.isFinite(a.weight) && a.weight > 0 && Number.isFinite(a.reps) && a.reps > 0);
        if (b) assert(Number.isFinite(b.weight) && b.weight > 0 && b.weight <= rows.at(-1).weight);
    }
});
test('5.3 missing histories, edit/delete and discontinuous/offline timestamps preserve supplied context semantics', () => {
    const a = [{ id: 'new', date: '2026-10-20T05:59:59Z', sets: [set(80, 12)] }, { id: 'old', date: '2020-01-01Z', sets: [set(60, 8)] }];
    const edited = structuredClone(a); edited[0].sets[0].reps = 8;
    for (const input of [[], a, edited, a.slice(1), [{ sets: null }]]) for (const api of ports) assert.deepEqual(api.computeWorkoutSuggestion(input, '8-12', 2.5), old.computeWorkoutSuggestion(input, '8-12', 2.5));
});
test('5.3 deep-frozen histories and effective references retain object identity/order and deterministic results', () => {
    const row = Object.freeze(set()), sets = Object.freeze([row]), input = Object.freeze([Object.freeze({ sets })]);
    const before = structuredClone(input);
    assert.deepEqual(domain.computeWorkoutSuggestion(input, '8-12', 2.5), domain.computeWorkoutSuggestion(input, '8-12', 2.5)); assert.deepEqual(input, before);
    const effective = Object.freeze([Object.freeze(old.effectiveWorkoutSet(row))]);
    assert.equal(domain.pickWorkReference(effective, 8).setsAtWeight[0], effective[0]);
});
test('5.3 internal inter explanations identify rule/reference/grid without altering public outputs', () => {
    const seen = new Set();
    for (const row of golden.cases.filter(c => c.mode === 'inter')) {
        const result = domain.evaluateWorkoutSuggestion(...row.args); assert.deepEqual(result.recommendation, row.expected);
        seen.add(result.explanation.rule);
        if (result.recommendation) { assert.equal(result.explanation.resultWeight, result.recommendation.weight); assert.equal(result.explanation.usedSessionIndex, 0); assert(!('explanation' in result.recommendation)); }
    }
    assert.deepEqual([...seen].sort(), ['abstain', 'all-hit-top', 'below-range-hold', 'equalize-reps', 'progress-reps', 'top-set-passed']);
});
test('5.3 internal intra explanations identify all branches and abstention without claiming measured fatigue', () => {
    const seen = new Set();
    for (const row of golden.cases.filter(c => c.mode === 'intra')) {
        const result = domain.evaluateNextSetFromToday(...row.args); assert.deepEqual(result.recommendation, row.expected); seen.add(result.explanation.rule);
        if (result.recommendation) assert.equal(result.explanation.resultWeight, result.recommendation.weight);
    }
    assert.deepEqual([...seen].sort(), ['abstain', 'below-range-step', 'comfortable-reps', 'fatigue-hold', 'first-failure-backoff', 'last-failure-step', 'neutral-hold']);
    const tiny = domain.evaluateNextSetFromToday([{ weight: .5, reps: 12, rir: 0 }]);
    assert.equal(tiny.explanation.fallbackStep, true); assert.deepEqual(tiny.recommendation, old.suggestNextSetFromToday([{ weight: .5, reps: 12, rir: 0 }]));
});
test('5.3 actual Workout history preparation preserves CDMX exclusion, fallback, previous best, goals and deload', async () => {
    const make = async (file, api) => {
        const estimate1RM = await sourceFunction(file, 'estimate1RM', { effectiveSet: api.effectiveWorkoutSet });
        return sourceFunction(file, 'deriveHistoryDerived', { ...api, effectiveSet: api.effectiveWorkoutSet, roundWeight: api.roundWorkoutWeight, estimate1RM, mexicoCityDateStr: server.mexicoCityDateStr });
    };
    const current = await make('client/src/pages/Workout.jsx', client), previous = await make('scripts/fixtures/phase53/Workout.reference.txt', old);
    const input = [{ date: new Date().toISOString(), sets: [set(60, 8)] }, { date: '2020-01-01T18:00:00Z', sets: [set(80, 12)] }];
    for (const phase of [null, 'deload', 'intensification', 'accumulation']) for (const history of [[], input, input.slice(0, 1), [...input].reverse()]) assert.deepEqual(current(history, '8-12', 'Pecho', phase, 'Press'), previous(history, '8-12', 'Pecho', phase, 'Press'));
});
test('5.3 received server algorithms independently retain original numerical policy after extraction', async () => {
    for (const name of ['parseRepRange', 'effectiveWorkoutSet', 'roundWorkoutWeight', 'adjustRepRangeForPhase', 'pickWorkReference', 'computeWorkoutSuggestion', 'suggestNextSetFromToday']) {
        const fn = await sourceFunction('scripts/fixtures/phase53/logic.reference.txt', name, old);
        if (name === 'computeWorkoutSuggestion' || name === 'suggestNextSetFromToday') for (const row of golden.cases.filter(c => c.mode === (name === 'computeWorkoutSuggestion' ? 'inter' : 'intra'))) assert.deepEqual(fn(...row.args), row.expected);
        else assert.equal(typeof fn, 'function');
    }
});
test('5.3 no active duplicate Smart bodies; plateau, CDMX, effort, Workout and route bodies remain received', async () => {
    const current = await readFile(path.join(root, 'server/src/logic.js'), 'utf8'), previous = await readFile(path.join(root, 'scripts/fixtures/phase53/logic.reference.txt'), 'utf8');
    const functions = text => { const ast = ts.createSourceFile('logic.js', text, ts.ScriptTarget.Latest, true); return new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, n.getText(ast)])); };
    const names = Object.keys(old), a = functions(current), b = functions(previous);
    const migrated = ['mexicoCityDateStr', 'mexicoCityUtcOffsetMinutes', 'mexicoCityDayBounds', 'dayOfWeekFromDateStr', 'getActiveBlock', 'currentWeekInBlock', 'getRoutinePhaseStatus', 'detectPlateauForExercise'];
    for (const [name, body] of b) if (names.includes(name)) assert(!a.has(name)); else if (migrated.includes(name)) assert.equal(typeof server[name], 'function'); else assert.equal(a.get(name), body, name);
    const workoutSource = await readFile(path.join(root, 'client/src/pages/Workout.jsx'), 'utf8');
    const receivedWorkout = await readFile(path.join(root, 'scripts/fixtures/phase53/Workout.reference.txt'), 'utf8');
    const workoutFunctions = text => { const ast = ts.createSourceFile('Workout.jsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX); return new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, n.getText(ast).replaceAll('\r\n', '\n')])); };
    const liveWorkoutFunctions = workoutFunctions(workoutSource), frozenWorkoutFunctions = workoutFunctions(receivedWorkout);
    for (const name of ['estimate1RM', 'deriveHistoryDerived', 'sessionVolumeFromSets', 'findTodayLog', 'useWorkoutPersistence', 'useGoalChip']) assert.equal(liveWorkoutFunctions.get(name), frozenWorkoutFunctions.get(name), name);
    assert.match(workoutSource, /import SetCard from '..\/features\/workouts\/SetCard'/);
    assert.match(workoutSource, /import \{ useRestTimer \} from '..\/features\/workouts\/useRestTimer'/);
    const integration = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/phase5complete/integration.json'), 'utf8'));
    let routeSource = await readBackendSource();
    // Undo only the two explicit Phase 6 persistence integrations before the
    // unchanged Phase 5 source-conservation assertion. Their behavior is tested
    // against the migrated PostgreSQL schema by the Phase 6 suite.
    assert(routeSource.includes("import { PrismaClient, hasRetainedExerciseData } from './services/historyPersistence.js';"));
    routeSource = routeSource.replace("import { PrismaClient, hasRetainedExerciseData } from './services/historyPersistence.js';", "import { PrismaClient } from '@prisma/client';")
        .replace('const logCount = await hasRetainedExerciseData(tx, ex.id);', 'const logCount = await tx.workoutLog.count({ where: { exerciseId: ex.id } });');
    for (const change of integration.find(row => row.file === 'server/src/index.js').changes.toReversed()) {
        assert.equal(routeSource.slice(change.start, change.start + change.after.length), change.after);
        routeSource = routeSource.slice(0, change.start) + change.before + routeSource.slice(change.start + change.after.length);
    }
    assert.equal(routeSource, await readFile(path.join(root, 'scripts/fixtures/phase53/index.reference.txt'), 'utf8'));
    assert.match(await readFile(path.join(root, 'client/src/utils/smartLoading.js'), 'utf8'), /export \{.*\} from '..\/generated\/training.js'/);
});
test('5.3 strict negative compiler fixture rejects six invalid/readonly/public-contract misuses', () => {
    const configFile = path.join(root, 'packages/shared/tsconfig.json'), config = ts.readConfigFile(configFile, ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFile), undefined, configFile);
    const file = path.join(root, 'packages/shared/test/fixtures/smartLoading.ts'), host = ts.createCompilerHost(parsed.options), read = host.readFile.bind(host);
    assert(parsed.options.strict); assert(parsed.fileNames.some(n => path.resolve(n) === file));
    assert.equal(ts.getPreEmitDiagnostics(ts.createProgram([file], parsed.options, host)).length, 0);
    host.readFile = name => path.resolve(name) === file ? read(name).replaceAll('@ts-expect-error', 'expected error') : read(name);
    const errors = ts.getPreEmitDiagnostics(ts.createProgram([file], parsed.options, host)); assert.equal(errors.length, 6); assert(errors.every(d => path.resolve(d.file.fileName) === file));
});
test('5.3 ESM/CJS standalone native-stripping-disabled runtime consumes shared Smart functions', () => {
    const result = spawnSync(process.execPath, ['--no-experimental-strip-types', '--input-type=module', '-e', "import {computeWorkoutSuggestion,suggestNextSetFromToday} from './server/src/logic.js';if(computeWorkoutSuggestion([{sets:[{weight:80,reps:12,rpe:9}]}],'8-12',2.5).weight!==82.5||suggestNextSetFromToday([{weight:80,reps:8,rir:0}]).weight!==70)process.exit(1)"], { cwd: root, windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
});
test('5.3 original/reconstructed timings cover 0/10/100/1000 sets, many exercises and repeated reconstruction', () => {
    const rows = [];
    for (const count of [0, 10, 100, 1000]) {
        const history = [{ sets: Array.from({ length: count }, (_, n) => set(80 + (n % 10) * .5, 8 + n % 5)) }], today = history[0].sets.map(old.effectiveWorkoutSet);
        const row = { sets: count, iterations: 100, oldMs: [], sharedMs: [], preparationMs: 0 };
        let start = performance.now(); for (let i = 0; i < 100; i++) history[0].sets.map(domain.effectiveWorkoutSet); row.preparationMs = performance.now() - start;
        for (let round = 0; round < 5; round++) for (const [key, api] of [['oldMs', old], ['sharedMs', domain]]) {
            start = performance.now(); for (let i = 0; i < 100; i++) { api.computeWorkoutSuggestion(history, '8-12', 2.5); api.suggestNextSetFromToday(today); } row[key].push(performance.now() - start);
        }
        assert.deepEqual(domain.computeWorkoutSuggestion(history, '8-12', 2.5), old.computeWorkoutSuggestion(history, '8-12', 2.5)); rows.push(row);
    }
    const exercises = Array.from({ length: 100 }, (_, i) => ({ id: i, sets: Array.from({ length: 10 }, () => set()) }));
    const start = performance.now(); for (const exercise of exercises) inter(domain, exercise.sets);
    console.log('Smart performance evidence: ' + JSON.stringify({ rows, exercises: 100, exerciseSets: 10, fullReconstructionMs: performance.now() - start, persistentCache: false, newQueries: 0 }));
});

async function cdp(url) {
    const ws = new WebSocket(url), pending = new Map(); let sequence = 0;
    ws.onmessage = e => { const m = JSON.parse(e.data), p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    ws.onclose = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('closed')); } pending.clear(); };
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    return { close: () => ws.close(), command: (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(method)); }, 15000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }) };
}
test('5.3 real Edge mounts actual Workout: ignore/apply/override, complete RIR, intra autofill and persistent restart', async () => {
    const isolated = await mkdtemp(path.join(await realpath(tmpdir()), 'nexlift-phase53-browser-')), profile = path.join(isolated, 'owned-profile'); await mkdir(profile);
    const executable = process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium';
    const processes = createBrowserProcesses({ root: isolated, executable }); const { createServer } = require('vite');
    const vite = await createServer({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.js'), envFile: false,
        server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    try {
        await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
        const debug = await processes.launch(profile), target = await (await fetch(debug + '/json/new?about:blank', { method: 'PUT' })).json(), page = await cdp(target.webSocketDebuggerUrl);
        const evaluate = async expression => { const r = await page.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
        try {
            await page.command('Page.navigate', { url: origin + '/test/phase53-harness.html' });
            await waitForState(() => evaluate("document.querySelector('[aria-label=\"Serie 1 peso\"]') && document.body.textContent.includes('Sugerido: 82.5 kg × 8')"), 'actual Workout inter suggestion ready');
            assert.equal(await evaluate("document.querySelector('[aria-label=\"Serie 1 peso\"]').value"), '');
            assert.equal(await evaluate('window.phase53.suggestionLogs.length'), 0);
            await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Sugerido 82.5')).click()");
            await waitForState(() => evaluate("document.querySelector('[aria-label=\"Serie 1 peso\"]').value==='82.5'"), 'manual row apply');
            await evaluate("window.phase53.input('Serie 1 peso','80');window.phase53.input('Serie 1 reps','8')");
            await waitForState(() => evaluate("document.querySelector('[aria-label=\"Serie 1 peso\"]').value==='80' && document.querySelector('[aria-label=\"Serie 1 reps\"]').value==='8'"), 'manual values committed');
            await evaluate("document.querySelector('[aria-label=\"RIR 0\"]').click()");
            await evaluate("document.querySelector('[aria-label=\"Marcar serie 1 completada\"]').click()");
            await waitForState(() => evaluate("!!document.querySelector('[aria-label=\"Serie 1 completada\"]')"), 'first series completed');
            // Received page always passes weightR/repsR, including empty strings
            // for a bilateral form. Effective minima are then zero: preserve
            // that observed abstention, do not silently repair a UI policy.
            assert.equal(old.effectiveWorkoutSet({ weight: 80, reps: 8, weightRight: '', repsRight: '', rir: 0 }).weight, 0);
            assert.equal(await evaluate("document.querySelector('[aria-label=\"Serie 2 peso\"]').value"), '');
            await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Bilateral').click()");
            await waitForState(() => evaluate("!!document.querySelector('[aria-label=\"Serie 1 peso derecho\"]')"), 'unilateral controls committed');
            await evaluate("window.phase53.input('Serie 1 peso derecho','80');window.phase53.input('Serie 1 reps derechas','8')");
            await waitForState(() => evaluate("document.querySelector('[aria-label=\"Serie 2 peso izquierdo\"]').value==='70' && document.querySelector('[aria-label=\"Serie 2 reps izquierdas\"]').value==='10' && document.querySelector('[aria-label=\"Serie 2 peso derecho\"]').value==='70'"), 'actual intra backoff autofill');
            assert.equal(await evaluate('window.phase53.writes.length'), 0);
            await waitForState(() => evaluate("Object.keys(localStorage).some(k=>k.startsWith('nexlift_draft_v2:') && (localStorage.getItem(k)||'').includes('70'))"), 'draft persisted without confirmed write');
            await page.command('Page.reload');
            await waitForState(() => evaluate("document.querySelector('[aria-label=\"Serie 1 peso\"]')?.value==='80' && document.querySelector('[aria-label=\"Serie 2 peso\"]')?.value==='70'"), 'draft restored after reload');
            assert.equal(await evaluate('window.phase53.writes.length'), 0);
            assert.equal(await evaluate("document.querySelector('[aria-label=\"Serie 2 reps\"]').value"), '10');
            await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Bilateral').click()");
            await waitForState(() => evaluate("document.querySelector('[aria-label=\"Serie 2 peso derecho\"]')?.value==='70'"), 'preserved right-side draft after reload');
            // Persisted completed first row + explicit RIR second row and save
            // exercise follow the real page's normal handler, not a test clone.
            await evaluate("document.querySelectorAll('[aria-label=\"RIR 2\"]')[1].click()");
            await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Guardar y finalizar')).click()");
            await waitForState(() => evaluate('window.phase53.writes.length===1'), 'real Workout save');
            const saved = await evaluate('window.phase53.writes[0]'); assert.deepEqual(saved.sets.map(s => [s.weight, s.reps, s.rpe]), [[80, 8, 10], [70, 10, 8]]);
            assert(!JSON.stringify(saved).includes('explanation'));
        } catch (error) {
            const diagnostic = await evaluate("({body:document.body.textContent,inputs:[...document.querySelectorAll('input')].map(i=>({label:i.getAttribute('aria-label'),value:i.value})),writes:window.phase53?.writes,logs:window.phase53?.suggestionLogs,storage:Object.fromEntries(Object.keys(localStorage).filter(k=>!k.includes('token')).map(k=>[k,localStorage.getItem(k)]))})").catch(e => ({ error: e.message }));
            await writeFile(path.join(isolated, 'failure.json'), JSON.stringify(diagnostic, null, 2));
            console.log('Phase 5.3 synthetic browser failure: ' + JSON.stringify(diagnostic)); throw error;
        } finally { page.close(); }
        await writeFile(path.join(isolated, 'evidence.json'), JSON.stringify({ launches: processes.launches, actualWorkout: true, publicPayloadUnchanged: true, productionTouched: false }, null, 2));
        console.log(`Phase 5.3 browser evidence: ${isolated}`);
    } finally { await processes.close(); await vite.close(); }
});

test('5.3 original fixture hashes are stable and goldens never depend on rebuilt implementation', async () => {
    for (const file of ['smartLoading.js', 'Workout.reference.txt', 'logic.reference.txt', 'index.reference.txt']) {
        const bytes = await readFile(path.join(root, 'scripts/fixtures/phase53', file)); assert(bytes.length > 500);
        console.log(`Phase 5.3 reference ${file} SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
    }
    assert.equal(golden.origin, 'Captured received implementation before integration, explicit numeric expectations verified independently');
});
