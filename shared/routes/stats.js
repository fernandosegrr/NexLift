/**
 * Stats routes factory
 * @param {PrismaClient} prisma
 */
export function createStatsRoutes(prisma) {
    return {
        /**
         * GET /api/stats/overview
         */
        async getOverview(req, res) {
            try {
                const userId = req.userId;

                const totalWorkouts = await prisma.workoutLog.count({
                    where: { exercise: { routineDay: { routine: { userId } } } }
                });
                const totalRoutines = await prisma.routine.count({
                    where: { userId }
                });
                const totalPRs = await prisma.personalRecord.count({
                    where: { userId }
                });

                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const recentWorkouts = await prisma.workoutLog.findMany({
                    where: {
                        date: { gte: thirtyDaysAgo },
                        exercise: { routineDay: { routine: { userId } } }
                    },
                    select: { date: true }
                });
                const recentRestLogs = await prisma.restLog.findMany({
                    where: {
                        date: { gte: thirtyDaysAgo },
                        userId
                    },
                    select: { date: true }
                });

                const uniqueDays = new Set([
                    ...recentWorkouts.map(w => w.date.toISOString().split('T')[0]),
                    ...recentRestLogs.map(r => r.date.toISOString().split('T')[0])
                ]);

                // Calculate streak
                let streak = 0;
                const today = new Date();
                for (let i = 0; i < 365; i++) {
                    const checkDate = new Date(today);
                    checkDate.setDate(checkDate.getDate() - i);
                    const dateStr = checkDate.toISOString().split('T')[0];
                    if (uniqueDays.has(dateStr)) streak++;
                    else if (i > 0) break;
                }

                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                const weekSets = await prisma.setLog.findMany({
                    where: {
                        workoutLog: {
                            date: { gte: weekAgo },
                            exercise: { routineDay: { routine: { userId } } }
                        }
                    },
                    select: { weight: true, reps: true }
                });
                const weeklyVolume = weekSets.reduce((acc, s) => acc + (s.weight * s.reps), 0);

                res.json({
                    totalWorkouts,
                    totalRoutines,
                    totalPRs,
                    currentStreak: streak,
                    trainingDaysLast30: uniqueDays.size,
                    weeklyVolume: Math.round(weeklyVolume)
                });
            } catch (error) {
                console.error('Error fetching stats overview:', error);
                res.status(500).json({ error: 'Failed to fetch stats' });
            }
        },

        /**
         * GET /api/stats/consistency
         */
        async getConsistency(req, res) {
            try {
                const userId = req.userId;
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

                const workouts = await prisma.workoutLog.findMany({
                    where: {
                        date: { gte: ninetyDaysAgo },
                        exercise: { routineDay: { routine: { userId } } }
                    },
                    select: { date: true }
                });
                const restLogs = await prisma.restLog.findMany({
                    where: {
                        date: { gte: ninetyDaysAgo },
                        userId
                    },
                    select: { date: true }
                });

                const allEvents = [
                    ...workouts.map(w => w.date),
                    ...restLogs.map(r => r.date)
                ];

                res.json({ events: allEvents });
            } catch (error) {
                console.error('Error fetching consistency:', error);
                res.status(500).json({ error: 'Failed to fetch consistency' });
            }
        },

        /**
         * GET /api/stats/prs
         */
        async getPRs(req, res) {
            try {
                const allPRs = await prisma.personalRecord.findMany({
                    where: { userId: req.userId },
                    orderBy: { date: 'desc' }
                });

                const byEx = {};
                allPRs.forEach(pr => {
                    if (!byEx[pr.exerciseName] || (pr.estimated1RM || 0) > (byEx[pr.exerciseName].estimated1RM || 0)) {
                        byEx[pr.exerciseName] = pr;
                    }
                });

                const sortedPRs = Object.values(byEx).sort((a, b) => b.weight - a.weight);
                res.json(sortedPRs);
            } catch (error) {
                console.error('Error fetching PRs:', error);
                res.status(500).json({ error: 'Failed to fetch PRs' });
            }
        },

        /**
         * GET /api/stats/progress/:name
         */
        async getProgress(req, res) {
            try {
                const name = decodeURIComponent(req.params.name);
                const logs = await prisma.workoutLog.findMany({
                    where: {
                        exercise: {
                            name: { contains: name, mode: 'insensitive' },
                            routineDay: { routine: { userId: req.userId } }
                        }
                    },
                    include: { sets: { orderBy: { setNumber: 'asc' } } },
                    orderBy: { date: 'asc' },
                    take: 50
                });

                const data = logs.map(log => {
                    const maxSet = log.sets.reduce((max, s) => {
                        let e = s.weight;
                        if (s.reps > 1 && s.reps < 37) {
                            e = s.weight * (1 + s.reps / 30);
                        }
                        return e > max.e ? { ...s, e } : max;
                    }, { e: 0 });
                    return {
                        date: log.date,
                        maxWeight: Math.max(...log.sets.map(s => s.weight)),
                        estimated1RM: Math.round(maxSet.e * 10) / 10,
                        totalVolume: log.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
                    };
                });
                res.json(data);
            } catch (error) {
                console.error('Error fetching progress:', error);
                res.status(500).json({ error: 'Failed to fetch progress' });
            }
        },

        /**
         * GET /api/stats/routine/:id
         */
        async getRoutineStats(req, res) {
            try {
                const routine = await prisma.routine.findFirst({
                    where: { id: req.params.id, userId: req.userId },
                    include: {
                        days: {
                            include: {
                                exercises: { include: { workoutLogs: { include: { sets: true } } } }
                            }
                        }
                    }
                });

                if (!routine) {
                    return res.status(404).json({ error: 'Routine not found' });
                }

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

                res.json({
                    routineId: routine.id,
                    routineName: routine.name,
                    totalSessions,
                    totalVolume: Math.round(totalVolume),
                    exerciseCount
                });
            } catch (error) {
                console.error('Error fetching routine stats:', error);
                res.status(500).json({ error: 'Failed to fetch routine stats' });
            }
        }
    };
}
