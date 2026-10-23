import { withWorkoutTransaction } from '../../services/workoutTransaction.js';
import { lockRoutineWorkoutGraph } from '../../services/workoutTransaction.js';
import { WorkoutRequestError } from '../../services/workoutTransaction.js';
import { normalizeImportedExercise } from '../../services/routineImportContract.js';
import { getRecycleBinDay } from '../../routes/updateRoutine.js';
import { hasRetainedExerciseData } from '../../services/historyPersistence.js';
import { EXERCISE_CATALOG } from '../../data/exerciseCatalog.js';
import { pickReplacementExercises } from '../../data/splitTemplates.js';
import { mexicoCityDateStr } from '../../logic.js';
import { mexicoCityDayBounds } from '../../logic.js';

export function registerRoutes(app, { prisma, authMiddleware, resolveOrGenerateAiRoutineDay , console }) {
app.post('/api/ai-routine/setup', authMiddleware, async (req, res) => {
    try {
        const { goal, daysPerWeek, equipment, experienceLevel } = req.body;
        if (!goal || !daysPerWeek || !Array.isArray(equipment) || equipment.length === 0 || !experienceLevel) {
            return res.status(400).json({ error: 'Required: goal, daysPerWeek, equipment[], experienceLevel' });
        }

        const profile = await prisma.trainingProfile.upsert({
            where: { userId: req.userId },
            update: { goal, daysPerWeek, equipment, experienceLevel },
            create: { userId: req.userId, goal, daysPerWeek, equipment, experienceLevel }
        });

        // Deactivate all routines FOR THIS USER first (mismo patrón que
        // PUT /api/routines/:id/activate) para garantizar como mucho 1 activa.
        await prisma.routine.updateMany({
            where: { isActive: true, userId: req.userId },
            data: { isActive: false }
        });

        // Reusa la rutina IA existente si ya hay una (conserva su historial de
        // días/ejercicios) — solo crea una nueva la primera vez que se configura.
        let routine = await prisma.routine.findFirst({ where: { userId: req.userId, source: 'ai' } });
        routine = routine
            ? await prisma.routine.update({ where: { id: routine.id }, data: { isActive: true } })
            : await prisma.routine.create({ data: { name: 'Rutina IA', source: 'ai', isActive: true, userId: req.userId } });

        const day = await resolveOrGenerateAiRoutineDay(routine, profile);
        res.json({ routine, day });
    } catch (error) {
        console.error('Error setting up AI routine:', error);
        res.status(500).json({ error: 'Failed to set up AI routine' });
    }
});

app.get('/api/ai-routine/today', authMiddleware, async (req, res) => {
    try {
        const profile = await prisma.trainingProfile.findUnique({ where: { userId: req.userId } });
        if (!profile) return res.status(404).json({ error: 'No training profile configured' });

        const routine = await prisma.routine.findFirst({ where: { userId: req.userId, source: 'ai', isActive: true } });
        if (!routine) return res.status(404).json({ error: 'No active AI routine' });

        const day = await resolveOrGenerateAiRoutineDay(routine, profile);
        res.json({ routineId: routine.id, day });
    } catch (error) {
        console.error('Error fetching AI routine today:', error);
        res.status(500).json({ error: "Failed to fetch today's AI routine day" });
    }
});

app.post('/api/ai-routine/reshuffle/:routineDayId', authMiddleware, async (req, res) => {
    try {
        const updatedDay = await withWorkoutTransaction(prisma, req.userId, async tx => {
            let day = await tx.routineDay.findFirst({
                where: { id: req.params.routineDayId, routine: { userId: req.userId, source: 'ai' } },
                include: { exercises: true }
            });
            if (!day) throw new WorkoutRequestError(404, 'AI routine day not found');
            await lockRoutineWorkoutGraph(tx, day.routineId, req.userId);
            day = await tx.routineDay.findFirst({
                where: { id: req.params.routineDayId, routine: { userId: req.userId, source: 'ai' } },
                include: { exercises: true }
            });
            if (!day) throw new WorkoutRequestError(404, 'AI routine day not found');

            // Solo tiene sentido reorganizar HOY — un día pasado ya es historial.
            if (day.dayName !== mexicoCityDateStr()) {
                throw new WorkoutRequestError(400, 'Only today\'s day can be reshuffled');
            }

            const profile = await tx.trainingProfile.findUnique({ where: { userId: req.userId } });
            if (!profile) throw new WorkoutRequestError(404, 'No training profile configured');

            // Regla de seguridad: un ejercicio con AL MENOS una serie registrada HOY no
            // se toca — nunca se descarta un set que el usuario ya guardó.
            const { start, end } = mexicoCityDayBounds(new Date());
            const loggedTodayIds = new Set((await tx.workoutLog.findMany({
                where: { exerciseId: { in: day.exercises.map(e => e.id) }, date: { gte: start, lt: end } },
                select: { exerciseId: true }
            })).map(l => l.exerciseId));

            const toKeep = day.exercises.filter(ex => loggedTodayIds.has(ex.id));
            const toRemove = day.exercises.filter(ex => !loggedTodayIds.has(ex.id));

            // Excluye TODOS los nombres de hoy (conservados + removidos): solo
            // reemplaza por grupo muscular lo que realmente se quitó — regenerar el
            // día completo (como en la generación inicial) duplicaría los grupos
            // musculares que los ejercicios conservados ya cubren. Determinista a
            // propósito (no pasa por la IA): reshuffle es la pieza menos esencial de
            // la feature, y este camino evita repetir el mismo riesgo de "conteo por
            // grupo muscular" con una respuesta de LLM que no lo tiene en cuenta.
            const excludeNames = day.exercises.map(ex => ex.name);
            const freshExercises = pickReplacementExercises(profile, toRemove, excludeNames, EXERCISE_CATALOG)
                .map((ex, i) => normalizeImportedExercise(ex, toKeep.length + i, `ai.reshuffle[${i}]`));

            // Mismo patrón que PUT /api/routines/:id: un ejercicio con historial (de
            // CUALQUIER día, no solo hoy) se archiva en vez de borrarse de verdad.
            for (const ex of toRemove) {
                const logCount = await hasRetainedExerciseData(tx, ex.id);
                if (logCount > 0) {
                    const binId = await getRecycleBinDay(req.userId, tx);
                    await tx.exercise.update({ where: { id: ex.id }, data: { routineDayId: binId } });
                } else {
                    await tx.exercise.delete({ where: { id: ex.id } });
                }
            }

            const startOrder = toKeep.length;
            await Promise.all(freshExercises.map((ex, i) =>
                tx.exercise.create({ data: { ...ex, order: startOrder + i, routineDayId: day.id } })
            ));

            return tx.routineDay.findUnique({
                where: { id: day.id },
                include: { exercises: { orderBy: { order: 'asc' } } }
            });
        });
        res.json({ day: updatedDay });
    } catch (error) {
        console.error('Error reshuffling AI routine day:', error);
        if (error instanceof WorkoutRequestError) return res.status(error.status).json({ error: error.message,
            ...(error.code ? { code: error.code, outcome: error.outcome } : {}) });
        res.status(500).json({ error: 'Failed to reshuffle day' });
    }
});

}
