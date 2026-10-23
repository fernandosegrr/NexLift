import { selectHistoricalPersonalRecord } from '../generated/training.cjs';
import { hasHistoryPersistence } from './historyPersistence.js';

// Derived records use the caller's transaction. Never open a nested transaction
// or fall back to the process-wide Prisma client here.
export async function recalcPRForExercise(client, exerciseName, userId) {
    if (!exerciseName) return null;
    const nameLower = exerciseName.toLowerCase();
    const logs = await client.workoutLog.findMany({
        where: { exercise: {
            name: { equals: exerciseName, mode: 'insensitive' },
            routineDay: { routine: { userId } }
        } },
        include: { sets: true },
        // Existing rule: strict > means the oldest session wins an exact tie.
        orderBy: { date: 'asc' }
    });

    const best = selectHistoricalPersonalRecord(logs);

    // Same identity as the history query, including mixed-case historical rows.
    await client.personalRecord.deleteMany({ where: {
        userId, exerciseName: { equals: exerciseName, mode: 'insensitive' }
    } });
    if (!best) return null;
    const winner = hasHistoryPersistence && logs.find(log => {
        if (!log.exerciseId || +new Date(log.date) !== +new Date(best.date)) return false;
        const candidate = selectHistoricalPersonalRecord([log]);
        return candidate?.est1RM === best.est1RM && candidate.weight === best.weight && candidate.reps === best.reps;
    });
    return client.personalRecord.create({ data: {
        userId, exerciseName: nameLower, weight: best.weight, reps: best.reps,
        estimated1RM: best.est1RM, date: best.date,
        ...(winner ? { sourceExerciseId: winner.exerciseId } : {})
    } });
}
