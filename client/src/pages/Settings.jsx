import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Dumbbell, Check, ChevronDown, ChevronRight, Info, History, Trash2, Edit3, AlertTriangle, X } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

const MUSCLE_OPTIONS = [
    'Pecho',
    'Espalda',
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Piernas',
    'Core',
    'Otros'
];

// Colores para chips de grupos musculares
const MUSCLE_COLORS = {
    'Pecho': 'bg-red-500/20 text-red-400 border-red-500/30',
    'Espalda': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Hombros': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'Bíceps': 'bg-green-500/20 text-green-400 border-green-500/30',
    'Tríceps': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'Piernas': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'Core': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'Otros': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    'Sin clasificar': 'bg-amber-500/20 text-amber-400 border-amber-500/30'
};

export default function Settings() {
    const navigate = useNavigate();
    const toast = useToast();

    const [exercises, setExercises] = useState([]);
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);
    const [expandedMuscle, setExpandedMuscle] = useState(null);
    const [activeSection, setActiveSection] = useState('muscles');

    // Delete Modal State
    const [deletingSession, setDeletingSession] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            const [exercisesData, historyData] = await Promise.all([
                api.getExercises(),
                api.getWorkoutHistory(30)
            ]);
            setExercises(exercisesData || []);
            setWorkoutHistory(historyData || []);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error cargando datos');
        } finally {
            setLoading(false);
        }
    }

    async function updateMuscle(exerciseId, muscleGroup) {
        if (saving) return;

        setSaving(exerciseId);
        try {
            await api.updateExerciseMuscle(exerciseId, muscleGroup);
            setExercises(prev => prev.map(ex =>
                ex.id === exerciseId ? { ...ex, muscleGroup } : ex
            ));
            toast.success(`Clasificado como ${muscleGroup}`);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al guardar el cambio');
        } finally {
            setSaving(null);
        }
    }

    // Delete Session
    async function confirmDeleteSession() {
        if (!deletingSession || deleting) return;

        setDeleting(true);
        try {
            await api.deleteWorkoutSession(deletingSession.id);
            toast.success('Sesión eliminada');
            setWorkoutHistory(prev => prev.filter(s => s.id !== deletingSession.id));
            setDeletingSession(null);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al eliminar');
        } finally {
            setDeleting(false);
        }
    }

    // Group exercises by muscle with proper ordering
    const exercisesByMuscle = useMemo(() => {
        const groups = exercises.reduce((acc, ex) => {
            const muscle = ex.muscleGroup || 'Sin clasificar';
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});

        // Ordenar: primero MUSCLE_OPTIONS en orden, luego "Sin clasificar" al final
        const orderedGroups = {};
        MUSCLE_OPTIONS.forEach(muscle => {
            if (groups[muscle]) orderedGroups[muscle] = groups[muscle];
        });
        if (groups['Sin clasificar']) {
            orderedGroups['Sin clasificar'] = groups['Sin clasificar'];
        }
        return orderedGroups;
    }, [exercises]);

    // Group sessions by date
    const sessionsByDate = useMemo(() => {
        const groups = {};
        workoutHistory.forEach(session => {
            const dateStr = new Date(session.date).toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'short'
            });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(session);
        });
        return groups;
    }, [workoutHistory]);

    // Stats
    const stats = useMemo(() => ({
        total: exercises.length,
        classified: exercises.filter(e => e.muscleGroup && e.muscleGroup !== 'Sin clasificar').length,
        unclassified: exercises.filter(e => !e.muscleGroup || e.muscleGroup === 'Sin clasificar').length
    }), [exercises]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto pb-24">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <SettingsIcon size={24} className="text-[var(--primary)]" />
                    Ajustes
                </h1>
                <p className="text-[var(--text-secondary)] text-sm">Gestiona ejercicios y sesiones</p>
            </div>

            {/* Section Tabs */}
            <div className="flex gap-2 bg-[var(--bg-dark)] p-1 rounded-xl">
                <button
                    onClick={() => setActiveSection('muscles')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeSection === 'muscles'
                        ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-900/30'
                        : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                >
                    <Dumbbell size={16} />
                    Músculos
                </button>
                <button
                    onClick={() => setActiveSection('history')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeSection === 'history'
                        ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-900/30'
                        : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                >
                    <History size={16} />
                    Historial
                </button>
            </div>

            {/* SECTION: Muscle Classification */}
            {activeSection === 'muscles' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border)] text-center">
                            <p className="text-xl font-bold text-[var(--primary)]">{stats.total}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">Total</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border)] text-center">
                            <p className="text-xl font-bold text-green-400">{stats.classified}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">Clasificados</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border)] text-center">
                            <p className="text-xl font-bold text-amber-400">{stats.unclassified}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">Pendientes</p>
                        </div>
                    </div>

                    {/* Info Card */}
                    <div className="bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 text-sm flex gap-3 items-start">
                        <Info size={20} className="text-[var(--primary)] shrink-0 mt-0.5" />
                        <p className="text-[var(--text-secondary)]">
                            Toca un grupo muscular para ver y reclasificar sus ejercicios.
                        </p>
                    </div>

                    {/* Muscle Groups Accordion */}
                    <div className="space-y-2">
                        {Object.entries(exercisesByMuscle).map(([muscle, muscleExercises]) => (
                            <div key={muscle} className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                                <button
                                    onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors min-h-[52px]"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2.5 h-2.5 rounded-full ${MUSCLE_COLORS[muscle]?.split(' ')[0] || 'bg-gray-500/50'}`} />
                                        <span className="font-medium">{muscle}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${MUSCLE_COLORS[muscle] || MUSCLE_COLORS['Otros']}`}>
                                            {muscleExercises.length}
                                        </span>
                                    </div>
                                    <div className={`transition-transform duration-200 ${expandedMuscle === muscle ? 'rotate-180' : ''}`}>
                                        <ChevronDown size={18} className="text-[var(--text-secondary)]" />
                                    </div>
                                </button>

                                {expandedMuscle === muscle && (
                                    <div className="px-4 pb-4 space-y-3 animate-fade-in bg-[var(--bg-dark)]/40 pt-3 border-t border-[var(--border)]">
                                        {muscleExercises.map(exercise => (
                                            <div key={exercise.id} className="bg-[var(--bg-card)] rounded-lg p-3 border border-[var(--border)]">
                                                <div className="flex items-center justify-between mb-3">
                                                    <p className="text-sm font-semibold truncate flex-1">
                                                        {exercise.name}
                                                    </p>
                                                    {saving === exercise.id && (
                                                        <span className="text-[10px] text-[var(--primary)] animate-pulse bg-[var(--primary)]/10 px-2 py-0.5 rounded-full">
                                                            Guardando...
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Muscle Chips Grid */}
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {MUSCLE_OPTIONS.map(option => {
                                                        const isSelected = exercise.muscleGroup === option;
                                                        const isProcessing = saving === exercise.id;

                                                        return (
                                                            <button
                                                                key={option}
                                                                onClick={() => !isSelected && updateMuscle(exercise.id, option)}
                                                                disabled={isProcessing || isSelected}
                                                                className={`px-2 py-2 rounded-lg text-[11px] font-medium transition-all border min-h-[36px] ${isSelected
                                                                    ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-lg shadow-purple-900/20'
                                                                    : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/50 hover:text-[var(--primary)]'
                                                                    } ${isProcessing && !isSelected ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                            >
                                                                {isSelected ? (
                                                                    <span className="flex items-center justify-center gap-1">
                                                                        <Check size={10} />
                                                                        {option}
                                                                    </span>
                                                                ) : (
                                                                    option
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {exercises.length === 0 && (
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center border border-[var(--border)]">
                            <Dumbbell size={32} className="mx-auto text-[var(--text-secondary)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)]">
                                Aún no hay ejercicios registrados.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* SECTION: Session History */}
            {activeSection === 'history' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Warning Card */}
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm flex gap-3 items-start backdrop-blur-md">
                        <AlertTriangle size={20} className="text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-yellow-200/90">
                            Edita o elimina sesiones con datos incorrectos. <span className="font-semibold">Los cambios son permanentes.</span>
                        </p>
                    </div>

                    {/* Sessions by Date */}
                    <div className="space-y-4">
                        {Object.entries(sessionsByDate).map(([dateStr, sessions]) => (
                            <div key={dateStr}>
                                {/* Sticky Date Header */}
                                <div className="sticky top-0 z-10 bg-[var(--bg-body)]/95 backdrop-blur-sm py-2 mb-2 border-b border-[var(--border)]">
                                    <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
                                        {dateStr}
                                    </p>
                                </div>

                                {/* Session Cards */}
                                <div className="space-y-2">
                                    {sessions.map(session => (
                                        <div key={session.id} className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    {/* Exercise Name with Muscle Chip */}
                                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                        <p className="font-semibold text-sm">{session.exercise?.name || 'Ejercicio'}</p>
                                                        {session.exercise?.muscleGroup && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${MUSCLE_COLORS[session.exercise.muscleGroup] || MUSCLE_COLORS['Otros']}`}>
                                                                {session.exercise.muscleGroup}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Sets - Monospace Grid */}
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {session.sets?.map((set, i) => (
                                                            <span
                                                                key={i}
                                                                className="text-xs bg-[var(--bg-dark)] px-2.5 py-1.5 rounded-lg border border-[var(--border)] font-mono"
                                                            >
                                                                <span className="text-[var(--primary)] font-bold">{set.weight}</span>
                                                                <span className="text-[var(--text-secondary)]">kg</span>
                                                                <span className="text-[var(--text-secondary)] mx-1">×</span>
                                                                <span className="text-white font-bold">{set.reps}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Action Buttons - 44px touch targets */}
                                                <div className="flex gap-1.5 shrink-0">
                                                    <button
                                                        onClick={() => navigate(`/session/${session.id}/edit`)}
                                                        className="w-11 h-11 rounded-xl bg-[var(--bg-dark)] hover:bg-[var(--primary)]/20 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-all flex items-center justify-center active:scale-95"
                                                        title="Editar sesión"
                                                    >
                                                        <Edit3 size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeletingSession(session)}
                                                        className="w-11 h-11 rounded-xl bg-[var(--bg-dark)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-500 transition-all flex items-center justify-center active:scale-95"
                                                        title="Eliminar sesión"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {workoutHistory.length === 0 && (
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center border border-[var(--border)]">
                            <History size={32} className="mx-auto text-[var(--text-secondary)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)]">
                                Aún no hay sesiones registradas.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Delete Confirmation Modal - Glassmorphism */}
            {deletingSession && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => !deleting && setDeletingSession(null)}
                >
                    <div
                        className="bg-[var(--bg-card)]/95 backdrop-blur-md rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-[var(--border)] animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => !deleting && setDeletingSession(null)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--bg-dark)] flex items-center justify-center text-[var(--text-secondary)] hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>

                        {/* Icon */}
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={32} className="text-red-500" />
                        </div>

                        {/* Title */}
                        <h3 className="text-xl font-bold text-center mb-2">¿Eliminar sesión?</h3>

                        {/* Description */}
                        <p className="text-sm text-[var(--text-secondary)] text-center mb-6 leading-relaxed">
                            Se eliminará <strong className="text-[var(--text-primary)]">{deletingSession.exercise?.name}</strong> del{' '}
                            {new Date(deletingSession.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.
                            <br />
                            <span className="text-red-400 text-xs">Esta acción no se puede deshacer.</span>
                        </p>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeletingSession(null)}
                                disabled={deleting}
                                className="flex-1 py-3.5 rounded-xl font-semibold bg-[var(--bg-dark)] text-[var(--text-primary)] hover:bg-[var(--bg-dark)]/80 disabled:opacity-50 transition-all active:scale-95 border border-[var(--border)]"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDeleteSession}
                                disabled={deleting}
                                className="flex-1 py-3.5 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-900/30"
                            >
                                {deleting ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Trash2 size={18} />
                                        Eliminar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}