// Grupos musculares en ESPAÑOL — lo que Smart Loading espera para el redondeo
// de piernas (`muscleGroup === 'Piernas'` → +5kg). El catálogo cliente
// (exercises.js) usa ids en inglés ('legs', 'chest'...); al importar/editar
// normalizamos a español para no romper el incremento de piernas.

export const MUSCLE_OPTIONS = [
    { value: 'Pecho', label: 'Pecho' },
    { value: 'Espalda', label: 'Espalda' },
    { value: 'Hombros', label: 'Hombros' },
    { value: 'Piernas', label: 'Piernas' },
    { value: 'Bíceps', label: 'Bíceps' },
    { value: 'Tríceps', label: 'Tríceps' },
    { value: 'Antebrazos', label: 'Antebrazos' },
    { value: 'Core', label: 'Core / Abdomen' }
];

const EN_TO_ES = {
    chest: 'Pecho',
    back: 'Espalda',
    shoulders: 'Hombros',
    legs: 'Piernas',
    biceps: 'Bíceps',
    triceps: 'Tríceps',
    forearms: 'Antebrazos',
    core: 'Core',
    default: ''
};

/** Normaliza id inglés o etiqueta suelta a valor español canónico. */
export function toSpanishMuscleGroup(mg) {
    if (mg == null || mg === '' || mg === 'default') return '';
    const key = String(mg).trim();
    const lower = key.toLowerCase();
    if (EN_TO_ES[lower] !== undefined) return EN_TO_ES[lower];
    // Ya español (con o sin acento)
    const found = MUSCLE_OPTIONS.find(
        o => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower
    );
    return found ? found.value : key;
}
