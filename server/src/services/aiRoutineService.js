// aiRoutineService.js — orquestación PURA (sin Prisma) de la Rutina diaria con IA.
// server/src/index.js hace las consultas/escrituras reales y le pasa los datos ya
// cargados; este archivo solo DECIDE qué hacer con ellos — mismo patrón que los
// otros servicios de este proyecto (exerciseAgent.js, backupService.js), ninguno
// de los dos toca Prisma directo tampoco.
import { getSplitLabelsForProfile, pickDeterministicExercises } from '../data/splitTemplates.js';
import { pickNextSplitDay } from '../logic.js';

// Decide qué hacer con "el día de hoy" de una rutina IA, dados los datos que
// index.js ya cargó:
// - existingToday: RoutineDay (con exercises) si ya existe uno con dayName=hoy, o
//   null. Si existe, SIEMPRE se reusa tal cual (nunca se regenera un día en curso).
// - recentDays: RoutineDay[] de días de ENTRENAMIENTO ya generados para esta
//   rutina, más reciente primero (dayName DESC) — index.js decide cuántos traer.
// - profile: TrainingProfile (goal, daysPerWeek, equipment, experienceLevel).
// - todayStr / sevenDaysAgoStr: mexicoCityDateStr() de hoy y de hace 7 días.
export function planToday({ existingToday, recentDays, profile, todayStr, sevenDaysAgoStr }) {
    if (existingToday) {
        return { action: 'reuse', day: existingToday };
    }

    // Cuota semanal: ¿ya se entrenó daysPerWeek veces en los últimos 7 días? Cada
    // RoutineDay de esta rutina representa un día YA entrenado (los de descanso
    // nunca generan fila), así que contar filas basta — sin tocar WorkoutLog.
    const trainedLast7Days = (recentDays || []).filter(d => d.dayName >= sevenDaysAgoStr).length;
    if (trainedLast7Days >= profile.daysPerWeek) {
        return { action: 'rest', dayName: todayStr };
    }

    const splitLabels = getSplitLabelsForProfile(profile.daysPerWeek);
    // recentDays viene DESC (más reciente primero); pickNextSplitDay espera lo
    // contrario (más viejo primero) para que "el último entrenado" sea el correcto.
    const recentLabels = (recentDays || [])
        .slice()
        .reverse()
        .map(d => d.splitLabel)
        .filter(Boolean);
    const splitLabel = pickNextSplitDay(splitLabels, recentLabels);

    const exercises = pickDeterministicExercises(splitLabel, profile);
    return { action: 'create', dayName: todayStr, splitLabel, exercises };
}
