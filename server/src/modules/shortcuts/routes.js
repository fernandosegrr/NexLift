import { resolveTargetDate } from '../../logic.js';
import { getTodayName } from '../../logic.js';
import { mexicoCityDayOfWeek } from '../../logic.js';
import { getRoutinePhaseStatus } from '../../logic.js';
import { computeWorkoutSuggestion } from '../../logic.js';
import { suggestNextSetFromToday } from '../../logic.js';
import { roundWorkoutWeight } from '../../logic.js';
import { resolveWeightIncrement } from '../../logic.js';
import { parseRepRange } from '../../logic.js';
import { effectiveWorkoutSet } from '../../logic.js';
import { findRoutineDayForWeekday } from '../../logic.js';
import { inferWeekdayFromName } from '../../logic.js';
import { baseShortcutResponse } from './service.js';

export function registerRoutes(app, { prisma, authMiddleware, resolveOrGenerateAiRoutineDay, HISTORY_SESSIONS_WINDOW , console , workoutHandlers }) {
app.get('/api/shortcuts/next-set', authMiddleware, async (req, res) => {
    try {
        const targetDate = resolveTargetDate(req.query.date);
        const startOfDay = targetDate; // ya es medianoche real de CDMX (ver resolveTargetDate)
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        const todayName = getTodayName(targetDate);

        const routine = await prisma.routine.findFirst({
            where: { isActive: true, userId: req.userId },
            include: {
                days: {
                    include: { exercises: { orderBy: { order: 'asc' } } },
                    orderBy: { order: 'asc' }
                },
                blocks: true
            }
        });

        if (!routine) {
            return res.json({ ...baseShortcutResponse(), noActiveRoutine: true });
        }

        const phaseStatus = getRoutinePhaseStatus(routine);

        // Rutinas IA no se organizan por día de la semana (sus RoutineDay llevan
        // la fecha ISO como dayName) — resolverlas requiere el mismo camino
        // idempotente que usa la PWA (GET /api/ai-routine/today), no el resolver
        // por weekday de abajo. El backfill vía ?date= no aplica aquí: generar un
        // día IA "del pasado" después de que ya exista uno más reciente rompería
        // el orden que asume la rotación (recentDays DESC) — se ignora a propósito.
        let todayRoutineDay;
        if (routine.source === 'ai') {
            const profile = await prisma.trainingProfile.findUnique({ where: { userId: req.userId } });
            todayRoutineDay = profile ? await resolveOrGenerateAiRoutineDay(routine, profile) : null;
        } else {
            const targetWeekday = mexicoCityDayOfWeek(targetDate);
            todayRoutineDay = findRoutineDayForWeekday(routine.days, targetWeekday);
            if (!todayRoutineDay && Array.isArray(routine.days)) {
                todayRoutineDay = routine.days.find(d => inferWeekdayFromName(d.dayName) === targetWeekday) || null;
            }
        }

        if (!todayRoutineDay || todayRoutineDay.isRestDay) {
            return res.json({ ...baseShortcutResponse(), isRestDay: true, dayName: todayName, isDeload: phaseStatus.isDeload, phase: phaseStatus.phase });
        }

        const exerciseIds = todayRoutineDay.exercises.map(e => e.id);
        const todayLogs = exerciseIds.length
            ? await prisma.workoutLog.findMany({
                where: { exerciseId: { in: exerciseIds }, date: { gte: startOfDay, lt: endOfDay } },
                include: { sets: true }
            })
            : [];
        const loggedCountByExercise = {};
        for (const log of todayLogs) {
            loggedCountByExercise[log.exerciseId] = (loggedCountByExercise[log.exerciseId] || 0) + log.sets.length;
        }

        const nextExercise = todayRoutineDay.exercises.find(
            ex => (loggedCountByExercise[ex.id] || 0) < ex.targetSets
        );

        if (!nextExercise) {
            return res.json({ ...baseShortcutResponse(), dayName: todayRoutineDay.dayName, dayComplete: true, isDeload: phaseStatus.isDeload, phase: phaseStatus.phase });
        }

        const setsLoggedToday = loggedCountByExercise[nextExercise.id] || 0;

        // Historial: mismas últimas N sesiones que la PWA (Smart Loading).
        const history = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { equals: nextExercise.name, mode: 'insensitive' },
                    routineDay: { routine: { userId: req.userId } }
                }
            },
            include: { sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { date: 'desc' },
            take: HISTORY_SESSIONS_WINDOW
        });

        const base = {
            ...baseShortcutResponse(),
            dayName: todayRoutineDay.dayName,
            exerciseId: nextExercise.id,
            exerciseName: nextExercise.name,
            muscleGroup: nextExercise.muscleGroup,
            targetSets: nextExercise.targetSets,
            setsLoggedToday,
            targetRepsRange: nextExercise.targetReps,
            restSeconds: nextExercise.restSeconds,
            isUnilateral: nextExercise.isUnilateral,
            isDeload: phaseStatus.isDeload,
            phase: phaseStatus.phase,
            source: 'none'
        };

        const increment = resolveWeightIncrement(nextExercise.muscleGroup, nextExercise.name);
        const { lo, hi } = parseRepRange(nextExercise.targetReps);

        // Si ya hay series de HOY con RIR en este ejercicio → autorregulación
        // intra-sesión (puede bajar peso). Usa todayLogs ya cargados arriba.
        const todayLogForExercise = todayLogs.find(l => l.exerciseId === nextExercise.id);
        if (todayLogForExercise && (todayLogForExercise.sets || []).length > 0) {
            const completedToday = todayLogForExercise.sets
                .map(effectiveWorkoutSet)
                .filter(s => s.weight > 0 && s.reps > 0);
            const intra = suggestNextSetFromToday(completedToday, {
                lo, hi, increment, phase: phaseStatus.phase
            });
            if (intra) {
                // No re-aplicar deload: las series de hoy ya van al peso de la sesión
                return res.json({
                    ...base,
                    suggestedWeight: intra.weight,
                    suggestedReps: intra.reps,
                    rationale: intra.rationale,
                    source: 'intra'
                });
            }
        }

        // Historial para entre-sesiones: excluye el log de hoy (parcial) si existe
        const historyForInter = todayLogForExercise
            ? history.filter(h => h.id !== todayLogForExercise.id)
            : history;

        if (historyForInter.length === 0 && history.length === 0) {
            return res.json({ ...base, rationale: 'sin historial', source: 'none' });
        }

        const suggestion = computeWorkoutSuggestion(
            historyForInter.length ? historyForInter : history,
            nextExercise.targetReps,
            increment,
            phaseStatus.phase
        );

        if (!suggestion) {
            return res.json({ ...base, rationale: 'sin historial', source: 'none' });
        }

        // Descarga: reduce el peso sugerido ~10% (misma rejilla de redondeo que la
        // sugerencia normal), sin tocar `rationale` — lo consume el Atajo de iOS
        // externo y no se controla cómo parsea ese string.
        const suggestedWeight = phaseStatus.isDeload
            ? roundWorkoutWeight(suggestion.weight * 0.9, increment, suggestion.weight)
            : suggestion.weight;

        // Instrumentación de calibración (P5 del plan de mejoras, v2.6.2) — una
        // fila por sugerencia MOSTRADA (no solo aplicada) vía el Atajo. Fire-and-
        // forget: nunca debe retrasar ni tumbar la respuesta al Atajo de iOS.
        prisma.suggestionLog.create({
            data: {
                userId: req.userId,
                exerciseId: nextExercise.id,
                suggestedWeight,
                suggestedReps: suggestion.reps,
                phase: phaseStatus.phase,
                source: 'shortcut'
            }
        }).catch(err => console.error('Error guardando SuggestionLog:', err.message));

        res.json({
            ...base,
            suggestedWeight,
            suggestedReps: suggestion.reps,
            rationale: suggestion.rationale,
            source: 'inter'
        });
    } catch (error) {
        console.error('Error resolving next-set:', error);
        res.status(500).json({ error: 'Failed to resolve next set' });
    }
});

app.post('/api/shortcuts/log-set', authMiddleware, workoutHandlers.logShortcutSet);

app.post('/api/suggestions/log', authMiddleware, async (req, res) => {
    try {
        const { exerciseId, suggestedWeight, suggestedReps, phase } = req.body;
        if (!exerciseId || suggestedWeight == null || suggestedReps == null) {
            return res.status(400).json({ error: 'Required: exerciseId, suggestedWeight, suggestedReps' });
        }
        const exercise = await prisma.exercise.findFirst({
            where: { id: exerciseId, routineDay: { routine: { userId: req.userId } } }
        });
        if (!exercise) return res.status(404).json({ error: 'Exercise not found or unauthorized' });

        await prisma.suggestionLog.create({
            data: {
                userId: req.userId,
                exerciseId,
                suggestedWeight: parseFloat(suggestedWeight),
                suggestedReps: parseInt(suggestedReps),
                phase: phase || null,
                source: 'client'
            }
        });
        res.status(201).json({ ok: true });
    } catch (error) {
        console.error('Error guardando SuggestionLog:', error);
        res.status(500).json({ error: 'Failed to log suggestion' });
    }
});

}
