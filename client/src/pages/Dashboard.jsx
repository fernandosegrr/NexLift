import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Flame, Target, Trophy, Calendar, Play,
    ChevronRight, Dumbbell, TrendingUp, Coffee, CheckCircle2, Loader2, ArrowRight, AlertTriangle
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import {
    mexicoCityDateStr,
    mexicoCityLastNDays
} from '../utils/dates';
import { resolveTodayRoutineDay } from '../utils/routineDays';
import { readHomeCache, writeHomeCache } from '../utils/homeCache';

// Prefetch del chunk de Workout en idle (el botón "Entrenar" no espera a bajar JS)
function prefetchWorkoutChunk() {
    import('./Workout').catch(() => {});
}

// Fase del bloque activo (viene de GET /routines/active como `phase`).
// Mismas claves que Workout — aviso visible, nunca silencioso.
const PHASE_CHIP = {
    deload: { label: 'Descarga', className: 'bg-[var(--warning)]/20 text-[var(--warning)] border-[var(--warning)]/30' },
    intensification: { label: 'Intensificación', className: 'bg-white/20 text-white border-white/30' },
    accumulation: { label: 'Acumulación', className: 'bg-white/20 text-white border-white/30' }
};

function buildConsistencyMap(payload) {
    if (!payload) return {};
    if (payload.consistencyCounts && typeof payload.consistencyCounts === 'object') {
        return { ...payload.consistencyCounts };
    }
    const map = {};
    (payload.consistencyDays || []).forEach(dayKey => {
        map[dayKey] = (map[dayKey] || 0) + 1;
    });
    return map;
}

function getHeatmapIntensity(count) {
    if (!count || count <= 0) return 0;
    if (count >= 4) return 3;
    if (count >= 2) return 2;
    return 1;
}

function applyHomePayload(payload, setters) {
    const {
        setStats, setActiveRoutine, setConsistency, setPrs,
        setPlateauCount, setAiTodayDay, setAiTodayLoading, setTodayCheckin
    } = setters;

    setStats(payload.stats || null);
    setActiveRoutine(payload.activeRoutine || null);
    setConsistency(buildConsistencyMap(payload));
    setPrs(Array.isArray(payload.prs) ? payload.prs : []);
    setPlateauCount(payload.plateauCount || 0);
    setAiTodayDay(payload.aiTodayDay || null);
    setAiTodayLoading(false);
    if (setTodayCheckin && payload.todayCheckin) {
        setTodayCheckin({
            creatineTaken: !!payload.todayCheckin.creatineTaken,
            dietCompliant: !!payload.todayCheckin.dietCompliant,
            zeroLiquidCalories: !!payload.todayCheckin.zeroLiquidCalories
        });
    }
}

export default function Dashboard() {
    const { user } = useAuth();
    const toast = useToast();
    const cached = useMemo(() => readHomeCache(), []);
    const [stats, setStats] = useState(() => cached?.stats || null);
    const [activeRoutine, setActiveRoutine] = useState(() => cached?.activeRoutine || null);
    const [consistency, setConsistency] = useState(() => buildConsistencyMap(cached));
    const [prs, setPrs] = useState(() => Array.isArray(cached?.prs) ? cached.prs : []);
    const [plateauCount, setPlateauCount] = useState(() => cached?.plateauCount || 0);
    const [aiTodayDay, setAiTodayDay] = useState(() => cached?.aiTodayDay || null);
    const [aiTodayLoading, setAiTodayLoading] = useState(false);
    const [todayCheckin, setTodayCheckin] = useState(() => ({
        creatineTaken: !!cached?.todayCheckin?.creatineTaken,
        dietCompliant: !!cached?.todayCheckin?.dietCompliant,
        zeroLiquidCalories: !!cached?.todayCheckin?.zeroLiquidCalories
    }));
    // Si hay cache fresco, no bloquear UI con spinner
    const [loading, setLoading] = useState(() => !cached);
    const [loadError, setLoadError] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [loggingRest, setLoggingRest] = useState(false);
    const heatmapRef = useRef(null);

    // Hoy en CDMX (no reloj local del device) — se actualiza automáticamente al cruzar medianoche o volver al foco
    const [todayStr, setTodayStr] = useState(() => mexicoCityDateStr());

    useEffect(() => {
        const refreshToday = () => {
            const current = mexicoCityDateStr();
            setTodayStr(prev => (prev !== current ? current : prev));
        };
        const interval = setInterval(refreshToday, 30000);
        window.addEventListener('focus', refreshToday);
        document.addEventListener('visibilitychange', refreshToday);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', refreshToday);
            document.removeEventListener('visibilitychange', refreshToday);
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const setters = {
            setStats, setActiveRoutine, setConsistency, setPrs,
            setPlateauCount, setAiTodayDay, setAiTodayLoading, setTodayCheckin
        };

        async function fetchData() {
            try {
                setLoadError(false);
                // 1 request en vez de 5 (overview+active+consistency+prs+history)
                const home = await api.getHome();
                if (!isMounted) return;
                applyHomePayload(home, setters);
                writeHomeCache(home);
            } catch (error) {
                if (isMounted) {
                    console.error('Dashboard error:', error);
                    // Solo error total si no había cache para mostrar
                    if (!cached) {
                        setLoadError(true);
                        toast.error('Error al cargar el dashboard');
                    }
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchData();
        // Prefetch Workout en idle para que "Entrenar" abra al toque
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => prefetchWorkoutChunk(), { timeout: 2000 });
        } else {
            setTimeout(prefetchWorkoutChunk, 600);
        }
        return () => { isMounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // null = sin día asignado a hoy (routine sin días, o ningún RoutineDay con
    // weekday=hoy) — NUNCA se fabrica un día de descanso sintético: eso es lo
    // que ocultaba el hueco real (ver render: rama "sin día asignado").
    const nextDay = useMemo(() => {
        if (!activeRoutine) return null;
        if (activeRoutine.source === 'ai') return aiTodayDay; // null mientras carga
        return resolveTodayRoutineDay(activeRoutine.days);
    }, [activeRoutine, aiTodayDay]);

    const { last30Days, isTodayLogged } = useMemo(() => {
        const days = mexicoCityLastNDays(30);
        const todayLogged = (consistency[todayStr] || 0) > 0;
        return { last30Days: days, isTodayLogged: todayLogged };
    }, [consistency, todayStr]);

    // Racha: fuente de verdad = server (stats/overview, helpers CDMX + rest days
    // de la rutina). El fallback local solo cubre el instante optimista de
    // "confirmar descanso" antes de que vuelva getOverviewStats.
    const displayStreak = useMemo(() => {
        if (stats?.currentStreak != null) return stats.currentStreak;
        // Fallback mínimo (sin rest programados — solo días con evento en el mapa)
        let streak = 0;
        const todayLogged = (consistency[todayStr] || 0) > 0;
        const checkFrom = todayLogged ? 0 : 1;
        for (let i = checkFrom; i < 365; i++) {
            const dateStr = mexicoCityDateStr(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
            if ((consistency[dateStr] || 0) > 0) streak++;
            else break;
        }
        return streak;
    }, [stats, consistency, todayStr]);

    const yearHeatmap = useMemo(() => {
        if (!showHeatmap) return null;

        // Año calendario CDMX (no el del browser): ancla en la fecha CDMX de hoy
        const todayCdmx = todayStr;
        const year = parseInt(todayCdmx.slice(0, 4), 10);
        // Mediodía UTC de cada día del año en CDMX ≈ estable; usamos Date UTC
        // construido desde YYYY-MM-DD para no cruzar bordes raros.
        const startOfYear = new Date(`${year}-01-01T12:00:00Z`);
        const endOfYear = new Date(`${year}-12-31T12:00:00Z`);
        const today = new Date(`${todayCdmx}T12:00:00Z`);

        const startDow = startOfYear.getUTCDay(); // 0=Sun
        const mondayOffset = startDow === 0 ? -6 : 1 - startDow;
        const firstMonday = new Date(startOfYear);
        firstMonday.setUTCDate(firstMonday.getUTCDate() + mondayOffset);

        const weeks = [];
        let currentDate = new Date(firstMonday);

        while (currentDate <= endOfYear || weeks.length < 53) {
            const week = [];
            for (let d = 0; d < 7; d++) {
                const dateStr = currentDate.toISOString().slice(0, 10);
                // dateStr de un Date anclado a T12:00Z es el YYYY-MM-DD UTC = día
                // del ancla; como construimos desde fechas CDMX vía T12Z, coincide
                // con el día calendario CDMX del año civil.
                const inYear = dateStr.startsWith(String(year));
                const isFuture = currentDate > today;
                week.push(inYear ? { date: dateStr, isFuture } : null);
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
            if (week.some(d => d !== null)) weeks.push(week);
            if (currentDate > endOfYear && currentDate.getUTCDay() === 1) break;
        }

        return weeks;
    }, [showHeatmap, todayStr]);

    // Al abrir el heatmap de 365d, scrollear al final (hoy) — si no, se queda
    // mirando enero y parece vacío.
    useEffect(() => {
        if (!showHeatmap || !heatmapRef.current) return;
        const el = heatmapRef.current;
        // rAF: el DOM del heatmap acaba de montarse
        requestAnimationFrame(() => {
            el.scrollLeft = el.scrollWidth;
        });
    }, [showHeatmap, yearHeatmap]);

    const handleLogRest = async () => {
        if (loggingRest) return;
        setLoggingRest(true);

        const previousConsistency = consistency;
        const previousStats = stats;

        // Update optimista
        setConsistency(prev => ({
            ...prev,
            [todayStr]: (prev[todayStr] || 0) + 1
        }));
        // Sube la racha en el card de inmediato (server la recalculará después)
        if (stats) {
            setStats(prev => prev ? { ...prev, currentStreak: (prev.currentStreak || 0) + 1 } : prev);
        }

        try {
            const result = await api.logRestDay();
            if (result?.queued) {
                toast.info('Guardado local — se sincronizará cuando vuelva la conexión');
            } else {
                const home = await api.getHome();
                applyHomePayload(home, {
                    setStats, setActiveRoutine, setConsistency, setPrs,
                    setPlateauCount, setAiTodayDay, setAiTodayLoading, setTodayCheckin
                });
                writeHomeCache(home);
            }
        } catch (error) {
            console.error('Failed to log rest:', error);
            setConsistency(previousConsistency);
            setStats(previousStats);
            toast.error('Error de conexión, no se pudo registrar el descanso');
        } finally {
            setLoggingRest(false);
        }
    };

    const handleToggleHabit = async (field) => {
        const nextVal = !todayCheckin[field];
        const prevCheckin = todayCheckin;
        const updatedCheckin = { ...todayCheckin, [field]: nextVal };

        setTodayCheckin(updatedCheckin);
        const cachedPayload = readHomeCache();
        if (cachedPayload) {
            writeHomeCache({ ...cachedPayload, todayCheckin: updatedCheckin });
        }

        try {
            await api.updateDailyCheckin({ [field]: nextVal });
        } catch (error) {
            console.error('Failed to update daily checkin:', error);
            setTodayCheckin(prevCheckin);
            if (cachedPayload) {
                writeHomeCache({ ...cachedPayload, todayCheckin: prevCheckin });
            }
            toast.error('No se pudo actualizar el hábito');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (loadError && !stats && !activeRoutine) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center space-y-3">
                <AlertTriangle size={32} className="text-[var(--warning)]" />
                <p className="font-bold text-lg">No se pudo cargar el dashboard</p>
                <p className="text-sm text-[var(--text-secondary)]">Revisa tu conexión e intenta de nuevo</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm active:scale-95"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    const isRestToday = !!nextDay?.isRestDay;
    const greeting = isRestToday
        ? 'Día de recuperación'
        : '¡A entrenar!';

    const statsCards = [
        { icon: Flame, value: displayStreak, label: 'Racha', colorClass: 'text-orange-500', delay: 0 },
        { icon: Target, value: stats?.totalWorkouts || 0, label: 'Sesiones', colorClass: 'text-cyan-400', delay: 50 },
        { icon: Trophy, value: stats?.totalPRs || 0, label: 'PRs', colorClass: 'text-yellow-500', delay: 100 },
        { icon: Calendar, value: stats?.trainingDaysLast30 || 0, label: 'Mes', colorClass: 'text-green-500', delay: 150 }
    ];

    const phaseChip = activeRoutine?.phase && PHASE_CHIP[activeRoutine.phase]
        ? PHASE_CHIP[activeRoutine.phase]
        : null;

    const intensityColors = [
        'bg-[var(--border)]',
        'bg-green-900',
        'bg-green-600',
        'bg-green-400'
    ];

    return (
        <div className="space-y-5 animate-fade-in max-w-2xl mx-auto pb-4">
            {/* Header */}
            <div className="pt-2 px-1">
                <p className="text-[var(--text-secondary)] text-sm">
                    {user?.firstName ? `Hola, ${user.firstName}` : 'Bienvenido de nuevo'}
                </p>
                <h1 className="text-2xl font-bold mt-1">
                    {greeting} {isRestToday ? '☕' : '💪'}
                </h1>
            </div>

            {/* Active Routine Card - Hero */}
            {activeRoutine ? (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-900 p-6 shadow-lg">
                    <div className="absolute inset-0 bg-black/10" />
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/15 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />

                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-white/80 text-xs font-semibold tracking-wider">RUTINA ACTIVA</p>
                            {activeRoutine.source === 'ai' && (
                                <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">IA</span>
                            )}
                            {phaseChip && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${phaseChip.className}`}>
                                    {phaseChip.label}
                                    {activeRoutine.currentWeek ? ` · sem. ${activeRoutine.currentWeek}` : ''}
                                </span>
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-white mb-4">
                            {activeRoutine.name}
                        </h2>

                        {nextDay ? (
                            nextDay.isRestDay ? (
                                <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/10">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <p className="text-white/70 text-xs font-medium">HOY</p>
                                            <p className="text-white font-semibold flex items-center gap-2 mt-1">
                                                <Coffee size={18} /> Día de descanso
                                            </p>
                                        </div>
                                        {isTodayLogged && (
                                            <div className="bg-green-500/30 text-green-100 px-3 py-1.5 rounded-full text-xs flex items-center gap-1 font-medium border border-green-400/30">
                                                <CheckCircle2 size={14} /> Registrado
                                            </div>
                                        )}
                                    </div>

                                    {!isTodayLogged && (
                                        <button
                                            type="button"
                                            onClick={handleLogRest}
                                            disabled={loggingRest}
                                            className="w-full bg-white text-[var(--primary)] py-2.5 rounded-lg font-semibold text-sm hover:bg-white/95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg"
                                        >
                                            {loggingRest ? (
                                                <>
                                                    <Loader2 size={16} className="animate-spin" />
                                                    <span>Registrando...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 size={16} />
                                                    <div className="flex flex-col items-start">
                                                        <span>Confirmar descanso</span>
                                                        <span className="text-xs opacity-70">Mantiene tu racha</span>
                                                    </div>
                                                </>
                                            )}
                                        </button>
                                    )}

                                    {isTodayLogged && (
                                        <p className="text-white/70 text-xs text-center mt-2">
                                            ¡Disfruta tu recuperación! Mañana será otro día.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <Link
                                    to={`/workout/${nextDay.id}`}
                                    onPointerEnter={prefetchWorkoutChunk}
                                    onFocus={prefetchWorkoutChunk}
                                    className="flex items-center justify-between bg-white/20 backdrop-blur-md rounded-xl p-4 hover:bg-white/30 active:scale-[0.98] transition-all border border-white/10"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white/70 text-xs font-medium">
                                            {isTodayLogged ? 'HOY · YA REGISTRASTE' : 'HOY'}
                                        </p>
                                        <p className="text-white font-bold text-lg mt-1 break-words">{nextDay.dayName}</p>
                                        <p className="text-white/80 text-sm">
                                            {nextDay.exercises?.length || 0} ejercicio{(nextDay.exercises?.length || 0) === 1 ? '' : 's'}
                                            {nextDay.splitLabel ? ` · ${nextDay.splitLabel}` : ''}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-xl shrink-0 ml-3" aria-hidden>
                                        <Play size={22} className="text-[var(--primary)] ml-1" fill="currentColor" />
                                    </div>
                                </Link>
                            )
                        ) : activeRoutine.source === 'ai' && aiTodayLoading ? (
                            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 h-[76px] animate-pulse" />
                        ) : activeRoutine.source !== 'ai' && activeRoutine.days?.length > 0 ? (
                            <div className="bg-white/10 rounded-xl p-4 border border-white/10 text-center text-white/80 text-sm space-y-2">
                                <p>Hoy no hay ningún día de esta rutina asignado.</p>
                                <Link
                                    to={`/routines/${activeRoutine.id}/edit`}
                                    className="inline-block text-white font-semibold underline underline-offset-2"
                                >
                                    Asignar día de la semana
                                </Link>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : (
                <Link
                    to="/routines"
                    className="relative block rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-dark)] p-6 text-center hover:from-[var(--primary)]/10 hover:to-[var(--bg-card)] transition-all border border-[var(--border)] group"
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--primary)]/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[var(--primary)]/10 transition-colors" />

                    <div className="relative z-10">
                        <div className="w-16 h-16 mx-auto bg-[var(--primary)]/10 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-[var(--primary)]/20 transition-colors">
                            <Dumbbell size={32} className="text-[var(--primary)]" />
                        </div>
                        <p className="font-bold text-lg mb-1">Sin rutina activa</p>
                        <p className="text-sm text-[var(--text-secondary)] mb-4">
                            Selecciona una rutina para comenzar a trackear tu progreso
                        </p>
                        <div className="inline-flex items-center gap-2 text-[var(--primary)] font-medium text-sm group-hover:gap-3 transition-all">
                            <span>Explorar rutinas</span>
                            <ArrowRight size={16} />
                        </div>
                    </div>
                </Link>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-3">
                {statsCards.map(({ icon: Icon, value, label, colorClass, delay }, i) => (
                    <div
                        key={i}
                        className="bg-[var(--bg-card)] rounded-xl p-3 text-center hover:bg-[var(--bg-card-hover)] transition-all animate-fade-in border border-[var(--border)]"
                        style={{ animationDelay: `${delay}ms` }}
                    >
                        <Icon size={20} className={`mx-auto ${colorClass} mb-1.5`} aria-hidden />
                        <p className="text-xl font-bold tabular-nums">{value}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Daily Check-in — Hábitos rápidos (1 toque) */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Check-in de Hoy
                    </p>
                    <span className="text-[11px] font-medium text-[var(--text-secondary)] tabular-nums">
                        {[todayCheckin.creatineTaken, todayCheckin.dietCompliant, todayCheckin.zeroLiquidCalories].filter(Boolean).length}/3
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { key: 'creatineTaken', label: 'Creatina 5g', shortDesc: 'Suplemento' },
                        { key: 'dietCompliant', label: 'Plato 50% Prot.', shortDesc: 'Máx 2 tortillas' },
                        { key: 'zeroLiquidCalories', label: '0 Cal. Líquidas', shortDesc: 'Sin azúcar' }
                    ].map(({ key, label, shortDesc }) => {
                        const active = !!todayCheckin[key];
                        return (
                            <button
                                key={key}
                                type="button"
                                role="switch"
                                aria-checked={active}
                                onClick={() => handleToggleHabit(key)}
                                className={`flex flex-col items-start justify-between rounded-xl p-2.5 text-left transition-all active:scale-95 border ${
                                    active
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                                        : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)] hover:border-white/20'
                                }`}
                            >
                                <div className="flex items-center justify-between w-full mb-1">
                                    <span className={`text-xs font-bold leading-tight ${active ? 'text-emerald-200' : 'text-[var(--text-primary)]'}`}>
                                        {label}
                                    </span>
                                    <CheckCircle2
                                        size={14}
                                        className={`shrink-0 transition-transform ${active ? 'text-emerald-400 scale-110' : 'opacity-30'}`}
                                    />
                                </div>
                                <span className="text-[10px] opacity-75 leading-tight truncate w-full">
                                    {shortDesc}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Volumen semanal — kg×reps (tonelaje), no peso corporal */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
                    <Dumbbell size={20} className="text-[var(--primary)]" aria-hidden />
                </div>
                <div className="overflow-hidden">
                    <p className="text-xs text-[var(--text-secondary)]">Volumen esta semana</p>
                    <p className="font-bold text-lg tabular-nums">
                        {(stats?.weeklyVolume || 0).toLocaleString('es')}
                        <span className="text-sm font-semibold text-[var(--text-secondary)] ml-1">kg×reps</span>
                    </p>
                </div>
            </div>

            {/* Plateau */}
            {plateauCount > 0 && (
                <Link
                    to="/progress"
                    className="bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-xl p-3 flex items-center gap-3 hover:bg-[var(--warning)]/15 transition-colors"
                >
                    <AlertTriangle size={18} className="text-[var(--warning)] shrink-0" />
                    <div className="flex-1">
                        <p className="text-[var(--warning)] font-bold text-sm">
                            {plateauCount} ejercicio{plateauCount > 1 ? 's' : ''} sin mejora reciente
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">Toca para ver el detalle en Progreso</p>
                    </div>
                    <ChevronRight size={16} className="text-[var(--text-secondary)] shrink-0" />
                </Link>
            )}

            {/* Consistency Calendar */}
            <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                <button
                    type="button"
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className="w-full flex items-center justify-between mb-4 hover:opacity-80 transition-opacity"
                    aria-expanded={showHeatmap}
                >
                    <span className="font-semibold flex items-center gap-2">
                        <TrendingUp size={18} className="text-[var(--primary)]" aria-hidden />
                        Constancia
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">
                            {showHeatmap ? '365 días' : '30 días'}
                        </span>
                        <ChevronRight
                            size={18}
                            className={`text-[var(--text-secondary)] transition-transform ${showHeatmap ? 'rotate-90' : ''}`}
                            aria-hidden
                        />
                    </div>
                </button>

                {/* 30-day mini heatmap */}
                <div className="grid grid-cols-10 gap-1.5" role="grid" aria-label="Actividad de los últimos 30 días">
                    {last30Days.map((date) => {
                        const count = consistency[date] || 0;
                        const intensity = getHeatmapIntensity(count);
                        const isToday = date === todayStr;
                        return (
                            <div
                                key={date}
                                role="gridcell"
                                aria-label={`${date}: ${count ? count + ' sesiones' : 'Sin actividad'}`}
                                className={`aspect-square rounded-sm ${intensityColors[intensity]} ${isToday ? 'ring-2 ring-[var(--primary)]' : ''} transition-all`}
                                title={`${date}: ${count ? count + ' sesiones' : 'Sin actividad'}`}
                            />
                        );
                    })}
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-[var(--text-secondary)]">
                    <span>Hace 30 días</span>
                    <span>Hoy</span>
                </div>

                {/* 365-day heatmap */}
                {showHeatmap && yearHeatmap && (
                    <div className="animate-fade-in mt-6">
                        <div className="relative">
                            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />
                            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />

                            <p className="text-xs text-[var(--text-secondary)] mb-2 text-center">
                                Desliza para ver todo el año →
                            </p>

                            <div
                                className="flex gap-[2px] overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent"
                                ref={heatmapRef}
                            >
                                <div className="flex flex-col gap-[2px] shrink-0 text-[9px] text-[var(--text-secondary)] mr-1.5">
                                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                                        <div key={d} className="h-[11px] flex items-center justify-center w-3">
                                            {d}
                                        </div>
                                    ))}
                                </div>
                                {yearHeatmap.map((week, wi) => (
                                    <div key={wi} className="flex flex-col gap-[2px]">
                                        {week.map((cell, di) => {
                                            if (!cell) return <div key={di} className="w-[11px] h-[11px]" />;
                                            const { date, isFuture } = cell;
                                            const count = consistency[date] || 0;
                                            const intensity = getHeatmapIntensity(count);
                                            return (
                                                <div
                                                    key={di}
                                                    role="gridcell"
                                                    aria-label={`${date}: ${isFuture ? 'Futuro' : count ? count + ' sesiones' : 'Sin actividad'}`}
                                                    className={`w-[11px] h-[11px] rounded-[2px] ${isFuture ? 'bg-[var(--bg-dark)] opacity-30' : intensityColors[intensity]} ${date === todayStr ? 'ring-1 ring-[var(--primary)]' : ''} transition-all`}
                                                    title={`${date}: ${isFuture ? 'Futuro' : count ? count + ' sesiones' : 'Sin actividad'}`}
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-[var(--text-secondary)]">
                            <span>Menos</span>
                            {intensityColors.map((c, i) => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-[2px] ${c}`} />
                            ))}
                            <span>Más</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
