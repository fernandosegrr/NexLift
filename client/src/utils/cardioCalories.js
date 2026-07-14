/**
 * Estimación de kcal de una sesión de cardio (informativa).
 * Fórmula MET × peso(kg) × horas — no sustituye lo que diga la máquina/reloj.
 *
 * METs simplificados (ACSM-inspired para caminadora con inclinación).
 */

const DEFAULT_WEIGHT_KG = 70;

/** MET base por actividad cuando no hay inclinación/velocidad útiles. */
const BASE_MET = {
    caminadora: 4.3, // caminata moderada
    bici: 6.8,       // bici estacionaria moderada
    eliptica: 5.0,
    otro: 5.0
};

/**
 * MET de un tramo. Caminadora: VO2 ACSM walk → MET si hay velocidad o inclinación.
 * @param {string} activity
 * @param {{ durationMin?: number, incline?: number|null, speed?: number|null }} seg
 */
export function segmentMet(activity, seg = {}) {
    const act = String(activity || 'otro').toLowerCase();
    if (act === 'caminadora') {
        // velocidad km/h → m/min; default 5.0 km/h (paseo típico en cinta)
        const speedKmh = Number(seg.speed);
        const speed = Number.isFinite(speedKmh) && speedKmh > 0 ? speedKmh : 5.0;
        const mPerMin = (speed * 1000) / 60;
        const grade = Math.max(0, Number(seg.incline) || 0) / 100; // 12 → 0.12
        // ACSM walking: VO2 (ml/kg/min) = 0.1*S + 1.8*S*G + 3.5
        const vo2 = 0.1 * mPerMin + 1.8 * mPerMin * grade + 3.5;
        const met = vo2 / 3.5;
        // Clamp razonable (caminata lenta → sprint/inclinación extrema)
        return Math.min(18, Math.max(2, met));
    }
    if (act === 'bici') {
        const incline = Number(seg.incline);
        // sin resistencia real; si pusieron "inclinación" como proxy, sube un poco
        const bump = Number.isFinite(incline) && incline > 0 ? Math.min(2, incline * 0.05) : 0;
        return BASE_MET.bici + bump;
    }
    if (act === 'eliptica') return BASE_MET.eliptica;
    return BASE_MET.otro;
}

/**
 * @param {{ activity: string, segments: Array<{durationMin?: number, incline?: number|null, speed?: number|null}>, weightKg?: number|null }} opts
 * @returns {number|null} kcal redondeadas, o null si no hay minutos válidos
 */
export function estimateCardioCalories({ activity, segments, weightKg } = {}) {
    const list = Array.isArray(segments) ? segments : [];
    const w = Number(weightKg);
    const bodyKg = Number.isFinite(w) && w > 0 && w < 400 ? w : DEFAULT_WEIGHT_KG;

    let hoursWeightedMet = 0; // sum(MET * hours)
    let totalMin = 0;
    for (const seg of list) {
        const min = Number(seg?.durationMin);
        if (!Number.isFinite(min) || min <= 0) continue;
        totalMin += min;
        const met = segmentMet(activity, seg);
        hoursWeightedMet += met * (min / 60);
    }
    if (totalMin <= 0) return null;
    return Math.round(hoursWeightedMet * bodyKg);
}

export { DEFAULT_WEIGHT_KG, BASE_MET };
