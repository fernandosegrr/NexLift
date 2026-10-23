const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'o', 'u', 'y', 'a', 'con', 'al', 'para', 'una', 'un']);

// Grupos musculares: cuando aparecen ENTRE PARÉNTESIS son una aclaración
// redundante ("curl martillo (bíceps)") y deben ignorarse. Fuera de paréntesis
// sí pueden ser parte del nombre ("curl femoral"), así que NO se tocan ahí.
const MUSCLE_WORDS = new Set([
    'biceps', 'triceps', 'pecho', 'pectoral', 'pectorales', 'espalda', 'dorsal', 'dorsales',
    'hombro', 'hombros', 'deltoides', 'pierna', 'piernas', 'cuadriceps', 'cuadricep',
    'femoral', 'femorales', 'gluteo', 'gluteos', 'gemelo', 'gemelos', 'pantorrilla', 'pantorrillas',
    'core', 'abdomen', 'abdominales', 'abs', 'trapecio', 'trapecios', 'antebrazo', 'antebrazos',
    'aductor', 'aductores', 'abductor', 'abductores',
]);

// Quita los paréntesis cuyo contenido es solo un grupo muscular (aclaración).
// El resto de paréntesis (equipamiento, variante) se conserva sin los símbolos.
function stripMuscleParentheticals(s: string): string {
    return s.replace(/\(([^)]*)\)/g, (_: string, inner: string) => {
        const words = inner.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .split(/[\s,/]+/).filter(Boolean);
        const allMuscle = words.length > 0 && words.every(w => MUSCLE_WORDS.has(w));
        return allMuscle ? ' ' : ` ${inner} `;
    });
}

// Sinónimos / abreviaturas / plurales → forma canónica. Conservador a propósito.
const SYNONYMS: Readonly<Record<string, string>> = {
    elev: 'elevacion', elevaciones: 'elevacion', elevacion: 'elevacion',
    lateral: 'lateral', laterales: 'lateral', lat: 'lateral',
    ext: 'extension', extension: 'extension', extensiones: 'extension',
    flex: 'flexion', flexion: 'flexion', flexiones: 'flexion',
    curls: 'curl', curl: 'curl',
    cruce: 'cruce', cruces: 'cruce',
    maq: 'maquina', maquina: 'maquina',
    mancuerna: 'mancuerna', mancuernas: 'mancuerna',
    post: 'posterior', posterior: 'posterior',
    ant: 'anterior', anterior: 'anterior',
    unilat: 'unilateral', unilateral: 'unilateral',
    bilat: 'bilateral', bilateral: 'bilateral',
    pierna: 'pierna', piernas: 'pierna',
    inverso: 'inverso', inversos: 'inverso',
    sentado: 'sentado', sentada: 'sentado',
};

// Normalización ligera para mostrar/comparar de forma básica:
// minúsculas, sin tildes, sin prefijo de orden ("A1.", "1)"), puntuación → espacio.
export function normalizeExerciseName(name: string | null | undefined): string {
    return stripMuscleParentheticals(name || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita tildes
        .replace(/^[a-z]?\d+[.):\-\s]+/i, '')               // prefijo de orden: "a1.", "1)", "3 - "
        .replace(/[()'"´`.,;/]/g, ' ')                      // puntuación → espacio
        .replace(/\s+/g, ' ')
        .trim();
}

// Clave canónica robusta para AGRUPAR variantes del mismo ejercicio.
// Quita relleno y unifica sinónimos/plurales. No reordena tokens para no
// fusionar movimientos distintos por accidente.
export function canonicalExerciseKey(name: string | null | undefined): string {
    const tokens = normalizeExerciseName(name)
        .split(' ')
        .filter(t => t && !STOPWORDS.has(t))
        .map(t => SYNONYMS[t] || t);
    return tokens.join(' ');
}

// ¿Son el mismo ejercicio (por nombre)?
export function isSameExercise(a: string | null | undefined, b: string | null | undefined): boolean {
    return canonicalExerciseKey(a) === canonicalExerciseKey(b);
}

