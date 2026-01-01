import { useState, useEffect, useMemo } from 'react';
import { Settings as SettingsIcon, Dumbbell, Check, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

const MUSCLE_OPTIONS = [
    'Pecho',
    'Espalda',
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Piernas',
    'Core',
    'Otros'
];

export default function Settings() {
    const [exercises, setExercises] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // ID del ejercicio guardándose
    const [expandedMuscle, setExpandedMuscle] = useState(null);
    const toast = useToast();

    useEffect(() => {
        fetchExercises();
    }, []);

    async function fetchExercises() {
        try {
            const data = await api.getExercises();
            setExercises(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function updateMuscle(exerciseId, muscleGroup) {
        setSaving(exerciseId);
        try {
            await api.updateExerciseMuscle(exerciseId, muscleGroup);
            setExercises(prev => prev.map(ex =>
                ex.id === exerciseId ? { ...ex, muscleGroup } : ex
            ));
            toast.success(`Clasificado como ${muscleGroup}`);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al guardar el cambio');
        } finally {
            setSaving(null);
        }
    }

    // MEMOIZED: Group exercises by current muscle
    // Esto previene recálculos innecesarios en cada render
    const exercisesByMuscle = useMemo(() => {
        return exercises.reduce((acc, ex) => {
            const muscle = ex.muscleGroup || 'Sin clasificar';
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});
    }, [exercises]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <SettingsIcon size={24} className="text-[var(--primary)]" />
                    Ajustes
                </h1>
                <p className="text-[var(--text-secondary)] text-sm">Clasificar ejercicios por músculo</p>
            </div>

            {/* Info */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-sm flex gap-3 items-start">
                <Info size={20} className="text-[var(--primary)] shrink-0 mt-0.5" />
                <p className="text-[var(--text-secondary)]">
                    Toca un grupo muscular para ver sus ejercicios y reasígnalos si es necesario. Los cambios son globales.
                </p>
            </div>

            {/* Exercises by Muscle */}
            <div className="space-y-3">
                {Object.entries(exercisesByMuscle).sort().map(([muscle, muscleExercises]) => (
                    <div key={muscle} className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                        <button
                            onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Dumbbell size={18} className="text-[var(--primary)]" />
                                <span className="font-medium">{muscle}</span>
                                <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                                    {muscleExercises.length}
                                </span>
                            </div>
                            {expandedMuscle === muscle ? (
                                <ChevronDown size={18} className="text-[var(--text-secondary)]" />
                            ) : (
                                <ChevronRight size={18} className="text-[var(--text-secondary)]" />
                            )}
                        </button>

                        {expandedMuscle === muscle && (
                            <div className="px-4 pb-3 space-y-2 animate-fade-in bg-[var(--bg-dark)]/30 pt-2">
                                {muscleExercises.map(exercise => (
                                    <div key={exercise.id} className="bg-[var(--bg-dark)] rounded-lg p-3 border border-[var(--border)]">
                                        <p className="text-sm font-medium mb-3 flex items-center gap-2">
                                            {exercise.name}
                                            {saving === exercise.id && <span className="text-[10px] text-[var(--primary)] animate-pulse">Guardando...</span>}
                                        </p>

                                        <div className="flex flex-wrap gap-1.5">
                                            {MUSCLE_OPTIONS.map(option => {
                                                const isSelected = exercise.muscleGroup === option;
                                                const isProcessing = saving === exercise.id;

                                                return (
                                                    <button
                                                        key={option}
                                                        onClick={() => updateMuscle(exercise.id, option)}
                                                        disabled={isProcessing}
                                                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${isSelected
                                                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                                            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--text-secondary)]'
                                                            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        {isSelected ? (
                                                            <span className="flex items-center gap-1">
                                                                <Check size={12} />
                                                                {option}
                                                            </span>
                                                        ) : (
                                                            option
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {exercises.length === 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center border border-[var(--border)]">
                    <Dumbbell size={32} className="mx-auto text-[var(--text-secondary)] mb-2" />
                    <p className="text-sm text-[var(--text-secondary)]">
                        Aún no hay ejercicios registrados.
                    </p>
                </div>
            )}
        </div>
    );
}