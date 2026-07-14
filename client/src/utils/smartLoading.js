// Smart Loading — doble progresión autorregulada por RIR.
// Copia deliberada de server/src/logic.js (parseRepRange / effectiveWorkoutSet /
// roundWorkoutWeight / pickWorkReference / computeWorkoutSuggestion /
// adjustRepRangeForPhase). El proyecto no comparte código cliente/servidor
// (shared/ se eliminó a propósito); la paridad se vigila en
// smartLoading.parity.test.js.

// Ajusta el rango de reps objetivo según la fase del bloque activo (si hay uno).
// NO modifica el rango guardado del ejercicio, solo el usado para ESTA sugerencia:
// intensificación lo reduce a la mitad (más peso, menos reps),
// acumulación sube el techo 50% (más reps antes de subir peso). Descarga/
// personalizado/sin bloque activo: rango sin cambios.
export function adjustRepRangeForPhase(lo, hi, phase) {
    if (phase === 'intensification') {
        const newLo = Math.max(1, Math.round(lo * 0.5));
        return { lo: newLo, hi: Math.max(newLo, Math.round(hi * 0.5)) };
    }
    if (phase === 'accumulation') {
        return { lo, hi: Math.round(hi * 1.5) };
    }
    return { lo, hi };
}

export function parseRepRange(targetReps) {
    const nums = String(targetReps || '').match(/\d+/g);
    if (!nums) return { lo: 8, hi: 12 };
    const a = parseInt(nums[0], 10);
    const b = nums[1] ? parseInt(nums[1], 10) : a;
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

// Incremento de carga: 5kg piernas, 2.5kg resto. Si muscleGroup falta, infiere
// por nombre (misma REGEX que server/src/logic.js).
const LEGS_NAME_RE = /sentadilla|prensa|hack|femoral|cuadr[ií]cep|aductor|abductor|gemelo|pantorrilla|zancada|b[uú]lgara|hip\s*thrust|peso\s*muerto|deadlift|\bleg\b|extensi[oó]n(es)?\s+de\s+cu[aá]/i;
export function resolveWeightIncrement(muscleGroup, exerciseName = '') {
    // 'Piernas' (canónico ES) o 'legs' (catálogo cliente en inglés)
    if (muscleGroup === 'Piernas' || muscleGroup === 'legs') return 5;
    if (!muscleGroup && LEGS_NAME_RE.test(exerciseName || '')) return 5;
    return 2.5;
}

// En unilateral usa el lado débil (el que limita la progresión).
export function effectiveWorkoutSet(set) {
    const w = Number(set.weight) || 0;
    const r = Number(set.reps) || 0;
    const hasRight = set.weightRight != null || set.repsRight != null;
    const wR = set.weightRight != null ? Number(set.weightRight) : w;
    const rR = set.repsRight != null ? Number(set.repsRight) : r;
    const rir = set.rpe != null ? (10 - set.rpe) : (set.rir != null ? set.rir : null);
    return {
        weight: hasRight ? Math.min(w, wR) : w,
        reps: hasRight ? Math.min(r, rR) : r,
        rir
    };
}

export function roundWorkoutWeight(w, increment, base) {
    const grid = (Math.abs(base % increment) < 0.01) ? increment : 0.5;
    return Math.round(w / grid) * grid;
}

/**
 * Serie de TRABAJO de la última sesión (no single de tope ni drop set).
 * Ver comentarios en server/src/logic.js — misma lógica, byte-a-byte en espíritu.
 */
export function pickWorkReference(working, lo) {
    if (!working || working.length === 0) return null;
    const maxW = Math.max(...working.map(s => s.weight));
    const main = working.filter(s => s.weight >= maxW * 0.75);
    const pool = main.length > 0 ? main : working;

    let candidates = pool.filter(s => s.reps >= lo);
    if (candidates.length === 0) {
        const maxReps = Math.max(...pool.map(s => s.reps));
        candidates = pool.filter(s => s.reps === maxReps);
    }
    if (candidates.length === 0) candidates = pool;

    const refWeight = Math.max(...candidates.map(s => s.weight));
    const sameWeight = pool.filter(s => Math.abs(s.weight - refWeight) < 0.01);
    const refReps = Math.max(...sameWeight.map(s => s.reps));
    const knownRir = sameWeight.map(s => s.rir).filter(v => v != null);
    const rir = knownRir.length ? Math.min(...knownRir) : null;
    const minReps = Math.min(...sameWeight.map(s => s.reps));

    return { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight: sameWeight };
}

/**
 * Sugerencia por doble progresión. `sessions` ordenado DESC por fecha.
 * Sube de peso solo cuando TODAS las series al peso de trabajo tocan el techo.
 */
export function computeWorkoutSuggestion(sessions, targetReps, increment, phase = null) {
    if (!sessions || sessions.length === 0) return null;
    const parsedRange = parseRepRange(targetReps);
    const { lo, hi } = adjustRepRangeForPhase(parsedRange.lo, parsedRange.hi, phase);

    const working = (sessions[0].sets || [])
        .map(effectiveWorkoutSet)
        .filter(s => s.weight > 0 && s.reps > 0);
    if (working.length === 0) return null;

    const ref = pickWorkReference(working, lo);
    if (!ref) return null;

    const { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight } = ref;
    const allHitTop = setsAtWeight.every(s => s.reps >= hi);

    let weight, reps, rationale;

    if (allHitTop) {
        weight = roundWorkoutWeight(refWeight + increment, increment, refWeight);
        reps = lo;
        rationale = setsAtWeight.length > 1
            ? `Todas las series a ${refWeight}kg llegaron a ≥${hi} reps: sube a ${weight}kg y reinicia en ${lo}.`
            : `Alcanzaste ${refReps} reps con ${refWeight}kg (tope del rango): sube a ${weight}kg y reinicia en ${lo}.`;
    } else if (refReps >= hi) {
        weight = refWeight;
        reps = Math.min(hi, minReps + 1);
        rationale = `La mejor serie fue ${refWeight}kg × ${refReps}, pero no todas llegaron a ${hi}: mantén ${weight}kg y apunta a ${reps} en todas.`;
    } else {
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

    if (weight <= 0 || reps <= 0) return null;
    return { weight, reps, rationale, basedOn: sessions.length, phase };
}
