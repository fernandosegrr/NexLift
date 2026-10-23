import { storedRpeToRir } from './effort.js';
/** Loads are kg, repetitions are counts. Legacy fields deliberately accept
 * unknown: Number coercion and stored-effort priority are compatibility rules,
 * not HTTP validation. Right-side nullish values inherit the left independently.
 * completed, dates, identifiers and routine metadata are caller responsibilities. */
export interface LegacySmartSet {
    readonly weight?: unknown; readonly reps?: unknown;
    readonly weightRight?: unknown; readonly repsRight?: unknown;
    readonly rpe?: unknown; readonly rir?: unknown; readonly completed?: boolean;
}
export interface EffectiveSmartSet { readonly weight: number; readonly reps: number; readonly rir: unknown }
export interface SmartSession { readonly sets?: readonly LegacySmartSet[] | null }
export type SmartPhase = string | null;
export type LegacySmartPhase = SmartPhase | { readonly phase?: SmartPhase };
export interface RepRange { readonly lo: number; readonly hi: number }
export interface IntraOptions { readonly lo?: number | null; readonly hi?: number | null; readonly increment?: number | null; readonly phase?: SmartPhase }
export interface WorkReference {
    readonly weight: number; readonly reps: number; readonly minReps: number;
    readonly rir: number | null; readonly setsAtWeight: readonly EffectiveSmartSet[];
}
export interface InterSuggestion { readonly weight: number; readonly reps: number; readonly rationale: string; readonly basedOn: number; readonly phase: SmartPhase }
export interface IntraSuggestion { readonly weight: number; readonly reps: number; readonly rationale: string; readonly phase: SmartPhase; readonly source: 'intra' }
export type InterRule = 'top-set-passed' | 'all-hit-top' | 'equalize-reps' | 'below-range-hold' | 'progress-reps';
export type IntraRule = 'first-failure-backoff' | 'last-failure-step' | 'below-range-step' | 'fatigue-hold' | 'comfortable-reps' | 'neutral-hold';
interface KnownTodaySet { readonly weight: number; readonly reps: number; readonly rir: number }
export interface InterExplanation {
    readonly mode: 'inter'; readonly rule: InterRule; readonly range: RepRange;
    readonly historyCount: number; readonly usedSessionIndex: 0; readonly positiveSetCount: number;
    readonly reference: { readonly weight: number; readonly reps: number; readonly minReps: number; readonly rir: number | null; readonly setsAtWeight: number };
    readonly increment: number; readonly rawWeight: number; readonly roundingGrid: number | null;
    readonly weightDelta: number; readonly resultWeight: number; readonly limitations: readonly string[];
}
export interface IntraExplanation {
    readonly mode: 'intra'; readonly rule: IntraRule; readonly range: RepRange; readonly positiveSetCount: number;
    readonly first: KnownTodaySet; readonly last: KnownTodaySet;
    readonly minRir: number; readonly avgRir: number; readonly rirDrop: number; readonly repDrop: number;
    readonly increment: number; readonly rawWeight: number; readonly roundingGrid: number | null;
    readonly resultWeight: number; readonly weightDelta: number; readonly fallbackStep: boolean; readonly limitations: readonly string[];
}
export interface Abstention { readonly mode: 'inter' | 'intra'; readonly rule: 'abstain'; readonly reason: 'empty-history' | 'empty-today' | 'no-positive-work' | 'no-reference' | 'missing-finite-rir' | 'nonpositive-result' }
export type SmartEvaluation<T extends InterSuggestion | IntraSuggestion> = { readonly recommendation: T; readonly explanation: T extends InterSuggestion ? InterExplanation : IntraExplanation }
    | { readonly recommendation: null; readonly explanation: Abstention };
function abstain(mode: 'inter' | 'intra', reason: Abstention['reason']): { readonly recommendation: null; readonly explanation: Abstention } {
    return { recommendation: null, explanation: { mode, rule: 'abstain', reason } };
}
function allHaveKnownRir(sets: { readonly weight: number; readonly reps: number; readonly rir: number | null }[]): sets is KnownTodaySet[] {
    return !sets.some(s => s.rir == null || !Number.isFinite(s.rir));
}
function weightGrid(increment: number, base: number): number {
    return (Math.abs(base % increment) < 0.01) ? increment : 0.5;
}
/** ECMAScript ToPrimitive(number) then ToNumber, for the old subtraction and
 * Math.min boundaries. Number(BigInt) is permissive; arithmetic was not. No
 * normalization of raw rir is performed by effectiveWorkoutSet. */
function legacyArithmeticNumber(value: unknown): number {
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
        const exotic: unknown = Reflect.get(value, Symbol.toPrimitive);
        if (exotic != null) {
            if (typeof exotic !== 'function') throw new TypeError('Cannot convert object to primitive value');
            const primitive: unknown = Reflect.apply(exotic, value, ['number']);
            if (Object(primitive) === primitive) throw new TypeError('Cannot convert object to primitive value');
            return legacyArithmeticNumber(primitive);
        }
        for (const key of ['valueOf', 'toString']) {
            const method: unknown = Reflect.get(value, key);
            if (typeof method !== 'function') continue;
            const primitive: unknown = Reflect.apply(method, value, []);
            if (Object(primitive) !== primitive) return legacyArithmeticNumber(primitive);
        }
        throw new TypeError('Cannot convert object to primitive value');
    }
    if (typeof value === 'bigint') throw new TypeError('Cannot mix BigInt and other types, use explicit conversions');
    return Number(value);
}
// Ajusta el rango de reps objetivo según la fase del bloque activo (si hay uno).
// NO modifica el rango guardado del ejercicio, solo el usado para ESTA sugerencia:
// intensificación lo reduce a la mitad (más peso, menos reps),
// acumulación sube el techo 50% (más reps antes de subir peso). Descarga/
// personalizado/sin bloque activo: rango sin cambios.
export function adjustRepRangeForPhase(lo: number, hi: number, phase: SmartPhase): RepRange {
    if (phase === 'intensification') {
        const newLo = Math.max(1, Math.round(lo * 0.5));
        return { lo: newLo, hi: Math.max(newLo, Math.round(hi * 0.5)) };
    }
    if (phase === 'accumulation') {
        return { lo, hi: Math.round(hi * 1.5) };
    }
    return { lo, hi };
}

export function parseRepRange(targetReps: unknown): RepRange {
    const nums = String(targetReps || '').match(/\d+/g);
    if (!nums) return { lo: 8, hi: 12 };
    const a = parseInt(nums[0], 10);
    const b = nums[1] ? parseInt(nums[1], 10) : a;
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

// Incremento de carga: 5kg piernas, 2.5kg resto. Si muscleGroup falta, infiere
// por nombre (misma REGEX que server/src/logic.js).
const LEGS_NAME_RE = /sentadilla|prensa|hack|femoral|cuadr[ií]cep|aductor|abductor|gemelo|pantorrilla|zancada|b[uú]lgara|hip\s*thrust|peso\s*muerto|deadlift|\bleg\b|extensi[oó]n(es)?\s+de\s+cu[aá]/i;
export function resolveWeightIncrement(muscleGroup: string | null | undefined, exerciseName = ''): number {
    // 'Piernas' (canónico ES) o 'legs' (catálogo cliente en inglés)
    if (muscleGroup === 'Piernas' || muscleGroup === 'legs') return 5;
    if (!muscleGroup && LEGS_NAME_RE.test(exerciseName || '')) return 5;
    return 2.5;
}

// En unilateral usa el lado débil (el que limita la progresión).
export function effectiveWorkoutSet(set: LegacySmartSet): EffectiveSmartSet {
    const w = Number(set.weight) || 0;
    const r = Number(set.reps) || 0;
    const hasRight = set.weightRight != null || set.repsRight != null;
    const wR = set.weightRight != null ? Number(set.weightRight) : w;
    const rR = set.repsRight != null ? Number(set.repsRight) : r;
    const rir = set.rpe != null ? storedRpeToRir({ kind: 'stored-rpe', value: legacyArithmeticNumber(set.rpe) }).value : (set.rir != null ? set.rir : null);
    return {
        weight: hasRight ? Math.min(w, wR) : w,
        reps: hasRight ? Math.min(r, rR) : r,
        rir
    };
}

export function roundWorkoutWeight(w: number, increment: number, base: number): number {
    const grid = (Math.abs(base % increment) < 0.01) ? increment : 0.5;
    return Math.round(w / grid) * grid;
}

/**
 * Serie de TRABAJO de la última sesión (no single de tope ni drop set).
 * Incluye protección contra Singles/Doubles (reps < 3) cuando lo > 3.
 * La política histórica completa está en docs/TRAINING-SMART-LOADING.md.
 */
export function pickWorkReference(working: readonly EffectiveSmartSet[] | null | undefined, lo: number): WorkReference | null {
    if (!working || working.length === 0) return null;
    // Protección contra Singles/Doubles (Ego Lifting): ignora series de 1 o 2 reps
    // a menos que el rango objetivo de la rutina sea explícitamente de fuerza máxima (lo <= 3).
    const nonEgo = lo > 3 ? working.filter(s => s.reps >= 3) : working;
    const baseWorking = nonEgo.length > 0 ? nonEgo : working;

    const maxW = Math.max(...baseWorking.map(s => s.weight));
    const main = baseWorking.filter(s => s.weight >= maxW * 0.75);
    const pool = main.length > 0 ? main : baseWorking;

    // Si existe un Top Set pesado de alta intensidad (RIR <= 1 / RPE >= 9) al peso máximo
    // del pool válido, anclar en ese peso para que un Back-off set no lo eclipse.
    const topWeight = Math.max(...pool.map(s => s.weight));
    const atTopWeight = pool.filter(s => Math.abs(s.weight - topWeight) < 0.01);
    const hasHeavyTopSet = atTopWeight.some(s => s.rir != null && Number(s.rir) <= 1);

    let refWeight;
    if (hasHeavyTopSet) {
        refWeight = topWeight;
    } else {
        let candidates: readonly EffectiveSmartSet[] = pool.filter(s => s.reps >= lo);
        if (candidates.length === 0) {
            const maxReps = Math.max(...pool.map(s => s.reps));
            candidates = pool.filter(s => s.reps === maxReps);
        }
        if (candidates.length === 0) candidates = pool;
        refWeight = Math.max(...candidates.map(s => s.weight));
    }

    const sameWeight = pool.filter(s => Math.abs(s.weight - refWeight) < 0.01);
    const refReps = Math.max(...sameWeight.map(s => s.reps));
    const knownRir = sameWeight.map(s => s.rir).filter(v => v != null);
    const rir = knownRir.length ? Math.min(...knownRir.map(legacyArithmeticNumber)) : null;
    const minReps = Math.min(...sameWeight.map(s => s.reps));

    return { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight: sameWeight };
}

/**
 * Sugerencia por Top Set + Back-off / Doble Progresión. `sessions` ordenado DESC por fecha.
 * - Desbloquea incremento de peso si el Top Set alcanzó >= hi reps con RIR <= 1 (RPE 9-10),
 *   o si todas las series al peso de trabajo alcanzaron >= hi.
 */
export function evaluateWorkoutSuggestion(sessions: readonly SmartSession[] | null | undefined, targetReps: unknown, increment: number, phase: LegacySmartPhase = null): SmartEvaluation<InterSuggestion> {
    if (!sessions || sessions.length === 0) return abstain('inter', 'empty-history');
    const resolvedPhase = (phase && typeof phase === 'object') ? (phase.phase ?? null) : (phase ?? null);
    const parsedRange = parseRepRange(targetReps);
    const { lo, hi } = adjustRepRangeForPhase(parsedRange.lo, parsedRange.hi, resolvedPhase);

    const working = (sessions[0].sets || [])
        .map(effectiveWorkoutSet)
        .filter(s => s.weight > 0 && s.reps > 0);
    if (working.length === 0) return abstain('inter', 'no-positive-work');

    const ref = pickWorkReference(working, lo);
    if (!ref) return abstain('inter', 'no-reference');

    const { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight } = ref;
    const allHitTop = setsAtWeight.every(s => s.reps >= hi);
    const topSetPassed = setsAtWeight.find(s => s.reps >= hi && s.rir != null && Number(s.rir) <= 1);

    let weight: number, reps: number, rationale: string;
    let rule: InterRule;

    if (topSetPassed || allHitTop) {
        rule = topSetPassed && !allHitTop ? 'top-set-passed' : 'all-hit-top';
        weight = roundWorkoutWeight(refWeight + increment, increment, refWeight);
        reps = lo;
        if (topSetPassed && !allHitTop) {
            rationale = `Top Set superado (${refWeight}kg × ${topSetPassed.reps} a RIR ${topSetPassed.rir}): sube a ${weight}kg y reinicia en ${lo}.`;
        } else {
            rationale = setsAtWeight.length > 1
                ? `Todas las series a ${refWeight}kg llegaron a ≥${hi} reps: sube a ${weight}kg y reinicia en ${lo}.`
                : `Alcanzaste ${refReps} reps con ${refWeight}kg (tope del rango): sube a ${weight}kg y reinicia en ${lo}.`;
        }
    } else if (refReps >= hi) {
        rule = 'equalize-reps';
        weight = refWeight;
        reps = Math.min(hi, minReps + 1);
        rationale = `La mejor serie fue ${refWeight}kg × ${refReps}, pero no todas llegaron a ${hi}: mantén ${weight}kg y apunta a ${reps} en todas.`;
    } else {
        rule = refReps < lo ? 'below-range-hold' : 'progress-reps';
        const bump = (rir != null && rir >= 3) ? 2 : 1;
        weight = refWeight;
        reps = Math.min(hi, refReps + bump);
        if (refReps < lo) {
            rationale = rir != null
                ? `Trabajo de referencia ${refWeight}kg × ${refReps} (RIR ${rir}), por debajo del rango ${lo}–${hi}: mantén el peso y apunta a ${reps} reps.`
                : `Trabajo de referencia ${refWeight}kg × ${refReps}, por debajo del rango ${lo}–${hi}: mantén el peso y apunta a ${reps} reps.`;
        } else {
            rationale = rir != null
                ? `Hiciste ${refWeight}kg × ${refReps} (RIR ${rir}): mantén el peso y apunta a ${reps} reps.`
                : `Hiciste ${refWeight}kg × ${refReps}: mantén el peso y apunta a ${reps} reps.`;
        }
    }

    if (weight <= 0 || reps <= 0) return abstain('inter', 'nonpositive-result');
    return { recommendation: { weight, reps, rationale, basedOn: sessions.length, phase: resolvedPhase },
        explanation: { mode: 'inter', rule, range: { lo, hi }, historyCount: sessions.length,
            usedSessionIndex: 0, positiveSetCount: working.length,
            reference: { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight: setsAtWeight.length },
            increment, rawWeight: topSetPassed || allHitTop ? refWeight + increment : refWeight,
            roundingGrid: topSetPassed || allHitTop ? weightGrid(increment, refWeight) : null,
            weightDelta: weight - refWeight, resultWeight: weight,
            limitations: ['first-session-only', 'caller-order', 'completed-not-filtered'] } };
}

/**
 * Autorregulación INTRA-sesión: sugiere la siguiente serie mirando TODAS las
 * series completadas HOY del mismo ejercicio. Requiere RIR en cada una.
 * A diferencia de computeWorkoutSuggestion (entre sesiones), SÍ puede bajar peso.
 *
 * Si la Serie 1 (Top Set) se registra al fallo absoluto (RIR === 0 / RPE === 10),
 * calcula automáticamente un Back-off Set (-12.5% de peso) apuntando al techo
 * del rango (+1 o +2 reps respecto al Top Set).
 */
export function evaluateNextSetFromToday(completedToday: readonly LegacySmartSet[] | null | undefined, optsOrTargetReps: IntraOptions | string | null = {}, legacyIncrement = 2.5, legacyPhase: LegacySmartPhase = null): SmartEvaluation<IntraSuggestion> {
    if (!completedToday || completedToday.length === 0) return abstain('intra', 'empty-today');

    let lo = 8, hi = 12, increment = 2.5;
    let phase: SmartPhase = null;
    if (typeof optsOrTargetReps === 'string') {
        const parsed = parseRepRange(optsOrTargetReps);
        lo = parsed.lo;
        hi = parsed.hi;
        increment = typeof legacyIncrement === 'number' ? legacyIncrement : 2.5;
        phase = (legacyPhase && typeof legacyPhase === 'object') ? (legacyPhase.phase ?? null) : (legacyPhase ?? null);
    } else if (optsOrTargetReps && typeof optsOrTargetReps === 'object') {
        lo = optsOrTargetReps.lo ?? 8;
        hi = optsOrTargetReps.hi ?? 12;
        increment = optsOrTargetReps.increment ?? 2.5;
        phase = optsOrTargetReps.phase ?? null;
    }

    const sets = completedToday
        .map(s => ({
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 0,
            rir: s.rir != null && s.rir !== '' ? Number(s.rir) : null
        }))
        .filter(s => s.weight > 0 && s.reps > 0);

    if (!sets.length) return abstain('intra', 'no-positive-work');
    // RIR obligatorio en TODAS las series de hoy usadas para el cálculo
    if (!allHaveKnownRir(sets)) return abstain('intra', 'missing-finite-rir');
    const knownSets = sets;

    const range = adjustRepRangeForPhase(lo, hi, phase);
    const adjLo = range.lo;
    const adjHi = range.hi;

    const last = knownSets[knownSets.length - 1];
    const first = knownSets[0];
    const minRir = Math.min(...knownSets.map(s => s.rir));
    const avgRir = knownSets.reduce((a, s) => a + s.rir, 0) / sets.length;
    const rirDrop = first.rir - last.rir;
    const repDrop = first.reps - last.reps;

    let weight = last.weight;
    let reps = last.reps;
    let rationale: string;
    let rule: IntraRule;
    let rawWeight = last.weight;
    let roundingGrid: number | null = null;

    if (sets.length === 1 && first.rir <= 0) {
        rule = 'first-failure-backoff';
        // Serie 1 (Top Set) al fallo absoluto (RIR 0 / RPE 10) → Back-off Set (-12.5%, entre 10-15%)
        const rawBackoff = first.weight * 0.875;
        rawWeight = rawBackoff;
        roundingGrid = weightGrid(increment, first.weight);
        const roundedBackoff = roundWorkoutWeight(rawBackoff, increment, first.weight);
        weight = roundedBackoff < first.weight
            ? Math.max(increment > 0 ? increment : 0.5, roundedBackoff)
            : roundWorkoutWeight(Math.max(0.5, first.weight - Math.max(increment, 0.5)), increment, first.weight);
        reps = first.reps < adjHi
            ? Math.min(adjHi, Math.max(adjLo, first.reps + 2))
            : first.reps + 1;
        rationale = `Top Set al fallo (RIR 0) → Back-off Set (-12.5%): ${weight} kg × ${reps} reps.`;
    } else if (last.rir <= 0 || last.reps < adjLo) {
        rule = last.rir <= 0 ? 'last-failure-step' : 'below-range-step';
        rawWeight = Math.max(0, last.weight - increment);
        roundingGrid = weightGrid(increment, last.weight);
        // Serie subsecuente al fallo o por debajo del suelo del rango: baja un incremento
        const stepped = roundWorkoutWeight(
            Math.max(0, last.weight - increment),
            increment,
            last.weight
        );
        weight = stepped < last.weight
            ? Math.max(increment > 0 ? increment : 0.5, stepped)
            : roundWorkoutWeight(Math.max(0.5, last.weight - Math.max(increment, 0.5)), increment, last.weight);
        reps = Math.min(adjHi, Math.max(adjLo, last.reps));
        rationale = last.rir <= 0
            ? `Hoy RIR ${last.rir} en alguna serie → baja a ${weight} kg × ${reps}.`
            : `Reps bajo el rango ${adjLo}–${adjHi} → baja a ${weight} kg × ${reps}.`;
    } else if (last.rir === 1 || rirDrop >= 2 || (repDrop >= 2 && last.rir <= 2)) {
        rule = 'fatigue-hold';
        // Fatiga: mismo peso, no empujar reps
        weight = last.weight;
        reps = Math.min(adjHi, Math.max(adjLo, last.reps));
        rationale = `Fatiga de hoy (RIR min ${minRir}) → mantén ${weight} kg × ${reps}.`;
    } else if (avgRir >= 2.5 && minRir >= 2 && last.reps >= adjLo) {
        rule = 'comfortable-reps';
        // Cómodo: mismo peso, +1/+2 reps (doble progresión intra-sesión — no clonar la serie anterior)
        weight = last.weight;
        const bump = avgRir >= 3 ? 2 : 1;
        reps = Math.min(adjHi, last.reps + bump);
        if (reps > last.reps) {
            rationale = `Series de hoy cómodas (RIR min ${minRir}) → ${weight} kg × ${reps} (+${reps - last.reps} rep).`;
        } else {
            // Ya en el techo del rango con RIR alto: la subida de peso es entre sesiones
            rationale = `Techo del rango ${adjLo}–${adjHi} con RIR alto → mantén ${weight} kg × ${reps}; la próxima sesión sube peso.`;
        }
    } else {
        rule = 'neutral-hold';
        // Neutro (RIR ~2): mismo peso; si aún no llegas al techo, pide al menos last.reps
        weight = last.weight;
        reps = Math.min(adjHi, Math.max(adjLo, last.reps));
        rationale = `Según series de hoy (RIR min ${minRir}) → ${weight} kg × ${reps}.`;
    }

    if (weight <= 0 || reps <= 0) return abstain('intra', 'nonpositive-result');
    return { recommendation: { weight, reps, rationale, phase, source: 'intra' },
        explanation: { mode: 'intra', rule, range: { lo: adjLo, hi: adjHi }, positiveSetCount: sets.length,
            first: { ...first }, last: { ...last }, minRir, avgRir, rirDrop, repDrop,
            increment, rawWeight, roundingGrid, resultWeight: weight, weightDelta: weight - last.weight,
            fallbackStep: roundingGrid != null && (rule === 'first-failure-backoff'
                ? !(roundWorkoutWeight(rawWeight, increment, first.weight) < first.weight)
                : !(roundWorkoutWeight(rawWeight, increment, last.weight) < last.weight)),
            limitations: ['caller-order', 'caller-completion-filter', 'rir-required'] } };
}

/** Stable public projections. Explanations remain internal and are never added
 * to UI DTOs, persisted suggestions, operations, receipts or request hashes. */
export function computeWorkoutSuggestion(sessions: readonly SmartSession[] | null | undefined, targetReps: unknown, increment: number, phase: LegacySmartPhase = null): InterSuggestion | null {
    return evaluateWorkoutSuggestion(sessions, targetReps, increment, phase).recommendation;
}
export function suggestNextSetFromToday(completedToday: readonly LegacySmartSet[] | null | undefined, optsOrTargetReps: IntraOptions | string | null = {}, legacyIncrement = 2.5, legacyPhase: LegacySmartPhase = null): IntraSuggestion | null {
    return evaluateNextSetFromToday(completedToday, optsOrTargetReps, legacyIncrement, legacyPhase).recommendation;
}
