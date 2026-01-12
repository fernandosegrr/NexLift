import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Flame, Target, Trophy, Calendar, Play,
    ChevronRight, Dumbbell, TrendingUp, Coffee, CheckCircle2, Loader2, ArrowRight
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [activeRoutine, setActiveRoutine] = useState(null);
    const [consistency, setConsistency] = useState({});
    const [loading, setLoading] = useState(true);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [loggingRest, setLoggingRest] = useState(false);
    const heatmapRef = useRef(null);

    // Obtener YYYY-MM-DD local de forma nativa y segura
    const getLocalDateStr = (dateObj) => {
        return dateObj.toLocaleDateString('en-CA');
    };

    // String de hoy calculado una sola vez
    const todayStr = useMemo(() => getLocalDateStr(new Date()), []);

    useEffect(() => {
        let isMounted = true;

        async function fetchData() {
            try {
                const [statsData, activeData, consistencyRes] = await Promise.all([
                    api.getOverviewStats(),
                    api.getActiveRoutine(),
                    api.getConsistency()
                ]);

                if (!isMounted) return;

                const map = {};
                if (consistencyRes.events) {
                    consistencyRes.events.forEach(dateStr => {
                        const localDate = getLocalDateStr(new Date(dateStr));
                        map[localDate] = (map[localDate] || 0) + 1;
                    });
                } else {
                    Object.assign(map, consistencyRes);
                }

                setStats(statsData);
                setActiveRoutine(activeData);
                setConsistency(map);
            } catch (error) {
                if (isMounted) {
                    console.error('Dashboard error:', error);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        fetchData();

        return () => {
            isMounted = false;
        };
    }, []);

    const getTodayName = () => {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return days[new Date().getDay()];
    };

    // Helper para normalizar nombres de días
    const normalizeDay = (day) => {
        return day.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .slice(0, 3);
    };

    const nextDay = useMemo(() => {
        if (!activeRoutine?.days?.length) return null;
        const todayName = getTodayName();

        const todayRoutineDay = activeRoutine.days.find(d =>
            normalizeDay(d.dayName) === normalizeDay(todayName)
        );

        if (todayRoutineDay) return todayRoutineDay;

        return {
            isRestDay: true,
            dayName: todayName,
            exercises: []
        };
    }, [activeRoutine]);

    const { last30Days, localStreak, isTodayLogged } = useMemo(() => {
        const days = [];

        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            days.push(getLocalDateStr(date));
        }

        const todayLogged = (consistency[todayStr] || 0) > 0;

        let streak = 0;
        const checkFrom = todayLogged ? 0 : 1;
        for (let i = checkFrom; i < 365; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = getLocalDateStr(date);
            if ((consistency[dateStr] || 0) > 0) {
                streak++;
            } else {
                break;
            }
        }

        return { last30Days: days, localStreak: streak, isTodayLogged: todayLogged };
    }, [consistency, todayStr]);

    // Memoizar heatmap de 365 días
    const yearHeatmap = useMemo(() => {
        if (!showHeatmap) return null;

        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31);
        const today = new Date();
        const weeks = [];
        let currentDate = new Date(startOfYear);

        while (currentDate <= endOfYear) {
            const week = [];
            for (let d = 0; d < 7; d++) {
                if (currentDate.getFullYear() === year) {
                    const dateStr = getLocalDateStr(new Date(currentDate));
                    const isFuture = currentDate > today;
                    week.push({ date: dateStr, isFuture });
                } else {
                    week.push(null);
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
            weeks.push(week);
        }

        return weeks;
    }, [showHeatmap]);

    const handleLogRest = async () => {
        if (loggingRest) return;
        setLoggingRest(true);

        try {
            await api.logRestDay();

            setConsistency(prev => ({
                ...prev,
                [todayStr]: (prev[todayStr] || 0) + 1
            }));

            const statsData = await api.getOverviewStats();
            setStats(statsData);
        } catch (error) {
            console.error('Failed to log rest:', error);
        } finally {
            setLoggingRest(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const statsCards = [
        { icon: Flame, value: localStreak, label: 'Racha', colorClass: 'text-orange-500', delay: 0 },
        { icon: Target, value: stats?.totalWorkouts || 0, label: 'Sesiones', colorClass: 'text-cyan-400', delay: 50 },
        { icon: Trophy, value: stats?.totalPRs || 0, label: 'PRs', colorClass: 'text-yellow-500', delay: 100 },
        { icon: Calendar, value: stats?.trainingDaysLast30 || 0, label: 'Mes', colorClass: 'text-green-500', delay: 150 }
    ];

    return (
        <div className="space-y-6 animate-fade-in max-w-lg md:max-w-2xl mx-auto pb-4">
            {/* Header */}
            <div className="pt-2 px-1">
                <p className="text-[var(--text-secondary)] text-sm">
                    Bienvenido de nuevo{user?.firstName ? `, ${user.firstName}` : ''}
                </p>
                <h1 className="text-2xl font-bold mt-1">
                    ¡A entrenar! 💪
                </h1>
            </div>

            {/* Active Routine Card - Hero */}
            {activeRoutine ? (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-900 p-6 shadow-lg">
                    {/* Overlay para mejor contraste */}
                    <div className="absolute inset-0 bg-black/10" />

                    {/* Burbujas decorativas mejoradas */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/15 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />

                    <div className="relative z-10">
                        <p className="text-white/80 text-xs font-semibold tracking-wider mb-1">RUTINA ACTIVA</p>
                        <h2 className="text-xl font-bold text-white mb-4">{activeRoutine.name}</h2>

                        {nextDay && (
                            <>
                                {nextDay.isRestDay ? (
                                    <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/10">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="text-white/70 text-xs font-medium">HOY</p>
                                                <p className="text-white font-semibold flex items-center gap-2 mt-1">
                                                    <Coffee size={18} /> Día de Descanso
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
                                                            <span>Confirmar Descanso</span>
                                                            <span className="text-xs opacity-70">+1 a tu racha</span>
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
                                        className="flex items-center justify-between bg-white/20 backdrop-blur-md rounded-xl p-4 hover:bg-white/30 active:scale-[0.98] transition-all border border-white/10"
                                    >
                                        <div>
                                            <p className="text-white/70 text-xs font-medium">SIGUIENTE SESIÓN</p>
                                            <p className="text-white font-bold text-lg mt-1">{nextDay.dayName}</p>
                                            <p className="text-white/80 text-sm">{nextDay.exercises?.length} ejercicios</p>
                                        </div>
                                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-xl">
                                            <Play size={22} className="text-[var(--primary)] ml-1" fill="currentColor" />
                                        </div>
                                    </Link>
                                )}
                            </>
                        )}
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
                            <span>Explorar Rutinas</span>
                            <ArrowRight size={16} />
                        </div>
                    </div>
                </Link>
            )}

            {/* Stats Grid - Con animación stagger */}
            <div className="grid grid-cols-4 gap-3">
                {statsCards.map(({ icon: Icon, value, label, colorClass, delay }, i) => (
                    <div
                        key={i}
                        className="bg-[var(--bg-card)] rounded-xl p-3 text-center hover:bg-[var(--bg-card-hover)] transition-all animate-fade-in border border-[var(--border)]"
                        style={{ animationDelay: `${delay}ms` }}
                    >
                        <Icon size={20} className={`mx-auto ${colorClass} mb-1.5`} />
                        <p className="text-xl font-bold">{value}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Consistency Calendar */}
            <div className="bg-[var(--bg-card)] rounded-xl p-4">
                <button
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className="w-full flex items-center justify-between mb-4 hover:opacity-80 transition-opacity"
                >
                    <span className="font-semibold flex items-center gap-2">
                        <TrendingUp size={18} className="text-[var(--primary)]" />
                        Constancia
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">
                            {showHeatmap ? '365 días' : '30 días'}
                        </span>
                        <ChevronRight
                            size={18}
                            className={`text-[var(--text-secondary)] transition-transform ${showHeatmap ? 'rotate-90' : ''}`}
                        />
                    </div>
                </button>

                {/* 30-day mini heatmap */}
                <div className="grid grid-cols-10 gap-1.5">
                    {last30Days.map((date, i) => {
                        const count = consistency[date] || 0;
                        const intensity = count === 0 ? 0 : Math.min(count, 3);
                        const bgColors = [
                            'bg-[var(--border)]',
                            'bg-green-900',
                            'bg-green-600',
                            'bg-green-400'
                        ];
                        return (
                            <div
                                key={i}
                                role="gridcell"
                                aria-label={`${date}: ${count ? count + ' ejercicios' : 'Sin actividad'}`}
                                className={`aspect-square rounded-sm ${bgColors[intensity]} hover:ring-2 hover:ring-[var(--primary)] transition-all cursor-pointer`}
                                title={`${date}: ${count ? count + ' ejercicios' : 'Descanso'}`}
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
                            {/* Fade edges */}
                            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />
                            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />

                            {/* Scroll hint */}
                            <p className="text-xs text-[var(--text-secondary)] mb-2 text-center">
                                Desliza para ver todo el año →
                            </p>

                            <div className="flex gap-[2px] overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent" ref={heatmapRef}>
                                <div className="flex flex-col gap-[2px] shrink-0 text-[9px] text-[var(--text-secondary)] mr-1.5">
                                    {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d, i) => (
                                        <div key={i} className="h-[11px] flex items-center justify-center w-3">
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
                                            const intensity = count === 0 ? 0 : Math.min(count, 3);
                                            const bgColors = [
                                                'bg-[var(--border)]',
                                                'bg-green-900',
                                                'bg-green-600',
                                                'bg-green-400'
                                            ];
                                            return (
                                                <div
                                                    key={di}
                                                    role="gridcell"
                                                    aria-label={`${date}: ${isFuture ? 'Futuro' : count ? count + ' ejercicios' : 'Sin actividad'}`}
                                                    className={`w-[11px] h-[11px] rounded-[2px] ${isFuture ? 'bg-[var(--bg-dark)] opacity-30' : bgColors[intensity]} hover:ring-1 hover:ring-[var(--primary)] transition-all cursor-pointer`}
                                                    title={`${date}: ${isFuture ? 'Futuro' : count ? count + ' ejercicios' : 'Sin actividad'}`}
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 text-[10px] text-[var(--text-secondary)]">
                            <span>1 Enero {new Date().getFullYear()}</span>
                            <div className="flex items-center gap-1.5">
                                <span>Menos</span>
                                {['bg-[var(--border)]', 'bg-green-900', 'bg-green-600', 'bg-green-400'].map((c, i) => (
                                    <div key={i} className={`w-[11px] h-[11px] rounded-[2px] ${c}`} />
                                ))}
                                <span>Más</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
                <Link
                    to="/routines"
                    className="bg-[var(--bg-card)] rounded-xl p-4 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] active:scale-[0.98] transition-all border border-[var(--border)] hover:border-[var(--primary)]/30"
                >
                    <div className="w-11 h-11 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
                        <Dumbbell size={20} className="text-[var(--primary)]" />
                    </div>
                    <div className="overflow-hidden">
                        <p className="font-semibold text-sm">Rutinas</p>
                        <p className="text-xs text-[var(--text-secondary)] truncate">
                            {stats?.totalRoutines || 0} guardadas
                        </p>
                    </div>
                </Link>

                <Link
                    to="/progress"
                    className="bg-[var(--bg-card)] rounded-xl p-4 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] active:scale-[0.98] transition-all border border-[var(--border)] hover:border-green-500/30"
                >
                    <div className="w-11 h-11 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                        <TrendingUp size={20} className="text-green-500" />
                    </div>
                    <div className="overflow-hidden">
                        <p className="font-semibold text-sm">Progreso</p>
                        <p className="text-xs text-[var(--text-secondary)] truncate">Ver evolución</p>
                    </div>
                </Link>
            </div>
        </div>
    );
}