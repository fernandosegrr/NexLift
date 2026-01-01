import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Flame, Target, Trophy, Calendar, Play,
    ChevronRight, Dumbbell, TrendingUp, Coffee, CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [activeRoutine, setActiveRoutine] = useState(null);
    const [consistency, setConsistency] = useState({});
    const [loading, setLoading] = useState(true);
    const [showHeatmap, setShowHeatmap] = useState(false);

    // Helper to get local date string YYYY-MM-DD
    const getLocalDateStr = (dateObj) => {
        const offset = dateObj.getTimezoneOffset() * 60000;
        return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
    };

    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch basic stats and raw consistency events
                const [statsData, activeData, consistencyRes] = await Promise.all([
                    api.getOverviewStats(),
                    api.getActiveRoutine(),
                    api.getConsistency()
                ]);

                // Process raw events to local map for correct heatmap
                const map = {};
                if (consistencyRes.events) {
                    consistencyRes.events.forEach(dateStr => {
                        const localDate = getLocalDateStr(new Date(dateStr));
                        map[localDate] = (map[localDate] || 0) + 1;
                    });
                } else {
                    // Fallback for old API response style
                    Object.assign(map, consistencyRes);
                }

                setStats(statsData);
                setActiveRoutine(activeData);
                setConsistency(map);
            } catch (error) {
                console.error('Dashboard error:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Helper to map English/JS days to Spanish routine names
    const getTodayName = () => {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return days[new Date().getDay()];
    };

    const getNextDay = () => {
        if (!activeRoutine?.days?.length) return null;

        const todayName = getTodayName();
        // 1. Try to find today in routine
        const todayRoutineDay = activeRoutine.days.find(d =>
            d.dayName.toLowerCase().includes(todayName.toLowerCase()) ||
            todayName.toLowerCase().includes(d.dayName.toLowerCase())
        );

        if (todayRoutineDay) return todayRoutineDay;

        // 2. If today is NOT in routine, treat as Rest Day
        // But we need to structure it like a RoutineDay object for the UI
        return {
            isRestDay: true,
            dayName: todayName,
            exercises: []
        };
    };

    const nextDay = getNextDay();

    // Generate last 30 days for mini heatmap using LOCAL TIME keys
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        last30Days.push(getLocalDateStr(date));
    }

    const todayStr = getLocalDateStr(new Date());
    const isTodayLogged = consistency[todayStr] > 0;

    const handleLogRest = async () => {
        try {
            await api.logRestDay();
            const newConsistency = { ...consistency };
            newConsistency[todayStr] = (newConsistency[todayStr] || 0) + 1;
            setConsistency(newConsistency);
            const statsData = await api.getOverviewStats();
            setStats(statsData);
        } catch (error) {
            console.error('Failed to log rest:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto">
            {/* Header */}
            <div className="pt-2">
                <p className="text-[var(--text-secondary)] text-sm">Bienvenido de nuevo</p>
                <h1 className="text-2xl font-bold mt-1">
                    ¡A entrenar! 💪
                </h1>
            </div>

            {/* Active Routine Card - Hero */}
            {activeRoutine ? (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-900 p-5">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

                    <div className="relative z-10">
                        <p className="text-white/70 text-sm font-medium mb-1">RUTINA ACTIVA</p>
                        <h2 className="text-xl font-bold text-white mb-3">{activeRoutine.name}</h2>

                        {nextDay && (
                            <>
                                {nextDay.isRestDay ? (
                                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="text-white/80 text-xs">HOY</p>
                                                <p className="text-white font-semibold flex items-center gap-2">
                                                    <Coffee size={18} /> Día de Descanso
                                                </p>
                                            </div>
                                            {isTodayLogged && (
                                                <div className="bg-green-500/20 text-green-200 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                                                    <CheckCircle2 size={12} /> Completado
                                                </div>
                                            )}
                                        </div>

                                        {!isTodayLogged && (
                                            <button
                                                onClick={handleLogRest}
                                                className="w-full bg-white text-[var(--primary)] py-2 rounded-lg font-medium text-sm hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <CheckCircle2 size={16} /> Confirmar Descanso (+1 Racha)
                                            </button>
                                        )}

                                        {isTodayLogged && (
                                            <p className="text-white/60 text-xs text-center">
                                                ¡Disfruta tu recuperación! Mañana será otro día.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <Link
                                        to={`/workout/${nextDay.id}`}
                                        className="flex items-center justify-between bg-white/20 backdrop-blur-sm rounded-xl p-4 hover:bg-white/30 transition-colors"
                                    >
                                        <div>
                                            <p className="text-white/80 text-xs">SIGUIENTE SESIÓN</p>
                                            <p className="text-white font-semibold">{nextDay.dayName}</p>
                                            <p className="text-white/70 text-sm">{nextDay.exercises?.length} ejercicios</p>
                                        </div>
                                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
                                            <Play size={24} className="text-[var(--primary)] ml-1" fill="currentColor" />
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
                    className="block rounded-2xl bg-[var(--bg-card)] border-2 border-dashed border-[var(--border)] p-6 text-center hover:border-[var(--primary)] transition-colors"
                >
                    <Dumbbell size={32} className="mx-auto text-[var(--text-secondary)] mb-3" />
                    <p className="font-medium mb-1">Sin rutina activa</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Selecciona una rutina para comenzar
                    </p>
                </Link>
            )}

            {/* Stats Grid - Compact */}
            <div className="grid grid-cols-4 gap-2">
                <div className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
                    <Flame size={18} className="mx-auto text-orange-500 mb-1" />
                    <p className="text-lg font-bold">{stats?.currentStreak || 0}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">Racha</p>
                </div>
                <div className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
                    <Target size={18} className="mx-auto text-cyan-500 mb-1" />
                    <p className="text-lg font-bold">{stats?.totalWorkouts || 0}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">Sesiones</p>
                </div>
                <div className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
                    <Trophy size={18} className="mx-auto text-yellow-500 mb-1" />
                    <p className="text-lg font-bold">{stats?.totalPRs || 0}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">PRs</p>
                </div>
                <div className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
                    <Calendar size={18} className="mx-auto text-green-500 mb-1" />
                    <p className="text-lg font-bold">{stats?.trainingDaysLast30 || 0}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">Mes</p>
                </div>
            </div>

            {/* Mini Consistency - Expandable */}
            <div className="bg-[var(--bg-card)] rounded-xl p-4">
                <button
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className="w-full flex items-center justify-between"
                >
                    <span className="font-medium flex items-center gap-2">
                        <TrendingUp size={16} className="text-[var(--primary)]" />
                        Constancia
                    </span>
                    <ChevronRight
                        size={18}
                        className={`text-[var(--text-secondary)] transition-transform ${showHeatmap ? 'rotate-90' : ''}`}
                    />
                </button>

                {!showHeatmap && (
                    <div className="flex gap-[3px] mt-3 overflow-hidden">
                        {last30Days.slice(-14).map((date, i) => {
                            const count = consistency[date] || 0;
                            const intensity = count === 0 ? 0 : Math.min(count, 3);
                            const bgColors = [
                                'bg-[var(--border)]',
                                'bg-green-800',
                                'bg-green-600',
                                'bg-green-400'
                            ];
                            return (
                                <div key={i} className={`w-3 h-3 rounded-sm ${bgColors[intensity]}`} />
                            );
                        })}
                    </div>
                )}

                {showHeatmap && (
                    <div className="mt-4 animate-fade-in">
                        <div className="grid grid-cols-10 gap-1">
                            {last30Days.map((date, i) => {
                                const count = consistency[date] || 0;
                                const intensity = count === 0 ? 0 : Math.min(count, 3);
                                const bgColors = [
                                    'bg-[var(--border)]',
                                    'bg-green-800',
                                    'bg-green-600',
                                    'bg-green-400'
                                ];
                                return (
                                    <div
                                        key={i}
                                        className={`aspect-square rounded-sm ${bgColors[intensity]}`}
                                        title={`${date}: ${count ? count + ' ejercicios' : 'Descanso'}`}
                                    />
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[10px] text-[var(--text-secondary)]">
                            <span>Hace 30 días</span>
                            <span>Hoy</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
                <Link
                    to="/routines"
                    className="bg-[var(--bg-card)] rounded-xl p-4 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
                        <Dumbbell size={18} className="text-[var(--primary)]" />
                    </div>
                    <div>
                        <p className="font-medium text-sm">Rutinas</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                            {stats?.totalRoutines || 0} guardadas
                        </p>
                    </div>
                </Link>

                <Link
                    to="/progress"
                    className="bg-[var(--bg-card)] rounded-xl p-4 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                        <TrendingUp size={18} className="text-green-500" />
                    </div>
                    <div>
                        <p className="font-medium text-sm">Progreso</p>
                        <p className="text-xs text-[var(--text-secondary)]">Ver evolución</p>
                    </div>
                </Link>
            </div>
        </div>
    );
}
