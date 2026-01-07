import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Dumbbell, ChevronDown, ChevronRight, Play, Check,
    Trash2, BarChart2, Plus, Pencil, AlertTriangle, Trophy,
    Calendar, MoreVertical, X
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

export default function Routines() {
    // Estado unificado para evitar re-renders innecesarios
    const [routines, setRoutines] = useState([]);
    const [loading, setLoading] = useState(true);

    // Estado UI
    const [expandedRoutineId, setExpandedRoutineId] = useState(null);
    const [expandedDayId, setExpandedDayId] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const toast = useToast();

    // Memoizar rutina activa para acceso rápido O(1)
    const activeRoutine = useMemo(() => routines.find(r => r.isActive), [routines]);
    const otherRoutines = useMemo(() => routines.filter(r => !r.isActive), [routines]);

    useEffect(() => {
        loadRoutines();
    }, []);

    const loadRoutines = async () => {
        try {
            const data = await api.getRoutines();
            setRoutines(data);
            // Auto-expandir la activa si existe, para ver el próximo entreno rápido
            const active = data.find(r => r.isActive);
            if (active) {
                setExpandedRoutineId(active.id);
            }
        } catch (error) {
            console.error(error);
            toast.error("Error cargando rutinas");
        } finally {
            setLoading(false);
        }
    };

    // ⚡ LÓGICA OPTIMISTA: Actualiza la UI instantáneamente antes del servidor
    const handleActivate = async (id) => {
        const previousRoutines = [...routines];

        // 1. Update Optimista
        setRoutines(prev => prev.map(r => ({
            ...r,
            isActive: r.id === id
        })));

        setExpandedRoutineId(id); // Abrir la nueva activa automáticamente
        toast.success('Rutina activada'); // Feedback inmediato

        try {
            // 2. Llamada API en background
            await api.activateRoutine(id);
        } catch (error) {
            // 3. Rollback si falla
            setRoutines(previousRoutines);
            toast.error('Error de conexión, cambios revertidos');
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;

        const previousRoutines = [...routines];
        // Optimistic delete visual
        setRoutines(prev => prev.filter(r => r.id !== deleteConfirm.id));
        setDeleteConfirm(null);

        try {
            await api.deleteRoutine(deleteConfirm.id);
            toast.success('Rutina eliminada');
        } catch (error) {
            setRoutines(previousRoutines);
            toast.error('No se pudo eliminar la rutina');
        }
    };

    // Helper para acordeón tipo "Solo uno abierto a la vez"
    const toggleRoutine = (id) => {
        if (expandedRoutineId === id) {
            setExpandedRoutineId(null);
        } else {
            setExpandedRoutineId(id);
            setExpandedDayId(null); // Resetear día interno
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                <p className="text-[var(--text-secondary)] animate-pulse">Cargando entrenamientos...</p>
            </div>
        );
    }

    return (
        <div className="pb-24 space-y-8 animate-fade-in max-w-lg mx-auto">
            {/* Header Principal */}
            <div className="flex items-center justify-between pt-2">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-[var(--text-secondary)] bg-clip-text text-transparent">
                        Mis Rutinas
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)]">Gestiona tu plan de entrenamiento</p>
                </div>
                <Link
                    to="/import"
                    className="w-12 h-12 bg-[var(--primary)] rounded-2xl flex items-center justify-center shadow-[0_0_20px_-5px_var(--primary)] active:scale-95 transition-all hover:bg-opacity-90"
                >
                    <Plus size={24} color="white" strokeWidth={2.5} />
                </Link>
            </div>

            {/* SECCIÓN HERO: Rutina Activa */}
            {activeRoutine && (
                <section className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--primary)] uppercase tracking-wider pl-1">
                        <Trophy size={14} />
                        Plan Actual
                    </div>
                    <div className="relative group">
                        {/* Glow effect background */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--primary)] to-purple-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-500"></div>

                        <div className="relative">
                            <RoutineCard
                                routine={activeRoutine}
                                isActive={true}
                                isExpanded={expandedRoutineId === activeRoutine.id}
                                expandedDayId={expandedDayId}
                                onToggle={() => toggleRoutine(activeRoutine.id)}
                                onDayToggle={setExpandedDayId}
                                onDelete={() => setDeleteConfirm(activeRoutine)}
                            />
                        </div>
                    </div>
                </section>
            )}

            {/* Lista de Otras Rutinas */}
            <section className="space-y-4">
                <div className="flex items-center justify-between pl-1">
                    <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Biblioteca ({otherRoutines.length})
                    </h2>
                </div>

                {otherRoutines.length === 0 && !activeRoutine ? (
                    <EmptyState />
                ) : (
                    <div className="grid gap-3">
                        {otherRoutines.map(routine => (
                            <RoutineCard
                                key={routine.id}
                                routine={routine}
                                isActive={false}
                                isExpanded={expandedRoutineId === routine.id}
                                expandedDayId={expandedDayId}
                                onToggle={() => toggleRoutine(routine.id)}
                                onDayToggle={setExpandedDayId}
                                onActivate={() => handleActivate(routine.id)}
                                onDelete={() => setDeleteConfirm(routine)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Modal de Confirmación */}
            {deleteConfirm && (
                <DeleteModal
                    routineName={deleteConfirm.name}
                    onCancel={() => setDeleteConfirm(null)}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// SUB-COMPONENTES (Diseño Modular)
// ----------------------------------------------------------------------

function RoutineCard({
    routine,
    isActive,
    isExpanded,
    expandedDayId,
    onToggle,
    onDayToggle,
    onActivate,
    onDelete
}) {
    // Calculamos stats rápidos
    const totalExercises = routine.days.reduce((acc, d) => acc + d.exercises.length, 0);

    return (
        <div className={`
            bg-[var(--bg-card)] rounded-xl overflow-hidden transition-all duration-300
            ${isActive ? 'border border-[var(--primary)]/50 bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-dark)]' : 'border border-[var(--border)] hover:border-[var(--border)]/80'}
        `}>
            {/* Card Header (Clicable) */}
            <div
                onClick={onToggle}
                className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
            >
                {/* Icon Box */}
                <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors
                    ${isActive ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-900/40' : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'}
                `}>
                    {isActive ? <Trophy size={20} fill="currentColor" className="text-white/90" /> : <Dumbbell size={20} />}
                </div>

                {/* Info Text */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-bold text-lg truncate ${isActive ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                            {routine.name}
                        </h3>
                        {isActive && <span className="bg-[var(--primary)]/20 text-[var(--primary)] text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">ACTIVA</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1"><Calendar size={12} /> {routine.days.length} días</span>
                        <span className="w-1 h-1 rounded-full bg-[var(--border)]"></span>
                        <span>{totalExercises} ejercicios</span>
                    </div>
                </div>

                {/* Chevron animated */}
                <ChevronDown
                    className={`text-[var(--text-secondary)] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </div>

            {/* Expanded Content (Accordion) */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="border-t border-[var(--border)] bg-[var(--bg-dark)]/50">
                        {/* Days List */}
                        <div className="divide-y divide-[var(--border)]/50">
                            {routine.days.map((day) => (
                                <DayRow
                                    key={day.id}
                                    day={day}
                                    isExpanded={expandedDayId === day.id}
                                    onToggle={() => onDayToggle(expandedDayId === day.id ? null : day.id)}
                                />
                            ))}
                        </div>

                        {/* Action Footer */}
                        <div className="p-3 flex items-center justify-between bg-[var(--bg-card)] border-t border-[var(--border)]">
                            <div className="flex gap-2">
                                {!isActive && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onActivate(); }}
                                        className="btn-ghost text-xs text-[var(--primary)] font-bold flex items-center gap-2 px-3 py-2 bg-[var(--primary)]/10 rounded-lg hover:bg-[var(--primary)]/20"
                                    >
                                        <Check size={14} strokeWidth={3} /> ACTIVAR
                                    </button>
                                )}
                                <Link
                                    to={`/routines/${routine.id}/edit`}
                                    className="p-2 text-[var(--text-secondary)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                                >
                                    <Pencil size={18} />
                                </Link>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DayRow({ day, isExpanded, onToggle }) {
    return (
        <div className="group">
            <div
                onClick={onToggle}
                className="w-full px-4 py-3.5 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] active:bg-[var(--bg-card)] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <ChevronRight
                        size={16}
                        className={`text-[var(--text-secondary)] transition-transform duration-200 ${isExpanded ? 'rotate-90 text-white' : ''}`}
                    />
                    <div>
                        <p className={`text-sm font-medium ${isExpanded ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                            {day.dayName}
                        </p>
                        <p className="text-[10px] text-[var(--text-secondary)]">
                            {day.exercises.length} Ejercicios
                        </p>
                    </div>
                </div>

                {/* Botón de Acción Principal */}
                {day.isRestDay ? (
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--border)] px-2 py-1 rounded border border-transparent">
                        DESCANSO
                    </span>
                ) : (
                    <Link
                        to={`/workout/${day.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 pl-3 pr-4 py-1.5 bg-[var(--primary)] text-white text-xs font-bold rounded-full shadow-lg shadow-purple-900/20 active:scale-95 transition-transform hover:bg-purple-500"
                    >
                        <Play size={12} fill="currentColor" /> INICIAR
                    </Link>
                )}
            </div>

            {/* Ejercicios (Solo visible si expandido) */}
            {isExpanded && !day.isRestDay && (
                <div className="bg-[var(--bg-dark)] px-4 pb-4 pt-1 animate-fade-in">
                    <div className="pl-8 space-y-2 border-l-2 border-[var(--border)] ml-2">
                        {day.exercises.map((ex, i) => (
                            <div key={ex.id} className="pl-4 relative">
                                {/* Bullet point custom */}
                                <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-[var(--border)]"></div>
                                <p className="text-sm text-[var(--text-primary)]">{ex.name}</p>
                                <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                                    {ex.targetSets} series × {ex.targetReps} reps
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="border border-dashed border-[var(--border)] rounded-2xl p-8 text-center bg-[var(--bg-card)]/50">
            <div className="w-16 h-16 bg-[var(--bg-dark)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Dumbbell className="text-[var(--text-secondary)] opacity-50" size={32} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Sin rutinas aún</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-[200px] mx-auto">
                Crea tu propia rutina o importa una plantilla para empezar.
            </p>
            <Link to="/import" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--primary)] hover:text-white transition-colors">
                <Plus size={16} /> Crear primera rutina
            </Link>
        </div>
    );
}

function DeleteModal({ routineName, onCancel, onConfirm }) {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onCancel}>
            <div
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <AlertTriangle className="text-red-500" size={24} />
                </div>

                <h3 className="text-xl font-bold text-center mb-2">¿Eliminar Rutina?</h3>
                <p className="text-center text-[var(--text-secondary)] text-sm mb-6">
                    Estás a punto de borrar <span className="text-white font-medium">"{routineName}"</span>. Esta acción no se puede deshacer.
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={onCancel}
                        className="py-3 rounded-xl font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-900/20 active:scale-95 transition-all"
                    >
                        Sí, eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}