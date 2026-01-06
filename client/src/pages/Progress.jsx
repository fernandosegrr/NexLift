import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    TrendingUp, Calendar, Trophy, Dumbbell,
    ChevronDown, ChevronRight, Activity, CheckCircle, Search, FileText, Loader2
} from 'lucide-react';

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts';
import { api } from '../services/api';

// ==========================================
// MUSCLE CLASSIFICATION CONSTANTS
// ==========================================
const MUSCLE_KEYWORDS = {
    'Pecho': ['press', 'aperturas', 'fondos', 'peck', 'crossover', 'contractor'],
    'Espalda': ['dominadas', 'remo', 'jalon', 'jalón', 'pullover', 'face pull', 't-bar'],
    'Hombros': ['press militar', 'elevaciones', 'laterales', 'frontales', 'pajaros', 'pájaros', 'arnold', 'cruces'],
    'Bíceps': ['curl', 'martillo', 'predicador', 'bayesian', 'copa'],
    'Tríceps': ['extensión', 'extension', 'francés', 'frances', 'fondos', 'patada'],
    'Piernas': ['sentadilla', 'prensa', 'hack', 'extensiones', 'femoral', 'zancadas', 'hip thrust', 'aductores', 'gemelo', 'cuádriceps', 'cuadriceps', 'peso muerto'],
    'Core': ['plancha', 'crunch', 'abdominales', 'rueda', 'hanging']
};

/**
 * Determines muscle group based on exercise name or database value
 * @param {string} exerciseName - Name of the exercise
 * @param {string} dbMuscle - Muscle group from database (takes priority)
 * @returns {string} Muscle group classification
 */
function getMuscleGroup(exerciseName, dbMuscle) {
    if (dbMuscle) return dbMuscle;
    const name = exerciseName.toLowerCase();
    for (const [group, keywords] of Object.entries(MUSCLE_KEYWORDS)) {
        if (keywords.some(k => name.includes(k))) return group;
    }
    return 'Otros';
}

/**
 * Safely converts Date object to YYYY-MM-DD string in local timezone
 * @param {Date} dateObj - Date object to convert
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function getLocalDateStr(dateObj) {
    return dateObj.toLocaleDateString('en-CA');
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function Progress() {
    // Data State
    const [stats, setStats] = useState(null);
    const [consistency, setConsistency] = useState({});
    const [prs, setPRs] = useState([]);
    const [exercises, setExercises] = useState([]);
    const [exerciseProgress, setExerciseProgress] = useState([]);

    // UI State
    const [selectedExercise, setSelectedExercise] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [prSearch, setPrSearch] = useState('');
    const [showAllPRs, setShowAllPRs] = useState(false);
    const [exerciseSearch, setExerciseSearch] = useState('');
    const [showMuscleDropdown, setShowMuscleDropdown] = useState(false);
    const [expandedMuscle, setExpandedMuscle] = useState(null);

    // Refs
    const dropdownRef = useRef(null);

    // Dynamic years based on actual data
    const years = useMemo(() => {
        if (Object.keys(consistency).length === 0) {
            return [new Date().getFullYear()];
        }

        const yearsWithData = Object.keys(consistency)
            .map(dateStr => parseInt(dateStr.split('-')[0]))
            .filter((year, index, arr) => arr.indexOf(year) === index)
            .sort((a, b) => b - a);

        const currentYear = new Date().getFullYear();

        if (!yearsWithData.includes(currentYear)) {
            yearsWithData.unshift(currentYear);
        }

        return yearsWithData.slice(0, 5);
    }, [consistency]);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowMuscleDropdown(false);
                setExpandedMuscle(null);
            }
        }

        if (showMuscleDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showMuscleDropdown]);

    // Fetch all data on mount with cleanup
    useEffect(() => {
        let isMounted = true;

        async function fetchAllData() {
            try {
                const [statsData, consistencyRes, prsData, routinesData] = await Promise.all([
                    api.getOverviewStats(),
                    api.getConsistency(),
                    api.getPersonalRecords(),
                    api.getRoutines()
                ]);

                if (!isMounted) return;

                setStats(statsData);

                // Process consistency events into date map
                const map = {};
                if (consistencyRes.events) {
                    consistencyRes.events.forEach(dateStr => {
                        const localDate = getLocalDateStr(new Date(dateStr));
                        map[localDate] = (map[localDate] || 0) + 1;
                    });
                } else {
                    Object.assign(map, consistencyRes);
                }
                setConsistency(map);
                setPRs(prsData);

                // Extract unique exercises from all routines
                const allExercises = [];
                const seen = new Set();
                routinesData.forEach(r => r.days.forEach(d => {
                    d.exercises.forEach(e => {
                        if (!seen.has(e.name)) {
                            allExercises.push({ name: e.name, muscleGroup: e.muscleGroup });
                            seen.add(e.name);
                        }
                    });
                }));
                setExercises(allExercises);

                // Auto-select first exercise if none selected
                if (allExercises.length > 0 && !selectedExercise) {
                    setSelectedExercise(allExercises[0].name);
                }
            } catch (error) {
                if (isMounted) {
                    console.error('Error fetching data:', error);
                    // TODO: toast.error('Error al cargar datos. Intenta recargar.')
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        fetchAllData();

        return () => {
            isMounted = false;
        };
    }, []);

    // Fetch exercise progress with abort controller
    useEffect(() => {
        if (!selectedExercise) return;

        const abortController = new AbortController();
        setLoadingProgress(true);

        async function fetchProgress() {
            try {
                const data = await api.getExerciseProgress(selectedExercise);

                if (abortController.signal.aborted) return;

                setExerciseProgress(data.map(d => ({
                    ...d,
                    displayDate: new Date(d.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
                    fullDate: new Date(d.date).toLocaleDateString('es-ES')
                })));
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Error fetching exercise progress:', error);
                // TODO: toast.error('Error al cargar progreso del ejercicio')
            } finally {
                if (!abortController.signal.aborted) {
                    setLoadingProgress(false);
                }
            }
        }

        fetchProgress();

        return () => {
            abortController.abort();
        };
    }, [selectedExercise]);

    // ==========================================
    // MEMOIZED CALCULATIONS
    // ==========================================

    /**
     * Groups exercises by muscle group for organized display
     */
    const exercisesByMuscle = useMemo(() => {
        return exercises.reduce((acc, ex) => {
            const muscle = getMuscleGroup(ex.name, ex.muscleGroup);
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});
    }, [exercises]);

    /**
     * Filters exercises by search query
     */
    const filteredExercisesByMuscle = useMemo(() => {
        if (!exerciseSearch) return exercisesByMuscle;

        return Object.entries(exercisesByMuscle).reduce((acc, [muscle, exs]) => {
            const filtered = exs.filter(e =>
                e.name.toLowerCase().includes(exerciseSearch.toLowerCase())
            );
            if (filtered.length > 0) acc[muscle] = filtered;
            return acc;
        }, {});
    }, [exercisesByMuscle, exerciseSearch]);

    /**
     * Groups personal records by muscle group
     */
    const prsByMuscle = useMemo(() => {
        return prs.reduce((acc, pr) => {
            const muscle = getMuscleGroup(pr.exerciseName, null);
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(pr);
            return acc;
        }, {});
    }, [prs]);

    /**
     * Filters PRs based on search query or shows configurable amount
     */
    const displayedPRs = useMemo(() => {
        const filtered = prSearch
            ? prs.filter(pr => pr.exerciseName.toLowerCase().includes(prSearch.toLowerCase()))
            : prs;

        return showAllPRs ? filtered : filtered.slice(0, 5);
    }, [prs, prSearch, showAllPRs]);

    /**
     * Calculates compliance statistics for last 30 days
     */
    const compliance = useMemo(() => {
        const today = new Date();
        const last30Days = Array.from({ length: 30 }, (_, i) => {
            const date = new Date(today);
            date.setDate(date.getDate() - (29 - i));
            const dateStr = getLocalDateStr(date);
            return { date: dateStr, hasWorkout: (consistency[dateStr] || 0) > 0 };
        });

        const daysWithWorkout = last30Days.reduce(
            (sum, d) => sum + (d.hasWorkout ? 1 : 0),
            0
        );

        return {
            daysWithWorkout,
            complianceRate: Math.round((daysWithWorkout / 30) * 100),
            last30Days
        };
    }, [consistency]);

    /**
     * Weekly data calculation with timezone-safe date comparisons
     */
    const weeklyData = useMemo(() => {
        const weeks = [];
        const yearStart = new Date(selectedYear, 0, 1);
        const today = new Date();

        if (selectedYear > today.getFullYear()) return [];

        for (let w = 0; w < 52; w++) {
            const weekStart = new Date(yearStart);
            weekStart.setDate(weekStart.getDate() + (w * 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            if (selectedYear === today.getFullYear() && weekStart > today) break;

            const weekStartStr = getLocalDateStr(weekStart);
            const weekEndStr = getLocalDateStr(weekEnd);

            let count = 0;
            Object.keys(consistency).forEach(dateStr => {
                if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
                    count += consistency[dateStr];
                }
            });

            weeks.push({ week: `S${w + 1}`, sessions: count });
        }
        return weeks;
    }, [consistency, selectedYear]);

    /**
     * Handles exercise selection from dropdown
     * @param {string} name - Exercise name
     */
    function selectExercise(name) {
        setSelectedExercise(name);
        setShowMuscleDropdown(false);
        setExpandedMuscle(null);
        setExerciseSearch('');
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-lg mx-auto pb-20">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Progreso</h1>
                    <p className="text-[var(--text-secondary)] text-sm">Tu evolución fitness</p>
                </div>
                <Link
                    to="/export"
                    className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] px-4 py-2 rounded-lg text-sm hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all active:scale-95"
                >
                    <FileText size={16} />
                    <span>PDF</span>
                </Link>
            </div>

            {/* Tabs */}
            <div role="tablist" className="flex gap-1 bg-[var(--bg-card)] p-1 rounded-xl">
                {[
                    { id: 'overview', label: 'General', icon: Activity },
                    { id: 'muscles', label: 'Músculos', icon: Dumbbell },
                    { id: 'yearly', label: 'Anual', icon: Calendar }
                ].map(tab => (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        aria-controls={`${tab.id}-panel`}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${activeTab === tab.id
                            ? 'bg-[var(--primary)] text-white shadow-lg'
                            : 'text-[var(--text-secondary)] hover:text-white'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div id="overview-panel" role="tabpanel" className="space-y-5 animate-fade-in">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 text-center hover:bg-[var(--bg-card-hover)] transition-colors">
                            <TrendingUp size={20} className="mx-auto text-[var(--primary)] mb-2" />
                            <p className="text-xl font-bold">{stats?.totalWorkouts || 0}</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">Sesiones</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 text-center hover:bg-[var(--bg-card-hover)] transition-colors">
                            <Trophy size={20} className="mx-auto text-yellow-500 mb-2" />
                            <p className="text-xl font-bold">{prs.length}</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">PRs</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 text-center hover:bg-[var(--bg-card-hover)] transition-colors">
                            <CheckCircle size={20} className="mx-auto text-green-500 mb-2" />
                            <p className="text-xl font-bold">{compliance.complianceRate}%</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">Cumplimiento</p>
                        </div>
                    </div>

                    {/* Compliance Card */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <Calendar size={18} className="text-[var(--primary)]" />
                            Asistencia (últimos 30 días)
                        </h3>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1">
                                <div className="flex justify-between text-xs mb-2">
                                    <span className="text-[var(--text-secondary)]">Días entrenados</span>
                                    <span className="font-bold">{compliance.daysWithWorkout}/30</span>
                                </div>
                                <div className="h-2.5 bg-[var(--bg-dark)] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[var(--primary)] to-green-500 rounded-full transition-all duration-500"
                                        style={{ width: `${compliance.complianceRate}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                        {/* Mini calendar */}
                        <div className="grid grid-cols-10 gap-1.5">
                            {compliance.last30Days.map((day, i) => (
                                <div
                                    key={i}
                                    role="gridcell"
                                    aria-label={`${day.date}: ${day.hasWorkout ? 'Entrenado' : 'Sin entrenar'}`}
                                    title={day.date}
                                    className={`w-full aspect-square rounded-sm transition-all hover:scale-110 cursor-pointer ${day.hasWorkout
                                        ? 'bg-green-500'
                                        : 'bg-[var(--bg-dark)]'
                                        }`}
                                />
                            ))}
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-2">
                            <span>Hace 30 días</span>
                            <span>Hoy</span>
                        </div>
                    </div>

                    {/* Exercise Progress with Muscle Dropdown */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <TrendingUp size={18} className="text-[var(--primary)]" />
                                Progreso por Ejercicio
                            </h3>
                        </div>

                        {/* Muscle Dropdown Button */}
                        <div ref={dropdownRef}>
                            <button
                                onClick={() => setShowMuscleDropdown(!showMuscleDropdown)}
                                aria-expanded={showMuscleDropdown}
                                aria-haspopup="listbox"
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-4 py-3 mb-3 flex items-center justify-between text-left hover:border-[var(--primary)]/50 transition-all"
                            >
                                <span className="text-sm font-medium truncate pr-2">
                                    {selectedExercise || 'Seleccionar ejercicio'}
                                </span>
                                <ChevronDown size={18} className={`text-[var(--text-secondary)] shrink-0 transition-transform ${showMuscleDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Content */}
                            {showMuscleDropdown && (
                                <div className="bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg mb-3 max-h-80 overflow-hidden animate-fade-in z-10 relative">
                                    {/* Search Input */}
                                    <div className="sticky top-0 bg-[var(--bg-dark)] border-b border-[var(--border)] p-2">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                                            <input
                                                type="text"
                                                placeholder="Buscar ejercicio..."
                                                value={exerciseSearch}
                                                onChange={(e) => setExerciseSearch(e.target.value)}
                                                className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    </div>

                                    {/* Scrollable content */}
                                    <div className="overflow-y-auto max-h-60">
                                        {Object.entries(filteredExercisesByMuscle).map(([muscle, muscleExercises]) => (
                                            <div key={muscle}>
                                                <button
                                                    onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                                                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--border)] transition-colors border-b border-[var(--border)]"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Dumbbell size={16} className="text-[var(--primary)]" />
                                                        <span className="text-sm font-semibold">{muscle}</span>
                                                        <span className="text-xs text-[var(--text-secondary)]">({muscleExercises.length})</span>
                                                    </div>
                                                    {expandedMuscle === muscle ? (
                                                        <ChevronDown size={16} className="text-[var(--text-secondary)]" />
                                                    ) : (
                                                        <ChevronRight size={16} className="text-[var(--text-secondary)]" />
                                                    )}
                                                </button>

                                                {expandedMuscle === muscle && (
                                                    <div className="bg-[var(--bg-card)]/50">
                                                        {muscleExercises.map(ex => (
                                                            <button
                                                                key={ex.name}
                                                                onClick={() => selectExercise(ex.name)}
                                                                className={`w-full text-left px-8 py-2.5 text-sm transition-all border-b border-[var(--border)] ${selectedExercise === ex.name
                                                                    ? 'bg-[var(--primary)]/20 text-[var(--primary)] font-medium'
                                                                    : 'text-[var(--text-secondary)] hover:bg-[var(--border)] hover:text-white'
                                                                    }`}
                                                            >
                                                                {ex.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {Object.keys(filteredExercisesByMuscle).length === 0 && (
                                            <p className="text-center text-[var(--text-secondary)] text-sm py-8">
                                                No se encontraron ejercicios
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Chart */}
                        {loadingProgress ? (
                            <div className="h-48 flex items-center justify-center bg-[var(--bg-dark)] rounded-lg">
                                <Loader2 size={24} className="text-[var(--primary)] animate-spin" />
                            </div>
                        ) : exerciseProgress.length > 0 ? (
                            <div className="h-48 mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={exerciseProgress}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                        <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} domain={['auto', 'auto']} width={35} />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.[0]) return null;
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 shadow-xl">
                                                        <p className="text-xs text-[var(--text-secondary)] mb-1">{data.fullDate}</p>
                                                        <p className="font-bold text-[var(--primary)] text-base">{data.maxWeight} kg</p>
                                                        {data.totalSets && (
                                                            <p className="text-xs text-[var(--text-secondary)] mt-1">
                                                                {data.totalSets} series • {data.totalReps} reps
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="maxWeight"
                                            stroke="#8b5cf6"
                                            strokeWidth={3}
                                            dot={{ fill: '#8b5cf6', r: 4 }}
                                            name="Peso Máx"
                                            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <p className="text-center text-[var(--text-secondary)] py-12 text-sm bg-[var(--bg-dark)] rounded-lg">
                                {selectedExercise ? 'Sin datos suficientes para gráfica' : 'Selecciona un ejercicio'}
                            </p>
                        )}
                    </div>

                    {/* Recent PRs / Search PRs */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                            <Trophy size={18} className="text-yellow-500" />
                            Récords Personales
                        </h3>

                        {/* PR Search Input */}
                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                placeholder="Buscar ejercicio..."
                                value={prSearch}
                                onChange={(e) => setPrSearch(e.target.value)}
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                            />
                        </div>

                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {displayedPRs.map((pr, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between bg-[var(--bg-dark)] rounded-lg p-3 border border-[var(--border)] hover:border-[var(--primary)]/50 transition-all"
                                >
                                    <span className="text-sm font-medium text-white truncate pr-3">{pr.exerciseName}</span>
                                    <div className="text-right shrink-0">
                                        <span className="text-sm font-bold block text-[var(--primary)]">{pr.weight}kg × {pr.reps}</span>
                                        <span className="text-xs text-[var(--text-secondary)]">
                                            {new Date(pr.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {displayedPRs.length === 0 && (
                                <p className="text-center text-[var(--text-secondary)] text-sm py-8">
                                    {prSearch ? 'No se encontraron ejercicios' : 'Aún no hay PRs'}
                                </p>
                            )}
                        </div>

                        {/* Show All Button */}
                        {!prSearch && prs.length > 5 && (
                            <button
                                onClick={() => setShowAllPRs(!showAllPRs)}
                                className="w-full mt-3 py-2 text-xs text-[var(--primary)] hover:text-[var(--primary)]/80 font-medium transition-colors"
                            >
                                {showAllPRs ? 'Ver menos' : `Ver todos (${prs.length})`}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Muscles Tab */}
            {activeTab === 'muscles' && (
                <div id="muscles-panel" role="tabpanel" className="space-y-3 animate-fade-in">
                    {Object.entries(prsByMuscle).map(([muscle, musclePs]) => (
                        <MuscleAccordion
                            key={muscle}
                            muscle={muscle}
                            exercises={musclePs}
                            onSelectExercise={(name) => {
                                setSelectedExercise(name);
                                setActiveTab('overview');
                            }}
                        />
                    ))}
                    {Object.keys(prsByMuscle).length === 0 && (
                        <div className="bg-[var(--bg-card)] rounded-xl p-12 text-center">
                            <Dumbbell size={40} className="mx-auto text-[var(--text-secondary)] mb-3 opacity-50" />
                            <p className="text-sm text-[var(--text-secondary)]">
                                Entrena para ver tu progreso por músculo
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Yearly Tab */}
            {activeTab === 'yearly' && (
                <div id="yearly-panel" role="tabpanel" className="animate-fade-in space-y-5">
                    {/* Year Selector */}
                    <div className="flex gap-2 justify-center bg-[var(--bg-card)] p-2 rounded-xl">
                        {years.map(year => (
                            <button
                                key={year}
                                onClick={() => setSelectedYear(year)}
                                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selectedYear === year
                                    ? 'bg-[var(--primary)] text-white shadow-lg scale-105'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-white'
                                    }`}
                            >
                                {year}
                            </button>
                        ))}
                    </div>

                    {/* Year Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[var(--bg-card)] rounded-xl p-5 text-center hover:bg-[var(--bg-card-hover)] transition-colors">
                            <Calendar size={24} className="mx-auto text-[var(--primary)] mb-3" />
                            <p className="text-3xl font-bold">
                                {Object.keys(consistency).filter(d => d.startsWith(String(selectedYear))).length}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)] mt-2">Días entrenados</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-5 text-center hover:bg-[var(--bg-card-hover)] transition-colors">
                            <Activity size={24} className="mx-auto text-green-500 mb-3" />
                            <p className="text-3xl font-bold">
                                {Object.entries(consistency)
                                    .filter(([d]) => d.startsWith(String(selectedYear)))
                                    .reduce((sum, [, count]) => sum + count, 0)}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)] mt-2">Ejercicios totales</p>
                        </div>
                    </div>

                    {/* Weekly Chart */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <h3 className="font-semibold text-sm mb-4">Sesiones por Semana - {selectedYear}</h3>
                        <div className="h-48">
                            {weeklyData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weeklyData}>
                                        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#a1a1aa' }} interval={3} />
                                        <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} width={30} />
                                        <Tooltip
                                            contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                                            cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                                        />
                                        <Bar dataKey="sessions" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Sesiones" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-sm">
                                    Aún no hay datos para este año
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Year Comparison */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <h3 className="font-semibold text-sm mb-4">Comparativa Anual</h3>
                        <div className="space-y-4">
                            {years.map(year => {
                                const yearDays = Object.keys(consistency).filter(d => d.startsWith(String(year))).length;
                                const maxDays = Math.max(...years.map(y =>
                                    Object.keys(consistency).filter(d => d.startsWith(String(y))).length
                                )) || 1;

                                if (year > new Date().getFullYear()) return null;

                                return (
                                    <div key={year} className="flex items-center gap-3">
                                        <span className="text-sm w-14 font-mono font-semibold">{year}</span>
                                        <div className="flex-1 bg-[var(--bg-dark)] rounded-full h-4 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-400 rounded-full transition-all duration-500"
                                                style={{ width: `${(yearDays / maxDays) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-bold w-10 text-right">{yearDays}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==========================================
// MUSCLE ACCORDION COMPONENT
// ==========================================
/**
 * Expandable accordion for displaying exercises grouped by muscle
 * @param {string} muscle - Muscle group name
 * @param {Array} exercises - Array of exercise PRs for this muscle
 * @param {Function} onSelectExercise - Callback when exercise is selected
 */
function MuscleAccordion({ muscle, exercises, onSelectExercise }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
            <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-controls={`muscle-${muscle}`}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Dumbbell size={18} className="text-[var(--primary)]" />
                    <span className="font-semibold">{muscle}</span>
                    <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-2 py-1 rounded-full border border-[var(--border)]">
                        {exercises.length}
                    </span>
                </div>
                {expanded ? (
                    <ChevronDown size={18} className="text-[var(--text-secondary)]" />
                ) : (
                    <ChevronRight size={18} className="text-[var(--text-secondary)]" />
                )}
            </button>

            {expanded && (
                <div
                    id={`muscle-${muscle}`}
                    className="px-4 pb-4 space-y-2 animate-fade-in bg-[var(--bg-dark)]/30 border-t border-[var(--border)] pt-4"
                >
                    {exercises.map((pr, i) => (
                        <button
                            key={i}
                            onClick={() => onSelectExercise(pr.exerciseName)}
                            className="w-full flex items-center justify-between bg-[var(--bg-dark)] rounded-lg p-3 hover:border-[var(--primary)]/50 border border-transparent transition-all active:scale-95"
                        >
                            <span className="text-sm truncate pr-3">{pr.exerciseName}</span>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="font-bold text-sm text-[var(--primary)]">{pr.weight}kg × {pr.reps}</span>
                                <TrendingUp size={14} className="text-[var(--text-secondary)]" />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}