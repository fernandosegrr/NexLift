import { trainingLoadVolume } from '../../generated/training.cjs';
import { mexicoCityDateStr } from '../../logic.js';
import { mexicoCityDayBounds } from '../../logic.js';
import { dayOfWeekFromDateStr } from '../../logic.js';
import { getActiveBlock } from '../../logic.js';
import { currentWeekInBlock } from '../../logic.js';
import { getRoutinePhaseStatus } from '../../logic.js';
import { detectPlateauForExercise } from '../../logic.js';
import { scheduledRestWeekdays } from '../../logic.js';
import { setPrivateCache } from '../../app/cache.js';

export function registerRoutes(app, { prisma, authMiddleware, resolveOrGenerateAiRoutineDay, HISTORY_SESSIONS_WINDOW , console }) {
app.get('/api/stats/routine/:id', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId },
            include: {
                days: {
                    include: {
                        exercises: {
                            include: {
                                workoutLogs: {
                                    include: { sets: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // Calculate stats for this routine
        let totalSessions = 0;
        let totalVolume = 0;
        let exerciseCount = 0;
        const exerciseProgress = {};

        routine.days.forEach(day => {
            day.exercises.forEach(exercise => {
                exerciseCount++;
                exercise.workoutLogs.forEach(log => {
                    totalSessions++;
                    log.sets.forEach(set => {
                        totalVolume += set.weight * set.reps;
                    });

                    // Track progress per exercise
                    if (!exerciseProgress[exercise.name]) {
                        exerciseProgress[exercise.name] = [];
                    }
                    const maxWeight = Math.max(...log.sets.map(s => s.weight));
                    exerciseProgress[exercise.name].push({
                        date: log.date,
                        maxWeight
                    });
                });
            });
        });

        res.json({
            routineId: routine.id,
            routineName: routine.name,
            totalSessions,
            totalVolume: Math.round(totalVolume),
            exerciseCount,
            exerciseProgress
        });
    } catch (error) {
        console.error('Error fetching routine stats:', error);
        res.status(500).json({ error: 'Failed to fetch routine stats' });
    }
});

app.get('/api/stats/overview', authMiddleware, async (req, res) => {
    try {
        const todayBounds = mexicoCityDayBounds();
        const thirtyDaysAgo = new Date(todayBounds.start.getTime() - 30 * 24 * 60 * 60 * 1000);
        const yearAgo = new Date(todayBounds.start.getTime() - 365 * 24 * 60 * 60 * 1000);
        const weekAgo = new Date(todayBounds.start.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgoStr = mexicoCityDateStr(thirtyDaysAgo);

        const [totalWorkouts, totalRoutines, totalPRs, recentWorkouts, recentRestLogs, activeRoutine, weekSets] = await Promise.all([
            prisma.workoutLog.count({
                where: { exercise: { routineDay: { routine: { userId: req.userId } } } }
            }),
            prisma.routine.count({
                where: { userId: req.userId }
            }),
            prisma.personalRecord.count({
                where: { userId: req.userId }
            }),
            prisma.workoutLog.findMany({
                where: {
                    date: { gte: yearAgo },
                    exercise: { routineDay: { routine: { userId: req.userId } } }
                },
                select: { date: true }
            }),
            prisma.restLog.findMany({
                where: {
                    date: { gte: yearAgo },
                    userId: req.userId
                },
                select: { date: true }
            }),
            // Active routine: solo isRestDay/weekday para la racha (no ejercicios)
            prisma.routine.findFirst({
                where: { userId: req.userId, isActive: true },
                select: {
                    id: true,
                    days: {
                        orderBy: { order: 'asc' },
                        select: { isRestDay: true, weekday: true }
                    }
                }
            }),
            prisma.setLog.findMany({
                where: {
                    workoutLog: {
                        date: { gte: weekAgo },
                        exercise: { routineDay: { routine: { userId: req.userId } } }
                    }
                },
                select: { weight: true, reps: true, weightRight: true, repsRight: true }
            })
        ]);

        // Días con actividad real registrada (fuerza o descanso logueado) — día calendario CDMX
        const uniqueDays = new Set([
            ...recentWorkouts.map(w => mexicoCityDateStr(w.date)),
            ...recentRestLogs.map(r => mexicoCityDateStr(r.date))
        ]);

        let trainingDaysLast30 = 0;
        for (const d of uniqueDays) {
            if (d >= thirtyDaysAgoStr) trainingDaysLast30++;
        }

        const restDaySet = scheduledRestWeekdays(activeRoutine?.days);

        // Calculate current streak (up to 365 days)
        // Scheduled rest days count as streak continuity automatically
        let streak = 0;
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(todayBounds.start.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = mexicoCityDateStr(checkDate);
            const dayOfWeek = dayOfWeekFromDateStr(dateStr);

            if (uniqueDays.has(dateStr)) {
                streak++;
            } else if (restDaySet.has(dayOfWeek)) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }

        const weeklyVolume = trainingLoadVolume(weekSets, 'recorded-sides');

        setPrivateCache(res, 30);
        res.json({
            totalWorkouts,
            totalRoutines,
            totalPRs,
            currentStreak: streak,
            trainingDaysLast30,
            weeklyVolume: Math.round(weeklyVolume)
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

app.get('/api/stats/consistency', authMiddleware, async (req, res) => {
    try {
        const threeSixtyFiveDaysAgo = new Date(mexicoCityDayBounds().start.getTime() - 365 * 24 * 60 * 60 * 1000);

        const [workouts, restLogs] = await Promise.all([
            prisma.workoutLog.findMany({
                where: {
                    date: { gte: threeSixtyFiveDaysAgo },
                    exercise: { routineDay: { routine: { userId: req.userId } } }
                },
                select: { date: true }
            }),
            prisma.restLog.findMany({
                where: {
                    date: { gte: threeSixtyFiveDaysAgo },
                    userId: req.userId
                },
                select: { date: true }
            })
        ]);

        const allEvents = [
            ...workouts.map(w => w.date),
            ...restLogs.map(r => r.date)
        ];

        const consistencyCounts = {};
        for (const w of workouts) {
            const key = mexicoCityDateStr(w.date);
            consistencyCounts[key] = (consistencyCounts[key] || 0) + 1;
        }
        for (const r of restLogs) {
            const key = mexicoCityDateStr(r.date);
            if (!consistencyCounts[key]) consistencyCounts[key] = 1;
        }

        const consistencyDays = Object.keys(consistencyCounts).sort();

        res.json({ events: allEvents, consistencyDays, consistencyCounts });
    } catch (error) {
        console.error('Error fetching consistency:', error);
        res.status(500).json({ error: 'Failed to fetch consistency data' });
    }
});

app.get('/api/stats/progress/:exerciseName', authMiddleware, async (req, res) => {
    try {
        const exerciseName = decodeURIComponent(req.params.exerciseName);

        const logs = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { contains: exerciseName, mode: 'insensitive' },
                    routineDay: { routine: { userId: req.userId } }
                }
            },
            include: {
                sets: { orderBy: { setNumber: 'asc' } }
            },
            orderBy: { date: 'asc' },
            take: 50
        });

        // Calculate max weight and estimated 1RM per session
        const progressData = logs.map(log => {
            const maxSet = log.sets.reduce((max, set) => {
                // Epley formula with safety check
                let est1RM = set.weight;
                if (set.reps > 1 && set.reps < 37) {
                    est1RM = set.weight * (1 + set.reps / 30);
                }
                return est1RM > max.est1RM ? { ...set, est1RM } : max;
            }, { est1RM: 0 });

            return {
                date: log.date,
                maxWeight: Math.max(...log.sets.map(s => s.weight)),
                estimated1RM: Math.round(maxSet.est1RM * 10) / 10,
                totalVolume: log.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0)
            };
        });

        res.json(progressData);
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: 'Failed to fetch progress data' });
    }
});

app.get('/api/stats/prs', authMiddleware, async (req, res) => {
    try {
        // Get best PR for each exercise FOR THIS USER
        const allPRs = await prisma.personalRecord.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' }
        });

        // Group by exercise and get the best one
        const prsByExercise = {};
        allPRs.forEach(pr => {
            if (!prsByExercise[pr.exerciseName] ||
                (pr.estimated1RM || 0) > (prsByExercise[pr.exerciseName].estimated1RM || 0)) {
                prsByExercise[pr.exerciseName] = pr;
            }
        });

        setPrivateCache(res, 45);
        res.json(Object.values(prsByExercise).sort((a, b) => b.weight - a.weight));
    } catch (error) {
        console.error('Error fetching PRs:', error);
        res.status(500).json({ error: 'Failed to fetch PRs' });
    }
});

app.get('/api/stats/home', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId;
        const todayBounds = mexicoCityDayBounds();
        const thirtyDaysAgo = new Date(todayBounds.start.getTime() - 30 * 24 * 60 * 60 * 1000);
        const yearAgo = new Date(todayBounds.start.getTime() - 365 * 24 * 60 * 60 * 1000);
        const weekAgo = new Date(todayBounds.start.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgoStr = mexicoCityDateStr(thirtyDaysAgo);
        const todayStr = todayBounds.dateStr;

        const exerciseScope = { exercise: { routineDay: { routine: { userId } } } };

        const [
            totalWorkouts,
            totalRoutines,
            totalPRs,
            recentWorkouts,
            recentRestLogs,
            weekSets,
            allPRs,
            plateauLogs,
            activeMeta,
            todayBodyLogs
        ] = await Promise.all([
            prisma.workoutLog.count({ where: exerciseScope }),
            prisma.routine.count({ where: { userId } }),
            prisma.personalRecord.count({ where: { userId } }),
            prisma.workoutLog.findMany({
                where: { date: { gte: yearAgo }, ...exerciseScope },
                select: { date: true }
            }),
            prisma.restLog.findMany({
                where: { date: { gte: yearAgo }, userId },
                select: { date: true }
            }),
            prisma.setLog.findMany({
                where: {
                    workoutLog: { date: { gte: weekAgo }, ...exerciseScope }
                },
                select: { weight: true, reps: true, weightRight: true, repsRight: true }
            }),
            prisma.personalRecord.findMany({
                where: { userId },
                orderBy: { date: 'desc' },
                select: {
                    id: true,
                    exerciseName: true,
                    weight: true,
                    reps: true,
                    estimated1RM: true,
                    date: true
                }
            }),
            // Logs para plateau — solo weight/reps/date/name. Ventana por ejercicio
            // se recorta a HISTORY_SESSIONS_WINDOW al agrupar (abajo).
            prisma.workoutLog.findMany({
                where: exerciseScope,
                orderBy: { date: 'desc' },
                take: 200,
                select: {
                    date: true,
                    exercise: { select: { name: true } },
                    sets: {
                        select: { weight: true, reps: true, weightRight: true, repsRight: true }
                    }
                }
            }),
            prisma.routine.findFirst({
                where: { userId, isActive: true },
                select: { id: true, source: true, name: true, adaptiveDeloadUntil: true, lastAdaptiveCheckAt: true }
            }),
            prisma.bodyLog.findMany({
                where: { userId, date: { gte: todayBounds.start, lt: todayBounds.end } },
                select: { creatineTaken: true, dietCompliant: true, zeroLiquidCalories: true }
            })
        ]);

        // PRs best-per-exercise
        const prsByExercise = {};
        for (const pr of allPRs) {
            const key = pr.exerciseName;
            if (!prsByExercise[key] || (pr.estimated1RM || 0) > (prsByExercise[key].estimated1RM || 0)) {
                prsByExercise[key] = pr;
            }
        }
        const prs = Object.values(prsByExercise).sort((a, b) => b.weight - a.weight);

        // Agrupar por nombre (minúsculas), quedarse con las últimas N sesiones/ejercicio
        const logsByName = new Map();
        for (const log of plateauLogs) {
            const name = (log.exercise?.name || '').toLowerCase();
            if (!name) continue;
            if (!logsByName.has(name)) logsByName.set(name, []);
            const arr = logsByName.get(name);
            if (arr.length < HISTORY_SESSIONS_WINDOW) arr.push(log);
        }
        let plateauCount = 0;
        for (const pr of prs) {
            const key = (pr.exerciseName || '').toLowerCase();
            const logs = logsByName.get(key);
            if (logs && detectPlateauForExercise(logs)) plateauCount++;
        }

        // Active routine LITE — sin workoutLogs anidados (eran el grueso del payload)
        let activeRoutine = null;
        let aiTodayDay = null;
        if (activeMeta) {
            const exerciseSelect = {
                orderBy: { order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    muscleGroup: true,
                    targetSets: true,
                    targetReps: true,
                    restSeconds: true,
                    isUnilateral: true,
                    order: true,
                    note: true
                }
            };
            const daySelect = {
                select: {
                    id: true,
                    dayName: true,
                    isRestDay: true,
                    weekday: true,
                    order: true,
                    splitLabel: true,
                    exercises: exerciseSelect
                },
                orderBy: activeMeta.source === 'ai' ? { dayName: 'desc' } : { order: 'asc' },
                ...(activeMeta.source === 'ai' ? { take: 7 } : {})
            };
            const full = await prisma.routine.findUnique({
                where: { id: activeMeta.id },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    isActive: true,
                    source: true,
                    adaptiveDeloadUntil: true,
                    lastAdaptiveCheckAt: true,
                    days: daySelect,
                    blocks: { orderBy: { order: 'asc' } }
                }
            });
            if (full) {
                const activeBlock = getActiveBlock(full.blocks);
                const phaseStatus = getRoutinePhaseStatus(full);
                activeRoutine = {
                    ...full,
                    activeBlock,
                    currentWeek: currentWeekInBlock(activeBlock),
                    isDeload: phaseStatus.isDeload,
                    phase: phaseStatus.phase
                };
                if (full.source === 'ai') {
                    try {
                        const profile = await prisma.trainingProfile.findUnique({ where: { userId } });
                        if (profile) {
                            aiTodayDay = await resolveOrGenerateAiRoutineDay(
                                { ...full, userId },
                                profile
                            );
                        }
                    } catch (e) {
                        console.error('home aiToday:', e.message);
                        aiTodayDay = null;
                    }
                }
            }
        }

        // Racha + consistency (días con actividad REAL en calendario CDMX, sin inyectar
        // 365 descansos pasados artificiales)
        const restDaySet = scheduledRestWeekdays(activeRoutine?.days);

        const consistencyCounts = {};
        for (const w of recentWorkouts) {
            const key = mexicoCityDateStr(w.date);
            consistencyCounts[key] = (consistencyCounts[key] || 0) + 1;
        }
        for (const r of recentRestLogs) {
            const key = mexicoCityDateStr(r.date);
            if (!consistencyCounts[key]) consistencyCounts[key] = 1;
        }

        const uniqueDays = new Set(Object.keys(consistencyCounts));
        const consistencyDays = [...uniqueDays].sort();

        let trainingDaysLast30 = 0;
        for (const d of uniqueDays) {
            if (d >= thirtyDaysAgoStr) trainingDaysLast30++;
        }

        let streak = 0;
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(todayBounds.start.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = mexicoCityDateStr(checkDate);
            const dayOfWeek = dayOfWeekFromDateStr(dateStr);
            if (uniqueDays.has(dateStr)) streak++;
            else if (restDaySet.has(dayOfWeek)) streak++;
            else if (i > 0) break;
        }

        const weeklyVolume = Math.round(trainingLoadVolume(weekSets, 'recorded-sides'));

        const todayCheckin = {
            creatineTaken: todayBodyLogs.some(b => !!b.creatineTaken),
            dietCompliant: todayBodyLogs.some(b => !!b.dietCompliant),
            zeroLiquidCalories: todayBodyLogs.some(b => !!b.zeroLiquidCalories)
        };

        setPrivateCache(res, 20);
        res.json({
            stats: {
                totalWorkouts,
                totalRoutines,
                totalPRs,
                currentStreak: streak,
                trainingDaysLast30,
                weeklyVolume,
                maxPRWeight: prs.reduce((m, p) => Math.max(m, p.weight || 0), 0)
            },
            consistencyDays,
            consistencyCounts,
            prs,
            plateauCount,
            activeRoutine,
            aiTodayDay,
            todayStr,
            todayLogged: uniqueDays.has(todayStr),
            todayCheckin
        });
    } catch (error) {
        console.error('Error fetching home stats:', error);
        res.status(500).json({ error: 'Failed to fetch home' });
    }
});

app.get('/api/stats/plateaus', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId;
        const exerciseScope = { exercise: { routineDay: { routine: { userId } } } };
        const [allPRs, plateauLogs] = await Promise.all([
            prisma.personalRecord.findMany({
                where: { userId },
                select: { exerciseName: true, estimated1RM: true }
            }),
            prisma.workoutLog.findMany({
                where: exerciseScope,
                orderBy: { date: 'desc' },
                take: 200,
                select: {
                    date: true,
                    exercise: { select: { name: true } },
                    sets: {
                        select: { weight: true, reps: true, weightRight: true, repsRight: true }
                    }
                }
            })
        ]);

        const prsByExercise = {};
        for (const pr of allPRs) {
            const key = pr.exerciseName;
            if (!prsByExercise[key] || (pr.estimated1RM || 0) > (prsByExercise[key].estimated1RM || 0)) {
                prsByExercise[key] = pr;
            }
        }

        const logsByName = new Map();
        for (const log of plateauLogs) {
            const name = (log.exercise?.name || '').toLowerCase();
            if (!name) continue;
            if (!logsByName.has(name)) logsByName.set(name, []);
            const arr = logsByName.get(name);
            if (arr.length < HISTORY_SESSIONS_WINDOW) arr.push(log);
        }

        const plateaued = [];
        for (const pr of Object.values(prsByExercise)) {
            const key = (pr.exerciseName || '').toLowerCase();
            const logs = logsByName.get(key);
            if (logs && detectPlateauForExercise(logs)) {
                plateaued.push(key);
            }
        }

        setPrivateCache(res, 60);
        res.json({
            plateaued,
            plateauCount: plateaued.length,
            window: HISTORY_SESSIONS_WINDOW
        });
    } catch (error) {
        console.error('Error fetching plateaus:', error);
        res.status(500).json({ error: 'Failed to fetch plateaus' });
    }
});

app.get('/api/stats/progress-page', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId;
        const todayBounds = mexicoCityDayBounds();
        const thirtyDaysAgo = new Date(todayBounds.start.getTime() - 30 * 24 * 60 * 60 * 1000);
        const yearAgo = new Date(todayBounds.start.getTime() - 365 * 24 * 60 * 60 * 1000);
        const weekAgo = new Date(todayBounds.start.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgoStr = mexicoCityDateStr(thirtyDaysAgo);
        const exerciseScope = { exercise: { routineDay: { routine: { userId } } } };

        const [
            totalWorkouts,
            totalRoutines,
            totalPRs,
            recentWorkouts,
            recentRestLogs,
            weekSets,
            allPRs,
            plateauLogs,
            activeRoutine,
            exerciseRows
        ] = await Promise.all([
            prisma.workoutLog.count({ where: exerciseScope }),
            prisma.routine.count({
                where: { userId, name: { not: 'ARCHIVED_HISTORY_DO_NOT_DELETE' } }
            }),
            prisma.personalRecord.count({ where: { userId } }),
            prisma.workoutLog.findMany({
                where: { date: { gte: yearAgo }, ...exerciseScope },
                select: { date: true }
            }),
            prisma.restLog.findMany({
                where: { date: { gte: yearAgo }, userId },
                select: { date: true }
            }),
            prisma.setLog.findMany({
                where: {
                    workoutLog: { date: { gte: weekAgo }, ...exerciseScope }
                },
                select: { weight: true, reps: true, weightRight: true, repsRight: true }
            }),
            prisma.personalRecord.findMany({
                where: { userId },
                orderBy: { date: 'desc' },
                select: {
                    id: true,
                    exerciseName: true,
                    weight: true,
                    reps: true,
                    estimated1RM: true,
                    date: true
                }
            }),
            prisma.workoutLog.findMany({
                where: exerciseScope,
                orderBy: { date: 'desc' },
                take: 200,
                select: {
                    date: true,
                    exercise: { select: { name: true } },
                    sets: {
                        select: { weight: true, reps: true, weightRight: true, repsRight: true }
                    }
                }
            }),
            prisma.routine.findFirst({
                where: { userId, isActive: true },
                select: {
                    days: {
                        orderBy: { order: 'asc' },
                        select: { isRestDay: true, weekday: true }
                    }
                }
            }),
            // Solo nombres/músculos — NO el árbol completo de rutinas
            prisma.exercise.findMany({
                where: {
                    routineDay: {
                        routine: {
                            userId,
                            name: { not: 'ARCHIVED_HISTORY_DO_NOT_DELETE' }
                        }
                    }
                },
                select: { name: true, muscleGroup: true },
                orderBy: { name: 'asc' }
            })
        ]);

        const prsByExercise = {};
        for (const pr of allPRs) {
            const key = pr.exerciseName;
            if (!prsByExercise[key] || (pr.estimated1RM || 0) > (prsByExercise[key].estimated1RM || 0)) {
                prsByExercise[key] = pr;
            }
        }
        const prs = Object.values(prsByExercise).sort((a, b) => (b.weight || 0) - (a.weight || 0));

        const logsByName = new Map();
        for (const log of plateauLogs) {
            const name = (log.exercise?.name || '').toLowerCase();
            if (!name) continue;
            if (!logsByName.has(name)) logsByName.set(name, []);
            const arr = logsByName.get(name);
            if (arr.length < HISTORY_SESSIONS_WINDOW) arr.push(log);
        }
        const plateaued = [];
        for (const pr of prs) {
            const key = (pr.exerciseName || '').toLowerCase();
            const logs = logsByName.get(key);
            if (logs && detectPlateauForExercise(logs)) plateaued.push(key);
        }

        const consistencyCounts = {};
        for (const w of recentWorkouts) {
            const key = mexicoCityDateStr(w.date);
            consistencyCounts[key] = (consistencyCounts[key] || 0) + 1;
        }
        for (const r of recentRestLogs) {
            const key = mexicoCityDateStr(r.date);
            if (!consistencyCounts[key]) consistencyCounts[key] = 1;
        }

        const uniqueDays = new Set(Object.keys(consistencyCounts));
        let trainingDaysLast30 = 0;
        for (const d of uniqueDays) {
            if (d >= thirtyDaysAgoStr) trainingDaysLast30++;
        }

        const restDaySet = scheduledRestWeekdays(activeRoutine?.days);

        let streak = 0;
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(todayBounds.start.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = mexicoCityDateStr(checkDate);
            const dayOfWeek = dayOfWeekFromDateStr(dateStr);
            if (uniqueDays.has(dateStr)) streak++;
            else if (restDaySet.has(dayOfWeek)) streak++;
            else if (i > 0) break;
        }

        const weeklyVolume = Math.round(
            trainingLoadVolume(weekSets, 'recorded-sides')
        );

        // Dedupe ejercicios por nombre (case-insensitive)
        const exerciseMap = new Map();
        for (const ex of exerciseRows) {
            const key = (ex.name || '').toLowerCase();
            if (!key || exerciseMap.has(key)) continue;
            exerciseMap.set(key, {
                name: ex.name,
                muscleGroup: ex.muscleGroup || null
            });
        }
        for (const pr of prs) {
            const key = (pr.exerciseName || '').toLowerCase();
            if (key && !exerciseMap.has(key)) {
                exerciseMap.set(key, { name: pr.exerciseName, muscleGroup: null });
            }
        }
        const exercises = [...exerciseMap.values()]
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

        // consistencyDays: lista compacta de YYYY-MM-DD (no ISO timestamps)
        const consistencyDays = [...uniqueDays].sort();

        setPrivateCache(res, 25);
        res.json({
            stats: {
                totalWorkouts,
                totalRoutines,
                totalPRs,
                currentStreak: streak,
                trainingDaysLast30,
                weeklyVolume
            },
            consistencyDays,
            consistencyCounts,
            prs,
            plateaued,
            plateauCount: plateaued.length,
            exercises
        });
    } catch (error) {
        console.error('Error fetching progress bundle:', error);
        res.status(500).json({ error: 'Failed to fetch progress' });
    }
});

}
