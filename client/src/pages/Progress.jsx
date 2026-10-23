import { readSelectedExercise, writeSelectedExercise } from '../features/progress/preferences';
import { useRemoteRead } from '../app/useRemoteRead';
import { readProgress, readDatedCollection } from '../features/remoteViews';
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    TrendingUp, Calendar, Trophy, Dumbbell, ChevronDown, ChevronRight, Activity,
    CheckCircle, Search, FileText, Loader2, Flame, X, Clock, Target, Zap, FileDown, Scale
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, CartesianGrid, Area, AreaChart } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';
import { epley1RM, classifyLift } from '../utils/strength';
import { mexicoCityDateStr, mexicoCityLastNDays } from '../utils/dates';
import { toSpanishMuscleGroup } from '../utils/muscleGroup';
import { downloadDayPdf } from '../utils/dayPdf';
import { useAuth } from '../context/AuthContext';

// Goals traen otro history fetch + GoalCard: solo se cargan al abrir el tab
const GoalSection = lazy(() => import('../components/goals/GoalSection'));

// ==========================================
// CONSTANTS & UTILITIES
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

const MUSCLE_COLORS = {
    'Pecho': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', hex: '#3b82f6' },
    'Espalda': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', hex: '#10b981' },
    'Hombros': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hex: '#f59e0b' },
    'Bíceps': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#8b5cf6' },
    'Tríceps': { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', hex: '#ec4899' },
    'Piernas': { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', hex: '#ef4444' },
    'Core': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', hex: '#06b6d4' },
    'Otros': { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', hex: '#6b7280' }
};

function getMuscleGroup(exerciseName, dbMuscle) {
    // DB puede traer inglés ('legs') o español ('Piernas')
    const fromDb = toSpanishMuscleGroup(dbMuscle);
    if (fromDb) return fromDb;
    const name = (exerciseName || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [group, keywords] of Object.entries(MUSCLE_KEYWORDS)) {
        if (keywords.some(k => name.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
            return group;
        }
    }
    return 'Otros';
}

function getRelativeTime(date) {
    // Diferencia en días calendario CDMX (no ms crudos / zona del browser)
    const dayMs = 24 * 60 * 60 * 1000;
    const a = new Date(mexicoCityDateStr(date) + 'T12:00:00Z').getTime();
    const b = new Date(mexicoCityDateStr() + 'T12:00:00Z').getTime();
    const diff = Math.round((b - a) / dayMs);
    if (diff <= 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7) return `Hace ${diff} días`;
    if (diff < 30) return `Hace ${Math.floor(diff / 7)} sem`;
    if (diff < 365) return `Hace ${Math.floor(diff / 30)} mes${Math.floor(diff / 30) > 1 ? 'es' : ''}`;
    return `Hace ${Math.floor(diff / 365)} año${Math.floor(diff / 365) > 1 ? 's' : ''}`;
}

// ==========================================
// CUSTOM HOOKS
// ==========================================

function useProgressData() {
    const remote = useRemoteRead('progress', ['bundle'], () => api.getProgressBundle(), readProgress);
    return useMemo(() => {
        const bundle = remote.data || {};
                let consistencyMap = {};
                if (bundle.consistencyCounts && typeof bundle.consistencyCounts === 'object') {
                    consistencyMap = { ...bundle.consistencyCounts };
                } else {
                    (bundle.consistencyDays || []).forEach(dayKey => {
                        consistencyMap[dayKey] = (consistencyMap[dayKey] || 0) + 1;
                    });
                }

                const exercises = (bundle.exercises || []).map(e => ({
                    name: e.name,
                    muscleGroup: toSpanishMuscleGroup(e.muscleGroup) || null
                }));


        return { stats: bundle.stats || null, consistency: consistencyMap, prs: Array.isArray(bundle.prs) ? bundle.prs : [], exercises,
            plateauedNames: new Set((bundle.plateaued || []).map(n => String(n).toLowerCase())),
            loading: remote.isPending, loadError: remote.isError };
    }, [remote.data, remote.isPending, remote.isError]);
}

/** Formatea peso numérico + unidad sin amontonar ("80 kg", no "80kg"). */
function formatKg(value) {
    if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
    const n = Number(value);
    const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
    return `${text} kg`;
}

function useExerciseProgress(exerciseName) {
    const remote = useRemoteRead('progress', ['exercise', exerciseName], () => api.getExerciseProgress(exerciseName), readDatedCollection, !!exerciseName);
    const progress = useMemo(() => (remote.data || []).map(d => ({ ...d,
        displayDate: new Date(d.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' }),
        fullDate: new Date(d.date).toLocaleDateString('es-ES', { timeZone: 'America/Mexico_City' }) })), [remote.data]);
    return { progress, loading: remote.isFetching && !remote.data };
}

// ==========================================
// UI COMPONENTS
// ==========================================

function SkeletonCard() {
    return (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 animate-pulse">
            <div className="h-5 bg-[var(--bg-dark)] rounded w-3/4 mb-3" />
            <div className="h-8 bg-[var(--bg-dark)] rounded w-1/2" />
        </div>
    );
}

function StatCard({ icon, value, label, color }) {
    const IconComp = icon;
    return (
        <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-xl p-4 text-center border border-[var(--border)] hover:border-[var(--primary)]/30 transition-all">
            <div
                className="w-11 h-11 mx-auto rounded-full flex items-center justify-center mb-2"
                style={{ backgroundColor: `${color}20`, boxShadow: `0 0 15px ${color}25` }}
            >
                {IconComp ? <IconComp size={22} style={{ color }} aria-hidden /> : null}
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{label}</p>
        </div>
    );
}

function ProgressBar({ compliance }) {
    const percentage = compliance.complianceRate;

    return (
        <div className="space-y-3">
            {/* Stats Row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-green-400">{compliance.daysWithWorkout}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase">Días activos</p>
                    </div>
                    <div className="w-px h-10 bg-[var(--border)]" />
                    <div className="text-center">
                        <p className="text-2xl font-bold text-[var(--text-secondary)]">{30 - compliance.daysWithWorkout}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase">INACTIVOS</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-bold">{percentage}%</p>
                    <p className="text-[10px] text-[var(--text-secondary)] uppercase">Cumplimiento</p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-4 bg-[var(--bg-dark)] rounded-full overflow-hidden">
                <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--primary)] to-green-500 rounded-full transition-all duration-1000"
                    style={{ width: `${percentage}%` }}
                />
                {/* Goal marker at 80% */}
                <div
                    className="absolute inset-y-0 w-0.5 bg-white/30"
                    style={{ left: '80%' }}
                    title="Meta: 80%"
                />
            </div>

            {/* Labels */}
            <div className="flex justify-between text-[9px] text-[var(--text-secondary)]">
                <span>0%</span>
                <span className="text-[var(--primary)]">Meta 80%</span>
                <span>100%</span>
            </div>
        </div>
    );
}

function HeatmapCalendar({ days }) {
    const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

    // Properly align days to their day-of-week columns (Mon=0, Sun=6)
    const weeks = useMemo(() => {
        if (!days || days.length === 0) return [];

        const result = [];
        let currentWeek = new Array(7).fill(null);

        days.forEach(day => {
            // Ancla UTC mediodía (misma regla que dayOfWeekFromDateStr server)
            const dow = new Date(`${day.date}T12:00:00Z`).getUTCDay();
            // Convert JS day (0=Sun) to Mon-first (0=Mon, 6=Sun)
            const mondayDow = dow === 0 ? 6 : dow - 1;

            // If we need to start a new week
            if (mondayDow === 0 && currentWeek.some(d => d !== null)) {
                result.push(currentWeek);
                currentWeek = new Array(7).fill(null);
            }

            currentWeek[mondayDow] = day;
        });

        // Push last week if it has data
        if (currentWeek.some(d => d !== null)) {
            result.push(currentWeek);
        }

        return result;
    }, [days]);

    const getIntensityClass = (day) => {
        if (!day?.hasWorkout) return 'bg-[var(--bg-dark)]';
        const c = day.count || 1;
        if (c >= 4) return 'bg-green-400';
        if (c >= 2) return 'bg-green-500/80';
        return 'bg-green-500/50';
    };

    return (
        <div className="space-y-1">
            {/* Day labels */}
            <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_LABELS.map(label => (
                    <span key={label} className="text-[9px] text-center text-[var(--text-secondary)] font-medium">
                        {label}
                    </span>
                ))}
            </div>

            {/* Week rows */}
            {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="grid grid-cols-7 gap-1">
                    {week.map((day, dayIdx) => (
                        <div
                            key={dayIdx}
                            title={day ? `${day.date}${day.hasWorkout ? ' ✓' : ''}` : ''}
                            className={`aspect-square rounded-md min-h-[36px] transition-all cursor-default ${day ? getIntensityClass(day) : 'opacity-0'
                                }`}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

function ExerciseSelector({ exercises, selected, onSelect, loading }) {
    const { user } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedMuscle, setExpandedMuscle] = useState(null);

    const exercisesByMuscle = useMemo(() => {
        return exercises.reduce((acc, ex) => {
            const muscle = getMuscleGroup(ex.name, ex.muscleGroup);
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});
    }, [exercises]);

    const filteredByMuscle = useMemo(() => {
        if (!search) return exercisesByMuscle;
        return Object.entries(exercisesByMuscle).reduce((acc, [muscle, exs]) => {
            const filtered = exs.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
            if (filtered.length > 0) acc[muscle] = filtered;
            return acc;
        }, {});
    }, [exercisesByMuscle, search]);

    function handleSelect(name) {
        onSelect(name);
        // Save to localStorage
        writeSelectedExercise(user?.id, name);
        setShowModal(false);
        setSearch('');
        setExpandedMuscle(null);
    }

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-[var(--primary)]/50 transition-all"
            >
                <span className="font-medium truncate pr-2 text-sm">{selected || 'Seleccionar ejercicio'}</span>
                {loading ? (
                    <Loader2 size={18} className="text-[var(--primary)] animate-spin" />
                ) : (
                    <ChevronDown size={18} className="text-[var(--text-secondary)]" />
                )}
            </button>

            {showModal && (
                <Portal>
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end animate-fade-in" onClick={() => setShowModal(false)}>
                    <div className="bg-[var(--bg-card)] w-full max-h-[80vh] rounded-t-3xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-card)] z-10">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-lg">Seleccionar Ejercicio</h3>
                                <button onClick={() => setShowModal(false)} className="w-9 h-9 flex items-center justify-center hover:bg-[var(--bg-dark)] rounded-lg">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar ejercicio..."
                                    autoFocus
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 focus:border-[var(--primary)] outline-none"
                                />
                            </div>
                        </div>

                        <div className="overflow-y-auto p-4 space-y-2">
                            {Object.entries(filteredByMuscle).map(([muscle, muscleExercises]) => {
                                const colors = MUSCLE_COLORS[muscle] || MUSCLE_COLORS['Otros'];
                                return (
                                    <div key={muscle} className="bg-[var(--bg-dark)] rounded-xl overflow-hidden">
                                        <button
                                            onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-[var(--border)]/50 transition-colors min-h-[56px]"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colors.bg}`}>
                                                    <Dumbbell size={18} className={colors.text} />
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-semibold">{muscle}</p>
                                                    <p className="text-xs text-[var(--text-secondary)]">{muscleExercises.length} ejercicios</p>
                                                </div>
                                            </div>
                                            <ChevronDown size={18} className={`transition-transform ${expandedMuscle === muscle ? 'rotate-180' : ''}`} />
                                        </button>

                                        {expandedMuscle === muscle && (
                                            <div className="px-4 pb-4 space-y-1 animate-fade-in">
                                                {muscleExercises.map(ex => (
                                                    <button
                                                        key={ex.name}
                                                        onClick={() => handleSelect(ex.name)}
                                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all min-h-[44px] ${selected === ex.name
                                                            ? 'bg-[var(--primary)] text-white font-medium'
                                                            : 'hover:bg-[var(--border)] text-[var(--text-secondary)]'
                                                            }`}
                                                    >
                                                        {ex.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {Object.keys(filteredByMuscle).length === 0 && (
                                <div className="text-center py-12">
                                    <Search size={48} className="mx-auto text-[var(--text-secondary)] opacity-30 mb-4" />
                                    <p className="text-[var(--text-secondary)]">No se encontraron ejercicios</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                </Portal>
            )}
        </>
    );
}

function PRCard({ pr, rank, isPlateaued }) {
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const isTop3 = rank <= 3;
    const muscle = getMuscleGroup(pr.exerciseName, null);
    const colors = MUSCLE_COLORS[muscle] || MUSCLE_COLORS['Otros'];

    // Mostrar 1RM estimado si existe
    const estimated1RM = pr.estimated1RM ? Math.round(pr.estimated1RM) : null;

    const plateau = { isPlateaued: !!isPlateaued };

    return (
        <div className={`relative bg-[var(--bg-card)] rounded-xl p-4 border transition-all hover:border-[var(--primary)]/30 ${isTop3
            ? 'border-yellow-500/30 shadow-lg shadow-yellow-500/10'
            : 'border-[var(--border)]'
            }`}>
            {/* Medal Badge */}
            {isTop3 && (
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-sm shadow-lg">
                    {medals[rank]}
                </div>
            )}

            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    {/* Exercise Name + Muscle Chip */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm truncate">{pr.exerciseName}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                            {muscle}
                        </span>
                        {plateau.isPlateaued && (
                            <span
                                title="Sin mejora reciente (plateau, últimas sesiones)"
                                className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--warning)]/40 bg-[var(--warning)]/15 text-[var(--warning)] font-semibold"
                            >
                                Estancado
                            </span>
                        )}
                    </div>
                    {/* Relative Time */}
                    <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                        <Clock size={12} />
                        <span className="text-xs">{getRelativeTime(pr.date)}</span>
                    </div>
                </div>

                {/* Weight, Reps & 1RM — unidad separada para no amontonar dígitos+kg */}
                <div className="text-right shrink-0 min-w-[4.5rem]">
                    <p className="text-xl font-bold text-[var(--primary)] tabular-nums whitespace-nowrap">
                        {formatKg(pr.weight)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] font-mono">× {pr.reps} reps</p>
                    {estimated1RM != null && (
                        <p className="text-[10px] text-[var(--warning)] font-medium mt-0.5 tabular-nums whitespace-nowrap">
                            ~{formatKg(estimated1RM)} 1RM
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// Custom Chart Tooltip
function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.[0]) return null;
    const data = payload[0].payload;
    const weightVal = data.maxWeight != null && data.maxWeight !== '' ? Number(data.maxWeight) : null;
    return (
        <div className="bg-[var(--bg-card)] border-2 border-[var(--primary)] rounded-xl p-3 shadow-2xl">
            <p className="text-xs text-[var(--text-secondary)] mb-1">{data.fullDate || label}</p>
            <p className="font-bold text-[var(--primary)] text-lg tabular-nums whitespace-nowrap">
                {weightVal != null && Number.isFinite(weightVal)
                    ? formatKg(weightVal)
                    : `${data.sessions ?? 0} sesiones`}
            </p>
            {data.totalSets && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {data.totalSets} series • {data.totalReps} reps
                </p>
            )}
        </div>
    );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function Progress() {
    const toast = useToast();
    const location = useLocation();
    const { user } = useAuth();
    const { stats, consistency, prs, exercises, plateauedNames, loading, loadError } = useProgressData();

    const [uiState, setUIState] = useState({
        // Permite aterrizar en Objetivos desde /goals/new (navigate state.tab)
        activeTab: location.state?.tab === 'goals' ? 'goals' : 'overview',
        showAllPRs: false,
        expandedMuscle: null
    });

    const [filtersState, setFiltersState] = useState({
        selectedExercise: readSelectedExercise(user?.id) || '',
        selectedYear: parseInt(mexicoCityDateStr().slice(0, 4), 10),
        prSearch: ''
    });

    // Día para PDF de TODO el día (no una sesión de un solo ejercicio)
    const [dayPdfDate, setDayPdfDate] = useState(() => mexicoCityDateStr());
    const [dayPdfLoading, setDayPdfLoading] = useState(false);

    const { progress: exerciseProgress, loading: loadingProgress } = useExerciseProgress(filtersState.selectedExercise);

    // Bodyweight for strength-level classification
    const [bodyWeight, setBodyWeight] = useState(null);

    // 1RM calculator local state
    const [calc, setCalc] = useState({ weight: '', reps: '' });
    const calcResult = epley1RM(calc.weight, calc.reps);

    useEffect(() => {
        let isMounted = true;
        api.getLatestWeight()
            .then(res => { if (isMounted) setBodyWeight(res?.weight || null); })
            .catch(err => { console.error('Error fetching latest weight:', err); });
        return () => { isMounted = false; };
    }, []);

    // Strength levels derived from PRs that match a known standard
    const strengthLifts = useMemo(() => {
        return prs
            .map(pr => {
                const oneRM = pr.estimated1RM || epley1RM(pr.weight, pr.reps);
                const info = classifyLift(pr.exerciseName, oneRM, bodyWeight);
                return info ? { ...info, oneRM } : null;
            })
            .filter(Boolean);
    }, [prs, bodyWeight]);

    // Auto-select first exercise if none saved
    useEffect(() => {
        if (exercises.length > 0 && !filtersState.selectedExercise) {
            const saved = localStorage.getItem('nexlift_lastExercise');
            const validExercise = saved && exercises.find(e => e.name === saved);
            setFiltersState(prev => ({
                ...prev,
                selectedExercise: validExercise ? saved : exercises[0].name
            }));
        }
    }, [exercises, filtersState.selectedExercise, user?.id]);

    // Dynamic years
    const years = useMemo(() => {
        const currentYear = parseInt(mexicoCityDateStr().slice(0, 4), 10);
        if (Object.keys(consistency).length === 0) {
            return [currentYear];
        }
        const yearsWithData = Object.keys(consistency)
            .map(dateStr => parseInt(dateStr.split('-')[0], 10))
            .filter((year, index, arr) => arr.indexOf(year) === index)
            .sort((a, b) => b - a);

        if (!yearsWithData.includes(currentYear)) {
            yearsWithData.unshift(currentYear);
        }
        return yearsWithData.slice(0, 5);
    }, [consistency]);

    // Días con actividad (del bundle de constancia) — para selector PDF
    const trainingDayKeys = useMemo(() => {
        return Object.keys(consistency || {}).sort((a, b) => b.localeCompare(a));
    }, [consistency]);

    useEffect(() => {
        if (trainingDayKeys.length === 0) return;
        if (!trainingDayKeys.includes(dayPdfDate)) {
            setDayPdfDate(trainingDayKeys[0]);
        }
    }, [trainingDayKeys, dayPdfDate]);

    async function handleDayPdf() {
        if (dayPdfLoading) return;
        setDayPdfLoading(true);
        try {
            // On-demand: solo el día pedido (no history 120 al abrir Progreso)
            const sessions = await api.getWorkoutHistory(80, {
                dateFrom: dayPdfDate,
                dateTo: dayPdfDate
            });
            if (!sessions?.length) {
                toast.error('No hay entrenos ese día');
                return;
            }
            await downloadDayPdf(sessions, {
                dayKey: dayPdfDate,
                userName: user?.firstName
                    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
                    : user?.username
            });
            toast.success('PDF del día descargado');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'No se pudo generar el PDF del día');
        } finally {
            setDayPdfLoading(false);
        }
    }

    // Cumplimiento 30d + racha: fechas CDMX; racha = server si está disponible
    // (incluye descansos programados de la rutina).
    const compliance = useMemo(() => {
        const last30 = mexicoCityLastNDays(30);
        const last30Days = last30.map(dateStr => ({
            date: dateStr,
            hasWorkout: (consistency[dateStr] || 0) > 0,
            count: consistency[dateStr] || 0
        }));

        const daysWithWorkout = last30Days.reduce((sum, d) => sum + (d.hasWorkout ? 1 : 0), 0);

        // Fallback local solo si overview no trajo racha
        let localStreak = 0;
        const todayStr = mexicoCityDateStr();
        const todayLogged = (consistency[todayStr] || 0) > 0;
        const checkFrom = todayLogged ? 0 : 1;
        for (let i = checkFrom; i < 365; i++) {
            const dateStr = mexicoCityDateStr(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
            if ((consistency[dateStr] || 0) > 0) localStreak++;
            else break;
        }

        return {
            daysWithWorkout,
            complianceRate: Math.round((daysWithWorkout / 30) * 100),
            last30Days,
            currentStreak: stats?.currentStreak != null ? stats.currentStreak : localStreak
        };
    }, [consistency, stats]);

    // Weekly data (memoized)
    const weeklyData = useMemo(() => {
        const weeks = [];
        const year = filtersState.selectedYear;
        const currentYear = parseInt(mexicoCityDateStr().slice(0, 4), 10);
        if (year > currentYear) return [];

        // Semanas del año ancladas a mediodía UTC (día estable)
        const yearStart = new Date(`${year}-01-01T12:00:00Z`);
        const todayStr = mexicoCityDateStr();

        for (let w = 0; w < 52; w++) {
            const weekStart = new Date(yearStart);
            weekStart.setUTCDate(weekStart.getUTCDate() + (w * 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

            const weekStartStr = weekStart.toISOString().slice(0, 10);
            const weekEndStr = weekEnd.toISOString().slice(0, 10);

            if (year === currentYear && weekStartStr > todayStr) break;

            let count = 0;
            Object.keys(consistency).forEach(dateStr => {
                if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
                    count += consistency[dateStr];
                }
            });

            weeks.push({ week: `S${w + 1}`, sessions: count });
        }
        return weeks;
    }, [consistency, filtersState.selectedYear]);

    // PRs by muscle (memoized)
    const prsByMuscle = useMemo(() => {
        return prs.reduce((acc, pr) => {
            const muscle = getMuscleGroup(pr.exerciseName, null);
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(pr);
            return acc;
        }, {});
    }, [prs]);

    // PRs filtrados y ordenados por 1RM (el rank 🥇 no era por fuerza antes)
    const displayedPRs = useMemo(() => {
        const filtered = filtersState.prSearch
            ? prs.filter(pr => pr.exerciseName.toLowerCase().includes(filtersState.prSearch.toLowerCase()))
            : [...prs];
        filtered.sort((a, b) => (b.estimated1RM || b.weight || 0) - (a.estimated1RM || a.weight || 0));
        return uiState.showAllPRs ? filtered : filtered.slice(0, 5);
    }, [prs, filtersState.prSearch, uiState.showAllPRs]);

    // Chart Y-axis domain (critical for small variations)
    const chartDomain = useMemo(() => {
        if (exerciseProgress.length === 0) return ['auto', 'auto'];
        const weights = exerciseProgress.map(d => d.maxWeight);
        const min = Math.min(...weights);
        const max = Math.max(...weights);
        const padding = Math.max((max - min) * 0.15, 2);
        return [Math.floor(min - padding), Math.ceil(max + padding)];
    }, [exerciseProgress]);

    if (loading) {
        return (
            <div className="space-y-6 max-w-lg mx-auto pb-20 px-4">
                <div className="h-16 bg-[var(--bg-card)] rounded-xl animate-pulse" />
                <div className="grid grid-cols-3 gap-3">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
                <SkeletonCard />
            </div>
        );
    }

    if (loadError && !stats) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center space-y-3">
                <p className="font-bold text-lg">No se pudo cargar el progreso</p>
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

    return (
        <div className="space-y-4 animate-fade-in max-w-2xl mx-auto pb-6">
            {/* Header: título arriba, acciones en fila propia (no se aplastan en móvil) */}
            <div className="space-y-3">
                <div>
                    <h1 className="text-2xl font-bold leading-tight">Progreso</h1>
                    {import.meta.env.DEV && <Link to="/coach" className="inline-flex items-center min-h-[44px] text-[var(--primary)] font-semibold">NexLift Coach →</Link>}
                    <p className="text-[var(--text-secondary)] text-sm mt-0.5">Tu evolución fitness</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Link
                        to="/body"
                        className="min-h-[44px] flex items-center justify-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border)] px-2 py-2.5 rounded-xl text-xs font-semibold text-[var(--text-primary)] active:scale-[0.98]"
                    >
                        <Scale size={16} className="text-[var(--accent)] shrink-0" aria-hidden />
                        Cuerpo
                    </Link>
                    <Link
                        to="/export"
                        className="min-h-[44px] flex items-center justify-center gap-1.5 bg-[var(--primary)] px-2 py-2.5 rounded-xl text-xs font-semibold text-white shadow-md shadow-[var(--primary)]/20 active:scale-[0.98]"
                    >
                        <FileText size={16} className="shrink-0" aria-hidden />
                        PDF
                    </Link>
                </div>
            </div>

            {/* Tabs: grid 2×2 en móvil (sin scroll horizontal raro) */}
            <div className="bg-[var(--bg-card)] p-1 rounded-2xl border border-[var(--border)]" role="tablist" aria-label="Secciones de progreso">
                <div className="grid grid-cols-2 gap-1">
                    {[
                        { id: 'overview', label: 'General', icon: Activity },
                        { id: 'goals', label: 'Objetivos', icon: Target },
                        { id: 'strength', label: 'Fuerza', icon: Zap },
                        { id: 'muscles', label: 'Músculos', icon: Dumbbell }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={uiState.activeTab === tab.id}
                            onClick={() => setUIState(prev => ({ ...prev, activeTab: tab.id }))}
                            className={`min-h-[44px] px-2 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${uiState.activeTab === tab.id
                                ? 'bg-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/20'
                                : 'text-[var(--text-secondary)] hover:text-white'
                                }`}
                        >
                            <tab.icon size={14} aria-hidden />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Overview Tab */}
            {uiState.activeTab === 'overview' && (
                <div className="space-y-5 animate-fade-in">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-2">
                        <StatCard icon={TrendingUp} value={stats?.totalWorkouts || 0} label="Sesiones" color="#8b5cf6" />
                        <StatCard icon={Trophy} value={prs.length} label="PRs" color="#eab308" />
                        <StatCard icon={CheckCircle} value={`${compliance.complianceRate}%`} label="Cumplimiento" color="#10b981" />
                    </div>

                    {/* Volumen semanal (kg×reps) — mismo dato que Dashboard */}
                    <div className="bg-[var(--bg-card)]/80 border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
                            <Dumbbell size={20} className="text-[var(--primary)]" aria-hidden />
                        </div>
                        <div>
                            <p className="text-xs text-[var(--text-secondary)]">Volumen esta semana</p>
                            <p className="font-bold text-lg tabular-nums">
                                {(stats?.weeklyVolume || 0).toLocaleString('es')}
                                <span className="text-sm font-semibold text-[var(--text-secondary)] ml-1">kg×reps</span>
                            </p>
                        </div>
                    </div>

                    {/* PDF de un DÍA completo (todos los ejercicios del día, no una sola sesión) */}
                    <div className="bg-[var(--bg-card)]/80 border border-[var(--border)] rounded-2xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h3 className="font-bold flex items-center gap-2 text-sm">
                                    <FileDown size={16} className="text-[var(--primary)]" aria-hidden />
                                    PDF del día
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    Todos los ejercicios de un día de gym (no un solo ejercicio).
                                </p>
                            </div>
                            <Link
                                to="/export?period=daily"
                                className="text-[10px] text-purple-400 hover:text-purple-300 shrink-0 pt-0.5"
                            >
                                Más reportes →
                            </Link>
                        </div>
                        {trainingDayKeys.length === 0 ? (
                            <p className="text-xs text-[var(--text-secondary)]">Aún no hay días con entreno para exportar.</p>
                        ) : (
                            <div className="flex gap-2 min-w-0">
                                <div className="flex-1 min-w-0 overflow-hidden rounded-xl">
                                    <input
                                        type="date"
                                        value={dayPdfDate}
                                        max={mexicoCityDateStr()}
                                        onChange={(e) => setDayPdfDate(e.target.value)}
                                        className="block w-full min-w-0 max-w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-white focus:border-[var(--primary)] outline-none"
                                        aria-label="Día a exportar"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDayPdf}
                                    disabled={dayPdfLoading}
                                    className="shrink-0 px-3 sm:px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 active:scale-95"
                                >
                                    {dayPdfLoading
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <FileDown size={16} />}
                                    Descargar
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Compliance Card */}
                    <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-2xl p-5 border border-[var(--border)]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold flex items-center gap-2">
                                <Calendar size={18} className="text-[var(--primary)]" />
                                Asistencia (30 días)
                            </h3>
                            {compliance.currentStreak > 0 && (
                                <div className="flex items-center gap-1 bg-orange-500/20 px-2.5 py-1 rounded-full border border-orange-500/30">
                                    <Flame size={14} className="text-orange-500" />
                                    <span className="text-xs font-bold text-orange-500">{compliance.currentStreak} días</span>
                                </div>
                            )}
                        </div>

                        <ProgressBar compliance={compliance} />

                        <div className="mt-5">
                            <HeatmapCalendar days={compliance.last30Days} />
                            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-2 px-1">
                                <span>Hace 30 días</span>
                                <span>Hoy</span>
                            </div>
                        </div>
                    </div>

                    {/* Exercise Progress Chart */}
                    <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-2xl p-5 border border-[var(--border)]">
                        <h3 className="font-bold mb-4 flex items-center gap-2">
                            <TrendingUp size={18} className="text-[var(--primary)]" />
                            Progreso por Ejercicio
                        </h3>

                        <ExerciseSelector
                            exercises={exercises}
                            selected={filtersState.selectedExercise}
                            onSelect={(name) => setFiltersState(prev => ({ ...prev, selectedExercise: name }))}
                            loading={loadingProgress}
                        />

                        <div className="mt-4">
                            {loadingProgress ? (
                                <div className="h-48 flex items-center justify-center bg-[var(--bg-dark)] rounded-xl">
                                    <Loader2 size={32} className="text-[var(--primary)] animate-spin" />
                                </div>
                            ) : exerciseProgress.length > 0 ? (
                                <div className="h-48">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={exerciseProgress}>
                                            <defs>
                                                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                                            <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} />
                                            <YAxis domain={chartDomain} tick={{ fontSize: 10, fill: '#71717a' }} width={35} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Area
                                                type="monotone"
                                                dataKey="maxWeight"
                                                stroke="#8b5cf6"
                                                strokeWidth={2.5}
                                                fill="url(#colorWeight)"
                                                dot={{ fill: '#8b5cf6', r: 4, strokeWidth: 2, stroke: '#1a1a1a' }}
                                                activeDot={{ r: 6, strokeWidth: 2 }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="h-48 flex flex-col items-center justify-center bg-[var(--bg-dark)] rounded-xl">
                                    <TrendingUp size={36} className="text-[var(--text-secondary)] opacity-30 mb-2" />
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {filtersState.selectedExercise ? 'Sin datos suficientes' : 'Selecciona un ejercicio'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recent PRs */}
                    <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-2xl p-5 border border-[var(--border)]">
                        <h3 className="font-bold mb-4 flex items-center gap-2">
                            <Trophy size={18} className="text-yellow-500" />
                            Récords Personales
                        </h3>

                        <div className="relative mb-4">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                placeholder="Buscar ejercicio..."
                                value={filtersState.prSearch}
                                onChange={(e) => setFiltersState(prev => ({ ...prev, prSearch: e.target.value }))}
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 focus:border-[var(--primary)] outline-none text-sm"
                            />
                        </div>

                        <div className="space-y-2.5">
                            {displayedPRs.map((pr, i) => (
                                <PRCard
                                    key={`${pr.exerciseName}-${i}`}
                                    pr={pr}
                                    rank={i + 1}
                                    isPlateaued={plateauedNames?.has(String(pr.exerciseName || '').toLowerCase())}
                                />
                            ))}
                            {displayedPRs.length === 0 && (
                                <div className="text-center py-10 bg-[var(--bg-dark)] rounded-xl">
                                    <Trophy size={40} className="mx-auto text-[var(--text-secondary)] opacity-30 mb-3" />
                                    <p className="text-[var(--text-secondary)] text-sm">
                                        {filtersState.prSearch ? 'Sin resultados' : 'Aún no hay PRs'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {!filtersState.prSearch && prs.length > 5 && (
                            <button
                                onClick={() => setUIState(prev => ({ ...prev, showAllPRs: !prev.showAllPRs }))}
                                className="w-full mt-4 py-3 text-sm text-[var(--primary)] hover:bg-[var(--bg-dark)] rounded-lg font-medium transition-all"
                            >
                                {uiState.showAllPRs ? 'Ver menos' : `Ver todos (${prs.length})`}
                            </button>
                        )}
                    </div>

                </div>
            )}

            {/* Goals Tab */}
            {uiState.activeTab === 'goals' && (
                <div className="animate-fade-in">
                    <Suspense fallback={
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                        </div>
                    }>
                        <GoalSection />
                    </Suspense>
                </div>
            )}

            {/* Strength Tab */}
            {uiState.activeTab === 'strength' && (
                <div className="space-y-5 animate-fade-in">
                    {/* 1RM Calculator */}
                    <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border)]">
                        <h3 className="font-bold mb-1 flex items-center gap-2">
                            <Zap size={18} className="text-[var(--primary)]" />
                            Calculadora 1RM
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-4">
                            Estimación de tu repetición máxima (fórmula Epley)
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
                                    Peso (kg)
                                </label>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    value={calc.weight}
                                    onChange={(e) => setCalc(prev => ({ ...prev, weight: e.target.value }))}
                                    placeholder="0"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 focus:border-[var(--primary)] outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
                                    Reps
                                </label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    value={calc.reps}
                                    onChange={(e) => setCalc(prev => ({ ...prev, reps: e.target.value }))}
                                    placeholder="0"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 focus:border-[var(--primary)] outline-none text-sm"
                                />
                            </div>
                        </div>

                        <div className="mt-4 bg-[var(--bg-dark)] rounded-xl p-4 text-center">
                            <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">
                                1RM estimado
                            </p>
                            <p className="text-3xl font-bold text-[var(--primary)]">
                                {calcResult > 0 ? formatKg(calcResult) : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Bodyweight missing note */}
                    {!bodyWeight && (
                        <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border)] text-center">
                            <Activity size={40} className="mx-auto text-[var(--text-secondary)] opacity-30 mb-3" />
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                Registra tu peso corporal para calcular tus niveles de fuerza.
                            </p>
                            <Link
                                to="/body"
                                className="inline-flex items-center gap-2 bg-[var(--primary)] px-4 py-2.5 rounded-xl text-sm font-medium text-white active:scale-95 transition-all"
                            >
                                <TrendingUp size={16} />
                                Registrar peso
                            </Link>
                        </div>
                    )}

                    {/* Strength Levels */}
                    {bodyWeight && (
                        <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border)]">
                            <h3 className="font-bold mb-1 flex items-center gap-2">
                                <Trophy size={18} className="text-yellow-500" />
                                Niveles de Fuerza
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)] mb-4">
                                Según tu peso corporal ({formatKg(bodyWeight)})
                            </p>

                            <div className="space-y-3">
                                {strengthLifts.map((lift) => (
                                    <div key={lift.key} className="bg-[var(--bg-dark)] rounded-xl p-4">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-sm truncate">{lift.key}</p>
                                                <p className="text-xs text-[var(--text-secondary)]">
                                                    {formatKg(Math.round(lift.oneRM))} · {lift.ratio}× peso corporal
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-[10px] px-2 py-1 rounded-full border border-[var(--primary)]/40 bg-[var(--primary)]/15 text-[var(--primary)] font-semibold">
                                                {lift.levelName}
                                            </span>
                                        </div>

                                        <div className="relative h-2.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
                                            <div
                                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--primary)] to-purple-400 rounded-full transition-all duration-1000"
                                                style={{ width: `${lift.pct}%` }}
                                            />
                                        </div>
                                        <p className="text-[10px] text-[var(--text-secondary)] mt-1.5 text-right">
                                            {lift.isMax
                                                ? 'Nivel máximo'
                                                : `${lift.pct}% hacia ${lift.nextLevel}`}
                                        </p>
                                    </div>
                                ))}

                                {strengthLifts.length === 0 && (
                                    <div className="text-center py-10 bg-[var(--bg-dark)] rounded-xl">
                                        <Zap size={40} className="mx-auto text-[var(--text-secondary)] opacity-30 mb-3" />
                                        <p className="text-[var(--text-secondary)] text-sm">
                                            Aún no hay levantamientos con estándar de fuerza
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Muscles Tab */}
            {uiState.activeTab === 'muscles' && (
                <div className="space-y-2 animate-fade-in">
                    {Object.entries(prsByMuscle).map(([muscle, musclePs]) => {
                        const colors = MUSCLE_COLORS[muscle] || MUSCLE_COLORS['Otros'];
                        return (
                            <div key={muscle} className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                                <button
                                    onClick={() => setUIState(prev => ({ ...prev, expandedMuscle: prev.expandedMuscle === muscle ? null : muscle }))}
                                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors min-h-[56px]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.bg}`}>
                                            <Dumbbell size={20} className={colors.text} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold">{muscle}</p>
                                            <p className="text-xs text-[var(--text-secondary)]">{musclePs.length} ejercicios</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${colors.text}`}>
                                            {formatKg(Math.max(...musclePs.map(p => p.weight)))} max
                                        </span>
                                        <ChevronDown size={18} className={`transition-transform ${uiState.expandedMuscle === muscle ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>

                                {uiState.expandedMuscle === muscle && (
                                    <div className="px-4 pb-4 space-y-2 animate-fade-in bg-[var(--bg-dark)]/30 pt-2">
                                        {musclePs.map((pr, i) => {
                                            const isPlateaued = plateauedNames?.has(String(pr.exerciseName || '').toLowerCase());
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        setFiltersState(prev => ({ ...prev, selectedExercise: pr.exerciseName }));
                                                        setUIState(prev => ({ ...prev, activeTab: 'overview' }));
                                                    }}
                                                    className="w-full flex items-center justify-between bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg p-3 transition-all active:scale-98 min-h-[44px]"
                                                >
                                                    <span className="text-sm truncate pr-3 flex items-center gap-1.5">
                                                        {pr.exerciseName}
                                                        {isPlateaued && (
                                                            <span
                                                                title="Estancado: sin mejora reciente"
                                                                className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0"
                                                            />
                                                        )}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm font-mono" style={{ color: colors.hex }}>
                                                            {formatKg(pr.weight)} × {pr.reps}
                                                        </span>
                                                        <ChevronRight size={14} className="text-[var(--text-secondary)]" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {Object.keys(prsByMuscle).length === 0 && (
                        <div className="bg-[var(--bg-card)] rounded-2xl p-12 text-center border border-[var(--border)]">
                            <Dumbbell size={48} className="mx-auto text-[var(--text-secondary)] mb-4 opacity-30" />
                            <p className="text-[var(--text-secondary)]">Entrena para ver tu progreso por músculo</p>
                        </div>
                    )}
                </div>
            )}

            {/* Yearly Tab */}
            {uiState.activeTab === 'yearly' && (
                <div className="space-y-5 animate-fade-in">
                    {/* Year Selector */}
                    <div className="flex gap-2 justify-center bg-[var(--bg-card)] p-1.5 rounded-xl border border-[var(--border)]">
                        {years.map(year => (
                            <button
                                key={year}
                                onClick={() => setFiltersState(prev => ({ ...prev, selectedYear: year }))}
                                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${filtersState.selectedYear === year
                                    ? 'bg-[var(--primary)] text-white shadow-lg'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-white'
                                    }`}
                            >
                                {year}
                            </button>
                        ))}
                    </div>

                    {/* Year Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-xl p-5 text-center border border-[var(--border)]">
                            <Calendar size={28} className="mx-auto text-[var(--primary)] mb-2" />
                            <p className="text-3xl font-bold">
                                {Object.keys(consistency).filter(d => d.startsWith(String(filtersState.selectedYear))).length}
                            </p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase">Días entrenados</p>
                        </div>
                        <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-xl p-5 text-center border border-[var(--border)]">
                            <Activity size={28} className="mx-auto text-green-500 mb-2" />
                            <p className="text-3xl font-bold">
                                {Object.entries(consistency)
                                    .filter(([d]) => d.startsWith(String(filtersState.selectedYear)))
                                    .reduce((sum, [, count]) => sum + count, 0)}
                            </p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase">Ejercicios totales</p>
                        </div>
                    </div>

                    {/* Weekly Chart */}
                    <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-2xl p-5 border border-[var(--border)]">
                        <h3 className="font-bold mb-4">Sesiones por Semana - {filtersState.selectedYear}</h3>
                        <div className="h-48">
                            {weeklyData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weeklyData}>
                                        <defs>
                                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.5} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                                        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#71717a' }} interval={4} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={30} tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }} />
                                        <Bar dataKey="sessions" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
                                    <Calendar size={40} className="opacity-30 mb-3" />
                                    <p className="text-sm">Sin datos para este año</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Year Comparison */}
                    <div className="bg-[var(--bg-card)]/80 backdrop-blur-md rounded-2xl p-5 border border-[var(--border)]">
                        <h3 className="font-bold mb-4">Comparativa Anual</h3>
                        <div className="space-y-3">
                            {years.map(year => {
                                const yearDays = Object.keys(consistency).filter(d => d.startsWith(String(year))).length;
                                const maxDays = Math.max(...years.map(y =>
                                    Object.keys(consistency).filter(d => d.startsWith(String(y))).length
                                )) || 1;

                                if (year > new Date().getFullYear()) return null;

                                return (
                                    <div key={year} className="flex items-center gap-3">
                                        <span className="text-sm w-12 font-bold font-mono">{year}</span>
                                        <div className="flex-1 bg-[var(--bg-dark)] rounded-full h-4 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-400 rounded-full transition-all duration-1000"
                                                style={{ width: `${(yearDays / maxDays) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-bold w-10 text-right font-mono">{yearDays}</span>
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
