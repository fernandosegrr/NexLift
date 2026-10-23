import { isRecord } from '../validation/primitives.js';
import { ContractValidationError } from '../validation/results.js';

export class RoutineValidationError extends Error {
    readonly status = 400;
    readonly details: { path: string; message: string }[];
    constructor(path: string, message: string) {
        super(`${path}: ${message}`);
        this.details = [{ path, message }];
    }
}
const INT_MAX = 2147483647;
function fail(path: string, message: string): never { throw new RoutineValidationError(path, message); }
function text(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'debe ser texto no vacío');
    return value.trim();
}
function nullableText(value: unknown, path: string): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') fail(path, 'debe ser texto o null');
    return value;
}
function integer(value: unknown, path: string, min = 0): number {
    const n = typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) ? Number(value.trim()) : value;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > INT_MAX) fail(path, `debe ser un entero entre ${min} y ${INT_MAX}`);
    return n;
}
function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') fail(path, 'debe ser booleano (true/false)');
    return value;
}
function reps(value: unknown, path: string): string {
    if (typeof value === 'number') return String(integer(value, path, 1));
    const s = text(value, path);
    if (/^AMRAP$/i.test(s)) return 'AMRAP';
    const match = s.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);
    if (!match) fail(path, 'usa repeticiones positivas, un rango como 4-6 o AMRAP');
    const low = integer(match[1], path, 1), high = match[2] === undefined ? low : integer(match[2], path, 1);
    if (low > high) fail(path, 'el inicio del rango no puede superar el final');
    return match[2] === undefined ? String(low) : `${low}-${high}`;
}
export const muscleGroups = ['Pecho', 'Espalda', 'Hombros', 'Piernas', 'Bíceps', 'Tríceps', 'Antebrazos', 'Core'] as const;
export type MuscleGroup = typeof muscleGroups[number];
function key(value: string): string { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
const muscles = new Map<string, MuscleGroup>(muscleGroups.map(value => [key(value), value]));
['chest', 'back', 'shoulders', 'legs', 'biceps', 'triceps', 'forearms', 'core'].forEach((value, i) => muscles.set(value, muscleGroups[i]));
muscles.set('core / abdomen', 'Core');
function muscle(value: unknown, path: string): MuscleGroup | null {
    if (value === null || value === '' || value === 'default') return null;
    const normalized = muscles.get(key(text(value, path)));
    if (!normalized) fail(path, 'grupo muscular fuera del catálogo actual');
    return normalized;
}
function alias<T>(input: Record<string, unknown>, canonical: string, legacy: string, normalize: (v: unknown, p: string) => T, fallback: T, path: string): T {
    const hasCanonical = input[canonical] !== undefined, hasLegacy = input[legacy] !== undefined;
    if (!hasCanonical && !hasLegacy) return fallback;
    const a = hasCanonical ? normalize(input[canonical], `${path}.${canonical}`) : fallback;
    const b = hasLegacy ? normalize(input[legacy], `${path}.${legacy}`) : fallback;
    if (hasCanonical && hasLegacy && a !== b) fail(`${path}.${canonical}`, `conflicto entre ${canonical} y ${legacy}`);
    return hasCanonical ? a : b;
}
export interface ImportedExercise {
    name: string; muscleGroup: MuscleGroup | null; targetSets: number; targetReps: string;
    restSeconds: number | null; isUnilateral: boolean; note: string | null; order: number;
}
/** Phase 1.4 normalizer relocated, not a competing normalizer. Unknown input
 * fields are provenance/extensions; only its historical persistence projection
 * leaves this explicit boundary. The input object is never changed. */
export function normalizeImportedExercise(input: unknown, index = 0, path = 'exercise'): ImportedExercise {
    if (!isRecord(input)) fail(path, 'debe ser un objeto');
    return { name: text(input.name, `${path}.name`), muscleGroup: alias(input, 'muscleGroup', 'muscle', muscle, null, path),
        targetSets: alias(input, 'targetSets', 'sets', (v, p) => integer(v, p, 1), 3, path),
        targetReps: alias(input, 'targetReps', 'reps', reps, '8-12', path),
        restSeconds: alias(input, 'restSeconds', 'rest', (v, p) => v === null ? null : integer(v, p), null, path),
        isUnilateral: input.isUnilateral !== undefined ? boolean(input.isUnilateral, `${path}.isUnilateral`) : false,
        note: input.note !== undefined ? nullableText(input.note, `${path}.note`) : null,
        order: input.order !== undefined ? integer(input.order, `${path}.order`) : index };
}
// Raw import preserves aliases/unknown provenance; this is deliberately not a
// claim of semantic validity. The old normalizer owns conflicts and defaults.
export interface RoutineExerciseInput {
    name: string; targetSets?: number | string; sets?: number | string; targetReps?: number | string; reps?: number | string;
    restSeconds?: number | string | null; rest?: number | string | null; muscleGroup?: string | null; muscle?: string | null;
    isUnilateral?: boolean; note?: string | null; order?: number | string;
}
export interface RoutineDayInput {
    dayName?: string; name?: string; weekday?: number | null; isRestDay?: boolean; order?: number | string;
    splitLabel?: string | null; exercises?: RoutineExerciseInput[];
}
export interface RoutineImportInput { name: string; description?: string | null; days: RoutineDayInput[] }
export interface ImportedDay { dayName: string; weekday: number | null; isRestDay: boolean; order: number; exercises: ImportedExercise[] }
export interface RoutineImportResponse { routine: { name: string; description: string | null; days: ImportedDay[] } }
function isImportedExercise(value: unknown): value is ImportedExercise {
    if (!isRecord(value)) return false;
    try {
        const normalized = normalizeImportedExercise(value);
        return Object.entries(normalized).every(([field, expected]) => value[field] === expected);
    } catch (error) { if (error instanceof RoutineValidationError) return false; throw error; }
}
export function isRoutineImportResponse(value: unknown): value is RoutineImportResponse {
    if (!isRecord(value) || !isRecord(value.routine)) return false;
    const routine = value.routine;
    return typeof routine.name === 'string' && (routine.description === null || typeof routine.description === 'string')
        && Array.isArray(routine.days) && routine.days.every(day => isRecord(day) && typeof day.dayName === 'string'
            && (day.weekday === null || typeof day.weekday === 'number' && Number.isInteger(day.weekday) && day.weekday >= 0 && day.weekday <= 6)
            && typeof day.isRestDay === 'boolean' && typeof day.order === 'number' && Number.isInteger(day.order) && day.order >= 0
            && Array.isArray(day.exercises) && day.exercises.every(isImportedExercise));
}
export function readRoutineImportResponse(value: unknown): RoutineImportResponse {
    if (!isRoutineImportResponse(value)) throw new ContractValidationError('INCOMPATIBLE_API_RESPONSE', 'routine', 'Respuesta de importación incompatible; conserva el JSON original.');
    return value;
}
