import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Save, Trophy, History, X, ChevronLeft, ChevronRight, Target, Lock, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import Celebration from '../components/ui/Celebration';

export default function Workout() {
    const { dayId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [showCelebration, setShowCelebration] = useState(false);

    // --- ESTADOS DE DATOS ---
    const [exercises, setExercises] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dayName, setDayName] = useState('');

    // Sets locales y Memoria Global
    const [sets, setSets] = useState([]);
    const [workoutData, setWorkoutData] = useState({});

    // --- NUEVO ESTADO: Lista de ejercicios ya enviados a la API ---
    const [completedExerciseIds, setCompletedExerciseIds] = useState([]);

    // Estados de UI
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [previousBest, setPreviousBest] = useState(null);

    useEffect(() => {
        fetchDay();
    }, [dayId]);

    // Sincronizar sets con la memoria global solo si NO está completado
    useEffect(() => {
        if (exercises.length > 0 && exercises[currentIndex]) {
            const currentExId = exercises[currentIndex].id;
            // Solo actualizamos la memoria si no se ha "firmado" ya el ejercicio
            if (!completedExerciseIds.includes(currentExId)) {
                setWorkoutData(prev => ({
                    ...prev,
                    [currentExId]: sets
                }));
            }
        }
    }, [sets, completedExerciseIds]); // Añadida dependencia para evitar updates post-complete

    async function fetchDay() {
        try {
            const routines = await api.getRoutines();
            for (const routine of routines) {
                const day = routine.days.find(d => d.id === dayId);
                if (day) {
                    setExercises(day.exercises);
                    setDayName(day.dayName);
                    if (day.exercises.length > 0) {
                        loadExerciseData(day.exercises[0], 0, {});
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

    function loadExerciseData(exercise, index, currentDataState) {
        if (currentDataState[exercise.id]) {
            setSets(currentDataState[exercise.id]);
        } else {
            const newSets = [];
            for (let i = 0; i < exercise.targetSets; i++) {
                newSets.push({ weight: '', reps: '', rir: null, completed: false });
            }
            setSets(newSets);
        }
        loadPreviousBest(exercise.id);
    }

    async function loadPreviousBest(exerciseId) {
        try {
            const historyData = await api.getExerciseHistory(exerciseId);
            if (historyData?.length > 0 && historyData[0].sets?.length > 0) {
                const bestSet = historyData[0].sets.reduce((best, set) => {
                    const volume = (Number(set.weight) || 0) * (Number(set.reps) || 0);
                    const bestVolume = (Number(best.weight) || 0) * (Number(best.reps) || 0);
                    return volume > bestVolume ? set : best;
                }, historyData[0].sets[0]);
                setPreviousBest(bestSet);
            } else {
                setPreviousBest(null);
            }
        } catch (error) {
            setPreviousBest(null);
        }
    }

    // --- Inputs Handlers ---
    function updateSet(index, field, value) {
        if (isAlreadyLogged) return; // BLOQUEO DE EDICIÓN
        setSets(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    }

    function toggleComplete(index) {
        if (isAlreadyLogged) return; // BLOQUEO DE EDICIÓN
        setSets(prev => {
            const updated = [...prev];
            updated[index].completed = !updated[index].completed;
            return updated;
        });
    }

    function setRIR(index, rir) {
        if (isAlreadyLogged) return; // BLOQUEO DE EDICIÓN
        updateSet(index, 'rir', rir);
    }

    function copyWeightToAll() {
        if (isAlreadyLogged) return; // BLOQUEO DE EDICIÓN
        if (sets[0]?.weight) {
            setSets(prev => prev.map(s => ({ ...s, weight: prev[0].weight })));
        }
    }

    // --- Navigation ---
    function goToExercise(newIndex) {
        if (newIndex >= 0 && newIndex < exercises.length) {
            const currentExId = exercises[currentIndex].id;
            const updatedWorkoutData = { ...workoutData, [currentExId]: sets };
            setWorkoutData(updatedWorkoutData);
            setCurrentIndex(newIndex);
            loadExerciseData(exercises[newIndex], newIndex, updatedWorkoutData);
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

    async function handlePrimaryAction() {
        const exercise = exercises[currentIndex];

        // CASO 1: Ejercicio ya completado -> Solo navegar
        if (isAlreadyLogged) {
            if (currentIndex < exercises.length - 1) {
                goToExercise(currentIndex + 1);
            } else {
                setShowSuccess(true);
                setTimeout(() => navigate('/'), 2000);
            }
            return;
        }

        // CASO 2: Guardar nuevo ejercicio
        const validSets = sets
            .filter(s => s.weight !== '' && s.reps !== '')
            .map(s => ({
                weight: parseFloat(s.weight),
                reps: parseInt(s.reps),
                rpe: s.rir !== null ? (10 - s.rir) : null
            }));

        if (validSets.length === 0) {
            toast.error('Registra al menos 1 serie válida');
            return;
        }

        setSaving(true);
        try {
            await api.logWorkout(exercise.id, validSets);

            // Marcar como completado en el array local
            setCompletedExerciseIds(prev => [...prev, exercise.id]);

            if (currentIndex < exercises.length - 1) {
                goToExercise(currentIndex + 1);
            } else {
                setShowSuccess(true);
                setTimeout(() => navigate('/'), 2000);
            }
        } catch (error) {
            toast.error('Error al guardar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    const handleFocus = (e) => e.target.select();

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
    // Variable clave para la UI
    const isAlreadyLogged = currentExercise && completedExerciseIds.includes(currentExercise.id);

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
                <button onClick={loadHistory} className="p-2 -mr-2 text-[var(--text-secondary)]">
                    <History size={20} />
                </button>
            </div>

            {/* Progress Bar */}
            <div className="flex gap-1 mb-4">
                {exercises.map((ex, i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${completedExerciseIds.includes(ex.id) ? 'bg-[var(--success)]' : // Ya enviado a API
                            i === currentIndex ? 'bg-[var(--primary)]' :
                                'bg-[var(--border)]'
                            }`}
                    />
                ))}
            </div>

            {/* Exercise Header */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={() => goToExercise(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="p-2 text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--bg-card)] rounded-full"
                >
                    <ChevronLeft size={24} />
                </button>

                <div className="text-center flex-1 px-2">
                    <p className="text-xs text-[var(--text-secondary)] mb-1">
                        {currentIndex + 1} de {exercises.length}
                    </p>
                    <h1 className="text-xl font-bold leading-tight flex items-center justify-center gap-2">
                        {currentExercise?.name}
                        {isAlreadyLogged && <Check size={20} className="text-[var(--success)]" />}
                    </h1>
                    <p className="text-sm text-[var(--primary)] mt-1">
                        {currentExercise?.targetSets} × {currentExercise?.targetReps}
                    </p>
                </div>

                <button
                    onClick={() => goToExercise(currentIndex + 1)}
                    disabled={currentIndex === exercises.length - 1}
                    className="p-2 text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--bg-card)] rounded-full"
                >
                    <ChevronRight size={24} />
                </button>
            </div>

            {/* Banner de "Ya registrado" */}
            {isAlreadyLogged && (
                <div className="bg-[var(--success)]/10 border border-[var(--success)]/20 text-[var(--success)] text-sm p-3 rounded-xl mb-4 flex items-center justify-center gap-2 animate-fade-in">
                    <Lock size={16} />
                    <span>Ejercicio guardado. Solo lectura.</span>
                </div>
            )}

            {/* Previous Best */}
            {!isAlreadyLogged && previousBest && (
                <div className="bg-[var(--bg-card)] rounded-xl p-3 mb-4 flex items-center justify-center gap-2 border border-[var(--border)]">
                    <Target size={16} className="text-[var(--warning)]" />
                    <span className="text-sm">
                        <span className="text-[var(--text-secondary)]">Mejor previo: </span>
                        <span className="font-bold text-[var(--warning)]">
                            {previousBest.weight}kg × {previousBest.reps}
                        </span>
                    </span>
                </div>
            )}

            {/* Sets Grid */}
            <div className={`flex-1 space-y-3 ${isAlreadyLogged ? 'opacity-80 pointer-events-none' : ''}`}>
                <div className="grid grid-cols-12 gap-2 text-xs text-[var(--text-secondary)] font-medium px-2 text-center">
                    <div className="col-span-1">#</div>
                    <div className="col-span-3">Kg</div>
                    <div className="col-span-3">Reps</div>
                    <div className="col-span-3">RIR</div>
                    <div className="col-span-2">✓</div>
                </div>

                {sets.map((set, i) => (
                    <div key={i} className={`bg-[var(--bg-card)] rounded-xl p-3 ${set.completed ? 'ring-2 ring-[var(--success)]/50' : ''}`}>
                        <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-1 text-center font-bold text-lg text-[var(--text-secondary)]">{i + 1}</div>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    value={set.weight}
                                    onFocus={handleFocus}
                                    onChange={(e) => updateSet(i, 'weight', e.target.value)}
                                    placeholder="0"
                                    readOnly={isAlreadyLogged} // Solo lectura
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 text-center text-lg font-semibold focus:border-[var(--primary)] focus:outline-none"
                                />
                            </div>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    value={set.reps}
                                    onFocus={handleFocus}
                                    onChange={(e) => updateSet(i, 'reps', e.target.value)}
                                    placeholder="0"
                                    readOnly={isAlreadyLogged} // Solo lectura
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 text-center text-lg font-semibold focus:border-[var(--primary)] focus:outline-none"
                                />
                            </div>
                            <div className="col-span-3">
                                <div className="flex gap-0.5 justify-center flex-wrap">
                                    {[0, 1, 2, 3].map(rir => (
                                        <button
                                            key={rir}
                                            onClick={() => setRIR(i, set.rir === rir ? null : rir)}
                                            disabled={isAlreadyLogged} // Deshabilitado
                                            className={`w-6 h-8 rounded text-xs font-medium transition-colors ${set.rir === rir
                                                ? 'bg-[var(--primary)] text-white'
                                                : 'bg-[var(--bg-dark)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            {rir}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="col-span-2 flex justify-center">
                                <button
                                    onClick={() => toggleComplete(i)}
                                    disabled={isAlreadyLogged} // Deshabilitado
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

                {sets.length > 1 && sets[0].weight && !isAlreadyLogged && (
                    <button onClick={copyWeightToAll} className="w-full text-xs text-[var(--text-secondary)] py-2 text-center">
                        Copiar {sets[0].weight}kg a todas
                    </button>
                )}
            </div>

            {/* Smart Action Button */}
            <div className="py-4 mt-4 sticky bottom-0 bg-[var(--bg-main)]/95 backdrop-blur-sm pt-2 pb-4 z-20">
                <button
                    onClick={handlePrimaryAction}
                    disabled={saving}
                    className={`w-full py-4 text-lg font-semibold flex items-center justify-center gap-2 shadow-xl rounded-xl transition-all ${isAlreadyLogged
                        ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border-2 border-[var(--border)] hover:bg-[var(--bg-card-hover)]'
                        : 'bg-[var(--primary)] text-white hover:brightness-110 shadow-[var(--primary)]/20'
                        }`}
                >
                    {saving ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            {isAlreadyLogged ? (
                                <>
                                    <span>Siguiente (Ya registrado)</span>
                                    <ArrowRight size={20} />
                                </>
                            ) : (
                                <>
                                    <Save size={20} />
                                    <span>{currentIndex < exercises.length - 1 ? 'Guardar y Siguiente' : 'Finalizar Rutina'}</span>
                                </>
                            )}
                        </>
                    )}
                </button>
            </div>

            {/* History Modal (Se mantiene igual que antes) */}
            {showHistory && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-end animate-fade-in" onClick={() => setShowHistory(false)}>
                    <div className="bg-[var(--bg-card)] w-full max-h-[70vh] rounded-t-3xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                            <h3 className="font-semibold">Historial: {currentExercise?.name}</h3>
                            <button onClick={() => setShowHistory(false)} className="p-2 bg-[var(--bg-dark)] rounded-full">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            {/* ...contenido historial... */}
                            {history.length === 0 ? <p className="text-center text-[var(--text-secondary)]">Sin datos</p> :
                                history.map((log, i) => (
                                    <div key={i} className="mb-2 bg-[var(--bg-dark)] p-2 rounded">
                                        <div className="text-xs mb-1">{new Date(log.date).toLocaleDateString()}</div>
                                        <div className="flex gap-2">
                                            {log.sets.map((s, j) => <span key={j} className="text-sm bg-[var(--bg-card)] px-1 rounded">{s.weight}x{s.reps}</span>)}
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}