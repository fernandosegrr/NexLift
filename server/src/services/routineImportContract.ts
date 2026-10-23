import type { ImportedExercise } from '@nexlift/shared';
import { resolveIncomingWeekday, validateRoutineDayWeekdays } from '../logic.js';
import { RoutineValidationError, normalizeImportedExercise } from '@nexlift/shared';
export { RoutineValidationError, normalizeImportedExercise };

export interface NormalizedExercise extends Partial<ImportedExercise> { name: string; order: number; targetSets: number; targetReps: string; id?: unknown }
export interface NormalizedDay { dayName: string; isRestDay: boolean; exercises?: NormalizedExercise[]; weekday: number | null | undefined; splitLabel: string | null | undefined; order: number; id?: unknown }
export interface NormalizedRoutine { name: string; description: string | null; days: NormalizedDay[] }

// Storage bounds, not training prescriptions. No new 10-set/600-second limits.
const INT_MAX = 2147483647;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const present = (value: Record<string, unknown>, key: string): boolean => value[key] !== undefined;
function fail(path: string, message: string): never { throw new RoutineValidationError(path, message); }
function text(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'debe ser texto no vacío');
    return value.trim();
}
function nullableText(value: unknown, path: string): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') fail(path, 'debe ser texto o null');
    return value; // Notes and descriptions are user content, including empty strings.
}
function integer(value: unknown, path: string, min = 0): number {
    // Historical form inputs are decimal strings. No parseInt truncation or coercion of null/booleans.
    const n = typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) ? Number(value.trim()) : value;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > INT_MAX) {
        fail(path, `debe ser un entero entre ${min} y ${INT_MAX}`);
    }
    return n;
}
function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') fail(path, 'debe ser booleano (true/false)');
    return value;
}
function alias<T>(input: Record<string, unknown>, canonical: string, legacy: string, normalize: (v: unknown, p: string) => T, fallback: T | undefined, path: string): T | undefined {
    const hasCanonical = present(input, canonical);
    const hasLegacy = present(input, legacy);
    if (!hasCanonical && !hasLegacy) return fallback;
    const a = hasCanonical ? normalize(input[canonical], `${path}.${canonical}`) : undefined;
    const b = hasLegacy ? normalize(input[legacy], `${path}.${legacy}`) : undefined;
    if (hasCanonical && hasLegacy && a !== b) fail(`${path}.${canonical}`, `conflicto entre ${canonical} y ${legacy}`);
    return hasCanonical ? a : b;
}

function unique(values: unknown[], path: string, label: string): void {
    const seen = new Set();
    for (const value of values) {
        if (value == null) continue;
        if (seen.has(value)) fail(path, `${label} duplicado: ${value}`);
        seen.add(value);
    }
}
export function normalizeRoutineDays(input: unknown, { editing = false }: { editing?: boolean } = {}): NormalizedDay[] {
    if (!Array.isArray(input)) fail('days', 'debe ser un array');
    const days = input.map((day: unknown, i: number) => {
        const path = `days[${i}]`;
        if (!object(day)) fail(path, 'debe ser un objeto');
        const dayName = alias(day, 'dayName', 'name', text, undefined, path);
        if (dayName === undefined) fail(`${path}.dayName`, 'es obligatorio');
        const isRestDay = present(day, 'isRestDay') ? boolean(day.isRestDay, `${path}.isRestDay`) : false;
        if (present(day, 'exercises') && !Array.isArray(day.exercises)) fail(`${path}.exercises`, 'debe ser un array');
        const rawExercises = Array.isArray(day.exercises) ? day.exercises : [];
        const exercises = rawExercises.map((ex: unknown, j: number) => {
            // The shared normalizer validates the object before property access.
            const normalized = normalizeImportedExercise(ex, j, `${path}.exercises[${j}]`);
            if (!object(ex)) fail(`${path}.exercises[${j}]`, 'debe ser un objeto');
            const result: Partial<ImportedExercise> & Pick<ImportedExercise, 'name' | 'order' | 'targetSets' | 'targetReps'> = normalized;
            if (editing && ex.id != null) {
                // Older editors omit optional fields. Preserve existing values instead of clearing them.
                for (const [canonical, legacy] of [['muscleGroup', 'muscle'], ['restSeconds', 'rest'], ['note', 'note'], ['isUnilateral', 'isUnilateral']] as const) {
                    if (!present(ex, canonical) && !present(ex, legacy)) delete result[canonical];
                }
            }
            return { ...result, ...(editing && Object.hasOwn(ex, 'id') ? { id: ex.id } : {}) };
        });
        if (isRestDay && exercises.length) fail(`${path}.exercises`, 'un día de descanso no puede contener ejercicios');
        unique(exercises.map(ex => ex.order), `${path}.exercises`, 'order');
        // Import IDs are provenance only. Repeated IDs are ambiguous, repeated names are legitimate.
        if (!editing) unique(rawExercises.map((ex: unknown) => object(ex) ? ex.id : undefined), `${path}.exercises`, 'id');
        return {
            dayName, isRestDay,
            // PUT historically distinguishes an omitted collection (leave it alone) from [] (remove/archive).
            ...(!editing || present(day, 'exercises') ? { exercises } : {}),
            weekday: resolveIncomingWeekday({ ...day, dayName }),
            splitLabel: present(day, 'splitLabel') ? nullableText(day.splitLabel, `${path}.splitLabel`) : editing ? undefined : null,
            order: present(day, 'order') ? integer(day.order, `${path}.order`) : i,
            ...(editing && Object.hasOwn(day, 'id') ? { id: day.id } : {})
        };
    });
    unique(days.map(day => day.order), 'days', 'order');
    if (!editing) {
        unique(input.map((day: unknown) => object(day) ? day.id : undefined), 'days', 'id');
        unique(input.flatMap((day: unknown) => object(day) && Array.isArray(day.exercises) ? day.exercises.map((ex: unknown) => object(ex) ? ex.id : undefined) : []), 'days', 'id de ejercicio');
    }
    const validation = validateRoutineDayWeekdays(days);
    if (validation.error) fail('days.weekday', validation.error);
    return days;
}
export function normalizeRoutineImport(input: unknown): NormalizedRoutine {
    if (!object(input)) fail('routine', 'debe ser un objeto');
    return {
        name: text(input.name, 'name'),
        description: present(input, 'description') ? nullableText(input.description, 'description') : null,
        days: normalizeRoutineDays(input.days)
    };
}
