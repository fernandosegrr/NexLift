import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma in serverless
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url, method, body } = req;
    const path = url.replace('/api', '');

    try {
        // ==========================================
        // ROUTINES
        // ==========================================

        // POST /api/routines/import
        if (path === '/routines/import' && method === 'POST') {
            const { name, description, days } = body;
            if (!name || !days || !Array.isArray(days)) {
                return res.status(400).json({ error: 'Invalid JSON structure' });
            }

            const routine = await prisma.routine.create({
                data: {
                    name,
                    description: description || null,
                    days: {
                        create: days.map((day, dayIndex) => ({
                            dayName: day.dayName,
                            isRestDay: day.isRestDay || false,
                            order: dayIndex,
                            exercises: {
                                create: (day.exercises || []).map((ex, exIndex) => ({
                                    name: ex.name,
                                    targetSets: ex.sets || 3,
                                    targetReps: ex.reps || '8-12',
                                    restSeconds: ex.rest || null,
                                    note: ex.note || null,
                                    order: exIndex
                                }))
                            }
                        }))
                    }
                },
                include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
            });
            return res.status(201).json({ message: 'Routine imported!', routine });
        }

        // GET /api/routines/active
        if (path === '/routines/active' && method === 'GET') {
            const routine = await prisma.routine.findFirst({
                where: { isActive: true },
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
            return res.json(routine);
        }

        // GET /api/routines
        if (path === '/routines' && method === 'GET') {
            const routines = await prisma.routine.findMany({
                include: {
                    days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } }
                },
                orderBy: { createdAt: 'desc' }
            });
            return res.json(routines);
        }

        // GET /api/routines/:id
        const routineMatch = path.match(/^\/routines\/([^/]+)$/);
        if (routineMatch && method === 'GET') {
            const routine = await prisma.routine.findUnique({
                where: { id: routineMatch[1] },
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
            return res.json(routine);
        }

        // PUT /api/routines/:id/activate
        const activateMatch = path.match(/^\/routines\/([^/]+)\/activate$/);
        if (activateMatch && method === 'PUT') {
            await prisma.routine.updateMany({ where: { isActive: true }, data: { isActive: false } });
            const routine = await prisma.routine.update({
                where: { id: activateMatch[1] },
                data: { isActive: true },
                include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
            });
            return res.json({ message: 'Activated!', routine });
        }

        // PUT /api/routines/:id - Update routine structure
        const updateMatch = path.match(/^\/routines\/([^/]+)$/);
        if (updateMatch && method === 'PUT') {
            const routineId = updateMatch[1];
            const { name, description, days } = body;

            // 1. Update basic info
            await prisma.routine.update({
                where: { id: routineId },
                data: { name, description }
            });

            // 2. Handle Days
            // Get existing days to know what to delete
            const existingDays = await prisma.routineDay.findMany({
                where: { routineId },
                select: { id: true }
            });
            const incomingDayIds = days.filter(d => d.id).map(d => d.id);
            const daysToDelete = existingDays.filter(d => !incomingDayIds.includes(d.id)).map(d => d.id);

            // Delete removed days
            if (daysToDelete.length > 0) {
                await prisma.routineDay.deleteMany({ where: { id: { in: daysToDelete } } });
            }

            // Upsert days (Update or Create)
            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                let dayId = day.id;

                if (dayId) {
                    await prisma.routineDay.update({
                        where: { id: dayId },
                        data: {
                            dayName: day.dayName,
                            isRestDay: day.isRestDay || false,
                            order: i
                        }
                    });
                } else {
                    const newDay = await prisma.routineDay.create({
                        data: {
                            routineId,
                            dayName: day.dayName,
                            isRestDay: day.isRestDay || false,
                            order: i
                        }
                    });
                    dayId = newDay.id;
                }

                // 3. Handle Exercises for this Day
                if (day.exercises && Array.isArray(day.exercises)) {
                    const existingExercises = await prisma.exercise.findMany({
                        where: { routineDayId: dayId },
                        select: { id: true }
                    });
                    const incomingExIds = day.exercises.filter(e => e.id).map(e => e.id);
                    const exToDelete = existingExercises.filter(e => !incomingExIds.includes(e.id)).map(e => e.id);

                    if (exToDelete.length > 0) {
                        await prisma.exercise.deleteMany({ where: { id: { in: exToDelete } } });
                    }

                    for (let j = 0; j < day.exercises.length; j++) {
                        const ex = day.exercises[j];
                        if (ex.id) {
                            await prisma.exercise.update({
                                where: { id: ex.id },
                                data: {
                                    name: ex.name,
                                    targetSets: parseInt(ex.targetSets),
                                    targetReps: ex.targetReps,
                                    restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                    note: ex.note,
                                    order: j
                                }
                            });
                        } else {
                            await prisma.exercise.create({
                                data: {
                                    routineDayId: dayId,
                                    name: ex.name,
                                    targetSets: parseInt(ex.targetSets || 3),
                                    targetReps: ex.targetReps || '8-12',
                                    restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                    note: ex.note,
                                    order: j
                                }
                            });
                        }
                    }
                }
            }

            const updatedRoutine = await prisma.routine.findUnique({
                where: { id: routineId },
                include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
            });

            return res.json(updatedRoutine);
        }

        // DELETE /api/routines/:id
        if (routineMatch && method === 'DELETE') {
            await prisma.routine.delete({ where: { id: routineMatch[1] } });
            return res.json({ message: 'Deleted' });
        }

        // ==========================================
        // EXERCISES
        // ==========================================

        // GET /api/exercises
        if (path === '/exercises' && method === 'GET') {
            const exercises = await prisma.exercise.findMany({
                select: { id: true, name: true, muscleGroup: true },
                distinct: ['name']
            });
            return res.json(exercises);
        }

        // PUT /api/exercises/:id/muscle
        const exMuscleMatch = path.match(/^\/exercises\/([^/]+)\/muscle$/);
        if (exMuscleMatch && method === 'PUT') {
            const { muscleGroup } = body;
            const exercise = await prisma.exercise.update({
                where: { id: exMuscleMatch[1] },
                data: { muscleGroup }
            });
            await prisma.exercise.updateMany({
                where: { name: exercise.name },
                data: { muscleGroup }
            });
            return res.json({ message: 'Updated', exercise });
        }

        // ==========================================
        // WORKOUTS
        // ==========================================

        // POST /api/workouts/log
        if (path === '/workouts/log' && method === 'POST') {
            const { exerciseId, sets, notes } = body;
            if (!exerciseId || !sets) {
                return res.status(400).json({ error: 'Missing data' });
            }

            const workoutLog = await prisma.workoutLog.create({
                data: {
                    exerciseId,
                    notes: notes || null,
                    sets: {
                        create: sets.map((set, i) => ({
                            setNumber: i + 1,
                            weight: set.weight,
                            reps: set.reps,
                            rpe: set.rpe || null,
                            completed: true
                        }))
                    }
                },
                include: { sets: true, exercise: true }
            });

            // Update PR
            const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
            if (exercise) {
                for (const set of sets) {
                    const est1RM = set.weight * (36 / (37 - set.reps));
                    const existingPR = await prisma.personalRecord.findFirst({
                        where: { exerciseName: exercise.name.toLowerCase() },
                        orderBy: { estimated1RM: 'desc' }
                    });
                    if (!existingPR || est1RM > (existingPR.estimated1RM || 0)) {
                        await prisma.personalRecord.create({
                            data: { exerciseName: exercise.name.toLowerCase(), weight: set.weight, reps: set.reps, estimated1RM: est1RM }
                        });
                    }
                }
            }

            return res.status(201).json({ message: 'Logged!', workoutLog });
        }

        // POST /api/workouts/log-rest
        if (path === '/workouts/log-rest' && method === 'POST') {
            const { note } = body;
            const restLog = await prisma.restLog.create({
                data: { note: note || 'Día de descanso' }
            });
            return res.status(201).json({ message: 'Rest logged!', restLog });
        }

        // GET /api/workouts/history
        if (path === '/workouts/history' && method === 'GET') {
            const logs = await prisma.workoutLog.findMany({
                include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true },
                orderBy: { date: 'desc' },
                take: 30
            });
            return res.json(logs);
        }

        // GET /api/workouts/exercise/:id/history
        const exHistoryMatch = path.match(/^\/workouts\/exercise\/([^/]+)\/history$/);
        if (exHistoryMatch && method === 'GET') {
            const logs = await prisma.workoutLog.findMany({
                where: { exerciseId: exHistoryMatch[1] },
                include: { sets: { orderBy: { setNumber: 'asc' } } },
                orderBy: { date: 'desc' },
                take: 20
            });
            return res.json(logs);
        }

        // ==========================================
        // STATS
        // ==========================================

        // GET /api/stats/overview
        if (path === '/stats/overview' && method === 'GET') {
            const totalWorkouts = await prisma.workoutLog.count();
            const totalRoutines = await prisma.routine.count();
            const totalPRs = await prisma.personalRecord.count();

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentWorkouts = await prisma.workoutLog.findMany({
                where: { date: { gte: thirtyDaysAgo } },
                select: { date: true }
            });
            const recentRestLogs = await prisma.restLog.findMany({
                where: { date: { gte: thirtyDaysAgo } },
                select: { date: true }
            });

            const uniqueDays = new Set([
                ...recentWorkouts.map(w => w.date.toISOString().split('T')[0]),
                ...recentRestLogs.map(r => r.date.toISOString().split('T')[0])
            ]);

            let streak = 0;
            const today = new Date();
            for (let i = 0; i < 30; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(checkDate.getDate() - i);
                const dateStr = checkDate.toISOString().split('T')[0];
                if (uniqueDays.has(dateStr)) streak++;
                else if (i > 0) break;
            }

            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekSets = await prisma.setLog.findMany({
                where: { workoutLog: { date: { gte: weekAgo } } }
            });
            const weeklyVolume = weekSets.reduce((acc, s) => acc + (s.weight * s.reps), 0);

            return res.json({
                totalWorkouts, totalRoutines, totalPRs,
                currentStreak: streak,
                trainingDaysLast30: uniqueDays.size,
                weeklyVolume: Math.round(weeklyVolume)
            });
        }

        // GET /api/stats/consistency
        if (path === '/stats/consistency' && method === 'GET') {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const workouts = await prisma.workoutLog.findMany({
                where: { date: { gte: ninetyDaysAgo } },
                select: { date: true }
            });
            const restLogs = await prisma.restLog.findMany({
                where: { date: { gte: ninetyDaysAgo } },
                select: { date: true }
            });

            // Return raw timestamps for frontend processing (Timezone fix)
            const allEvents = [
                ...workouts.map(w => w.date),
                ...restLogs.map(r => r.date)
            ];

            return res.json({ events: allEvents });
        }

        // GET /api/stats/prs
        if (path === '/stats/prs' && method === 'GET') {
            const allPRs = await prisma.personalRecord.findMany({ orderBy: { date: 'desc' } });
            const byEx = {};
            allPRs.forEach(pr => {
                if (!byEx[pr.exerciseName] || (pr.estimated1RM || 0) > (byEx[pr.exerciseName].estimated1RM || 0)) {
                    byEx[pr.exerciseName] = pr;
                }
            });
            return res.json(Object.values(byEx));
        }

        // GET /api/stats/progress/:name
        const progressMatch = path.match(/^\/stats\/progress\/(.+)$/);
        if (progressMatch && method === 'GET') {
            const name = decodeURIComponent(progressMatch[1]);
            const logs = await prisma.workoutLog.findMany({
                where: { exercise: { name: { contains: name, mode: 'insensitive' } } },
                include: { sets: { orderBy: { setNumber: 'asc' } } },
                orderBy: { date: 'asc' },
                take: 50
            });

            const data = logs.map(log => {
                const maxSet = log.sets.reduce((max, s) => {
                    const e = s.weight * (36 / (37 - s.reps));
                    return e > max.e ? { ...s, e } : max;
                }, { e: 0 });
                return {
                    date: log.date,
                    maxWeight: Math.max(...log.sets.map(s => s.weight)),
                    estimated1RM: Math.round(maxSet.e * 10) / 10,
                    totalVolume: log.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
                };
            });
            return res.json(data);
        }

        // GET /api/stats/routine/:id
        const routineStatsMatch = path.match(/^\/stats\/routine\/([^/]+)$/);
        if (routineStatsMatch && method === 'GET') {
            const routine = await prisma.routine.findUnique({
                where: { id: routineStatsMatch[1] },
                include: {
                    days: {
                        include: {
                            exercises: { include: { workoutLogs: { include: { sets: true } } } }
                        }
                    }
                }
            });
            if (!routine) return res.status(404).json({ error: 'Not found' });

            let totalSessions = 0, totalVolume = 0, exerciseCount = 0;
            routine.days.forEach(d => {
                d.exercises.forEach(e => {
                    exerciseCount++;
                    e.workoutLogs.forEach(l => {
                        totalSessions++;
                        l.sets.forEach(s => totalVolume += s.weight * s.reps);
                    });
                });
            });

            return res.json({ routineId: routine.id, routineName: routine.name, totalSessions, totalVolume: Math.round(totalVolume), exerciseCount });
        }

        // GET /api/health
        if (path === '/health' && method === 'GET') {
            return res.json({ status: 'ok', timestamp: new Date().toISOString() });
        }

        // 404
        return res.status(404).json({ error: 'Not found', path });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
