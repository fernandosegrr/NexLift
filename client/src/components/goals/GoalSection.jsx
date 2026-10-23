import { useRemoteRead } from '../../app/useRemoteRead';
import { readGoals, readConfirmedHistory } from '../../features/remoteViews';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../ui/Toast';
import GoalCard from './GoalCard';
import { canonicalExerciseKey, groupHistoryByExercise } from '../../utils/exerciseName';

export default function GoalSection() {
    const navigate = useNavigate();
    const toast = useToast();
    const goalQuery = useRemoteRead('goals', [], () => api.getGoals(), readGoals);
    const historyQuery = useRemoteRead('history', [200], () => api.getWorkoutHistory(200), readConfirmedHistory);
    const goals = useMemo(() => goalQuery.data || [], [goalQuery.data]);
    const loading = goalQuery.isPending || historyQuery.isPending;
    const loadError = goalQuery.isError || historyQuery.isError;
    const workoutHistory = useMemo(() => groupHistoryByExercise(historyQuery.data || []), [historyQuery.data]);

    // Activos primero, logrados al final; dentro de cada grupo por fecha de creación
    const sortedGoals = useMemo(() => {
        return [...goals].sort((a, b) => {
            const aDone = a.achievedAt ? 1 : 0;
            const bDone = b.achievedAt ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
    }, [goals]);

    const activeCount = goals.filter(g => !g.achievedAt).length;
    const achievedCount = goals.length - activeCount;

    async function handleDeleteGoal(goalId) {
        if (!window.confirm('¿Eliminar este objetivo? Se pierde el plan y el checklist de semanas.')) {
            return;
        }
        try {
            await api.deleteGoal(goalId);
            await goalQuery.refetch();
            toast.success('Objetivo eliminado');
        } catch {
            toast.error('Error al eliminar');
        }
    }

    function getHistoryForGoal(goalExerciseName) {
        return workoutHistory.get(canonicalExerciseKey(goalExerciseName)) || null;
    }

    function handleUpdateGoal() {
        void goalQuery.refetch();
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
        );
    }

    if (loadError && goals.length === 0) {
        return (
            <div className="bg-[var(--bg-card)] rounded-2xl p-8 border border-[var(--border)] text-center space-y-3">
                <AlertTriangle className="w-10 h-10 text-[var(--warning)] mx-auto" />
                <p className="font-semibold">No se pudieron cargar los objetivos</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Target className="w-5 h-5 text-purple-400 shrink-0" aria-hidden />
                    <div>
                        <h2 className="text-lg font-bold">Mis Objetivos</h2>
                        {goals.length > 0 && (
                            <p className="text-[10px] text-[var(--text-secondary)]">
                                {activeCount} activo{activeCount === 1 ? '' : 's'}
                                {achievedCount > 0 ? ` · ${achievedCount} logrado${achievedCount === 1 ? '' : 's'}` : ''}
                            </p>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/goals/new')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-500 text-white text-sm font-medium rounded-xl hover:bg-purple-600 transition-colors shadow-lg shadow-purple-500/25 shrink-0"
                >
                    <Plus size={16} />
                    Nuevo
                </button>
            </div>

            {goals.length === 0 ? (
                <div className="bg-[var(--bg-card)] rounded-2xl p-8 border border-[var(--border)] text-center">
                    <Target className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-4 opacity-50" />
                    <h3 className="font-semibold mb-2">Sin objetivos</h3>
                    <p className="text-[var(--text-secondary)] text-sm mb-5">
                        Elige un ejercicio y una meta (ej. 120 kg × 1). Con tu historial la app arma un plan semana a semana.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/goals/new')}
                        className="px-5 py-2.5 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors"
                    >
                        Crear primer objetivo
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {sortedGoals.map(goal => (
                        <GoalCard
                            key={goal.id}
                            goal={goal}
                            history={getHistoryForGoal(goal.exerciseName)}
                            onDelete={() => handleDeleteGoal(goal.id)}
                            onUpdate={handleUpdateGoal}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
