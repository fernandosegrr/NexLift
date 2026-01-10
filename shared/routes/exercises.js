/**
 * Exercise routes factory
 * @param {PrismaClient} prisma
 */
export function createExerciseRoutes(prisma) {
    return {
        /**
         * GET /api/exercises
         */
        async getAll(req, res) {
            try {
                const exercises = await prisma.exercise.findMany({
                    where: {
                        routineDay: { routine: { userId: req.userId } }
                    },
                    select: { id: true, name: true, muscleGroup: true },
                    distinct: ['name'],
                    orderBy: { name: 'asc' }
                });
                res.json(exercises);
            } catch (error) {
                console.error('Error fetching exercises:', error);
                res.status(500).json({ error: 'Failed to fetch exercises' });
            }
        },

        /**
         * PUT /api/exercises/:id/muscle
         */
        async updateMuscleGroup(req, res) {
            try {
                const { muscleGroup } = req.body;
                const exerciseId = req.params.id;

                // Verify ownership
                const exercise = await prisma.exercise.findFirst({
                    where: {
                        id: exerciseId,
                        routineDay: { routine: { userId: req.userId } }
                    }
                });

                if (!exercise) {
                    return res.status(404).json({ error: 'Exercise not found' });
                }

                await prisma.exercise.update({
                    where: { id: exerciseId },
                    data: { muscleGroup }
                });

                // Update all exercises with the same name
                await prisma.exercise.updateMany({
                    where: {
                        name: exercise.name,
                        routineDay: { routine: { userId: req.userId } }
                    },
                    data: { muscleGroup }
                });

                res.json({ message: 'Updated', exercise: { ...exercise, muscleGroup } });
            } catch (error) {
                console.error('Error updating muscle group:', error);
                res.status(500).json({ error: 'Failed to update muscle group' });
            }
        }
    };
}
