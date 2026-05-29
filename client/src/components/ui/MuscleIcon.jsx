/**
 * MuscleIcon - Emojis de grupos musculares
 * 
 * Usando emojis porque representan mejor los músculos que iconos genéricos
 */

// Emojis y colores por grupo muscular
const MUSCLE_DATA = {
    chest: { emoji: '🏋️', name: 'Pecho', color: '#ef4444' },
    back: { emoji: '🧍', name: 'Espalda', color: '#f97316' },
    shoulders: { emoji: '🔺', name: 'Hombros', color: '#eab308' },
    biceps: { emoji: '💪', name: 'Bíceps', color: '#22c55e' },
    triceps: { emoji: '🦾', name: 'Tríceps', color: '#14b8a6' },
    forearms: { emoji: '👊', name: 'Antebrazos', color: '#06b6d4' },
    legs: { emoji: '🦵', name: 'Piernas', color: '#3b82f6' },
    quadriceps: { emoji: '🦵', name: 'Cuádriceps', color: '#3b82f6' },
    hamstrings: { emoji: '🦿', name: 'Isquiotibiales', color: '#6366f1' },
    glutes: { emoji: '🍑', name: 'Glúteos', color: '#8b5cf6' },
    calves: { emoji: '🦶', name: 'Pantorrillas', color: '#a855f7' },
    core: { emoji: '🎯', name: 'Core', color: '#ec4899' },
    cardio: { emoji: '❤️', name: 'Cardio', color: '#f43f5e' },
    default: { emoji: '⚡', name: 'Otro', color: '#a1a1aa' }
};

/**
 * Componente MuscleIcon - Muestra emoji del grupo muscular
 */
export default function MuscleIcon({
    muscle = 'default',
    size = 24,
    className = ''
}) {
    const data = MUSCLE_DATA[muscle] || MUSCLE_DATA.default;

    return (
        <span
            className={className}
            style={{ fontSize: size * 0.8 }}
            role="img"
            aria-label={data.name}
        >
            {data.emoji}
        </span>
    );
}

/**
 * Obtener color de un grupo muscular
 */
export function getMuscleColor(muscle) {
    return MUSCLE_DATA[muscle]?.color || MUSCLE_DATA.default.color;
}

/**
 * Obtener nombre de un grupo muscular
 */
export function getMuscleName(muscle) {
    return MUSCLE_DATA[muscle]?.name || MUSCLE_DATA.default.name;
}

/**
 * Obtener emoji de un grupo muscular
 */
export function getMuscleEmoji(muscle) {
    return MUSCLE_DATA[muscle]?.emoji || MUSCLE_DATA.default.emoji;
}

/**
 * Lista de todos los grupos musculares
 */
export const MUSCLE_LIST = Object.entries(MUSCLE_DATA)
    .filter(([id]) => id !== 'default')
    .map(([id, data]) => ({
        id,
        ...data
    }));
