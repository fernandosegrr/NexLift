/**
 * NexLift - Plantillas de Rutinas Predefinidas
 * 
 * Templates populares listas para usar
 */

export const ROUTINE_TEMPLATES = [
    {
        id: 'ppl',
        name: 'Push Pull Legs',
        description: 'Clásico split de 6 días para hipertrofia. Ideal para intermedios y avanzados.',
        difficulty: 'intermediate',
        daysPerWeek: 6,
        goal: 'hypertrophy',
        tags: ['popular', 'volumen'],
        days: [
            {
                dayName: 'Push (Pecho/Hombros/Tríceps)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'bench-press', order: 0 },
                    { exerciseId: 'incline-dumbbell-press', order: 1 },
                    { exerciseId: 'overhead-press', order: 2 },
                    { exerciseId: 'lateral-raises', order: 3 },
                    { exerciseId: 'tricep-pushdown', order: 4 },
                    { exerciseId: 'overhead-tricep-extension', order: 5 }
                ]
            },
            {
                dayName: 'Pull (Espalda/Bíceps)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'deadlift', order: 0 },
                    { exerciseId: 'pull-ups', order: 1 },
                    { exerciseId: 'barbell-row', order: 2 },
                    { exerciseId: 'face-pulls', order: 3 },
                    { exerciseId: 'barbell-curl', order: 4 },
                    { exerciseId: 'hammer-curl', order: 5 }
                ]
            },
            {
                dayName: 'Legs (Piernas)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'squat', order: 0 },
                    { exerciseId: 'romanian-deadlift', order: 1 },
                    { exerciseId: 'leg-press', order: 2 },
                    { exerciseId: 'leg-curl', order: 3 },
                    { exerciseId: 'leg-extension', order: 4 },
                    { exerciseId: 'standing-calf-raise', order: 5 }
                ]
            },
            {
                dayName: 'Push (Pecho/Hombros/Tríceps)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'dumbbell-press', order: 0 },
                    { exerciseId: 'incline-bench-press', order: 1 },
                    { exerciseId: 'dumbbell-shoulder-press', order: 2 },
                    { exerciseId: 'cable-flyes', order: 3 },
                    { exerciseId: 'lateral-raises', order: 4 },
                    { exerciseId: 'skull-crushers', order: 5 }
                ]
            },
            {
                dayName: 'Pull (Espalda/Bíceps)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'lat-pulldown', order: 0 },
                    { exerciseId: 't-bar-row', order: 1 },
                    { exerciseId: 'cable-row', order: 2 },
                    { exerciseId: 'rear-delt-fly', order: 3 },
                    { exerciseId: 'dumbbell-curl', order: 4 },
                    { exerciseId: 'preacher-curl', order: 5 }
                ]
            },
            {
                dayName: 'Legs (Piernas)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'front-squat', order: 0 },
                    { exerciseId: 'hip-thrust', order: 1 },
                    { exerciseId: 'bulgarian-split-squat', order: 2 },
                    { exerciseId: 'leg-curl', order: 3 },
                    { exerciseId: 'leg-extension', order: 4 },
                    { exerciseId: 'seated-calf-raise', order: 5 }
                ]
            }
        ]
    },
    {
        id: 'upper-lower',
        name: 'Upper / Lower',
        description: 'Split de 4 días equilibrado. Excelente para principiantes e intermedios.',
        difficulty: 'beginner',
        daysPerWeek: 4,
        goal: 'strength',
        tags: ['popular', 'balance'],
        days: [
            {
                dayName: 'Upper A (Tren Superior)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'bench-press', order: 0 },
                    { exerciseId: 'barbell-row', order: 1 },
                    { exerciseId: 'overhead-press', order: 2 },
                    { exerciseId: 'lat-pulldown', order: 3 },
                    { exerciseId: 'barbell-curl', order: 4 },
                    { exerciseId: 'tricep-pushdown', order: 5 }
                ]
            },
            {
                dayName: 'Lower A (Tren Inferior)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'squat', order: 0 },
                    { exerciseId: 'romanian-deadlift', order: 1 },
                    { exerciseId: 'leg-press', order: 2 },
                    { exerciseId: 'leg-curl', order: 3 },
                    { exerciseId: 'standing-calf-raise', order: 4 },
                    { exerciseId: 'plank', order: 5 }
                ]
            },
            {
                dayName: 'Descanso',
                isRestDay: true,
                exercises: []
            },
            {
                dayName: 'Upper B (Tren Superior)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'incline-dumbbell-press', order: 0 },
                    { exerciseId: 'pull-ups', order: 1 },
                    { exerciseId: 'dumbbell-shoulder-press', order: 2 },
                    { exerciseId: 'cable-row', order: 3 },
                    { exerciseId: 'hammer-curl', order: 4 },
                    { exerciseId: 'skull-crushers', order: 5 }
                ]
            },
            {
                dayName: 'Lower B (Tren Inferior)',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'deadlift', order: 0 },
                    { exerciseId: 'lunges', order: 1 },
                    { exerciseId: 'hip-thrust', order: 2 },
                    { exerciseId: 'leg-extension', order: 3 },
                    { exerciseId: 'seated-calf-raise', order: 4 },
                    { exerciseId: 'hanging-leg-raises', order: 5 }
                ]
            }
        ]
    },
    {
        id: 'full-body',
        name: 'Full Body',
        description: 'Rutina de 3 días a la semana. Perfecta para principiantes.',
        difficulty: 'beginner',
        daysPerWeek: 3,
        goal: 'general',
        tags: ['principiante', 'eficiente'],
        days: [
            {
                dayName: 'Full Body A',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'squat', order: 0 },
                    { exerciseId: 'bench-press', order: 1 },
                    { exerciseId: 'barbell-row', order: 2 },
                    { exerciseId: 'overhead-press', order: 3 },
                    { exerciseId: 'barbell-curl', order: 4 },
                    { exerciseId: 'tricep-pushdown', order: 5 }
                ]
            },
            {
                dayName: 'Descanso',
                isRestDay: true,
                exercises: []
            },
            {
                dayName: 'Full Body B',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'deadlift', order: 0 },
                    { exerciseId: 'dumbbell-press', order: 1 },
                    { exerciseId: 'lat-pulldown', order: 2 },
                    { exerciseId: 'lateral-raises', order: 3 },
                    { exerciseId: 'leg-curl', order: 4 },
                    { exerciseId: 'plank', order: 5 }
                ]
            },
            {
                dayName: 'Descanso',
                isRestDay: true,
                exercises: []
            },
            {
                dayName: 'Full Body C',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'front-squat', order: 0 },
                    { exerciseId: 'incline-bench-press', order: 1 },
                    { exerciseId: 'cable-row', order: 2 },
                    { exerciseId: 'arnold-press', order: 3 },
                    { exerciseId: 'hammer-curl', order: 4 },
                    { exerciseId: 'crunches', order: 5 }
                ]
            }
        ]
    },
    {
        id: 'bro-split',
        name: 'Bro Split',
        description: 'Un grupo muscular por día. Clásico de culturismo.',
        difficulty: 'intermediate',
        daysPerWeek: 5,
        goal: 'hypertrophy',
        tags: ['culturismo', 'volumen'],
        days: [
            {
                dayName: 'Pecho',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'bench-press', order: 0 },
                    { exerciseId: 'incline-dumbbell-press', order: 1 },
                    { exerciseId: 'decline-bench-press', order: 2 },
                    { exerciseId: 'cable-flyes', order: 3 },
                    { exerciseId: 'pec-deck', order: 4 },
                    { exerciseId: 'push-ups', order: 5 }
                ]
            },
            {
                dayName: 'Espalda',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'deadlift', order: 0 },
                    { exerciseId: 'pull-ups', order: 1 },
                    { exerciseId: 'barbell-row', order: 2 },
                    { exerciseId: 'lat-pulldown', order: 3 },
                    { exerciseId: 'cable-row', order: 4 },
                    { exerciseId: 'hyperextensions', order: 5 }
                ]
            },
            {
                dayName: 'Hombros',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'overhead-press', order: 0 },
                    { exerciseId: 'dumbbell-shoulder-press', order: 1 },
                    { exerciseId: 'lateral-raises', order: 2 },
                    { exerciseId: 'front-raises', order: 3 },
                    { exerciseId: 'rear-delt-fly', order: 4 },
                    { exerciseId: 'shrugs', order: 5 }
                ]
            },
            {
                dayName: 'Piernas',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'squat', order: 0 },
                    { exerciseId: 'leg-press', order: 1 },
                    { exerciseId: 'romanian-deadlift', order: 2 },
                    { exerciseId: 'leg-extension', order: 3 },
                    { exerciseId: 'leg-curl', order: 4 },
                    { exerciseId: 'standing-calf-raise', order: 5 }
                ]
            },
            {
                dayName: 'Brazos',
                isRestDay: false,
                exercises: [
                    { exerciseId: 'barbell-curl', order: 0 },
                    { exerciseId: 'skull-crushers', order: 1 },
                    { exerciseId: 'hammer-curl', order: 2 },
                    { exerciseId: 'tricep-pushdown', order: 3 },
                    { exerciseId: 'preacher-curl', order: 4 },
                    { exerciseId: 'dips-triceps', order: 5 }
                ]
            }
        ]
    }
];

/**
 * Obtener template por ID
 */
export function getTemplate(id) {
    return ROUTINE_TEMPLATES.find(t => t.id === id);
}

/**
 * Obtener todos los templates
 */
export function getAllTemplates() {
    return ROUTINE_TEMPLATES;
}
