import { trainingCivilDate, trainingCivilWeek, shiftTrainingCivilDate } from '../training/calendar.js';
import { trainingLoadVolume } from '../training/volume.js';
import { detectPlateau } from '../training/progress.js';
import { cappedEpley1RM } from '../training/performance.js';
import { canonicalExerciseKey } from '../training/exerciseIdentity.js';
import { computeWorkoutSuggestion, parseRepRange, resolveWeightIncrement, adjustRepRangeForPhase } from '../training/smartLoading.js';
import { COACH_VERSION, COACH_MUSCLES, COACH_STATE_LABELS, COACH_RULE_LABELS } from './types.js';
import type { CoachInput, CoachMuscle, CoachExerciseConfig, CoachSession, CoachSet, CoachVolume, MuscleWeek, CoachRecovery, CoachPlateau, CoachLoading, CoachHypertrophy, CoachReport, CoachFact, CoachView, CoachAnswer } from './types.js';

const round = (n: number): number => Math.round(n * 1000) / 1000;
const mean = (n: readonly number[]): number | null => n.length ? round(n.reduce((a, b) => a + b, 0) / n.length) : null;
const day = (s: string): string => trainingCivilDate(s);
const gap = (a: string, b: string): number => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const valid = (s: CoachSet): boolean => s.completed && Number.isFinite(s.weight) && s.weight >= 0 && s.weight <= 1000 && Number.isInteger(s.reps) && s.reps > 0 && s.reps <= 100 &&
    (s.weightRight == null || Number.isFinite(s.weightRight) && s.weightRight >= 0 && s.weightRight <= 1000) &&
    (s.repsRight == null || Number.isInteger(s.repsRight) && s.repsRight > 0 && s.repsRight <= 100);
const rir = (s: CoachSet): number | null => Number.isInteger(s.rpe) && s.rpe != null && s.rpe >= 6 && s.rpe <= 10 ? 10 - s.rpe : null;
const working = (s: CoachSession): CoachSet[] => s.sets.filter(valid);
const inPeriod = (s: string, input: CoachInput): boolean => day(s) >= shiftTrainingCivilDate(day(input.now), 1 - input.days) && day(s) <= day(input.now);
const load = (sets: readonly CoachSet[]): number => round(trainingLoadVolume(sets, 'recorded-sides'));
const muscleAliases: Record<string, CoachMuscle> = { pecho: 'chest', espalda: 'back', hombros: 'shoulders', piernas: 'legs', biceps: 'biceps', triceps: 'triceps', antebrazos: 'forearms', abdomen: 'core', abdominales: 'core' };
export function coachMuscle(value: string | null): CoachMuscle | null {
    const key = canonicalExerciseKey(value || '');
    return COACH_MUSCLES.includes(key as CoachMuscle) ? key as CoachMuscle : muscleAliases[key] || null;
}
/** Explicit product catalog, NOT universal scientific coefficients. Exact identities only.
 * Unknown compounds never acquire secondary muscles through fuzzy name matching. */
export const COACH_ATTRIBUTION = [
    { names: ['Press de Banca con Barra', 'Press banca', 'Press Inclinado con Barra', 'Press Plano con Mancuernas', 'Press Inclinado con Mancuernas', 'Press de Pecho en Máquina'], direct: 'chest', secondary: ['triceps', 'shoulders'] },
    { names: ['Dominadas', 'Jalón al Pecho', 'Jalón al Pecho en Polea', 'Remo con Barra', 'Remo con Mancuerna', 'Remo en Polea Baja'], direct: 'back', secondary: ['biceps'] },
    { names: ['Press Militar con Barra', 'Press de Hombros con Mancuernas'], direct: 'shoulders', secondary: ['triceps'] }
] as const;
export function analyzeCoachVolume(input: CoachInput): CoachVolume {
    const today = day(input.now), start = shiftTrainingCivilDate(today, 1 - input.days), weeks = new Map<string, MuscleWeek>(), dates = new Map<string, Set<string>>();
    const configs = new Map(input.configs.map(c => [c.exerciseId, c]));
    const unknown = new Map<string, { exerciseId: string; name: string; sets: number }>();
    for (let anchor = trainingCivilWeek(start + 'T12:00:00-06:00').startDay; anchor <= today; anchor = shiftTrainingCivilDate(anchor, 7)) {
        for (const muscle of COACH_MUSCLES) { const key = anchor + muscle; weeks.set(key, { muscle, week: anchor, direct: 0, indirect: 0, frequency: 0, previousDirect: null, directDelta: null, loadKgReps: 0, contributions: [] }); dates.set(key, new Set()); }
    }
    for (const session of input.sessions.filter(s => inPeriod(s.date, input))) {
        const sets = working(session); if (!sets.length) continue;
        const config = configs.get(session.exerciseId);
        const catalog = COACH_ATTRIBUTION.find(e => e.names.some(n => canonicalExerciseKey(n) === canonicalExerciseKey(session.name)));
        const direct = config?.directMuscle || coachMuscle(session.muscleGroup) || catalog?.direct || null;
        if (!direct) { const entry = unknown.get(session.exerciseId) || { exerciseId: session.exerciseId, name: session.name, sets: 0 }; entry.sets += sets.length; unknown.set(session.exerciseId, entry); continue; }
        // Explicit direct classification that differs from the catalog disables inherited secondary attribution.
        const secondaries = config ? config.secondaryMuscles : catalog?.direct === direct ? [...catalog.secondary] : [];
        const factor = config?.indirectWeight ?? 0.5;
        const week = trainingCivilWeek(session.date).startDay;
        for (const muscle of [direct, ...new Set(secondaries.filter(m => m !== direct))]) {
            const key = week + muscle, entry = weeks.get(key); if (!entry) continue;
            const isDirect = muscle === direct;
            const directSets = isDirect ? sets.length : 0, indirectSets = isDirect ? 0 : round(sets.length * factor);
            entry.direct += directSets; entry.indirect = round(entry.indirect + indirectSets);
            if (isDirect) entry.loadKgReps = round(entry.loadKgReps + load(sets));
            dates.get(key)?.add(day(session.date));
            entry.contributions.push({ sessionId: session.id, exerciseId: session.exerciseId, name: session.name, routineId: session.routineId, blockId: session.blockId, direct: directSets, indirect: indirectSets,
                source: config ? 'Clasificación voluntaria actual; atribución retrospectiva revisable' : catalog ? 'Catálogo NexLift Coach v1; heurística revisable' : 'Grupo muscular observado; participación secundaria desconocida' });
        }
    }
    for (const entry of weeks.values()) {
        entry.frequency = dates.get(entry.week + entry.muscle)?.size || 0;
        const previous = weeks.get(shiftTrainingCivilDate(entry.week, -7) + entry.muscle);
        // Only compare fully observed calendar weeks; a partial week is never a regression.
        if (previous && previous.week >= start && shiftTrainingCivilDate(entry.week, 7) <= shiftTrainingCivilDate(today, 1)) {
            entry.previousDirect = previous.direct; entry.directDelta = entry.direct - previous.direct;
        }
    }
    return { weeks: [...weeks.values()], unknown: [...unknown.values()], partialCurrentWeek: trainingCivilWeek(input.now).endDayExclusive !== shiftTrainingCivilDate(today, 1),
        policy: 'Una fila de serie completada con repeticiones válidas = una serie directa, incluso unilateral; no se cuentan dos músculos por los dos lados. Participación indirecta estimada ×0.5 por defecto, configurable 0–1. kg×reps se muestra por separado. Cero registros no demuestra cero entrenamiento; las semanas parciales no se comparan.' };
}

export function analyzeCoachRecovery(input: CoachInput): CoachRecovery {
    const today = day(input.now), recentStart = shiftTrainingCivilDate(today, -6), baselineStart = shiftTrainingCivilDate(today, -34);
    const eligible = input.checkIns.filter(c => c.date >= baselineStart && c.date <= today);
    const recent: CoachRecovery['recent'] = [];
    for (const field of ['sleepHours', 'sleepQuality', 'energy', 'fatigue', 'stress'] as const) {
        const r = eligible.filter(c => c.date >= recentStart).map(c => c[field]).filter((n): n is number => n != null && Number.isFinite(n));
        const b = eligible.filter(c => c.date < recentStart).map(c => c[field]).filter((n): n is number => n != null && Number.isFinite(n));
        const value = mean(r); if (value != null) recent.push({ field, value, baseline: mean(b), n: r.length, baselineN: b.length });
    }
    const recentSessions = input.sessions.filter(s => day(s.date) >= recentStart && day(s.date) <= today && working(s).length);
    const previousSessions = input.sessions.filter(s => day(s.date) >= shiftTrainingCivilDate(recentStart, -7) && day(s.date) < recentStart && working(s).length);
    const last = input.sessions.filter(s => day(s.date) <= today && working(s).length).map(s => day(s.date)).sort().at(-1);
    const observations: string[] = [], hypotheses: string[] = [];
    const labels = { sleepHours: 'horas de sueño', sleepQuality: 'calidad de sueño', energy: 'energía', fatigue: 'fatiga', stress: 'estrés' };
    let changed = 0;
    for (const metric of recent) if (metric.n >= 3 && metric.baselineN >= 5 && metric.baseline != null) {
        const delta = metric.value - metric.baseline;
        observations.push(`${labels[metric.field as keyof typeof labels]}: media reciente ${metric.value} (${metric.n} registros), referencia individual ${metric.baseline} (${metric.baselineN} registros).`);
        if (['sleepHours', 'sleepQuality', 'energy'].includes(metric.field) ? delta <= -1 : delta >= 1) changed++;
    }
    const sufficient = recent.some(m => m.n >= 3 && m.baselineN >= 5);
    const soreness = eligible.filter(c => c.date >= recentStart).flatMap(c => Object.entries(c.soreness).filter(([, n]) => n != null && n >= 3).map(([zone]) => zone));
    if (soreness.length) observations.push(`Molestias altas declaradas en ${[...new Set(soreness)].join(', ')}; no es una evaluación de lesión.`);
    if (changed) hypotheses.push('Algunos cambios de bienestar coinciden con el entrenamiento reciente. La coincidencia no demuestra causalidad ni recuperación biológica exacta.');
    return { status: !sufficient ? 'insufficient' : changed ? 'caution' : 'usual', observations, hypotheses,
        limitations: ['Referencia: 28 días anteriores a los 7 recientes; mínimo 3 observaciones recientes y 5 previas por variable. Son umbrales operativos, sin calibración fisiológica.', 'Sueño, estrés y molestias son datos declarados y opcionales. No se modifica la rutina ni se diagnostica sobreentrenamiento.'], recent,
        trainingDays: new Set(recentSessions.map(s => day(s.date))).size, restDaysSinceLast: last ? gap(last, today) : null,
        loadRecent: load(recentSessions.flatMap(working)), loadPrevious: load(previousSessions.flatMap(working)),
        rirRecent: mean(recentSessions.flatMap(working).map(rir).filter((n): n is number => n != null)),
        rirPrevious: mean(previousSessions.flatMap(working).map(rir).filter((n): n is number => n != null)) };
}

export function analyzeCoachPlateau(exerciseId: string, input: CoachInput): CoachPlateau {
    const exercise = input.exercises.find(e => e.id === exerciseId);
    // Group same civil day to avoid manufacturing independent samples from partial saves.
    const byDate = new Map<string, CoachSession>();
    for (const s of input.sessions.filter(s => s.exerciseId === exerciseId && day(s.date) <= day(input.now)).sort((a, b) => a.date.localeCompare(b.date))) {
        const key = day(s.date), existing = byDate.get(key);
        if (existing) byDate.set(key, { ...existing, sets: [...existing.sets, ...s.sets], routineId: existing.routineId === s.routineId ? s.routineId : 'mixed-context' });
        else byDate.set(key, { ...s, sets: [...s.sets] });
    }
    const sessions = [...byDate.values()].filter(s => working(s).length).slice(-10);
    const points = sessions.map(s => {
        const sets = working(s);
        // Conservative unilateral estimate: both sides must be explicitly present.
        const eligible = sets.filter(v => v.weight > 0 && v.reps <= 12 && (!s.unilateral || v.weightRight != null && v.repsRight != null && v.repsRight <= 12));
        const e1rm = Math.max(0, ...eligible.map(v => s.unilateral ? Math.min(cappedEpley1RM(v.weight, v.reps), cappedEpley1RM(v.weightRight, v.repsRight)) : cappedEpley1RM(v.weight, v.reps)));
        return { date: day(s.date), e1rm: round(e1rm), sets: sets.length, reps: mean(sets.map(v => v.reps)) || 0, rir: mean(sets.map(rir).filter((n): n is number => n != null)), load: load(sets) };
    });
    const core = detectPlateau(points.map(p => ({ best1RM: p.e1rm })), { minSessions: 6, windowSize: 10 });
    const half = Math.floor(points.length / 2), older = points.slice(0, half), newer = points.slice(half);
    const previous = mean(older.map(p => p.e1rm)), recent = mean(newer.map(p => p.e1rm));
    const result: CoachPlateau = { exerciseId, name: exercise?.name || sessions[0]?.name || exerciseId, state: 'insufficient', sessions: sessions.length,
        from: points[0]?.date || null, to: points.at(-1)?.date || null, previous, recent, previousReps: mean(older.map(p => p.reps)), recentReps: mean(newer.map(p => p.reps)),
        previousRir: mean(older.map(p => p.rir).filter((n): n is number => n != null)), recentRir: mean(newer.map(p => p.rir).filter((n): n is number => n != null)),
        lastTrainedDays: points.length ? gap(points.at(-1)?.date || day(input.now), day(input.now)) : null,
        evidence: 'insufficient', observations: [], hypotheses: [], missing: [], action: 'Registra más sesiones comparables y RIR antes de cambiar el entrenamiento.', points, corePlateau: core.isPlateaued };
    if (sessions.length < 6 || !previous || !recent || points.some(p => p.e1rm <= 0) || gap(result.from || day(input.now), result.to || day(input.now)) < 14) {
        result.missing.push('Se requieren 6 días con series completas comparables, distribuidos en al menos 14 días; e1RM solo con 1–12 repeticiones y cargas positivas.'); return result;
    }
    const contexts = new Set(sessions.map(s => JSON.stringify([s.routineId, s.unilateral, s.equipment || null, s.repRange || null, s.blockId, s.phase, canonicalExerciseKey(s.name)])));
    const counts = points.map(p => p.sets), repetitions = points.map(p => p.reps);
    const config = input.configs.find(c => c.exerciseId === exerciseId);
    const changedConfig = !!config && config.updatedAt > sessions[0]!.date;
    const interrupted = points.some((p, i) => i > 0 && gap(points[i - 1]!.date, p.date) > 21);
    const incomplete = sessions.some(s => s.sets.some(v => !valid(v)));
    if (contexts.size !== 1 || Math.min(...counts) < Math.max(...counts) * 0.75 || Math.min(...repetitions) < Math.max(...repetitions) * 0.65 || changedConfig || interrupted || incomplete || sessions.some(s => s.phase === 'deload')) {
        result.state = 'context_changed'; result.observations.push('Cambió el contexto, las series, el rango observado, la clasificación, o existe una interrupción >21 días, descarga o sesión incompleta.');
        result.action = 'Compara sesiones con el mismo contexto antes de atribuir el cambio a un estancamiento.'; return result;
    }
    const ratio = recent / previous, rirDelta = result.previousRir != null && result.recentRir != null ? result.recentRir - result.previousRir : null;
    const max = Math.max(...points.map(p => p.e1rm)), min = Math.min(...points.map(p => p.e1rm));
    result.evidence = points.length >= 8 ? 'repeated' : 'limited';
    result.missing.push('El equipo y la prescripción histórica pueden no haberse capturado. Sin evidencia longitudinal, esta clasificación sigue siendo orientativa.');
    if (max / min > 1.5) { result.state = 'contradictory'; result.observations.push('Dispersión extrema (>50%) entre estimaciones; revisa posibles valores atípicos.'); }
    else if (rirDelta != null && Math.abs(rirDelta) >= 1 && (ratio <= 1.02 && rirDelta > 0 || ratio >= 0.98 && rirDelta < 0)) { result.state = 'contradictory'; result.observations.push('El RIR cambió al menos una unidad y altera la interpretación del rendimiento.'); }
    else if (ratio > 1.02 && !core.isPlateaued) { result.state = 'progress'; result.action = 'Mantén el seguimiento con condiciones comparables.'; }
    else if (ratio < 0.95 && Math.max(...newer.map(p => p.e1rm)) < Math.max(...older.map(p => p.e1rm)) * 0.98) { result.state = 'regression'; result.action = 'Revisa registros, descanso y contexto; prueba un ajuste prudente solo si tú lo decides.'; }
    else if (core.isPlateaued && points.length >= 8 && gap(result.from!, result.to!) >= 28 && rirDelta != null && Math.abs(rirDelta) < 1 && (result.lastTrainedDays || 0) <= 14) {
        result.state = 'possible_plateau'; result.action = 'Revisa técnica, adherencia y recuperación. Puedes probar un pequeño ajuste de carga o volumen y observar varias sesiones.';
    } else { result.state = 'maintenance'; result.action = 'La estabilidad puede ser normal. Mantén el seguimiento antes de intervenir.'; }
    result.observations.push(`Media e1RM previa ${previous} kg; reciente ${recent} kg; ${points.length} días observados desde ${result.from}.`);
    if (input.checkIns.length) result.hypotheses.push('Los check-ins aportan contexto de bienestar; no explican por sí solos la causa de esta tendencia.');
    if (rirDelta == null) result.missing.push('Falta RIR en ambas mitades; no se etiqueta posible estancamiento sin él.');
    return result;
}

export function recommendCoachLoading(exerciseId: string, input: CoachInput, recovery: CoachRecovery, currentSets: readonly CoachSet[] = []): CoachLoading {
    const exercise = input.exercises.find(e => e.id === exerciseId), config: CoachExerciseConfig | undefined = input.configs.find(c => c.exerciseId === exerciseId);
    const sessions = input.sessions.filter(s => s.exerciseId === exerciseId && day(s.date) <= day(input.now) && working(s).length).sort((a, b) => b.date.localeCompare(a.date));
    const activeBlock = input.blocks.filter(b => b.routineId === sessions[0]?.routineId && b.startedAt <= input.now).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
    const phase = activeBlock?.phase || sessions[0]?.phase || null;
    const v1 = exercise ? computeWorkoutSuggestion(sessions, exercise.targetReps, resolveWeightIncrement(exercise.muscleGroup, exercise.name), phase) : null;
    const result: CoachLoading = { exerciseId, recommendation: null, reference: null, rule: 'insufficient', increment: config?.increment ?? null, delta: null, equipment: config?.equipment ?? null,
        adjustment: 'Sin ajuste; falta una configuración verificable.', evidence: 'insufficient', limitations: ['Sugerencia voluntaria de desarrollo; no sustituye el peso introducido. V1 permanece como referencia funcional.', 'Sin calibración longitudinal; la evidencia cuenta observaciones y no es una probabilidad.'], v1 };
    if (!exercise || sessions.length < 2) return result;
    const reference = sessions[0]!;
    if (activeBlock && activeBlock.id !== reference.blockId) { result.rule = 'mesocycle-context-changed'; result.limitations.push('Inició otro mesociclo después de la referencia; registra rendimiento comparable antes de recomendar una carga.'); return result; }
    if (day(reference.date) === day(sessions[1]!.date)) { result.rule = 'same-day-not-independent'; return result; }
    if (JSON.stringify([reference.routineId, reference.unilateral, reference.equipment || null, reference.repRange || null]) !== JSON.stringify([sessions[1]!.routineId, sessions[1]!.unilateral, sessions[1]!.equipment || null, sessions[1]!.repRange || null])) { result.rule = 'context-changed'; return result; }
    const sets = currentSets.length ? currentSets.filter(valid) : working(reference);
    if (!sets.length || sets.some(s => rir(s) == null || s.weight <= 0) || reference.sets.some(s => !valid(s))) { result.rule = 'missing-rir-or-incomplete'; return result; }
    if (exercise.isUnilateral && sets.some(s => s.weightRight == null || s.repsRight == null || s.weightRight !== s.weight || s.repsRight !== s.reps)) { result.rule = 'unilateral-not-comparable'; return result; }
    const latestWeight = Math.max(...sets.map(s => s.weight)), work = sets.filter(s => s.weight === latestWeight);
    const previousWeight = Math.max(...working(sessions[1]!).map(s => s.weight));
    result.reference = { sessionId: currentSets.length ? 'current-input' : reference.id, weight: latestWeight, reps: Math.min(...work.map(s => s.reps)), rir: mean(work.map(rir).filter((n): n is number => n != null)), source: currentSets.length ? 'current-input' : 'history' };
    if (gap(day(reference.date), day(input.now)) > 21 || previousWeight <= 0 || latestWeight / previousWeight > 1.25 || latestWeight / previousWeight < 0.75) { result.rule = 'stale-or-outlier'; return result; }
    if (!config?.equipment || !config.increment && !config.availableLoads.length) { result.rule = 'configure-equipment'; return result; }
    const range = adjustRepRangeForPhase(parseRepRange(exercise.targetReps).lo, parseRepRange(exercise.targetReps).hi, phase);
    let weight = latestWeight, reps = Math.min(range.hi, Math.max(range.lo, Math.min(...work.map(s => s.reps)) + 1));
    const fatigue = recovery.status === 'caution', failure = work.some(s => rir(s) === 0);
    if (phase === 'deload') { result.rule = 'planned-deload-review'; return result; }
    if (fatigue || failure || work.some(s => s.reps < range.lo)) { result.rule = fatigue ? 'recovery-hold' : 'effort-hold'; reps = result.reference.reps; }
    else if (work.every(s => s.reps >= range.hi && (rir(s) || 0) >= 1)) {
        weight = config.availableLoads.length ? [...config.availableLoads].sort((a, b) => a - b).find(w => w > latestWeight + 0.0001) || latestWeight : round(latestWeight + (config.increment || 0));
        reps = range.lo; result.rule = weight === latestWeight ? 'equipment-ceiling' : 'all-at-target';
    } else result.rule = 'individual-rep-progression';
    if (config.availableLoads.length && !config.availableLoads.some(w => Math.abs(w - weight) < 0.0001)) { result.rule = 'reference-outside-equipment'; return result; }
    if (weight - latestWeight > 10 || weight > latestWeight * 1.1) { result.rule = 'jump-guard'; result.limitations.push('Se bloqueó un salto >10 kg o >10%; no se redondea hacia una carga extrema.'); return result; }
    result.recommendation = { weight: round(weight), reps }; result.delta = round(weight - latestWeight);
    result.adjustment = config.availableLoads.length ? 'Seleccionada entre cargas disponibles configuradas.' : `Paso individual configurado: ${config.increment} kg.`;
    result.evidence = sessions.length >= 6 ? 'repeated' : 'limited';
    if (fatigue) result.limitations.push('Se mantiene la carga por señales relativas de bienestar; no implica incapacidad ni diagnóstico.');
    return result;
}

export function analyzeCoachHypertrophy(input: CoachInput): CoachHypertrophy {
    const body = input.body.filter(b => inPeriod(b.date, input)).sort((a, b) => a.date.localeCompare(b.date));
    const weight = body.filter(b => b.weight != null && b.weight > 0).map(b => ({ date: day(b.date), value: b.weight! }));
    const measurements = input.measurements.filter(b => b.date >= shiftTrainingCivilDate(day(input.now), 1 - input.days) && b.date <= day(input.now)).sort((a, b) => a.date.localeCompare(b.date));
    const changes: CoachHypertrophy['changes'] = [];
    const addChange = (metric: string, values: { date: string; value: number }[]): void => {
        const first = values[0], last = values.at(-1); if (first && last && first.date !== last.date) changes.push({ metric, from: first.date, to: last.date, before: first.value, after: last.value, delta: round(last.value - first.value) });
    };
    addChange('weight', weight);
    for (const zone of COACH_MUSCLES) addChange(zone, measurements.filter(m => m.zone === zone).map(m => ({ date: m.date, value: m.cm })));
    const sessions = input.sessions.filter(s => inPeriod(s.date, input) && working(s).length);
    const start = shiftTrainingCivilDate(day(input.now), 1 - input.days), previousStart = shiftTrainingCivilDate(start, -input.days);
    return { weight, measurements, changes, training: { days: new Set(sessions.map(s => day(s.date))).size, sessions: sessions.length, completedSets: sessions.flatMap(working).length, loadKgReps: load(sessions.flatMap(working)),
        previousLoadKgReps: load(input.sessions.filter(s => day(s.date) >= previousStart && day(s.date) < start).flatMap(working)) },
        photos: body.filter(b => b.photoUrl && /^https:\/\//i.test(b.photoUrl)).map(b => ({ date: day(b.date), url: b.photoUrl! })),
        limitations: ['Un cambio de peso o perímetro es observado; no demuestra aumento muscular ni un porcentaje de hipertrofia.', 'Hidratación, horario, técnica y ubicación de la cinta pueden variar. Mediciones irregulares no se interpolan.', 'Las fotos son voluntarias, se abren a petición y nunca se envían al proveedor IA. Las estimaciones de báscula no demuestran tejido muscular.'] };
}

export function buildCoachReport(input: CoachInput): CoachReport {
    const volume = analyzeCoachVolume(input), recovery = analyzeCoachRecovery(input);
    const byExercise = new Map<string, CoachSession[]>();
    for (const session of input.sessions) { const list = byExercise.get(session.exerciseId) || []; list.push(session); byExercise.set(session.exerciseId, list); }
    const plateaus = input.exercises.map(e => analyzeCoachPlateau(e.id, { ...input, sessions: byExercise.get(e.id) || [] }));
    const loading = input.exercises.map(e => recommendCoachLoading(e.id, { ...input, sessions: byExercise.get(e.id) || [] }, recovery));
    const hypertrophy = analyzeCoachHypertrophy(input);
    const grouped = new Map<string, CoachSession[]>();
    for (const session of input.sessions.filter(s => s.blockId && inPeriod(s.date, input))) {
        const key = session.blockId + ':' + session.exerciseId;
        const group = grouped.get(key) || []; group.push(session); grouped.set(key, group);
    }
    const blockPerformance: CoachReport['blockPerformance'] = [...grouped.values()].map(sessions => {
        const first = sessions[0]!, p = analyzeCoachPlateau(first.exerciseId, { ...input, sessions });
        return { blockId: first.blockId!, exerciseId: first.exerciseId, name: p.name, phase: first.phase, days: p.sessions, sets: sessions.flatMap(working).length, load: load(sessions.flatMap(working)), firstE1rm: p.points[0]?.e1rm || null, lastE1rm: p.points.at(-1)?.e1rm || null };
    });
    const facts: CoachFact[] = [
        { id: 'volume.summary', view: 'volume', text: `${hypertrophy.training.completedSets} series completas observadas en ${input.days} días; ${volume.unknown.length} ejercicios sin clasificación muscular suficiente.`, externalSafe: true },
        { id: 'recovery.summary', view: 'recovery', text: recovery.status === 'insufficient' ? 'Faltan check-ins comparables para un análisis individual de recuperación.' : recovery.status === 'caution' ? 'Existen cambios declarados respecto de tu propia referencia. No demuestran causalidad ni recuperación exacta.' : 'Los indicadores con suficientes registros no muestran cambios de una unidad respecto de tu referencia.', externalSafe: false },
        { id: 'hypertrophy.summary', view: 'hypertrophy', text: `${hypertrophy.weight.length} registros de peso y ${hypertrophy.measurements.length} medidas en el período. Los cambios no demuestran hipertrofia muscular.`, externalSafe: true },
        { id: 'timeline.summary', view: 'timeline', text: `${input.blocks.length} mesociclos iniciados disponibles; la atribución usa fechas de inicio registradas y no reconstruye versiones antiguas de bloques editados.`, externalSafe: true }
    ];
    plateaus.forEach((p, i) => facts.push({ id: `plateau.${i}`, view: 'plateau', text: `${p.name}: ${COACH_STATE_LABELS[p.state]}; ${p.sessions} días analizados. ${p.observations.join(' ')} ${p.action} ${p.missing.join(' ')}`, externalSafe: false }));
    loading.forEach((l, i) => facts.push({ id: `loading.${i}`, view: 'loading', text: `${input.exercises[i]?.name}: ${l.recommendation ? `${l.recommendation.weight} kg × ${l.recommendation.reps}.` : 'Sin carga v2 verificable.'} ${COACH_RULE_LABELS[l.rule] || l.rule} ${l.adjustment}`, externalSafe: false }));
    for (const muscle of COACH_MUSCLES) {
        const observed = volume.weeks.filter(w => w.muscle === muscle);
        const direct = observed.reduce((n, w) => n + w.direct, 0), indirect = round(observed.reduce((n, w) => n + w.indirect, 0));
        facts.push({ id: `volume.${muscle}`, view: 'volume', text: `${muscle}: ${direct} series directas y ${indirect} participaciones indirectas estimadas en el período.`, externalSafe: true });
    }
    blockPerformance.forEach((p, i) => facts.push({ id: `timeline.performance.${i}`, view: 'timeline', externalSafe: false, text: `${input.blocks.find(b => b.id === p.blockId)?.name || 'Bloque'} · ${p.name}: ${p.days} días registrados, ${p.sets} series, ${p.load} kg×reps; e1RM inicial ${p.firstE1rm ?? 'no disponible'} y final ${p.lastE1rm ?? 'no disponible'} kg. Fase ${p.phase || 'no registrada'}; fases distintas no son directamente comparables.` }));
    return { version: COACH_VERSION, now: input.now, days: input.days, truncated: input.truncated, volume, recovery, plateaus, loading, hypertrophy, blocks: input.blocks, blockPerformance, facts };
}

export function answerCoach(report: CoachReport, message: string, selectedExerciseId: string | null = null): CoachAnswer {
    const key = canonicalExerciseKey(message.replace(/[¿?¡!]/g, ' '));
    const group = Object.entries(muscleAliases).find(([name]) => key.split(' ').includes(name))?.[1];
    const groupProgress = !!group && /mejor|progres|rendimiento/.test(key);
    const intent: CoachView = groupProgress ? 'plateau' : /volumen|musculos|entrene menos/.test(key) ? 'volume' : /recuper|sueno|fatiga|energia/.test(key) ? 'recovery' : /hipertrof|medida|cuerpo|perimetro|peso corporal/.test(key) ? 'hypertrophy' : /peso|carga|sugier|smart/.test(key) ? 'loading' : /mesociclo|bloque/.test(key) ? 'timeline' : 'plateau';
    const exactNames = report.plateaus.filter(p => key.includes(canonicalExerciseKey(p.name)));
    const partialNames = report.plateaus.filter(p => { const tokens = canonicalExerciseKey(p.name).split(' '); return tokens.length >= 2 && key.includes(tokens.slice(0, 2).join(' ')); });
    const named = exactNames.length ? exactNames : partialNames;
    if (named.length > 1 && !groupProgress) return { mode: 'deterministic', intent, text: ['Hay más de un ejercicio compatible con ese nombre. Selecciona la variante exacta para comparar cargas sin mezclar identidades.'], factIds: [], views: [], exerciseId: null, followUps: [], limitations: ['No se consolidan variantes por coincidencias ambiguas.'] };
    const ranked = [...report.plateaus].sort((a, b) => ({ regression: 0, possible_plateau: 1, contradictory: 2, maintenance: 3, context_changed: 4, progress: 5, insufficient: 6 }[a.state] - { regression: 0, possible_plateau: 1, contradictory: 2, maintenance: 3, context_changed: 4, progress: 5, insufficient: 6 }[b.state]));
    const groupIds = new Set(report.volume.weeks.filter(w => w.muscle === group).flatMap(w => w.contributions.filter(c => c.direct > 0).map(c => c.exerciseId)));
    const exercise = (/mas estancad|ejercicio.*estancado/.test(key) ? ranked[0] : undefined) || named[0] || (groupProgress ? report.plateaus.find(p => groupIds.has(p.exerciseId)) : undefined) || report.plateaus.find(p => p.exerciseId === selectedExerciseId) ||
        report.plateaus.find(p => p.state === 'regression' || p.state === 'possible_plateau') || report.plateaus[0];
    const index = exercise ? report.plateaus.indexOf(exercise) : -1;
    const facts = report.facts.filter(f => f.view === intent && (groupProgress ? groupIds.has(report.plateaus[Number(f.id.split('.')[1])]?.exerciseId || '') : intent !== 'plateau' && intent !== 'loading' || f.id === `${intent}.${index}`)).slice(0, 9);
    if (groupProgress && !facts.length) return { mode: 'deterministic', intent, text: ['Faltan sesiones con clasificación muscular y rendimiento comparable para responder por este grupo. No se deduce progreso de una mayor cantidad de series.'], factIds: [], views: ['volume'], exerciseId: null, followUps: ['¿Qué datos te faltan?'], limitations: ['No hay una medición directa del crecimiento muscular.'] };
    if (/datos.*falt|falta.*datos|mas precisa/.test(key)) return { mode: 'deterministic', intent: 'plateau', text: [
        ...(exercise?.missing || ['Faltan entrenamientos registrados.']),
        ...(report.recovery.status === 'insufficient' ? ['Faltan al menos 3 check-ins recientes y 5 previos por variable para comparar con tu referencia.'] : []),
        'Para cargas v2, confirma equipo, incrementos y RIR; para cambios corporales, registra medidas en fechas distintas.'
    ], factIds: [], views: ['plateau', 'recovery'], exerciseId: exercise?.exerciseId || null, followUps: ['¿Por qué me sugieres este peso?'], limitations: ['Los datos faltantes no se sustituyen por estimaciones del modelo.'] };
    const excluded = /planific|asimetr|sustitu|rapido|borra|elimina|cambia mi rutina|sql|userId/i.test(message);
    return { mode: 'deterministic', intent, text: excluded ? ['Coach analiza tus datos y propone revisiones. Esta solicitud no ejecuta modificaciones ni incluye planificación, sustituciones o detección de asimetrías.'] : facts.length ? facts.map(f => f.text) : ['No hay suficientes registros autorizados para responder. Puedes registrar una sesión o elegir un ejercicio.'], factIds: excluded ? [] : facts.map(f => f.id),
        views: excluded ? [] : [intent, ...(intent === 'plateau' ? ['recovery' as const] : [])], exerciseId: exercise?.exerciseId || null,
        followUps: ['¿Qué datos te faltan?', '¿Cómo va mi volumen semanal?', '¿Por qué me sugieres este peso?'],
        limitations: [report.truncated ? 'Historial limitado: el resultado es parcial; reduce el período para revisar detalles.' : 'Resultados calculados sobre registros disponibles; la ausencia de registros no prueba deterioro.', 'Clasificaciones heurísticas, sin probabilidades científicamente calibradas.'] };
}
