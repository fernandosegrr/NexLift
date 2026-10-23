import type { RoutineExerciseInput, RoutineDayInput } from '@nexlift/shared';
export interface FormExercise extends RoutineExerciseInput { [field: string]: unknown }
export interface FormDay extends RoutineDayInput { dayName: string; exercises?: FormExercise[]; [field: string]: unknown }
export interface FormRoutine { name: string; description?: string | null; days: FormDay[]; [field: string]: unknown }
export interface TemplateReference extends Omit<RoutineExerciseInput, 'name'> { exerciseId: string; name?: string; [field: string]: unknown }
export interface TemplateDay extends Omit<RoutineDayInput, 'exercises'> { exercises?: TemplateReference[]; [field: string]: unknown }
export interface RoutineTemplate { name: string; description?: string | null; days: TemplateDay[] }
export interface CatalogExercise { id: string; name: string; isUnilateral?: boolean; muscleGroup?: string | null; defaultSets?: number; defaultReps?: string; restSeconds?: number }
export interface TemplatePayloadDay extends Omit<RoutineDayInput,'exercises'> { exercises: FormExercise[]; [field: string]: unknown }
export interface TemplatePayload { name: string; description?: string | null; days: TemplatePayloadDay[] }

// UI construction only. Validation and alias conflict detection belong to the server.
// Numeric inputs stay intact; parseInt/|| would hide invalid input or destroy zero.
export function buildRoutineFormPayload(routine: FormRoutine): FormRoutine {
    return {
        ...routine,
        name: routine.name.trim(),
        days: routine.days.map((day, order) => ({
            ...day, order, dayName: day.dayName.trim(),
            exercises: day.isRestDay ? [] : (day.exercises || []).map((ex, exOrder) => ({
                ...ex, order: exOrder, name: ex.name.trim(),
                // An empty optional form control explicitly clears the rest, rather than inventing seconds.
                ...(ex.restSeconds === '' ? { restSeconds: null } : {})
            }))
        }))
    };
}

export function buildTemplateRoutinePayload(template: RoutineTemplate, catalog: readonly CatalogExercise[]): TemplatePayload {
    return {
        name: template.name, description: template.description,
        days: template.days.map((day, order) => ({
            ...day, order: day.order === undefined ? order : day.order,
            exercises: (day.exercises || []).map((reference, index) => {
                const entry = catalog.find(ex => ex.id === reference.exerciseId);
                if (!entry) throw new Error(`Ejercicio de plantilla desconocido: ${reference.exerciseId}`);
                const { exerciseId: _exerciseId, ...overrides } = reference;
                void _exerciseId;
                const exercise: FormExercise = {
                    name: entry.name,
                    isUnilateral: entry.isUnilateral === undefined ? false : entry.isUnilateral,
                    note: '', order: index, ...overrides
                };
                // Template aliases must reach the backend too, without a synthetic conflicting canonical default.
                if (reference.muscleGroup === undefined && reference.muscle === undefined) exercise.muscleGroup = entry.muscleGroup;
                if (reference.targetSets === undefined && reference.sets === undefined) exercise.targetSets = entry.defaultSets === undefined ? 3 : entry.defaultSets;
                if (reference.targetReps === undefined && reference.reps === undefined) exercise.targetReps = entry.defaultReps === undefined ? '8-12' : entry.defaultReps;
                if (reference.restSeconds === undefined && reference.rest === undefined) exercise.restSeconds = entry.restSeconds === undefined ? 90 : entry.restSeconds;
                return exercise;
            })
        }))
    };
}
