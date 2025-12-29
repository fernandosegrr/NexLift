import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Dumbbell, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../services/api';

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
    const [saving, setSaving] = useState(null);
    const [expandedMuscle, setExpandedMuscle] = useState(null);

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
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setSaving(null);
        }
    }

    // Group exercises by current muscle
    const exercisesByMuscle = exercises.reduce((acc, ex) => {
        const muscle = ex.muscleGroup || 'Sin clasificar';
        if (!acc[muscle]) acc[muscle] = [];
        acc[muscle].push(ex);
        return acc;
    }, {});

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
            <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl p-3 text-sm">
                <p className="text-[var(--accent)]">
                    💡 Toca un ejercicio para cambiar su grupo muscular. Los cambios aplican a todos los ejercicios con el mismo nombre.
                </p>
            </div>

            {/* Exercises by Muscle */}
            <div className="space-y-3">
                {Object.entries(exercisesByMuscle).map(([muscle, muscleExercises]) => (
                    <div key={muscle} className="bg-[var(--bg-card)] rounded-xl overflow-hidden">
                        <button
                            onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Dumbbell size={18} className="text-[var(--primary)]" />
                                <span className="font-medium">{muscle}</span>
                                <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-2 py-0.5 rounded-full">
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
                            <div className="px-4 pb-3 space-y-2 animate-fade-in">
                                {muscleExercises.map(exercise => (
                                    <div key={exercise.id} className="bg-[var(--bg-dark)] rounded-lg p-3">
                                        <p className="text-sm font-medium mb-2">{exercise.name}</p>
                                        <div className="flex flex-wrap gap-1">
                                            {MUSCLE_OPTIONS.map(option => (
                                                <button
                                                    key={option}
                                                    onClick={() => updateMuscle(exercise.id, option)}
                                                    disabled={saving === exercise.id}
                                                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${exercise.muscleGroup === option
                                                            ? 'bg-[var(--primary)] text-white'
                                                            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-white'
                                                        }`}
                                                >
                                                    {saving === exercise.id && exercise.muscleGroup !== option ? (
                                                        <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" />
                                                    ) : exercise.muscleGroup === option ? (
                                                        <span className="flex items-center gap-1">
                                                            <Check size={12} />
                                                            {option}
                                                        </span>
                                                    ) : (
                                                        option
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {exercises.length === 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center">
                    <Dumbbell size={32} className="mx-auto text-[var(--text-secondary)] mb-2" />
                    <p className="text-sm text-[var(--text-secondary)]">
                        Aún no hay ejercicios. Importa una rutina primero.
                    </p>
                </div>
            )}
        </div>
    );
}
