import { mexicoCityDateStr } from '../../logic.js';
import { mexicoCityDayBounds } from '../../logic.js';
import { dayOfWeekFromDateStr } from '../../logic.js';
import { parseCdmxDateRangeQuery } from '../../logic.js';
import { setPrivateCache } from '../../app/cache.js';
import { isDependencyUnavailable } from '../../operations/errors.js';

export function registerRoutes(app, { prisma, authMiddleware, scheduleRestReminder, cancelRestReminder, HISTORY_SESSIONS_WINDOW , console , workoutHandlers }) {
app.get('/api/workouts/today-log', authMiddleware, async (req, res) => {
    try {
        const { exerciseId } = req.query;
        if (!exerciseId) return res.status(400).json({ error: 'Required: exerciseId' });

        const exercise = await prisma.exercise.findFirst({
            where: { id: exerciseId, routineDay: { routine: { userId: req.userId } } }
        });
        if (!exercise) return res.status(404).json({ error: 'Exercise not found or unauthorized' });

        const { start, end } = mexicoCityDayBounds(new Date());
        const log = await prisma.workoutLog.findFirst({
            where: { exerciseId, date: { gte: start, lt: end } },
            include: { sets: true }
        });
        res.json(log || null);
    } catch (error) {
        console.error('Error checking today log:', error);
        res.status(500).json({ error: 'Failed to check today log' });
    }
});


app.post('/api/workouts/log', authMiddleware, workoutHandlers.logWorkout);

app.post('/api/workouts/rest-reminder', authMiddleware, async (req, res) => {
    try {
        const { exerciseId, nextExerciseName } = req.body;
        if (!exerciseId) {
            return res.status(400).json({ error: 'Required: exerciseId' });
        }
        const exercise = await prisma.exercise.findFirst({
            where: { id: exerciseId, routineDay: { routine: { userId: req.userId } } }
        });
        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found or unauthorized' });
        }
        const reminder = await scheduleRestReminder(req.userId, exercise, nextExerciseName || null);
        if (reminder === false) return res.set('Retry-After', '5').status(503).json({ error: 'Servicio temporalmente no disponible' });
        res.status(202).json({ message: 'Rest reminder scheduled', ...(reminder ? { reminder: { id: reminder.id, fireAt: reminder.fireAt } } : {}) });
    } catch (error) {
        console.error('Error scheduling rest reminder:', error);
        res.status(500).json({ error: 'Failed to schedule rest reminder' });
    }
});

app.delete('/api/workouts/rest-reminder', authMiddleware, async (req, res) => {
    const { reminderId, fireAt } = req.body || {};
    if (typeof reminderId !== 'string' || !reminderId || reminderId.length > 128 || typeof fireAt !== 'string'
        || fireAt.length > 64 || !Number.isFinite(Date.parse(fireAt))) return res.status(400).json({ error: 'Required: reminderId, fireAt' });
    try {
        const cancelled = await cancelRestReminder(req.userId, reminderId, new Date(fireAt));
        res.json({ cancelled });
    } catch (error) {
        console.error('Reminder cancellation failed');
        const status = isDependencyUnavailable(error) ? 503 : 500;
        if (status === 503) res.set('Retry-After', '5');
        res.status(status).json({ error: status === 503 ? 'Servicio temporalmente no disponible' : 'Error interno del servidor' });
    }
});

app.post('/api/workouts/log-rest', authMiddleware, async (req, res) => {
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
});

app.get('/api/workouts/history', authMiddleware, async (req, res) => {
    try {
        const { exerciseId, limit = 30, search, dateFrom, dateTo, dayOfWeek, offset = 0 } = req.query;
        // Techo 2000: export JSON en Settings pide 9999; 500 era demasiado bajo
        // para backup manual. Dashboard/Progress piden 180–250.
        const take = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 2000);
        const skip = Math.max(parseInt(offset, 10) || 0, 0);

        // Base filter: logs belonging to user's exercises
        const where = {
            exercise: {
                routineDay: {
                    routine: { userId: req.userId }
                }
            }
        };

        if (exerciseId) {
            where.exerciseId = exerciseId;
        }

        // Search by exercise name
        if (search) {
            where.exercise = {
                ...where.exercise,
                name: { contains: search, mode: 'insensitive' }
            };
        }

        // Date range: día calendario CDMX (no setHours del contenedor UTC)
        const dateRange = parseCdmxDateRangeQuery(dateFrom, dateTo);
        if (dateRange) where.date = dateRange;

        const logs = await prisma.workoutLog.findMany({
            where,
            select: {
                id: true,
                date: true,
                notes: true,
                exerciseId: true,
                exercise: {
                    select: {
                        id: true,
                        name: true,
                        muscleGroup: true,
                        isUnilateral: true
                    }
                },
                sets: {
                    orderBy: { setNumber: 'asc' },
                    select: {
                        id: true,
                        setNumber: true,
                        weight: true,
                        reps: true,
                        rpe: true,
                        weightRight: true,
                        repsRight: true
                    }
                }
            },
            orderBy: { date: 'desc' },
            take,
            skip
        });

        // Filter by day of week on application side (Prisma doesn't support this natively)
        let filtered = logs;
        if (dayOfWeek !== undefined && dayOfWeek !== '') {
            const dow = parseInt(dayOfWeek);
            filtered = logs.filter(log => dayOfWeekFromDateStr(mexicoCityDateStr(log.date)) === dow);
        }

        setPrivateCache(res, 20);
        res.json(filtered);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch workout history' });
    }
});

app.put('/api/workouts/fix-weights', authMiddleware, workoutHandlers.fixWeights);

app.get('/api/workouts/exercise/:exerciseId/history', authMiddleware, async (req, res) => {
    try {
        // First, get the exercise to find its name AND verify ownership
        const exercise = await prisma.exercise.findFirst({
            where: {
                id: req.params.exerciseId,
                routineDay: { routine: { userId: req.userId } }
            },
            select: { name: true }
        });

        if (!exercise) {
            return res.json([]);
        }

        // Últimas N sesiones bastan para Smart Loading + plateau + modal de historial.
        // ?limit= permite pedir más (export/modal); techo 50.
        const take = Math.min(
            Math.max(parseInt(req.query.limit, 10) || HISTORY_SESSIONS_WINDOW, 1),
            50
        );
        const logs = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: {
                        equals: exercise.name,
                        mode: 'insensitive'
                    },
                    routineDay: {
                        routine: { userId: req.userId }
                    }
                }
            },
            include: {
                sets: { orderBy: { setNumber: 'asc' } }
            },
            orderBy: { date: 'desc' },
            take
        });
        setPrivateCache(res, 15);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching exercise history:', error);
        res.status(500).json({ error: 'Failed to fetch exercise history' });
    }
});

app.get('/api/workouts/:logId', authMiddleware, async (req, res) => {
    try {
        const logId = req.params.logId;
        const log = await prisma.workoutLog.findFirst({
            where: {
                id: logId,
                exercise: { routineDay: { routine: { userId: req.userId } } }
            },
            include: {
                sets: { orderBy: { setNumber: 'asc' } },
                exercise: true
            }
        });

        if (!log) return res.status(404).json({ error: 'Session not found' });
        res.json(log);
    } catch (error) {
        console.error('Error fetching session:', error);
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

app.put('/api/workouts/:logId', authMiddleware, workoutHandlers.updateWorkout);

app.delete('/api/workouts/:logId', authMiddleware, workoutHandlers.deleteWorkout);

}
