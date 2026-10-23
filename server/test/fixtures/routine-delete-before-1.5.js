// Frozen indirect WorkoutLog deletion before Phase 1.5. Test only.
import express from 'express';
import { getRecycleBinDay } from '../../src/routes/updateRoutine.js';
export function createLegacyRoutineDeleteApp(prisma) {
const app = express();
const authMiddleware = (req, res, next) => { req.userId = 'A'; next(); };
app.delete('/api/routines/:id', authMiddleware, async (req, res) => {
    try {
        // Verify ownership
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // Envuelto en transacción: archivar-lo-que-tiene-historial y luego borrar la
        // rutina eran pasos independientes antes — si algo fallaba a la mitad, podía
        // quedar a medio archivar. También cierra la ventana de carrera contra un
        // WorkoutLog nuevo llegando (p.ej. desde un Atajo) entre el conteo y el borrado.
        await prisma.$transaction(async (tx) => {
            const routineDays = await tx.routineDay.findMany({
                where: { routineId: req.params.id },
                include: { exercises: { select: { id: true } } }
            });

            const exerciseIds = routineDays.flatMap(day => day.exercises.map(ex => ex.id));
            if (exerciseIds.length > 0) {
                const logs = await tx.workoutLog.findMany({
                    where: { exerciseId: { in: exerciseIds } },
                    select: { exerciseId: true },
                    distinct: ['exerciseId']
                });

                if (logs.length > 0) {
                    const binId = await getRecycleBinDay(req.userId, tx);
                    const exercisesToKeep = logs.map(l => l.exerciseId);
                    await tx.exercise.updateMany({
                        where: { id: { in: exercisesToKeep } },
                        data: { routineDayId: binId }
                    });
                }
            }

            await tx.routine.delete({ where: { id: req.params.id } });
        });
        res.json({ message: 'Routine deleted successfully' });
    } catch (error) {
        console.error('Error deleting routine:', error);
        res.status(500).json({ error: 'Failed to delete routine' });
    }
});
return app;
}
