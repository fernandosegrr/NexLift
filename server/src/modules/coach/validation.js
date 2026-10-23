import { COACH_MUSCLES } from '../../generated/coach.cjs';
import { trainingCivilDate } from '../../generated/training.cjs';
export class CoachError extends Error { constructor(message, status = 422) { super(message); this.status = status; this.code = 'COACH_INPUT'; } }
const fail = () => { throw new CoachError('Datos de Coach inválidos. Revisa los campos y escalas.'); };
export function object(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail();
    return value;
}
export function civilDate(value, now = new Date()) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) fail();
    if (value < '2000-01-01' || Date.parse(value + 'T00:00:00Z') > now.getTime() + 86400000) fail();
    return value;
}
export function number(value, min, max, integer = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) fail();
    return value;
}
export const zone = value => { if (!COACH_MUSCLES.includes(value)) fail(); return value; };
export const id = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) fail(); return value; };
export function checkIn(value) {
    const b = object(value, ['sleepHours', 'sleepQuality', 'energy', 'fatigue', 'stress', 'soreness']), result = {};
    for (const key of ['sleepHours', 'sleepQuality', 'energy', 'fatigue', 'stress']) result[key] = b[key] == null ? null : number(b[key], key === 'sleepHours' ? 0 : 1, key === 'sleepHours' ? 24 : 5, key !== 'sleepHours');
    result.soreness = Object.fromEntries(Object.entries(object(b.soreness || {}, COACH_MUSCLES)).map(([key, n]) => [zone(key), number(n, 0, 4, true)]));
    return result;
}
export function exerciseConfig(value) {
    const b = object(value, ['directMuscle', 'secondaryMuscles', 'indirectWeight', 'equipment', 'increment', 'availableLoads']);
    const directMuscle = b.directMuscle == null ? null : zone(b.directMuscle);
    if (!Array.isArray(b.secondaryMuscles) || b.secondaryMuscles.length > 7 || new Set(b.secondaryMuscles).size !== b.secondaryMuscles.length || b.secondaryMuscles.includes(directMuscle)) fail();
    const secondaryMuscles = b.secondaryMuscles.map(zone);
    if (!directMuscle && secondaryMuscles.length) fail();
    if (b.equipment != null && !['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'].includes(b.equipment)) fail();
    if (!Array.isArray(b.availableLoads) || b.availableLoads.length > 100 || new Set(b.availableLoads).size !== b.availableLoads.length) fail();
    return { directMuscle, secondaryMuscles, indirectWeight: number(b.indirectWeight, 0, 1), equipment: b.equipment || null, increment: b.increment == null ? null : number(b.increment, 0.01, 50), availableLoads: b.availableLoads.map(n => number(n, 0.01, 1000)).sort((a, b) => a - b) };
}
export function measurement(value, now) {
    const b = object(value, ['date', 'zone', 'cm', 'quality']);
    if (!['consistent', 'variable', 'unknown'].includes(b.quality)) fail();
    return { date: civilDate(b.date, now), zone: zone(b.zone), cm: number(b.cm, 0.1, 300), quality: b.quality };
}
export function period(value, now = new Date()) { if (value === 'month') return Number(trainingCivilDate(now).slice(-2)); const n = value == null ? 56 : Number(value); if (![28, 56, 90, 180, 365].includes(n)) fail(); return n; }
