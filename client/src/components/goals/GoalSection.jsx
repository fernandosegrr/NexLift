import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../ui/Toast';
import GoalCard from './GoalCard';

export default function GoalSection() {
    const navigate = useNavigate();
    const toast = useToast();
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [workoutHistory, setWorkoutHistory] = useState({});

    useEffect(() => {
        fetchGoals();
        fetchWorkoutHistory();
    }, []);

    async function fetchGoals() {
        try {
            const data = await api.getGoals();
            setGoals(data || []);
        } catch (err) {
            console.error('Error fetching goals:', err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchWorkoutHistory() {
        try {
            const history = await api.getWorkoutHistory(500);

            // Group sets by exercise name, then by session (date)
            const grouped = {};

            history?.forEach(workout => {
                const exerciseName = workout.exercise?.name?.toLowerCase().trim();
                if (!exerciseName) return;

                if (!grouped[exerciseName]) {
                    grouped[exerciseName] = {
                        muscleGroup: workout.exercise?.muscleGroup,
                        sessions: {} // keyed by date string
                    };
                }

                const dateKey = new Date(workout.date).toISOString().split('T')[0];
                if (!grouped[exerciseName].sessions[dateKey]) {
                    grouped[exerciseName].sessions[dateKey] = [];
                }

                // Add all sets from this workout to the session
                workout.sets?.forEach(set => {
                    if (set.weight && set.reps) {
                        grouped[exerciseName].sessions[dateKey].push({
                            weight: parseFloat(set.weight),
                            reps: parseInt(set.reps)
                        });
                    }
                });
            });

            // Convert sessions object to sorted array with best 1RM per session
            Object.keys(grouped).forEach(name => {
                const sessionsObj = grouped[name].sessions;
                const sessionsArray = Object.keys(sessionsObj)
                    .sort() // Sort by date ascending
                    .map(dateKey => {
                        const sets = sessionsObj[dateKey];
                        // Calculate best 1RM for this session (Epley formula)
                        const best1RM = Math.max(
                            ...sets.map(s => s.weight * (1 + s.reps / 30))
                        );
                        const bestSet = sets.reduce((best, s) => {
                            const rm = s.weight * (1 + s.reps / 30);
                            return rm > (best.weight * (1 + best.reps / 30)) ? s : best;
                        });
                        return {
                            date: dateKey,
                            best1RM,
                            weight: bestSet.weight,
                            reps: bestSet.reps,
                            setsCount: sets.length
                        };
                    });

                grouped[name].sessions = sessionsArray;
            });

            setWorkoutHistory(grouped);
        } catch (err) {
            console.error('Error fetching workout history:', err);
        }
    }

    async function handleDeleteGoal(goalId) {
        try {
            await api.deleteGoal(goalId);
            setGoals(prev => prev.filter(g => g.id !== goalId));
            toast.success('Objetivo eliminado');
        } catch (err) {
            toast.error('Error al eliminar');
        }
    }

    // Function to find matching history (case-insensitive)
    function getHistoryForGoal(goalExerciseName) {
        const normalizedGoalName = goalExerciseName.toLowerCase().trim();
        return workoutHistory[normalizedGoalName] || null;
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
            {/* Header */}
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

            {/* Goals List */}
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
