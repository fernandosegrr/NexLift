import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../ui/Toast';
import GoalCard from './GoalCard';
import { canonicalExerciseKey, groupHistoryByExercise } from '../../utils/exerciseName';

export default function GoalSection() {
    const navigate = useNavigate();
    const toast = useToast();
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    // Map: clave canónica de ejercicio -> { names, muscleGroup, sessions }
    const [workoutHistory, setWorkoutHistory] = useState(() => new Map());

    useEffect(() => {
        async function loadAll() {
            try {
                // Cargar goals e historial EN PARALELO para evitar race condition
                const [goalsData, historyData] = await Promise.all([
                    api.getGoals(),
                    api.getWorkoutHistory(500)
                ]);
                setGoals(goalsData || []);
                // Consolida el historial por ejercicio canónico (une variantes del nombre)
                setWorkoutHistory(groupHistoryByExercise(historyData));
            } catch (err) {
                console.error('Error loading goals data:', err);
            } finally {
                setLoading(false);
            }
        }
        loadAll();
    }, []);

    async function handleDeleteGoal(goalId) {
        try {
            await api.deleteGoal(goalId);
            setGoals(prev => prev.filter(g => g.id !== goalId));
            toast.success('Objetivo eliminado');
        } catch (err) {
            toast.error('Error al eliminar');
        }
    }

    function getHistoryForGoal(goalExerciseName) {
        // El historial est\u00e1 indexado por clave can\u00f3nica; el objetivo se empareja por
        // la misma clave, as\u00ed que tolera variantes del nombre (abreviaturas, plurales,
        // sufijos de grupo muscular, tildes, etc.).
        return workoutHistory.get(canonicalExerciseKey(goalExerciseName)) || null;
    }

    function handleUpdateGoal(updatedGoal) {
        setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold">Mis Objetivos</h2>
                </div>
                <button
                    onClick={() => navigate('/goals/new')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-500 text-white text-sm font-medium rounded-xl hover:bg-purple-600 transition-colors shadow-lg shadow-purple-500/25"
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
                        Crea un objetivo para recibir predicciones de cuándo lo alcanzarás
                    </p>
                    <button
                        onClick={() => navigate('/goals/new')}
                        className="px-5 py-2.5 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors"
                    >
                        Crear Primer Objetivo
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {goals.map(goal => (
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
