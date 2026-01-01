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

    const activeRoutine = routines.find(r => r.isActive);
    const otherRoutines = routines.filter(r => !r.isActive);

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
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Rutinas</h1>
                <Link
                    to="/import"
                    className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20"
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
                        : 'text-[var(--text-secondary)]'
                        }`}
                >
                    Activa
                </button>
                <button
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all'
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--text-secondary)]'
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
                            onToggle={() => setExpandedRoutine(expandedRoutine === activeRoutine.id ? null : activeRoutine.id)}
                            onDayToggle={(dayId) => setExpandedDay(expandedDay === dayId ? null : dayId)}
                            onDelete={handleDelete}
                            isActive
                        />
                    ) : (
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center">
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
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center">
                            <Dumbbell size={40} className="mx-auto text-[var(--text-secondary)] mb-3" />
                            <p className="font-medium mb-1">No hay rutinas</p>
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                Importa tu primera rutina
                            </p>
                            <Link to="/import" className="btn-primary inline-block text-sm">
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
                                onToggle={() => setExpandedRoutine(expandedRoutine === routine.id ? null : routine.id)}
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
        <div className={`bg-[var(--bg-card)] rounded-xl overflow-hidden ${isActive ? 'ring-2 ring-[var(--primary)]' : ''}`}>
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
                        }`}>
                        <Dumbbell size={18} className={isActive ? 'text-white' : 'text-[var(--text-secondary)]'} />
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{routine.name}</h3>
                            {isActive && (
                                <span className="text-[10px] bg-[var(--primary)]/20 text-[var(--primary)] px-2 py-0.5 rounded-full font-medium">
                                    ACTIVA
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">
                            {routine.days.length} días · {routine.days.reduce((acc, d) => acc + d.exercises.length, 0)} ejercicios
                        </p>
                    </div>
                </div>
                <ChevronDown
                    size={20}
                    className={`text-[var(--text-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Expanded Content - Days */}
            {isExpanded && (
                <div className="border-t border-[var(--border)] animate-fade-in">
                    {routine.days.map((day) => (
                        <div key={day.id} className="border-b border-[var(--border)] last:border-b-0">
                            {/* Day Header */}
                            <button
                                onClick={() => onDayToggle(day.id)}
                                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-dark)] transition-colors"
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
                                        className="w-8 h-8 bg-[var(--primary)] rounded-lg flex items-center justify-center"
                                    >
                                        <Play size={14} fill="white" className="ml-0.5" />
                                    </Link>
                                )}
                            </button>

                            {/* Day Exercises - Collapsed */}
                            {expandedDay === day.id && (
                                <div className="px-4 pb-3 space-y-2 animate-fade-in">
                                    {day.exercises.map((exercise, i) => (
                                        <div
                                            key={exercise.id}
                                            className="pl-6 py-2 flex items-center justify-between text-sm bg-[var(--bg-dark)] rounded-lg px-3"
                                        >
                                            <span className="text-[var(--text-secondary)]">
                                                {i + 1}. {exercise.name}
                                            </span>
                                            <span className="text-xs text-[var(--text-secondary)]">
                                                {exercise.targetSets}×{exercise.targetReps}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Actions */}
                    <div className="p-3 flex items-center justify-between bg-[var(--bg-dark)]">
                        <div className="flex items-center gap-2">
                            {!isActive && onActivate && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onActivate(); }}
                                    className="flex items-center gap-2 text-sm text-[var(--primary)] font-medium"
                                >
                                    <Check size={16} />
                                    Activar
                                </button>
                            )}
                            {isActive && (
                                <Link
                                    to="/progress"
                                    className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                                >
                                    <BarChart2 size={16} />
                                    Ver estadísticas
                                </Link>
                                    Ver estadísticas
                        </Link>
                            )}
                        <Link
                            to={`/routines/${routine.id}`}
                            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white mr-3"
                        >
                            <ChevronRight size={16} />
                            Detalles
                        </Link>
                        <Link
                            to={`/routines/${routine.id}/edit`}
                            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] mr-3"
                        >
                            <Pencil size={16} />
                            Editar
                        </Link>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(routine.id, routine.name); }}
                        className="btn-delete"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
                </div>
    )
}
        </div >
    );
}
