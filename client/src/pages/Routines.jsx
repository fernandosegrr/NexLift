import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Dumbbell, ChevronDown, ChevronRight, Play, Check,
    Trash2, BarChart2, Plus, Pencil
} from 'lucide-react';
import { api } from '../services/api';

export default function Routines() {
    const [routines, setRoutines] = useState([]);
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'all'
    const [expandedRoutine, setExpandedRoutine] = useState(null);
    const [expandedDay, setExpandedDay] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRoutines();
    }, []);

    async function fetchRoutines() {
        try {
            const data = await api.getRoutines();
            setRoutines(data);
            // Auto-expand active routine
            const active = data.find(r => r.isActive);
            if (active) setExpandedRoutine(active.id);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleActivate(id) {
        try {
            await api.activateRoutine(id);
            fetchRoutines();
        } catch (error) {
            console.error('Error activating:', error);
        }
    }

    async function handleDelete(id, name) {
        if (!confirm(`¿Eliminar "${name}"?`)) return;
        try {
            await api.deleteRoutine(id);
            setRoutines(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error('Error:', error);
        }
    }

    // Helper para cambiar de rutina y cerrar días abiertos anteriores
    const toggleRoutine = (id) => {
        if (expandedRoutine === id) {
            setExpandedRoutine(null);
        } else {
            setExpandedRoutine(id);
            setExpandedDay(null); // Resetear día expandido al cambiar de rutina
        }
    };

    const activeRoutine = routines.find(r => r.isActive);

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
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Rutinas</h1>
                <Link
                    to="/import"
                    className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 active:scale-95 transition-transform"
                >
                    <Plus size={20} />
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 bg-[var(--bg-card)] p-1 rounded-xl">
                <button
                    onClick={() => setActiveTab('active')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'active'
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                >
                    Activa
                </button>
                <button
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all'
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                >
                    Todas ({routines.length})
                </button>
            </div>

            {/* Active Tab Content */}
            {activeTab === 'active' && (
                <div className="space-y-4">
                    {activeRoutine ? (
                        <RoutineCard
                            routine={activeRoutine}
                            isExpanded={expandedRoutine === activeRoutine.id}
                            expandedDay={expandedDay}
                            onToggle={() => toggleRoutine(activeRoutine.id)}
                            onDayToggle={(dayId) => setExpandedDay(expandedDay === dayId ? null : dayId)}
                            onDelete={handleDelete}
                            isActive
                        />
                    ) : (
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center border border-[var(--border)]">
                            <Dumbbell size={40} className="mx-auto text-[var(--text-secondary)] mb-3" />
                            <p className="font-medium mb-1">Sin rutina activa</p>
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                Selecciona una rutina en la pestaña "Todas"
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* All Tab Content */}
            {activeTab === 'all' && (
                <div className="space-y-3">
                    {routines.length === 0 ? (
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center border border-[var(--border)]">
                            <Dumbbell size={40} className="mx-auto text-[var(--text-secondary)] mb-3" />
                            <p className="font-medium mb-1">No hay rutinas</p>
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                Importa tu primera rutina
                            </p>
                            <Link to="/import" className="btn-primary inline-block text-sm px-6 py-2">
                                Importar Rutina
                            </Link>
                        </div>
                    ) : (
                        routines.map(routine => (
                            <RoutineCard
                                key={routine.id}
                                routine={routine}
                                isExpanded={expandedRoutine === routine.id}
                                expandedDay={expandedDay}
                                onToggle={() => toggleRoutine(routine.id)}
                                onDayToggle={(dayId) => setExpandedDay(expandedDay === dayId ? null : dayId)}
                                onActivate={() => handleActivate(routine.id)}
                                onDelete={handleDelete}
                                isActive={routine.isActive}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function RoutineCard({
    routine,
    isExpanded,
    expandedDay,
    onToggle,
    onDayToggle,
    onActivate,
    onDelete,
    isActive
}) {
    return (
        <div className={`bg-[var(--bg-card)] rounded-xl overflow-hidden border transition-all ${isActive
            ? 'border-[var(--primary)] ring-1 ring-[var(--primary)] shadow-[0_0_15px_-3px_rgba(139,92,246,0.3)]'
            : 'border-[var(--border)]'
            }`}>
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
                        }`}>
                        <Dumbbell size={18} className={isActive ? 'text-white' : 'text-[var(--text-secondary)]'} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate">{routine.name}</h3>
                            {isActive && (
                                <span className="text-[10px] bg-[var(--primary)]/20 text-[var(--primary)] px-2 py-0.5 rounded-full font-medium shrink-0">
                                    ACTIVA
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] truncate">
                            {routine.days.length} días · {routine.days.reduce((acc, d) => acc + d.exercises.length, 0)} ejercicios
                        </p>
                    </div>
                </div>
                <ChevronDown
                    size={20}
                    className={`text-[var(--text-secondary)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Expanded Content - Days */}
            {isExpanded && (
                <div className="border-t border-[var(--border)] animate-fade-in bg-[var(--bg-dark)]/30">
                    {routine.days.map((day) => (
                        <div key={day.id} className="border-b border-[var(--border)] last:border-b-0">
                            {/* Day Header - CORREGIDO: Usar div en lugar de button para evitar nesting inválido */}
                            <div
                                onClick={() => onDayToggle(day.id)}
                                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-dark)] transition-colors cursor-pointer"
                                role="button"
                                tabIndex={0}
                            >
                                <div className="flex items-center gap-2">
                                    <ChevronRight
                                        size={16}
                                        className={`text-[var(--text-secondary)] transition-transform ${expandedDay === day.id ? 'rotate-90' : ''}`}
                                    />
                                    <span className="font-medium text-sm">{day.dayName}</span>
                                    <span className="text-xs text-[var(--text-secondary)]">
                                        ({day.exercises.length})
                                    </span>
                                </div>
                                {!day.isRestDay && (
                                    <Link
                                        to={`/workout/${day.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-8 h-8 bg-[var(--primary)] rounded-lg flex items-center justify-center hover:bg-[var(--primary)]/90 transition-colors active:scale-95"
                                    >
                                        <Play size={14} fill="white" className="ml-0.5" />
                                    </Link>
                                )}
                            </div>

                            {/* Day Exercises - Collapsed */}
                            {expandedDay === day.id && (
                                <div className="px-4 pb-3 space-y-1 animate-fade-in">
                                    {day.exercises.map((exercise, i) => (
                                        <div
                                            key={exercise.id}
                                            className="pl-8 pr-3 py-2 flex items-center justify-between text-sm bg-[var(--bg-dark)] rounded-lg border border-[var(--border)]/50"
                                        >
                                            <span className="text-[var(--text-primary)] truncate mr-2">
                                                {i + 1}. {exercise.name}
                                            </span>
                                            <span className="text-xs text-[var(--text-secondary)] shrink-0 font-mono">
                                                {exercise.targetSets}×{exercise.targetReps}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Actions Panel */}
                    <div className="p-3 flex items-center justify-between bg-[var(--bg-dark)] border-t border-[var(--border)]">
                        <div className="flex items-center gap-2">
                            {!isActive && onActivate && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onActivate(); }}
                                    className="flex items-center gap-2 text-sm text-[var(--primary)] font-medium bg-[var(--primary)]/10 px-3 py-1.5 rounded-lg border border-[var(--primary)]/20 active:scale-95 transition-transform"
                                >
                                    <Check size={16} />
                                    Activar
                                </button>
                            )}
                            {isActive && (
                                <Link
                                    to="/progress"
                                    className="p-2 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                                    title="Ver estadísticas"
                                >
                                    <BarChart2 size={20} />
                                </Link>
                            )}
                        </div>

                        <div className="flex items-center gap-1">
                            <Link
                                to={`/routines/${routine.id}`}
                                className="p-2 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                            >
                                <ChevronRight size={20} />
                            </Link>
                            <Link
                                to={`/routines/${routine.id}/edit`}
                                className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                            >
                                <Pencil size={20} />
                            </Link>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(routine.id, routine.name); }}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}