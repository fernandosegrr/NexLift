import { readCollection, readObject, RemoteReadError } from '../app/remote';

type View = Record<string, unknown>;
function requireField(condition: boolean): void {
    if (!condition) throw new RemoteReadError('La respuesta no coincide con esta vista. Los datos locales se conservan.', 'incompatible');
}
function named(value: unknown): View {
    const row = readObject(value);
    requireField(typeof row.id === 'string' && typeof row.name === 'string');
    return row;
}
export function readRoutine(value: unknown): View {
    const routine = named(value);
    for (const day of readCollection(routine.days)) {
        requireField(typeof day.id === 'string' && typeof day.dayName === 'string');
        for (const exercise of readCollection(day.exercises)) named(exercise);
    }
    if (routine.blocks !== undefined) readCollection(routine.blocks).forEach(named);
    if (routine.activeBlock != null) named(routine.activeBlock);
    return routine;
}
export function readRoutines(value: unknown): View[] { return readCollection(value).map(readRoutine); }
function readStats(value: unknown): View {
    const stats = readObject(value);
    for (const field of ['totalWorkouts', 'weeklyVolume', 'currentStreak', 'totalPRs']) {
        if (stats[field] !== undefined) requireField(typeof stats[field] === 'number' && Number.isFinite(stats[field]));
    }
    return stats;
}
function readBundle(value: unknown): View {
    const bundle = readObject(value);
    readStats(bundle.stats);
    readCollection(bundle.prs);
    if (bundle.consistencyCounts !== undefined) {
        for (const count of Object.values(readObject(bundle.consistencyCounts))) requireField(typeof count === 'number' && Number.isFinite(count));
    } else {
        requireField(Array.isArray(bundle.consistencyDays) && bundle.consistencyDays.every(day => typeof day === 'string'));
    }
    return bundle;
}
export function readHome(value: unknown): View {
    const home = readBundle(value);
    if (home.activeRoutine != null) readRoutine(home.activeRoutine);
    return home;
}
export function readProgress(value: unknown): View {
    const progress = readBundle(value);
    for (const exercise of readCollection(progress.exercises)) requireField(typeof exercise.name === 'string');
    requireField(Array.isArray(progress.plateaued) && progress.plateaued.every(name => typeof name === 'string'));
    return progress;
}
export function readDatedCollection(value: unknown): View[] {
    const rows = readCollection(value);
    for (const row of rows) requireField(typeof row.date === 'string' && Number.isFinite(Date.parse(row.date)));
    return rows;
}
export function readConfirmedHistory(value: unknown): View[] {
    const rows = readDatedCollection(value);
    for (const row of rows) {
        requireField(typeof row.id === 'string');
        for (const set of readCollection(row.sets)) requireField(typeof set.weight === 'number' && Number.isFinite(set.weight) && typeof set.reps === 'number' && Number.isFinite(set.reps));
    }
    return rows;
}
export function readGoals(value: unknown): View[] {
    const rows = readCollection(value);
    for (const goal of rows) requireField(typeof goal.id === 'string' && typeof goal.exerciseName === 'string');
    return rows;
}
