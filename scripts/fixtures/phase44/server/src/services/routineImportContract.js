import { resolveIncomingWeekday, validateRoutineDayWeekdays } from '../logic.js';
import { RoutineValidationError, normalizeImportedExercise } from '../generated/contracts.cjs';
export { RoutineValidationError, normalizeImportedExercise };

// Storage bounds, not training prescriptions. No new 10-set/600-second limits.
const INT_MAX = 2147483647;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const present = (value, key) => value[key] !== undefined;
const fail = (path, message) => { throw new RoutineValidationError(path, message); };
function text(value, path) {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'debe ser texto no vacío');
    return value.trim();
}
function nullableText(value, path) {
    if (value === null) return null;
    if (typeof value !== 'string') fail(path, 'debe ser texto o null');
    return value; // Notes and descriptions are user content, including empty strings.
}
function integer(value, path, min = 0) {
    // Historical form inputs are decimal strings. No parseInt truncation or coercion of null/booleans.
    const n = typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) ? Number(value.trim()) : value;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > INT_MAX) {
        fail(path, `debe ser un entero entre ${min} y ${INT_MAX}`);
    }
    return n;
}
function boolean(value, path) {
    if (typeof value !== 'boolean') fail(path, 'debe ser booleano (true/false)');
    return value;
}
function alias(input, canonical, legacy, normalize, fallback, path) {
    const hasCanonical = present(input, canonical);
    const hasLegacy = present(input, legacy);
    if (!hasCanonical && !hasLegacy) return fallback;
    const a = hasCanonical ? normalize(input[canonical], `${path}.${canonical}`) : undefined;
    const b = hasLegacy ? normalize(input[legacy], `${path}.${legacy}`) : undefined;
    if (hasCanonical && hasLegacy && a !== b) fail(`${path}.${canonical}`, `conflicto entre ${canonical} y ${legacy}`);
    return hasCanonical ? a : b;
}

function unique(values, path, label) {
    const seen = new Set();
    for (const value of values) {
        if (value == null) continue;
        if (seen.has(value)) fail(path, `${label} duplicado: ${value}`);
        seen.add(value);
    }
}
export function normalizeRoutineDays(input, { editing = false } = {}) {
    if (!Array.isArray(input)) fail('days', 'debe ser un array');
    const days = input.map((day, i) => {
        const path = `days[${i}]`;
        if (!object(day)) fail(path, 'debe ser un objeto');
        const dayName = alias(day, 'dayName', 'name', text, undefined, path);
        if (dayName === undefined) fail(`${path}.dayName`, 'es obligatorio');
        const isRestDay = present(day, 'isRestDay') ? boolean(day.isRestDay, `${path}.isRestDay`) : false;
        if (present(day, 'exercises') && !Array.isArray(day.exercises)) fail(`${path}.exercises`, 'debe ser un array');
        const exercises = (day.exercises ?? []).map((ex, j) => {
            const result = normalizeImportedExercise(ex, j, `${path}.exercises[${j}]`);
            if (editing && ex.id != null) {
                // Older editors omit optional fields. Preserve existing values instead of clearing them.
                for (const [canonical, legacy] of [['muscleGroup', 'muscle'], ['restSeconds', 'rest'], ['note', 'note'], ['isUnilateral', 'isUnilateral']]) {
                    if (!present(ex, canonical) && !present(ex, legacy)) delete result[canonical];
                }
            }
            return { ...result, ...(editing && Object.hasOwn(ex, 'id') ? { id: ex.id } : {}) };
        });
        if (isRestDay && exercises.length) fail(`${path}.exercises`, 'un día de descanso no puede contener ejercicios');
        unique(exercises.map(ex => ex.order), `${path}.exercises`, 'order');
        // Import IDs are provenance only. Repeated IDs are ambiguous, repeated names are legitimate.
        if (!editing) unique((day.exercises ?? []).map(ex => ex.id), `${path}.exercises`, 'id');
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
        unique(input.map(day => day.id), 'days', 'id');
        unique(input.flatMap(day => (day.exercises ?? []).map(ex => ex.id)), 'days', 'id de ejercicio');
    }
    const validation = validateRoutineDayWeekdays(days);
    if (validation.error) fail('days.weekday', validation.error);
    return days;
}
export function normalizeRoutineImport(input) {
    if (!object(input)) fail('routine', 'debe ser un objeto');
    return {
        name: text(input.name, 'name'),
        description: present(input, 'description') ? nullableText(input.description, 'description') : null,
        days: normalizeRoutineDays(input.days)
    };
}
