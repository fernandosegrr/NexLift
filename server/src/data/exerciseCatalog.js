// exerciseCatalog.js — copia deliberada, en el servidor, de
// client/src/data/exercises.js (mismo criterio de duplicación ya usado en este
// proyecto para Epley/plateau/rangos de reps — no existe carpeta shared/).
//
// Dos diferencias A PROPÓSITO respecto al catálogo del cliente, no un descuido:
// 1. `muscleGroup` usa las etiquetas en ESPAÑOL ('Piernas', 'Pecho', ...), no los
//    ids en inglés del catálogo cliente ('legs', 'chest'). El redondeo a 5kg para
//    piernas (roundWeight/adjustRepRangeForPhase, cliente y servidor) compara
//    contra el string 'Piernas' — un ejercicio de pierna generado por IA con
//    muscleGroup='legs' nunca activaría esa regla.
// 2. Cada ejercicio trae `equipment` (uno de EQUIPMENT_TYPES) para poder filtrar
//    por lo que el usuario marcó disponible en su TrainingProfile.
//
// Usado por server/src/data/splitTemplates.js (fallback determinista) y por
// server/src/services/aiRoutineAgent.js (lista cerrada de candidatos para el LLM
// — nunca texto libre, así se evita fragmentar el historial de Smart Loading).
export const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

export const EXERCISE_CATALOG = [
    // ==================== PECHO ====================
    { id: 'bench-press', name: 'Press de Banca con Barra', muscleGroup: 'Pecho', equipment: 'barbell' },
    { id: 'incline-bench-press', name: 'Press Inclinado con Barra', muscleGroup: 'Pecho', equipment: 'barbell' },
    { id: 'dumbbell-press', name: 'Press Plano con Mancuernas', muscleGroup: 'Pecho', equipment: 'dumbbell' },
    { id: 'incline-dumbbell-press', name: 'Press Inclinado con Mancuernas', muscleGroup: 'Pecho', equipment: 'dumbbell' },
    { id: 'machine-chest-press', name: 'Press de Pecho en Máquina', muscleGroup: 'Pecho', equipment: 'machine' },
    { id: 'dips-chest', name: 'Fondos en Paralelas (Enfoque Pecho)', muscleGroup: 'Pecho', equipment: 'bodyweight' },
    { id: 'cable-crossover-high', name: 'Cruce de Poleas (Alta a Baja)', muscleGroup: 'Pecho', equipment: 'cable' },
    { id: 'cable-crossover-low', name: 'Cruce de Poleas (Baja a Alta)', muscleGroup: 'Pecho', equipment: 'cable' },
    { id: 'pec-deck', name: 'Pec Deck / Contractora', muscleGroup: 'Pecho', equipment: 'machine' },
    { id: 'dumbbell-flyes', name: 'Aperturas con Mancuernas', muscleGroup: 'Pecho', equipment: 'dumbbell' },

    // ==================== ESPALDA ====================
    { id: 'lat-pulldown', name: 'Jalón al Pecho Agarre Prono', muscleGroup: 'Espalda', equipment: 'cable' },
    { id: 'neutral-lat-pulldown', name: 'Jalón al Pecho Agarre Neutro', muscleGroup: 'Espalda', equipment: 'cable' },
    { id: 'pull-ups', name: 'Dominadas Pronas', muscleGroup: 'Espalda', equipment: 'bodyweight' },
    { id: 'chin-ups', name: 'Dominadas Supinas', muscleGroup: 'Espalda', equipment: 'bodyweight' },
    { id: 'barbell-row', name: 'Remo con Barra', muscleGroup: 'Espalda', equipment: 'barbell' },
    { id: 'dumbbell-row', name: 'Remo con Mancuerna (Kroc Row)', muscleGroup: 'Espalda', equipment: 'dumbbell', isUnilateral: true },
    { id: 'cable-row', name: 'Remo Gironda / Polea Baja', muscleGroup: 'Espalda', equipment: 'cable' },
    { id: 'deadlift', name: 'Peso Muerto Convencional', muscleGroup: 'Espalda', equipment: 'barbell' },
    { id: 'hyperextensions', name: 'Hiperextensiones', muscleGroup: 'Espalda', equipment: 'bodyweight' },
    { id: 'face-pulls', name: 'Face Pulls', muscleGroup: 'Espalda', equipment: 'cable' },

    // ==================== HOMBROS ====================
    { id: 'overhead-press', name: 'Press Militar con Barra', muscleGroup: 'Hombros', equipment: 'barbell' },
    { id: 'seated-dumbbell-press', name: 'Press Sentado con Mancuernas', muscleGroup: 'Hombros', equipment: 'dumbbell' },
    { id: 'machine-shoulder-press', name: 'Press de Hombros en Máquina', muscleGroup: 'Hombros', equipment: 'machine' },
    { id: 'lateral-raises', name: 'Elevaciones Laterales Mancuerna', muscleGroup: 'Hombros', equipment: 'dumbbell' },
    { id: 'cable-lateral-raises', name: 'Elevaciones Laterales en Polea', muscleGroup: 'Hombros', equipment: 'cable' },
    { id: 'rear-delt-fly-machine', name: 'Pájaros en Máquina (Reverse Fly)', muscleGroup: 'Hombros', equipment: 'machine' },
    { id: 'rear-delt-dumbbell', name: 'Pájaros con Mancuernas', muscleGroup: 'Hombros', equipment: 'dumbbell' },

    // ==================== PIERNAS ====================
    { id: 'squat', name: 'Sentadilla con Barra (High Bar)', muscleGroup: 'Piernas', equipment: 'barbell' },
    { id: 'hack-squat', name: 'Sentadilla Hack', muscleGroup: 'Piernas', equipment: 'machine' },
    { id: 'leg-press', name: 'Prensa Inclinada', muscleGroup: 'Piernas', equipment: 'machine' },
    { id: 'bulgarian-split-squat', name: 'Sentadilla Búlgara', muscleGroup: 'Piernas', equipment: 'dumbbell', isUnilateral: true },
    { id: 'leg-extension', name: 'Extensiones de Cuádriceps', muscleGroup: 'Piernas', equipment: 'machine' },
    { id: 'goblet-squat', name: 'Sentadilla Goblet', muscleGroup: 'Piernas', equipment: 'dumbbell' },
    { id: 'romanian-deadlift', name: 'Peso Muerto Rumano (Barra)', muscleGroup: 'Piernas', equipment: 'barbell' },
    { id: 'romanian-deadlift-db', name: 'Peso Muerto Rumano (Mancuernas)', muscleGroup: 'Piernas', equipment: 'dumbbell' },
    { id: 'seated-leg-curl', name: 'Curl Femoral Sentado', muscleGroup: 'Piernas', equipment: 'machine' },
    { id: 'lying-leg-curl', name: 'Curl Femoral Tumbado', muscleGroup: 'Piernas', equipment: 'machine' },
    { id: 'hip-thrust', name: 'Hip Thrust', muscleGroup: 'Piernas', equipment: 'barbell' },
    { id: 'standing-calf-raise', name: 'Elevación Talones De Pie', muscleGroup: 'Piernas', equipment: 'machine' },
    { id: 'bodyweight-squat', name: 'Sentadilla con Peso Corporal', muscleGroup: 'Piernas', equipment: 'bodyweight' },
    { id: 'walking-lunge', name: 'Zancadas Caminando', muscleGroup: 'Piernas', equipment: 'bodyweight', isUnilateral: true },

    // ==================== BÍCEPS ====================
    { id: 'barbell-curl', name: 'Curl con Barra Recta', muscleGroup: 'Bíceps', equipment: 'barbell' },
    { id: 'ez-bar-curl', name: 'Curl con Barra Z', muscleGroup: 'Bíceps', equipment: 'barbell' },
    { id: 'incline-dumbbell-curl', name: 'Curl Inclinado (Enfoque Cabeza Larga)', muscleGroup: 'Bíceps', equipment: 'dumbbell' },
    { id: 'bayesian-curl', name: 'Curl Bayesiano (Polea)', muscleGroup: 'Bíceps', equipment: 'cable', isUnilateral: true },
    { id: 'hammer-curl', name: 'Curl Martillo', muscleGroup: 'Bíceps', equipment: 'dumbbell' },
    { id: 'chin-up-curl', name: 'Dominada Supina (Énfasis Bíceps)', muscleGroup: 'Bíceps', equipment: 'bodyweight' },

    // ==================== TRÍCEPS ====================
    { id: 'tricep-pushdown-rope', name: 'Extensión Polea con Cuerda', muscleGroup: 'Tríceps', equipment: 'cable' },
    { id: 'tricep-pushdown-bar', name: 'Extensión Polea con Barra', muscleGroup: 'Tríceps', equipment: 'cable' },
    { id: 'skull-crushers', name: 'Rompecráneos (Barra Z)', muscleGroup: 'Tríceps', equipment: 'barbell' },
    { id: 'close-grip-bench', name: 'Press Banca Agarre Cerrado', muscleGroup: 'Tríceps', equipment: 'barbell' },
    { id: 'dips-triceps', name: 'Fondos (Verticales)', muscleGroup: 'Tríceps', equipment: 'bodyweight' },
    { id: 'overhead-dumbbell-extension', name: 'Extensión de Tríceps Tras Nuca (Mancuerna)', muscleGroup: 'Tríceps', equipment: 'dumbbell' },

    // ==================== ANTEBRAZOS ====================
    { id: 'wrist-curl', name: 'Curl de Muñeca', muscleGroup: 'Antebrazos', equipment: 'barbell' },
    { id: 'farmers-walk', name: 'Paseo de Granjero', muscleGroup: 'Antebrazos', equipment: 'dumbbell' },

    // ==================== CORE / ABDOMEN ====================
    { id: 'cable-crunch', name: 'Crunch en Polea Alta', muscleGroup: 'Core / Abdomen', equipment: 'cable' },
    { id: 'hanging-leg-raises', name: 'Elevación de Piernas Colgado', muscleGroup: 'Core / Abdomen', equipment: 'bodyweight' },
    { id: 'plank', name: 'Plancha Isométrica', muscleGroup: 'Core / Abdomen', equipment: 'bodyweight' },
    { id: 'ab-wheel', name: 'Rueda Abdominal', muscleGroup: 'Core / Abdomen', equipment: 'bodyweight' }
];
