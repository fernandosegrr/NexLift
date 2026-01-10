/**
 * Normaliza nombre de ejercicio para consistencia en PRs
 */
function normalizeExerciseName(name) {
    if (!name) return '';
    return name
        .replace(/^[a-z]\.?\d+\.?\s*/i, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Workout routes factory
 * @param {PrismaClient} prisma
 */
export function createWorkoutRoutes(prisma) {
    return {
        /**
         * POST /api/workouts/log
         */
        async logWorkout(req, res) {
            try {
                const { exerciseId, sets, notes } = req.body;
                const userId = req.userId;

                if (!exerciseId || !sets) {
                    return res.status(400).json({ error: 'Missing data' });
                }

                // Verify exercise belongs to user
                const exercise = await prisma.exercise.findFirst({
                    where: {
                        id: exerciseId,
                        routineDay: { routine: { userId } }
                    }
                });

                if (!exercise) {
                    return res.status(404).json({ error: 'Exercise not found or unauthorized' });
                }

                const workoutLog = await prisma.workoutLog.create({
                    data: {
                        exerciseId,
                        notes: notes || null,
                        sets: {
                            create: sets.map((set, i) => ({
                                setNumber: i + 1,
                                weight: parseFloat(set.weight),
                                reps: parseInt(set.reps),
                                rpe: set.rpe ? parseFloat(set.rpe) : null,
                                completed: true
                            }))
                        }
                    },
                    include: { sets: true, exercise: true }
                });

                // Update PR
                for (const set of sets) {
                    const weight = parseFloat(set.weight);
                    const reps = parseInt(set.reps);

                    let est1RM = weight;
                    if (reps > 1 && reps < 37) {
                        est1RM = weight * (1 + reps / 30);
                    }

                    const existingPR = await prisma.personalRecord.findFirst({
                        where: {
                            exerciseName: exercise.name.toLowerCase(),
                            userId
                        },
                        orderBy: { estimated1RM: 'desc' }
                    });

                    if (!existingPR || est1RM > (existingPR.estimated1RM || 0)) {
                        await prisma.personalRecord.create({
                            data: {
                                userId,
                                exerciseName: exercise.name.toLowerCase(),
                                weight,
                                reps,
                                estimated1RM: est1RM
                            }
                        });
                    }
                }

                res.status(201).json({ message: 'Logged!', workoutLog });
            } catch (error) {
                console.error('Error logging workout:', error);
                res.status(500).json({ error: 'Failed to log workout' });
            }
        },

        /**
         * POST /api/workouts/log-rest
         */
        async logRest(req, res) {
            try {
                const { note } = req.body;
                const restLog = await prisma.restLog.create({
                    data: {
                        userId: req.userId,
                        note: note || 'Día de descanso'
                    }
                });
                res.status(201).json({ message: 'Rest logged!', restLog });
            } catch (error) {
                console.error('Error logging rest:', error);
                res.status(500).json({ error: 'Failed to log rest' });
            }
        },

        /**
         * GET /api/workouts/history
         */
        async getHistory(req, res) {
            try {
                const limit = parseInt(req.query.limit) || 30;

                const logs = await prisma.workoutLog.findMany({
                    where: {
                        exercise: {
                            routineDay: { routine: { userId: req.userId } }
                        }
                    },
                    include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true },
                    orderBy: { date: 'desc' },
                    take: Math.min(limit, 1000)
                });
                res.json(logs);
            } catch (error) {
                console.error('Error fetching history:', error);
                res.status(500).json({ error: 'Failed to fetch history' });
            }
        },

        /**
         * PUT /api/workouts/:logId
         */
        async updateWorkout(req, res) {
            try {
                const logId = req.params.logId;
                const { sets } = req.body;

                if (!sets || !Array.isArray(sets)) {
                    return res.status(400).json({ error: 'Sets array required' });
                }

                // Verify ownership
                const existingLog = await prisma.workoutLog.findFirst({
                    where: {
                        id: logId,
                        exercise: { routineDay: { routine: { userId: req.userId } } }
                    }
                });

                if (!existingLog) {
                    return res.status(404).json({ error: 'Log not found' });
                }

                const updated = await prisma.$transaction(async (tx) => {
                    await tx.setLog.deleteMany({ where: { workoutLogId: logId } });

                    await tx.setLog.createMany({
                        data: sets.map((set, i) => ({
                            workoutLogId: logId,
                            setNumber: i + 1,
                            weight: parseFloat(set.weight),
                            reps: parseInt(set.reps),
                            rpe: set.rpe ? parseFloat(set.rpe) : null,
                            completed: true
                        }))
                    });

                    return tx.workoutLog.findUnique({
                        where: { id: logId },
                        include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true }
                    });
                });

                res.json({ message: 'Session updated!', workoutLog: updated });
            } catch (error) {
                console.error('Error updating workout:', error);
                res.status(500).json({ error: 'Failed to update session' });
            }
        },

        /**
         * DELETE /api/workouts/:logId
         */
        async deleteWorkout(req, res) {
            try {
                const logId = req.params.logId;

                const existingLog = await prisma.workoutLog.findFirst({
                    where: {
                        id: logId,
                        exercise: { routineDay: { routine: { userId: req.userId } } }
                    }
                });

                if (!existingLog) {
                    return res.status(404).json({ error: 'Log not found' });
                }

                await prisma.workoutLog.delete({ where: { id: logId } });
                res.json({ message: 'Session deleted!' });
            } catch (error) {
                console.error('Error deleting workout:', error);
                res.status(500).json({ error: 'Failed to delete session' });
            }
        },

        /**
         * GET /api/workouts/exercise/:id/history
         */
        async getExerciseHistory(req, res) {
            try {
                const exercise = await prisma.exercise.findFirst({
                    where: {
                        id: req.params.id,
                        routineDay: { routine: { userId: req.userId } }
                    },
                    select: { name: true }
                });

                if (!exercise) {
                    return res.json([]);
                }

                const logs = await prisma.workoutLog.findMany({
                    where: {
                        exercise: {
                            name: { equals: exercise.name, mode: 'insensitive' },
                            routineDay: { routine: { userId: req.userId } }
                        }
                    },
                    include: { sets: { orderBy: { setNumber: 'asc' } } },
                    orderBy: { date: 'desc' },
                    take: 20
                });
                res.json(logs);
            } catch (error) {
                console.error('Error fetching exercise history:', error);
                res.status(500).json({ error: 'Failed to fetch history' });
            }
        }
    };
}
