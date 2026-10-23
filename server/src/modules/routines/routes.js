import { withWorkoutTransaction } from '../../services/workoutTransaction.js';
import { lockRoutineWorkoutGraph } from '../../services/workoutTransaction.js';
import { WorkoutRequestError } from '../../services/workoutTransaction.js';
import { createImportRoutineHandler } from '../../routes/importRoutine.js';
import { createUpdateRoutineHandler } from '../../routes/updateRoutine.js';
import { getRecycleBinDay } from '../../routes/updateRoutine.js';
import { getActiveBlock } from '../../logic.js';
import { currentWeekInBlock } from '../../logic.js';
import { getRoutinePhaseStatus } from '../../logic.js';
import { setPrivateCache } from '../../app/cache.js';
import { daysIncludeFor } from './service.js';

export function registerRoutes(app, { prisma, authMiddleware , console , deduplicateExercises }) {
app.post('/api/routines/import', authMiddleware, createImportRoutineHandler({ prisma, deduplicateExercises, logger: console }));

app.get('/api/routines', authMiddleware, async (req, res) => {
    try {
        const baseWhere = { userId: req.userId, name: { not: "ARCHIVED_HISTORY_DO_NOT_DELETE" } };
        const plainExercises = { orderBy: { order: 'asc' } };
        // activeBlock/currentWeek calculados aquí (no solo en /active): Workout.jsx
        // busca el día por dayId iterando TODAS las rutinas del usuario, no solo la
        // marcada isActive.
        const [manualRoutines, aiRoutines] = await Promise.all([
            prisma.routine.findMany({
                where: { ...baseWhere, source: 'manual' },
                include: { days: daysIncludeFor('manual', plainExercises), blocks: { orderBy: { order: 'asc' } } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.routine.findMany({
                where: { ...baseWhere, source: 'ai' },
                include: { days: daysIncludeFor('ai', plainExercises), blocks: { orderBy: { order: 'asc' } } },
                orderBy: { createdAt: 'desc' }
            })
        ]);
        const routines = [...manualRoutines, ...aiRoutines].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setPrivateCache(res, 30);
        res.json(routines.map(r => {
            const activeBlock = getActiveBlock(r.blocks);
            const phaseStatus = getRoutinePhaseStatus(r);
            return { ...r, activeBlock, currentWeek: currentWeekInBlock(activeBlock), isDeload: phaseStatus.isDeload, phase: phaseStatus.phase };
        }));
    } catch (error) {
        console.error('Error fetching routines:', error);
        res.status(500).json({ error: 'Failed to fetch routines' });
    }
});

app.get('/api/routines/trash', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: {
                userId: req.userId,
                name: "ARCHIVED_HISTORY_DO_NOT_DELETE"
            },
            include: {
                days: {
                    include: {
                        exercises: { orderBy: { order: 'asc' } }
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });
        // Return null if not found (no trash yet), frontend handles it
        res.json(routine || null);
    } catch (error) {
        console.error('Error fetching trash routine:', error);
        res.status(500).json({ error: 'Failed to fetch trash routine' });
    }
});

app.get('/api/routines/active', authMiddleware, async (req, res) => {
    try {
        const activeMeta = await prisma.routine.findFirst({
            where: { isActive: true, userId: req.userId },
            select: { id: true, source: true }
        });
        if (!activeMeta) return res.json(null);

        const exercisesWithLastLog = {
            include: { workoutLogs: { include: { sets: true }, orderBy: { date: 'desc' }, take: 1 } },
            orderBy: { order: 'asc' }
        };
        const routine = await prisma.routine.findUnique({
            where: { id: activeMeta.id },
            include: {
                days: daysIncludeFor(activeMeta.source, exercisesWithLastLog),
                blocks: { orderBy: { order: 'asc' } }
            }
        });
        if (!routine) return res.json(routine);
        const activeBlock = getActiveBlock(routine.blocks);
        const phaseStatus = getRoutinePhaseStatus(routine);
        setPrivateCache(res, 20);
        res.json({ ...routine, activeBlock, currentWeek: currentWeekInBlock(activeBlock), isDeload: phaseStatus.isDeload, phase: phaseStatus.phase });
    } catch (error) {
        console.error('Error fetching active routine:', error);
        res.status(500).json({ error: 'Failed to fetch active routine' });
    }
});

app.get('/api/routines/:id', authMiddleware, async (req, res) => {
    try {
        const meta = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId },
            select: { source: true }
        });
        if (!meta) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        const exercisesWithHistory = {
            include: { workoutLogs: { include: { sets: true }, orderBy: { date: 'desc' }, take: 5 } },
            orderBy: { order: 'asc' }
        };
        const routine = await prisma.routine.findUnique({
            where: { id: req.params.id },
            include: {
                days: daysIncludeFor(meta.source, exercisesWithHistory),
                blocks: { orderBy: { order: 'asc' } }
            }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        const activeBlock = getActiveBlock(routine.blocks);
        const phaseStatus = getRoutinePhaseStatus(routine);
        res.json({ ...routine, activeBlock, currentWeek: currentWeekInBlock(activeBlock), isDeload: phaseStatus.isDeload, phase: phaseStatus.phase });
    } catch (error) {
        console.error('Error fetching routine:', error);
        res.status(500).json({ error: 'Failed to fetch routine' });
    }
});

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
        await withWorkoutTransaction(prisma, req.userId, async (tx) => {
            await lockRoutineWorkoutGraph(tx, req.params.id, req.userId);
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
                    const bin = await tx.routineDay.findUnique({ where: { id: binId }, select: { routineId: true } });
                    if (bin.routineId === req.params.id) throw new WorkoutRequestError(409,
                        'Archived workout history cannot be deleted as a routine.', 'WORKOUT_HISTORY_CONFLICT', 'not_committed');
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
        if (error instanceof WorkoutRequestError) return res.status(error.status).json({ error: error.message,
            ...(error.code ? { code: error.code, outcome: error.outcome } : {}) });
        res.status(500).json({ error: 'Failed to delete routine' });
    }
});

app.put('/api/routines/:id', authMiddleware, createUpdateRoutineHandler({ prisma, deduplicateExercises, logger: console }));

app.put('/api/routines/:id/activate', authMiddleware, async (req, res) => {
    try {
        const routineToActivate = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });

        if (!routineToActivate) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // Deactivate all routines FOR THIS USER first
        await prisma.routine.updateMany({
            where: { isActive: true, userId: req.userId },
            data: { isActive: false }
        });

        // Activate the selected routine
        const routine = await prisma.routine.update({
            where: { id: req.params.id },
            data: { isActive: true },
            include: {
                days: {
                    include: { exercises: { orderBy: { order: 'asc' } } },
                    orderBy: { order: 'asc' }
                }
            }
        });

        res.json({ message: 'Routine activated!', routine });
    } catch (error) {
        console.error('Error activating routine:', error);
        res.status(500).json({ error: 'Failed to activate routine' });
    }
});

}
