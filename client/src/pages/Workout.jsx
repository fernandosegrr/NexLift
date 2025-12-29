import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Save, Trophy, History, X, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { api } from '../services/api';

export default function Workout() {
    const { dayId } = useParams();
    const navigate = useNavigate();
    const [exercises, setExercises] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [sets, setSets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dayName, setDayName] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [previousBest, setPreviousBest] = useState(null);

    useEffect(() => {
        fetchDay();
    }, [dayId]);

    async function fetchDay() {
        try {
            const routines = await api.getRoutines();
            for (const routine of routines) {
                const day = routine.days.find(d => d.id === dayId);
                if (day) {
                    setExercises(day.exercises);
                    setDayName(day.dayName);
                    if (day.exercises.length > 0) {
                        initializeSets(day.exercises[0]);
                        loadPreviousBest(day.exercises[0].id);
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadPreviousBest(exerciseId) {
        try {
            const history = await api.getExerciseHistory(exerciseId);
            if (history.length > 0) {
                const lastSession = history[0];
                const bestSet = lastSession.sets.reduce((best, set) => {
                    const volume = set.weight * set.reps;
                    return volume > (best.weight * best.reps) ? set : best;
                }, lastSession.sets[0]);
                setPreviousBest(bestSet);
            } else {
                setPreviousBest(null);
            }
        } catch (error) {
            setPreviousBest(null);
        }
    }

    function initializeSets(exercise) {
        const newSets = [];
        for (let i = 0; i < exercise.targetSets; i++) {
            newSets.push({ weight: '', reps: '', rir: null, completed: false });
        }
        setSets(newSets);
    }

    function updateSet(index, field, value) {
        setSets(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    }

    function toggleComplete(index) {
        setSets(prev => {
            const updated = [...prev];
            updated[index].completed = !updated[index].completed;
            return updated;
        });
    }

    function setRIR(index, rir) {
        updateSet(index, 'rir', rir);
    }

    function copyWeightToAll() {
        if (sets[0]?.weight) {
            setSets(prev => prev.map(s => ({ ...s, weight: prev[0].weight })));
        }
    }

    async function loadHistory() {
        const exercise = exercises[currentIndex];
        if (!exercise) return;

        try {
            const data = await api.getExerciseHistory(exercise.id);
            setHistory(data);
            setShowHistory(true);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async function saveAndContinue() {
        const exercise = exercises[currentIndex];
        const validSets = sets
            .filter(s => s.weight && s.reps)
            .map(s => ({
                weight: parseFloat(s.weight),
                reps: parseInt(s.reps),
                rpe: s.rir !== null ? (10 - s.rir) : null // Convert RIR to RPE
            }));

        if (validSets.length === 0) {
            alert('Registra al menos 1 serie');
            return;
        }

        setSaving(true);
        try {
            await api.logWorkout(exercise.id, validSets);

            if (currentIndex < exercises.length - 1) {
                const nextIndex = currentIndex + 1;
                setCurrentIndex(nextIndex);
                initializeSets(exercises[nextIndex]);
                loadPreviousBest(exercises[nextIndex].id);
            } else {
                setShowSuccess(true);
                setTimeout(() => navigate('/'), 2000);
            }
        } catch (error) {
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    function goToExercise(index) {
        if (index >= 0 && index < exercises.length) {
            setCurrentIndex(index);
            initializeSets(exercises[index]);
            loadPreviousBest(exercises[index].id);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (showSuccess) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
                <div className="w-20 h-20 bg-[var(--success)]/20 rounded-full flex items-center justify-center mb-4">
                    <Trophy size={40} className="text-[var(--success)]" />
                </div>
                <h2 className="text-2xl font-bold mb-2">¡Completado!</h2>
                <p className="text-[var(--text-secondary)]">Excelente entrenamiento 💪</p>
            </div>
        );
    }

    const currentExercise = exercises[currentIndex];

    return (
        <div className="min-h-[calc(100vh-80px)] flex flex-col max-w-lg mx-auto">
            {/* Top Bar */}
            <div className="flex items-center justify-between py-3">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                    <ArrowLeft size={22} />
                </button>
                <span className="text-sm text-[var(--text-secondary)] font-medium">
                    {dayName}
                </span>
                <button
                    onClick={loadHistory}
                    className="p-2 -mr-2 text-[var(--text-secondary)]"
                >
                    <History size={20} />
                </button>
            </div>

            {/* Progress */}
            <div className="flex gap-1 mb-4">
                {exercises.map((_, i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${i < currentIndex ? 'bg-[var(--success)]' :
                                i === currentIndex ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
                            }`}
                    />
                ))}
            </div>

            {/* Exercise Navigation */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={() => goToExercise(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="p-2 text-[var(--text-secondary)] disabled:opacity-30"
                >
                    <ChevronLeft size={24} />
                </button>

                <div className="text-center flex-1">
                    <p className="text-xs text-[var(--text-secondary)] mb-1">
                        {currentIndex + 1} de {exercises.length}
                    </p>
                    <h1 className="text-xl font-bold">{currentExercise?.name}</h1>
                    <p className="text-sm text-[var(--primary)]">
                        {currentExercise?.targetSets} × {currentExercise?.targetReps}
                    </p>
                </div>

                <button
                    onClick={() => goToExercise(currentIndex + 1)}
                    disabled={currentIndex === exercises.length - 1}
                    className="p-2 text-[var(--text-secondary)] disabled:opacity-30"
                >
                    <ChevronRight size={24} />
                </button>
            </div>

            {/* Ghost Mode - Previous Best */}
            {previousBest && (
                <div className="bg-[var(--bg-card)] rounded-xl p-3 mb-4 flex items-center justify-center gap-2">
                    <Target size={16} className="text-[var(--warning)]" />
                    <span className="text-sm">
                        <span className="text-[var(--text-secondary)]">Supera: </span>
                        <span className="font-bold text-[var(--warning)]">
                            {previousBest.weight}kg × {previousBest.reps}
                        </span>
                    </span>
                </div>
            )}

            {currentExercise?.note && (
                <div className="bg-[var(--accent)]/10 text-[var(--accent)] text-sm px-4 py-2 rounded-xl mb-4 text-center">
                    💡 {currentExercise.note}
                </div>
            )}

            {/* Sets */}
            <div className="flex-1 space-y-3">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-xs text-[var(--text-secondary)] font-medium px-2">
                    <div className="col-span-1">#</div>
                    <div className="col-span-3">Kg</div>
                    <div className="col-span-3">Reps</div>
                    <div className="col-span-3">RIR</div>
                    <div className="col-span-2 text-center">✓</div>
                </div>

                {sets.map((set, i) => (
                    <div
                        key={i}
                        className={`bg-[var(--bg-card)] rounded-xl p-3 transition-all ${set.completed ? 'ring-2 ring-[var(--success)]/50' : ''
                            }`}
                    >
                        <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-1 text-center font-bold text-lg text-[var(--text-secondary)]">
                                {i + 1}
                            </div>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={set.weight}
                                    onChange={(e) => updateSet(i, 'weight', e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 text-center text-lg font-semibold focus:border-[var(--primary)] focus:outline-none"
                                />
                            </div>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.reps}
                                    onChange={(e) => updateSet(i, 'reps', e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 text-center text-lg font-semibold focus:border-[var(--primary)] focus:outline-none"
                                />
                            </div>
                            <div className="col-span-3">
                                <div className="flex gap-1 justify-center">
                                    {[0, 1, 2, 3].map(rir => (
                                        <button
                                            key={rir}
                                            onClick={() => setRIR(i, set.rir === rir ? null : rir)}
                                            className={`rir-badge ${set.rir === rir ? 'selected' : ''}`}
                                        >
                                            {rir}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="col-span-2 flex justify-center">
                                <button
                                    onClick={() => toggleComplete(i)}
                                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${set.completed
                                            ? 'bg-[var(--success)] text-white'
                                            : 'bg-[var(--border)] text-[var(--text-secondary)]'
                                        }`}
                                >
                                    <Check size={20} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Quick actions */}
                {sets.length > 1 && sets[0].weight && (
                    <button
                        onClick={copyWeightToAll}
                        className="w-full text-sm text-[var(--accent)] py-2 text-center"
                    >
                        Aplicar {sets[0].weight}kg a todas
                    </button>
                )}
            </div>

            {/* Save Button */}
            <div className="py-4 mt-auto">
                <button
                    onClick={saveAndContinue}
                    disabled={saving}
                    className="btn-primary w-full py-4 text-lg font-semibold flex items-center justify-center gap-2"
                >
                    {saving ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save size={20} />
                            {currentIndex < exercises.length - 1 ? 'Guardar y Siguiente' : 'Finalizar'}
                        </>
                    )}
                </button>
            </div>

            {/* History Modal */}
            {showHistory && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-end animate-fade-in">
                    <div className="bg-[var(--bg-card)] w-full max-h-[70vh] rounded-t-3xl overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                            <h3 className="font-semibold">Historial: {currentExercise?.name}</h3>
                            <button onClick={() => setShowHistory(false)} className="p-2">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[50vh]">
                            {history.length === 0 ? (
                                <p className="text-center text-[var(--text-secondary)] py-8">
                                    Sin registros previos
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {history.map((log, i) => (
                                        <div key={i} className="bg-[var(--bg-dark)] rounded-xl p-3">
                                            <p className="text-xs text-[var(--text-secondary)] mb-2">
                                                {new Date(log.date).toLocaleDateString('es-ES', {
                                                    weekday: 'short', day: 'numeric', month: 'short'
                                                })}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {log.sets.map((set, j) => (
                                                    <span key={j} className="text-sm bg-[var(--bg-card)] px-2 py-1 rounded">
                                                        {set.weight}kg × {set.reps}
                                                        {set.rpe && <span className="text-[var(--text-secondary)]"> @{10 - set.rpe}</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
