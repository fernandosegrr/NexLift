import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Save, Trophy, History, X, ChevronLeft, ChevronRight, Target, Lock, ArrowRight, TrendingUp, Plus, Minus, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

// ==================== CUSTOM HOOKS ====================

// Hook para manejo de persistencia en localStorage
function useWorkoutPersistence(dayId) {
    const [workoutData, setWorkoutData] = useState({});
    const [completedExerciseIds, setCompletedExerciseIds] = useState([]);

    useEffect(() => {
        const savedData = localStorage.getItem(`workout_${dayId}`);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                setWorkoutData(parsed.workoutData || {});
                setCompletedExerciseIds(parsed.completedExerciseIds || []);
            } catch (error) {
                console.error('Error parsing saved workout:', error);
            }
        }
    }, [dayId]);

    const saveToStorage = useCallback((data, completed) => {
        localStorage.setItem(`workout_${dayId}`, JSON.stringify({
            workoutData: data,
            completedExerciseIds: completed,
            timestamp: Date.now()
        }));
    }, [dayId]);

    const clearStorage = useCallback(() => {
        localStorage.removeItem(`workout_${dayId}`);
    }, [dayId]);

    return { workoutData, setWorkoutData, completedExerciseIds, setCompletedExerciseIds, saveToStorage, clearStorage };
}

// Hook para gestión de historial de ejercicio
function useExerciseHistory(exerciseId) {
    const [previousBest, setPreviousBest] = useState(null);
    const [suggestedWeight, setSuggestedWeight] = useState(null);
    const [loading, setLoading] = useState(false);
    const currentRequestRef = useRef(null);

    const loadHistory = useCallback(async () => {
        if (!exerciseId) return;

        const requestId = exerciseId;
        currentRequestRef.current = requestId;
        setLoading(true);

        try {
            const historyData = await api.getExerciseHistory(exerciseId);

            if (currentRequestRef.current !== requestId) return;

            if (historyData?.length > 0 && historyData[0].sets?.length > 0) {
                // Fórmula de Epley: Score = Peso × (1 + Reps/30)
                const calculate1RM = (weight, reps) => weight * (1 + reps / 30);

                const bestSet = historyData[0].sets.reduce((best, set) => {
                    const score = calculate1RM(Number(set.weight) || 0, Number(set.reps) || 0);
                    const bestScore = calculate1RM(Number(best.weight) || 0, Number(best.reps) || 0);

                    // Desempate por menor RIR si scores son similares (<1%)
                    if (bestScore > 0 && Math.abs(score - bestScore) / bestScore < 0.01) {
                        const setRIR = set.rpe ? (10 - set.rpe) : 3;
                        const bestRIR = best.rpe ? (10 - best.rpe) : 3;
                        return setRIR < bestRIR ? set : best;
                    }
                    return score > bestScore ? set : best;
                }, historyData[0].sets[0]);

                setPreviousBest(bestSet);

                // Fórmula de Epley Invertida para objetivo de 10 reps
                // Peso_Sugerido = 1RM_estimado / 1.3333
                const bestWeight = Number(bestSet.weight) || 0;
                const bestReps = Number(bestSet.reps) || 0;
                const bestRIR = bestSet.rpe ? (10 - bestSet.rpe) : 2; // Default RIR=2 si no hay RPE

                // 1RM = Peso × (1 + (Reps + RIR) / 30)
                const estimated1RM = bestWeight * (1 + (bestReps + bestRIR) / 30);

                // Peso óptimo para 10 reps: dividir por (1 + 10/30) = 1.3333
                const optimalWeight = estimated1RM / 1.3333;

                // Redondear a incrementos de 2.5kg
                const suggested = Math.round(optimalWeight / 2.5) * 2.5;

                setSuggestedWeight(suggested > 0 ? suggested : null);
            } else {
                setPreviousBest(null);
                setSuggestedWeight(null);
            }
        } catch (error) {
            setPreviousBest(null);
            setSuggestedWeight(null);
        } finally {
            setLoading(false);
        }
    }, [exerciseId]);

    return { previousBest, suggestedWeight, loading, loadHistory };
}

// ==================== COMPONENTES UI ====================

function SkeletonLoader() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-[var(--bg-card)] rounded-lg w-3/4 mx-auto" />
            <div className="h-4 bg-[var(--bg-card)] rounded w-1/2 mx-auto" />
            {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-[var(--bg-card)] rounded-xl" />
            ))}
        </div>
    );
}

function SetCard({ set, index, onUpdate, onToggle, onSetRIR, onAdjustWeight, isLocked, previousBest }) {
    const handleFocus = (e) => e.target.select();

    // No mostrar "Posible PR" si ya está guardado/bloqueado
    const isPR = useMemo(() => {
        if (!previousBest || isLocked) return false;
        const calculate1RM = (w, r) => w * (1 + r / 30);
        const currentScore = calculate1RM(Number(set.weight) || 0, Number(set.reps) || 0);
        const bestScore = calculate1RM(Number(previousBest.weight) || 0, Number(previousBest.reps) || 0);
        return currentScore > bestScore && set.completed;
    }, [set, previousBest, isLocked]);

    return (
        <div className={`rounded-xl p-3 transition-all duration-200 ${set.completed
            ? 'bg-gradient-to-r from-[var(--success)]/15 to-[var(--bg-card)] ring-2 ring-[var(--success)] shadow-lg shadow-[var(--success)]/20'
            : isPR
                ? 'bg-gradient-to-r from-[var(--warning)]/15 to-[var(--bg-card)] ring-2 ring-[var(--warning)]'
                : 'bg-[var(--bg-card)] border border-[var(--border)]'
            }`}>
            <div className="grid grid-cols-12 gap-2 items-center">
                {/* Set Number - Larger */}
                <div className="col-span-1 text-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-base ${set.completed ? 'bg-[var(--success)] text-white shadow-lg shadow-[var(--success)]/40' : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'
                        }`}>
                        {index + 1}
                    </div>
                </div>

                {/* Weight Input */}
                <div className="col-span-3">
                    <div className="relative">
                        <input
                            type="number"
                            inputMode="decimal"
                            value={set.weight}
                            onFocus={handleFocus}
                            onChange={(e) => onUpdate(index, 'weight', e.target.value)}
                            placeholder="kg"
                            readOnly={isLocked}
                            className={`w-full bg-[var(--bg-dark)] border-2 rounded-lg py-3 text-center text-lg font-bold focus:outline-none transition-all ${set.weight ? 'border-[var(--primary)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)]'
                                } ${isLocked ? 'opacity-60' : 'focus:ring-2 focus:ring-[var(--primary)]/40'}`}
                        />
                        {!isLocked && (
                            <div className="absolute -right-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                                <button
                                    onClick={() => onAdjustWeight(index, 2.5)}
                                    className="w-5 h-5 bg-[var(--primary)] rounded text-white flex items-center justify-center active:scale-90"
                                >
                                    <Plus size={12} strokeWidth={3} />
                                </button>
                                <button
                                    onClick={() => onAdjustWeight(index, -2.5)}
                                    className="w-5 h-5 bg-[var(--bg-dark)] border border-[var(--border)] rounded text-[var(--text-secondary)] flex items-center justify-center active:scale-90"
                                >
                                    <Minus size={12} strokeWidth={3} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Reps Input */}
                <div className="col-span-3">
                    <input
                        type="number"
                        inputMode="numeric"
                        value={set.reps}
                        onFocus={handleFocus}
                        onChange={(e) => onUpdate(index, 'reps', e.target.value)}
                        placeholder="reps"
                        readOnly={isLocked}
                        className={`w-full bg-[var(--bg-dark)] border-2 rounded-lg py-3 text-center text-lg font-bold focus:outline-none transition-all ${set.reps ? 'border-[var(--primary)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)]'
                            } ${isLocked ? 'opacity-60' : 'focus:ring-2 focus:ring-[var(--primary)]/40'}`}
                    />
                </div>

                {/* RIR Buttons */}
                <div className="col-span-3">
                    <div className="flex gap-0.5 justify-center">
                        {[0, 1, 2, 3].map(rir => (
                            <button
                                key={rir}
                                onClick={() => onSetRIR(index, set.rir === rir ? null : rir)}
                                disabled={isLocked}
                                className={`w-9 h-10 rounded-lg text-sm font-bold transition-all active:scale-90 ${set.rir === rir
                                    ? 'bg-[var(--primary)] text-white'
                                    : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'
                                    }`}
                            >
                                {rir}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Check Button */}
                <div className="col-span-2 flex justify-center">
                    <button
                        onClick={() => onToggle(index)}
                        disabled={isLocked}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 ${set.completed
                            ? 'bg-[var(--success)] text-white shadow-lg shadow-[var(--success)]/30'
                            : 'bg-[var(--bg-dark)] border-2 border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                    >
                        <Check size={20} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {isPR && (
                <div className="flex items-center gap-2 text-sm text-[var(--warning)] bg-gradient-to-r from-[var(--warning)]/15 to-transparent px-4 py-2.5 rounded-xl animate-fade-in border border-[var(--warning)]/20">
                    <Sparkles size={16} />
                    <span className="font-semibold">¡Posible PR! Completa para confirmar</span>
                </div>
            )}
        </div>
    );
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function Workout() {
    const { dayId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    // Estados consolidados
    const [workoutState, setWorkoutState] = useState({
        exercises: [],
        currentIndex: 0,
        dayName: '',
        loading: true
    });

    const [uiState, setUIState] = useState({
        saving: false,
        showHistory: false,
        showSuccess: false,
        history: []
    });

    const [sets, setSets] = useState([]);
    const currentExerciseIdRef = useRef(null);

    // Custom hooks
    const { workoutData, setWorkoutData, completedExerciseIds, setCompletedExerciseIds, saveToStorage, clearStorage } = useWorkoutPersistence(dayId);

    const currentExercise = workoutState.exercises[workoutState.currentIndex];
    const { previousBest, suggestedWeight, loadHistory } = useExerciseHistory(currentExercise?.id);

    // Computed values
    const isAlreadyLogged = useMemo(() =>
        currentExercise && completedExerciseIds.includes(currentExercise.id),
        [currentExercise, completedExerciseIds]
    );

    const hasValidSets = useMemo(() =>
        sets.some(s => s.weight !== '' && s.reps !== ''),
        [sets]
    );

    // Guardar en storage cuando cambien los datos
    useEffect(() => {
        if (workoutState.exercises.length > 0) {
            saveToStorage(workoutData, completedExerciseIds);
        }
    }, [workoutData, completedExerciseIds, saveToStorage, workoutState.exercises.length]);

    // Sincronizar sets con workoutData
    useEffect(() => {
        if (currentExercise && !completedExerciseIds.includes(currentExercise.id)) {
            setWorkoutData(prev => ({
                ...prev,
                [currentExercise.id]: sets
            }));
        }
    }, [sets, currentExercise, completedExerciseIds, setWorkoutData]);

    // Cargar datos iniciales
    useEffect(() => {
        fetchDay();
    }, [dayId]);

    async function fetchDay() {
        try {
            const routines = await api.getRoutines();
            for (const routine of routines) {
                const day = routine.days.find(d => d.id === dayId);
                if (day) {
                    setWorkoutState(prev => ({
                        ...prev,
                        exercises: day.exercises,
                        dayName: day.dayName
                    }));

                    await checkCompletedExercises(day.exercises);

                    if (day.exercises.length > 0) {
                        await loadExerciseData(day.exercises[0], 0);
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al cargar rutina');
        } finally {
            setWorkoutState(prev => ({ ...prev, loading: false }));
        }
    }

    async function checkCompletedExercises(exerciseList) {
        const today = new Date().toISOString().split('T')[0];
        const completed = [];

        for (const ex of exerciseList) {
            try {
                const history = await api.getExerciseHistory(ex.id);
                if (history?.length > 0) {
                    const logDate = new Date(history[0].date).toISOString().split('T')[0];
                    if (logDate === today) completed.push(ex.id);
                }
            } catch (error) {
                console.error('Error checking exercise:', error);
            }
        }

        setCompletedExerciseIds(prev => [...new Set([...prev, ...completed])]);
    }

    async function loadExerciseData(exercise, index) {
        currentExerciseIdRef.current = exercise.id;

        // Siempre verificar si hay datos de hoy en la API
        try {
            const history = await api.getExerciseHistory(exercise.id);
            if (currentExerciseIdRef.current !== exercise.id) return;

            if (history?.length > 0 && history[0].sets) {
                const today = new Date().toISOString().split('T')[0];
                const logDate = new Date(history[0].date).toISOString().split('T')[0];

                // Si hay datos de hoy, cargarlos y marcar como completado
                if (logDate === today) {
                    const apiSets = history[0].sets.map(s => ({
                        weight: s.weight.toString(),
                        reps: s.reps.toString(),
                        rir: s.rpe ? (10 - s.rpe) : null,
                        completed: true
                    }));
                    setSets(apiSets);
                    // Agregar a completedExerciseIds si no está
                    if (!completedExerciseIds.includes(exercise.id)) {
                        setCompletedExerciseIds(prev => [...prev, exercise.id]);
                    }
                    loadHistory();
                    return;
                }
            }
        } catch (error) {
            console.error('Error loading exercise data:', error);
        }

        if (workoutData[exercise.id]) {
            setSets(workoutData[exercise.id]);
        } else {
            const newSets = Array.from({ length: exercise.targetSets }, () => ({
                weight: '',
                reps: '',
                rir: null,
                completed: false
            }));
            setSets(newSets);
        }

        loadHistory();
    }

    // Handlers
    const updateSet = useCallback((index, field, value) => {
        if (isAlreadyLogged) return;
        setSets(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    }, [isAlreadyLogged]);

    const toggleComplete = useCallback((index) => {
        if (isAlreadyLogged) return;
        setSets(prev => {
            const updated = [...prev];
            updated[index].completed = !updated[index].completed;
            return updated;
        });

        // Vibración si está disponible
        if (navigator.vibrate) navigator.vibrate(50);
    }, [isAlreadyLogged]);

    const setRIR = useCallback((index, rir) => {
        if (isAlreadyLogged) return;
        updateSet(index, 'rir', rir);
    }, [isAlreadyLogged, updateSet]);

    const adjustWeight = useCallback((index, delta) => {
        if (isAlreadyLogged) return;
        setSets(prev => {
            const updated = [...prev];
            const currentWeight = parseFloat(updated[index].weight) || 0;
            const newWeight = Math.max(0, currentWeight + delta);
            updated[index].weight = (Math.round(newWeight * 2) / 2).toString();
            return updated;
        });
    }, [isAlreadyLogged]);

    const copyWeightToAll = useCallback(() => {
        if (isAlreadyLogged || !sets[0]?.weight) return;
        setSets(prev => prev.map(s => ({ ...s, weight: prev[0].weight })));
        toast.success('Peso copiado a todas las series');
    }, [isAlreadyLogged, sets, toast]);

    const applySuggestedWeight = useCallback(() => {
        if (isAlreadyLogged || !suggestedWeight) return;
        setSets(prev => prev.map(s => ({ ...s, weight: suggestedWeight.toString() })));
        toast.success('Peso sugerido aplicado');
    }, [isAlreadyLogged, suggestedWeight, toast]);

    function goToExercise(newIndex) {
        if (newIndex < 0 || newIndex >= workoutState.exercises.length) return;

        const currentExId = currentExercise.id;
        const hasUnsavedData = sets.some(s => s.weight !== '' || s.reps !== '');
        const isNotSaved = !completedExerciseIds.includes(currentExId);

        // Solo mostrar alerta si hay datos sin guardar Y el ejercicio NO está guardado
        // isAlreadyLogged indica que ya se guardó hoy (detectado en checkCompletedExercises)
        if (hasUnsavedData && isNotSaved && !isAlreadyLogged) {
            const userConfirmed = window.confirm(
                '¿Salir sin guardar? Los datos se mantendrán temporalmente.'
            );
            if (!userConfirmed) return;
        }

        const updatedWorkoutData = { ...workoutData, [currentExId]: sets };
        setWorkoutData(updatedWorkoutData);
        setWorkoutState(prev => ({ ...prev, currentIndex: newIndex }));
        loadExerciseData(workoutState.exercises[newIndex], newIndex);
    }

    async function loadHistoryModal() {
        if (!currentExercise) return;
        setUIState(prev => ({ ...prev, loading: true }));

        try {
            const data = await api.getExerciseHistory(currentExercise.id);
            setUIState(prev => ({
                ...prev,
                history: data,
                showHistory: true,
                loading: false
            }));
        } catch (error) {
            console.error('Error loading history:', error);
            toast.error('Error al cargar historial');
            setUIState(prev => ({ ...prev, loading: false }));
        }
    }

    async function handlePrimaryAction() {
        if (isAlreadyLogged) {
            if (workoutState.currentIndex < workoutState.exercises.length - 1) {
                goToExercise(workoutState.currentIndex + 1);
            } else {
                clearStorage();
                setUIState(prev => ({ ...prev, showSuccess: true }));
                setTimeout(() => navigate('/'), 2000);
            }
            return;
        }

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

        setUIState(prev => ({ ...prev, saving: true }));

        try {
            await api.logWorkout(currentExercise.id, validSets);
            setCompletedExerciseIds(prev => [...prev, currentExercise.id]);
            setWorkoutData(prev => {
                const updated = { ...prev };
                delete updated[currentExercise.id];
                return updated;
            });

            toast.success('¡Ejercicio guardado!');

            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

            if (workoutState.currentIndex < workoutState.exercises.length - 1) {
                setTimeout(() => goToExercise(workoutState.currentIndex + 1), 300);
            } else {
                clearStorage();
                setUIState(prev => ({ ...prev, showSuccess: true }));
                setTimeout(() => navigate('/'), 2000);
            }
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Error al guardar. Intenta de nuevo.');
        } finally {
            setUIState(prev => ({ ...prev, saving: false }));
        }
    }

    if (workoutState.loading) {
        return (
            <div className="min-h-[calc(100vh-80px)] flex flex-col max-w-lg mx-auto p-4">
                <SkeletonLoader />
            </div>
        );
    }

    if (uiState.showSuccess) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] animate-fade-in px-4">
                <div className="w-24 h-24 bg-gradient-to-br from-[var(--success)] to-[var(--success)]/60 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-xl shadow-[var(--success)]/30">
                    <Trophy size={48} className="text-white" />
                </div>
                <h2 className="text-3xl font-bold mb-2">¡Completado!</h2>
                <p className="text-[var(--text-secondary)] text-lg mb-8">Excelente entrenamiento 💪</p>

                <div className="flex gap-3 w-full max-w-sm">
                    <button
                        onClick={() => navigate('/')}
                        className="flex-1 py-4 rounded-xl font-medium bg-[var(--bg-card)] text-[var(--text-primary)] border-2 border-[var(--border)] hover:bg-[var(--border)] transition-all"
                    >
                        Inicio
                    </button>
                    <button
                        onClick={() => navigate('/export?period=daily')}
                        className="flex-1 py-4 rounded-xl font-medium bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/80 text-white flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-[var(--primary)]/30"
                    >
                        Exportar PDF
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-80px)] flex flex-col max-w-lg mx-auto pb-4">
            {/* Top Bar */}
            <div className="flex items-center justify-between py-3 px-4 sticky top-0 bg-[var(--bg-main)]/95 backdrop-blur-sm z-10 border-b border-[var(--border)]/50">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 -ml-2 hover:bg-[var(--bg-card)] rounded-full transition-all active:scale-95"
                >
                    <ArrowLeft size={22} />
                </button>
                <span className="text-sm text-[var(--text-secondary)] font-semibold">
                    {workoutState.dayName}
                </span>
                <button
                    onClick={loadHistoryModal}
                    className="p-2 -mr-2 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] rounded-full transition-all active:scale-95"
                >
                    <History size={20} />
                </button>
            </div>

            <div className="px-4 flex-1 flex flex-col">
                {/* Progress Bar - Enhanced visibility */}
                <div className="flex gap-1.5 my-4">
                    {workoutState.exercises.map((ex, i) => (
                        <div
                            key={i}
                            className={`h-2 flex-1 rounded-full transition-all duration-500 ${completedExerciseIds.includes(ex.id)
                                ? 'bg-[var(--success)]' :
                                i === workoutState.currentIndex
                                    ? 'bg-[var(--primary)]' :
                                    'bg-[var(--border)]'
                                }`}
                        />
                    ))}
                </div>

                {/* Exercise Header - Sticky */}
                <div className="flex items-start justify-between mb-4 gap-3 sticky top-[52px] bg-[var(--bg-dark)]/95 backdrop-blur-sm z-10 -mx-4 px-4 py-2">
                    <button
                        onClick={() => goToExercise(workoutState.currentIndex - 1)}
                        disabled={workoutState.currentIndex === 0}
                        className="p-3 text-[var(--text-secondary)] disabled:opacity-20 hover:bg-[var(--bg-card)] rounded-xl transition-all active:scale-95 mt-2"
                    >
                        <ChevronLeft size={24} />
                    </button>

                    <div className="text-center flex-1">
                        <p className="text-xs text-[var(--text-secondary)] font-medium mb-2 uppercase tracking-wider">
                            Ejercicio {workoutState.currentIndex + 1} de {workoutState.exercises.length}
                        </p>
                        <h1 className="text-2xl font-bold leading-tight flex items-center justify-center gap-2 mb-2">
                            {currentExercise?.name}
                            {isAlreadyLogged && (
                                <div className="w-7 h-7 bg-[var(--success)] rounded-full flex items-center justify-center animate-bounce">
                                    <Check size={16} className="text-white" strokeWidth={3} />
                                </div>
                            )}
                        </h1>
                        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[var(--primary)]/20 to-[var(--primary)]/10 px-4 py-2 rounded-full border border-[var(--primary)]/30">
                            <Target size={16} className="text-[var(--primary)]" />
                            <span className="text-sm font-bold text-[var(--primary)]">
                                {currentExercise?.targetSets} × {currentExercise?.targetReps}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => goToExercise(workoutState.currentIndex + 1)}
                        disabled={workoutState.currentIndex === workoutState.exercises.length - 1}
                        className="p-3 text-[var(--text-secondary)] disabled:opacity-20 hover:bg-[var(--bg-card)] rounded-xl transition-all active:scale-95 mt-2"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                {/* Locked Banner */}
                {isAlreadyLogged && (
                    <div className="bg-gradient-to-r from-[var(--success)]/10 to-transparent border border-[var(--success)]/20 text-[var(--success)] text-sm p-4 rounded-xl mb-4 flex items-center justify-center gap-3 animate-fade-in shadow-lg shadow-[var(--success)]/10">
                        <Lock size={18} />
                        <span className="font-medium">Ejercicio guardado • Solo lectura</span>
                    </div>
                )}

                {/* Previous Best + Suggested Weight */}
                {!isAlreadyLogged && (previousBest || suggestedWeight) && (
                    <div className="bg-gradient-to-r from-[var(--bg-card)] to-[var(--bg-card)]/50 rounded-xl p-4 mb-4 border border-[var(--border)] shadow-lg animate-fade-in">
                        <div className="flex items-center justify-between gap-4 mb-3">
                            {previousBest && (
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="w-8 h-8 bg-[var(--warning)]/20 rounded-lg flex items-center justify-center">
                                        <Target size={16} className="text-[var(--warning)]" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--text-secondary)]">Mejor anterior</p>
                                        <p className="text-lg font-bold text-[var(--warning)]">
                                            {previousBest.weight}kg × {previousBest.reps}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {suggestedWeight && suggestedWeight !== previousBest?.weight && (
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="w-8 h-8 bg-[var(--success)]/20 rounded-lg flex items-center justify-center">
                                        <TrendingUp size={16} className="text-[var(--success)]" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--text-secondary)]">Sugerido</p>
                                        <p className="text-lg font-bold text-[var(--success)]">
                                            {suggestedWeight}kg
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {suggestedWeight && (
                            <button
                                onClick={applySuggestedWeight}
                                className="w-full py-2.5 bg-[var(--success)]/10 hover:bg-[var(--success)]/20 text-[var(--success)] rounded-lg text-sm font-medium transition-all active:scale-95 border border-[var(--success)]/20"
                            >
                                Aplicar peso sugerido a todas
                            </button>
                        )}
                    </div>
                )}

                {/* Sets - Extra padding for sticky button */}
                <div className="flex-1 space-y-3 mb-4 pb-2">
                    {sets.map((set, i) => (
                        <SetCard
                            key={i}
                            set={set}
                            index={i}
                            onUpdate={updateSet}
                            onToggle={toggleComplete}
                            onSetRIR={setRIR}
                            onAdjustWeight={adjustWeight}
                            isLocked={isAlreadyLogged}
                            previousBest={previousBest}
                        />
                    ))}

                    {sets.length > 1 && sets[0].weight && !isAlreadyLogged && (
                        <button
                            onClick={copyWeightToAll}
                            className="w-full text-sm text-[var(--primary)] py-3 text-center font-medium hover:bg-[var(--bg-card)] rounded-lg transition-all active:scale-95"
                        >
                            Copiar {sets[0].weight}kg a todas las series
                        </button>
                    )}
                </div>
            </div>

            {/* Smart Action Button */}
            <div className="px-4 py-3 sticky bottom-0 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)] to-transparent backdrop-blur-sm z-20">
                <button
                    onClick={handlePrimaryAction}
                    disabled={uiState.saving || (!isAlreadyLogged && !hasValidSets)}
                    className={`w-full py-4 text-lg font-bold flex items-center justify-center gap-3 rounded-xl transition-all active:scale-95 shadow-2xl relative overflow-hidden ${isAlreadyLogged
                        ? 'bg-gradient-to-r from-[var(--bg-card)] to-[var(--bg-card)]/80 text-[var(--text-primary)] border-2 border-[var(--border)]'
                        : uiState.saving
                            ? 'bg-[var(--primary)]/50 text-white cursor-wait'
                            : !hasValidSets
                                ? 'bg-[var(--border)] text-[var(--text-secondary)] cursor-not-allowed opacity-50'
                                : 'bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/80 text-white hover:brightness-110 shadow-[var(--primary)]/30'
                        }`}
                >
                    {uiState.saving ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Guardando...</span>
                        </>
                    ) : isAlreadyLogged ? (
                        <>
                            <span>Siguiente ejercicio</span>
                            <ArrowRight size={22} />
                        </>
                    ) : (
                        <>
                            <Save size={22} />
                            <span>
                                {workoutState.currentIndex < workoutState.exercises.length - 1
                                    ? 'Guardar y Continuar'
                                    : 'Finalizar Entrenamiento'}
                            </span>
                        </>
                    )}
                </button>
            </div>

            {/* History Modal */}
            {uiState.showHistory && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-end animate-fade-in"
                    onClick={() => setUIState(prev => ({ ...prev, showHistory: false }))}
                >
                    <div
                        className="bg-[var(--bg-card)] w-full max-h-[75vh] rounded-t-3xl overflow-hidden flex flex-col shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
                            <div>
                                <h3 className="font-bold text-lg">Historial</h3>
                                <p className="text-sm text-[var(--text-secondary)]">{currentExercise?.name}</p>
                            </div>
                            <button
                                onClick={() => setUIState(prev => ({ ...prev, showHistory: false }))}
                                className="p-2 bg-[var(--bg-dark)] rounded-xl hover:bg-[var(--border)] transition-all active:scale-95"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto">
                            {uiState.history.length === 0 ? (
                                <div className="text-center py-12">
                                    <History size={48} className="text-[var(--text-secondary)] mx-auto mb-4 opacity-30" />
                                    <p className="text-[var(--text-secondary)]">Sin datos anteriores</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {uiState.history.map((log, i) => (
                                        <div key={i} className="bg-[var(--bg-dark)] p-4 rounded-xl border border-[var(--border)]">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-medium text-[var(--text-secondary)]">
                                                    {new Date(log.date).toLocaleDateString('es-ES', {
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long'
                                                    })}
                                                </span>
                                                {i === 0 && (
                                                    <span className="text-xs bg-[var(--primary)]/20 text-[var(--primary)] px-2 py-1 rounded-full font-medium">
                                                        Último
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                {log.sets.map((s, j) => (
                                                    <div key={j} className="bg-[var(--bg-card)] px-3 py-2 rounded-lg border border-[var(--border)]">
                                                        <span className="font-semibold">{s.weight}kg</span>
                                                        <span className="text-[var(--text-secondary)] mx-1">×</span>
                                                        <span className="font-semibold">{s.reps}</span>
                                                        {s.rpe && (
                                                            <span className="text-xs text-[var(--text-secondary)] ml-2">
                                                                @{s.rpe}
                                                            </span>
                                                        )}
                                                    </div>
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