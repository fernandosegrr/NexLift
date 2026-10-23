import { canonicalExerciseKey } from './exerciseIdentity.js';
import { cappedEpley1RM as epley1RM } from './performance.js';
import { personalRecordEpley1RM } from './personalRecords.js';
import { effectiveWorkoutSet } from './smartLoading.js';
import type { LegacySmartSet } from './smartLoading.js';
import { trainingCivilDate } from './calendar.js';
import type { TrainingInstant } from './calendar.js';
export interface HistorySet { readonly weight?: unknown; readonly reps?: unknown; readonly weightRight?: unknown; readonly repsRight?: unknown }
export interface EffectiveHistorySet { readonly weight: number; readonly reps: number }
export interface ProgressSession { readonly best1RM?: number; readonly weight?: number; readonly reps?: number; readonly sets?: readonly EffectiveHistorySet[] }
export interface HistoryWorkout { readonly date: TrainingInstant; readonly exercise?: { readonly name?: string | null; readonly muscleGroup?: string | null }; readonly sets?: readonly HistorySet[] | null }
export interface ExerciseHistorySession extends ProgressSession { readonly date: string; readonly best1RM: number; readonly weight: number; readonly reps: number; readonly sets: readonly EffectiveHistorySet[] }
export interface ExerciseHistoryGroup { readonly names: ReadonlySet<string>; readonly muscleGroup: string | null; readonly sessions: readonly ExerciseHistorySession[] }
export interface PlateauOptions { readonly minSessions?: number; readonly windowSize?: number }
export interface PlateauResult { readonly isPlateaued: boolean; readonly sessionsConsidered: number; readonly olderBest1RM: number; readonly recentBest1RM: number }
export interface ExercisePlateauLog { readonly date: Date; readonly sets: readonly LegacySmartSet[] }
function effectiveSet(set: HistorySet): EffectiveHistorySet | null {
    const w = parseFloat(`${set.weight}`);
    const r = parseInt(`${set.reps}`);
    if (!w || !r) return null;
    const hasRight = set.weightRight != null || set.repsRight != null;
    const weight = hasRight ? Math.min(w, parseFloat(`${set.weightRight ?? w}`)) : w;
    const reps = hasRight ? Math.min(r, parseInt(`${set.repsRight ?? r}`)) : r;
    return { weight, reps };
}

// Agrupa el historial de workouts por ejercicio CANÓNICO (consolidando variantes
// de nombre). Devuelve un Map: clave canónica -> { names, muscleGroup, sessions }
// donde sessions = [{ date, best1RM, weight, reps }] ordenadas por fecha (asc).
// Una "sesión" es un día local distinto (no se parte una sesión nocturna en dos).
export function groupTrainingHistory(history: readonly HistoryWorkout[] | null | undefined, dayKey: (instant: TrainingInstant) => string): Map<string, ExerciseHistoryGroup> {
    const pending = new Map<string, { names: Set<string>; muscleGroup: string | null; byDate: Record<string, EffectiveHistorySet[]> }>();
    (history || []).forEach(workout => {
        const rawName = workout.exercise?.name;
        if (!rawName) return;
        const key = canonicalExerciseKey(rawName);
        if (!key) return;
        let g = pending.get(key);
        if (!g) { g = { names: new Set(), muscleGroup: null, byDate: {} }; pending.set(key, g); }
        g.names.add(rawName);
        if (!g.muscleGroup && workout.exercise?.muscleGroup) g.muscleGroup = workout.exercise.muscleGroup;
        const dateKey = dayKey(workout.date);
        (workout.sets || []).forEach(set => {
            const eff = effectiveSet(set);
            if (!eff) return;
            (g.byDate[dateKey] || (g.byDate[dateKey] = [])).push(eff);
        });
    });
    const groups = new Map<string, ExerciseHistoryGroup>();
    for (const [key, g] of pending) {
        const sessions = Object.keys(g.byDate).sort().map(dateKey => {
            const sets = g.byDate[dateKey];
            let best = { weight: 0, reps: 0, rm: 0 };
            for (const s of sets) {
                const rm = epley1RM(s.weight, s.reps);
                if (rm > best.rm) best = { weight: s.weight, reps: s.reps, rm };
            }
            return { date: dateKey, best1RM: best.rm, weight: best.weight, reps: best.reps, sets };
        });
        groups.set(key, { names: g.names, muscleGroup: g.muscleGroup, sessions });
    }
    return groups;
}
// 1RM "actual" robusto: el mejor de las últimas N sesiones (evita que un mal día
// hunda el punto de partida o que un pico antiguo lo infle). Úsalo para tendencias
// generales (p. ej. la pendiente de progreso); para juzgar si se CUMPLIÓ una meta
// concreta usa bestOneRepMaxForTarget, que es más conservador.
export function best1RMRecent(sessions: readonly ProgressSession[] | null | undefined, n = 3): number {
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
export function bestOneRepMaxForTarget(sessions: readonly ProgressSession[] | null | undefined, targetReps: unknown, n = 3): number {
    if (!sessions || !sessions.length) return 0;
    const maxEligibleReps = (Number(targetReps) || 1) + 1;

    const eligible = [];
    for (const s of sessions) {
        const daySets = (s.sets && s.sets.length) ? s.sets : [{ weight: s.weight, reps: s.reps }];
        const bestEligibleRM = Math.max(
            0,
            ...daySets.filter(x => Number(x.reps) <= maxEligibleReps).map(x => epley1RM(x.weight, x.reps))
        );
        if (bestEligibleRM > 0) eligible.push(bestEligibleRM);
    }

    const recent = eligible.slice(-n);
    return recent.length ? Math.max(...recent) : 0;
}

// Plateau: la mejor marca de la mitad reciente de la ventana no SUPERA a la de la
// mitad antigua (un empate cuenta como estancamiento, no como progreso). Ventana =
// últimas min(windowSize, count) sesiones; split floor/ceil (6->3+3, 5->2+3, 4->2+2).
// Requiere >=minSessions sesiones totales para tener señal (si no, isPlateaued=false).
export function detectPlateau(sessions: readonly ProgressSession[] | null | undefined, { minSessions = 4, windowSize = 6 }: PlateauOptions = {}): PlateauResult {
    if (!sessions || sessions.length < minSessions) {
        return { isPlateaued: false, sessionsConsidered: sessions?.length || 0, olderBest1RM: 0, recentBest1RM: 0 };
    }
    const sampleWindow = sessions.slice(-Math.min(windowSize, sessions.length));
    const splitAt = Math.floor(sampleWindow.length / 2);
    const olderHalf = sampleWindow.slice(0, splitAt);
    const recentHalf = sampleWindow.slice(splitAt);

    const olderBest1RM = Math.max(0, ...olderHalf.map(s => s.best1RM || 0));
    const recentBest1RM = Math.max(0, ...recentHalf.map(s => s.best1RM || 0));

    return {
        isPlateaued: recentBest1RM <= olderBest1RM,
        sessionsConsidered: sampleWindow.length,
        olderBest1RM,
        recentBest1RM
    };
}

/** Caller chooses ID/name grouping and SQL sampleWindow. Empty civil days and
 * incomplete sets count by compatibility; this is not a fatigue diagnosis. */
export function detectPlateauForExercise(workoutLogs: readonly ExercisePlateauLog[]): boolean {
    const byDay = new Map<string, number>();
    for (const log of workoutLogs) {
        const dayKey = trainingCivilDate(log.date);
        let best = byDay.get(dayKey) || 0;
        for (const set of log.sets) {
            const eff = effectiveWorkoutSet(set);
            if (eff.weight <= 0 || eff.reps <= 0) continue;
            const rm = personalRecordEpley1RM(eff.weight, eff.reps);
            if (rm > best) best = rm;
        }
        byDay.set(dayKey, best);
    }
    const sessions = [...byDay.keys()].sort().map(day => ({ best1RM: byDay.get(day) || 0 }));
    return detectPlateau(sessions).isPlateaued;
}
export interface RegressionPoint { readonly x: number; readonly y: number }
export interface RegressionResult { readonly slope: number; readonly r2: number }
export function linearRegression(dataPoints: readonly RegressionPoint[] | null | undefined): RegressionResult {
    if (!dataPoints || dataPoints.length < 2) return { slope: 0, r2: 0 };
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = dataPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = dataPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = dataPoints.reduce((sum, p) => sum + p.x * p.x, 0);
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return { slope: 0, r2: 0 };
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const yMean = sumY / n;
    const ssTotal = dataPoints.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0);
    const ssResidual = dataPoints.reduce((sum, p) => sum + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
    const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
    return { slope, r2 };
}
