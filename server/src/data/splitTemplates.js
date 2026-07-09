// splitTemplates.js — fallback 100% determinista de la Rutina diaria con IA,
// usado cuando no hay OPENAI_API_KEY (o el LLM falla). Mismo criterio que
// exerciseAgent.js: la feature debe funcionar de punta a punta sin IA configurada.
// Mismo shape conceptual que client/src/data/routineTemplates.js pero del lado
// del servidor y filtrable por el `equipment` del TrainingProfile.
import { EXERCISE_CATALOG } from './exerciseCatalog.js';

// Qué grupos musculares entrena cada "día" de cada split, y cuántos ejercicios
// de ese grupo entran (splits con más frecuencia por grupo → menos ejercicios
// por sesión y viceversa, para no generar sesiones absurdamente largas).
const DAY_DEFINITIONS = {
    'Full Body A': [{ muscleGroup: 'Pecho', count: 1 }, { muscleGroup: 'Espalda', count: 1 }, { muscleGroup: 'Piernas', count: 1 }, { muscleGroup: 'Hombros', count: 1 }],
    'Full Body B': [{ muscleGroup: 'Piernas', count: 1 }, { muscleGroup: 'Espalda', count: 1 }, { muscleGroup: 'Pecho', count: 1 }, { muscleGroup: 'Bíceps', count: 1 }, { muscleGroup: 'Tríceps', count: 1 }],
    'Upper A': [{ muscleGroup: 'Pecho', count: 2 }, { muscleGroup: 'Espalda', count: 1 }, { muscleGroup: 'Hombros', count: 1 }, { muscleGroup: 'Tríceps', count: 1 }],
    'Upper B': [{ muscleGroup: 'Espalda', count: 2 }, { muscleGroup: 'Pecho', count: 1 }, { muscleGroup: 'Hombros', count: 1 }, { muscleGroup: 'Bíceps', count: 1 }],
    'Lower A': [{ muscleGroup: 'Piernas', count: 3 }, { muscleGroup: 'Core / Abdomen', count: 1 }],
    'Lower B': [{ muscleGroup: 'Piernas', count: 3 }, { muscleGroup: 'Core / Abdomen', count: 1 }],
    'Push': [{ muscleGroup: 'Pecho', count: 2 }, { muscleGroup: 'Hombros', count: 1 }, { muscleGroup: 'Tríceps', count: 1 }],
    'Pull': [{ muscleGroup: 'Espalda', count: 2 }, { muscleGroup: 'Bíceps', count: 1 }, { muscleGroup: 'Antebrazos', count: 1 }],
    'Legs': [{ muscleGroup: 'Piernas', count: 3 }, { muscleGroup: 'Core / Abdomen', count: 1 }]
};

// Sets/reps/descanso por objetivo del perfil — mismos valores que ya usan targetSets/
// targetReps/restSeconds en cualquier Exercise manual, Smart Loading toma el control
// desde la 2ª sesión en adelante exactamente igual que en una rutina manual.
const GOAL_PRESCRIPTION = {
    strength: { targetSets: 4, targetReps: '4-6', restSeconds: 150 },
    hypertrophy: { targetSets: 3, targetReps: '8-12', restSeconds: 90 },
    general: { targetSets: 3, targetReps: '10-15', restSeconds: 60 }
};

// Qué lista de labels rotar según los días/semana del perfil — la cuota real de
// "cuántas veces por semana" la decide el servicio de orquestación (necesita leer
// WorkoutLogs), esto solo define LA FORMA del split.
export function getSplitLabelsForProfile(daysPerWeek) {
    if (daysPerWeek >= 5) return ['Push', 'Pull', 'Legs'];
    if (daysPerWeek === 4) return ['Upper A', 'Lower A', 'Upper B', 'Lower B'];
    return ['Full Body A', 'Full Body B'];
}

// Elige ejercicios determinísticamente para un splitLabel dado, filtrando el
// catálogo por el equipo disponible del perfil. Si un grupo muscular no tiene
// ningún ejercicio disponible con ese equipo, el slot se omite (no revienta).
// `excludeNames` (insensible a mayúsculas) permite regenerar EXCLUYENDO
// nombres puntuales — usado por el reshuffle ("cambia los ejercicios de hoy"):
// sin esto, volver a llamar esta función con el mismo splitLabel+perfil siempre
// devuelve exactamente los mismos ejercicios (es puramente determinista), así
// que "regenerar" sería un no-op.
export function pickDeterministicExercises(splitLabel, profile, catalog = EXERCISE_CATALOG, excludeNames = []) {
    const slots = DAY_DEFINITIONS[splitLabel] || [];
    const equipment = (profile.equipment && profile.equipment.length) ? profile.equipment : ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
    const prescription = GOAL_PRESCRIPTION[profile.goal] || GOAL_PRESCRIPTION.general;
    const excludeSet = new Set(excludeNames.map(n => n.toLowerCase()));

    const picks = [];
    const usedIds = new Set();
    for (const slot of slots) {
        const available = catalog.filter(ex =>
            ex.muscleGroup === slot.muscleGroup &&
            equipment.includes(ex.equipment) &&
            !usedIds.has(ex.id) &&
            !excludeSet.has(ex.name.toLowerCase())
        );
        const chosen = available.slice(0, slot.count);
        for (const ex of chosen) {
            usedIds.add(ex.id);
            picks.push({
                name: ex.name,
                muscleGroup: ex.muscleGroup,
                isUnilateral: !!ex.isUnilateral,
                ...prescription
            });
        }
    }
    return picks;
}

// Reemplaza puntualmente un subconjunto de ejercicios (agrupados por SU PROPIO
// grupo muscular) por otros nuevos del catálogo — a diferencia de
// pickDeterministicExercises, NO regenera el día completo desde cero. Usado por
// el reshuffle ("cambia los ejercicios de hoy"): los ejercicios que el usuario
// ya conservó (con una serie registrada hoy) ya cubren su propio slot, así que
// regenerar TODOS los slots del split duplicaría esos grupos musculares.
export function pickReplacementExercises(profile, exercisesToReplace, excludeNames = [], catalog = EXERCISE_CATALOG) {
    const equipment = (profile.equipment && profile.equipment.length) ? profile.equipment : ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
    const prescription = GOAL_PRESCRIPTION[profile.goal] || GOAL_PRESCRIPTION.general;
    const excludeSet = new Set(excludeNames.map(n => n.toLowerCase()));

    const countByMuscle = new Map();
    for (const ex of exercisesToReplace) {
        countByMuscle.set(ex.muscleGroup, (countByMuscle.get(ex.muscleGroup) || 0) + 1);
    }

    const picks = [];
    const usedIds = new Set();
    for (const [muscleGroup, count] of countByMuscle.entries()) {
        const available = catalog.filter(ex =>
            ex.muscleGroup === muscleGroup &&
            equipment.includes(ex.equipment) &&
            !usedIds.has(ex.id) &&
            !excludeSet.has(ex.name.toLowerCase())
        );
        const chosen = available.slice(0, count);
        for (const ex of chosen) {
            usedIds.add(ex.id);
            picks.push({
                name: ex.name,
                muscleGroup: ex.muscleGroup,
                isUnilateral: !!ex.isUnilateral,
                ...prescription
            });
        }
    }
    return picks;
}
