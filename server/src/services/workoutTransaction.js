import { setTimeout as delay } from 'node:timers/promises';
import { historyClient, hasHistoryPersistence } from './historyPersistence.js';

export class WorkoutRequestError extends Error {
    constructor(status, message, code, outcome, cause) {
        super(message, cause ? { cause } : undefined);
        this.status = status;
        this.code = code;
        this.outcome = outcome;
    }
}

function sqlState(error) {
    // Prisma raw-query failures expose PostgreSQL SQLSTATE in meta.code.
    return error?.meta?.code || error?.cause?.code;
}
const abortedConflict = error => error?.code === 'P2034' || ['40001', '40P01'].includes(sqlState(error));
const lockConflict = error => sqlState(error) === '55P03';
const knownRollback = error => (/^[0-9A-Z]{5}$/.test(sqlState(error) || '') && !sqlState(error).startsWith('08'))
    || ['P2002', 'P2003', 'P2004', 'P2011', 'P2014', 'P2025'].includes(error?.code);

// Serializable also coordinates with the existing Serializable routine editor
// and restore service. A waiter can hold an older snapshot: PostgreSQL aborts
// conflicting writes, and only that explicitly aborted body is retried below.
// The account lock serializes workout writers across exercise IDs/names and
// protects an absent daily session or PR without requiring a new unique index.
export async function withWorkoutTransaction(prisma, userId, operation, { maxAttempts = 3, retryReceiptConflict = false } = {}) {
    prisma = historyClient(prisma);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let bodyFinished = false;
        try {
            return await prisma.$transaction(async tx => {
                await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
                const users = await tx.$queryRaw`
                    SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE
                `;
                if (users.length !== 1) throw new WorkoutRequestError(404, 'User not found');
                const result = await operation(tx);
                bodyFinished = true;
                return result;
            }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
        } catch (error) {
            // Only the SQL receipt PK can race after an old Serializable
            // snapshot. It is safe to reread that exact durable receipt after
            // PostgreSQL has explicitly rolled back this transaction.
            const receiptConflict = retryReceiptConflict && sqlState(error) === '23505'
                && error?.meta?.message?.includes('IdempotencyRecord_pkey');
            if (abortedConflict(error) || receiptConflict) {
                // PostgreSQL explicitly aborted: replaying this DB-only callback
                // cannot duplicate a committed workout. Three total attempts.
                if (attempt < maxAttempts) { await delay(attempt * 10); continue; }
                throw new WorkoutRequestError(409, 'Concurrent workout change; review and try again.',
                    'WORKOUT_CONFLICT', 'not_committed', error);
            }
            if (lockConflict(error)) {
                throw new WorkoutRequestError(409, 'Workout is being modified; review and try again.',
                    'WORKOUT_CONFLICT', 'not_committed', error);
            }
            if (bodyFinished && !knownRollback(error)) {
                // The callback completed, but confirmation of COMMIT failed.
                // Conservatively require reconciliation instead of replaying it.
                throw new WorkoutRequestError(409, 'Could not confirm the workout result. Review history before retrying.',
                    'WORKOUT_OUTCOME_UNKNOWN', 'unknown', error);
            }
            throw error;
        }
    }
}

// Stabilize the complete ownership chain against concurrent routine edits,
// deletion and reparenting, then read metadata with the same transaction client.
export async function lockOwnedExercise(tx, exerciseId, userId, { includeDay = false } = {}) {
    if (hasHistoryPersistence) {
        const rows = await tx.$queryRaw`SELECT id FROM "Exercise" WHERE id=${exerciseId} AND "userId"=${userId} FOR SHARE`;
        if (rows.length !== 1) throw new WorkoutRequestError(404, 'Exercise not found or unauthorized');
        return tx.exercise.findFirst({ where: { id: exerciseId, userId },
            ...(includeDay ? { include: { routineDay: { include: { exercises: { orderBy: { order: 'asc' } } } } } } : {}) });
    }
    const rows = await tx.$queryRaw`
        SELECT e.id FROM "Exercise" e
        JOIN "RoutineDay" d ON d.id = e."routineDayId"
        JOIN "Routine" r ON r.id = d."routineId"
        WHERE e.id = ${exerciseId} AND r."userId" = ${userId}
        FOR SHARE OF r, d, e
    `;
    if (rows.length !== 1) throw new WorkoutRequestError(404, 'Exercise not found or unauthorized');
    return tx.exercise.findFirst({
        where: { id: exerciseId, routineDay: { routine: { userId } } },
        ...(includeDay ? { include: { routineDay: { include: { exercises: { orderBy: { order: 'asc' } } } } } } : {})
    });
}

export async function lockOwnedWorkout(tx, logId, userId) {
    if (hasHistoryPersistence) {
        const locked = await tx.$queryRaw`SELECT id FROM "WorkoutLog" WHERE id=${logId} AND "userId"=${userId} FOR UPDATE`;
        if (locked.length !== 1) throw new WorkoutRequestError(404, 'Workout log not found or unauthorized');
        return tx.workoutLog.findFirst({ where: { id: logId, userId }, include: { exercise: true } });
    }
    const log = await tx.workoutLog.findFirst({
        where: { id: logId, exercise: { routineDay: { routine: { userId } } } }
    });
    if (!log) throw new WorkoutRequestError(404, 'Workout log not found or unauthorized');
    await lockOwnedExercise(tx, log.exerciseId, userId);
    const locked = await tx.$queryRaw`
        SELECT id FROM "WorkoutLog" WHERE id = ${logId} AND "exerciseId" = ${log.exerciseId} FOR UPDATE
    `;
    if (locked.length !== 1) throw new WorkoutRequestError(404, 'Workout log not found or unauthorized');
    return tx.workoutLog.findFirst({
        where: { id: logId, exercise: { routineDay: { routine: { userId } } } },
        include: { exercise: true }
    });
}

// Indirect deleters must lock BEFORE counting history: a later cascading delete
// must not erase a workout that committed after an earlier empty count.
export async function lockRoutineWorkoutGraph(tx, routineId, userId) {
    const owned = await tx.$queryRaw`
        SELECT id FROM "Routine" WHERE id = ${routineId} AND "userId" = ${userId} FOR UPDATE
    `;
    if (owned.length !== 1) throw new WorkoutRequestError(404, 'Routine not found');
    await tx.$queryRaw`SELECT id FROM "RoutineDay" WHERE "routineId" = ${routineId} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`
        SELECT e.id FROM "Exercise" e JOIN "RoutineDay" d ON d.id = e."routineDayId"
        WHERE d."routineId" = ${routineId} ORDER BY e.id FOR UPDATE OF e
    `;
}
