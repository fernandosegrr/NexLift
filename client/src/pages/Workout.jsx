import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Check, Save, Trophy, History, X, ChevronLeft, ChevronRight,
    Target, Lock, ArrowRight, TrendingUp, Sparkles, Dumbbell
} from 'lucide-react';
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
                const isExpired = parsed.timestamp && (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000);
                if (isExpired) {
                    localStorage.removeItem(`workout_${dayId}`);
                    return;
                }
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
function useExerciseHistory(exerciseId, targetReps) {
    const [previousBest, setPreviousBest] = useState(null);
    const [suggestedWeight, setSuggestedWeight] = useState(null);
    const [loading, setLoading] = useState(false);
    const currentRequestRef = useRef(null);

    const parseTargetReps = (reps) => {
        if (!reps) return 10;
        const str = String(reps);
        const match = str.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : 10;
    };

    const loadHistoryInternal = useCallback(async () => {
        if (!exerciseId) return;
        const requestId = exerciseId;
        currentRequestRef.current = requestId;
        setLoading(true);

        try {
            const historyData = await api.getExerciseHistory(exerciseId);
            if (currentRequestRef.current !== requestId) return;

            const allSets = historyData?.flatMap(session => session.sets || []) || [];

            if (allSets.length > 0) {
                const calculate1RM = (weight, reps) => weight * (1 + reps / 30);
                const bestSet = allSets.reduce((best, set) => {
                    const score = calculate1RM(Number(set.weight) || 0, Number(set.reps) || 0);
                    const bestScore = calculate1RM(Number(best.weight) || 0, Number(best.reps) || 0);
                    if (bestScore > 0 && Math.abs(score - bestScore) / bestScore < 0.01) {
                        const setRIR = set.rpe ? (10 - set.rpe) : 3;
                        const bestRIR = best.rpe ? (10 - best.rpe) : 3;
                        return setRIR < bestRIR ? set : best;
                    }
                    return score > bestScore ? set : best;
                }, allSets[0]);

                setPreviousBest(bestSet);

                const bestWeight = Number(bestSet.weight) || 0;
                const bestReps = Number(bestSet.reps) || 0;
                const bestRIR = bestSet.rpe ? (10 - bestSet.rpe) : 2;
                const estimated1RM = bestWeight * (1 + (bestReps + bestRIR) / 30);
                const targetRepCount = parseTargetReps(targetReps);
                const optimalWeight = estimated1RM / (1 + targetRepCount / 30);
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
    }, [exerciseId, targetReps]);

    useEffect(() => {
        setPreviousBest(null);
        setSuggestedWeight(null);
        if (exerciseId) {
            loadHistoryInternal();
        }
    }, [exerciseId, loadHistoryInternal]);

    return { previousBest, suggestedWeight, loading, loadHistory: loadHistoryInternal };
}

// ==================== COMPONENTES UI ====================

const SkeletonLoader = () => (
    <div className="space-y-6 w-full animate-pulse p-4 max-w-lg mx-auto">
        <div className="flex justify-between items-center mb-6">
            <div className="h-8 bg-[var(--bg-card)] rounded-lg w-1/3" />
            <div className="h-8 bg-[var(--bg-card)] rounded-full w-8" />
        </div>
        <div className="h-32 bg-[var(--bg-card)] rounded-2xl w-full mb-6" />
        {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-[var(--bg-card)] rounded-xl w-full" />
        ))}
    </div>
);

// Componente memoizado - compara props específicas para detectar cambios
const SetCard = memo(({ set, index, onUpdate, onToggle, onSetRIR, isLocked, previousBest }) => {
    const handleFocus = (e) => e.target.select();

    const isPR = useMemo(() => {
        if (!previousBest || isLocked || !set.completed) return false;
        const currentScore = (Number(set.weight) || 0) * (1 + (Number(set.reps) || 0) / 30);
        const bestScore = (Number(previousBest.weight) || 0) * (1 + (Number(previousBest.reps) || 0) / 30);
        return currentScore > bestScore;
    }, [set, previousBest, isLocked]);

    return (
        <div className={`group relative rounded-2xl p-3 transition-all duration-300 ${set.completed
            ? 'bg-[var(--success)]/10 ring-1 ring-[var(--success)]/50'
            : 'bg-[var(--bg-card)] border border-[var(--border)]'
            }`}>
            {/* Etiqueta vertical para ahorrar espacio horizontal */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-1 z-10">
                <span className={`text-[10px] font-bold uppercase rotate-180 py-1 [writing-mode:vertical-rl] tracking-wider ${set.completed ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'
                    }`}>Set {index + 1}</span>
            </div>

            <div className="grid grid-cols-10 gap-3 items-center">
                {/* Inputs Wrapper */}
                <div className="col-span-8 grid grid-cols-2 gap-3">
                    {/* Peso */}
                    <div className="relative">
                        <input
                            type="number"
                            inputMode="decimal"
                            value={set.weight}
                            onFocus={handleFocus}
                            onChange={(e) => onUpdate(index, 'weight', e.target.value)}
                            placeholder="0"
                            readOnly={isLocked}
                            className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.weight ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                } ${isLocked ? 'opacity-60' : 'focus:ring-[var(--primary)]/50 focus:bg-[var(--bg-dark)]'}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">KG</span>
                    </div>

                    {/* Reps */}
                    <div className="relative">
                        <input
                            type="number"
                            inputMode="numeric"
                            value={set.reps}
                            onFocus={handleFocus}
                            onChange={(e) => onUpdate(index, 'reps', e.target.value)}
                            placeholder="0"
                            readOnly={isLocked}
                            className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.reps ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                } ${isLocked ? 'opacity-60' : 'focus:ring-[var(--primary)]/50 focus:bg-[var(--bg-dark)]'}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">REP</span>
                    </div>

                    {/* RIR Selector (Estilo Control Segmentado) */}
                    <div className="col-span-2 flex items-center bg-[var(--bg-dark)]/50 rounded-lg p-1 h-9 mt-1">
                        <span className="text-[10px] text-[var(--text-secondary)] w-8 text-center font-bold">RIR</span>
                        <div className="flex flex-1 justify-end gap-1 h-full">
                            {[0, 1, 2, 3].map(rir => (
                                <button
                                    key={rir}
                                    onClick={() => onSetRIR(index, set.rir === rir ? null : rir)}
                                    disabled={isLocked}
                                    className={`flex-1 rounded flex items-center justify-center text-xs font-bold transition-all ${set.rir === rir
                                        ? 'bg-[var(--primary)] text-white shadow-sm scale-105'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                                        }`}
                                >
                                    {rir}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Check Button (Zona Táctil Grande) */}
                <div className="col-span-2 flex justify-end">
                    <button
                        onClick={() => onToggle(index)}
                        disabled={isLocked}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${set.completed
                            ? 'bg-[var(--success)] text-white shadow-lg shadow-[var(--success)]/30 scale-105'
                            : 'bg-[var(--bg-dark)] border-2 border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                            }`}
                    >
                        <Check size={24} strokeWidth={set.completed ? 3 : 2} />
                    </button>
                </div>
            </div>

            {/* PR Badge */}
            {isPR && (
                <div className="absolute -top-2 -right-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 animate-in zoom-in z-20">
                    <Sparkles size={10} fill="currentColor" /> PR
                </div>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison - re-render when any set property changes
    return prevProps.set.weight === nextProps.set.weight &&
        prevProps.set.reps === nextProps.set.reps &&
        prevProps.set.completed === nextProps.set.completed &&
        prevProps.set.rir === nextProps.set.rir &&
        prevProps.index === nextProps.index &&
        prevProps.isLocked === nextProps.isLocked &&
        prevProps.previousBest === nextProps.previousBest;
});

// ==================== COMPONENTE PRINCIPAL ====================

export default function Workout() {
    const { dayId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    // Estados
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
    const { previousBest, suggestedWeight, loadHistory } = useExerciseHistory(currentExercise?.id, currentExercise?.targetReps);

    // Valores computados
    const isAlreadyLogged = useMemo(() =>
        currentExercise && completedExerciseIds.includes(currentExercise.id),
        [currentExercise, completedExerciseIds]
    );

    const hasValidSets = useMemo(() =>
        sets.some(s => s.weight !== '' && s.reps !== ''),
        [sets]
    );

    // Guardado automático en localStorage
    useEffect(() => {
        if (workoutState.exercises.length > 0) {
            saveToStorage(workoutData, completedExerciseIds);
        }
    }, [workoutData, completedExerciseIds, saveToStorage, workoutState.exercises.length]);

    // Sincronizar sets al cambiar datos
    useEffect(() => {
        if (currentExercise && !completedExerciseIds.includes(currentExercise.id)) {
            setWorkoutData(prev => ({
                ...prev,
                [currentExercise.id]: sets
            }));
        }
    }, [sets, currentExercise, completedExerciseIds, setWorkoutData]);

    // Carga inicial
    useEffect(() => {
        fetchDay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const today = new Date().toLocaleDateString('sv'); // ISO format YYYY-MM-DD
        const results = await Promise.all(
            exerciseList.map(async (ex) => {
                try {
                    const history = await api.getExerciseHistory(ex.id);
                    if (history?.length > 0) {
                        const logDate = new Date(history[0].date).toLocaleDateString('sv');
                        if (logDate === today) return ex.id;
                    }
                } catch (error) {
                    console.error('Error checking exercise:', error);
                }
                return null;
            })
        );
        const completed = results.filter(Boolean);
        setCompletedExerciseIds(prev => [...new Set([...prev, ...completed])]);
    }

    async function loadExerciseData(exercise, index) {
        currentExerciseIdRef.current = exercise.id;
        try {
            const history = await api.getExerciseHistory(exercise.id);
            if (currentExerciseIdRef.current !== exercise.id) return;

            if (history?.length > 0 && history[0].sets) {
                const today = new Date().toLocaleDateString('sv');
                const logDate = new Date(history[0].date).toLocaleDateString('sv');

                if (logDate === today) {
                    const apiSets = history[0].sets.map(s => ({
                        weight: s.weight.toString(),
                        reps: s.reps.toString(),
                        rir: s.rpe ? (10 - s.rpe) : null,
                        completed: true
                    }));
                    setSets(apiSets);
                    if (!completedExerciseIds.includes(exercise.id)) {
                        setCompletedExerciseIds(prev => [...prev, exercise.id]);
                    }
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
    }

    // Handlers
    const updateSet = useCallback((index, field, value) => {
        if (isAlreadyLogged) return;
        // Validación básica para evitar negativos
        if (field === 'weight' || field === 'reps') {
            if (value && parseFloat(value) < 0) return;
        }
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
        if (navigator.vibrate) navigator.vibrate(50);
    }, [isAlreadyLogged]);

    const setRIR = useCallback((index, rir) => {
        if (isAlreadyLogged) return;
        updateSet(index, 'rir', rir);
    }, [isAlreadyLogged, updateSet]);

    const copyWeightToAll = useCallback(() => {
        if (isAlreadyLogged || !sets[0]?.weight) return;
        setSets(prev => prev.map(s => ({ ...s, weight: prev[0].weight })));
        toast.success('Peso copiado');
    }, [isAlreadyLogged, sets, toast]);

    const applySuggestedWeight = useCallback(() => {
        if (isAlreadyLogged || !suggestedWeight) return;
        setSets(prev => prev.map(s => ({ ...s, weight: suggestedWeight.toString() })));
        toast.success('Peso sugerido aplicado');
    }, [isAlreadyLogged, suggestedWeight, toast]);

    function goToExercise(newIndex) {
        if (newIndex < 0 || newIndex >= workoutState.exercises.length) return;

        // Scroll al inicio suavemente
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const currentExId = currentExercise.id;
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
            toast.error('Error al cargar historial');
            setUIState(prev => ({ ...prev, loading: false }));
        }
    }

    async function handlePrimaryAction() {
        if (isAlreadyLogged) {
            if (workoutState.currentIndex < workoutState.exercises.length - 1) {
                goToExercise(workoutState.currentIndex + 1);
            } else {
                finishWorkout();
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
            toast.error('Registra al menos 1 serie');
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

            toast.success('¡Guardado!');
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

            if (workoutState.currentIndex < workoutState.exercises.length - 1) {
                setTimeout(() => goToExercise(workoutState.currentIndex + 1), 300);
            } else {
                finishWorkout();
            }
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Error al guardar');
        } finally {
            setUIState(prev => ({ ...prev, saving: false }));
        }
    }

    function finishWorkout() {
        clearStorage();
        setUIState(prev => ({ ...prev, showSuccess: true }));
        setTimeout(() => navigate('/'), 2000);
    }

    if (workoutState.loading) return <SkeletonLoader />;

    if (uiState.showSuccess) {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] px-4 animate-fade-in text-center">
                <div className="w-24 h-24 bg-[var(--success)]/20 rounded-full flex items-center justify-center mb-6 animate-bounce ring-4 ring-[var(--success)]/10">
                    <Trophy size={48} className="text-[var(--success)]" />
                </div>
                <h2 className="text-3xl font-black mb-2 text-[var(--text-primary)]">¡Entrenamiento Listo!</h2>
                <p className="text-[var(--text-secondary)] text-lg mb-8">Gran trabajo hoy 💪</p>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-80px)] max-w-lg mx-auto bg-[var(--bg-main)] px-4 py-4">

            {/* Header - Al inicio, se desplaza con el contenido */}
            <div className="flex items-center justify-between mb-6">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-[var(--bg-card)] rounded-full transition-colors active:scale-95">
                    <ArrowLeft size={20} className="text-[var(--text-primary)]" />
                </button>

                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                        {workoutState.dayName}
                    </span>
                    {/* Progress Dots */}
                    <div className="flex gap-1 mt-1.5">
                        {workoutState.exercises.map((ex, i) => (
                            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === workoutState.currentIndex ? 'w-6 bg-[var(--primary)]' :
                                completedExerciseIds.includes(ex.id) ? 'w-1.5 bg-[var(--success)]' : 'w-1.5 bg-[var(--border)]'
                                }`} />
                        ))}
                    </div>
                </div>

                <button onClick={loadHistoryModal} className="p-2 -mr-2 hover:bg-[var(--bg-card)] rounded-full transition-colors text-[var(--text-secondary)] active:scale-95">
                    <History size={20} />
                </button>
            </div>

            {/* Exercise Title Card */}
            <div className="mb-6 text-center">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <button
                        onClick={() => goToExercise(workoutState.currentIndex - 1)}
                        disabled={workoutState.currentIndex === 0}
                        className="p-3 rounded-xl hover:bg-[var(--bg-card)] text-[var(--text-secondary)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                    >
                        <ChevronLeft size={24} />
                    </button>

                    <div className="bg-[var(--primary)]/10 px-3 py-1 rounded-full border border-[var(--primary)]/20">
                        <span className="text-xs font-bold text-[var(--primary)] tracking-wide">
                            EJERCICIO {workoutState.currentIndex + 1} / {workoutState.exercises.length}
                        </span>
                    </div>

                    <button
                        onClick={() => goToExercise(workoutState.currentIndex + 1)}
                        disabled={workoutState.currentIndex === workoutState.exercises.length - 1}
                        className="p-3 rounded-xl hover:bg-[var(--bg-card)] text-[var(--text-secondary)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                <h1 className="text-2xl font-black text-[var(--text-primary)] leading-tight mb-2 px-2">
                    {currentExercise?.name}
                </h1>

                <div className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] bg-[var(--bg-card)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
                    <Target size={14} />
                    <span>Meta: <span className="font-bold text-[var(--text-primary)]">{currentExercise?.targetSets} × {currentExercise?.targetReps}</span></span>
                </div>
            </div>

            {/* Banner de Estado (Bloqueado/Sugerencias) */}
            <div className="mb-6 space-y-3 ml-4">
                {isAlreadyLogged ? (
                    <div className="bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-2xl p-4 flex items-center gap-3 animate-fade-in">
                        <div className="bg-[var(--success)] p-2 rounded-full text-white shadow-sm">
                            <Check size={16} strokeWidth={3} />
                        </div>
                        <div>
                            <p className="font-bold text-[var(--success)] text-sm">Ejercicio Completado</p>
                            <p className="text-[var(--success)]/80 text-xs">Guardado hoy a las {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                    </div>
                ) : (previousBest || suggestedWeight) && (
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-1 shadow-sm flex divide-x divide-[var(--border)]">
                        {previousBest && (
                            <div className="flex-1 p-3 flex flex-col items-center">
                                <span className="text-[10px] uppercase text-[var(--text-secondary)] font-bold mb-1">Mejor Anterior</span>
                                <div className="flex items-end gap-1 text-[var(--text-primary)]">
                                    <span className="text-lg font-bold tabular-nums">{previousBest.weight}</span>
                                    <span className="text-xs mb-1 text-[var(--text-secondary)]">kg</span>
                                    <span className="mx-1 text-[var(--border)]">/</span>
                                    <span className="text-lg font-bold tabular-nums">{previousBest.reps}</span>
                                    <span className="text-xs mb-1 text-[var(--text-secondary)]">reps</span>
                                </div>
                            </div>
                        )}
                        {suggestedWeight && (
                            <button
                                onClick={applySuggestedWeight}
                                className="flex-1 p-3 flex flex-col items-center hover:bg-[var(--bg-dark)] transition-colors active:scale-95 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-[var(--success)]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[10px] uppercase text-[var(--success)] font-bold mb-1 flex items-center gap-1">
                                    Sugerido <Sparkles size={10} />
                                </span>
                                <div className="flex items-end gap-1 text-[var(--success)] group-hover:scale-105 transition-transform">
                                    <span className="text-2xl font-black tracking-tight leading-none">{suggestedWeight}</span>
                                    <span className="text-xs mb-0.5 font-bold">kg</span>
                                </div>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Sets List - Left margin for vertical SET labels */}
            <div className="space-y-4 ml-4">
                {sets.map((set, i) => (
                    <SetCard
                        key={i}
                        set={set}
                        index={i}
                        onUpdate={updateSet}
                        onToggle={toggleComplete}
                        onSetRIR={setRIR}
                        isLocked={isAlreadyLogged}
                        previousBest={previousBest}
                    />
                ))}
            </div>

            {/* Botón Copiar Peso (Solo si hay datos y no está bloqueado) */}
            {!isAlreadyLogged && sets[0]?.weight && sets.length > 1 && (
                <div className="flex justify-center mt-6 ml-4">
                    <button
                        onClick={copyWeightToAll}
                        className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] bg-[var(--bg-card)] px-5 py-2.5 rounded-full border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all active:scale-95 shadow-sm"
                    >
                        <Dumbbell size={14} />
                        <span>Copiar {sets[0].weight}kg a todo</span>
                    </button>
                </div>
            )}

            {/* Botón de acción - al final del contenido */}
            <div className="mt-8 mb-4 ml-4">
                <button
                    onClick={handlePrimaryAction}
                    disabled={uiState.saving || (!isAlreadyLogged && !hasValidSets)}
                    className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${isAlreadyLogged
                        ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border-2 border-[var(--border)] shadow-none'
                        : uiState.saving
                            ? 'bg-[var(--primary)]/80 text-white cursor-wait'
                            : hasValidSets
                                ? 'bg-[var(--primary)] text-white hover:brightness-110 shadow-[var(--primary)]/25'
                                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] opacity-50 cursor-not-allowed border border-[var(--border)] shadow-none'
                        }`}
                >
                    {uiState.saving ? (
                        <>
                            <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                            <span>Guardando...</span>
                        </>
                    ) : isAlreadyLogged ? (
                        workoutState.currentIndex < workoutState.exercises.length - 1 ? (
                            <>
                                <span>Siguiente</span>
                                <ArrowRight size={22} />
                            </>
                        ) : (
                            <>
                                <Trophy size={22} />
                                <span>Finalizar</span>
                            </>
                        )
                    ) : (
                        <>
                            <Save size={20} strokeWidth={2.5} />
                            <span>
                                {workoutState.currentIndex < workoutState.exercises.length - 1
                                    ? 'Guardar Serie'
                                    : 'Finalizar Entrenamiento'}
                            </span>
                        </>
                    )}
                </button>
            </div>

            {/* History Modal */}
            {uiState.showHistory && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end animate-fade-in"
                    onClick={() => setUIState(prev => ({ ...prev, showHistory: false }))}
                >
                    <div
                        className="bg-[var(--bg-card)] w-full max-h-[80vh] rounded-t-3xl overflow-hidden flex flex-col shadow-2xl animate-slide-up"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-primary)]">Historial</h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{currentExercise?.name}</p>
                            </div>
                            <button
                                onClick={() => setUIState(prev => ({ ...prev, showHistory: false }))}
                                className="p-2 bg-[var(--bg-dark)] rounded-full hover:bg-[var(--border)] transition-colors active:scale-90"
                            >
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto overscroll-contain">
                            {uiState.history.length === 0 ? (
                                <div className="text-center py-16 flex flex-col items-center">
                                    <History size={48} className="text-[var(--border)] mb-4" />
                                    <p className="text-[var(--text-secondary)] font-medium">No hay registros previos</p>
                                </div>
                            ) : (
                                <div className="space-y-4 pb-8">
                                    {uiState.history.map((log, i) => (
                                        <div key={i} className="bg-[var(--bg-dark)]/50 p-4 rounded-2xl border border-[var(--border)]">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-bold text-[var(--text-secondary)] capitalize">
                                                    {new Date(log.date).toLocaleDateString('es-ES', {
                                                        weekday: 'short', day: 'numeric', month: 'short'
                                                    })}
                                                </span>
                                                {i === 0 && (
                                                    <span className="text-[10px] uppercase tracking-wider bg-[var(--primary)]/20 text-[var(--primary)] px-2 py-0.5 rounded-full font-bold">
                                                        Último
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                {log.sets.map((s, j) => (
                                                    <div key={j} className="bg-[var(--bg-card)] px-3 py-1.5 rounded-lg border border-[var(--border)] flex items-baseline gap-1 shadow-sm">
                                                        <span className="font-bold text-[var(--text-primary)]">{s.weight}</span>
                                                        <span className="text-[10px] text-[var(--text-secondary)]">kg</span>
                                                        <span className="text-[var(--border)] mx-0.5">/</span>
                                                        <span className="font-bold text-[var(--text-primary)]">{s.reps}</span>
                                                        <span className="text-[10px] text-[var(--text-secondary)]">reps</span>
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