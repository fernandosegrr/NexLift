/** Declared repetitions in reserve, not measured fatigue. No range is inferred
 * from a property called rpe. Validation belongs to the named boundary below. */
export interface UserRir { readonly kind: 'user-rir'; readonly value: number }
/** Historical SetLog.rpe convention: 10 - RIR, including old 0..10 values. */
export interface StoredRpe { readonly kind: 'stored-rpe'; readonly value: number }
export interface InferredRir { readonly kind: 'inferred-rir'; readonly value: number }
export function rirToStoredRpe(rir: UserRir): StoredRpe {
    return { kind: 'stored-rpe', value: 10 - rir.value };
}
export function storedRpeToRir(rpe: StoredRpe): InferredRir {
    return { kind: 'inferred-rir', value: 10 - rpe.value };
}
/** Nullable form adapters preserve absence and the existing arithmetic exactly.
 * They do not clamp imported historical values to today's UI buttons. */
export function formRirToStoredRpe(rir: number | null | undefined): number | null {
    return rir == null ? null : rirToStoredRpe({ kind: 'user-rir', value: rir }).value;
}
export function storedRpeToFormRir(rpe: number | null | undefined): number | null {
    return rpe == null ? null : storedRpeToRir({ kind: 'stored-rpe', value: rpe }).value;
}
// parseFloat performs ToString with the string hint. String(Symbol) has a
// special exemption that parseFloat does not: preserve that TypeError too.
function shortcutFloat(value: unknown): number {
    if (typeof value === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
    return parseFloat(String(value));
}
/** Unbounded historical helper; NOT the Shortcut request validator. */
export function convertLegacyShortcutRir(rawRir: unknown): number | null {
    return rawRir != null && Number.isFinite(shortcutFloat(rawRir)) ? 10 - shortcutFloat(rawRir) : null;
}
export interface EffortFields { readonly rir?: unknown; readonly rpe?: unknown }
export type LegacyShortcutEffort = { readonly state: 'invalid'; readonly error: string } | {
    readonly state: 'interpreted'; readonly context: 'legacy-shortcut';
    readonly interpretation: 'explicit-rir' | 'legacy-rpe-as-rir' | 'stored-rpe' | 'missing-default';
    readonly rawRir: number; readonly storedRpe: number;
};
/** Exact legacy log-set policy: permissive parseFloat, rir priority, gap (4,6)
 * rejected, missing => RIR0/RPE10. No modern API or backup may use this parser. */
export function parseLegacyShortcutEffort(body: EffortFields): LegacyShortcutEffort {
    const invalid: LegacyShortcutEffort = { state: 'invalid', error: 'RIR inválido (usa 0-4, reps en recámara)' };
    const hasRir = body.rir != null && String(body.rir).trim() !== '';
    const hasRpe = body.rpe != null && String(body.rpe).trim() !== '';
    if (hasRir) {
        const rawRir = shortcutFloat(body.rir);
        if (!Number.isFinite(rawRir) || rawRir < 0 || rawRir > 4) return invalid;
        return { state: 'interpreted', context: 'legacy-shortcut', interpretation: 'explicit-rir', rawRir, storedRpe: 10 - rawRir };
    }
    if (hasRpe) {
        const parsed = shortcutFloat(body.rpe);
        if (!Number.isFinite(parsed)) return invalid;
        if (parsed >= 0 && parsed <= 4) return { state: 'interpreted', context: 'legacy-shortcut', interpretation: 'legacy-rpe-as-rir', rawRir: parsed, storedRpe: 10 - parsed };
        if (parsed >= 6 && parsed <= 10) return { state: 'interpreted', context: 'legacy-shortcut', interpretation: 'stored-rpe', rawRir: 10 - parsed, storedRpe: parsed };
        return invalid;
    }
    return { state: 'interpreted', context: 'legacy-shortcut', interpretation: 'missing-default', rawRir: 0, storedRpe: 10 };
}
export type CanonicalWorkoutEffort = {
    readonly state: 'invalid'; readonly field: 'rpe' | 'rir'; readonly message: string;
} | {
    readonly state: 'interpreted' | 'missing'; readonly context: 'canonical-workout';
    readonly storedRpe: number | null | undefined;
};
/** v1 request representation, NOT full SetLog validation. The existing sanitizer
 * still enforces stored range 0..10 and mandatory effort for positive work.
 * No source parameter: source=shortcut cannot activate legacy interpretation. */
export function parseCanonicalWorkoutEffort(set: EffortFields): CanonicalWorkoutEffort {
    for (const field of ['rpe', 'rir'] as const) {
        const value = set[field];
        if (value === undefined || (field === 'rpe' && value === null)) continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return { state: 'invalid', field, message: `Invalid ${field}` };
    }
    if (set.rir !== undefined) {
        const rir = set.rir;
        if (typeof rir !== 'number' || rir < 0 || rir > 4) return { state: 'invalid', field: 'rir', message: 'rir must be an integer from 0 to 4' };
        if (set.rpe !== undefined && set.rpe !== 10 - rir) return { state: 'invalid', field: 'rpe', message: 'rir and rpe conflict' };
        return { state: 'interpreted', context: 'canonical-workout', storedRpe: 10 - rir };
    }
    // Narrow unknown independently; the loop above preserves error precedence.
    if (typeof set.rpe === 'number') return { state: 'interpreted', context: 'canonical-workout', storedRpe: set.rpe };
    return { state: 'missing', context: 'canonical-workout', storedRpe: set.rpe === null ? null : undefined };
}
