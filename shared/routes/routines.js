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
 * Routine routes factory
 * @param {PrismaClient} prisma
 */
export function createRoutineRoutes(prisma) {
    return {
        /**
         * POST /api/routines/import
         */
        async importRoutine(req, res) {
            try {
                const { name, description, days } = req.body;
                const userId = req.userId;

                if (!name || !days || !Array.isArray(days)) {
                    return res.status(400).json({ error: 'Invalid JSON structure' });
                }

                const routine = await prisma.routine.create({
                    data: {
                        userId,
                        name,
                        description: description || null,
                        days: {
                            create: days.map((day, dayIndex) => ({
                                dayName: day.dayName,
                                isRestDay: day.isRestDay || false,
                                order: dayIndex,
                                exercises: {
                                    create: (day.exercises || []).map((ex, exIndex) => ({
                                        name: normalizeExerciseName(ex.name),
                                        targetSets: ex.sets || 3,
                                        targetReps: ex.reps || '8-12',
                                        restSeconds: ex.rest || null,
                                        note: ex.note || null,
                                        order: ex.order !== undefined ? ex.order : exIndex
                                    }))
                                }
                            }))
                        }
                    },
                    include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
                });
                res.status(201).json({ message: 'Routine imported!', routine });
            } catch (error) {
                console.error('Error importing routine:', error);
                res.status(500).json({ error: 'Failed to import routine' });
            }
        },

        /**
         * GET /api/routines
         */
        async getAll(req, res) {
            try {
                const routines = await prisma.routine.findMany({
                    where: { userId: req.userId },
                    include: {
                        days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } }
                    },
                    orderBy: { createdAt: 'desc' }
                });
                res.json(routines);
            } catch (error) {
                console.error('Error fetching routines:', error);
                res.status(500).json({ error: 'Failed to fetch routines' });
            }
        },

        /**
         * GET /api/routines/active
         */
        async getActive(req, res) {
            try {
                const routine = await prisma.routine.findFirst({
                    where: { isActive: true, userId: req.userId },
                    include: {
                        days: {
                            include: {
                                exercises: {
                                    include: {
                                        workoutLogs: { include: { sets: true }, orderBy: { date: 'desc' }, take: 1 }
                                    },
                                    orderBy: { order: 'asc' }
                                }
                            },
                            orderBy: { order: 'asc' }
                        }
                    }
                });
                res.json(routine);
            } catch (error) {
                console.error('Error fetching active routine:', error);
                res.status(500).json({ error: 'Failed to fetch active routine' });
            }
        },

        /**
         * GET /api/routines/:id
         */
        async getById(req, res) {
            try {
                const routine = await prisma.routine.findFirst({
                    where: { id: req.params.id, userId: req.userId },
                    include: {
                        days: {
                            include: {
                                exercises: {
                                    include: {
                                        workoutLogs: { include: { sets: true }, orderBy: { date: 'desc' }, take: 5 }
                                    },
                                    orderBy: { order: 'asc' }
                                }
                            },
                            orderBy: { order: 'asc' }
                        }
                    }
                });
                if (!routine) return res.status(404).json({ error: 'Not found' });
                res.json(routine);
            } catch (error) {
                console.error('Error fetching routine:', error);
                res.status(500).json({ error: 'Failed to fetch routine' });
            }
        },

        /**
         * PUT /api/routines/:id/activate
         */
        async activate(req, res) {
            try {
                const userId = req.userId;
                const routineId = req.params.id;

                const routineToActivate = await prisma.routine.findFirst({
                    where: { id: routineId, userId }
                });
                if (!routineToActivate) return res.status(404).json({ error: 'Routine not found' });

                await prisma.routine.updateMany({ where: { isActive: true, userId }, data: { isActive: false } });

                const routine = await prisma.routine.update({
                    where: { id: routineId },
                    data: { isActive: true },
                    include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
                });
                res.json({ message: 'Activated!', routine });
            } catch (error) {
                console.error('Error activating routine:', error);
                res.status(500).json({ error: 'Failed to activate routine' });
            }
        },

        /**
         * DELETE /api/routines/:id
         */
        async delete(req, res) {
            try {
                const owned = await prisma.routine.findFirst({ where: { id: req.params.id, userId: req.userId } });
                if (!owned) return res.status(404).json({ error: 'Routine not found' });

                await prisma.routine.delete({ where: { id: req.params.id } });
                res.json({ message: 'Deleted' });
            } catch (error) {
                console.error('Error deleting routine:', error);
                res.status(500).json({ error: 'Failed to delete routine' });
            }
        },

        /**
         * PUT /api/routines/:id (Full update with smart PR renaming)
         */
        async update(req, res) {
            try {
                const routineId = req.params.id;
                const userId = req.userId;
                const { name, description, days } = req.body;

                const owned = await prisma.routine.findFirst({ where: { id: routineId, userId } });
                if (!owned) return res.status(404).json({ error: 'Routine not found' });

                const updatedRoutine = await prisma.$transaction(async (tx) => {
                    await tx.routine.update({
                        where: { id: routineId },
                        data: { name, description }
                    });

                    const existingDays = await tx.routineDay.findMany({
                        where: { routineId },
                        select: { id: true }
                    });
                    const incomingDayIds = days.filter(d => d.id).map(d => d.id);
                    const daysToDelete = existingDays.filter(d => !incomingDayIds.includes(d.id)).map(d => d.id);

                    if (daysToDelete.length > 0) {
                        await tx.routineDay.deleteMany({ where: { id: { in: daysToDelete } } });
                    }

                    for (let i = 0; i < days.length; i++) {
                        const day = days[i];
                        let dayId = day.id;

                        if (dayId) {
                            await tx.routineDay.update({
                                where: { id: dayId },
                                data: { dayName: day.dayName, isRestDay: day.isRestDay || false, order: i }
                            });
                        } else {
                            const newDay = await tx.routineDay.create({
                                data: { routineId, dayName: day.dayName, isRestDay: day.isRestDay || false, order: i }
                            });
                            dayId = newDay.id;
                        }

                        if (day.exercises && Array.isArray(day.exercises)) {
                            const existingExercises = await tx.exercise.findMany({
                                where: { routineDayId: dayId },
                                select: { id: true }
                            });
                            const incomingExIds = day.exercises.filter(e => e.id).map(e => e.id);
                            const exToDelete = existingExercises.filter(e => !incomingExIds.includes(e.id)).map(e => e.id);

                            if (exToDelete.length > 0) {
                                await tx.exercise.deleteMany({ where: { id: { in: exToDelete } } });
                            }

                            for (let j = 0; j < day.exercises.length; j++) {
                                const ex = day.exercises[j];
                                const exData = {
                                    name: normalizeExerciseName(ex.name),
                                    targetSets: parseInt(ex.targetSets || 3),
                                    targetReps: String(ex.targetReps || '8-12'),
                                    restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                    note: ex.note || null,
                                    order: j,
                                    routineDayId: dayId
                                };

                                if (ex.id) {
                                    const currentExercise = await tx.exercise.findUnique({
                                        where: { id: ex.id },
                                        select: { name: true }
                                    });

                                    const { routineDayId, ...updateData } = exData;
                                    await tx.exercise.update({ where: { id: ex.id }, data: updateData });

                                    if (currentExercise && normalizeExerciseName(currentExercise.name) !== normalizeExerciseName(ex.name)) {
                                        console.log(`Renaming PRs: "${currentExercise.name}" -> "${normalizeExerciseName(ex.name)}"`);
                                        await tx.personalRecord.updateMany({
                                            where: {
                                                userId,
                                                exerciseName: { equals: currentExercise.name, mode: 'insensitive' }
                                            },
                                            data: { exerciseName: normalizeExerciseName(ex.name) }
                                        });
                                    }
                                } else {
                                    await tx.exercise.create({ data: exData });
                                }
                            }
                        }
                    }

                    return tx.routine.findUnique({
                        where: { id: routineId },
                        include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
                    });
                });

                res.json(updatedRoutine);
            } catch (error) {
                console.error('Error updating routine:', error);
                res.status(500).json({ error: 'Failed to update routine' });
            }
        }
    };
}
