// Estándares de fuerza aproximados: múltiplo de 1RM respecto al peso corporal.
// Valores generales de referencia (adulto). No distingue sexo; es una guía.
// Niveles crecientes.
export const STRENGTH_LEVELS = ['Principiante', 'Novato', 'Intermedio', 'Avanzado', 'Élite'];

// ratios = [Principiante, Novato, Intermedio, Avanzado, Élite]
export const STRENGTH_STANDARDS = [
    { key: 'Press de banca', match: ['banca', 'bench'], ratios: [0.5, 0.75, 1.0, 1.5, 2.0] },
    { key: 'Sentadilla', match: ['sentadilla', 'squat'], ratios: [0.75, 1.25, 1.5, 2.25, 2.75] },
    { key: 'Peso muerto', match: ['peso muerto', 'muerto', 'deadlift'], ratios: [1.0, 1.5, 2.0, 2.5, 3.0] },
    { key: 'Press militar', match: ['militar', 'overhead', 'ohp'], ratios: [0.35, 0.55, 0.7, 0.9, 1.1] },
    { key: 'Remo con barra', match: ['remo'], ratios: [0.5, 0.75, 1.0, 1.3, 1.6] },
    { key: 'Hip thrust', match: ['hip thrust', 'empuje de cadera'], ratios: [1.0, 1.5, 2.0, 2.75, 3.5] },
    { key: 'Curl de bíceps', match: ['curl'], ratios: [0.2, 0.35, 0.5, 0.65, 0.85] },
    { key: 'Dominadas', match: ['dominada', 'pull-up', 'pull up'], ratios: [0.0, 0.1, 0.3, 0.6, 1.0] },
];

// Las palabras clave de "match" son ASCII, así que basta con minúsculas (los acentos
// en el resto del nombre no afectan a includes()).
export function matchStandard(name) {
    const n = (name || '').toLowerCase();
    return STRENGTH_STANDARDS.find(s => s.match.some(m => n.includes(m))) || null;
}
