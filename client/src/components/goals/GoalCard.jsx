import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, Trash2, Calendar, Target, Zap, Dumbbell, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../ui/Toast';
import { computeGoalPrediction, computeGoalProgress, filterVisibleWeeks } from '../../utils/goalPlanner';

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
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(!expanded)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded); }}
                className="flex items-center justify-between p-3 cursor-pointer select-none"
            >
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        aria-label={isDone ? `Desmarcar semana ${weekData.week}` : `Marcar semana ${weekData.week} completada`}
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
    const toast = useToast();
    const [expanded, setExpanded] = useState(false);
    const [toggling, setToggling] = useState(null);

    // Hooks SIEMPRE antes de cualquier return (reglas de React)
    const prediction = useMemo(
        () => (goal ? computeGoalPrediction(goal, history) : { hasData: false, error: null, plan: [], achieved: false }),
        [goal, history]
    );

    const { completedAutoWeeks, currentReal1RM, realProgressPct } = useMemo(
        () => (goal ? computeGoalProgress(goal, history, prediction) : { completedAutoWeeks: [], currentReal1RM: 0, realProgressPct: 0 }),
        [goal, history, prediction]
    );

    const visiblePlan = useMemo(
        () => (goal ? filterVisibleWeeks(prediction.plan, goal, completedAutoWeeks) : []),
        [goal, prediction.plan, completedAutoWeeks]
    );

    const hiddenWeeksCount = (prediction.plan?.length || 0) - visiblePlan.length;

    const handleToggleWeek = async (weekNum, completed) => {
        if (!goal || toggling != null) return;
        setToggling(weekNum);
        try {
            const updatedGoal = await api.updateGoalWeek(goal.id, weekNum, completed);
            if (onUpdate) onUpdate(updatedGoal);
        } catch (err) {
            console.error(err);
            toast.error('No se pudo actualizar la semana');
        } finally {
            setToggling(null);
        }
    };

    if (!goal) return null;

    // ESTADO DE ERROR CONTROLADO
    if (!prediction.hasData && prediction.error) {
        return (
            <div className="p-4 bg-[var(--bg-card)] rounded-2xl border border-red-500/20 flex items-center justify-between gap-3">
                <div className="text-left min-w-0">
                    <p className="font-bold text-white truncate">{goal.exerciseName}</p>
                    <p className="text-xs text-red-400">{prediction.error}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Faltan datos para generar el plan. Entrena el ejercicio o edita con 1RM manual.</p>
                </div>
                <button
                    type="button"
                    onClick={onDelete}
                    aria-label="Eliminar objetivo"
                    className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 shrink-0"
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
            <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(!expanded)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded); }}
                className="p-5 cursor-pointer"
            >
                <div className="flex justify-between items-start mb-4 gap-2">
                    <div className="flex gap-3 min-w-0">
                        <div className="mt-1 shrink-0">
                            {prediction.achieved ? <Target className="text-green-400" size={20} /> : <Dumbbell className="text-purple-400" size={20} />}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-lg truncate">{goal.exerciseName}</h3>
                            <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-bold mt-0.5">
                                {prediction.achieved
                                    ? 'Logrado'
                                    : prediction.source === 'history'
                                        ? 'Plan basado en tu historial'
                                        : 'Plan estimado (datos manuales)'}
                            </p>
                            {goal.muscleGroup && (
                                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{goal.muscleGroup}</p>
                            )}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <span className="text-2xl font-black italic text-white block tabular-nums">
                            {goal.targetWeight}<span className="text-sm font-normal text-[var(--text-secondary)]">kg</span>
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">× {goal.targetReps} reps</span>
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
                        <p className="text-green-400 font-bold">¡Objetivo superado!</p>
                        <p className="text-xs text-green-300/80">
                            Tu 1RM real ({currentReal1RM || prediction.current1RM} kg) ya cubre la meta ({prediction.target1RM} kg est.).
                        </p>
                    </div>
                )}
            </div>

            {/* Plan expandible (también si está logrado, para poder borrar) */}
            {expanded && (
                <div className="border-t border-[var(--border)] bg-[var(--bg-dark)]/50 p-4 animate-fade-in">
                    {!prediction.achieved && prediction.plan && (
                        <>
                            <div className="flex items-center justify-between mb-4 gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Calendar size={18} className="text-[var(--text-secondary)] shrink-0" aria-hidden />
                                    <h4 className="font-bold text-sm text-[var(--text-secondary)]">Plan semana a semana</h4>
                                </div>
                                {hiddenWeeksCount > 0 && (
                                    <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-lg shrink-0">
                                        {hiddenWeeksCount} hechas
                                    </span>
                                )}
                            </div>

                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {visiblePlan.length === 0 && (
                                    <div className="text-center py-8 text-[var(--text-secondary)]">
                                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                                        <p>Marcaste todas las semanas del checklist a mano.</p>
                                        <p className="text-xs mt-1">Eso no implica haber alcanzado la meta — mira el 1RM real arriba.</p>
                                    </div>
                                )}

                                {visiblePlan.map((weekData) => (
                                    <WeekRow
                                        key={weekData.week}
                                        id={`week-${goal.id}-${weekData.week}`}
                                        weekData={weekData}
                                        isCompleted={false}
                                        isManuallyCompleted={false}
                                        onToggle={(completed) => handleToggleWeek(weekData.week, completed)}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="w-full mt-4 flex items-center justify-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wider hover:text-red-300 py-3"
                    >
                        <Trash2 size={14} /> Eliminar objetivo
                    </button>
                </div>
            )}
        </div>
    );
}
