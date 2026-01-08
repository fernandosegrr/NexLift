import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from client/dist (for production)
app.use(express.static(path.join(__dirname, '../../client/dist')));

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
                        exercises: { orderBy: { order: 'asc' } }
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
                        exercises: { orderBy: { order: 'asc' } }
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
                            },
                            orderBy: { order: 'asc' }
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
                            },
                            orderBy: { order: 'asc' }
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

// PUT /api/routines/:id - Update routine (Full Structure)
app.put('/api/routines/:id', async (req, res) => {
    try {
        const routineId = req.params.id;
        const { name, description, days } = req.body;

        // 1. Update basic info
        await prisma.routine.update({
            where: { id: routineId },
            data: { name, description }
        });

        // 2. Handle Days
        const existingDays = await prisma.routineDay.findMany({
            where: { routineId },
            select: { id: true }
        });
        const incomingDayIds = days.filter(d => d.id).map(d => d.id);
        const daysToDelete = existingDays.filter(d => !incomingDayIds.includes(d.id)).map(d => d.id);

        if (daysToDelete.length > 0) {
            await prisma.routineDay.deleteMany({ where: { id: { in: daysToDelete } } });
        }

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

            // 3. Handle Exercises
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
                        const currentExercise = await prisma.exercise.findUnique({
                            where: { id: ex.id },
                            select: { name: true }
                        });

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

                        // SMART PR RENAMING:
                        // If name changed, update associated PRs to keep history linked
                        if (currentExercise && currentExercise.name.trim().toLowerCase() !== ex.name.trim().toLowerCase()) {
                            console.log(`Renaming PRs for: ${currentExercise.name} -> ${ex.name}`);
                            await prisma.personalRecord.updateMany({
                                where: { exerciseName: currentExercise.name.toLowerCase() },
                                data: { exerciseName: ex.name.toLowerCase() }
                            });
                        }
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

        res.json(updatedRoutine);
    } catch (error) {
        console.error('Error updating routine:', error);
        res.status(500).json({ error: 'Failed to update routine' });
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
                // Calculate estimated 1RM using Epley formula (consistent with frontend)
                let estimated1RM = set.weight;
                if (set.reps > 1 && set.reps < 37) {
                    estimated1RM = set.weight * (1 + set.reps / 30);
                }

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

// POST /api/workouts/log-rest - Log a rest day
app.post('/api/workouts/log-rest', async (req, res) => {
    try {
        const { note } = req.body;
        const restLog = await prisma.restLog.create({
            data: { note: note || 'Día de descanso' }
        });
        res.status(201).json({ message: 'Rest logged!', restLog });
    } catch (error) {
        console.error('Error logging rest:', error);
        res.status(500).json({ error: 'Failed to log rest' });
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

// PUT /api/workouts/:logId - Update a workout session
app.put('/api/workouts/:logId', async (req, res) => {
    try {
        const logId = req.params.logId;
        const { sets } = req.body;

        if (!sets || !Array.isArray(sets)) {
            return res.status(400).json({ error: 'Sets array required' });
        }

        // Transaction: delete old sets and create new ones
        const updated = await prisma.$transaction(async (tx) => {
            // Delete existing sets
            await tx.setLog.deleteMany({ where: { workoutLogId: logId } });

            // Create new sets
            await tx.setLog.createMany({
                data: sets.map((set, i) => ({
                    workoutLogId: logId,
                    setNumber: i + 1,
                    weight: parseFloat(set.weight),
                    reps: parseInt(set.reps),
                    rpe: set.rpe ? parseFloat(set.rpe) : null,
                    completed: true
                }))
            });

            return tx.workoutLog.findUnique({
                where: { id: logId },
                include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true }
            });
        });

        res.json({ message: 'Session updated!', workoutLog: updated });
    } catch (error) {
        console.error('Error updating workout:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// DELETE /api/workouts/:logId - Delete a workout session
app.delete('/api/workouts/:logId', async (req, res) => {
    try {
        await prisma.workoutLog.delete({ where: { id: req.params.logId } });
        res.json({ message: 'Session deleted!' });
    } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ error: 'Failed to delete session' });
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
        const recentRestLogs = await prisma.restLog.findMany({
            where: { date: { gte: thirtyDaysAgo } },
            select: { date: true }
        });

        // Calculate unique training days
        const uniqueDays = new Set([
            ...recentWorkouts.map(w => w.date.toISOString().split('T')[0]),
            ...recentRestLogs.map(r => r.date.toISOString().split('T')[0])
        ]);

        // Calculate current streak (up to 365 days)
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
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
        const restLogs = await prisma.restLog.findMany({
            where: { date: { gte: ninetyDaysAgo } },
            select: { date: true }
        });

        // Return raw timestamps for frontend processing (Timezone fix)
        const allEvents = [
            ...workouts.map(w => w.date),
            ...restLogs.map(r => r.date)
        ];

        res.json({ events: allEvents });
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

        res.json(Object.values(prsByExercise).sort((a, b) => b.weight - a.weight));
    } catch (error) {
        console.error('Error fetching PRs:', error);
        res.status(500).json({ error: 'Failed to fetch PRs' });
    }
});
// ============================================
// ROUTES: Body Tracking (Peso & Fotos)
// ============================================

// GET /api/body/logs - Client-compatible route
app.get('/api/body/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 90;

        const logs = await prisma.bodyLog.findMany({
            orderBy: { date: 'desc' },
            take: Math.min(limit, 500)
        });

        res.json(logs);
    } catch (error) {
        console.error('Error fetching body logs:', error);
        res.status(500).json({ error: 'Failed to fetch body logs' });
    }
});

// POST /api/body/log - Client-compatible route
app.post('/api/body/log', async (req, res) => {
    try {
        const { weight, photo, note, bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein } = req.body;

        if (!weight && !photo) {
            return res.status(400).json({ error: 'Weight or photo required' });
        }

        const bodyLog = await prisma.bodyLog.create({
            data: {
                weight: weight ? parseFloat(weight) : null,
                photo: photo || null,
                note: note || null,
                bmi: bmi ? parseFloat(bmi) : null,
                bodyFat: bodyFat ? parseFloat(bodyFat) : null,
                muscleMass: muscleMass ? parseFloat(muscleMass) : null,
                bmr: bmr ? parseFloat(bmr) : null,
                bodyWater: bodyWater ? parseFloat(bodyWater) : null,
                visceralFat: visceralFat ? parseFloat(visceralFat) : null,
                boneMass: boneMass ? parseFloat(boneMass) : null,
                protein: protein ? parseFloat(protein) : null
            }
        });

        res.status(201).json({
            message: 'Body log saved!',
            bodyLog
        });
    } catch (error) {
        console.error('Error saving body log:', error);
        res.status(500).json({ error: 'Failed to save body log' });
    }
});

// GET /api/body - Get body logs history (legacy)
app.get('/api/body', async (req, res) => {
    try {
        const { limit = 90, includePhotos = false } = req.query;

        const logs = await prisma.bodyLog.findMany({
            select: {
                id: true,
                date: true,
                weight: true,
                photo: includePhotos === 'true',
                note: true
            },
            orderBy: { date: 'desc' },
            take: parseInt(limit)
        });

        res.json(logs);
    } catch (error) {
        console.error('Error fetching body logs:', error);
        res.status(500).json({ error: 'Failed to fetch body logs' });
    }
});

// GET /api/body/photos - Get only photo entries
app.get('/api/body/photos', async (req, res) => {
    try {
        const photos = await prisma.bodyLog.findMany({
            where: { photo: { not: null } },
            select: {
                id: true,
                date: true,
                photo: true,
                note: true
            },
            orderBy: { date: 'desc' },
            take: 12 // Last 12 months
        });

        res.json(photos);
    } catch (error) {
        console.error('Error fetching photos:', error);
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

// POST /api/body - Log weight and/or photo
app.post('/api/body', async (req, res) => {
    try {
        const { weight, photo, note } = req.body;

        if (!weight && !photo) {
            return res.status(400).json({ error: 'Weight or photo required' });
        }

        const bodyLog = await prisma.bodyLog.create({
            data: {
                weight: weight ? parseFloat(weight) : null,
                photo: photo || null,
                note: note || null
            }
        });

        res.status(201).json({
            message: 'Body log saved!',
            bodyLog: { id: bodyLog.id, date: bodyLog.date, weight: bodyLog.weight }
        });
    } catch (error) {
        console.error('Error saving body log:', error);
        res.status(500).json({ error: 'Failed to save body log' });
    }
});

// GET /api/body/latest - Get most recent weight
app.get('/api/body/latest', async (req, res) => {
    try {
        const latest = await prisma.bodyLog.findFirst({
            where: { weight: { not: null } },
            orderBy: { date: 'desc' },
            select: { date: true, weight: true }
        });

        res.json(latest || { weight: null });
    } catch (error) {
        console.error('Error fetching latest weight:', error);
        res.status(500).json({ error: 'Failed to fetch latest weight' });
    }
});

// ============================================
// Health Check
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// SPA Fallback - Must be LAST route
// ============================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});


// Start server
app.listen(PORT, () => {
    console.log(`🏋️ NexLift API running on http://localhost:${PORT}`);
});
