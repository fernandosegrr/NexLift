/**
 * NexLift - Base de Datos de Ejercicios
 * 
 * Ejercicios principales organizados por grupo muscular
 * PRIORIDAD: Pecho, Espalda, Hombros, Piernas, Brazos
 */

// Grupos musculares ordenados por importancia/uso
export const MUSCLE_GROUPS = [
    { id: 'chest', name: 'Pecho' },
    { id: 'back', name: 'Espalda' },
    { id: 'shoulders', name: 'Hombros' },
    { id: 'legs', name: 'Piernas' },
    { id: 'biceps', name: 'Bíceps' },
    { id: 'triceps', name: 'Tríceps' },
    { id: 'core', name: 'Core / Abdomen' }
];

export const EXERCISES = [
    // ==================== PECHO (15+ ejercicios) ====================
    { id: 'bench-press', name: 'Press de Banca', muscleGroup: 'chest' },
    { id: 'incline-bench-press', name: 'Press Inclinado Barra', muscleGroup: 'chest' },
    { id: 'decline-bench-press', name: 'Press Declinado Barra', muscleGroup: 'chest' },
    { id: 'dumbbell-press', name: 'Press con Mancuernas', muscleGroup: 'chest' },
    { id: 'incline-dumbbell-press', name: 'Press Inclinado Mancuernas', muscleGroup: 'chest' },
    { id: 'decline-dumbbell-press', name: 'Press Declinado Mancuernas', muscleGroup: 'chest' },
    { id: 'chest-flyes', name: 'Aperturas con Mancuernas', muscleGroup: 'chest' },
    { id: 'incline-flyes', name: 'Aperturas Inclinadas', muscleGroup: 'chest' },
    { id: 'cable-flyes', name: 'Aperturas en Polea', muscleGroup: 'chest' },
    { id: 'cable-crossover', name: 'Cruce de Poleas', muscleGroup: 'chest' },
    { id: 'push-ups', name: 'Flexiones', muscleGroup: 'chest' },
    { id: 'diamond-push-ups', name: 'Flexiones Diamante', muscleGroup: 'chest' },
    { id: 'incline-push-ups', name: 'Flexiones Inclinadas', muscleGroup: 'chest' },
    { id: 'dips-chest', name: 'Fondos para Pecho', muscleGroup: 'chest' },
    { id: 'pec-deck', name: 'Pec Deck / Contractora', muscleGroup: 'chest' },
    { id: 'machine-chest-press', name: 'Press en Máquina', muscleGroup: 'chest' },
    { id: 'svend-press', name: 'Svend Press', muscleGroup: 'chest' },
    { id: 'landmine-press', name: 'Landmine Press', muscleGroup: 'chest' },

    // ==================== ESPALDA (15+ ejercicios) ====================
    { id: 'deadlift', name: 'Peso Muerto Convencional', muscleGroup: 'back' },
    { id: 'sumo-deadlift', name: 'Peso Muerto Sumo', muscleGroup: 'back' },
    { id: 'romanian-deadlift', name: 'Peso Muerto Rumano', muscleGroup: 'back' },
    { id: 'pull-ups', name: 'Dominadas', muscleGroup: 'back' },
    { id: 'chin-ups', name: 'Dominadas Supinas', muscleGroup: 'back' },
    { id: 'lat-pulldown', name: 'Jalón al Pecho', muscleGroup: 'back' },
    { id: 'close-grip-pulldown', name: 'Jalón Agarre Cerrado', muscleGroup: 'back' },
    { id: 'behind-neck-pulldown', name: 'Jalón Tras Nuca', muscleGroup: 'back' },
    { id: 'barbell-row', name: 'Remo con Barra', muscleGroup: 'back' },
    { id: 'pendlay-row', name: 'Remo Pendlay', muscleGroup: 'back' },
    { id: 'dumbbell-row', name: 'Remo con Mancuerna', muscleGroup: 'back' },
    { id: 'cable-row', name: 'Remo en Polea', muscleGroup: 'back' },
    { id: 't-bar-row', name: 'Remo en T', muscleGroup: 'back' },
    { id: 'machine-row', name: 'Remo en Máquina', muscleGroup: 'back' },
    { id: 'face-pulls', name: 'Face Pulls', muscleGroup: 'back' },
    { id: 'pullover', name: 'Pullover', muscleGroup: 'back' },
    { id: 'hyperextensions', name: 'Hiperextensiones', muscleGroup: 'back' },
    { id: 'good-mornings', name: 'Buenos Días', muscleGroup: 'back' },
    { id: 'rack-pulls', name: 'Rack Pulls', muscleGroup: 'back' },
    { id: 'shrugs', name: 'Encogimientos (Trapecios)', muscleGroup: 'back' },

    // ==================== HOMBROS (12+ ejercicios) ====================
    { id: 'overhead-press', name: 'Press Militar Barra', muscleGroup: 'shoulders' },
    { id: 'seated-overhead-press', name: 'Press Militar Sentado', muscleGroup: 'shoulders' },
    { id: 'dumbbell-shoulder-press', name: 'Press con Mancuernas', muscleGroup: 'shoulders' },
    { id: 'arnold-press', name: 'Press Arnold', muscleGroup: 'shoulders' },
    { id: 'push-press', name: 'Push Press', muscleGroup: 'shoulders' },
    { id: 'lateral-raises', name: 'Elevaciones Laterales', muscleGroup: 'shoulders' },
    { id: 'cable-lateral-raises', name: 'Elevaciones Laterales Polea', muscleGroup: 'shoulders' },
    { id: 'front-raises', name: 'Elevaciones Frontales', muscleGroup: 'shoulders' },
    { id: 'rear-delt-fly', name: 'Pájaros / Deltoides Posterior', muscleGroup: 'shoulders' },
    { id: 'reverse-pec-deck', name: 'Pec Deck Inverso', muscleGroup: 'shoulders' },
    { id: 'upright-rows', name: 'Remo al Mentón', muscleGroup: 'shoulders' },
    { id: 'machine-shoulder-press', name: 'Press Hombro en Máquina', muscleGroup: 'shoulders' },
    { id: 'landmine-shoulder-press', name: 'Landmine Press Hombro', muscleGroup: 'shoulders' },

    // ==================== PIERNAS (15+ ejercicios) ====================
    { id: 'squat', name: 'Sentadilla Barra', muscleGroup: 'legs' },
    { id: 'front-squat', name: 'Sentadilla Frontal', muscleGroup: 'legs' },
    { id: 'goblet-squat', name: 'Sentadilla Goblet', muscleGroup: 'legs' },
    { id: 'hack-squat', name: 'Hack Squat', muscleGroup: 'legs' },
    { id: 'leg-press', name: 'Prensa de Piernas', muscleGroup: 'legs' },
    { id: 'leg-extension', name: 'Extensión de Cuádriceps', muscleGroup: 'legs' },
    { id: 'leg-curl', name: 'Curl de Femorales', muscleGroup: 'legs' },
    { id: 'stiff-leg-deadlift', name: 'Peso Muerto Piernas Rígidas', muscleGroup: 'legs' },
    { id: 'lunges', name: 'Zancadas / Desplantes', muscleGroup: 'legs' },
    { id: 'walking-lunges', name: 'Zancadas Caminando', muscleGroup: 'legs' },
    { id: 'bulgarian-split-squat', name: 'Sentadilla Búlgara', muscleGroup: 'legs' },
    { id: 'step-ups', name: 'Step Ups / Subidas al Banco', muscleGroup: 'legs' },
    { id: 'hip-thrust', name: 'Hip Thrust', muscleGroup: 'legs' },
    { id: 'glute-bridge', name: 'Puente de Glúteos', muscleGroup: 'legs' },
    { id: 'calf-raises', name: 'Elevación de Talones', muscleGroup: 'legs' },
    { id: 'seated-calf-raises', name: 'Elevación Talones Sentado', muscleGroup: 'legs' },
    { id: 'leg-press-calf', name: 'Pantorrillas en Prensa', muscleGroup: 'legs' },
    { id: 'sissy-squat', name: 'Sissy Squat', muscleGroup: 'legs' },

    // ==================== BÍCEPS (10+ ejercicios) ====================
    { id: 'barbell-curl', name: 'Curl con Barra', muscleGroup: 'biceps' },
    { id: 'ez-bar-curl', name: 'Curl con Barra Z', muscleGroup: 'biceps' },
    { id: 'dumbbell-curl', name: 'Curl con Mancuernas', muscleGroup: 'biceps' },
    { id: 'hammer-curl', name: 'Curl Martillo', muscleGroup: 'biceps' },
    { id: 'preacher-curl', name: 'Curl Predicador / Scott', muscleGroup: 'biceps' },
    { id: 'concentration-curl', name: 'Curl Concentrado', muscleGroup: 'biceps' },
    { id: 'incline-curl', name: 'Curl Inclinado', muscleGroup: 'biceps' },
    { id: 'cable-curl', name: 'Curl en Polea', muscleGroup: 'biceps' },
    { id: 'spider-curl', name: 'Spider Curl', muscleGroup: 'biceps' },
    { id: 'drag-curl', name: 'Drag Curl', muscleGroup: 'biceps' },
    { id: 'machine-curl', name: 'Curl en Máquina', muscleGroup: 'biceps' },
    { id: '21s', name: 'Curl 21s', muscleGroup: 'biceps' },

    // ==================== TRÍCEPS (10+ ejercicios) ====================
    { id: 'tricep-pushdown', name: 'Extensión en Polea', muscleGroup: 'triceps' },
    { id: 'rope-pushdown', name: 'Extensión con Cuerda', muscleGroup: 'triceps' },
    { id: 'overhead-tricep-extension', name: 'Extensión sobre Cabeza', muscleGroup: 'triceps' },
    { id: 'skull-crushers', name: 'Rompecráneos / Press Francés', muscleGroup: 'triceps' },
    { id: 'close-grip-bench', name: 'Press Agarre Cerrado', muscleGroup: 'triceps' },
    { id: 'dips-triceps', name: 'Fondos para Tríceps', muscleGroup: 'triceps' },
    { id: 'bench-dips', name: 'Fondos en Banco', muscleGroup: 'triceps' },
    { id: 'tricep-kickback', name: 'Patada de Tríceps', muscleGroup: 'triceps' },
    { id: 'diamond-push-ups-triceps', name: 'Flexiones Diamante (Tríceps)', muscleGroup: 'triceps' },
    { id: 'cable-overhead-extension', name: 'Extensión Polea Alta', muscleGroup: 'triceps' },
    { id: 'machine-tricep-extension', name: 'Extensión en Máquina', muscleGroup: 'triceps' },

    // ==================== CORE / ABDOMEN (10+ ejercicios) ====================
    { id: 'plank', name: 'Plancha', muscleGroup: 'core' },
    { id: 'side-plank', name: 'Plancha Lateral', muscleGroup: 'core' },
    { id: 'crunches', name: 'Abdominales / Crunches', muscleGroup: 'core' },
    { id: 'leg-raises', name: 'Elevación de Piernas', muscleGroup: 'core' },
    { id: 'hanging-leg-raises', name: 'Elevación Piernas Colgando', muscleGroup: 'core' },
    { id: 'russian-twist', name: 'Giro Ruso', muscleGroup: 'core' },
    { id: 'cable-crunch', name: 'Crunch en Polea', muscleGroup: 'core' },
    { id: 'ab-wheel', name: 'Rueda Abdominal', muscleGroup: 'core' },
    { id: 'mountain-climbers', name: 'Escaladores', muscleGroup: 'core' },
    { id: 'dead-bug', name: 'Dead Bug', muscleGroup: 'core' },
    { id: 'hollow-body-hold', name: 'Hollow Body Hold', muscleGroup: 'core' },
    { id: 'bicycle-crunches', name: 'Abdominales Bicicleta', muscleGroup: 'core' }
];

/**
 * Buscar ejercicios por nombre
 */
export function searchExercises(query) {
    if (!query || query.length < 2) return [];

    const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return EXERCISES.filter(ex => {
        const normalizedName = ex.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalizedName.includes(normalizedQuery);
    });
}

/**
 * Obtener ejercicios por grupo muscular
 */
export function getExercisesByMuscle(muscleGroup) {
    return EXERCISES.filter(ex => ex.muscleGroup === muscleGroup);
}

/**
 * Obtener info de grupo muscular
 */
export function getMuscleGroup(id) {
    return MUSCLE_GROUPS.find(m => m.id === id);
}
