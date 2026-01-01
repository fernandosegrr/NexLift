import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, Calendar, Dumbbell, Clock, Pencil } from 'lucide-react';
import { api } from '../services/api';

export default function RoutineDetail() {
    const { id } = useParams();
    const [routine, setRoutine] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchRoutine() {
            try {
                const data = await api.getRoutine(id);
                setRoutine(data);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchRoutine();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!routine) {
        return (
            <div className="text-center py-12">
                <p className="text-[var(--text-secondary)]">Rutina no encontrada</p>
                <Link to="/routines" className="text-[var(--primary)] mt-2 inline-block">
                    Volver a rutinas
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
            {/* Header */}
            <div>
                <Link
                    to="/routines"
                    className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-white mb-4"
                >
                    <ArrowLeft size={18} />
                    <span>Rutinas</span>
                </Link>

                {/* CORRECCIÓN: flex-wrap y manejo de anchos para evitar desbordamiento */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold break-words flex-1 min-w-0">
                        {routine.name}
                    </h1>
                    <Link
                        to={`/routines/${id}/edit`}
                        className="shrink-0 bg-[var(--primary)] text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-opacity-80 transition-colors flex items-center gap-2 self-start sm:self-auto"
                    >
                        <Pencil size={16} /> EDITAR
                    </Link>
                </div>

                {routine.description && (
                    <p className="text-[var(--text-secondary)] mt-1">{routine.description}</p>
                )}
            </div>

            {/* Days */}
            <div className="space-y-4">
                {routine.days.map((day) => (
                    <div key={day.id} className="card overflow-hidden bg-[var(--bg-card)] rounded-xl">
                        <div className="p-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
                                    <Calendar size={20} className="text-[var(--primary)]" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-semibold truncate">{day.dayName}</h3>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {day.exercises.length} ejercicios
                                    </p>
                                </div>
                            </div>

                            {/* Actions area - prevenimos que se salga también */}
                            {day.isRestDay ? (
                                <span className="shrink-0 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-dark)] px-3 py-1 rounded-lg border border-[var(--border)] self-start sm:self-auto">
                                    ☕ Día de Descanso
                                </span>
                            ) : (
                                <Link
                                    to={`/workout/${day.id}`}
                                    className="shrink-0 btn-primary flex items-center gap-2 text-sm py-2 px-4 w-full sm:w-auto justify-center bg-[var(--primary)] rounded-lg text-white"
                                >
                                    <Play size={16} />
                                    Empezar
                                </Link>
                            )}
                        </div>

                        {/* Exercises */}
                        <div className="divide-y divide-[var(--border)]">
                            {day.exercises.map((exercise) => (
                                <div key={exercise.id} className="p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <h4 className="font-medium">{exercise.name}</h4>
                                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-[var(--text-secondary)]">
                                                <span className="flex items-center gap-1">
                                                    <Dumbbell size={14} />
                                                    {exercise.targetSets} × {exercise.targetReps}
                                                </span>
                                                {exercise.restSeconds && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={14} />
                                                        {exercise.restSeconds}s
                                                    </span>
                                                )}
                                            </div>
                                            {exercise.note && (
                                                <p className="text-xs text-[var(--accent)] mt-2 italic">
                                                    💡 {exercise.note}
                                                </p>
                                            )}
                                        </div>

                                        {/* Last workout indicator */}
                                        {exercise.workoutLogs?.length > 0 && (
                                            <div className="flex items-center gap-2 sm:block sm:text-right mt-2 sm:mt-0 bg-[var(--bg-dark)] sm:bg-transparent p-2 sm:p-0 rounded-lg">
                                                <p className="text-xs text-[var(--text-secondary)]">Último:</p>
                                                <p className="text-sm font-medium text-[var(--success)] text-green-400">
                                                    {exercise.workoutLogs[0].sets[0]?.weight}kg
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}