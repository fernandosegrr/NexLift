import { isSameExercise } from '../../utils/exerciseName.js';
import { groupHistoryByExercise } from '../../utils/exerciseName.js';
import { bestOneRepMaxForTarget } from '../../utils/exerciseName.js';
import { epley1RM } from '../../utils/exerciseName.js';

export function registerRoutes(app, { prisma, authMiddleware , console }) {
app.get('/api/goals', authMiddleware, async (req, res) => {
    try {
        const goals = await prisma.goal.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });

        const pendingGoals = goals.filter(g => !g.achievedAt);
        let logs = null;
        if (pendingGoals.length > 0) {
            logs = await prisma.workoutLog.findMany({
                where: { exercise: { routineDay: { routine: { userId: req.userId } } } },
                include: { sets: true, exercise: true }
            });
        }

        const resolved = await Promise.all(goals.map(async (goal) => {
            if (goal.achievedAt) return goal; // ya persistido, hecho histórico, no se re-deriva

            const matching = logs.filter(l => isSameExercise(l.exercise.name, goal.exerciseName));
            if (matching.length === 0) return goal;

            const grouped = groupHistoryByExercise(matching);
            const sessions = [...grouped.values()][0]?.sessions || [];
            if (sessions.length < 2) return goal; // mismo mínimo que usa GoalCard para tener "hasHistory"

            const starting1RM = bestOneRepMaxForTarget(sessions, goal.targetReps, 3);
            if (starting1RM <= 0) return goal; // sin series cercanas al objetivo, sin evidencia suficiente

            const target1RM = goal.targetReps === 1 ? goal.targetWeight : epley1RM(goal.targetWeight, goal.targetReps);
            if (starting1RM >= target1RM) {
                return prisma.goal.update({ where: { id: goal.id }, data: { achievedAt: new Date() } });
            }
            return goal;
        }));

        res.json(resolved);
    } catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ error: 'Failed to fetch goals' });
    }
});

app.post('/api/goals', authMiddleware, async (req, res) => {
    try {
        const {
            exerciseName,
            muscleGroup,
            targetWeight,
            targetReps,
            // Manual data for fallback predictions
            currentOneRepMax,
            currentEightRepMax,
            experienceLevel,
            frequencyPerWeek
        } = req.body;

        if (!exerciseName || !targetWeight || !targetReps) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const cleanWeight = parseFloat(targetWeight);
        const cleanReps = parseInt(targetReps);

        // Evita crear el mismo objetivo dos veces (mismo ejercicio+peso+reps, sin
        // cumplir todavía) — se encontró un caso real de esto sin ningún aviso.
        const duplicate = await prisma.goal.findFirst({
            where: {
                userId: req.userId,
                exerciseName: { equals: exerciseName, mode: 'insensitive' },
                targetWeight: cleanWeight,
                targetReps: cleanReps,
                achievedAt: null
            }
        });
        if (duplicate) {
            return res.status(409).json({ error: 'Ya tienes un objetivo activo para ese ejercicio con ese peso y esas reps' });
        }

        const goal = await prisma.goal.create({
            data: {
                userId: req.userId,
                exerciseName,
                muscleGroup: muscleGroup || null,
                targetWeight: cleanWeight,
                targetReps: cleanReps,
                currentOneRepMax: currentOneRepMax ? parseFloat(currentOneRepMax) : null,
                currentEightRepMax: currentEightRepMax ? parseFloat(currentEightRepMax) : null,
                experienceLevel: experienceLevel || null,
                frequencyPerWeek: frequencyPerWeek ? parseInt(frequencyPerWeek) : null
            }
        });
        res.status(201).json(goal);
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

app.put('/api/goals/:id/weeks', authMiddleware, async (req, res) => {
    try {
        const { weekNumber, completed } = req.body; // completed: boolean
        const goal = await prisma.goal.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });

        if (!goal) return res.status(404).json({ error: 'Goal not found' });

        let newCompletedWeeks = goal.completedWeeks || [];
        if (completed) {
            if (!newCompletedWeeks.includes(weekNumber)) {
                newCompletedWeeks.push(weekNumber);
            }
        } else {
            newCompletedWeeks = newCompletedWeeks.filter(w => w !== weekNumber);
        }

        const updated = await prisma.goal.update({
            where: { id: req.params.id },
            data: { completedWeeks: newCompletedWeeks }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating goal weeks:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

app.delete('/api/goals/:id', authMiddleware, async (req, res) => {
    try {
        const goal = await prisma.goal.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!goal) return res.status(404).json({ error: 'Goal not found' });

        await prisma.goal.delete({ where: { id: req.params.id } });
        res.json({ message: 'Goal deleted' });
    } catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});

}
