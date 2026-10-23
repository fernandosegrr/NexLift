import { linearRegression } from '../generated/training.js';
export { linearRegression };
// goalPlanner.js — lógica pura de predicción/periodización de Objetivos, extraída
// de GoalCard.jsx (P6 del plan de mejoras de funcionalidades) para poder reusarla
// también en Workout.jsx (chip de "objetivo visible") sin duplicarla. GoalCard.jsx
// sigue siendo el único lugar que la RENDERIZA; este archivo solo calcula.
import { bestOneRepMaxForTarget, best1RMRecent } from './exerciseName';

// Regresión Lineal para detectar tendencias en el historial


// --- MOTOR DE PERIODIZACIÓN ---

export function generatePeriodizedPlan(current1RM, target1RM, weeklyIncrease, targetReps, frequency = 2) {
    const sessions = [];

    // Incrementos de peso en pasos de 5kg (equipamiento del gym)
    const WEIGHT_INCREMENT = 5;

    // Forzamos conversión a número para evitar errores y NaN
    const start = Number(current1RM);
    const target = Number(target1RM);
    let increase = Number(weeklyIncrease);

    const gap = target - start;

    // Validación de seguridad estricta
    if (gap <= 0 || increase <= 0 || isNaN(gap) || isNaN(increase)) return [];

    // Tope de progresión realista: escala con la fuerza actual (~2.5% del 1RM por
    // semana) con un mínimo de 1kg/sem. Evita estimaciones absurdas con datos
    // ruidosos sin penalizar levantamientos grandes (sentadilla, peso muerto),
    // donde 1kg/sem fijo era irrealmente lento.
    const MAX_REALISTIC_INCREASE = Math.max(1.0, start * 0.025);
    if (increase > MAX_REALISTIC_INCREASE) {
        increase = MAX_REALISTIC_INCREASE;
    }

    // Semanas totales necesarias para cubrir el gap al ritmo estimado.
    // No se infla artificialmente: un objetivo cercano genera un plan corto.
    let totalWeeks = Math.ceil(gap / increase);
    if (totalWeeks < 1) totalWeeks = 1;

    // Safety check: cortar planes absurdamente largos
    if (totalWeeks > 100) totalWeeks = 100;

    // Usar fases si el plan es >= 8 semanas
    const usePhases = totalWeeks >= 8;

    // --- SELECCIÓN DE ESTRATEGIA ---
    const isHypertrophyGoal = targetReps > 5;

    let weeksPhase1 = 0; // Acumulación/Base
    let weeksPhase2 = 0; // Fuerza/Intensificación
    let weeksPhase3 = 0; // Peaking/Realización

    if (usePhases) {
        if (isHypertrophyGoal) {
            // Para hipertrofia: más tiempo en volumen
            weeksPhase1 = Math.floor(totalWeeks * 0.5);
            weeksPhase2 = Math.floor(totalWeeks * 0.3);
            weeksPhase3 = totalWeeks - weeksPhase1 - weeksPhase2;
        } else {
            // Para fuerza: distribución equilibrada (35/35/30)
            weeksPhase1 = Math.floor(totalWeeks * 0.35);
            weeksPhase2 = Math.floor(totalWeeks * 0.35);
            weeksPhase3 = totalWeeks - weeksPhase1 - weeksPhase2;
        }
    }

    let currentProjected1RM = start;
    let week = 1;

    // --- BUCLE DE GENERACIÓN ---
    while (currentProjected1RM <= target + 0.1 && week <= totalWeeks + 1) {

        let phase = 'Peak';
        let reps = targetReps;
        let intensityPct = 1.0;
        let phaseColor = 'text-green-400';
        let phaseLabel = 'Realización';
        let advice = '';

        // --- RAMA 1: HIPERTROFIA (>5 reps) ---
        if (isHypertrophyGoal) {
            if (week <= weeksPhase1 && usePhases) {
                phase = 'Accumulation';
                reps = targetReps + 2;
                intensityPct = 1 / (1 + (reps + 2) / 30);
                phaseColor = 'text-blue-400';
                phaseLabel = 'Acumulación';
                advice = 'Volumen alto. Descansos controlados (60-90s).';
            } else if (week <= weeksPhase1 + weeksPhase2 && usePhases) {
                phase = 'Intensification';
                reps = targetReps;
                intensityPct = 1 / (1 + reps / 30);
                phaseColor = 'text-purple-400';
                phaseLabel = 'Intensificación';
                advice = 'Aumentando intensidad, volumen moderado.';
            } else {
                phase = 'Realization';
                reps = targetReps;
                intensityPct = 1 / (1 + reps / 30);
                phaseColor = 'text-green-400';
                phaseLabel = 'Realización';
                advice = 'Consolidando tu meta de repeticiones.';
            }
        }

        // --- RAMA 2: FUERZA (<=5 reps) ---
        else {
            if (week <= weeksPhase1 && usePhases) {
                // Fase 1: Base (Hipertrofia Funcional)
                phase = 'Accumulation';
                reps = 8;
                intensityPct = 0.72; // ~72% (RPE 7-8 para 8 reps)
                phaseColor = 'text-blue-400';
                phaseLabel = 'Base (Hipertrofia)';
                advice = 'Construye músculo base. Descanso 90s.';
            } else if (week <= weeksPhase1 + weeksPhase2 && usePhases) {
                // Fase 2: Fuerza (RAMPA SUAVIZADA)
                phase = 'Strength';
                reps = 5;

                // Calculamos el progreso dentro de la fase 2
                const phase2Week = week - weeksPhase1;
                const phase2Duration = Math.max(1, weeksPhase2);
                const progress = Math.min(1, phase2Week / phase2Duration);

                // Rampa más gradual de 0.72 a 0.85
                intensityPct = 0.72 + (0.13 * progress);

                phaseColor = 'text-purple-400';
                phaseLabel = 'Fuerza';
                advice = 'Cargas sub-máximas. Descanso 2-3m.';
            } else {
                // Fase 3: Peaking (Pico de Forma)
                phase = 'Peak';

                // Tapering progresivo
                if (targetReps === 1) {
                    const weeksLeft = totalWeeks - week;
                    if (weeksLeft > 4) reps = 3;
                    else if (weeksLeft > 2) reps = 2;
                    else reps = 1;
                } else {
                    reps = targetReps;
                }

                const finalTargetIntensity = 1 / (1 + (targetReps === 1 ? 0 : targetReps / 30));

                // Conectamos suavemente desde donde terminó la Fase 2
                const startPeakingIntensity = 0.85;

                const weeksInPeak = Math.max(1, weeksPhase3);
                const currentPeakWeek = week - (weeksPhase1 + weeksPhase2);
                const progress = Math.min(1, currentPeakWeek / weeksInPeak);

                intensityPct = startPeakingIntensity + ((finalTargetIntensity - startPeakingIntensity) * progress);

                phaseColor = 'text-green-400';
                phaseLabel = 'Peaking';
                advice = 'Máxima especificidad. Descanso 3-5m.';
            }
        }

        // --- CÁLCULO DEL PESO ---
        let weight = currentProjected1RM * intensityPct;

        // --- SEMANA DE TEST (OVERRIDE) ---
        if (currentProjected1RM >= target - 0.1) {
            // El peso final debe ser la meta exacta
            weight = target / (1 + (targetReps === 1 ? 0 : targetReps / 30));
            if (targetReps === 1) weight = target;

            reps = targetReps;
            phaseLabel = '¡SEMANA DE TEST!';
            phaseColor = 'text-yellow-400 font-black animate-pulse';
            advice = '¡Día de Récord! Hoy se levantan ' + target + ' kg.';
        }

        // Redondeo a pasos de 5kg (equipamiento del gym)
        weight = Math.round(weight / WEIGHT_INCREMENT) * WEIGHT_INCREMENT;

        // Evitar que el peso baje entre semanas (progresión monotónica)
        if (sessions.length > 0) {
            const prevWeight = sessions[sessions.length - 1].weight;
            // Solo permitir peso igual o mayor, excepto en tapering intencional
            if (weight < prevWeight && phase !== 'Peak') {
                weight = prevWeight;
            }
        }

        sessions.push({
            week,
            phase: phaseLabel,
            phaseColor,
            weight,
            reps,
            sets: phase === 'Accumulation' ? 4 : 3,
            projected1RM: Math.round(currentProjected1RM * 10) / 10,
            advice
        });

        if (currentProjected1RM >= target - 0.1) break;

        currentProjected1RM += increase;
        week++;
    }

    return sessions;
}

// Dado un Goal + su historial agrupado ({sessions: [{best1RM, ...}]}), calcula el
// 1RM de partida, la pendiente de progreso semanal (mezcla tendencia real vs.
// potencial teórico por nivel de experiencia) y genera el plan completo. Única
// fuente de verdad — GoalCard.jsx y el chip de Workout.jsx llaman esto mismo.
export function computeGoalPrediction(goal, history) {
    let starting1RM = 0;
    let trendSlope = 0;
    let confidence = 0;
    let totalSessions = 0;
    let hasHistory = history && history.sessions && history.sessions.length >= 2;
    let source = 'manual';

    const POTENTIAL = {
        beginner: 1.25,      // Ganancias rápidas
        intermediate: 0.6,   // Estables
        advanced: 0.25       // Lentas
    };

    if (hasHistory) {
        source = 'history';
        const sessions = history.sessions;
        totalSessions = sessions.length;
        // 1RM de partida: solo cuentan series cercanas en reps a la meta (no
        // cualquier serie del día) — evita que una serie submáxima de muchas
        // reps "demuestre" por extrapolación de Epley una meta exigente en
        // pocas reps que nunca se intentó de verdad.
        starting1RM = bestOneRepMaxForTarget(sessions, goal.targetReps, 3) || best1RMRecent(sessions, 3);

        const dataPoints = sessions.map((s, i) => ({ x: i, y: s.best1RM }));
        const regression = linearRegression(dataPoints);

        const rawSlopePerWeek = regression.slope * (goal.frequencyPerWeek || 2);
        const theoreticalSlope = POTENTIAL[goal.experienceLevel || 'intermediate'] || 0.5;

        const r2 = regression.r2 || 0;
        trendSlope = (rawSlopePerWeek * r2) + (theoreticalSlope * (1 - r2));
        confidence = r2;

    } else {
        // SI NO HAY HISTORIAL: Usamos el dato manual (currentOneRepMax)
        starting1RM = Number(goal.currentOneRepMax) || 0;

        if (starting1RM === 0) {
            return { hasData: false, error: 'Faltan datos de fuerza inicial' };
        }

        trendSlope = POTENTIAL[goal.experienceLevel || 'intermediate'] || 0.5;
        confidence = 0.5;
    }

    // Cálculo Seguro de la Meta (1RM objetivo)
    const targetWeight = Number(goal.targetWeight);
    const targetReps = Number(goal.targetReps);

    const target1RM = targetReps === 1
        ? targetWeight
        : targetWeight * (1 + targetReps / 30);

    const limitDiff = target1RM - starting1RM;

    // Cumplido si el backend ya lo persistió (verdad de BD) o si el cálculo en
    // vivo de esta sesión ya lo supera (reactividad inmediata sin esperar reload).
    if (goal.achievedAt || limitDiff <= 0) {
        return { hasData: true, achieved: true, confidence, starting1RM, target1RM, persisted: !!goal.achievedAt };
    }

    const effectiveWeeklyIncrease = Math.max(0.1, trendSlope);

    const plan = generatePeriodizedPlan(
        starting1RM,
        target1RM,
        effectiveWeeklyIncrease,
        targetReps,
        goal.frequencyPerWeek || 2
    );

    return {
        hasData: true,
        achieved: false,
        source,
        current1RM: Math.round(starting1RM * 10) / 10,
        target1RM: Math.round(target1RM * 10) / 10,
        weeklyIncrease: Math.round(effectiveWeeklyIncrease * 100) / 100,
        weeksNeeded: plan.length,
        confidence,
        plan,
        totalSessions
    };
}

// Auto-detecta qué semanas del plan ya se cumplieron con datos reales de
// entrenamiento (no solo el checklist manual): una semana cuenta como hecha si
// el 1RM real actual ya alcanzó su projected1RM.
export function computeGoalProgress(goal, history, prediction) {
    if (!history?.sessions?.length || !prediction.plan?.length) {
        return { completedAutoWeeks: new Set(), currentReal1RM: 0, realProgressPct: 0 };
    }

    // Mismo criterio estricto que el punto de partida del plan, para que barra,
    // semanas y el badge de "cumplido" sean siempre coherentes entre sí.
    const currentReal1RM = bestOneRepMaxForTarget(history.sessions, goal.targetReps, 3) || best1RMRecent(history.sessions, 3);

    const autoCompleted = new Set();
    prediction.plan.forEach(weekData => {
        if (currentReal1RM >= weekData.projected1RM) {
            autoCompleted.add(weekData.week);
        }
    });

    const realPct = prediction.target1RM > 0
        ? Math.min(100, Math.max(0, (currentReal1RM / prediction.target1RM) * 100))
        : 0;

    return {
        completedAutoWeeks: autoCompleted,
        currentReal1RM: Math.round(currentReal1RM * 10) / 10,
        realProgressPct: Math.round(realPct)
    };
}

// Semanas del plan que quedan por "mostrar" (oculta tanto las tachadas a mano
// como las auto-completadas por progreso real).
export function filterVisibleWeeks(plan, goal, completedAutoWeeks) {
    return (plan || []).filter(weekData => {
        const isManually = (goal.completedWeeks || []).includes(weekData.week);
        const isAuto = completedAutoWeeks.has(weekData.week);
        return !isManually && !isAuto;
    });
}

// Compone las 4 funciones anteriores en lo único que un chip "objetivo activo"
// necesita: ¿ya se cumplió, no hay semanas visibles, o cuál es la próxima?
export function getCurrentGoalTarget(goal, history) {
    const prediction = computeGoalPrediction(goal, history);
    if (!prediction.hasData) return null;
    if (prediction.achieved) return { achieved: true, exerciseName: goal.exerciseName };

    const { completedAutoWeeks } = computeGoalProgress(goal, history, prediction);
    const visiblePlan = filterVisibleWeeks(prediction.plan, goal, completedAutoWeeks);

    if (visiblePlan.length === 0) {
        return { achieved: false, planExhausted: true, exerciseName: goal.exerciseName };
    }

    const next = visiblePlan[0];
    return {
        achieved: false,
        exerciseName: goal.exerciseName,
        week: next.week,
        weight: next.weight,
        reps: next.reps,
        totalWeeks: prediction.weeksNeeded
    };
}
