/**
 * Historical history/goal estimate, in kg. This is NOT the persisted PR policy.
 * Number coercion and || 0 deliberately preserve legacy JS callers (including
 * null/undefined); inputs are unknown because this boundary already coerces.
 * One rep returns weight; >36 reps are capped at 36; no rounding/tolerance.
 * Finite nonnegative training inputs produce finite results within API limits.
 * NaN becomes 0; infinities and Number conversion exceptions remain historical.
 * An estimate is not a measured maximum or a physiological guarantee.
 */
export function cappedEpley1RM(weight: unknown, reps: unknown): number {
    const w = Number(weight) || 0;
    let r = Number(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    if (r > 36) r = 36;
    return w * (1 + r / 30);
}
