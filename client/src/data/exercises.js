/**
 * NexLift - Base de Datos de Ejercicios (Versión 2.0)
 * Optimizado para Hipertrofia y PPL / Arnold Split
 */

export const MUSCLE_GROUPS = [
    { id: 'chest', name: 'Pecho' },
    { id: 'back', name: 'Espalda' },
    { id: 'shoulders', name: 'Hombros' },
    { id: 'legs', name: 'Piernas' },
    { id: 'biceps', name: 'Bíceps' },
    { id: 'triceps', name: 'Tríceps' },
    { id: 'forearms', name: 'Antebrazos' }, // NUEVO
    { id: 'core', name: 'Core / Abdomen' }
];

export const EXERCISES = [
    // ==================== PECHO ====================
    // Compuestos
    { id: 'bench-press', name: 'Press de Banca con Barra', muscleGroup: 'chest' },
    { id: 'incline-bench-press', name: 'Press Inclinado con Barra', muscleGroup: 'chest' },
    { id: 'dumbbell-press', name: 'Press Plano con Mancuernas', muscleGroup: 'chest' },
    { id: 'incline-dumbbell-press', name: 'Press Inclinado con Mancuernas', muscleGroup: 'chest' },
    { id: 'machine-chest-press', name: 'Press de Pecho en Máquina', muscleGroup: 'chest' },
    { id: 'smith-incline-press', name: 'Press Inclinado en Multipower (Smith)', muscleGroup: 'chest' }, // Estabilidad = Hipertrofia
    { id: 'dips-chest', name: 'Fondos en Paralelas (Enfoque Pecho)', muscleGroup: 'chest' },

    // Aislamiento
    { id: 'cable-crossover-high', name: 'Cruce de Poleas (Alta a Baja)', muscleGroup: 'chest' },
    { id: 'cable-crossover-mid', name: 'Cruce de Poleas (Media)', muscleGroup: 'chest' },
    { id: 'cable-crossover-low', name: 'Cruce de Poleas (Baja a Alta)', muscleGroup: 'chest' }, // Clave para pecho superior
    { id: 'pec-deck', name: 'Pec Deck / Contractora', muscleGroup: 'chest' },
    { id: 'dumbbell-flyes', name: 'Aperturas con Mancuernas', muscleGroup: 'chest' },
    { id: 'hex-press', name: 'Press Hexagonal (Svend)', muscleGroup: 'chest' },

    // ==================== ESPALDA ====================
    // Tracción Vertical (Anchura)
    { id: 'lat-pulldown', name: 'Jalón al Pecho Agarre Prono', muscleGroup: 'back' },
    { id: 'neutral-lat-pulldown', name: 'Jalón al Pecho Agarre Neutro', muscleGroup: 'back' },
    { id: 'single-arm-pulldown', name: 'Jalón Unilateral (Iliaco)', muscleGroup: 'back' }, // Top tier hipertrofia
    { id: 'pull-ups', name: 'Dominadas Pronas', muscleGroup: 'back' },
    { id: 'chin-ups', name: 'Dominadas Supinas', muscleGroup: 'back' },

    // Tracción Horizontal (Densidad)
    { id: 'barbell-row', name: 'Remo con Barra', muscleGroup: 'back' },
    { id: 'dumbbell-row', name: 'Remo con Mancuerna (Kroc Row)', muscleGroup: 'back' },
    { id: 'chest-supported-row', name: 'Remo con Soporte al Pecho', muscleGroup: 'back' }, // Elimina inercia
    { id: 'cable-row', name: 'Remo Gironda / Polea Baja', muscleGroup: 'back' },
    { id: 't-bar-row', name: 'Remo en Barra T', muscleGroup: 'back' },
    { id: 'meadows-row', name: 'Remo Meadows', muscleGroup: 'back' },

    // Espalda Baja / Completa
    { id: 'deadlift', name: 'Peso Muerto Convencional', muscleGroup: 'back' },
    { id: 'rack-pulls', name: 'Rack Pulls', muscleGroup: 'back' },
    { id: 'hyperextensions', name: 'Hiperextensiones', muscleGroup: 'back' },
    { id: 'face-pulls', name: 'Face Pulls', muscleGroup: 'back' }, // Salud de hombro/Trapecio
    { id: 'shrugs-dumbbell', name: 'Encogimientos con Mancuernas', muscleGroup: 'back' },

    // ==================== HOMBROS ====================
    // Anterior / Press
    { id: 'overhead-press', name: 'Press Militar con Barra', muscleGroup: 'shoulders' },
    { id: 'seated-dumbbell-press', name: 'Press Sentado con Mancuernas', muscleGroup: 'shoulders' },
    { id: 'machine-shoulder-press', name: 'Press de Hombros en Máquina', muscleGroup: 'shoulders' },
    { id: 'arnold-press', name: 'Press Arnold', muscleGroup: 'shoulders' },

    // Lateral (La clave para amplitud)
    { id: 'lateral-raises', name: 'Elevaciones Laterales Mancuerna', muscleGroup: 'shoulders' },
    { id: 'cable-lateral-raises', name: 'Elevaciones Laterales en Polea', muscleGroup: 'shoulders' }, // Tensión constante
    { id: 'egyptian-lateral-raises', name: 'Elevaciones Egipcias', muscleGroup: 'shoulders' },
    { id: 'lu-raises', name: 'Elevaciones Lu (Rango completo)', muscleGroup: 'shoulders' },

    // Posterior
    { id: 'rear-delt-fly-machine', name: 'Pájaros en Máquina (Reverse Fly)', muscleGroup: 'shoulders' },
    { id: 'rear-delt-dumbbell', name: 'Pájaros con Mancuernas', muscleGroup: 'shoulders' },
    { id: 'rope-face-pull', name: 'Face Pull con Cuerda', muscleGroup: 'shoulders' },

    // ==================== PIERNAS ====================
    // Dominante de Rodilla (Cuádriceps)
    { id: 'squat', name: 'Sentadilla con Barra (High Bar)', muscleGroup: 'legs' },
    { id: 'hack-squat', name: 'Sentadilla Hack', muscleGroup: 'legs' }, // Top tier hipertrofia
    { id: 'leg-press', name: 'Prensa Inclinada', muscleGroup: 'legs' },
    { id: 'bulgarian-split-squat', name: 'Sentadilla Búlgara', muscleGroup: 'legs' },
    { id: 'leg-extension', name: 'Extensiones de Cuádriceps', muscleGroup: 'legs' },
    { id: 'goblet-squat', name: 'Sentadilla Goblet', muscleGroup: 'legs' },

    // Dominante de Cadera (Femoral/Glúteo)
    { id: 'romanian-deadlift', name: 'Peso Muerto Rumano (Barra)', muscleGroup: 'legs' },
    { id: 'romanian-deadlift-db', name: 'Peso Muerto Rumano (Mancuernas)', muscleGroup: 'legs' },
    { id: 'seated-leg-curl', name: 'Curl Femoral Sentado', muscleGroup: 'legs' }, // Científicamente superior al tumbado
    { id: 'lying-leg-curl', name: 'Curl Femoral Tumbado', muscleGroup: 'legs' },
    { id: 'hip-thrust', name: 'Hip Thrust', muscleGroup: 'legs' },

    // Otros
    { id: 'standing-calf-raise', name: 'Elevación Talones De Pie', muscleGroup: 'legs' },
    { id: 'seated-calf-raise', name: 'Elevación Talones Sentado', muscleGroup: 'legs' },
    { id: 'adductor-machine', name: 'Máquina de Aductores', muscleGroup: 'legs' }, // Clave para piernas grandes

    // ==================== BÍCEPS ====================
    { id: 'barbell-curl', name: 'Curl con Barra Recta', muscleGroup: 'biceps' },
    { id: 'ez-bar-curl', name: 'Curl con Barra Z', muscleGroup: 'biceps' },
    { id: 'incline-dumbbell-curl', name: 'Curl Inclinado (Enfoque Cabeza Larga)', muscleGroup: 'biceps' },
    { id: 'bayesian-curl', name: 'Curl Bayesiano (Polea)', muscleGroup: 'biceps' }, // Gran estiramiento
    { id: 'preacher-curl', name: 'Curl Predicador / Scott', muscleGroup: 'biceps' },
    { id: 'hammer-curl', name: 'Curl Martillo', muscleGroup: 'biceps' },
    { id: 'reverse-curl', name: 'Curl Inverso (Braquiorradial)', muscleGroup: 'biceps' },
    { id: 'spider-curl', name: 'Spider Curl', muscleGroup: 'biceps' },

    // ==================== TRÍCEPS ====================
    { id: 'tricep-pushdown-rope', name: 'Extensión Polea con Cuerda', muscleGroup: 'triceps' },
    { id: 'tricep-pushdown-bar', name: 'Extensión Polea con Barra', muscleGroup: 'triceps' },
    { id: 'skull-crushers', name: 'Rompecráneos (Barra Z)', muscleGroup: 'triceps' },
    { id: 'overhead-cable-extension', name: 'Extensión Katana / Tras Nuca Polea', muscleGroup: 'triceps' }, // Enfatiza cabeza larga
    { id: 'close-grip-bench', name: 'Press Banca Agarre Cerrado', muscleGroup: 'triceps' },
    { id: 'dips-triceps', name: 'Fondos (Verticales)', muscleGroup: 'triceps' },
    { id: 'single-arm-pushdown', name: 'Extensión Unilateral Supina', muscleGroup: 'triceps' },

    // ==================== ANTEBRAZOS (NUEVO) ====================
    { id: 'wrist-curl', name: 'Curl de Muñeca', muscleGroup: 'forearms' },
    { id: 'reverse-wrist-curl', name: 'Curl de Muñeca Inverso', muscleGroup: 'forearms' },
    { id: 'farmers-walk', name: 'Paseo de Granjero', muscleGroup: 'forearms' },
    { id: 'plate-pinch', name: 'Pellizco de Discos', muscleGroup: 'forearms' },

    // ==================== CORE / ABDOMEN ====================
    { id: 'cable-crunch', name: 'Crunch en Polea Alta', muscleGroup: 'core' }, // Mejor opción con peso
    { id: 'hanging-leg-raises', name: 'Elevación de Piernas Colgado', muscleGroup: 'core' },
    { id: 'ab-wheel', name: 'Rueda Abdominal', muscleGroup: 'core' },
    { id: 'plank', name: 'Plancha Isométrica', muscleGroup: 'core' },
    { id: 'woodchoppers', name: 'Leñadores (Woodchoppers)', muscleGroup: 'core' },
    { id: 'vacuum', name: 'Vacío Abdominal', muscleGroup: 'core' }
];

// Funciones Helper (Sin cambios, funcionan bien)
export function searchExercises(query) {
    if (!query || query.length < 2) return [];
    const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return EXERCISES.filter(ex => {
        const normalizedName = ex.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalizedName.includes(normalizedQuery);
    });
}

export function getExercisesByMuscle(muscleGroup) {
    return EXERCISES.filter(ex => ex.muscleGroup === muscleGroup);
}

export function getMuscleGroup(id) {
    return MUSCLE_GROUPS.find(m => m.id === id);
}