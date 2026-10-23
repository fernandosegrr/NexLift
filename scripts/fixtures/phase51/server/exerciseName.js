// Utilidades para identificar el "mismo" ejercicio aunque su nombre varíe entre
// rutinas (abreviaturas, plurales, prefijos de orden, equipamiento entre
// paréntesis, tildes, etc.). El historial del usuario suele quedar fragmentado
// por estas variaciones; aquí lo consolidamos de forma SEGURA: solo se agrupan
// variantes claras del mismo movimiento, nunca ejercicios genuinamente distintos
// (p. ej. "press inclinado (mancuernas)" ≠ "press inclinado (hammer o smith)").
//
// Port literal de client/src/utils/exerciseName.js — mantener ambas copias en
// sincronía manualmente si se corrige algo aquí (no hay carpeta shared/, se
// eliminó a propósito al migrar a Docker; ver CLAUDE.md).

// Palabras de relleno que no aportan a la identidad del ejercicio.
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
function stripMuscleParentheticals(s) {
    return s.replace(/\(([^)]*)\)/g, (_, inner) => {
        const words = inner.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .split(/[\s,/]+/).filter(Boolean);
        const allMuscle = words.length > 0 && words.every(w => MUSCLE_WORDS.has(w));
        return allMuscle ? ' ' : ` ${inner} `;
    });
}

// Sinónimos / abreviaturas / plurales → forma canónica. Conservador a propósito.
const SYNONYMS = {
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
export function normalizeExerciseName(name) {
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
export function canonicalExerciseKey(name) {
    const tokens = normalizeExerciseName(name)
        .split(' ')
        .filter(t => t && !STOPWORDS.has(t))
        .map(t => SYNONYMS[t] || t);
    return tokens.join(' ');
}

// ¿Son el mismo ejercicio (por nombre)?
export function isSameExercise(a, b) {
    return canonicalExerciseKey(a) === canonicalExerciseKey(b);
}

// 1RM estimado (Epley) con guardas. Reps fuera de [1,36] se acotan para no inflar.
export function epley1RM(weight, reps) {
    const w = Number(weight) || 0;
    let r = Number(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    if (r > 36) r = 36;
    return w * (1 + r / 30);
}

// Valores efectivos de una serie: en unilateral usa el lado débil (limita el progreso).
function effectiveSet(set) {
    const w = parseFloat(set.weight);
    const r = parseInt(set.reps);
    if (!w || !r) return null;
    const hasRight = set.weightRight != null || set.repsRight != null;
    const weight = hasRight ? Math.min(w, parseFloat(set.weightRight ?? w)) : w;
    const reps = hasRight ? Math.min(r, parseInt(set.repsRight ?? r)) : r;
    return { weight, reps };
}

// Agrupa el historial de workouts por ejercicio CANÓNICO (consolidando variantes
// de nombre). Devuelve un Map: clave canónica -> { names, muscleGroup, sessions }
// donde sessions = [{ date, best1RM, weight, reps }] ordenadas por fecha (asc).
// Una "sesión" es un día local distinto (no se parte una sesión nocturna en dos).
export function groupHistoryByExercise(history) {
    const groups = new Map();

    (history || []).forEach(workout => {
        const rawName = workout.exercise?.name;
        if (!rawName) return;
        const key = canonicalExerciseKey(rawName);
        if (!key) return;

        let g = groups.get(key);
        if (!g) {
            g = { names: new Set(), muscleGroup: null, _byDate: {} };
            groups.set(key, g);
        }
        g.names.add(rawName);
        if (!g.muscleGroup && workout.exercise?.muscleGroup) {
            g.muscleGroup = workout.exercise.muscleGroup;
        }

        const dateKey = new Date(workout.date).toLocaleDateString('en-CA'); // fecha LOCAL
        (workout.sets || []).forEach(set => {
            const eff = effectiveSet(set);
            if (!eff) return;
            (g._byDate[dateKey] || (g._byDate[dateKey] = [])).push(eff);
        });
    });

    // Convierte cada grupo: días -> array ordenado con mejor 1RM por sesión.
    // Se conserva también el array `sets` completo del día (no solo el ganador),
    // porque el "mejor Epley del día" a veces sale de una serie submáxima de
    // muchas reps y no es representativo de la fuerza cerca de una meta a pocas
    // reps — ver bestOneRepMaxForTarget().
    for (const g of groups.values()) {
        g.sessions = Object.keys(g._byDate).sort().map(dateKey => {
            const sets = g._byDate[dateKey];
            let best = { weight: 0, reps: 0, rm: 0 };
            for (const s of sets) {
                const rm = epley1RM(s.weight, s.reps);
                if (rm > best.rm) best = { weight: s.weight, reps: s.reps, rm };
            }
            return { date: dateKey, best1RM: best.rm, weight: best.weight, reps: best.reps, sets };
        });
        delete g._byDate;
    }

    return groups;
}

// 1RM "actual" robusto: el mejor de las últimas N sesiones (evita que un mal día
// hunda el punto de partida o que un pico antiguo lo infle). Úsalo para tendencias
// generales (p. ej. la pendiente de progreso); para juzgar si se CUMPLIÓ una meta
// concreta usa bestOneRepMaxForTarget, que es más conservador.
export function best1RMRecent(sessions, n = 3) {
    if (!sessions || !sessions.length) return 0;
    const recent = sessions.slice(-n);
    return Math.max(0, ...recent.map(s => s.best1RM || 0));
}

// 1RM "cercano a la meta": el mejor Epley entre series con reps <= targetReps + 1,
// de las últimas N sesiones que SÍ tengan una serie así de cercana al objetivo.
//
// Por qué: el Epley de una serie submáxima de muchas reps (p. ej. 100kg x7) puede
// superar en teoría el de un intento real cercano al máximo (p. ej. 115kg x1 real,
// a RPE 10) solo porque la fórmula extrapola mucho más lejos. Si esa serie de 7
// reps ocurrió el mismo día que un intento real de 1 rep, tomar "el mejor Epley
// del día" se queda con la extrapolación en vez del dato real. Limitar las series
// elegibles a las cercanas en reps al objetivo evita ese falso positivo y hace que
// "cumplido" solo dependa de esfuerzos genuinamente cercanos a esa exigencia.
// Sesiones sin ninguna serie elegible ese día no cuentan como evidencia (ni a
// favor ni en contra) para esta meta.
export function bestOneRepMaxForTarget(sessions, targetReps, n = 3) {
    if (!sessions || !sessions.length) return 0;
    const maxEligibleReps = (Number(targetReps) || 1) + 1;

    const eligible = [];
    for (const s of sessions) {
        const daySets = (s.sets && s.sets.length) ? s.sets : [{ weight: s.weight, reps: s.reps }];
        const bestEligibleRM = Math.max(
            0,
            ...daySets.filter(x => x.reps <= maxEligibleReps).map(x => epley1RM(x.weight, x.reps))
        );
        if (bestEligibleRM > 0) eligible.push(bestEligibleRM);
    }

    const recent = eligible.slice(-n);
    return recent.length ? Math.max(...recent) : 0;
}
