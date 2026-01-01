import { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp, Calendar, Trophy, Dumbbell, Target,
    ChevronDown, ChevronRight, Activity, AlertCircle, CheckCircle, Search
} from 'lucide-react';

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts';
import { api } from '../services/api';

// Muscle groups for auto-classification
const MUSCLE_KEYWORDS = {
    'Pecho': ['press', 'aperturas', 'fondos', 'peck', 'crossover', 'contractor'],
    'Espalda': ['dominadas', 'remo', 'jalon', 'jalón', 'pullover', 'face pull', 't-bar'],
    'Hombros': ['press militar', 'elevaciones', 'laterales', 'frontales', 'pajaros', 'arnold', 'cruces'],
    'Bíceps': ['curl', 'martillo', 'predicador', 'bayesian', 'copa'],
    'Tríceps': ['extensión', 'extension', 'francés', 'frances', 'fondos', 'patada'],
    'Piernas': ['sentadilla', 'prensa', 'hack', 'extensiones', 'femoral', 'zancadas', 'hip thrust', 'aductores', 'gemelo', 'cuádriceps', 'peso muerto'],
    'Core': ['plancha', 'crunch', 'abdominales', 'rueda', 'hanging']
};

function getMuscleGroup(exerciseName, dbMuscle) {
    if (dbMuscle) return dbMuscle;
    const name = exerciseName.toLowerCase();
    for (const [group, keywords] of Object.entries(MUSCLE_KEYWORDS)) {
        if (keywords.some(k => name.includes(k))) return group;
    }
    return 'Otros';
}

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
    const [activeTab, setActiveTab] = useState('overview');
    const [prSearch, setPrSearch] = useState('');
    const [showMuscleDropdown, setShowMuscleDropdown] = useState(false);
    const [expandedMuscle, setExpandedMuscle] = useState(null);

    // Dynamic Years: Current year + next year
    const years = useMemo(() => {
        const current = new Date().getFullYear();
        return [current, current + 1];
    }, []);

    // Helper to get local date string YYYY-MM-DD safely
    const getLocalDateStr = (dateObj) => {
        return dateObj.toLocaleDateString('en-CA');
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    useEffect(() => {
        if (selectedExercise) {
            fetchExerciseProgress(selectedExercise);
        }
    }, [selectedExercise]);

    async function fetchAllData() {
        try {
            const [statsData, consistencyRes, prsData, routinesData] = await Promise.all([
                api.getOverviewStats(),
                api.getConsistency(),
                api.getPersonalRecords(),
                api.getRoutines()
            ]);

            setStats(statsData);

            // Process raw events to local map
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

            // Extract unique exercises
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

            if (allExercises.length > 0 && !selectedExercise) {
                setSelectedExercise(allExercises[0].name);
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchExerciseProgress(name) {
        try {
            const data = await api.getExerciseProgress(name);
            setExerciseProgress(data.map(d => ({
                ...d,
                displayDate: new Date(d.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
                fullDate: new Date(d.date).toLocaleDateString('es-ES')
            })));
        } catch (error) {
            console.error('Error:', error);
        }
    }

    // --- MEMOIZED CALCULATIONS (Performance Optimization) ---

    // 1. Group exercises by muscle
    const exercisesByMuscle = useMemo(() => {
        return exercises.reduce((acc, ex) => {
            const muscle = getMuscleGroup(ex.name, ex.muscleGroup);
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});
    }, [exercises]);

    // 2. Group PRs by muscle
    const prsByMuscle = useMemo(() => {
        return prs.reduce((acc, pr) => {
            const muscle = getMuscleGroup(pr.exerciseName, null);
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(pr);
            return acc;
        }, {});
    }, [prs]);

    // 3. Filter PRs
    const filteredPRs = useMemo(() => {
        return prSearch
            ? prs.filter(pr => pr.exerciseName.toLowerCase().includes(prSearch.toLowerCase()))
            : prs.slice(0, 5);
    }, [prs, prSearch]);

    // 4. Compliance Stats
    const compliance = useMemo(() => {
        const today = new Date();
        const last30Days = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = getLocalDateStr(date);
            const hasWorkout = (consistency[dateStr] || 0) > 0;
            last30Days.push({ date: dateStr, hasWorkout });
        }

        const daysWithWorkout = last30Days.filter(d => d.hasWorkout).length;
        const complianceRate = Math.round((daysWithWorkout / 30) * 100);

        return { daysWithWorkout, complianceRate, last30Days };
    }, [consistency]);

    // 5. Weekly Data for Chart
    const weeklyData = useMemo(() => {
        const weeks = [];
        const yearStart = new Date(selectedYear, 0, 1);
        const today = new Date();

        // Si el año seleccionado es futuro, no mostramos nada
        if (selectedYear > today.getFullYear()) return [];

        for (let w = 0; w < 52; w++) {
            const weekStart = new Date(yearStart);
            weekStart.setDate(weekStart.getDate() + (w * 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            // Stop if we are past today in the current year
            if (selectedYear === today.getFullYear() && weekStart > today) break;

            let count = 0;
            Object.keys(consistency).forEach(dateStr => {
                const date = new Date(dateStr);
                if (date >= weekStart && date <= weekEnd) {
                    count += consistency[dateStr];
                }
            });

            weeks.push({ week: `S${w + 1}`, sessions: count });
        }
        return weeks;
    }, [consistency, selectedYear]);


    function selectExercise(name) {
        setSelectedExercise(name);
        setShowMuscleDropdown(false);
        setExpandedMuscle(null);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">Progreso</h1>
                <p className="text-[var(--text-secondary)] text-sm">Tu evolución fitness</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[var(--bg-card)] p-1 rounded-xl">
                {[
                    { id: 'overview', label: 'General', icon: Activity },
                    { id: 'muscles', label: 'Músculos', icon: Dumbbell },
                    { id: 'yearly', label: 'Anual', icon: Calendar }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${activeTab === tab.id
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--text-secondary)]'
                            }`}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <>
                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
                            <TrendingUp size={18} className="mx-auto text-[var(--primary)] mb-1" />
                            <p className="text-lg font-bold">{stats?.totalWorkouts || 0}</p>
                            <p className="text-[10px] text-[var(--text-secondary)]">Sesiones</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
                            <Trophy size={18} className="mx-auto text-yellow-500 mb-1" />
                            <p className="text-lg font-bold">{prs.length}</p>
                            <p className="text-[10px] text-[var(--text-secondary)]">PRs</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
                            <CheckCircle size={18} className="mx-auto text-green-500 mb-1" />
                            <p className="text-lg font-bold">{compliance.complianceRate}%</p>
                            <p className="text-[10px] text-[var(--text-secondary)]">Cumplimiento</p>
                        </div>
                    </div>

                    {/* Compliance Card */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                            <Calendar size={16} className="text-[var(--primary)]" />
                            Asistencia (últimos 30 días)
                        </h3>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-[var(--text-secondary)]">Días entrenados</span>
                                    <span className="font-bold">{compliance.daysWithWorkout}/30</span>
                                </div>
                                <div className="h-2 bg-[var(--bg-dark)] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--success)] rounded-full transition-all"
                                        style={{ width: `${compliance.complianceRate}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                        {/* Mini calendar */}
                        <div className="grid grid-cols-10 gap-1">
                            {compliance.last30Days.map((day, i) => (
                                <div
                                    key={i}
                                    title={day.date}
                                    className={`w-full aspect-square rounded-sm ${day.hasWorkout
                                        ? 'bg-[var(--success)]'
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
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-sm flex items-center gap-2">
                                <TrendingUp size={16} className="text-[var(--primary)]" />
                                Progreso por Ejercicio
                            </h3>
                        </div>

                        {/* Muscle Dropdown Button */}
                        <button
                            onClick={() => setShowMuscleDropdown(!showMuscleDropdown)}
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-3 mb-3 flex items-center justify-between text-left"
                        >
                            <span className="text-sm font-medium truncate pr-2">
                                {selectedExercise || 'Seleccionar ejercicio'}
                            </span>
                            <ChevronDown size={18} className={`text-[var(--text-secondary)] shrink-0 transition-transform ${showMuscleDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown Content */}
                        {showMuscleDropdown && (
                            <div className="bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg mb-3 max-h-64 overflow-y-auto animate-fade-in z-10 relative">
                                {Object.entries(exercisesByMuscle).map(([muscle, muscleExercises]) => (
                                    <div key={muscle}>
                                        <button
                                            onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--border)] transition-colors border-b border-[var(--border)]"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Dumbbell size={14} className="text-[var(--primary)]" />
                                                <span className="text-sm font-medium">{muscle}</span>
                                                <span className="text-xs text-[var(--text-secondary)]">({muscleExercises.length})</span>
                                            </div>
                                            {expandedMuscle === muscle ? (
                                                <ChevronDown size={16} className="text-[var(--text-secondary)]" />
                                            ) : (
                                                <ChevronRight size={16} className="text-[var(--text-secondary)]" />
                                            )}
                                        </button>

                                        {expandedMuscle === muscle && (
                                            <div className="bg-[var(--bg-card)]">
                                                {muscleExercises.map(ex => (
                                                    <button
                                                        key={ex.name}
                                                        onClick={() => selectExercise(ex.name)}
                                                        className={`w-full text-left px-6 py-2 text-sm transition-colors border-b border-[var(--border)] ${selectedExercise === ex.name
                                                            ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
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
                            </div>
                        )}

                        {/* Chart */}
                        {exerciseProgress.length > 0 ? (
                            <div className="h-48 mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={exerciseProgress}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                        <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} domain={['auto', 'auto']} width={30} />
                                        <Tooltip
                                            contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                                            labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                                            formatter={(value) => [`${value} kg`, '']}
                                        />
                                        <Line type="monotone" dataKey="maxWeight" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} name="Peso Máx" activeDot={{ r: 5 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <p className="text-center text-[var(--text-secondary)] py-8 text-sm bg-[var(--bg-dark)] rounded-lg">
                                {selectedExercise ? 'Sin datos suficientes para gráfica' : 'Selecciona un ejercicio'}
                            </p>
                        )}
                    </div>

                    {/* Recent PRs / Search PRs */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                            <Trophy size={16} className="text-yellow-500" />
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
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                            />
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {filteredPRs.map((pr, i) => (
                                <div key={i} className="flex items-center justify-between bg-[var(--bg-dark)] rounded-lg p-3 border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors">
                                    <span className="text-sm font-medium text-white">{pr.exerciseName}</span>
                                    <div className="text-right">
                                        <span className="text-sm font-bold block text-[var(--primary)]">{pr.weight}kg × {pr.reps}</span>
                                        <span className="text-[10px] text-[var(--text-secondary)]">
                                            {new Date(pr.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {filteredPRs.length === 0 && (
                                <p className="text-center text-[var(--text-secondary)] text-sm py-4">
                                    {prSearch ? 'No se encontraron ejercicios' : 'Aún no hay PRs'}
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Muscles Tab */}
            {activeTab === 'muscles' && (
                <div className="space-y-2 animate-fade-in">
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
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center">
                            <Dumbbell size={32} className="mx-auto text-[var(--text-secondary)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)]">
                                Entrena para ver tu progreso por músculo
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Yearly Tab */}
            {activeTab === 'yearly' && (
                <div className="animate-fade-in space-y-4">
                    {/* Year Selector */}
                    <div className="flex gap-2 justify-center bg-[var(--bg-card)] p-2 rounded-xl">
                        {years.map(year => (
                            <button
                                key={year}
                                onClick={() => setSelectedYear(year)}
                                className={`px-4 py-1.5 rounded-lg text-sm transition-all ${selectedYear === year
                                    ? 'bg-[var(--primary)] text-white shadow-lg'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)]'
                                    }`}
                            >
                                {year}
                            </button>
                        ))}
                    </div>

                    {/* Year Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 text-center">
                            <Calendar size={20} className="mx-auto text-[var(--primary)] mb-2" />
                            <p className="text-2xl font-bold">{Object.keys(consistency).filter(d => d.startsWith(selectedYear)).length}</p>
                            <p className="text-xs text-[var(--text-secondary)]">Días entrenados</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 text-center">
                            <Activity size={20} className="mx-auto text-green-500 mb-2" />
                            <p className="text-2xl font-bold">
                                {Object.entries(consistency)
                                    .filter(([d]) => d.startsWith(selectedYear))
                                    .reduce((sum, [, count]) => sum + count, 0)}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">Ejercicios totales</p>
                        </div>
                    </div>

                    {/* Weekly Chart */}
                    <div className="bg-[var(--bg-card)] rounded-xl p-4">
                        <h3 className="font-medium text-sm mb-3">Sesiones por Semana - {selectedYear}</h3>
                        <div className="h-40">
                            {weeklyData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weeklyData}>
                                        <XAxis dataKey="week" tick={{ fontSize: 8, fill: '#a1a1aa' }} interval={3} />
                                        <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                        <Tooltip
                                            contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                                        />
                                        <Bar dataKey="sessions" fill="#8b5cf6" radius={[2, 2, 0, 0]} name="Sesiones" />
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
                        <h3 className="font-medium text-sm mb-3">Comparativa Anual</h3>
                        <div className="space-y-3">
                            {years.map(year => {
                                const yearDays = Object.keys(consistency).filter(d => d.startsWith(year)).length;
                                const maxDays = Math.max(...years.map(y =>
                                    Object.keys(consistency).filter(d => d.startsWith(y)).length
                                )) || 1;

                                if (year > new Date().getFullYear()) return null; // No mostrar futuro en comparativa

                                return (
                                    <div key={year} className="flex items-center gap-3">
                                        <span className="text-sm w-12 font-mono">{year}</span>
                                        <div className="flex-1 bg-[var(--bg-dark)] rounded-full h-3 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] rounded-full transition-all"
                                                style={{ width: `${(yearDays / maxDays) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-medium w-8 text-right">{yearDays}</span>
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

// Muscle Accordion Component
function MuscleAccordion({ muscle, exercises, onSelectExercise }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Dumbbell size={18} className="text-[var(--primary)]" />
                    <span className="font-medium">{muscle}</span>
                    <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-2 py-0.5 rounded-full border border-[var(--border)]">
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
                <div className="px-4 pb-3 space-y-2 animate-fade-in bg-[var(--bg-dark)]/30 border-t border-[var(--border)] pt-3">
                    {exercises.map((pr, i) => (
                        <button
                            key={i}
                            onClick={() => onSelectExercise(pr.exerciseName)}
                            className="w-full flex items-center justify-between bg-[var(--bg-dark)] rounded-lg p-3 hover:border-[var(--primary)]/50 border border-transparent transition-all"
                        >
                            <span className="text-sm">{pr.exerciseName}</span>
                            <div className="flex items-center gap-2">
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