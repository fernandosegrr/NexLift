import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildCoachReport, analyzeCoachPlateau, analyzeCoachVolume, analyzeCoachRecovery, recommendCoachLoading, analyzeCoachHypertrophy, answerCoach } from '../../packages/shared/dist/index.js';
import { coachScenario, equipment } from '../fixtures/coach/scenarios.mjs';
import { createCoachAssistant } from '../../server/src/modules/coach/assistant.js';
import { comparableIssuedToken } from '../../server/test/fixtures/token-comparison.js';
import { createRequire } from 'node:module';
import { checkIn, exerciseConfig, civilDate, measurement, period } from '../../server/src/modules/coach/validation.js';

const plateau = input => analyzeCoachPlateau('bench', input);
test('11 inherited JWT comparison verifies independent issue times, signature, freshness and exact lifetime', () => {
    const jwt = createRequire(new URL('../../server/package.json', import.meta.url))('jsonwebtoken');
    const secret = 'synthetic-token-comparison', now = 1800000000;
    const token = (iat, duration = 365 * 86400, key = secret) => jwt.sign({ userId: 'A', tokenVersion: 1, iat, exp: iat + duration }, key);
    assert.deepEqual(comparableIssuedToken(token(now), secret, now), comparableIssuedToken(token(now - 1), secret, now));
    assert.throws(() => comparableIssuedToken(token(now, 3600), secret, now));
    assert.throws(() => comparableIssuedToken(token(now - 31), secret, now));
    assert.throws(() => comparableIssuedToken(token(now + 1), secret, now));
    assert.throws(() => comparableIssuedToken(token(now, 365 * 86400, 'wrong-key'), secret, now));
});
test('11 novice abstains with few records', () => assert.equal(plateau(coachScenario({ count: 2 })).state, 'insufficient'));
test('11 stable long history is a possible plateau with comparable RIR', () => assert.equal(plateau(coachScenario()).state, 'possible_plateau'));
test('11 steady progress is detected using the shared plateau core', () => assert.equal(plateau(coachScenario({ weight: i => 60 + i * 3 })).state, 'progress'));
test('11 regression requires repeated performance decline, not elapsed days', () => assert.equal(plateau(coachScenario({ weight: i => i < 5 ? 80 : 70 })).state, 'regression'));
test('11 six stable sessions are normal maintenance', () => assert.equal(plateau(coachScenario({ count: 6 })).state, 'maintenance'));
test('11 four days of absence do not manufacture a plateau or regression', () => { const i = coachScenario({ count: 3 }); i.now = new Date(Date.parse(i.sessions.at(-1).date) + 4 * 86400000).toISOString(); assert.equal(plateau(i).state, 'insufficient'); });
for (const [name, change] of [
    ['routine', i => { i.sessions.at(-1).routineId = 'other'; }],
    ['equipment', i => { i.sessions.at(-1).equipment = 'machine'; }],
    ['rep range', i => { i.sessions.at(-1).repRange = '3-5'; }],
    ['fewer sets', i => { i.sessions.at(-1).sets.splice(1); }],
    ['incomplete session', i => { i.sessions.at(-1).sets[0].completed = false; }],
    ['block', i => { i.sessions.at(-1).blockId = 'new'; }],
    ['planned deload', i => { i.sessions.forEach(s => { s.phase = 'deload'; }); }],
    ['unilateral context', i => { i.sessions.at(-1).unilateral = true; i.sessions.at(-1).sets.forEach(s => { s.weightRight = 80; s.repsRight = 10; }); }],
    ['classification edit', i => { i.configs = [{ ...equipment(), updatedAt: '2026-10-01T18:00:00.000Z' }]; }],
    ['return after long gap', i => { i.sessions.at(-1).date = '2026-11-20T18:00:00.000Z'; i.now = '2026-11-21T18:00:00.000Z'; }]
]) test(`11 plateau suppresses false positive after ${name}`, () => assert.equal(plateau(coachScenario({ change })).state, 'context_changed'));
test('11 changing RIR contradicts a flat load trend', () => { const i = coachScenario(); i.sessions.slice(5).forEach(s => s.sets.forEach(v => { v.rpe = 6; })); assert.equal(plateau(i).state, 'contradictory'); });
test('11 extreme outliers cause contradiction, not a confident diagnosis', () => { const i = coachScenario(); i.sessions[0].sets[0].weight = 300; assert.equal(plateau(i).state, 'contradictory'); });
test('11 missing RIR never yields possible plateau', () => { const i = coachScenario(); i.sessions.forEach(s => s.sets.forEach(v => { v.rpe = null; })); assert.equal(plateau(i).state, 'maintenance'); });
test('11 high reps do not silently extrapolate physiological e1RM', () => assert.equal(plateau(coachScenario({ reps: () => 20 })).state, 'insufficient'));
test('11 same-day partial logs are not independent plateau samples', () => { const i = coachScenario(); i.sessions.forEach(s => { s.date = i.sessions[0].date; }); assert.equal(plateau(i).sessions, 1); });
test('11 unilateral series count once and use the conservative observed side', () => { const i = coachScenario(); i.exercises[0].isUnilateral = true; i.sessions.forEach(s => { s.unilateral = true; s.sets.forEach(v => { v.weightRight = 70; v.repsRight = 10; }); }); const p = plateau(i); assert(p.recent < 100); assert.equal(analyzeCoachHypertrophy(i).training.completedSets, 30); });
test('11 bench attribution separates 30 direct sets from estimated secondary participation', () => { const v = analyzeCoachVolume(coachScenario()); assert.equal(v.weeks.filter(w => w.muscle === 'chest').reduce((n, w) => n + w.direct, 0), 30); assert.equal(v.weeks.filter(w => w.muscle === 'triceps').reduce((n, w) => n + w.indirect, 0), 15); });
test('11 voluntary attribution coefficient changes estimates without changing observed sets', () => { const i = coachScenario(); i.configs = [{ ...equipment(), indirectWeight: 0.25 }]; const v = analyzeCoachVolume(i); assert.equal(v.weeks.filter(w => w.muscle === 'triceps').reduce((n, w) => n + w.indirect, 0), 7.5); });
test('11 custom unclassified exercises remain explicitly unknown', () => { const i = coachScenario(); i.sessions.forEach(s => { s.name = 'Custom exercise'; s.muscleGroup = null; }); assert.equal(analyzeCoachVolume(i).unknown[0].sets, 30); });
test('11 incomplete sets are excluded from direct volume', () => { const i = coachScenario(); i.sessions[0].sets[0].completed = false; assert.equal(analyzeCoachHypertrophy(i).training.completedSets, 29); });
test('11 partial calendar weeks never produce a misleading week-on-week regression', () => { const v = analyzeCoachVolume(coachScenario()); assert(v.partialCurrentWeek); assert(v.weeks.filter(w => w.week === '2026-10-19').every(w => w.directDelta === null)); });
test('11 sleep missing gives honest recovery uncertainty', () => assert.equal(analyzeCoachRecovery(coachScenario()).status, 'insufficient'));
function withRecovery(i) { for (let n = 0; n < 20; n++) i.checkIns.push({ date: new Date(Date.UTC(2026, 9, 4 + n, 12)).toISOString().slice(0, 10), sleepHours: n < 13 ? 8 : 5, energy: n < 13 ? 4 : 2, fatigue: n < 13 ? 2 : 4, sleepQuality: null, stress: null, soreness: {} }); return i; }
test('11 recovery compares individual means and states correlation limits', () => { const r = analyzeCoachRecovery(withRecovery(coachScenario())); assert.equal(r.status, 'caution'); assert(r.hypotheses[0].includes('no demuestra causalidad')); });
test('11 sparse self-reports never manufacture a personal baseline', () => { const i = withRecovery(coachScenario()); i.checkIns.splice(0, 16); assert.equal(analyzeCoachRecovery(i).status, 'insufficient'); });
const loading = i => recommendCoachLoading('bench', i, analyzeCoachRecovery(i));
test('11 loading v2 preserves v1 and abstains until equipment is configured', () => { const l = loading(coachScenario()); assert(l.v1); assert.equal(l.recommendation, null); assert.equal(l.rule, 'configure-equipment'); });
test('11 a newly started mesocycle cannot inherit a recommendation from the previous block', () => { const i = coachScenario({ reps: () => 12 }); i.configs = [equipment()]; i.blocks = [{ id: 'new', routineId: 'routine', name: 'Descarga nueva', phase: 'deload', startedAt: '2026-10-22T18:00:00.000Z' }]; assert.equal(loading(i).recommendation, null); assert.equal(loading(i).rule, 'mesocycle-context-changed'); });
test('11 loading proposes configured decimal increment only after all work reaches target', () => { const i = coachScenario({ reps: () => 12 }); i.configs = [equipment(0.25)]; assert.deepEqual(loading(i).recommendation, { weight: 80.25, reps: 8 }); });
test('11 dumbbell available loads override a universal barbell increment', () => { const i = coachScenario({ weight: () => 20, reps: () => 12 }); i.configs = [{ ...equipment(2.5, [18, 20, 21]), equipment: 'dumbbell' }]; assert.equal(loading(i).recommendation.weight, 21); });
test('11 excessive load jumps are blocked', () => { const i = coachScenario({ weight: () => 10, reps: () => 12 }); i.configs = [equipment(5)]; assert.equal(loading(i).rule, 'jump-guard'); assert.equal(loading(i).recommendation, null); });
test('11 recovery caution holds a suggestion without modifying the workout', () => { const i = withRecovery(coachScenario({ reps: () => 12 })); i.configs = [equipment()]; const before = JSON.stringify(i); assert.equal(loading(i).rule, 'recovery-hold'); assert.equal(JSON.stringify(i), before); });
test('11 unknown effort makes loading abstain', () => { const i = coachScenario(); i.configs = [equipment()]; i.sessions.at(-1).sets[0].rpe = null; assert.equal(loading(i).recommendation, null); });
test('11 stale performance is not a safe load reference', () => { const i = coachScenario(); i.now = '2026-12-01T18:00:00.000Z'; i.configs = [equipment()]; assert.equal(loading(i).rule, 'stale-or-outlier'); });
test('11 present session effort can hold an otherwise progressing suggestion', () => { const i = coachScenario({ reps: () => 12 }); i.configs = [equipment()]; const l = recommendCoachLoading('bench', i, analyzeCoachRecovery(i), [{ weight: 80, reps: 8, rpe: 10, completed: true }]); assert.equal(l.rule, 'effort-hold'); });
test('11 irregular body observations use actual dates without interpolation', () => { const i = coachScenario(); i.body = [{ id: '1', date: '2026-10-01T18:00:00Z', weight: 70, muscleMass: null, photoUrl: null }, { id: '2', date: '2026-10-20T18:00:00Z', weight: 71, muscleMass: null, photoUrl: null }]; const h = analyzeCoachHypertrophy(i); assert.equal(h.changes[0].delta, 1); assert.equal(h.weight.length, 2); assert(h.limitations[0].includes('no demuestra')); });
test('11 insufficient-question response exposes actual missing inputs', () => { const a = answerCoach(buildCoachReport(coachScenario({ count: 1 })), '¿Qué datos te faltan?'); assert(a.text.some(t => t.includes('6 días'))); });
test('11 improving back requires observed performance, not volume alone', () => { const a = answerCoach(buildCoachReport(coachScenario()), '¿Estoy mejorando en espalda?'); assert(a.text[0].includes('Faltan sesiones')); });
test('11 back progress uses only the classified back exercise facts', () => { const i = coachScenario({ weight: n => 60 + n * 3 }); i.exercises[0].name = 'Remo con Barra'; i.exercises[0].muscleGroup = 'back'; i.sessions.forEach(s => { s.name = 'Remo con Barra'; s.muscleGroup = 'back'; }); const a = answerCoach(buildCoachReport(i), '¿Estoy mejorando en espalda?'); assert.equal(a.intent, 'plateau'); assert(a.text.some(t => t.includes('Progreso detectado'))); });
test('11 an explicitly named exercise takes precedence over a different selected exercise', () => { const i = coachScenario(); i.exercises.push({ ...i.exercises[0], id: 'other', name: 'Curl bíceps' }); const a = answerCoach(buildCoachReport(i), '¿Por qué no progreso en press banca?', 'other'); assert.equal(a.exerciseId, 'bench'); });
test('11 ambiguous equipment variants are never silently merged', () => { const i = coachScenario(); i.exercises[0].name = 'Press de Banca con Barra'; i.exercises.push({ ...i.exercises[0], id: 'other', name: 'Press de Banca con Mancuernas' }); const a = answerCoach(buildCoachReport(i), '¿Por qué no progreso en press banca?'); assert.equal(a.exerciseId, null); assert(a.text[0].includes('variante exacta')); });
test('11 body weight questions use body trends rather than loading recommendations', () => assert.equal(answerCoach(buildCoachReport(coachScenario()), '¿Cómo va mi peso corporal?').intent, 'hypertrophy'));
test('11 current month is a CDMX civil interval across a UTC month boundary', () => { assert.equal(period('month', new Date('2026-11-01T05:30:00Z')), 31); assert.equal(period('month', new Date('2026-11-01T06:30:00Z')), 1); });
for (const [message, view] of [['¿Por qué no progreso en press banca?', 'plateau'], ['¿Cómo va mi volumen semanal?', 'volume'], ['¿Cómo influye mi recuperación?', 'recovery'], ['¿Por qué me sugieres este peso?', 'loading'], ['¿Cómo va mi hipertrofia?', 'hypertrophy'], ['¿Cómo va mi mesociclo?', 'timeline']]) test(`11 assistant chooses allowed view: ${view}`, () => assert.equal(answerCoach(buildCoachReport(coachScenario()), message).intent, view));
test('11 excluded actions never become persistent tools', () => assert.deepEqual(answerCoach(buildCoachReport(coachScenario()), 'elimina mis rutinas').views, []));
test('11 no provider still returns useful structured facts', async () => { const a = await createCoachAssistant().answer('A', buildCoachReport(coachScenario()), { message: 'volumen', useProvider: true }); assert.equal(a.mode, 'deterministic'); assert(a.text.length); });
test('11 external provider receives only minimal safe aggregate facts after consent', async () => { let received; const a = createCoachAssistant({ provider: async c => { received = c; return { selection: { factIds: [c.facts[0].id], views: ['volume'] } }; } }); const report = buildCoachReport(withRecovery(coachScenario())); const out = await a.answer('privateOwner', report, { message: 'volumen PRIVATE MESSAGE', useProvider: true }); assert.equal(out.mode, 'provider'); const data = JSON.stringify(received); for (const secret of ['privateOwner', 'PRIVATE MESSAGE', 'Press banca', 'sleepHours', 'soreness', 'photo']) assert(!data.includes(secret)); });
test('11 no consent means zero external calls', async () => { let calls = 0; await createCoachAssistant({ provider: () => { calls++; } }).answer('A', buildCoachReport(coachScenario()), { message: 'volumen' }); assert.equal(calls, 0); });
for (const selection of [{ factIds: ['invented'], views: ['volume'] }, { factIds: ['volume.summary'], views: ['<script>'] }, { factIds: ['volume.summary'], views: ['volume'], userId: 'B' }, { factIds: ['volume.summary'], views: ['volume'], text: '999 kg' }]) test('11 invalid or injected provider selection falls back without invented content ' + JSON.stringify(selection), async () => { const a = await createCoachAssistant({ provider: async () => ({ selection }) }).answer('A', buildCoachReport(coachScenario()), { message: 'volumen', useProvider: true }); assert.equal(a.mode, 'deterministic'); assert(!a.text.join().includes('999')); });
test('11 provider timeout aborts and returns deterministic answer', async () => { let signal; const a = await createCoachAssistant({ timeoutMs: 15, provider: (_, s) => { signal = s; return new Promise(() => {}); } }).answer('A', buildCoachReport(coachScenario()), { message: 'volumen', useProvider: true }); assert.equal(a.mode, 'deterministic'); assert(signal.aborted); });
test('11 daily provider budget is bounded and does not disable local analysis', async () => { const a = createCoachAssistant({ provider: async c => ({ selection: { factIds: [c.facts[0].id], views: ['volume'] }, inputTokens: 10, outputTokens: 5 }) }), r = buildCoachReport(coachScenario()); for (let n = 0; n < 21; n++) await a.answer('A', r, { message: 'volumen', useProvider: true }); assert.equal(a.usage().calls, 20); assert.equal(a.usage().inputTokens, 200); });
for (const body of [{ sleepHours: 25 }, { energy: 0 }, { fatigue: '5' }, { soreness: { unknown: 2 } }, { userId: 'B' }]) test('11 check-in rejects invalid optional fields ' + JSON.stringify(body), () => assert.throws(() => checkIn(body)));
test('11 all wellbeing fields may be absent', () => assert.equal(checkIn({}).energy, null));
test('11 invalid civil dates are rejected', () => assert.throws(() => civilDate('2026-02-30')));
test('11 classification rejects double attribution to the direct muscle', () => assert.throws(() => exerciseConfig({ ...equipment(), secondaryMuscles: ['chest'] })));
test('11 body measurements never accept invented or nonfinite values', () => assert.throws(() => measurement({ date: '2026-10-01', zone: 'biceps', cm: NaN, quality: 'unknown' })));
test('11 long history is measured with a reproducible synthetic benchmark', async () => { const input = coachScenario(); for (let n = 0; n < 499; n++) { const id = `e${n}`; input.exercises.push({ ...input.exercises[0], id }); input.sessions.push(...input.sessions.slice(0, 10).map(s => ({ ...s, id: s.id + id, exerciseId: id }))); } const timings = []; for (let n = 0; n < 5; n++) { const start = performance.now(); const r = buildCoachReport(input); assert.equal(r.plateaus.length, 500); timings.push(performance.now() - start); } await mkdir(new URL('../../server/audit/coach/', import.meta.url), { recursive: true }); await writeFile(new URL('../../server/audit/coach/performance.json', import.meta.url), JSON.stringify({ exercises: 500, sessions: 5000, sets: 15000, samples: timings, mode: 'synthetic in-process Node, no universal physiological or production latency claim' }, null, 2)); });


