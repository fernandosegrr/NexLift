// Frozen production handlers before Phase 1.5. Test characterization ONLY.
// No server startup, dotenv, background jobs or external connections.
import express from 'express';
import { sanitizeSets, sanitizeWorkoutLogBody, sanitizeShortcutLogSet, resolveTargetDate } from '../../src/logic.js';
export function createLegacyWorkoutApp({ prisma, scheduleRestReminder = () => {} }) {
const app = express();
app.use(express.json());
const authMiddleware = (req, res, next) => { req.userId = req.headers.authorization === 'Bearer B' ? 'B' : 'A'; next(); };
async function recalcPRForExercise(exerciseName, userId) {
    if (!exerciseName) return;
    const nameLower = exerciseName.toLowerCase();
    const logs = await prisma.workoutLog.findMany({
        where: {
            exercise: {
                name: { equals: exerciseName, mode: 'insensitive' },
                routineDay: { routine: { userId } }
            }
        },
        include: { sets: true },
        // orderBy explícito: sin esto, ante un empate exacto de est1RM el desempate
        // (comparación estricta `>` de abajo) dependía del orden arbitrario en que
        // Postgres devolviera las filas — la fecha del PR podía "saltar" entre
        // recálculos. Con orden ascendente, la ocurrencia MÁS ANTIGUA gana el empate,
        // de forma determinista.
        orderBy: { date: 'asc' }
    });

    let best = null; // { weight, reps, est1RM, date }
    for (const log of logs) {
        for (const s of log.sets) {
            const candidates = [{ w: s.weight, r: s.reps }];
            if (s.weightRight != null || s.repsRight != null) {
                candidates.push({ w: s.weightRight ?? s.weight, r: s.repsRight ?? s.reps });
            }
            for (const c of candidates) {
                const w = Number(c.w) || 0;
                const r = Number(c.r) || 0;
                if (w <= 0 || r <= 0) continue;
                const est = (r > 1 && r < 37) ? w * (1 + r / 30) : w;
                if (!best || est > best.est1RM) best = { weight: w, reps: r, est1RM: est, date: log.date };
            }
        }
    }

    await prisma.personalRecord.deleteMany({ where: { userId, exerciseName: nameLower } });
    if (best) {
        await prisma.personalRecord.create({
            data: {
                userId,
                exerciseName: nameLower,
                weight: best.weight,
                reps: best.reps,
                estimated1RM: best.est1RM,
                date: best.date
            }
        });
    }
}


app.post('/api/workouts/log', authMiddleware, async (req, res) => {
    try {
        const parsed = sanitizeWorkoutLogBody(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const { exerciseId, sets: cleanSets, notes } = parsed.clean;

        // Verify exercise belongs to user
        const exercise = await prisma.exercise.findFirst({
            where: {
                id: exerciseId,
                routineDay: { routine: { userId: req.userId } }
            }
        });

        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found or unauthorized' });
        }

        const workoutLog = await prisma.workoutLog.create({
            data: {
                exerciseId,
                notes,
                sets: {
                    create: cleanSets.map((set, index) => ({
                        setNumber: index + 1,
                        weight: set.weight,
                        reps: set.reps,
                        rpe: set.rpe,
                        weightRight: set.weightRight ?? null,
                        repsRight: set.repsRight ?? null,
                        completed: set.completed
                    }))
                }
            },
            include: {
                sets: true,
                exercise: true
            }
        });

        // Recalcula el PR del ejercicio desde los logs reales (consistente, incluye unilateral)
        await recalcPRForExercise(exercise.name, req.userId);
        // El aviso de descanso ya no se programa aquí: el frontend lo pide por
        // cada serie individual vía POST /api/workouts/rest-reminder en cuanto
        // se marca completada, en vez de una sola vez al guardar todo el
        // ejercicio junto (dejarlo aquí también duplicaría el aviso de la
        // última serie).

        res.status(201).json({
            message: 'Workout logged successfully!',
            workoutLog
        });
    } catch (error) {
        console.error('Error logging workout:', error);
        res.status(500).json({ error: 'Failed to log workout' });
    }
});


app.put('/api/workouts/fix-weights', authMiddleware, async (req, res) => {
    try {
        const { exerciseName, oldWeight, newWeight } = req.body;

        if (!exerciseName || oldWeight === undefined || newWeight === undefined) {
            return res.status(400).json({ error: 'exerciseName, oldWeight, newWeight required' });
        }

        // Find all sets matching the criteria for this user's exercises
        const matchingLogs = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { contains: exerciseName, mode: 'insensitive' },
                    routineDay: { routine: { userId: req.userId } }
                }
            },
            include: { sets: true, exercise: true }
        });

        let updatedCount = 0;
        for (const log of matchingLogs) {
            for (const set of log.sets) {
                if (Math.abs(set.weight - parseFloat(oldWeight)) < 0.1) {
                    await prisma.setLog.update({
                        where: { id: set.id },
                        data: { weight: parseFloat(newWeight) }
                    });
                    updatedCount++;
                }
            }
        }

        // Also fix personal records
        const prUpdated = await prisma.personalRecord.updateMany({
            where: {
                userId: req.userId,
                exerciseName: { contains: exerciseName, mode: 'insensitive' },
                weight: { gte: parseFloat(oldWeight) - 0.1, lte: parseFloat(oldWeight) + 0.1 }
            },
            data: { weight: parseFloat(newWeight) }
        });

        res.json({
            message: `Fixed ${updatedCount} sets and ${prUpdated.count} PRs`,
            setsUpdated: updatedCount,
            prsUpdated: prUpdated.count
        });
    } catch (error) {
        console.error('Error fixing weights:', error);
        res.status(500).json({ error: 'Failed to fix weights' });
    }
});


app.post('/api/shortcuts/log-set', authMiddleware, async (req, res) => {
    try {
        // Acepta rpe o rir indistintamente (si vienen vacíos, fallback a rir: 0 / rpe: 10)
        const parsed = sanitizeShortcutLogSet(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const { exerciseId, set: cleanSet } = parsed.clean;

        const exercise = await prisma.exercise.findFirst({
            where: { id: exerciseId, routineDay: { routine: { userId: req.userId } } },
            include: {
                routineDay: {
                    include: {
                        exercises: { orderBy: { order: 'asc' } }
                    }
                }
            }
        });
        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found or unauthorized' });
        }

        const explicitDate = req.query.date || req.body.date;
        const targetDate = resolveTargetDate(explicitDate);
        const startOfDay = targetDate; // ya es medianoche real de CDMX (ver resolveTargetDate)
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        // Envuelto en transacción: encontrar-o-crear el WorkoutLog de "hoy" no es
        // atómico entre dos llamadas casi simultáneas del Atajo (p.ej. un reintento
        // tras timeout) sin esto — ambas podrían ver "no existe" y crear un log
        // duplicado, fragmentando la sesión que este endpoint existe para evitar.
        const workoutLog = await prisma.$transaction(async (tx) => {
            let log = await tx.workoutLog.findFirst({
                where: { exerciseId, date: { gte: startOfDay, lt: endOfDay } },
                include: { sets: true }
            });

            if (log) {
                await tx.setLog.create({
                    data: {
                        workoutLogId: log.id,
                        setNumber: log.sets.length + 1,
                        weight: cleanSet.weight,
                        reps: cleanSet.reps,
                        rpe: cleanSet.rpe,
                        weightRight: cleanSet.weightRight ?? null,
                        repsRight: cleanSet.repsRight ?? null,
                        completed: cleanSet.completed
                    }
                });
                return tx.workoutLog.findUnique({
                    where: { id: log.id },
                    include: { sets: true, exercise: true }
                });
            }

            return tx.workoutLog.create({
                data: {
                    exerciseId,
                    // Con ?date= explícito (backfill) no hay hora real que guardar, se usa
                    // medianoche real de CDMX del día pedido. Sin override (uso normal en
                    // vivo desde el Atajo) se guarda la hora real, igual que
                    // /api/workouts/log — si no, la PWA no puede mostrar la hora real de
                    // guardado (siempre caía a medianoche) para sets registrados vía Atajo.
                    date: explicitDate ? targetDate : new Date(),
                    sets: {
                        create: [{
                            setNumber: 1,
                            weight: cleanSet.weight,
                            reps: cleanSet.reps,
                            rpe: cleanSet.rpe,
                            weightRight: cleanSet.weightRight ?? null,
                            repsRight: cleanSet.repsRight ?? null,
                            completed: cleanSet.completed
                        }]
                    }
                },
                include: { sets: true, exercise: true }
            });
        });

        await recalcPRForExercise(exercise.name, req.userId);

        let nextExerciseName = null;
        const dayExercises = exercise.routineDay?.exercises || [];
        if (workoutLog.sets.length >= exercise.targetSets && dayExercises.length > 0) {
            const currentIdx = dayExercises.findIndex(e => e.id === exercise.id);
            if (currentIdx >= 0 && currentIdx + 1 < dayExercises.length) {
                nextExerciseName = dayExercises[currentIdx + 1].name;
            }
        }
        scheduleRestReminder(req.userId, exercise, nextExerciseName);

        res.status(201).json({
            message: 'Set logged successfully!',
            workoutLog,
            setsLoggedToday: workoutLog.sets.length,
            targetSets: exercise.targetSets,
            nextExerciseName
        });
    } catch (error) {
        console.error('Error logging set via shortcut:', error);
        res.status(500).json({ error: 'Failed to log set' });
    }
});


app.put('/api/workouts/:logId', authMiddleware, async (req, res) => {
    try {
        const logId = req.params.logId;
        const { sets } = req.body;

        if (!sets || !Array.isArray(sets)) {
            return res.status(400).json({ error: 'Sets array required' });
        }

        // Validación/normalización server-side
        const { sets: cleanSets, error: setsError } = sanitizeSets(sets);
        if (setsError) return res.status(400).json({ error: setsError });

        // Verify ownership via relation chain
        const existingLog = await prisma.workoutLog.findFirst({
            where: {
                id: logId,
                exercise: {
                    routineDay: {
                        routine: { userId: req.userId }
                    }
                }
            }
        });

        if (!existingLog) {
            return res.status(404).json({ error: 'Workout log not found or unauthorized' });
        }

        // Transaction: delete old sets and create new ones
        const updated = await prisma.$transaction(async (tx) => {
            // Delete existing sets
            await tx.setLog.deleteMany({ where: { workoutLogId: logId } });

            // Create new sets
            await tx.setLog.createMany({
                data: cleanSets.map((set, i) => ({
                    workoutLogId: logId,
                    setNumber: i + 1,
                    weight: set.weight,
                    reps: set.reps,
                    rpe: set.rpe,
                    weightRight: set.weightRight ?? null,
                    repsRight: set.repsRight ?? null,
                    completed: set.completed
                }))
            });

            return tx.workoutLog.findUnique({
                where: { id: logId },
                include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true }
            });
        });

        // Recalcula el PR del ejercicio (puede subir o bajar tras la edición)
        if (updated?.exercise?.name) {
            await recalcPRForExercise(updated.exercise.name, req.userId);
        }

        res.json({ message: 'Session updated!', workoutLog: updated });
    } catch (error) {
        console.error('Error updating workout:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// DELETE /api/workouts/:logId - Delete a workout session
app.delete('/api/workouts/:logId', authMiddleware, async (req, res) => {
    try {
        // Verify ownership (incluye el nombre del ejercicio para recalcular el PR después)
        const existingLog = await prisma.workoutLog.findFirst({
            where: {
                id: req.params.logId,
                exercise: {
                    routineDay: {
                        routine: { userId: req.userId }
                    }
                }
            },
            include: { exercise: { select: { name: true } } }
        });

        if (!existingLog) {
            return res.status(404).json({ error: 'Workout log not found or unauthorized' });
        }

        await prisma.workoutLog.delete({ where: { id: req.params.logId } });

        // Recalcula el PR: si el récord venía de esta sesión, ya no debe quedar fantasma
        await recalcPRForExercise(existingLog.exercise?.name, req.userId);

        res.json({ message: 'Session deleted!' });
    } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});


return { app, recalcPRForExercise };
}
