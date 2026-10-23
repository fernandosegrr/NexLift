import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import * as shared from '../../packages/shared/dist/index.js';
import * as client from '../../client/src/generated/training.js';
import server from '../../server/src/generated/training.cjs';
import * as oldLogic from '../fixtures/phase52/logic.js';
import * as logic from '../../server/src/logic.js';
import { recalcPRForExercise as oldRecalc } from '../fixtures/phase52/personalRecords.js';
import { recalcPRForExercise } from '../../server/src/services/personalRecords.js';
import { requestHash } from '../../server/src/services/operationHash.js';
import { trainingRoot as root, sourceFunction } from '../lib/training-characterization.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const fields = [undefined, null, '', ' ', 0, -0, -1, 0.5, 1, 2, 4, 4.5, 5, 5.5, 6, 8, 10, 11, NaN, Infinity, -Infinity, '2junk', '8.2junk', true, false, [], [2], {}, Symbol('synthetic')];
const outcome = fn => { try { return { value: fn() }; } catch (e) { return { error: e.constructor.name, message: e.message, code: e.code, path: e.path }; } };
const asyncOutcome = async fn => { try { return { value: await fn() }; } catch (e) { return { error: e.constructor.name, message: e.message }; } };
const base = { exerciseId: 'synthetic', weight: 80, reps: 10 };
async function record(recalc, logs, name = 'Press', owner = 'synthetic') {
    const calls = [];
    const tx = { workoutLog: { findMany: async q => { calls.push(['query', q]); return logs; } }, personalRecord: {
        deleteMany: async q => { calls.push(['delete', q]); }, create: async q => { calls.push(['create', q]); return q.data; }
    } };
    const result = await recalc(tx, name, owner); return { result, calls };
}
const set = (weight = 80, reps = 10, extra = {}) => ({ weight, reps, ...extra });
const session = (...sets) => ({ date: '2026-10-18T05:59:59.999Z', sets });
const canonicalSource = ts.transpileModule(await readFile(path.join(root, 'scripts/fixtures/phase52/workoutSessions.reference.txt'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const ast = ts.createSourceFile('reference.js', canonicalSource, ts.ScriptTarget.Latest, true);
const oldRead = new Function('record', 'fail', `return (${ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'readSetInput').getText(ast).replace(/^export\s+/, '')});`)(
    (value, key) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new shared.ContractValidationError('INVALID_OPERATION', key, `${key} must be an object`); return value; },
    (key, message) => { throw new shared.ContractValidationError('INVALID_OPERATION', key, message); });

test('5.2 labelled effort conversions distinguish declared RIR and inferred RIR', () => {
    for (let rir = 0; rir <= 4; rir++) {
        const stored = shared.rirToStoredRpe({ kind: 'user-rir', value: rir });
        assert.deepEqual(stored, { kind: 'stored-rpe', value: 10 - rir });
        assert.deepEqual(shared.storedRpeToRir(stored), { kind: 'inferred-rir', value: rir });
    }
});
test('5.2 form effort adapters preserve null, zero, decimals and historical stored range', () => {
    for (const value of fields) {
        for (const port of [shared, client, server]) {
            assert.deepEqual(outcome(() => port.formRirToStoredRpe(value)), outcome(() => value != null ? 10 - value : null));
            assert.deepEqual(outcome(() => port.storedRpeToFormRir(value)), outcome(() => value != null ? 10 - value : null));
        }
    }
});
test('5.2 unbounded legacy helper preserves permissive parseFloat and conversion errors', () => {
    for (const value of [...fields, 2n, { toString: () => '2junk' }]) assert.deepEqual(outcome(() => logic.convertShortcutRir(value)), outcome(() => oldLogic.convertShortcutRir(value)));
});
test('5.2 legacy HTTP sanitizer is exactly equivalent over contextual effort pairs', () => {
    for (const rir of fields) for (const rpe of fields) assert.deepEqual(outcome(() => logic.sanitizeShortcutLogSet({ ...base, rir, rpe })), outcome(() => oldLogic.sanitizeShortcutLogSet({ ...base, rir, rpe })));
});
test('5.2 legacy precedence rejects invalid explicit RIR even with valid stored RPE', () => {
    assert.equal(shared.parseLegacyShortcutEffort({ rir: 3, rpe: 9 }).storedRpe, 7);
    assert.equal(shared.parseLegacyShortcutEffort({ rir: 5, rpe: 8 }).state, 'invalid');
    assert.equal(shared.parseLegacyShortcutEffort({ rpe: 5 }).state, 'invalid');
});
test('5.2 missing Shortcut effort stays a labelled historical default', () => {
    assert.deepEqual(shared.parseLegacyShortcutEffort({}), { state: 'interpreted', context: 'legacy-shortcut', interpretation: 'missing-default', rawRir: 0, storedRpe: 10 });
    for (const rpe of [undefined, null, '', ' ']) assert.equal(logic.sanitizeShortcutLogSet({ ...base, rpe }).clean.set.rpe, 10);
});
test('5.2 canonical reader retains exact outputs and error precedence over effort pairs', () => {
    for (const rir of fields) for (const rpe of fields) {
        const value = [{ weight: 80, reps: 10, rir, rpe }];
        assert.deepEqual(outcome(() => shared.readSetInput(value)), outcome(() => oldRead(value)));
    }
});
test('5.2 canonical parser keeps missing/null separate and has no legacy source switch', () => {
    assert.deepEqual(shared.parseCanonicalWorkoutEffort({}), { state: 'missing', context: 'canonical-workout', storedRpe: undefined });
    assert.equal(shared.parseCanonicalWorkoutEffort({ rpe: null }).storedRpe, null);
    assert.equal(shared.parseCanonicalWorkoutEffort({ rpe: 2 }).storedRpe, 2);
    assert.equal(shared.parseCanonicalWorkoutEffort({ rir: 2, rpe: 2 }).state, 'invalid');
    assert.equal(shared.parseCanonicalWorkoutEffort({ rir: 2, rpe: 8 }).storedRpe, 8);
});
test('5.2 v1 source=shortcut retains stored semantics and the original canonical hash input', async () => {
    const input = { operationId: '12345678-1234-4000-8000-123456789abc', kind: 'workout.create', source: 'shortcut', performedAt: '2026-10-18T05:59:59.999Z', exerciseId: 'synthetic', sets: [set(80, 10, { rpe: 2 })] };
    const context = { sanitizeSets: logic.sanitizeSets, mexicoCityDateStr: logic.mexicoCityDateStr };
    const operation = shared.parseWorkoutOperation(input, context);
    assert.equal(operation.sets[0].rpe, 2); assert.equal(input.performedAt, '2026-10-18T05:59:59.999Z');
    const oldBundle = {};
    new Function('exports', await readFile(path.join(root, 'scripts/fixtures/phase52/contracts.reference.txt'), 'utf8'))(oldBundle);
    for (const source of ['pwa', 'shortcut']) for (const rir of [undefined, 0, 1, 2, 3, 4]) for (const rpe of [undefined, null, 0, 2, 5, 6, 8, 10]) {
        const value = { ...input, source, sets: [set(80, 10, { rir, rpe })] };
        const before = outcome(() => oldBundle.parseWorkoutOperation(value, context)), after = outcome(() => shared.parseWorkoutOperation(value, context));
        assert.deepEqual(after, before);
        if (after.value) assert.equal(requestHash(after.value), requestHash(before.value));
    }
});
test('5.2 legacy sanitizer remains distinct from canonical numeric and required-effort validation', () => {
    assert.equal(logic.sanitizeShortcutLogSet({ ...base, rpe: '2junk' }).clean.set.rpe, 8);
    assert.throws(() => shared.readSetInput([set(80, 10, { rpe: '2junk' })]), shared.ContractValidationError);
    assert(logic.sanitizeSets(shared.readSetInput([set()])).error);
    assert.equal(logic.sanitizeSets([set(80, 10, { rpe: 5 })]).sets[0].rpe, 5);
});
test('5.2 historical import values remain stored values rather than reinterpreted shortcut effort', () => {
    for (const rpe of [0, 2, 4, 5, 6, 10]) assert.deepEqual(logic.sanitizeSets([set(80, 10, { rpe })]), oldLogic.sanitizeSets([set(80, 10, { rpe })]));
});
test('5.2 PR guarded e1RM policy explicitly differs from capped history at 37 reps', () => {
    for (const reps of [1, 10, 36, 37]) {
        assert.equal(shared.personalRecordEpley1RM(80, reps), reps > 1 && reps < 37 ? 80 * (1 + reps / 30) : 80);
    }
    assert.equal(shared.cappedEpley1RM(80, 37), 176); assert.equal(shared.personalRecordEpley1RM(80, 37), 80);
});
test('5.2 PR IEEE-754 comparisons retain 100x2 over 80x10 without rounding', () => {
    const result = shared.selectHistoricalPersonalRecord([session(set(80, 10), set(100, 2))]);
    assert.equal(result.weight, 100); assert.equal(result.est1RM, 106.66666666666667);
});
test('5.2 PR binary ties retain first encountered set/session including equal timestamps', () => {
    const a = { date: { id: 'first' }, sets: [set(80, 10), set(80, 10)] }, b = { date: { id: 'second' }, sets: [set(80, 10)] };
    assert.equal(shared.selectHistoricalPersonalRecord([a, b]).date, a.date);
    assert.equal(shared.selectHistoricalPersonalRecord([b, a]).date, b.date);
});
test('5.2 PR strongest side and nullish inheritance preserve zero and incomplete data', async () => {
    for (const extra of [{ weightRight: 100, repsRight: 8 }, { weightRight: 100 }, { repsRight: 12 }, { weightRight: 0, repsRight: 0 }, { weightRight: 100, repsRight: 0 }, { completed: false, weightRight: 100, repsRight: 10 }]) {
        const logs = [session(set(80, 10, extra))]; assert.deepEqual(await record(recalcPRForExercise, logs), await record(oldRecalc, logs));
    }
});
test('5.2 PR invalid/coercible observations preserve outputs and errors exactly', async () => {
    for (const weight of fields) for (const reps of fields) {
        const logs = [session(set(weight, reps))];
        assert.deepEqual(await asyncOutcome(() => record(recalcPRForExercise, logs)), await asyncOutcome(() => record(oldRecalc, logs)));
    }
});
test('5.2 PR pure selector and transactional adapter retain authorized query and all write arguments', async () => {
    const logs = [session(set(80, 10), set(100, 2))];
    const actual = await record(recalcPRForExercise, logs, 'PrEsS', 'owner-A');
    assert.deepEqual(actual, await record(oldRecalc, logs, 'PrEsS', 'owner-A'));
    assert.deepEqual(actual.calls[0][1].orderBy, { date: 'asc' });
    assert.equal(actual.calls[0][1].where.exercise.routineDay.routine.userId, 'owner-A');
    assert.equal(actual.result.exerciseName, 'press');
});
test('5.2 no usable PR removes only the derived record; missing name makes no calls', async () => {
    assert.deepEqual(await record(recalcPRForExercise, [session(set(0, 0))]), await record(oldRecalc, [session(set(0, 0))]));
    assert.equal(shared.selectHistoricalPersonalRecord([]), null);
    assert.deepEqual(await record(recalcPRForExercise, [], ''), { result: null, calls: [] });
});
test('5.2 recomputation after edits, removals and deleting best session is exactly historical', async () => {
    const initial = [session(set(80, 10), set(100, 2)), { date: 'earlier', sets: [set(90, 1)] }];
    const edited = structuredClone(initial); edited[0].sets[1].weight = 60;
    const fewer = structuredClone(initial); fewer[0].sets.splice(1, 1);
    for (const logs of [initial, edited, fewer, initial.slice(1), []]) assert.deepEqual(await record(recalcPRForExercise, logs), await record(oldRecalc, logs));
});
test('5.2 domain functions preserve input order, opaque dates and object/array contents', () => {
    const logs = [session(set(80.25, 10.5, { weightRight: 81.5, repsRight: 9 }))], before = structuredClone(logs);
    Object.freeze(logs[0].sets[0]); Object.freeze(logs[0].sets); Object.freeze(logs[0]); Object.freeze(logs);
    assert.deepEqual(shared.selectHistoricalPersonalRecord(logs), shared.selectHistoricalPersonalRecord(logs)); assert.deepEqual(logs, before);
    const input = Object.freeze({ rir: 2, rpe: 8 }); shared.parseCanonicalWorkoutEffort(input); shared.parseLegacyShortcutEffort(input);
});
test('5.2 randomized paired histories exactly match the reference backend selection', async () => {
    let seed = 0x5202; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 160; i++) {
        const logs = Array.from({ length: 1 + Math.floor(random() * 12) }, (_, n) => ({ date: `opaque-${n}`, sets: Array.from({ length: 6 }, () => set(Math.round(random() * 20000) / 100, Math.floor(random() * 40), { weightRight: random() < .3 ? null : Math.round(random() * 20000) / 100, repsRight: random() < .3 ? null : Math.floor(random() * 40), completed: random() < .5 })) }));
        assert.deepEqual(await record(recalcPRForExercise, logs), await record(oldRecalc, logs));
    }
});
test('5.2 frontend ESM/backend CJS expose identical effort and PR results', () => {
    for (const port of [client, server]) {
        for (const value of fields) assert.deepEqual(outcome(() => port.parseLegacyShortcutEffort({ rpe: value })), outcome(() => shared.parseLegacyShortcutEffort({ rpe: value })));
        assert.deepEqual(port.selectHistoricalPersonalRecord([session(set(80, 10), set(100, 2))]), shared.selectHistoricalPersonalRecord([session(set(80, 10), set(100, 2))]));
    }
});
test('5.2 real form consumers preserve received nullable effort conversions after UI extraction', async () => {
    for (const page of ['Workout', 'EditSession']) {
        const old = await readFile(path.join(root, `scripts/fixtures/phase52/${page}.reference.txt`), 'utf8');
        const expected = "import { formRirToStoredRpe, storedRpeToFormRir } from '../generated/training.js';\r\n" + old.replaceAll('s.rpe != null ? (10 - s.rpe) : null', 'storedRpeToFormRir(s.rpe)').replaceAll('s.rpe == null ? null : 10 - s.rpe', 'storedRpeToFormRir(s.rpe)').replaceAll('s.rir != null ? (10 - s.rir) : null', 'formRirToStoredRpe(s.rir)').replaceAll('s.rir != null ? 10 - s.rir : null', 'formRirToStoredRpe(s.rir)');
        const live = await readFile(path.join(root, `client/src/pages/${page}.jsx`), 'utf8');
        const calls = source => {
            const ast = ts.createSourceFile(page + '.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX), result = [];
            const visit = node => {
                if (ts.isCallExpression(node) && ['formRirToStoredRpe', 'storedRpeToFormRir'].includes(node.expression.getText(ast))) result.push(node.getText(ast).replaceAll('\r\n', '\n'));
                ts.forEachChild(node, visit);
            };
            visit(ast); return result;
        };
        const expectedCalls = calls(expected);
        assert(expectedCalls.some(call => call.startsWith('formRirToStoredRpe')));
        assert(expectedCalls.some(call => call.startsWith('storedRpeToFormRir')));
        assert.deepEqual(calls(live), expectedCalls);
        assert.match(live, /import \{ formRirToStoredRpe, storedRpeToFormRir \} from '..\/generated\/training.js'/);
        assert(!/10\s*-\s*s\.(?:rpe|rir)/.test(live));
    }
});
test('5.2 strict compiler rejects eight semantic and readonly misuses', () => {
    const configFile = path.join(root, 'packages/shared/tsconfig.json'), config = ts.readConfigFile(configFile, ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFile), undefined, configFile);
    const file = path.join(root, 'packages/shared/test/fixtures/performance.ts'), host = ts.createCompilerHost(parsed.options), read = host.readFile.bind(host);
    assert.equal(parsed.options.strict, true); assert(parsed.fileNames.some(name => path.resolve(name) === file));
    assert.equal(ts.getPreEmitDiagnostics(ts.createProgram([file], parsed.options, host)).length, 0);
    host.readFile = name => path.resolve(name) === file ? read(name).replaceAll('@ts-expect-error', 'expected diagnostic') : read(name);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], parsed.options, host));
    assert.equal(diagnostics.length, 8); assert(diagnostics.every(d => path.resolve(d.file.fileName) === file));
});
test('5.2 generated domain bridges work in standalone ESM with native TS stripping disabled', () => {
    const run = spawnSync(process.execPath, ['--no-experimental-strip-types', '--input-type=module', '-e', "import t from './server/src/generated/training.cjs';if(t.parseLegacyShortcutEffort({rpe:2}).storedRpe!==8||t.selectHistoricalPersonalRecord([{date:'original',sets:[{weight:80,reps:37}]}]).est1RM!==80)process.exit(1)"], { cwd: root, windowsHide: true, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr); assert.equal(require(path.join(root, 'server/src/generated/training.cjs')).personalRecordEpley1RM(80, 37), 80);
});
test('5.2 selected PR performance metric is linear over hundreds of paired sessions without extra database calls', async () => {
    const logs = Array.from({ length: 400 }, (_, i) => ({ date: `original-${i}`, sets: Array.from({ length: 6 }, (_, n) => set(80 + i / 100, 1 + n, { weightRight: 70 + i / 100, repsRight: n + 2 })) }));
    const previous = await record(oldRecalc, logs), current = await record(recalcPRForExercise, logs); assert.deepEqual(current, previous); assert.equal(current.calls.length, 3);
    const measurements = { sessions: 400, sets: 2400, repetitions: 100, oldMs: [], sharedMs: [] };
    for (let round = 0; round < 5; round++) {
        let start = performance.now(); for (let i = 0; i < 100; i++) await record(oldRecalc, logs); measurements.oldMs.push(performance.now() - start);
        start = performance.now(); for (let i = 0; i < 100; i++) await record(recalcPRForExercise, logs); measurements.sharedMs.push(performance.now() - start);
    }
    console.log('PR performance evidence: ' + JSON.stringify(measurements));
});
test('5.2 harness reproduction: NODE_ENV=test selects development React; explicit production selects production React', async () => {
    const { build } = await import(pathToFileURL(require.resolve('vite')).href);
    for (const [environment, expected] of [['test', 'development'], ['production', 'production']]) {
        const result = await build({ root: path.join(root, 'client'), configFile: false, envFile: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': JSON.stringify(environment) },
            build: { write: false, lib: { entry: path.join(root, 'client/test/phase52-react-build.js'), formats: ['es'] } } });
        const active = (Array.isArray(result) ? result : [result]).flatMap(r => r.output).filter(o => o.type === 'chunk').flatMap(o => Object.entries(o.modules)).filter(([id, m]) => /react-dom-client\.(development|production)\.js$/.test(id) && m.renderedLength > 0);
        assert.equal(active.length, 1); assert(active[0][0].endsWith(`react-dom-client.${expected}.js`));
    }
});
test('5.2 harness preserves every historical assertion/action and original timeout while making both builds production React', async () => {
    const before = await readFile(path.join(root, 'scripts/fixtures/phase52/stabilization-browser.reference.txt'), 'utf8'), after = await readFile(path.join(root, 'server/test/fixtures/stabilization-browser.mjs'), 'utf8');
    const scan = text => {
        const source = ts.createSourceFile('fixture.mjs', text, ts.ScriptTarget.Latest, true), assertions = [], actions = [];
        function visit(n) {
            if (ts.isCallExpression(n) && (n.expression.getText(source) === 'assert' || n.expression.getText(source).startsWith('assert.'))) assertions.push(n.getText(source));
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'evaluate' && n.arguments[0] && ts.isNoSubstitutionTemplateLiteral(n.arguments[0])) actions.push(n.arguments[0].text);
            ts.forEachChild(n, visit);
        }
        visit(source); return { assertions, actions };
    };
    const old = scan(before), current = scan(after); assert.equal(old.assertions.length, 60); assert.deepEqual(current.assertions, old.assertions);
    for (const action of old.actions) assert(current.actions.includes(action), action);
    assert(before.includes('timeoutMs = 15000')); assert(after.includes('timeoutMs = 15000'));
    assert.equal((after.match(/'process.env.NODE_ENV':'"production"'/g) || []).length, 2);
    const previous = process.env.NODE_ENV;
    const productionBuild = await sourceFunction('server/test/fixtures/stabilization-browser.mjs', 'productionBuild', { build: async config => {
        assert.equal(process.env.NODE_ENV, 'production'); if (config.fail) throw new Error('synthetic build failure'); return config;
    } });
    assert.deepEqual(await productionBuild({ value: 1 }), { value: 1 }); assert.equal(process.env.NODE_ENV, previous);
    await assert.rejects(productionBuild({ fail: true }), /synthetic build failure/); assert.equal(process.env.NODE_ENV, previous);
});
