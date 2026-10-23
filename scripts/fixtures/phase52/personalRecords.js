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

    let best = null;
    for (const log of logs) {
        for (const s of log.sets) {
            const candidates = [{ w: s.weight, r: s.reps }];
            if (s.weightRight != null || s.repsRight != null) {
                candidates.push({ w: s.weightRight ?? s.weight, r: s.repsRight ?? s.reps });
            }
            for (const c of candidates) {
                const w = Number(c.w) || 0;
                const r = Number(c.r) || 0;
                if (w <= 0 || r <= 0) continue;
                // Preserved literally. This differs from Smart Loading's guarded
                // Epley at >=37 reps; changing that belongs to the training phase.
                const est = (r > 1 && r < 37) ? w * (1 + r / 30) : w;
                if (!best || est > best.est1RM) best = { weight: w, reps: r, est1RM: est, date: log.date };
            }
        }
    }

    // Same identity as the history query, including mixed-case historical rows.
    await client.personalRecord.deleteMany({ where: {
        userId, exerciseName: { equals: exerciseName, mode: 'insensitive' }
    } });
    if (!best) return null;
    return client.personalRecord.create({ data: {
        userId, exerciseName: nameLower, weight: best.weight, reps: best.reps,
        estimated1RM: best.est1RM, date: best.date
    } });
}
