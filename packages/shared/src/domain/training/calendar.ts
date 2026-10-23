/** Civil CDMX readings are distinct from elapsed durations and UTC instants.
 * No clock here: adapters supply now. Legacy bounds remain the write policy. */
export const TRAINING_TIMEZONE = 'America/Mexico_City';
export type TrainingInstant = Date | string | number;
export type TrainingCalendarPolicy = 'cdmx-civil' | 'legacy-device-day';
export interface TrainingDayBounds { readonly start: Date; readonly end: Date; readonly dateStr: string }
const civilFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TRAINING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TRAINING_TIMEZONE, timeZoneName: 'shortOffset' });
export function trainingCivilDate(instant: TrainingInstant): string {
    return civilFormatter.format(instant instanceof Date ? instant : new Date(instant));
}
export function trainingUtcOffsetMinutes(instant: Date): number {
    const part = offsetFormatter.formatToParts(instant).find(p => p.type === 'timeZoneName')?.value || 'GMT-6';
    const match = part.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) return -360;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (parseInt(match[2], 10) * 60 + (match[3] ? parseInt(match[3], 10) : 0));
}
export function civilDayOfWeek(dateStr: string): number {
    return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}
export function shiftTrainingCivilDate(dateStr: string, days: number): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isInteger(days)) throw new RangeError('Invalid civil date/day count');
    const anchor = new Date(`${dateStr}T12:00:00Z`);
    if (!Number.isFinite(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== dateStr) throw new RangeError('Invalid civil date');
    anchor.setUTCDate(anchor.getUTCDate() + days);
    return anchor.toISOString().slice(0, 10);
}
export function lastTrainingCivilDays(n: number, instant: TrainingInstant): string[] {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('Invalid civil day count');
    const today = trainingCivilDate(instant), days: string[] = [];
    for (let i = n - 1; i >= 0; i--) days.push(shiftTrainingCivilDate(today, -i));
    return days;
}
/** Historical query/write compatibility. May be wrong on a 23/25-hour day.
 * Deliberately named, never silently substituted in operations or hashes. */
export function legacyTrainingDayBounds(instant: Date): TrainingDayBounds {
    const dateStr = trainingCivilDate(instant), offsetMin = trainingUtcOffsetMinutes(instant);
    const sign = offsetMin <= 0 ? '-' : '+', abs = Math.abs(offsetMin);
    const offsetStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    const start = new Date(`${dateStr}T00:00:00${offsetStr}`);
    return { start, end: new Date(start.getTime() + 86400000), dateStr };
}
function civilMidnight(dateStr: string): Date {
    const utc = new Date(`${dateStr}T00:00:00Z`).getTime();
    let candidate = utc;
    // CDMX transitions occurred after midnight. Resolve offset at midnight itself,
    // independently for both dates; never add 24h to a local midnight.
    for (let i = 0; i < 4; i++) {
        const next = utc - trainingUtcOffsetMinutes(new Date(candidate)) * 60000;
        if (next === candidate) return new Date(next);
        candidate = next;
    }
    throw new RangeError('CDMX midnight did not resolve');
}
export function trainingCivilDayBounds(instant: TrainingInstant): TrainingDayBounds {
    const dateStr = trainingCivilDate(instant);
    return { start: civilMidnight(dateStr), end: civilMidnight(shiftTrainingCivilDate(dateStr, 1)), dateStr };
}
/** Monday..Sunday bounds, including Sundays and year/month crossings. */
export function trainingCivilWeek(instant: TrainingInstant): { readonly startDay: string; readonly endDayExclusive: string } {
    const dateStr = trainingCivilDate(instant), weekday = civilDayOfWeek(dateStr);
    const startDay = shiftTrainingCivilDate(dateStr, -((weekday + 6) % 7));
    return { startDay, endDayExclusive: shiftTrainingCivilDate(startDay, 7) };
}
