import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Check, Save, Trophy, History, X, ChevronLeft, ChevronRight,
    Target, ArrowRight, TrendingUp, Sparkles, Dumbbell, AlertTriangle, Percent, Pencil, FileDown, Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';
import {
    computeWorkoutSuggestion,
    effectiveWorkoutSet,
    resolveWeightIncrement,
    roundWorkoutWeight
} from '../utils/smartLoading';
import { hasPendingWrite, subscribeQueueChange } from '../services/offlineQueue';
import { canonicalExerciseKey } from '../utils/exerciseName';
import { getCurrentGoalTarget } from '../utils/goalPlanner';
import { mexicoCityDateStr } from '../utils/dates';
import { downloadSessionPdf } from '../utils/sessionPdf';
import { useAuth } from '../context/AuthContext';

// Fila vacía de serie — siempre incluye L/R para no romper el toggle a unilateral
// a mitad de ejercicio ni las sesiones parciales del Atajo.
function makeEmptySet() {
    return { weight: '', reps: '', weightR: '', repsR: '', rir: null, completed: false };
}

// ==================== CUSTOM HOOKS ====================

// Hook para manejo de persistencia en localStorage
function useWorkoutPersistence(dayId) {
    const [workoutData, setWorkoutData] = useState({});
    const [completedExerciseIds, setCompletedExerciseIds] = useState([]);
    const [skippedExerciseIds, setSkippedExerciseIds] = useState([]);

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
                setSkippedExerciseIds(parsed.skippedExerciseIds || []);
            } catch (error) {
                console.error('Error parsing saved workout:', error);
            }
        }
    }, [dayId]);

    const saveToStorage = useCallback((data, completed, skipped = []) => {
        localStorage.setItem(`workout_${dayId}`, JSON.stringify({
            workoutData: data,
            completedExerciseIds: completed,
            skippedExerciseIds: skipped,
            timestamp: Date.now()
        }));
    }, [dayId]);

    const clearStorage = useCallback(() => {
        localStorage.removeItem(`workout_${dayId}`);
    }, [dayId]);

    return {
        workoutData, setWorkoutData,
        completedExerciseIds, setCompletedExerciseIds,
        skippedExerciseIds, setSkippedExerciseIds,
        saveToStorage, clearStorage
    };
}

// Alias locales: effectiveSet/roundWeight se usan en varios sitios del archivo
// (SetCard, goalSessions, calentamiento). La lógica canónica vive en smartLoading.js.
const effectiveSet = effectiveWorkoutSet;
const roundWeight = roundWorkoutWeight;

// 1RM estimado (Epley) sobre la serie efectiva
function estimate1RM(set) {
    const e = effectiveSet(set);
    return e.weight * (1 + e.reps / 30);
}

// Deriva mejor anterior + sugerencia + sesiones de goal a partir de un array de
// historial ya cargado (DESC). Extraída para reusar el caché de fetchDay sin un
// GET /history extra por cada cambio de ejercicio.
function deriveHistoryDerived(history, targetReps, muscleGroup, phase, exerciseName) {
    const sessions = (history || []).filter(s => Array.isArray(s?.sets) && s.sets.length > 0);
    if (sessions.length === 0) {
        return { previousBest: null, suggestion: null, goalSessions: [], lastSession: null };
    }

    const allSets = sessions.flatMap(s => s.sets).filter(Boolean);
    if (allSets.length === 0) {
        return { previousBest: null, suggestion: null, goalSessions: [], lastSession: null };
    }
    const previousBest = allSets.reduce(
        (b, s) => (estimate1RM(s) > estimate1RM(b) ? s : b),
        allSets[0]
    );

    // Comparativa = sesión ANTERIOR a hoy (DESC). Si sessions[0] es de hoy
    // (recién guardado o reabierto), usamos la siguiente — si no, se "compara"
    // consigo misma y el delta siempre sale 0 / vacío.
    const todayKey = mexicoCityDateStr();
    const prior = sessions.find(s => mexicoCityDateStr(new Date(s.date)) !== todayKey) || null;
    const lastSession = prior
        ? {
            date: prior.date,
            sets: [...(prior.sets || [])].sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0))
        }
        : null;

    const increment = resolveWeightIncrement(muscleGroup, exerciseName);
    const raw = computeWorkoutSuggestion(sessions, targetReps, increment, phase);
    const suggestion = (raw && phase === 'deload')
        ? { ...raw, weight: roundWeight(raw.weight * 0.9, increment, raw.weight) }
        : raw;

    // goalPlanner espera ASC (regresión lineal: más viejo primero)
    const goalSessions = sessions.slice().reverse().map(s => {
        const validSets = s.sets.map(effectiveSet).filter(x => x.weight > 0 && x.reps > 0);
        const bestSet = validSets.reduce(
            (b, x) => (estimate1RM(x) > estimate1RM(b) ? x : b),
            validSets[0]
        );
        return {
            date: s.date,
            best1RM: validSets.length ? estimate1RM(bestSet) : 0,
            weight: bestSet?.weight,
            reps: bestSet?.reps,
            sets: validSets
        };
    });

    return { previousBest, suggestion, goalSessions, lastSession };
}

// Hook para gestión de historial de ejercicio (mejor marca previa + sugerencia).
// `preloadedHistory`: si el padre ya trajo el historial en batch (fetchDay), se
// usa directo y se evita un round-trip. Si es undefined, hace fetch propio
// (p.ej. tras invalidar el caché al guardar).
function useExerciseHistory(exerciseId, targetReps, muscleGroup, phase, exerciseName, preloadedHistory) {
    const [previousBest, setPreviousBest] = useState(null);
    const [suggestion, setSuggestion] = useState(null);
    const [loading, setLoading] = useState(false);
    const [goalSessions, setGoalSessions] = useState([]);
    const [lastSession, setLastSession] = useState(null);
    const currentRequestRef = useRef(null);

    useEffect(() => {
        setPreviousBest(null);
        setSuggestion(null);
        setGoalSessions([]);
        setLastSession(null);
        if (!exerciseId) return;

        const requestId = exerciseId;
        currentRequestRef.current = requestId;

        function apply(history) {
            if (currentRequestRef.current !== requestId) return;
            const derived = deriveHistoryDerived(history, targetReps, muscleGroup, phase, exerciseName);
            setPreviousBest(derived.previousBest);
            setSuggestion(derived.suggestion);
            setGoalSessions(derived.goalSessions);
            setLastSession(derived.lastSession);
            setLoading(false);
        }

        // Caché del día disponible (incluso array vacío = "sin historial, no refetch")
        if (preloadedHistory !== undefined) {
            setLoading(false);
            apply(preloadedHistory);
            return;
        }

        setLoading(true);
        (async () => {
            try {
                const history = await api.getExerciseHistory(exerciseId);
                apply(history);
            } catch {
                if (currentRequestRef.current === requestId) {
                    setPreviousBest(null);
                    setSuggestion(null);
                    setGoalSessions([]);
                    setLastSession(null);
                    setLoading(false);
                }
            }
        })();
    }, [exerciseId, targetReps, muscleGroup, phase, exerciseName, preloadedHistory]);

    return { previousBest, suggestion, loading, goalSessions, lastSession };
}

function sessionVolumeFromSets(sets) {
    let v = 0;
    for (const s of sets || []) {
        // Acepta strings del form y números del API
        const w = parseFloat(s.weight);
        const r = parseFloat(s.reps);
        if (Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0) {
            v += w * r;
        }
        const wR = s.weightRight != null ? parseFloat(s.weightRight)
            : (s.weightR != null && s.weightR !== '' ? parseFloat(s.weightR) : NaN);
        const rR = s.repsRight != null ? parseFloat(s.repsRight)
            : (s.repsR != null && s.repsR !== '' ? parseFloat(s.repsR) : NaN);
        if (Number.isFinite(wR) && Number.isFinite(rR) && wR > 0 && rR > 0) {
            v += wR * rR;
        }
    }
    return v;
}

/** Log de HOY (CDMX) en un historial DESC, si existe. */
function findTodayLog(history) {
    if (!history?.length) return null;
    const today = mexicoCityDateStr();
    return history.find(h => mexicoCityDateStr(new Date(h.date)) === today) || null;
}

function setDeltaLabel(current, last) {
    if (!last || current == null || current === '') return null;
    const cw = Number(current.weight);
    const cr = Number(current.reps);
    const lw = Number(last.weight);
    const lr = Number(last.reps);
    if (!Number.isFinite(cw) || !Number.isFinite(cr) || !Number.isFinite(lw) || !Number.isFinite(lr)) return null;
    if (lw <= 0 || lr <= 0) return null;
    const dW = Math.round((cw - lw) * 10) / 10;
    const dR = cr - lr;
    if (dW === 0 && dR === 0) return { text: '= última', tone: 'neutral' };
    const parts = [];
    if (dW !== 0) parts.push(`${dW > 0 ? '+' : ''}${dW} kg`);
    if (dR !== 0) parts.push(`${dR > 0 ? '+' : ''}${dR} reps`);
    const better = dW > 0 || (dW === 0 && dR > 0);
    const worse = dW < 0 || (dW === 0 && dR < 0);
    return {
        text: parts.join(' · '),
        tone: better ? 'up' : worse ? 'down' : 'neutral'
    };
}

// Objetivo activo (no alcanzado) para el ejercicio actual, si existe — reusa la
// misma lógica de predicción que GoalCard.jsx (client/src/utils/goalPlanner.js),
// sin fusionarse con computeSuggestion/Smart Loading (algoritmos deliberadamente
// separados, ver CLAUDE.md).
function useGoalChip(exerciseName, goals, goalSessions) {
    return useMemo(() => {
        if (!exerciseName || !goals || goals.length === 0) return null;
        const key = canonicalExerciseKey(exerciseName);
        const goal = goals.find(g => !g.achievedAt && canonicalExerciseKey(g.exerciseName) === key);
        if (!goal) return null;
        return getCurrentGoalTarget(goal, { sessions: goalSessions || [] });
    }, [exerciseName, goals, goalSessions]);
}

// Hook para el temporizador visual de descanso (respaldo cliente de la notificación
// push de scheduleRestReminder, que no es fiable en iOS Safari/PWA). Cuenta hacia
// atrás desde `seconds` y se puede reiniciar llamando a start() de nuevo.
function useRestTimer() {
    const [secondsLeft, setSecondsLeft] = useState(null); // null = sin temporizador activo
    const [isDone, setIsDone] = useState(false);
    const intervalRef = useRef(null);
    // Timestamp absoluto de fin, no un contador de ticks: los navegadores
    // móviles pausan/limitan setInterval en segundo plano, así que un contador
    // que solo resta 1 por tick se queda "congelado" en vez de reflejar el
    // tiempo real transcurrido al volver. Con un endTime fijo, recalculamos
    // contra Date.now() en cada tick y también al recuperar foco/visibilidad.
    const endTimeRef = useRef(null);

    const clear = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const recompute = useCallback(() => {
        if (endTimeRef.current === null) return;
        const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
        if (remaining <= 0) {
            const wasRunning = endTimeRef.current !== null;
            clear();
            endTimeRef.current = null;
            setSecondsLeft(0);
            setIsDone(true);
            // Vibrar solo al cruzar a "listo" (no en cada recompute ya terminado)
            if (wasRunning && navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]);
        } else {
            setSecondsLeft(remaining);
        }
    }, [clear]);

    const start = useCallback((seconds) => {
        clear();
        if (!seconds || seconds <= 0) return;
        setIsDone(false);
        endTimeRef.current = Date.now() + seconds * 1000;
        setSecondsLeft(seconds);
        intervalRef.current = setInterval(recompute, 1000);
    }, [clear, recompute]);

    const stop = useCallback(() => {
        clear();
        endTimeRef.current = null;
        setSecondsLeft(null);
        setIsDone(false);
    }, [clear]);

    // Al volver de segundo plano (app minimizada, pantalla bloqueada, cambio de
    // pestaña), recalcula de inmediato en vez de esperar al siguiente tick del
    // interval — que pudo no haber corrido en absoluto mientras no era visible.
    useEffect(() => {
        function handleResume() {
            if (document.visibilityState === 'visible') recompute();
        }
        document.addEventListener('visibilitychange', handleResume);
        window.addEventListener('focus', recompute);
        window.addEventListener('pageshow', recompute); // iOS Safari bfcache
        return () => {
            document.removeEventListener('visibilitychange', handleResume);
            window.removeEventListener('focus', recompute);
            window.removeEventListener('pageshow', recompute);
        };
    }, [recompute]);

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
const SetCard = memo(({ set, index, onUpdate, onToggle, onSetRIR, isLocked, previousBest, isUnilateral, lastSet }) => {
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

    const vsLast = useMemo(
        () => setDeltaLabel(
            { weight: set.weight, reps: set.reps },
            lastSet ? { weight: lastSet.weight, reps: lastSet.reps } : null
        ),
        [set.weight, set.reps, lastSet]
    );

    return (
        <div className={`group relative rounded-2xl p-3 transition-all duration-300 ${set.completed
            ? 'bg-[var(--success)]/10 ring-1 ring-[var(--success)]/50'
            : 'bg-[var(--bg-card)] border border-[var(--border)]'
            }`}>
            <div className="grid grid-cols-10 gap-3 items-center">
                {/* Número de serie horizontal — más legible en móvil que el label vertical */}
                <div className="col-span-1 flex flex-col items-start pt-3 gap-1">
                    <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black tabular-nums ${set.completed
                            ? 'bg-[var(--success)] text-white'
                            : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'
                            }`}
                        aria-hidden
                    >
                        {index + 1}
                    </span>
                </div>
                <div className="col-span-7 space-y-2">
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
                                    aria-label={`Serie ${index + 1} peso`}
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
                                    aria-label={`Serie ${index + 1} reps`}
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
                                    type="button"
                                    onClick={() => onSetRIR(index, set.rir === rir ? null : rir)}
                                    disabled={isLocked}
                                    aria-label={`RIR ${rir}`}
                                    aria-pressed={set.rir === rir}
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

                {/* Check Button — única forma de marcar la serie completa (dispara descanso) */}
                <div className="col-span-2 flex justify-end">
                    <button
                        onClick={() => onToggle(index)}
                        disabled={isLocked}
                        aria-label={set.completed ? `Serie ${index + 1} completada` : `Marcar serie ${index + 1} completada`}
                        aria-pressed={set.completed}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${set.completed
                            ? 'bg-[var(--success)] text-white shadow-lg shadow-[var(--success)]/30 scale-105'
                            : 'bg-[var(--bg-dark)] border-2 border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                            }`}
                    >
                        <Check size={24} strokeWidth={set.completed ? 3 : 2} />
                    </button>
                </div>
            </div>

            {/* Comparativa vs misma serie de la última sesión */}
            {(lastSet || vsLast) && (
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] px-1">
                    {lastSet ? (
                        <span className="text-[var(--text-secondary)] tabular-nums">
                            Última: <span className="font-semibold text-[var(--text-primary)]/80">{lastSet.weight} kg × {lastSet.reps}</span>
                        </span>
                    ) : <span />}
                    {vsLast && (
                        <span className={`font-bold tabular-nums ${
                            vsLast.tone === 'up' ? 'text-[var(--success)]'
                            : vsLast.tone === 'down' ? 'text-orange-400'
                            : 'text-[var(--text-secondary)]'
                        }`}>
                            {vsLast.text}
                        </span>
                    )}
                </div>
            )}

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
        prevProps.previousBest === nextProps.previousBest &&
        prevProps.lastSet === nextProps.lastSet;
});

// Aviso por fase del bloque activo (nunca silencioso). Compacto por defecto
// (<details>) para no empujar las series fuera de la primera pantalla en móvil.
// Clases Tailwind literales completas — el compilador no genera las interpoladas.
const PHASE_BANNER = {
    deload: {
        title: 'Descarga',
        desc: 'Sugerencias reducidas ~10% para facilitar la recuperación',
        Icon: AlertTriangle,
        wrapperClass: 'bg-[var(--warning)]/10 border-[var(--warning)]/20',
        titleClass: 'text-[var(--warning)]',
        descClass: 'text-[var(--warning)]/80'
    },
    intensification: {
        title: 'Intensificación',
        desc: 'Menos reps, más peso en la sugerencia — buscando fuerza real',
        Icon: TrendingUp,
        wrapperClass: 'bg-[var(--primary)]/10 border-[var(--primary)]/20',
        titleClass: 'text-[var(--primary)]',
        descClass: 'text-[var(--primary)]/80'
    },
    accumulation: {
        title: 'Acumulación',
        desc: 'Más reps por serie en la sugerencia — construyendo volumen',
        Icon: Dumbbell,
        wrapperClass: 'bg-[var(--primary)]/10 border-[var(--primary)]/20',
        titleClass: 'text-[var(--primary)]',
        descClass: 'text-[var(--primary)]/80'
    }
};

// Guía de calentamiento — puramente informativa, no persiste nada (calienta "por tu
// cuenta" y luego registra tus series de trabajo como siempre). Parte del mismo 1RM
// estimado (Epley) que ya usa la Sugerencia/Mejor Anterior, y del mismo roundWeight
// que ya usa el resto del archivo — sin matemática nueva.
const RAMP_STEPS = [
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.8, reps: 3 }
];

function WarmupCalculator({ base1RM, increment }) {
    const [customPct, setCustomPct] = useState('75');

    if (!base1RM) return null;

    const pctNum = parseFloat(customPct);
    const customWeight = pctNum > 0
        ? roundWeight(base1RM * (pctNum / 100), increment, base1RM * (pctNum / 100))
        : null;

    return (
        <details className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-card)] rounded-2xl border border-[var(--border)]">
            <summary className="p-2 cursor-pointer flex items-center gap-1 select-none">
                <Percent size={10} className="text-[var(--primary)]" />
                <span className="font-bold text-[var(--primary)]">Calculadora de calentamiento</span>
            </summary>
            <div className="px-2 pb-3 space-y-2.5">
                <div className="flex gap-2 pt-1">
                    {RAMP_STEPS.map(({ pct, reps }) => (
                        <div key={pct} className="flex-1 flex flex-col items-center gap-0.5 bg-[var(--bg-dark)]/50 rounded-lg px-2 py-1.5">
                            <span className="text-[9px] uppercase tracking-wide">{Math.round(pct * 100)}%</span>
                            <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                                {roundWeight(base1RM * pct, increment, base1RM * pct)}kg
                            </span>
                            <span className="text-[9px]">× {reps}</span>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                    <span>Peso a</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        value={customPct}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setCustomPct(e.target.value)}
                        className="w-12 bg-[var(--bg-dark)]/50 rounded px-1 py-0.5 text-center text-[var(--text-primary)] font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/50"
                    />
                    <span>% =</span>
                    <span className="font-bold text-[var(--text-primary)] tabular-nums">
                        {customWeight != null ? `${customWeight}kg` : '—'}
                    </span>
                </div>
            </div>
        </details>
    );
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function Workout() {
    const { dayId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();

    // Estados
    const [workoutState, setWorkoutState] = useState({
        exercises: [],
        currentIndex: 0,
        dayName: '',
        phase: null, // fase del bloque activo de la rutina: 'accumulation'|'intensification'|'deload'|'custom'|null
        loading: true
    });

    const [uiState, setUIState] = useState({
        saving: false,
        showHistory: false,
        showSuccess: false,
        history: []
    });
    // Resumen del día al terminar / salir (punto 1 producto)
    const [sessionSummary, setSessionSummary] = useState(null);

    const [sets, setSets] = useState([]);
    const [isUnilateral, setIsUnilateral] = useState(false);
    const [completedAt, setCompletedAt] = useState(null);
    // Id del WorkoutLog de hoy — para PUT al resumir (Atajo parcial) y para el
    // enlace "Editar sesión" cuando el ejercicio ya está completo.
    const [todayLogId, setTodayLogId] = useState(null);
    const currentExerciseIdRef = useRef(null);
    // Resultados de ESTA sesión (para el resumen): { [exId]: { name, sets, volume, skipped } }
    const sessionResultsRef = useRef({});
    // Historial por ejercicio precargado en fetchDay (evita N+1 + refetch de
    // useExerciseHistory al cambiar de ejercicio). historiesLoaded=false → el
    // hook hace fetch propio; true → usa el mapa (array vacío = sin historial).
    const [historyByExerciseId, setHistoryByExerciseId] = useState({});
    const [historiesLoaded, setHistoriesLoaded] = useState(false);

    // Custom hooks
    const {
        workoutData, setWorkoutData,
        completedExerciseIds, setCompletedExerciseIds,
        skippedExerciseIds, setSkippedExerciseIds,
        saveToStorage, clearStorage
    } = useWorkoutPersistence(dayId);
    const restTimer = useRestTimer();

    const currentExercise = workoutState.exercises[workoutState.currentIndex];
    const preloadedHistory = currentExercise && historiesLoaded
        ? (historyByExerciseId[currentExercise.id] ?? [])
        : undefined;
    const { previousBest, suggestion, goalSessions, lastSession } = useExerciseHistory(
        currentExercise?.id,
        currentExercise?.targetReps,
        currentExercise?.muscleGroup,
        workoutState.phase,
        currentExercise?.name,
        preloadedHistory
    );

    // Objetivos activos del usuario — lista pequeña, independiente del ejercicio
    // actual, se carga una sola vez (no en cada cambio de ejercicio).
    const [goals, setGoals] = useState([]);
    useEffect(() => {
        api.getGoals().then(setGoals).catch(() => {});
    }, []);
    const goalTarget = useGoalChip(currentExercise?.name, goals, goalSessions);

    // P3: ¿el ejercicio actual tiene una escritura offline pendiente de
    // sincronizar? Se re-evalúa al cambiar de ejercicio y cuando la cola cambia
    // (se encola algo nuevo al guardar sin red, o el replay la vacía al volver
    // la conexión) — nunca un poll, vía suscripción de offlineQueue.js.
    const [pendingSync, setPendingSync] = useState(false);
    useEffect(() => {
        if (!currentExercise) { setPendingSync(false); return undefined; }
        setPendingSync(hasPendingWrite(currentExercise.id));
        return subscribeQueueChange(() => setPendingSync(hasPendingWrite(currentExercise.id)));
    }, [currentExercise]);

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
            saveToStorage(workoutData, completedExerciseIds, skippedExerciseIds);
        }
    }, [workoutData, completedExerciseIds, skippedExerciseIds, saveToStorage, workoutState.exercises.length]);

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
        setHistoriesLoaded(false);
        try {
            const routines = await api.getRoutines();
            let found = false;
            for (const routine of routines) {
                const day = (routine.days || []).find(d => d.id === dayId);
                if (!day) continue;
                found = true;

                const exercises = Array.isArray(day.exercises) ? day.exercises : [];

                // Batch de historiales ANTES de exponer exercises al árbol React —
                // así useExerciseHistory recibe preloadedHistory en el primer
                // render del ejercicio y no dispara un GET extra en paralelo.
                const pairs = await Promise.all(
                    exercises.map(async (ex) => {
                        try {
                            const h = await api.getExerciseHistory(ex.id);
                            return [ex.id, Array.isArray(h) ? h : []];
                        } catch {
                            return [ex.id, []];
                        }
                    })
                );
                const map = Object.fromEntries(pairs);
                setHistoryByExerciseId(map);
                setHistoriesLoaded(true);
                setWorkoutState(prev => ({
                    ...prev,
                    exercises,
                    dayName: day.dayName || '',
                    phase: routine.phase || null,
                    currentIndex: 0
                }));

                applyCompletedFromHistories(exercises, map);
                if (exercises.length > 0) {
                    loadExerciseData(exercises[0], 0, map);
                } else {
                    setSets([]);
                }
                break;
            }
            if (!found) {
                toast.error('Día de rutina no encontrado');
                // Evita re-render con exercises vacíos a medias
                setWorkoutState(prev => ({ ...prev, exercises: [], dayName: '' }));
            }
        } catch (error) {
            console.error('Error:', error);
            toast.error(error?.message || 'Error al cargar rutina');
            setWorkoutState(prev => ({ ...prev, exercises: [] }));
        } finally {
            setWorkoutState(prev => ({ ...prev, loading: false }));
        }
    }

    // Marca ejercicios completos hoy a partir del mapa de historiales (sin red).
    // "Hoy" = día calendario CDMX (mismo criterio que el server).
    function applyCompletedFromHistories(exerciseList, historyMap) {
        const today = mexicoCityDateStr();
        const completed = [];
        for (const ex of exerciseList) {
            const history = historyMap[ex.id];
            if (!history?.length) continue;
            const todayLog = findTodayLog(history);
            // No basta con "hay un log hoy": el Atajo registra 1 serie a la vez,
            // así que un log de hoy puede ser sesión PARCIAL (editable).
            if (todayLog && (todayLog.sets?.length || 0) >= ex.targetSets) {
                completed.push(ex.id);
                // Pre-carga volumen para el resumen (si finaliza sin re-guardar)
                if (!sessionResultsRef.current[ex.id]) {
                    sessionResultsRef.current[ex.id] = {
                        name: ex.name,
                        sets: todayLog.sets,
                        volume: sessionVolumeFromSets(todayLog.sets),
                        skipped: false
                    };
                }
            }
        }
        const checkedIds = new Set(exerciseList.map(ex => ex.id));
        setCompletedExerciseIds(prev => [...new Set([...prev.filter(id => !checkedIds.has(id)), ...completed])]);
    }

    function loadExerciseData(exercise, index, historyMapOverride) {
        if (!exercise?.id) {
            setSets([]);
            return;
        }
        currentExerciseIdRef.current = exercise.id;
        setIsUnilateral(!!exercise.isUnilateral);
        setCompletedAt(null);
        setTodayLogId(null);
        // El descanso NO se cancela al cambiar de ejercicio: tras guardar se avanza
        // ~300ms y sigues descansando en la siguiente pantalla. Solo se detiene al
        // terminar el timer, al tocar la X, o al salir del entreno.

        const targetSets = Math.max(1, Number(exercise.targetSets) || 3);
        const historyMap = historyMapOverride || historyByExerciseId;
        const history = historyMap[exercise.id];
        const todayLog = findTodayLog(history);

        if (todayLog?.sets?.length) {
            const loggedSets = todayLog.sets.map(s => ({
                // weight/reps null del API reventaban .toString() y crasheaban al reabrir
                weight: s.weight != null ? String(s.weight) : '',
                reps: s.reps != null ? String(s.reps) : '',
                weightR: s.weightRight != null ? String(s.weightRight) : '',
                repsR: s.repsRight != null ? String(s.repsRight) : '',
                rir: s.rpe != null ? (10 - s.rpe) : null,
                completed: true
            }));
            setTodayLogId(todayLog.id || null);

            if (loggedSets.length >= targetSets) {
                // Sesión completa de hoy — bloqueada + enlace a editar
                setSets(loggedSets);
                // Snapshot ANTES del efecto de detección: evita timer/push fantasma
                // al reabrir un ejercicio ya guardado (series ya completed:true).
                prevSetsSnapshotRef.current = { exerciseId: exercise.id, sets: loggedSets };
                try {
                    setCompletedAt(todayLog.date ? new Date(todayLog.date) : new Date());
                } catch {
                    setCompletedAt(new Date());
                }
                setCompletedExerciseIds(prev =>
                    prev.includes(exercise.id) ? prev : [...prev, exercise.id]
                );
                return;
            }

            // Sesión parcial (Atajo): series hechas + filas vacías, editable.
            // Guardar hace PUT sobre todayLogId (no POST nuevo).
            const emptySets = Array.from(
                { length: Math.max(0, targetSets - loggedSets.length) },
                makeEmptySet
            );
            const mergedSets = [...loggedSets, ...emptySets];
            setSets(mergedSets);
            prevSetsSnapshotRef.current = { exerciseId: exercise.id, sets: mergedSets };
            return;
        }

        if (workoutData[exercise.id] && Array.isArray(workoutData[exercise.id])) {
            // localStorage a medio llenar — sincroniza snapshot para no releer
            // completed:true como "recién marcadas".
            const cachedSets = workoutData[exercise.id];
            setSets(cachedSets);
            prevSetsSnapshotRef.current = { exerciseId: exercise.id, sets: cachedSets };
        } else {
            const newSets = Array.from({ length: targetSets }, makeEmptySet);
            setSets(newSets);
            prevSetsSnapshotRef.current = { exerciseId: exercise.id, sets: newSets };
        }
    }

    // Handlers

    // Descanso entre SERIES del mismo ejercicio: se dispara al marcar una serie
    // como completada (no al terminar el ejercicio completo). El timer visual es
    // la fuente principal; el push de respaldo se pide al backend en paralelo,
    // sin bloquear la UI si falla (no es crítico, solo un aviso de refuerzo).
    const triggerSetCompleted = useCallback(() => {
        if (!currentExercise) return;
        restTimer.start(currentExercise.restSeconds || 90);
        // Si esta era la última serie de este ejercicio, el descanso que empieza
        // ahora es en realidad para el ejercicio SIGUIENTE — el recordatorio debe
        // mencionar ese, no el actual (ej. terminar búlgaras y que avise "sigue con
        // femoral", no "sigue con búlgaras").
        const isLastSet = sets.every(s => s.completed);
        const nextExercise = isLastSet ? workoutState.exercises[workoutState.currentIndex + 1] : null;
        api.scheduleRestReminder(currentExercise.id, nextExercise?.name).catch(() => {});
    }, [currentExercise, restTimer, sets, workoutState.exercises, workoutState.currentIndex]);

    // Detecta cuándo una fila pasa a completada para disparar triggerSetCompleted.
    // Esto NO puede hacerse leyendo una variable seteada dentro del updater de
    // setSets(prev => ...) e inspeccionada justo después de llamarlo — React no
    // ejecuta ese updater de forma síncrona en ese punto, lo difiere a la fase de
    // render, así que esa variable seguiría teniendo su valor inicial. Comparar
    // contra el snapshot anterior en un efecto, que sí corre después de que React
    // confirma el estado nuevo, es la forma correcta.
    const prevSetsSnapshotRef = useRef({ exerciseId: null, sets: [] });
    useEffect(() => {
        const snapshot = prevSetsSnapshotRef.current;
        if (currentExercise && snapshot.exerciseId === currentExercise.id) {
            const justCompletedSomeSet = sets.some((s, i) => !snapshot.sets[i]?.completed && s.completed);
            if (justCompletedSomeSet) triggerSetCompleted();
        }
        prevSetsSnapshotRef.current = { exerciseId: currentExercise?.id ?? null, sets };
    }, [sets, currentExercise, triggerSetCompleted]);

    const updateSet = useCallback((index, field, value) => {
        if (isAlreadyLogged) return;
        // Solo rellena datos — NO marca completed ni arranca descanso.
        // Completar es exclusivo del botón ✓ (toggleComplete).
        if ((field === 'weight' || field === 'reps' || field === 'weightR' || field === 'repsR')
            && value && parseFloat(value) < 0) return;
        setSets(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    }, [isAlreadyLogged]);

    const toggleComplete = useCallback((index) => {
        if (isAlreadyLogged) return;
        const s = sets[index];
        if (!s) return;
        if (!s.completed) {
            if (!s.weight || !s.reps) {
                toast.error('Pon peso y reps antes de marcar la serie');
                return;
            }
            if (isUnilateral && (!s.weightR || !s.repsR)) {
                toast.error('Completa ambos lados (izq y der)');
                return;
            }
        }
        setSets(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], completed: !updated[index].completed };
            return updated;
        });
        if (navigator.vibrate) navigator.vibrate(50);
    }, [isAlreadyLogged, isUnilateral, toast, sets]);

    const setRIR = useCallback((index, rir) => {
        if (isAlreadyLogged) return;
        updateSet(index, 'rir', rir);
    }, [isAlreadyLogged, updateSet]);

    const copyWeightToAll = useCallback(() => {
        if (isAlreadyLogged || !sets[0]?.weight) return;
        setSets(prev => prev.map(s => ({
            ...s,
            weight: prev[0].weight,
            ...(isUnilateral && prev[0].weightR ? { weightR: prev[0].weightR } : {})
        })));
        toast.success('Peso copiado a todas las series');
    }, [isAlreadyLogged, sets, toast, isUnilateral]);

    const applySuggestion = useCallback(() => {
        if (isAlreadyLogged || !suggestion) return;
        const emptyCount = sets.filter(s => !s.weight && !s.reps).length;
        if (emptyCount === 0) {
            toast.info('No hay series vacías que rellenar');
            return;
        }
        const w = suggestion.weight.toString();
        const r = suggestion.reps.toString();
        setSets(prev => prev.map(s => {
            if (s.weight || s.reps) return s;
            const next = { ...s, weight: w, reps: r };
            if (isUnilateral) { next.weightR = w; next.repsR = r; }
            return next;
        }));
        toast.success(emptyCount === 1 ? 'Sugerencia aplicada' : `Sugerencia en ${emptyCount} series`);
        api.logSuggestionApplied(currentExercise.id, suggestion.weight, suggestion.reps, workoutState.phase).catch(() => {});
    }, [isAlreadyLogged, suggestion, isUnilateral, toast, currentExercise, workoutState.phase, sets]);

    function goToExercise(newIndex) {
        if (newIndex < 0 || newIndex >= workoutState.exercises.length) return;

        // Scroll al inicio suavemente. El contenedor con scroll real es <main>
        // (ver Layout.jsx), no window — window.scrollTo aquí no hacía nada.
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });

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

        if (isUnilateral) {
            const incompleteSide = sets.some(s =>
                (s.weight || s.reps) && (!s.weightR || !s.repsR)
            );
            if (incompleteSide) {
                toast.error('En unilateral, completa izq y der en cada serie con datos');
                return;
            }
        }

        const validSets = sets
            .filter(s => s.weight !== '' && s.reps !== '')
            .map(s => {
                const setData = {
                    weight: parseFloat(s.weight),
                    reps: parseInt(s.reps),
                    rpe: s.rir !== null ? (10 - s.rir) : null,
                    completed: s.completed !== false
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

        const target = currentExercise?.targetSets || validSets.length;
        if (validSets.length < target) {
            const ok = window.confirm(
                `Solo registraste ${validSets.length} de ${target} series. ¿Guardar igual?`
            );
            if (!ok) return;
        }

        setUIState(prev => ({ ...prev, saving: true }));

        try {
            // Sesión parcial del Atajo: PUT sobre todayLogId (no POST nuevo).
            const result = todayLogId
                ? await api.updateWorkoutSession(todayLogId, validSets, currentExercise.id)
                : await api.logWorkout(currentExercise.id, validSets);
            const { workoutLog, queued } = result;
            setCompletedExerciseIds(prev => [...prev, currentExercise.id]);
            setCompletedAt(workoutLog?.date ? new Date(workoutLog.date) : new Date());
            if (workoutLog?.id) setTodayLogId(workoutLog.id);
            setWorkoutData(prev => {
                const updated = { ...prev };
                delete updated[currentExercise.id];
                return updated;
            });

            // Actualiza el caché de historial para que al volver a este ejercicio
            // (o recalcular sugerencia del siguiente) no sirva data vieja.
            if (workoutLog && currentExercise?.id) {
                setHistoryByExerciseId(prev => {
                    const prevList = prev[currentExercise.id] || [];
                    const rest = prevList.filter(l => l.id !== workoutLog.id);
                    return { ...prev, [currentExercise.id]: [workoutLog, ...rest] };
                });
            }

            // Acumula para el resumen post-sesión
            sessionResultsRef.current[currentExercise.id] = {
                name: currentExercise.name,
                sets: validSets,
                volume: sessionVolumeFromSets(validSets),
                skipped: false
            };
            // Si estaba saltado y ahora se guardó, quitar del set de saltados
            setSkippedExerciseIds(prev => prev.filter(id => id !== currentExercise.id));

            if (queued) {
                toast.info('Guardado local — se sincronizará cuando vuelva la conexión');
            } else {
                toast.success('¡Guardado!');
            }
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

    function buildSessionSummary() {
        const rows = workoutState.exercises.map(ex => {
            const logged = sessionResultsRef.current[ex.id];
            const skipped = skippedExerciseIds.includes(ex.id) || logged?.skipped;
            const done = completedExerciseIds.includes(ex.id) && !skipped;

            // 1) Guardado en esta visita (ref)
            if (logged && !logged.skipped) {
                const vol = logged.volume != null && logged.volume > 0
                    ? logged.volume
                    : sessionVolumeFromSets(logged.sets);
                return {
                    id: ex.id,
                    name: ex.name,
                    status: 'done',
                    setsCount: logged.sets?.length || 0,
                    volume: vol
                };
            }
            if (skipped) {
                return { id: ex.id, name: ex.name, status: 'skipped', setsCount: 0, volume: 0 };
            }
            // 2) Completado hoy (API / reabrir) — sacar series del historial de hoy
            if (done) {
                const todayLog = findTodayLog(historyByExerciseId[ex.id]);
                const sets = todayLog?.sets || [];
                return {
                    id: ex.id,
                    name: ex.name,
                    status: 'done',
                    setsCount: sets.length || null,
                    volume: sets.length ? sessionVolumeFromSets(sets) : 0
                };
            }
            // 3) Series en memoria aún no guardadas (terminar día a medias)
            const draft = workoutData[ex.id];
            if (Array.isArray(draft) && draft.some(s => s.weight && s.reps)) {
                const filled = draft.filter(s => s.weight !== '' && s.reps !== '');
                return {
                    id: ex.id,
                    name: ex.name,
                    status: 'pending',
                    setsCount: filled.length,
                    volume: sessionVolumeFromSets(filled)
                };
            }
            return { id: ex.id, name: ex.name, status: 'pending', setsCount: 0, volume: 0 };
        });
        const doneRows = rows.filter(r => r.status === 'done');
        const skippedRows = rows.filter(r => r.status === 'skipped');
        const totalVolume = rows.reduce((a, r) => a + (Number(r.volume) || 0), 0);
        return {
            dayName: workoutState.dayName,
            rows,
            doneCount: doneRows.length,
            skippedCount: skippedRows.length,
            total: rows.length,
            totalVolume
        };
    }

    function finishWorkout() {
        const summary = buildSessionSummary();
        clearStorage();
        setSessionSummary(summary);
        setUIState(prev => ({ ...prev, showSuccess: true }));
    }

    function skipExercise() {
        if (!currentExercise || isAlreadyLogged) return;
        const ok = window.confirm(
            `¿Saltar "${currentExercise.name}"?\nNo se registra nada de este ejercicio hoy. Puedes volver a él con los puntos de arriba.`
        );
        if (!ok) return;

        sessionResultsRef.current[currentExercise.id] = {
            name: currentExercise.name,
            sets: [],
            volume: 0,
            skipped: true
        };
        setSkippedExerciseIds(prev => [...new Set([...prev, currentExercise.id])]);
        setWorkoutData(prev => {
            const next = { ...prev };
            delete next[currentExercise.id];
            return next;
        });
        restTimer.stop();
        toast.info('Ejercicio saltado');

        // Siguiente no completado (los saltados cuentan como “resueltos” para el avance)
        const exs = workoutState.exercises;
        const resolved = new Set([...completedExerciseIds, ...skippedExerciseIds, currentExercise.id]);
        let nextIdx = -1;
        for (let i = workoutState.currentIndex + 1; i < exs.length; i++) {
            if (!resolved.has(exs[i].id)) { nextIdx = i; break; }
        }
        if (nextIdx === -1) {
            for (let i = 0; i < workoutState.currentIndex; i++) {
                if (!resolved.has(exs[i].id)) { nextIdx = i; break; }
            }
        }
        if (nextIdx >= 0) goToExercise(nextIdx);
        else finishWorkout();
    }

    if (workoutState.loading) return <SkeletonLoader />;

    // Día vacío / no encontrado: no seguir al UI que asume currentExercise
    if (!workoutState.exercises.length) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-3">
                <AlertTriangle size={32} className="text-[var(--warning)]" />
                <p className="font-bold text-lg">No se pudo abrir este día</p>
                <p className="text-sm text-[var(--text-secondary)]">
                    Puede que la rutina se haya actualizado o el día ya no esté disponible.
                </p>
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="mt-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm"
                >
                    Volver al inicio
                </button>
            </div>
        );
    }

    if (uiState.showSuccess && sessionSummary) {
        return (
            <div className="min-h-[calc(100vh-80px)] max-w-lg mx-auto px-4 py-8 animate-fade-in">
                <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto bg-[var(--success)]/20 rounded-full flex items-center justify-center mb-4 ring-4 ring-[var(--success)]/10">
                        <Trophy size={40} className="text-[var(--success)]" />
                    </div>
                    <h2 className="text-2xl font-black text-[var(--text-primary)] mb-1">¡Entrenamiento listo!</h2>
                    <p className="text-[var(--text-secondary)] text-sm capitalize">{sessionSummary.dayName}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-5">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-[var(--success)] tabular-nums">{sessionSummary.doneCount}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase">Hechos</p>
                    </div>
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-orange-400 tabular-nums">{sessionSummary.skippedCount}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase">Saltados</p>
                    </div>
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-center">
                        <p className="text-lg font-black text-[var(--primary)] tabular-nums leading-tight">
                            {Math.round(sessionSummary.totalVolume).toLocaleString('es')}
                        </p>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase">kg×reps</p>
                    </div>
                </div>

                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl divide-y divide-[var(--border)] mb-6">
                    {sessionSummary.rows.map(row => (
                        <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{row.name}</p>
                                {row.status === 'done' && row.setsCount != null && (
                                    <p className="text-[11px] text-[var(--text-secondary)]">
                                        {row.setsCount} serie{row.setsCount === 1 ? '' : 's'}
                                        {row.volume != null ? ` · ${Math.round(row.volume).toLocaleString('es')} kg×r` : ''}
                                    </p>
                                )}
                                {row.status === 'done' && row.setsCount == null && (
                                    <p className="text-[11px] text-[var(--text-secondary)]">Completado hoy</p>
                                )}
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${
                                row.status === 'done'
                                    ? 'bg-[var(--success)]/15 text-[var(--success)]'
                                    : row.status === 'skipped'
                                        ? 'bg-orange-500/15 text-orange-400'
                                        : 'bg-[var(--bg-dark)] text-[var(--text-secondary)]'
                            }`}>
                                {row.status === 'done' ? 'Hecho' : row.status === 'skipped' ? 'Saltado' : 'Pendiente'}
                            </span>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="w-full py-4 rounded-2xl font-bold text-lg bg-[var(--primary)] text-white shadow-xl active:scale-[0.98]"
                >
                    Volver al inicio
                </button>
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
                            aria-label="Cerrar temporizador de descanso"
                            className="ml-1 p-1 -mr-1 rounded-full hover:bg-white/10 transition-colors active:scale-90"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Header - Al inicio, se desplaza con el contenido */}
            <div className="flex items-center justify-between mb-6">
                <button onClick={() => navigate(-1)} aria-label="Volver" className="p-2 -ml-2 hover:bg-[var(--bg-card)] rounded-full transition-colors active:scale-95">
                    <ArrowLeft size={20} className="text-[var(--text-primary)]" />
                </button>

                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                        {workoutState.dayName}
                    </span>
                    {/* Progress dots tappeables */}
                    <div className="flex gap-1 mt-1.5 items-center" role="tablist" aria-label="Ejercicios del día">
                        {workoutState.exercises.map((ex, i) => {
                            const done = completedExerciseIds.includes(ex.id);
                            const skipped = skippedExerciseIds.includes(ex.id);
                            return (
                            <button
                                key={ex.id || i}
                                type="button"
                                role="tab"
                                aria-selected={i === workoutState.currentIndex}
                                aria-label={`Ejercicio ${i + 1}: ${ex.name}${done ? ' (completado)' : skipped ? ' (saltado)' : ''}`}
                                onClick={() => goToExercise(i)}
                                className={`h-2 rounded-full transition-all duration-300 active:scale-90 ${
                                    i === workoutState.currentIndex ? 'w-6 bg-[var(--primary)]'
                                    : done ? 'w-2 bg-[var(--success)]'
                                    : skipped ? 'w-2 bg-orange-500/70'
                                    : 'w-2 bg-[var(--border)]'
                                }`}
                            />
                            );
                        })}
                    </div>
                </div>

                <button onClick={loadHistoryModal} aria-label="Historial del ejercicio" className="p-2 -mr-2 hover:bg-[var(--bg-card)] rounded-full transition-colors text-[var(--text-secondary)] active:scale-95">
                    <History size={20} />
                </button>
            </div>

            {/* Exercise Title Card */}
            <div className="mb-6 text-center">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <button
                        onClick={() => goToExercise(workoutState.currentIndex - 1)}
                        disabled={workoutState.currentIndex === 0}
                        aria-label="Ejercicio anterior"
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
                        aria-label="Ejercicio siguiente"
                        className="p-3 rounded-xl hover:bg-[var(--bg-card)] text-[var(--text-secondary)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                <h1 className="text-2xl font-black text-[var(--text-primary)] leading-tight mb-1 px-2">
                    {currentExercise?.name || 'Ejercicio'}
                </h1>
                {!!currentExercise?.note && (
                    <p className="text-xs text-[var(--text-secondary)] px-4 mb-2 leading-snug">
                        {currentExercise.note}
                    </p>
                )}

                {pendingSync && (
                    <div className="flex justify-center mb-2">
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--warning)] bg-[var(--warning)]/10 px-3 py-1 rounded-full border border-[var(--warning)]/30">
                            <AlertTriangle size={12} />
                            <span>Guardado local — pendiente de sincronizar</span>
                        </div>
                    </div>
                )}

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

            {/* Chips compactos + sugerencia — series arriba en móvil */}
            <div className="mb-4 space-y-2">
                {goalTarget && !goalTarget.planExhausted && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2 flex items-center gap-2 animate-fade-in">
                        <Target size={14} className="text-purple-400 shrink-0" strokeWidth={2.5} />
                        {goalTarget.achieved ? (
                            <p className="font-bold text-purple-400 text-xs">Objetivo superado</p>
                        ) : (
                            <p className="font-bold text-purple-400 text-xs">
                                Objetivo: {goalTarget.weight}kg × {goalTarget.reps}
                                <span className="font-medium text-purple-400/70"> · sem. {goalTarget.week}/{goalTarget.totalWeeks}</span>
                            </p>
                        )}
                    </div>
                )}
                {workoutState.phase && PHASE_BANNER[workoutState.phase] && (() => {
                    const b = PHASE_BANNER[workoutState.phase];
                    const Icon = b.Icon;
                    return (
                        <details className={`${b.wrapperClass} border rounded-xl text-xs`}>
                            <summary className={`px-3 py-2 cursor-pointer flex items-center gap-2 select-none font-bold ${b.titleClass}`}>
                                <Icon size={14} strokeWidth={2.5} />
                                {b.title}
                            </summary>
                            <p className={`px-3 pb-2 ${b.descClass}`}>{b.desc}</p>
                        </details>
                    );
                })()}
                {skippedExerciseIds.includes(currentExercise?.id) && !isAlreadyLogged ? (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 flex items-center gap-3 animate-fade-in">
                        <div className="bg-orange-500/20 p-2 rounded-full text-orange-400 shrink-0">
                            <ArrowRight size={16} strokeWidth={2.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-orange-400 text-sm">Ejercicio saltado</p>
                            <p className="text-orange-400/80 text-xs">Puedes registrarlo igual si cambias de idea</p>
                        </div>
                    </div>
                ) : isAlreadyLogged ? (
                    <div className="bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-2xl p-3 flex items-center gap-3 animate-fade-in">
                        <div className="bg-[var(--success)] p-2 rounded-full text-white shadow-sm shrink-0">
                            <Check size={16} strokeWidth={3} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-[var(--success)] text-sm">Ejercicio completado</p>
                            <p className="text-[var(--success)]/80 text-xs">Hoy a las {(completedAt || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        {todayLogId && (
                            <div className="flex gap-1.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const full = await api.getWorkoutSession(todayLogId);
                                            await downloadSessionPdf(full, {
                                                userName: user?.firstName
                                                    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
                                                    : user?.username
                                            });
                                            toast.success('PDF descargado');
                                        } catch (e) {
                                            toast.error('No se pudo generar el PDF');
                                        }
                                    }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[var(--primary)] bg-[var(--bg-card)] border border-[var(--primary)]/30 px-3 py-2 rounded-xl active:scale-95"
                                    aria-label="Descargar PDF de la sesión"
                                >
                                    <FileDown size={14} />
                                    PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/session/${todayLogId}/edit`)}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border)] px-3 py-2 rounded-xl active:scale-95"
                                    aria-label="Editar sesión guardada"
                                >
                                    <Pencil size={14} />
                                    Editar
                                </button>
                            </div>
                        )}
                    </div>
                ) : (previousBest || suggestion || lastSession) && (
                    <>
                    {lastSession?.sets?.length > 0 && (
                        <div className="bg-[var(--bg-dark)]/60 border border-[var(--border)] rounded-xl px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
                                Última sesión
                                <span className="font-medium normal-case tracking-normal ml-1 opacity-80">
                                    · {new Date(lastSession.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                                </span>
                            </p>
                            <div className="flex gap-1.5 flex-wrap">
                                {lastSession.sets.map((s, i) => (
                                    <span
                                        key={i}
                                        className="text-[11px] font-mono font-semibold bg-[var(--bg-card)] border border-[var(--border)] px-2 py-1 rounded-lg tabular-nums text-[var(--text-primary)]"
                                    >
                                        {s.weight}×{s.reps}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
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
                        {suggestion && (() => {
                            const label = suggestion.phase === 'deload' ? 'Descarga'
                                : suggestion.phase === 'intensification' ? 'Intensificación'
                                : suggestion.phase === 'accumulation' ? 'Acumulación'
                                : 'Sugerido';
                            const isWarning = suggestion.phase === 'deload';
                            const isPhaseColored = suggestion.phase === 'intensification' || suggestion.phase === 'accumulation';
                            const tintClass = isWarning ? 'bg-[var(--warning)]/5' : isPhaseColored ? 'bg-[var(--primary)]/5' : 'bg-[var(--success)]/5';
                            const textClass = isWarning ? 'text-[var(--warning)]' : isPhaseColored ? 'text-[var(--primary)]' : 'text-[var(--success)]';
                            return (
                                <button
                                    onClick={applySuggestion}
                                    className="flex-1 p-3 flex flex-col items-center hover:bg-[var(--bg-dark)] transition-colors active:scale-95 group relative overflow-hidden"
                                >
                                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity ${tintClass}`} />
                                    <span className={`text-[10px] uppercase font-bold mb-1 flex items-center gap-1 ${textClass}`}>
                                        {label} <Sparkles size={10} />
                                    </span>
                                    <div className={`flex items-end gap-1 group-hover:scale-105 transition-transform ${textClass}`}>
                                        <span className="text-2xl font-black tracking-tight leading-none">{suggestion.weight}</span>
                                        <span className="text-xs mb-0.5 font-bold">kg</span>
                                        <span className="mx-1 text-[var(--border)]">/</span>
                                        <span className="text-lg font-bold">{suggestion.reps}</span>
                                        <span className="text-xs mb-0.5">reps</span>
                                    </div>
                                </button>
                            );
                        })()}
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

                    {/* Calculadora de porcentajes - guía de calentamiento, informativa (no se guarda) */}
                    <WarmupCalculator
                        base1RM={estimate1RM(suggestion || previousBest)}
                        increment={resolveWeightIncrement(currentExercise?.muscleGroup, currentExercise?.name)}
                    />
                    </>
                )}
            </div>

            {/* Sets */}
            <div className="space-y-3">
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
                        lastSet={lastSession?.sets?.[i] || null}
                    />
                ))}
            </div>

            {/* Botón Copiar Peso (Solo si hay datos y no está bloqueado) */}
            {!isAlreadyLogged && sets[0]?.weight && sets.length > 1 && (
                <div className="flex justify-center mt-5">
                    <button
                        onClick={copyWeightToAll}
                        className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] bg-[var(--bg-card)] px-5 py-2.5 rounded-full border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all active:scale-95 shadow-sm"
                    >
                        <Dumbbell size={14} />
                        <span>Copiar {sets[0].weight}kg a todo</span>
                    </button>
                </div>
            )}

            {/* Botón de acción + saltar */}
            <div className="mt-6 mb-4 space-y-2">
                <button
                    type="button"
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
                                <span>Siguiente ejercicio</span>
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
                                    ? 'Guardar y seguir'
                                    : 'Guardar y finalizar'}
                            </span>
                        </>
                    )}
                </button>

                {!isAlreadyLogged && !uiState.saving && (
                    <button
                        type="button"
                        onClick={skipExercise}
                        className="w-full py-3 rounded-2xl font-semibold text-sm text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--bg-card)] hover:border-orange-500/40 hover:text-orange-400 transition-all active:scale-[0.98]"
                    >
                        Saltar este ejercicio
                    </button>
                )}

                {(completedExerciseIds.length > 0 || skippedExerciseIds.length > 0) && !uiState.saving && (
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm('¿Terminar el entrenamiento con lo que ya hiciste?')) {
                                finishWorkout();
                            }
                        }}
                        className="w-full py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                        Terminar día con lo registrado
                    </button>
                )}
            </div>

            {/* History Modal */}
            {uiState.showHistory && (
                <Portal>
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
                </Portal>
            )}
        </div>
    );
}