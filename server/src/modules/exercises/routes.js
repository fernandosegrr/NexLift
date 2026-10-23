

export function registerRoutes(app, { prisma, authMiddleware , console }) {
app.get('/api/exercises', authMiddleware, async (req, res) => {
    try {
        const exercises = await prisma.exercise.findMany({
            where: {
                routineDay: {
                    routine: {
                        userId: req.userId
                    }
                }
            },
            select: {
                id: true,
                name: true,
                muscleGroup: true
            },
            distinct: ['name']
        });
        res.json(exercises);
    } catch (error) {
        console.error('Error fetching exercises:', error);
        res.status(500).json({ error: 'Failed to fetch exercises' });
    }
});

app.put('/api/exercises/:id/muscle', authMiddleware, async (req, res) => {
    try {
        const { muscleGroup } = req.body;

        // Verify ownership
        const exercise = await prisma.exercise.findFirst({
            where: {
                id: req.params.id,
                routineDay: { routine: { userId: req.userId } }
            }
        });

        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found' });
        }

        await prisma.exercise.update({
            where: { id: req.params.id },
            data: { muscleGroup }
        });

        // Also update all exercises with the same name FOR THIS USER
        await prisma.exercise.updateMany({
            where: {
                name: exercise.name,
                routineDay: { routine: { userId: req.userId } }
            },
            data: { muscleGroup }
        });

        res.json({ message: 'Muscle group updated', exercise: { ...exercise, muscleGroup } });
    } catch (error) {
        console.error('Error updating muscle group:', error);
        res.status(500).json({ error: 'Failed to update muscle group' });
    }
});

}
