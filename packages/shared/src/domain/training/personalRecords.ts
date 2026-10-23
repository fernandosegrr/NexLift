/** A coerced historical PR candidate. Loads/est1RM are kg; reps are counts.
 * DateValue is opaque: no clock, parsing, sorting or timezone conversion. */
export interface HistoricalPrSet {
    readonly weight: unknown; readonly reps: unknown;
    readonly weightRight?: unknown; readonly repsRight?: unknown;
    readonly completed?: unknown;
}
export interface HistoricalPrSession<DateValue> { readonly date: DateValue; readonly sets: readonly HistoricalPrSet[] }
export interface PersonalRecordPerformance<DateValue> {
    readonly weight: number; readonly reps: number; readonly est1RM: number; readonly date: DateValue;
}
/** Persisted PR policy, not capped history/Smart Loading or PDF policy.
 * Caller has coerced positive work. 1<reps<37 extrapolates; all other reps
 * return load. No rounding or epsilon. Decimal legacy reps remain compatible. */
export function personalRecordEpley1RM(weightKg: number, repetitions: number): number {
    return (repetitions > 1 && repetitions < 37) ? weightKg * (1 + repetitions / 30) : weightKg;
}
/** Iterate exactly in caller order, left before right, strict > retains first
 * binary tie. Right nullish fields inherit left; zero remains zero. completed
 * is deliberately not a filter. Caller alone selects authorized history and
 * persists the result inside its SQL transaction. O(sets), O(1) extra state. */
export function selectHistoricalPersonalRecord<DateValue>(logs: readonly HistoricalPrSession<DateValue>[]): PersonalRecordPerformance<DateValue> | null {
    let best: PersonalRecordPerformance<DateValue> | null = null;
    for (const log of logs) {
        for (const s of log.sets) {
            const candidates = [{ w: s.weight, r: s.reps }];
            if (s.weightRight != null || s.repsRight != null) {
                candidates.push({ w: s.weightRight ?? s.weight, r: s.repsRight ?? s.reps });
            }
            for (const c of candidates) {
                const w = Number(c.w) || 0;
                const r = Number(c.r) || 0;
                if (w <= 0 || r <= 0) continue;
                const est = personalRecordEpley1RM(w, r);
                if (!best || est > best.est1RM) best = { weight: w, reps: r, est1RM: est, date: log.date };
            }
        }
    }
    return best;
}
