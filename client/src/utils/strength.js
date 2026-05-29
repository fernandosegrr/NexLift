import { matchStandard, STRENGTH_LEVELS } from '../data/strengthStandards';

// 1RM estimado (Epley)
export function epley1RM(weight, reps) {
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    return r === 1 ? w : Math.round(w * (1 + r / 30) * 10) / 10;
}

// Clasifica un levantamiento contra los estándares por peso corporal.
// Devuelve null si no hay estándar para ese ejercicio o falta el peso corporal.
export function classifyLift(name, oneRM, bodyweight) {
    const std = matchStandard(name);
    if (!std || !bodyweight || bodyweight <= 0 || !oneRM || oneRM <= 0) return null;

    const ratio = oneRM / bodyweight;
    const ratios = std.ratios;

    // Índice del nivel alcanzado (-1 = aún por debajo del primer umbral)
    let idx = -1;
    for (let i = 0; i < ratios.length; i++) {
        if (ratio >= ratios[i]) idx = i;
    }

    const isMax = idx + 1 >= ratios.length;
    const levelName = idx >= 0 ? STRENGTH_LEVELS[idx] : `Camino a ${STRENGTH_LEVELS[0]}`;
    const nextLevel = !isMax ? STRENGTH_LEVELS[idx + 1] : null;

    // Progreso hacia el siguiente nivel
    const lower = idx >= 0 ? ratios[idx] : 0;
    const upper = !isMax ? ratios[idx + 1] : ratios[ratios.length - 1];
    const pct = isMax ? 100 : Math.max(0, Math.min(100, Math.round(((ratio - lower) / (upper - lower)) * 100)));

    return {
        key: std.key,
        ratio: Math.round(ratio * 100) / 100,
        levelIndex: idx,
        levelName,
        nextLevel,
        nextRatio: nextLevel ? upper : null,
        pct,
        isMax,
    };
}
