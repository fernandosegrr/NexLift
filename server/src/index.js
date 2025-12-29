import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// ROUTES: Routine Import
// ============================================

// POST /api/routines/import - Import JSON routine
app.post('/api/routines/import', async (req, res) => {
    try {
        const { name, description, days } = req.body;

        // Validate structure
        if (!name || !days || !Array.isArray(days)) {
            return res.status(400).json({
                error: 'Invalid JSON structure. Required: name, days[]'
            });
        }

        // Create routine with nested days and exercises
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
                            create: (day.exercises || []).map((exercise, exIndex) => ({
                                name: exercise.name,
                                targetSets: exercise.sets || 3,
                                targetReps: exercise.reps || '8-12',
                                restSeconds: exercise.rest || null,
                                note: exercise.note || null,
                                order: exIndex
                            }))
                        }
                    }))
                }
            },
            include: {
                days: {
                    include: {
                        exercises: true
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });

        res.status(201).json({
            message: 'Routine imported successfully!',
            routine
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to import routine' });
    }
});

// ============================================
// ROUTES: Routines CRUD
// ============================================

// GET /api/routines - List all routines
app.get('/api/routines', async (req, res) => {
    try {
        const routines = await prisma.routine.findMany({
            include: {
                days: {
                    include: {
                        exercises: true
                    },
                    orderBy: { order: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(routines);
    } catch (error) {
        console.error('Error fetching routines:', error);
        res.status(500).json({ error: 'Failed to fetch routines' });
    }
});

// GET /api/routines/active - Get active routine (MUST be before :id)
app.get('/api/routines/active', async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { isActive: true },
            include: {
                days: {
                    include: {
                        exercises: {
                            include: {
                                workoutLogs: {
                                    include: { sets: true },
                                    orderBy: { date: 'desc' },
                                    take: 1
                                }
                            }
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
});

// GET /api/routines/:id - Get single routine
app.get('/api/routines/:id', async (req, res) => {
    try {
        const routine = await prisma.routine.findUnique({
            where: { id: req.params.id },
            include: {
                days: {
                    include: {
                        exercises: {
                            include: {
                                workoutLogs: {
                                    include: { sets: true },
                                    orderBy: { date: 'desc' },
                                    take: 5
                                }
                            }
                        }
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        res.json(routine);
    } catch (error) {
        console.error('Error fetching routine:', error);
        res.status(500).json({ error: 'Failed to fetch routine' });
    }
});

// DELETE /api/routines/:id - Delete routine
app.delete('/api/routines/:id', async (req, res) => {
    try {
        await prisma.routine.delete({
            where: { id: req.params.id }
        });
        res.json({ message: 'Routine deleted successfully' });
    } catch (error) {
        console.error('Error deleting routine:', error);
        res.status(500).json({ error: 'Failed to delete routine' });
    }
});

// ============================================
// ROUTES: Exercises
// ============================================

// GET /api/exercises - Get all exercises with muscle groups
app.get('/api/exercises', async (req, res) => {
    try {
        const exercises = await prisma.exercise.findMany({
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

// PUT /api/exercises/:id/muscle - Update muscle group
app.put('/api/exercises/:id/muscle', async (req, res) => {
    try {
        const { muscleGroup } = req.body;
        const exercise = await prisma.exercise.update({
            where: { id: req.params.id },
            data: { muscleGroup }
        });

        // Also update all exercises with the same name
        await prisma.exercise.updateMany({
            where: { name: exercise.name },
            data: { muscleGroup }
        });

        res.json({ message: 'Muscle group updated', exercise });
    } catch (error) {
        console.error('Error updating muscle group:', error);
        res.status(500).json({ error: 'Failed to update muscle group' });
    }
});

// PUT /api/routines/:id/activate - Activate a routine
app.put('/api/routines/:id/activate', async (req, res) => {
    try {
        // Deactivate all routines first
        await prisma.routine.updateMany({
            where: { isActive: true },
            data: { isActive: false }
        });

        // Activate the selected routine
        const routine = await prisma.routine.update({
            where: { id: req.params.id },
            data: { isActive: true },
            include: {
                days: {
                    include: { exercises: true },
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

// GET /api/stats/routine/:id - Get stats for a specific routine
app.get('/api/stats/routine/:id', async (req, res) => {
    try {
        const routine = await prisma.routine.findUnique({
            where: { id: req.params.id },
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

// ============================================
// ROUTES: Workout Logging
// ============================================

// POST /api/workouts/log - Log a workout session
app.post('/api/workouts/log', async (req, res) => {
    try {
        const { exerciseId, sets, notes } = req.body;

        if (!exerciseId || !sets || !Array.isArray(sets)) {
            return res.status(400).json({
                error: 'Required: exerciseId, sets[]'
            });
        }

        const workoutLog = await prisma.workoutLog.create({
            data: {
                exerciseId,
                notes: notes || null,
                sets: {
                    create: sets.map((set, index) => ({
                        setNumber: index + 1,
                        weight: set.weight,
                        reps: set.reps,
                        rpe: set.rpe || null,
                        completed: set.completed !== false
                    }))
                }
            },
            include: {
                sets: true,
                exercise: true
            }
        });

        // Check and update PR
        const exercise = await prisma.exercise.findUnique({
            where: { id: exerciseId }
        });

        if (exercise) {
            for (const set of sets) {
                // Calculate estimated 1RM using Brzycki formula
                const estimated1RM = set.weight * (36 / (37 - set.reps));

                // Check if this is a new PR
                const existingPR = await prisma.personalRecord.findFirst({
                    where: { exerciseName: exercise.name.toLowerCase() },
                    orderBy: { estimated1RM: 'desc' }
                });

                if (!existingPR || estimated1RM > (existingPR.estimated1RM || 0)) {
                    await prisma.personalRecord.create({
                        data: {
                            exerciseName: exercise.name.toLowerCase(),
                            weight: set.weight,
                            reps: set.reps,
                            estimated1RM
                        }
                    });
                }
            }
        }

        res.status(201).json({
            message: 'Workout logged successfully!',
            workoutLog
        });
    } catch (error) {
        console.error('Error logging workout:', error);
        res.status(500).json({ error: 'Failed to log workout' });
    }
});

// GET /api/workouts/history - Get workout history
app.get('/api/workouts/history', async (req, res) => {
    try {
        const { exerciseId, limit = 30 } = req.query;

        const where = exerciseId ? { exerciseId } : {};

        const logs = await prisma.workoutLog.findMany({
            where,
            include: {
                sets: { orderBy: { setNumber: 'asc' } },
                exercise: true
            },
            orderBy: { date: 'desc' },
            take: parseInt(limit)
        });

        res.json(logs);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch workout history' });
    }
});

// GET /api/workouts/exercise/:exerciseId/history - Get history for specific exercise
app.get('/api/workouts/exercise/:exerciseId/history', async (req, res) => {
    try {
        const logs = await prisma.workoutLog.findMany({
            where: { exerciseId: req.params.exerciseId },
            include: {
                sets: { orderBy: { setNumber: 'asc' } }
            },
            orderBy: { date: 'desc' },
            take: 20
        });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching exercise history:', error);
        res.status(500).json({ error: 'Failed to fetch exercise history' });
    }
});

// ============================================
// ROUTES: Statistics & Progress
// ============================================

// GET /api/stats/overview - Get overall stats
app.get('/api/stats/overview', async (req, res) => {
    try {
        const totalWorkouts = await prisma.workoutLog.count();
        const totalRoutines = await prisma.routine.count();
        const totalPRs = await prisma.personalRecord.count();

        // Get last 30 days workout count for streak calculation
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentWorkouts = await prisma.workoutLog.findMany({
            where: { date: { gte: thirtyDaysAgo } },
            select: { date: true }
        });

        // Calculate unique training days
        const uniqueDays = new Set(
            recentWorkouts.map(w => w.date.toISOString().split('T')[0])
        );

        // Calculate current streak
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];
            if (uniqueDays.has(dateStr)) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }

        // Get volume this week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const weekSets = await prisma.setLog.findMany({
            where: {
                workoutLog: { date: { gte: weekAgo } }
            }
        });

        const weeklyVolume = weekSets.reduce((acc, set) => {
            return acc + (set.weight * set.reps);
        }, 0);

        res.json({
            totalWorkouts,
            totalRoutines,
            totalPRs,
            currentStreak: streak,
            trainingDaysLast30: uniqueDays.size,
            weeklyVolume: Math.round(weeklyVolume)
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/stats/consistency - Get consistency data (calendar heatmap)
app.get('/api/stats/consistency', async (req, res) => {
    try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const workouts = await prisma.workoutLog.findMany({
            where: { date: { gte: ninetyDaysAgo } },
            select: { date: true }
        });

        // Group by date and count workouts
        const consistencyMap = {};
        workouts.forEach(w => {
            const dateStr = w.date.toISOString().split('T')[0];
            consistencyMap[dateStr] = (consistencyMap[dateStr] || 0) + 1;
        });

        res.json(consistencyMap);
    } catch (error) {
        console.error('Error fetching consistency:', error);
        res.status(500).json({ error: 'Failed to fetch consistency data' });
    }
});

// GET /api/stats/progress/:exerciseName - Get progress for an exercise
app.get('/api/stats/progress/:exerciseName', async (req, res) => {
    try {
        const exerciseName = decodeURIComponent(req.params.exerciseName);

        const logs = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { contains: exerciseName, mode: 'insensitive' }
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
                const est1RM = set.weight * (36 / (37 - set.reps));
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

// GET /api/stats/prs - Get all personal records
app.get('/api/stats/prs', async (req, res) => {
    try {
        // Get best PR for each exercise
        const allPRs = await prisma.personalRecord.findMany({
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

        res.json(Object.values(prsByExercise));
    } catch (error) {
        console.error('Error fetching PRs:', error);
        res.status(500).json({ error: 'Failed to fetch PRs' });
    }
});

// ============================================
// Health Check
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🏋️ NexLift API running on http://localhost:${PORT}`);
});
