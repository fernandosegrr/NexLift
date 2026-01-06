import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Dumbbell, Check, ChevronDown, ChevronRight, Info, History, Trash2, Edit3, AlertTriangle } from 'lucide-react';
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

    // Group exercises by muscle
    const exercisesByMuscle = useMemo(() => {
        return exercises.reduce((acc, ex) => {
            const muscle = ex.muscleGroup || 'Sin clasificar';
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});
    }, [exercises]);

    // Group sessions by date
    const sessionsByDate = useMemo(() => {
        const groups = {};
        workoutHistory.forEach(session => {
            const dateStr = new Date(session.date).toLocaleDateString('es-ES', {
                weekday: 'short', day: 'numeric', month: 'short'
            });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(session);
        });
        return groups;
    }, [workoutHistory]);

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
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <SettingsIcon size={24} className="text-[var(--primary)]" />
                    Ajustes
                </h1>
                <p className="text-[var(--text-secondary)] text-sm">Gestiona ejercicios y sesiones</p>
            </div>

            {/* Section Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveSection('muscles')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeSection === 'muscles'
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                        }`}
                >
                    <Dumbbell size={16} />
                    Músculos
                </button>
                <button
                    onClick={() => setActiveSection('history')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeSection === 'history'
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                        }`}
                >
                    <History size={16} />
                    Historial
                </button>
            </div>

            {/* SECTION: Muscle Classification */}
            {activeSection === 'muscles' && (
                <>
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-sm flex gap-3 items-start">
                        <Info size={20} className="text-[var(--primary)] shrink-0 mt-0.5" />
                        <p className="text-[var(--text-secondary)]">
                            Toca un grupo muscular para ver sus ejercicios y reasígnalos si es necesario.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {Object.entries(exercisesByMuscle).sort().map(([muscle, muscleExercises]) => (
                            <div key={muscle} className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                                <button
                                    onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Dumbbell size={18} className="text-[var(--primary)]" />
                                        <span className="font-medium">{muscle}</span>
                                        <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                                            {muscleExercises.length}
                                        </span>
                                    </div>
                                    {expandedMuscle === muscle ? (
                                        <ChevronDown size={18} className="text-[var(--text-secondary)]" />
                                    ) : (
                                        <ChevronRight size={18} className="text-[var(--text-secondary)]" />
                                    )}
                                </button>

                                {expandedMuscle === muscle && (
                                    <div className="px-4 pb-3 space-y-2 animate-fade-in bg-[var(--bg-dark)]/30 pt-2">
                                        {muscleExercises.map(exercise => (
                                            <div key={exercise.id} className="bg-[var(--bg-dark)] rounded-lg p-3 border border-[var(--border)]">
                                                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                                                    {exercise.name}
                                                    {saving === exercise.id && <span className="text-[10px] text-[var(--primary)] animate-pulse">Guardando...</span>}
                                                </p>

                                                <div className="flex flex-wrap gap-1.5">
                                                    {MUSCLE_OPTIONS.map(option => {
                                                        const isSelected = exercise.muscleGroup === option;
                                                        const isProcessing = saving === exercise.id;

                                                        return (
                                                            <button
                                                                key={option}
                                                                onClick={() => updateMuscle(exercise.id, option)}
                                                                disabled={isProcessing}
                                                                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${isSelected
                                                                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                                                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--text-secondary)]'
                                                                    } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                {isSelected ? (
                                                                    <span className="flex items-center gap-1">
                                                                        <Check size={12} />
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
                </>
            )}

            {/* SECTION: Session History */}
            {activeSection === 'history' && (
                <>
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-sm flex gap-3 items-start">
                        <AlertTriangle size={20} className="text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-[var(--text-secondary)]">
                            Edita o elimina sesiones con datos incorrectos. Los cambios son permanentes.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {Object.entries(sessionsByDate).map(([dateStr, sessions]) => (
                            <div key={dateStr}>
                                <p className="text-xs font-medium text-[var(--text-secondary)] mb-2 px-1">{dateStr}</p>
                                <div className="space-y-2">
                                    {sessions.map(session => (
                                        <div key={session.id} className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border)]">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm truncate">{session.exercise?.name || 'Ejercicio'}</p>
                                                    <div className="flex gap-2 mt-1 flex-wrap">
                                                        {session.sets?.slice(0, 4).map((set, i) => (
                                                            <span key={i} className="text-xs bg-[var(--bg-dark)] px-2 py-0.5 rounded text-[var(--text-secondary)]">
                                                                {set.weight}kg x {set.reps}
                                                            </span>
                                                        ))}
                                                        {(session.sets?.length || 0) > 4 && (
                                                            <span className="text-xs text-[var(--text-secondary)]">+{session.sets.length - 4} más</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 ml-2">
                                                    <button
                                                        onClick={() => navigate(`/session/${session.id}/edit`)}
                                                        className="p-2 rounded-lg bg-[var(--bg-dark)] hover:bg-[var(--primary)]/20 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                                                    >
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeletingSession(session)}
                                                        className="p-2 rounded-lg bg-[var(--bg-dark)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
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
                </>
            )}

            {/* Delete Confirmation Modal - Mobile Optimized */}
            {deletingSession && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => !deleting && setDeletingSession(null)}
                >
                    <div
                        className="bg-[var(--bg-card)] rounded-2xl p-5 sm:p-6 max-w-sm w-full mx-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={28} className="text-red-500" />
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-center mb-2">¿Eliminar sesión?</h3>
                        <p className="text-sm text-[var(--text-secondary)] text-center mb-6 leading-relaxed">
                            Se eliminará <strong className="text-[var(--text-primary)]">{deletingSession.exercise?.name}</strong> del {new Date(deletingSession.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                            <button
                                onClick={() => setDeletingSession(null)}
                                disabled={deleting}
                                className="flex-1 py-3.5 rounded-xl font-semibold bg-[var(--bg-dark)] text-[var(--text-primary)] hover:bg-[var(--bg-dark)]/80 disabled:opacity-50 transition-colors order-2 sm:order-1"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDeleteSession}
                                disabled={deleting}
                                className="flex-1 py-3.5 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors order-1 sm:order-2"
                            >
                                {deleting ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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