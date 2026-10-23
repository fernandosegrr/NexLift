import { normalizeImportedExercise } from '../../services/routineImportContract.js';
import { planToday } from '../../services/aiRoutineService.js';
import { EXERCISE_CATALOG } from '../../data/exerciseCatalog.js';
import { mexicoCityDateStr } from '../../logic.js';

export function createAiService({ prisma, chooseExercisesForDay }) {
async function resolveOrGenerateAiRoutineDay(routine, profile) {
    const todayStr = mexicoCityDateStr();

    const existingToday = await prisma.routineDay.findFirst({
        where: { routineId: routine.id, dayName: todayStr },
        include: { exercises: { orderBy: { order: 'asc' } } }
    });

    // 14 días de sobra para cubrir la ventana de 7 días de la cuota semanal
    // incluso con el split más frecuente (6x/semana) que este proyecto ofrece.
    const recentDays = existingToday ? [] : await prisma.routineDay.findMany({
        where: { routineId: routine.id, isRestDay: false },
        orderBy: { dayName: 'desc' },
        take: 14
    });

    const windowStartStr = mexicoCityDateStr(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    const plan = planToday({ existingToday, recentDays, profile, todayStr, windowStartStr });

    if (plan.action === 'reuse') return plan.day;
    if (plan.action === 'rest') return { isRestDay: true, dayName: plan.dayName, splitLabel: null, exercises: [] };

    // plan.action === 'create' — plan.exercises ya trae el fallback determinista
    // completo y utilizable. Con OPENAI_API_KEY configurada, se le da a la IA la
    // oportunidad de elegir mejor (candidatos = catálogo filtrado por equipo +
    // ejercicios que el usuario ya entrenó antes, para continuidad de Smart
    // Loading) — con ese mismo determinista como fallback si la IA falla.
    let exercises = plan.exercises;
    if (chooseExercisesForDay) {
        const equipment = (profile.equipment && profile.equipment.length) ? profile.equipment : null;
        const equipmentCatalog = equipment ? EXERCISE_CATALOG.filter(ex => equipment.includes(ex.equipment)) : EXERCISE_CATALOG;
        const historicalExercises = await prisma.exercise.findMany({
            where: { routineDay: { routine: { userId: routine.userId } } },
            select: { name: true, muscleGroup: true, isUnilateral: true },
            distinct: ['name']
        });
        exercises = await chooseExercisesForDay({
            splitLabel: plan.splitLabel,
            profile,
            equipmentCatalog,
            historicalExercises,
            fallback: () => plan.exercises
        });
    }

    return prisma.routineDay.create({
        data: {
            dayName: plan.dayName,
            isRestDay: false,
            splitLabel: plan.splitLabel,
            order: 0,
            routineId: routine.id,
            exercises: {
                create: exercises.map((ex, i) => normalizeImportedExercise(ex, i, `ai.exercises[${i}]`))
            }
        },
        include: { exercises: { orderBy: { order: 'asc' } } }
    });
}

return { resolveOrGenerateAiRoutineDay };
}
