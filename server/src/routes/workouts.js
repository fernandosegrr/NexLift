import { sanitizeSets, sanitizeWorkoutLogBody, sanitizeShortcutLogSet, resolveTargetDate } from '../logic.js';
import { recalcPRForExercise } from '../services/personalRecords.js';
import { withWorkoutTransaction, lockOwnedExercise, lockOwnedWorkout, WorkoutRequestError } from '../services/workoutTransaction.js';

const includeWorkout = { sets: { orderBy: { setNumber: 'asc' } }, exercise: true };
const setData = (set, index) => ({
    setNumber: index + 1, weight: set.weight, reps: set.reps, rpe: set.rpe,
    weightRight: set.weightRight ?? null, repsRight: set.repsRight ?? null, completed: set.completed
});

// Legacy sessions keep their original contract. Once a versioned operation has
// touched a session, an unconditional replacement/deletion could discard an
// acknowledged append. Require the versioned API for that session only.
async function requireUnmanagedSession(tx, log, userId) {
    const [storage] = await tx.$queryRaw`SELECT to_regclass('nexlift_operations."IdempotencyRecord"') IS NOT NULL AS present`;
    if (!storage.present) return;
    const records = await tx.$queryRaw`SELECT 1 FROM nexlift_operations."IdempotencyRecord"
        WHERE "userId"=${userId} AND "resourceId"=${log.id} LIMIT 1`;
    if (records.length) throw new WorkoutRequestError(409, 'Session requires a conditional versioned operation.', 'WORKOUT_VERSION_REQUIRED', 'not_committed');
}

export function createWorkoutHandlers({ prisma, scheduleRestReminder = () => {}, logger = console }) {
    const report = error => { try { logger.error(error); } catch { /* Logging cannot change persistence results. */ } };
    const endpoint = (failureMessage, operation) => async (req, res) => {
        try { await operation(req, res); }
        catch (error) {
            report(error);
            if (error instanceof WorkoutRequestError) {
                return res.status(error.status).json({ error: error.message,
                    ...(error.code ? { code: error.code, outcome: error.outcome } : {}) });
            }
            return res.status(500).json({ error: failureMessage });
        }
    };

    const logWorkout = endpoint('Failed to log workout', async (req, res) => {
        const parsed = sanitizeWorkoutLogBody(req.body);
        if (parsed.error) throw new WorkoutRequestError(400, parsed.error);
        const { exerciseId, sets, notes } = parsed.clean;
        const workoutLog = await withWorkoutTransaction(prisma, req.userId, async tx => {
            const exercise = await lockOwnedExercise(tx, exerciseId, req.userId);
            const log = await tx.workoutLog.create({ data: {
                exerciseId, notes, sets: { create: sets.map(setData) }
            }, include: includeWorkout });
            await recalcPRForExercise(tx, exercise.name, req.userId);
            return log;
        });
        res.status(201).json({ message: 'Workout logged successfully!', workoutLog });
    });

    const updateWorkout = endpoint('Failed to update session', async (req, res) => {
        if (!Array.isArray(req.body?.sets)) throw new WorkoutRequestError(400, 'Sets array required');
        const parsed = sanitizeSets(req.body.sets);
        if (parsed.error) throw new WorkoutRequestError(400, parsed.error);
        const workoutLog = await withWorkoutTransaction(prisma, req.userId, async tx => {
            const log = await lockOwnedWorkout(tx, req.params.logId, req.userId);
            await requireUnmanagedSession(tx, log, req.userId);
            await tx.setLog.deleteMany({ where: { workoutLogId: log.id } });
            await tx.setLog.createMany({ data: parsed.sets.map((set, i) => ({ ...setData(set, i), workoutLogId: log.id })) });
            await recalcPRForExercise(tx, log.exercise.name, req.userId);
            return tx.workoutLog.findUnique({ where: { id: log.id }, include: includeWorkout });
        });
        res.json({ message: 'Session updated!', workoutLog });
    });

    const deleteWorkout = endpoint('Failed to delete session', async (req, res) => {
        await withWorkoutTransaction(prisma, req.userId, async tx => {
            const log = await lockOwnedWorkout(tx, req.params.logId, req.userId);
            await requireUnmanagedSession(tx, log, req.userId);
            await tx.workoutLog.delete({ where: { id: log.id } });
            await recalcPRForExercise(tx, log.exercise.name, req.userId);
        });
        res.json({ message: 'Session deleted!' });
    });

    const logShortcutSet = endpoint('Failed to log set', async (req, res) => {
        const parsed = sanitizeShortcutLogSet(req.body);
        if (parsed.error) throw new WorkoutRequestError(400, parsed.error);
        const { exerciseId, set } = parsed.clean;
        const explicitDate = req.query.date || req.body.date;
        const targetDate = resolveTargetDate(explicitDate);
        const endOfDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
        const { workoutLog, exercise, nextExerciseName } = await withWorkoutTransaction(prisma, req.userId, async tx => {
            const exercise = await lockOwnedExercise(tx, exerciseId, req.userId, { includeDay: true });
            // Same account lock also protects the absence of a daily session.
            // Multiple preexisting daily sessions remain intact; choose oldest.
            let log = await tx.workoutLog.findFirst({
                where: { exerciseId, date: { gte: targetDate, lt: endOfDay } },
                orderBy: [{ date: 'asc' }, { id: 'asc' }], include: { sets: true }
            });
            if (log) {
                const setNumber = Math.max(0, ...log.sets.map(s => s.setNumber)) + 1;
                await tx.setLog.create({ data: { ...setData(set, setNumber - 1), workoutLogId: log.id } });
                log = await tx.workoutLog.findUnique({ where: { id: log.id }, include: includeWorkout });
            } else {
                log = await tx.workoutLog.create({ data: {
                    exerciseId, date: explicitDate ? targetDate : new Date(), sets: { create: [setData(set, 0)] }
                }, include: includeWorkout });
            }
            await recalcPRForExercise(tx, exercise.name, req.userId);
            const dayExercises = exercise.routineDay?.exercises || [];
            const currentIdx = dayExercises.findIndex(e => e.id === exercise.id);
            const nextExerciseName = log.sets.length >= exercise.targetSets && currentIdx >= 0
                ? dayExercises[currentIdx + 1]?.name ?? null : null;
            return { workoutLog: log, exercise, nextExerciseName };
        });

        // Start only after COMMIT. Catch synchronous throws AND rejected promises;
        // do not wait for an external provider or misreport a committed write.
        try { void Promise.resolve(scheduleRestReminder(req.userId, exercise, nextExerciseName)).catch(report); }
        catch (error) { report(error); }
        res.status(201).json({ message: 'Set logged successfully!', workoutLog,
            setsLoggedToday: workoutLog.sets.length, targetSets: exercise.targetSets, nextExerciseName });
    });

    const fixWeights = endpoint('Failed to fix weights', async (req, res) => {
        const { exerciseName, oldWeight, newWeight } = req.body || {};
        if (typeof exerciseName !== 'string' || !exerciseName || oldWeight === undefined || newWeight === undefined) {
            throw new WorkoutRequestError(400, 'exerciseName, oldWeight, newWeight required');
        }
        const old = parseFloat(oldWeight), next = parseFloat(newWeight);
        if (!Number.isFinite(old) || !Number.isFinite(next) || old < 0 || next < 0) {
            throw new WorkoutRequestError(400, 'Invalid weight');
        }
        const result = await withWorkoutTransaction(prisma, req.userId, async tx => {
            // Stable ownership for all candidates before the first set mutation.
            const exercises = await tx.exercise.findMany({ where: {
                name: { contains: exerciseName, mode: 'insensitive' }, routineDay: { routine: { userId: req.userId } }
            }, orderBy: { id: 'asc' } });
            for (const exercise of exercises) await lockOwnedExercise(tx, exercise.id, req.userId);
            const logs = await tx.workoutLog.findMany({ where: { exerciseId: { in: exercises.map(e => e.id) } }, include: { sets: true } });
            let setsUpdated = 0, prsUpdated = 0;
            const names = new Set();
            for (const log of logs) {
                const exercise = exercises.find(e => e.id === log.exerciseId);
                names.add((log.exerciseNameSnapshot ?? exercise.name).toLowerCase());
                if (log.sets.some(set => Math.abs(set.weight - old) < 0.1)) await requireUnmanagedSession(tx, log, req.userId);
                for (const set of log.sets) {
                    // Existing bulk operation intentionally changes the left/main
                    // weight only, with the same strict <0.1 tolerance.
                    if (Math.abs(set.weight - old) < 0.1) {
                        await tx.setLog.update({ where: { id: set.id }, data: { weight: next } });
                        setsUpdated++;
                    }
                }
            }
            for (const name of names) if (await recalcPRForExercise(tx, name, req.userId)) prsUpdated++;
            return { setsUpdated, prsUpdated };
        });
        res.json({ message: `Fixed ${result.setsUpdated} sets and ${result.prsUpdated} PRs`, ...result });
    });

    return { logWorkout, updateWorkout, deleteWorkout, logShortcutSet, fixWeights };
}
