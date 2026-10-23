import { Prisma, PrismaClient as BasePrismaClient } from '@prisma/client';

// This is a generated-client capability, never an environment switch. The old
// client remains usable for the explicit pre-migration compatibility rehearsal.
export const hasHistoryPersistence = Prisma.dmmf.datamodel.models
    .find(model => model.name === 'WorkoutLog').fields.some(field => field.name === 'exerciseNameSnapshot');
const wrapped = new WeakMap();
const snapshotFields = ['exerciseNameSnapshot', 'muscleGroupSnapshot', 'isUnilateralSnapshot', 'snapshotSource'];

// Translate only legacy history predicates, not the planning/catalog queries.
// Logical operators are traversed so authorization is never dropped in OR/NOT.
export function historyWhere(input) {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map(historyWhere);
    const where = { ...input };
    for (const key of ['AND', 'OR', 'NOT']) if (where[key]) where[key] = historyWhere(where[key]);
    const exercise = where.exercise;
    if (exercise && !exercise.is && !exercise.isNot) {
        const rest = { ...exercise }, predicates = [];
        const routine = rest.routineDay?.routine;
        if (routine && Object.keys(routine).length === 1 && Object.hasOwn(routine, 'userId')
            && Object.keys(rest.routineDay).length === 1) {
            predicates.push({ userId: routine.userId }); delete rest.routineDay;
        }
        if (Object.hasOwn(rest, 'name')) { predicates.push({ exerciseNameSnapshot: rest.name }); delete rest.name; }
        if (Object.hasOwn(rest, 'muscleGroup')) { predicates.push({ muscleGroupSnapshot: rest.muscleGroup }); delete rest.muscleGroup; }
        delete where.exercise;
        if (Object.keys(rest).length) where.exercise = rest;
        if (predicates.length) where.AND = [...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []), ...predicates];
    }
    return where;
}

function exerciseWhere(input) {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map(exerciseWhere);
    const where = { ...input };
    for (const key of ['AND', 'OR', 'NOT']) if (where[key]) where[key] = exerciseWhere(where[key]);
    if (where.routineDay && Object.keys(where.routineDay).length === 1
        && where.routineDay.routine && Object.keys(where.routineDay.routine).length === 1
        && Object.hasOwn(where.routineDay.routine, 'userId')) {
        where.AND = [...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []), { userId: where.routineDay.routine.userId }];
        delete where.routineDay;
    }
    return where;
}
function setWhere(input) {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map(setWhere);
    const where = { ...input };
    for (const key of ['AND', 'OR', 'NOT']) if (where[key]) where[key] = setWhere(where[key]);
    if (where.workoutLog) where.workoutLog = historyWhere(where.workoutLog);
    return where;
}

function project(log, requested) {
    if (!log || typeof log !== 'object') return log;
    if (log.exercise && log.exerciseNameSnapshot != null) {
        const exercise = { ...log.exercise };
        const selected = requested?.select;
        if (!selected || selected.name) exercise.name = log.exerciseNameSnapshot;
        if (!selected || selected.muscleGroup) exercise.muscleGroup = log.muscleGroupSnapshot;
        if (!selected || selected.isUnilateral) exercise.isUnilateral = log.isUnilateralSnapshot
            ?? (Array.isArray(log.sets) ? log.sets.some(set => set.weightRight != null || set.repsRight != null) : null);
        log = { ...log, exercise };
    }
    return log;
}

// A single query extension adapts the existing HTTP readers and writers, also
// inside interactive transactions. No extra query, data cache, or N+1 lookup.
export function historyClient(prisma) {
    if (!hasHistoryPersistence || !prisma.$extends) return prisma;
    if (prisma.$nexliftHistory?.()) return prisma;
    if (wrapped.has(prisma)) return wrapped.get(prisma);
    const client = prisma.$extends({ name: 'nexlift-history', client: { $nexliftHistory: () => true }, query: {
        exercise: { async $allOperations({ args, query }) {
            if (args.where) args.where = exerciseWhere(args.where);
            return query(args);
        } },
        workoutLog: { async $allOperations({ args, query }) {
            if (args.where) args.where = historyWhere(args.where);
            const requested = args.select?.exercise || args.include?.exercise;
            const injected = [];
            if (requested && args.select) {
                args.select = { ...args.select };
                for (const field of snapshotFields) {
                    if (!args.select[field]) { args.select[field] = true; injected.push(field); }
                }
            }
            const result = await query(args);
            const adapt = row => {
                let out = project(row, requested);
                if (injected.length && out) { out = { ...out }; for (const field of injected) delete out[field]; }
                return out;
            };
            return Array.isArray(result) ? result.map(adapt) : adapt(result);
        } },
        setLog: { async $allOperations({ args, query }) {
            if (args.where) args.where = setWhere(args.where);
            return query(args);
        } }
    } });
    wrapped.set(prisma, client); wrapped.set(client, client);
    return client;
}

export async function hasRetainedExerciseData(tx, exerciseId) {
    if (!hasHistoryPersistence) return !!await tx.workoutLog.count({ where: { exerciseId } });
    const [row] = await tx.$queryRaw`SELECT
        EXISTS(SELECT 1 FROM public."WorkoutLog" WHERE "exerciseId"=${exerciseId})
        OR EXISTS(SELECT 1 FROM public."SuggestionLog" WHERE "exerciseId"=${exerciseId})
        OR EXISTS(SELECT 1 FROM public."PersonalRecord" WHERE "sourceExerciseId"=${exerciseId}) AS retained`;
    return row.retained;
}

export class PrismaClient extends BasePrismaClient {
    constructor(...args) { super(...args); return historyClient(this); }
}
