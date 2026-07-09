// Compara SuggestionLog (lo que el entrenador inteligente sugirió — P5 del plan
// de mejoras) contra lo que el usuario REALMENTE registró ese mismo día para ese
// ejercicio, para poder calibrar los umbrales del entrenador con datos reales.
// Solo lectura — no escribe nada, no cambia ninguna constante. Correr:
//   node analyze-suggestions.mjs
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { mexicoCityDateStr } from './src/logic.js';
dotenv.config();

const prisma = new PrismaClient();

const suggestions = await prisma.suggestionLog.findMany({
    include: { exercise: true },
    orderBy: { date: 'asc' }
});

if (suggestions.length === 0) {
    console.log('Sin SuggestionLog todavía — necesita semanas de uso real acumulado (ver P5 en .agent/plan-mejoras-app.md). Nada que analizar.');
    process.exit(0);
}

// Trae de una sola vez los WorkoutLogs de todos los ejercicios involucrados, y
// los indexa por "exerciseId:díaCDMX" para no consultar uno por uno por sugerencia.
const exerciseIds = [...new Set(suggestions.map(s => s.exerciseId))];
const logs = await prisma.workoutLog.findMany({
    where: { exerciseId: { in: exerciseIds } },
    include: { sets: true }
});
const logsByExerciseDay = new Map();
for (const log of logs) {
    const key = `${log.exerciseId}:${mexicoCityDateStr(log.date)}`;
    const existing = logsByExerciseDay.get(key);
    if (!existing || log.date > existing.date) logsByExerciseDay.set(key, log);
}

// Serie de trabajo real de un WorkoutLog: la de mayor 1RM estimado ese día
// (mismo criterio que computeWorkoutSuggestion/effectiveWorkoutSet en logic.js
// — en unilateral, el lado más débil).
function bestWorkingSet(workoutLog) {
    let best = null, bestRM = -1;
    for (const set of workoutLog.sets) {
        const w = set.weightRight != null ? Math.min(set.weight, set.weightRight) : set.weight;
        const r = set.repsRight != null ? Math.min(set.reps, set.repsRight) : set.reps;
        if (w <= 0 || r <= 0) continue;
        const rm = (r > 1 && r < 37) ? w * (1 + r / 30) : w;
        if (rm > bestRM) { bestRM = rm; best = { weight: w, reps: r, rpe: set.rpe }; }
    }
    return best;
}

const groups = new Map(); // `${exerciseId}:${phase}` -> { exerciseName, phase, rows: [] }
let withoutMatch = 0;

for (const s of suggestions) {
    const dayStr = mexicoCityDateStr(s.date);
    const actualLog = logsByExerciseDay.get(`${s.exerciseId}:${dayStr}`);
    const groupKey = `${s.exerciseId}:${s.phase || 'sin_fase'}`;
    if (!groups.has(groupKey)) {
        groups.set(groupKey, { exerciseName: s.exercise.name, phase: s.phase || 'sin_fase', rows: [] });
    }

    const best = actualLog ? bestWorkingSet(actualLog) : null;
    if (!best) {
        withoutMatch++;
        groups.get(groupKey).rows.push(null); // sugerido, pero sin dato real ese día (no se entrenó, o el Atajo solo mostró sin aplicar)
        continue;
    }

    const rir = best.rpe != null ? (10 - best.rpe) : null;
    groups.get(groupKey).rows.push({
        // "Siguió la sugerencia" = llegó al peso sugerido con al menos las reps sugeridas.
        followed: Math.abs(best.weight - s.suggestedWeight) < 0.01 && best.reps >= s.suggestedReps,
        weightDelta: best.weight - s.suggestedWeight,
        repsDelta: best.reps - s.suggestedReps,
        rir
    });
}

console.log(`${suggestions.length} sugerencia(s) analizada(s) — ${suggestions.filter(s => s.source === 'shortcut').length} del Atajo de iOS, ${suggestions.filter(s => s.source === 'client').length} aplicadas en la app.`);
console.log(`${withoutMatch} sin dato real ese mismo día (sugerida pero no entrenada, o el Atajo solo la mostró sin que se aplicara).\n`);

for (const { exerciseName, phase, rows } of groups.values()) {
    const withMatch = rows.filter(Boolean);
    if (withMatch.length === 0) {
        console.log(`${exerciseName} [${phase}] — ${rows.length} sugerencia(s), 0 con dato real ese día.\n`);
        continue;
    }

    const followedCount = withMatch.filter(r => r.followed).length;
    const avgWeightDelta = withMatch.reduce((a, r) => a + r.weightDelta, 0) / withMatch.length;
    const rirs = withMatch.map(r => r.rir).filter(v => v != null);
    const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
    const highRirCount = rirs.filter(r => r >= 3).length; // le sobró fuerza -> ¿sugerencia conservadora?
    const lowRirCount = rirs.filter(r => r <= 1).length;  // le costó mucho -> ¿sugerencia agresiva?

    console.log(`${exerciseName} [${phase}]`);
    console.log(`  sugerencias: ${rows.length}, con dato real ese día: ${withMatch.length}`);
    console.log(`  siguió la sugerencia exacta: ${followedCount}/${withMatch.length}`);
    console.log(`  delta promedio de peso (real - sugerido): ${avgWeightDelta >= 0 ? '+' : ''}${avgWeightDelta.toFixed(1)}kg`);
    if (avgRir != null) {
        console.log(`  RIR promedio real: ${avgRir.toFixed(1)}  (RIR>=3 "le sobró": ${highRirCount}, RIR<=1 "le costó mucho": ${lowRirCount})`);
    }
    console.log('');
}

console.log('Recordatorio: este script NO cambia ninguna constante. Ajustar los umbrales de adjustRepRangeForPhase/descarga adaptativa es una decisión del usuario, con este reporte en la mano, después de semanas de datos.');

await prisma.$disconnect();
