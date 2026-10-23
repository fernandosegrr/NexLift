/** kg x repetitions, not a measure of hypertrophy or effective muscle stimulus.
 * Distinct, named legacy policies. completed is caller-selected, never inferred. */
export interface LoadSet { readonly weight?: unknown; readonly reps?: unknown; readonly weightRight?: unknown; readonly repsRight?: unknown; readonly completed?: boolean }
export type LoadVolumePolicy = 'recorded-sides' | 'left-only' | 'inherit-missing-right' | 'legacy-pdf-zero-fallback';
function addTrainingLoad(total: number, s: LoadSet, policy: LoadVolumePolicy): number {
    const pdf = policy === 'legacy-pdf-zero-fallback';
    const w = pdf ? Number(s.weight) || 0 : Number(s.weight || 0);
    const r = pdf ? Number(s.reps) || 0 : Number(s.reps || 0);
    total += w * r;
    if (policy === 'recorded-sides') {
        total += Number(s.weightRight || 0) * Number(s.repsRight || 0);
    } else if (policy !== 'left-only' && (s.weightRight != null || s.repsRight != null)) {
        total += pdf ? (Number(s.weightRight) || w) * (Number(s.repsRight) || r)
            : Number(s.weightRight ?? s.weight ?? 0) * Number(s.repsRight ?? s.reps ?? 0);
    }
    return total;
}
export function trainingLoadVolume(sets: readonly LoadSet[], policy: LoadVolumePolicy): number {
    let total = 0;
    for (const s of sets) total = addTrainingLoad(total, s, policy);
    return total;
}
export interface LoadSession { readonly sets?: readonly LoadSet[] | null }
export function trainingSessionLoadSummary(sessions: readonly LoadSession[]): { readonly volume: number; readonly sets: number } {
    // Keep sequential addition across sessions (do not sum per-session subtotals).
    let total = 0, sets = 0;
    for (const session of sessions) for (const s of session.sets || []) {
        total = addTrainingLoad(total, s, 'inherit-missing-right');
        sets++;
    }
    return { volume: total, sets };
}
