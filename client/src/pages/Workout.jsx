import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Check, Save, Trophy, History, X, ChevronLeft, ChevronRight,
    Target, ArrowRight, TrendingUp, Sparkles, Dumbbell
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

// Parsea el rango de reps objetivo ("8-12", "5", "AMRAP") -> { lo, hi }
function parseRepRange(targetReps) {
    const nums = String(targetReps || '').match(/\d+/g);
    if (!nums) return { lo: 8, hi: 12 };
    const a = parseInt(nums[0], 10);
    const b = nums[1] ? parseInt(nums[1], 10) : a;
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

// Devuelve los valores efectivos de una serie (en unilateral usa el lado débil,
// que es el que limita la progresión)
function effectiveSet(set) {
    const w = Number(set.weight) || 0;
    const r = Number(set.reps) || 0;
    const hasRight = set.weightRight != null || set.repsRight != null;
    const wR = set.weightRight != null ? Number(set.weightRight) : w;
    const rR = set.repsRight != null ? Number(set.repsRight) : r;
    const rir = set.rpe != null ? (10 - set.rpe) : (set.rir != null ? set.rir : null);
    return {
        weight: hasRight ? Math.min(w, wR) : w,
        reps: hasRight ? Math.min(r, rR) : r,
        rir
    };
}

// 1RM estimado (Epley) sobre la serie efectiva
function estimate1RM(set) {
    const e = effectiveSet(set);
    return e.weight * (1 + e.reps / 30);
}

// Redondea el peso a una rejilla sensata. Si el peso base ya cae en la rejilla del
// incremento (barras/discos), se mantiene esa rejilla; si no (poleas/placas con
// valores raros como 6.8kg), se redondea al medio kilo para no distorsionar el peso real.
function roundWeight(w, increment, base) {
    const grid = (Math.abs(base % increment) < 0.01) ? increment : 0.5;
    return Math.round(w / grid) * grid;
}

/**
 * Sugerencia de peso y reps por DOBLE PROGRESIÓN.
 * Toma como referencia la SERIE DE TRABAJO MÁS FUERTE de la última sesión (mayor
 * 1RM estimado), no el peso máximo absoluto: así un single de tope o una serie de
 * calentamiento no sesgan la sugerencia. A ese peso usa las MEJORES reps logradas
 * (no penaliza la caída de reps por fatiga entre series).
 * - Si alcanzaste el tope del rango -> sube peso y reinicia reps abajo del rango.
 * - Si aún no -> mantén el peso y suma reps (1, o 2 si te sobró fuerza con RIR≥3).
 * Nunca sugiere bajar el peso de trabajo.
 */
function computeSuggestion(sessions, targetReps, increment) {
    if (!sessions || sessions.length === 0) return null;
    const { lo, hi } = parseRepRange(targetReps);

    const working = (sessions[0].sets || [])
        .map(effectiveSet)
        .filter(s => s.weight > 0 && s.reps > 0);
    if (working.length === 0) return null;

    // 1RM Epley de una serie ya "efectiva" (lado débil en unilateral)
    const rm = (s) => s.weight * (1 + s.reps / 30);

    // Serie de referencia = la de mayor 1RM estimado (la serie de trabajo real)
    const ref = working.reduce((best, s) => (rm(s) > rm(best) ? s : best), working[0]);

    // A ese mismo peso, las MEJORES reps logradas (8 y 7 -> contamos 8)
    const sameWeight = working.filter(s => Math.abs(s.weight - ref.weight) < 0.01);
    const refReps = Math.max(...sameWeight.map(s => s.reps));
    const knownRir = sameWeight.map(s => s.rir).filter(v => v != null);
    const rir = knownRir.length ? Math.min(...knownRir) : null;

    let weight, reps, rationale;

    if (refReps >= hi) {
        // Tope del rango alcanzado -> progresión de carga, reinicio de reps
        weight = roundWeight(ref.weight + increment, increment, ref.weight);
        reps = lo;
        rationale = `Alcanzaste ${refReps} reps con ${ref.weight}kg (tope del rango): sube a ${weight}kg y reinicia en ${lo}.`;
    } else {
        // Dentro/por debajo del rango -> mantén carga y suma reps (doble progresión)
        const bump = (rir != null && rir >= 3) ? 2 : 1; // si sobró mucha fuerza, +2
        weight = ref.weight;
        reps = Math.min(hi, refReps + bump);
        rationale = rir != null
            ? `Hiciste ${ref.weight}kg × ${refReps} (RIR ${rir}): mantén el peso y apunta a ${reps} reps.`
            : `Hiciste ${ref.weight}kg × ${refReps}: mantén el peso y apunta a ${reps} reps.`;
    }

    if (weight <= 0 || reps <= 0) return null;
    return { weight, reps, rationale, basedOn: sessions.length };
}

// Hook para gestión de historial de ejercicio (mejor marca previa + sugerencia calculada)
function useExerciseHistory(exerciseId, targetReps, muscleGroup) {
    const [previousBest, setPreviousBest] = useState(null);
    const [suggestion, setSuggestion] = useState(null);
    const [loading, setLoading] = useState(false);
    const currentRequestRef = useRef(null);

    useEffect(() => {
        setPreviousBest(null);
        setSuggestion(null);
        if (!exerciseId) return;

        const requestId = exerciseId;
        currentRequestRef.current = requestId;
        setLoading(true);

        (async () => {
            try {
                const history = await api.getExerciseHistory(exerciseId);
                if (currentRequestRef.current !== requestId) return;

                const sessions = (history || []).filter(s => s.sets && s.sets.length > 0);
                if (sessions.length === 0) {
                    setPreviousBest(null);
                    setSuggestion(null);
                    return;
                }

                // Mejor serie histórica por 1RM estimado (lado débil en unilateral)
                const allSets = sessions.flatMap(s => s.sets);
                const best = allSets.reduce(
                    (b, s) => (estimate1RM(s) > estimate1RM(b) ? s : b),
                    allSets[0]
                );
                setPreviousBest(best);

                const increment = muscleGroup === 'Piernas' ? 5 : 2.5;
                setSuggestion(computeSuggestion(sessions, targetReps, increment));
            } catch {
                if (currentRequestRef.current === requestId) {
                    setPreviousBest(null);
                    setSuggestion(null);
                }
            } finally {
                if (currentRequestRef.current === requestId) setLoading(false);
            }
        })();
    }, [exerciseId, targetReps, muscleGroup]);

    return { previousBest, suggestion, loading };
}

// Hook para el temporizador visual de descanso (respaldo cliente de la notificación
// push de scheduleRestReminder, que no es fiable en iOS Safari/PWA). Cuenta hacia
// atrás desde `seconds` y se puede reiniciar llamando a start() de nuevo.
function useRestTimer() {
    const [secondsLeft, setSecondsLeft] = useState(null); // null = sin temporizador activo
    const [isDone, setIsDone] = useState(false);
    const intervalRef = useRef(null);

    const clear = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const start = useCallback((seconds) => {
        clear();
        if (!seconds || seconds <= 0) return;
        setIsDone(false);
        setSecondsLeft(seconds);
        intervalRef.current = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev === null || prev <= 1) {
                    clear();
                    setIsDone(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [clear]);

    const stop = useCallback(() => {
        clear();
        setSecondsLeft(null);
        setIsDone(false);
    }, [clear]);

    // Limpieza al desmontar
    useEffect(() => clear, [clear]);

    return { secondsLeft, isDone, start, stop };
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
const SetCard = memo(({ set, index, onUpdate, onToggle, onSetRIR, isLocked, previousBest, isUnilateral }) => {
    const handleFocus = (e) => e.target.select();

    const isPR = useMemo(() => {
        if (!previousBest || isLocked || !set.completed) return false;
        const w = Number(set.weight) || 0;
        const r = Number(set.reps) || 0;
        const effW = isUnilateral ? Math.min(w, Number(set.weightR) || w) : w;
        const effR = isUnilateral ? Math.min(r, Number(set.repsR) || r) : r;
        const currentScore = effW * (1 + effR / 30);
        return currentScore > estimate1RM(previousBest);
    }, [set, previousBest, isLocked, isUnilateral]);

    return (
        <div className={`group relative rounded-2xl p-3 transition-all duration-300 ${set.completed
            ? 'bg-[var(--success)]/10 ring-1 ring-[var(--success)]/50'
            : 'bg-[var(--bg-card)] border border-[var(--border)]'
            }`}>
            {/* Etiqueta vertical */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-1 z-10">
                <span className={`text-[10px] font-bold uppercase rotate-180 py-1 [writing-mode:vertical-rl] tracking-wider ${set.completed ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'
                    }`}>Set {index + 1}</span>
            </div>

            <div className="grid grid-cols-10 gap-3 items-center">
                <div className="col-span-8 space-y-2">
                    {!isUnilateral ? (
                        /* Bilateral: standard weight + reps row */
                        <div className="grid grid-cols-2 gap-3">
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
                        </div>
                    ) : (
                        /* Unilateral: separate L/R rows for weight + reps */
                        <div className="space-y-2">
                            {/* Left side */}
                            <div className="grid grid-cols-2 gap-3">
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
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 pointer-events-none font-bold">IZQ</span>
                                </div>
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
                            </div>
                            {/* Right side */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={set.weightR || ''}
                                        onFocus={handleFocus}
                                        onChange={(e) => onUpdate(index, 'weightR', e.target.value)}
                                        placeholder="0"
                                        readOnly={isLocked}
                                        className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.weightR ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                            } ${isLocked ? 'opacity-60' : 'focus:ring-orange-500/50 focus:bg-[var(--bg-dark)]'}`}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">KG</span>
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 pointer-events-none font-bold">DER</span>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={set.repsR || ''}
                                        onFocus={handleFocus}
                                        onChange={(e) => onUpdate(index, 'repsR', e.target.value)}
                                        placeholder="0"
                                        readOnly={isLocked}
                                        className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.repsR ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                            } ${isLocked ? 'opacity-60' : 'focus:ring-orange-500/50 focus:bg-[var(--bg-dark)]'}`}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">REP</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RIR Selector */}
                    <div className="flex items-center bg-[var(--bg-dark)]/50 rounded-lg p-1 h-9">
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

                {/* Check Button */}
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
    return prevProps.set.weight === nextProps.set.weight &&
        prevProps.set.reps === nextProps.set.reps &&
        prevProps.set.weightR === nextProps.set.weightR &&
        prevProps.set.repsR === nextProps.set.repsR &&
        prevProps.set.completed === nextProps.set.completed &&
        prevProps.set.rir === nextProps.set.rir &&
        prevProps.index === nextProps.index &&
        prevProps.isLocked === nextProps.isLocked &&
        prevProps.isUnilateral === nextProps.isUnilateral &&
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
    const [isUnilateral, setIsUnilateral] = useState(false);
    const [completedAt, setCompletedAt] = useState(null);
    const currentExerciseIdRef = useRef(null);

    // Custom hooks
    const { workoutData, setWorkoutData, completedExerciseIds, setCompletedExerciseIds, saveToStorage, clearStorage } = useWorkoutPersistence(dayId);
    const restTimer = useRestTimer();

    const currentExercise = workoutState.exercises[workoutState.currentIndex];
    const { previousBest, suggestion } = useExerciseHistory(currentExercise?.id, currentExercise?.targetReps, currentExercise?.muscleGroup);

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
        // Reemplaza (no solo agrega) el estado de estos ejercicios: si alguno estaba
        // marcado completado por una sesión vieja (p.ej. una prueba borrada después),
        // esta pasada con datos frescos del servidor corrige el localStorage stale
        // en vez de arrastrarlo hasta que expire (24h).
        const checkedIds = new Set(exerciseList.map(ex => ex.id));
        const completed = results.filter(Boolean);
        setCompletedExerciseIds(prev => [...new Set([...prev.filter(id => !checkedIds.has(id)), ...completed])]);
    }

    async function loadExerciseData(exercise, index) {
        currentExerciseIdRef.current = exercise.id;
        // Auto-detect unilateral from exercise DB field
        setIsUnilateral(exercise.isUnilateral || false);
        setCompletedAt(null);
        // El descanso NO se cancela al cambiar de ejercicio: guardar una serie avanza
        // automáticamente al siguiente ejercicio ~300ms después (más abajo), y sigues
        // descansando mientras ves esa pantalla — cancelar aquí mataba el timer casi
        // apenas aparecía. Solo se detiene al terminar, al tocar la X, o al salir del
        // entreno (cleanup del hook).
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
                        weightR: s.weightRight?.toString() || '',
                        repsR: s.repsRight?.toString() || '',
                        rir: s.rpe ? (10 - s.rpe) : null,
                        completed: true
                    }));
                    setSets(apiSets);
                    setCompletedAt(new Date(history[0].date));
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
            // Crear nuevo objeto para forzar re-render
            const newSet = { ...updated[index], [field]: value };
            
            // Auto-complete: marcar como completado si tiene peso Y reps
            const hasWeight = field === 'weight' ? value !== '' : newSet.weight !== '';
            const hasReps = field === 'reps' ? value !== '' : newSet.reps !== '';
            newSet.completed = hasWeight && hasReps;
            
            updated[index] = newSet;
            return updated;
        });
    }, [isAlreadyLogged]);

    const toggleComplete = useCallback((index) => {
        if (isAlreadyLogged) return;
        setSets(prev => {
            const updated = [...prev];
            // CREAR NUEVO OBJETO (no mutar) para forzar re-render
            updated[index] = { 
                ...updated[index], 
                completed: !updated[index].completed 
            };
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

    const applySuggestion = useCallback(() => {
        if (isAlreadyLogged || !suggestion) return;
        const w = suggestion.weight.toString();
        const r = suggestion.reps.toString();
        setSets(prev => {
            // Rellena solo la primera serie vacía (sin peso Y sin reps) para no
            // pisar series que el usuario ya completó a mano. Si no hay ninguna
            // vacía, no hace nada.
            const idx = prev.findIndex(s => !s.weight && !s.reps);
            if (idx === -1) return prev;
            const updated = [...prev];
            const next = { ...updated[idx], weight: w, reps: r };
            // En unilateral rellenamos también el lado derecho (la sugerencia parte del lado débil)
            if (isUnilateral) { next.weightR = w; next.repsR = r; }
            next.completed = true;
            updated[idx] = next;
            return updated;
        });
        toast.success('Sugerencia aplicada');
    }, [isAlreadyLogged, suggestion, isUnilateral, toast]);

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
            .map(s => {
                const setData = {
                    weight: parseFloat(s.weight),
                    reps: parseInt(s.reps),
                    rpe: s.rir !== null ? (10 - s.rir) : null
                };
                if (isUnilateral) {
                    setData.weightRight = s.weightR ? parseFloat(s.weightR) : parseFloat(s.weight);
                    setData.repsRight = s.repsR ? parseInt(s.repsR) : parseInt(s.reps);
                }
                return setData;
            });

        if (validSets.length === 0) {
            toast.error('Registra al menos 1 serie');
            return;
        }

        setUIState(prev => ({ ...prev, saving: true }));

        try {
            const { workoutLog } = await api.logWorkout(currentExercise.id, validSets);
            setCompletedExerciseIds(prev => [...prev, currentExercise.id]);
            setCompletedAt(workoutLog?.date ? new Date(workoutLog.date) : new Date());
            setWorkoutData(prev => {
                const updated = { ...prev };
                delete updated[currentExercise.id];
                return updated;
            });

            toast.success('¡Guardado!');
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
            restTimer.start(currentExercise.restSeconds || 90);

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

            {/* Temporizador de descanso - respaldo visual de la notificación push (poco fiable en iOS PWA) */}
            {restTimer.secondsLeft !== null && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-slide-down">
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl border backdrop-blur-sm transition-colors ${restTimer.isDone
                        ? 'bg-[var(--success)]/90 border-[var(--success)] text-white'
                        : 'bg-[var(--bg-card)]/95 border-[var(--primary)]/40 text-[var(--text-primary)]'
                        }`}>
                        {restTimer.isDone ? (
                            <>
                                <Check size={16} strokeWidth={3} />
                                <span className="font-bold text-sm">¡Listo para la siguiente serie!</span>
                            </>
                        ) : (
                            <>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Descansa</span>
                                <span className="font-black text-lg tabular-nums leading-none">
                                    {Math.floor(restTimer.secondsLeft / 60)}:{String(restTimer.secondsLeft % 60).padStart(2, '0')}
                                </span>
                            </>
                        )}
                        <button
                            onClick={restTimer.stop}
                            className="ml-1 p-1 -mr-1 rounded-full hover:bg-white/10 transition-colors active:scale-90"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

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

                <div className="flex items-center justify-center gap-3">
                    <div className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] bg-[var(--bg-card)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
                        <Target size={14} />
                        <span>Meta: <span className="font-bold text-[var(--text-primary)]">{currentExercise?.targetSets} × {currentExercise?.targetReps}</span></span>
                    </div>
                    <button
                        onClick={() => setIsUnilateral(!isUnilateral)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isUnilateral
                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)]'
                        }`}
                    >
                        {isUnilateral ? 'Unilateral' : 'Bilateral'}
                    </button>
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
                            <p className="text-[var(--success)]/80 text-xs">Guardado hoy a las {(completedAt || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                    </div>
                ) : (previousBest || suggestion) && (
                    <>
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-1 shadow-sm flex divide-x divide-[var(--border)]">
                        {previousBest && (
                            <div className="flex-1 p-3 flex flex-col items-center">
                                <span className="text-[10px] uppercase text-[var(--text-secondary)] font-bold mb-1">Mejor Anterior</span>
                                {(previousBest.repsRight != null || previousBest.weightRight != null) ? (
                                    <div className="flex flex-col items-center text-[var(--text-primary)] leading-tight tabular-nums">
                                        <span className="text-sm font-bold">
                                            <span className="text-orange-400 text-[10px] mr-1">IZQ</span>{previousBest.weight}kg × {previousBest.reps}
                                        </span>
                                        <span className="text-sm font-bold">
                                            <span className="text-orange-400 text-[10px] mr-1">DER</span>{previousBest.weightRight ?? previousBest.weight}kg × {previousBest.repsRight ?? previousBest.reps}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-end gap-1 text-[var(--text-primary)]">
                                        <span className="text-lg font-bold tabular-nums">{previousBest.weight}</span>
                                        <span className="text-xs mb-1 text-[var(--text-secondary)]">kg</span>
                                        <span className="mx-1 text-[var(--border)]">/</span>
                                        <span className="text-lg font-bold tabular-nums">{previousBest.reps}</span>
                                        <span className="text-xs mb-1 text-[var(--text-secondary)]">reps</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {suggestion && (
                            <button
                                onClick={applySuggestion}
                                className="flex-1 p-3 flex flex-col items-center hover:bg-[var(--bg-dark)] transition-colors active:scale-95 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-[var(--success)]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[10px] uppercase text-[var(--success)] font-bold mb-1 flex items-center gap-1">
                                    Sugerido <Sparkles size={10} />
                                </span>
                                <div className="flex items-end gap-1 text-[var(--success)] group-hover:scale-105 transition-transform">
                                    <span className="text-2xl font-black tracking-tight leading-none">{suggestion.weight}</span>
                                    <span className="text-xs mb-0.5 font-bold">kg</span>
                                    <span className="mx-1 text-[var(--border)]">/</span>
                                    <span className="text-lg font-bold">{suggestion.reps}</span>
                                    <span className="text-xs mb-0.5">reps</span>
                                </div>
                            </button>
                        )}
                    </div>

                    {/* Explicación del cálculo - colapsable */}
                    {suggestion?.rationale && (
                        <details className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-card)] rounded-lg border border-[var(--border)]">
                            <summary className="p-2 cursor-pointer flex items-center gap-1 select-none">
                                <TrendingUp size={10} className="text-[var(--success)]" />
                                <span className="font-bold text-[var(--success)]">Por qué esta sugerencia</span>
                            </summary>
                            <p className="px-2 pb-2">{suggestion.rationale}</p>
                        </details>
                    )}
                    </>
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
                        isUnilateral={isUnilateral}
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
                                                {log.sets.map((s, j) => {
                                                    const hasRight = s.repsRight != null || s.weightRight != null;
                                                    const rir = s.rpe != null ? (10 - s.rpe) : null;
                                                    return (
                                                        <div key={j} className="bg-[var(--bg-card)] px-3 py-1.5 rounded-lg border border-[var(--border)] flex items-baseline gap-1 shadow-sm">
                                                            {hasRight ? (
                                                                <span className="font-bold text-[var(--text-primary)] text-sm">
                                                                    <span className="text-orange-400 text-[10px]">I </span>{s.weight}×{s.reps}
                                                                    <span className="text-[var(--border)] mx-1">·</span>
                                                                    <span className="text-orange-400 text-[10px]">D </span>{s.weightRight ?? s.weight}×{s.repsRight ?? s.reps}
                                                                </span>
                                                            ) : (
                                                                <>
                                                                    <span className="font-bold text-[var(--text-primary)]">{s.weight}</span>
                                                                    <span className="text-[10px] text-[var(--text-secondary)]">kg</span>
                                                                    <span className="text-[var(--border)] mx-0.5">/</span>
                                                                    <span className="font-bold text-[var(--text-primary)]">{s.reps}</span>
                                                                    <span className="text-[10px] text-[var(--text-secondary)]">reps</span>
                                                                </>
                                                            )}
                                                            {rir != null && (
                                                                <span className="text-[9px] text-[var(--primary)] ml-1 font-bold">RIR{rir}</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
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