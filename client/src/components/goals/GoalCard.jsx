import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, Trash2, Calendar, Target, Zap, Dumbbell, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';

// --- MATH UTILS ---

// Regresión Lineal para detectar tendencias en el historial
function linearRegression(dataPoints) {
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

// --- MOTOR DE PERIODIZACIÓN MEJORADO ---

function generatePeriodizedPlan(current1RM, target1RM, weeklyIncrease, targetReps, frequency = 2) {
    const sessions = [];

    // ✅ MEJORA 1: Incrementos de peso en pasos de 5kg (equipamiento del gym)
    const WEIGHT_INCREMENT = 5; // Era 2.5kg, ahora 5kg

    // Forzamos conversión a número para evitar errores y NaN
    const start = Number(current1RM);
    const target = Number(target1RM);
    let increase = Number(weeklyIncrease);

    const gap = target - start;

    // Validación de seguridad estricta
    if (gap <= 0 || increase <= 0 || isNaN(gap) || isNaN(increase)) return [];

    // ✅ MEJORA 2: Ajuste automático de progresión si es demasiado agresiva
    // Para press de banca intermedio, máximo realista es ~1kg/semana
    const MAX_REALISTIC_INCREASE = 1.0;
    if (increase > MAX_REALISTIC_INCREASE) {
        console.warn(`⚠️ Progresión de ${increase}kg/sem es muy agresiva. Ajustando a ${MAX_REALISTIC_INCREASE}kg/sem para sostenibilidad.`);
        increase = MAX_REALISTIC_INCREASE;
    }

    // Calcular semanas totales necesarias
    let totalWeeks = Math.ceil(gap / increase);

    // ✅ MEJORA 3: Mínimo de semanas para permitir adaptación neuromuscular
    const MIN_WEEKS_FOR_PHASES = 12;
    if (totalWeeks < MIN_WEEKS_FOR_PHASES) {
        console.info(`📊 Plan extendido de ${totalWeeks} a ${MIN_WEEKS_FOR_PHASES} semanas para progresión sostenible.`);
        totalWeeks = MIN_WEEKS_FOR_PHASES;
        // Recalcular el incremento semanal ajustado
        increase = gap / totalWeeks;
    }

    // Safety check: Si el cálculo da semanas infinitas o absurdas, cortamos
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
            // ✅ MEJORA 4: Para fuerza: distribución equilibrada (35/35/30)
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

                // ✅ MEJORA 5: Rampa más gradual de 0.72 a 0.85 (antes 0.75-0.85)
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
            weight = target / (1 + (targetReps === 1 ? 0 : targetReps/30));
            if(targetReps === 1) weight = target;

            reps = targetReps;
            phaseLabel = '¡SEMANA DE TEST!';
            phaseColor = 'text-yellow-400 font-black animate-pulse';
            advice = '¡Día de Récord! Hoy se levantan ' + target + ' kg.';
        }

        // ✅ MEJORA 6: Redondeo a pasos de 5kg (equipamiento del gym)
        weight = Math.round(weight / WEIGHT_INCREMENT) * WEIGHT_INCREMENT;

        // ✅ MEJORA 7: Evitar que el peso baje entre semanas (progresión monotónica)
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

// --- COMPONENTES AUXILIARES ---

function WeekRow({ weekData, isCompleted, isManuallyCompleted, onToggle, id }) {
    const [expanded, setExpanded] = useState(false);
    const isDone = isCompleted || isManuallyCompleted;

    const sets = Array.from({ length: weekData.sets }, (_, i) => ({
        id: i + 1,
        weight: weekData.weight,
        reps: weekData.reps
    }));

    return (
        <div id={id} className={`rounded-xl border transition-all duration-300 ${isDone
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--primary)]/40'
            }`}>
            <div
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between p-3 cursor-pointer select-none"
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle(!isManuallyCompleted);
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors border ${isDone
                            ? 'bg-green-500 text-black border-green-500 hover:bg-green-400'
                            : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border)] hover:border-white'
                            }`}
                    >
                        {isDone ? <CheckCircle2 size={16} /> : <span className="text-xs font-bold">W{weekData.week}</span>}
                    </button>

                    <div>
                        <p className={`text-sm font-bold ${isDone ? 'text-green-400 line-through opacity-70' : 'text-white'}`}>
                            {weekData.weight} kg
                        </p>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${weekData.phaseColor}`}>
                            {weekData.phase}
                        </p>
                    </div>
                </div>

                <div className="text-right flex items-center gap-3">
                    <div className="flex items-baseline justify-end gap-1">
                        <span className="text-lg font-mono font-bold">{weekData.sets}</span>
                        <span className="text-xs text-[var(--text-secondary)]">series</span>
                        <span className="text-xs text-[var(--text-secondary)] mx-1">x</span>
                        <span className="text-lg font-mono font-bold text-white">{weekData.reps}</span>
                    </div>
                    {expanded ? <ChevronUp size={16} className="text-[var(--text-secondary)]" /> : <ChevronDown size={16} className="text-[var(--text-secondary)]" />}
                </div>
            </div>

            {expanded && (
                <div className="p-3 pt-0 border-t border-dashed border-[var(--border)] mt-1">
                    <div className="grid grid-cols-1 gap-2 mt-3">
                        {sets.map(set => (
                            <div key={set.id} className="flex items-center justify-between py-2 px-3 bg-[var(--bg-dark)]/50 rounded-lg text-sm">
                                <span className="text-[var(--text-secondary)] font-medium">Set {set.id}</span>
                                <div className="font-mono">
                                    <span className="font-bold text-white">{set.weight}kg</span>
                                    <span className="text-[var(--text-secondary)] mx-1">x</span>
                                    <span className="font-bold text-white">{set.reps}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {weekData.advice && (
                        <div className="mt-3 p-2 bg-blue-500/10 rounded-lg flex gap-2 items-start">
                            <Zap size={14} className="text-blue-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-blue-300 italic">{weekData.advice}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// --- COMPONENTE PRINCIPAL ---

export default function GoalCard({ goal, history, onDelete, onUpdate }) {
    const [expanded, setExpanded] = useState(false);
    const [toggling, setToggling] = useState(null);

    // FIX CRÍTICO: Si goal es undefined o null, no renderizar nada para evitar crash
    if (!goal) return null;

    // --- LÓGICA DE PREDICCIÓN (useMemo) ---
    const prediction = useMemo(() => {
        let starting1RM = 0;
        let trendSlope = 0;
        let confidence = 0;
        let totalSessions = 0;
        let hasHistory = history && history.sessions && history.sessions.length >= 3;
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
            starting1RM = sessions[sessions.length - 1].best1RM;

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

        // Si ya superaste la meta
        if (limitDiff <= 0) {
            return { hasData: true, achieved: true, confidence, starting1RM, target1RM };
        }

        const effectiveWeeklyIncrease = Math.max(0.1, trendSlope);

        // Generamos el plan con la lógica corregida
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

    }, [goal, history]);

    // Auto-detect completion from real workout history
    // A week is completed if the user has achieved a 1RM >= the week's projected1RM
    // at any point in their training history
    const { completedAutoWeeks, currentReal1RM, realProgressPct } = useMemo(() => {
        if (!history?.sessions?.length || !prediction.plan?.length) {
            return { completedAutoWeeks: new Set(), currentReal1RM: 0, realProgressPct: 0 };
        }

        // Get all historical 1RM values sorted by date
        const best1RMs = history.sessions.map(s => s.best1RM).sort((a, b) => a - b);
        const maxReal1RM = Math.max(...best1RMs);
        const latestReal1RM = history.sessions[history.sessions.length - 1].best1RM;

        // Mark weeks as completed if user's BEST historical 1RM exceeds the week's target
        const autoCompleted = new Set();
        prediction.plan.forEach(weekData => {
            if (maxReal1RM >= weekData.projected1RM) {
                autoCompleted.add(weekData.week);
            }
        });

        // Calculate real progress toward the goal
        const realPct = prediction.target1RM > 0
            ? Math.min(100, Math.max(0, (latestReal1RM / prediction.target1RM) * 100))
            : 0;

        return {
            completedAutoWeeks: autoCompleted,
            currentReal1RM: Math.round(latestReal1RM * 10) / 10,
            realProgressPct: Math.round(realPct)
        };
    }, [history, prediction.plan, prediction.target1RM]);

    // Filter visible plan: hide both manually and auto-completed weeks
    const visiblePlan = (prediction.plan || []).filter(weekData => {
        const isManually = (goal.completedWeeks || []).includes(weekData.week);
        const isAuto = completedAutoWeeks.has(weekData.week);
        return !isManually && !isAuto;
    });

    const hiddenWeeksCount = (prediction.plan?.length || 0) - visiblePlan.length;

    // Manejador de toggle
    const handleToggleWeek = async (weekNum, completed) => {
        setToggling(weekNum);
        try {
            const updatedGoal = await api.updateGoalWeek(goal.id, weekNum, completed);
            if (onUpdate) onUpdate(updatedGoal);
        } catch (err) {
            console.error(err);
        } finally {
            setToggling(null);
        }
    };

    // ESTADO DE ERROR CONTROLADO
    if (!prediction.hasData && prediction.error) {
        return (
            <div className="p-4 bg-[var(--bg-card)] rounded-2xl border border-red-500/20 text-center flex items-center justify-between">
                <div className="text-left">
                    <p className="font-bold text-white">{goal.exerciseName}</p>
                    <p className="text-xs text-red-400">{prediction.error}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Faltan datos para generar el plan.</p>
                </div>
                <button
                    onClick={onDelete}
                    className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        );
    }

    // Use real progress if available, otherwise use initial estimate
    const pct = currentReal1RM > 0 ? realProgressPct
        : prediction.target1RM > 0
            ? Math.min(100, Math.max(0, ((prediction.current1RM / prediction.target1RM) * 100)))
            : 0;

    return (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden transition-all hover:border-[var(--primary)]/30">
            {/* Header */}
            <div onClick={() => setExpanded(!expanded)} className="p-5 cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-3">
                        <div className="mt-1">
                            {prediction.achieved ? <Target className="text-green-400" size={20} /> : <Dumbbell className="text-purple-400" size={20} />}
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">{goal.exerciseName}</h3>
                            <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-bold mt-0.5">
                                Metodología {prediction.source === 'history' ? 'Basada en Datos' : 'Estimada'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-black italic text-white block">
                            {goal.targetWeight}<span className="text-sm font-normal text-[var(--text-secondary)]">kg</span>
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">x{goal.targetReps} reps</span>
                    </div>
                </div>

                {/* Progress Bar & Stats */}
                {!prediction.achieved && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                            <span className="text-[var(--text-secondary)]">
                                {currentReal1RM > 0 ? (
                                    <>Actual: <span className="text-green-400">{currentReal1RM}</span> RM</>
                                ) : (
                                    <>Inicio: {prediction.current1RM} RM</>
                                )}
                            </span>
                            <span className="text-purple-400">Meta: {prediction.target1RM} RM</span>
                        </div>
                        <div className="h-2 w-full bg-[var(--bg-dark)] rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between items-center text-xs mt-2">
                            <span className="flex items-center gap-1 text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                                <TrendingUp size={12} /> +{prediction.weeklyIncrease} kg/sem
                            </span>
                            <span className="text-[var(--text-secondary)]">
                                {visiblePlan.length > 0
                                    ? <span className="text-white font-bold">{visiblePlan[0].week}ª</span>
                                    : 'Fin del plan'} / {prediction.weeksNeeded} semanas
                            </span>
                        </div>
                    </div>
                )}

                {prediction.achieved && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                        <p className="text-green-400 font-bold">¡Objetivo Superado!</p>
                        <p className="text-xs text-green-300/80">Tu 1RM actual es superior a la meta.</p>
                    </div>
                )}
            </div>

            {/* EXPANDED PLAN */}
            {expanded && !prediction.achieved && prediction.plan && (
                <div className="border-t border-[var(--border)] bg-[var(--bg-dark)]/50 p-4 animate-fade-in">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Calendar size={18} className="text-[var(--text-secondary)]" />
                            <h4 className="font-bold text-sm text-[var(--text-secondary)]">Plan de Periodización Ondulatoria</h4>
                        </div>
                        {hiddenWeeksCount > 0 && (
                            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-lg">
                                {hiddenWeeksCount} semanas completadas ocultas
                            </span>
                        )}
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {visiblePlan.length === 0 && (
                            <div className="text-center py-8 text-[var(--text-secondary)]">
                                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                                <p>¡Has completado todas las semanas planificadas!</p>
                            </div>
                        )}

                        {visiblePlan.map((weekData) => {
                            return (
                                <WeekRow
                                    key={weekData.week}
                                    id={`week-${goal.id}-${weekData.week}`}
                                    weekData={weekData}
                                    isCompleted={false}
                                    isManuallyCompleted={false}
                                    onToggle={(completed) => handleToggleWeek(weekData.week, completed)}
                                />
                            );
                        })}
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="w-full mt-4 flex items-center justify-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wider hover:text-red-300 py-3"
                    >
                        <Trash2 size={14} /> Eliminar Objetivo
                    </button>
                </div>
            )}
        </div>
    );
}
