import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

export default function EditRoutine() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [routine, setRoutine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

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

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.updateRoutine(id, routine);
            navigate(`/workout/${routine.days[0]?.id || ''}`); // Redirect locally or back to list
        } catch (error) {
            console.error('Error updating routine:', error);
            alert('Error al guardar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    const updateRoutineField = (field, value) => {
        setRoutine(prev => ({ ...prev, [field]: value }));
    };

    // --- DAY OPERATIONS ---
    const updateDay = (index, field, value) => {
        const newDays = [...routine.days];
        newDays[index] = { ...newDays[index], [field]: value };
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    const addDay = () => {
        const newDay = {
            dayName: 'Nuevo Día',
            isRestDay: false,
            exercises: []
        };
        setRoutine(prev => ({ ...prev, days: [...prev.days, newDay] }));
    };

    const removeDay = (index) => {
        if (!window.confirm('¿Borrar este día y sus ejercicios?')) return;
        const newDays = [...routine.days];
        newDays.splice(index, 1);
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    const moveDay = (index, direction) => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === routine.days.length - 1) return;

        const newDays = [...routine.days];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [newDays[index], newDays[swapIndex]] = [newDays[swapIndex], newDays[index]];

        // Update order property just in case, though backend might handle index
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    // --- EXERCISE OPERATIONS ---
    const updateExercise = (dayIndex, exIndex, field, value) => {
        const newDays = [...routine.days];
        const newExercises = [...newDays[dayIndex].exercises];
        newExercises[exIndex] = { ...newExercises[exIndex], [field]: value };
        newDays[dayIndex].exercises = newExercises;
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    const addExercise = (dayIndex) => {
        const newDays = [...routine.days];
        newDays[dayIndex].exercises.push({
            name: '',
            targetSets: 3,
            targetReps: '8-12',
            restSeconds: 60,
            note: ''
        });
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    const removeExercise = (dayIndex, exIndex) => {
        const newDays = [...routine.days];
        newDays[dayIndex].exercises.splice(exIndex, 1);
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    const moveExercise = (dayIndex, exIndex, direction) => {
        const exercises = routine.days[dayIndex].exercises;
        if (direction === 'up' && exIndex === 0) return;
        if (direction === 'down' && exIndex === exercises.length - 1) return;

        const newDays = [...routine.days];
        const newExercises = [...newDays[dayIndex].exercises];
        const swapIndex = direction === 'up' ? exIndex - 1 : exIndex + 1;
        [newExercises[exIndex], newExercises[swapIndex]] = [newExercises[swapIndex], newExercises[exIndex]];
        newDays[dayIndex].exercises = newExercises;

        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    if (loading) return <div className="text-center py-10">Cargando...</div>;
    if (!routine) return <div className="text-center py-10">No encontrado</div>;

    return (
        <div className="space-y-6 pb-20 animate-fade-in max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-[var(--bg-card)]/90 backdrop-blur-md p-4 -mx-4 border-b border-[var(--border)] z-20">
                <Link to={`/routines/${id}`} className="text-[var(--text-secondary)] hover:text-white">
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-yellow-500" />
                    <span className="text-xs text-yellow-500">Edit Mode</span>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg font-medium hover:bg-opacity-90 disabled:opacity-50"
                >
                    <Save size={18} />
                    {saving ? 'Guardando...' : 'Guardar'}
                </button>
            </div>

            {/* Routine Info */}
            <div className="space-y-3 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">Nombre de la Rutina</label>
                    <input
                        type="text"
                        value={routine.name}
                        onChange={(e) => updateRoutineField('name', e.target.value)}
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 focus:border-[var(--primary)] outline-none font-bold text-lg"
                    />
                </div>
                <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">Descripción</label>
                    <input
                        type="text"
                        value={routine.description || ''}
                        onChange={(e) => updateRoutineField('description', e.target.value)}
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 focus:border-[var(--primary)] outline-none text-sm"
                    />
                </div>
            </div>

            {/* Days List */}
            <div className="space-y-6">
                {routine.days.map((day, dayIndex) => (
                    <div key={dayIndex} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                        {/* Day Header */}
                        <div className="p-3 bg-[var(--bg-dark)] border-b border-[var(--border)] flex items-center gap-2">
                            <div className="flex flex-col gap-1">
                                <button onClick={() => moveDay(dayIndex, 'up')} disabled={dayIndex === 0} className="text-[var(--text-secondary)] hover:text-white disabled:opacity-20"><ArrowUp size={14} /></button>
                                <button onClick={() => moveDay(dayIndex, 'down')} disabled={dayIndex === routine.days.length - 1} className="text-[var(--text-secondary)] hover:text-white disabled:opacity-20"><ArrowDown size={14} /></button>
                            </div>

                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={day.dayName}
                                    onChange={(e) => updateDay(dayIndex, 'dayName', e.target.value)}
                                    className="bg-transparent font-semibold w-full outline-none focus:text-[var(--primary)]"
                                    placeholder="Nombre del día (ej. Pull)"
                                />
                                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-1 cursor-pointer w-fit">
                                    <input
                                        type="checkbox"
                                        checked={day.isRestDay}
                                        onChange={(e) => updateDay(dayIndex, 'isRestDay', e.target.checked)}
                                        className="rounded border-[var(--border)] bg-[var(--bg-card)] text-[var(--primary)] focus:ring-0"
                                    />
                                    Es día de descanso
                                </label>
                            </div>

                            <button onClick={() => removeDay(dayIndex)} className="text-red-400 hover:text-red-300 p-2">
                                <Trash2 size={16} />
                            </button>
                        </div>

                        {/* Exercises List */}
                        {!day.isRestDay && (
                            <div className="p-3 space-y-3">
                                {day.exercises.map((ex, exIndex) => (
                                    <div key={exIndex} className="flex gap-2 items-start bg-[var(--bg-dark)]/50 p-2 rounded-lg group">
                                        <div className="flex flex-col gap-1 mt-1">
                                            <button onClick={() => moveExercise(dayIndex, exIndex, 'up')} disabled={exIndex === 0} className="text-[var(--text-secondary)] hover:text-white disabled:opacity-20"><ArrowUp size={12} /></button>
                                            <button onClick={() => moveExercise(dayIndex, exIndex, 'down')} disabled={exIndex === day.exercises.length - 1} className="text-[var(--text-secondary)] hover:text-white disabled:opacity-20"><ArrowDown size={12} /></button>
                                        </div>

                                        <div className="flex-1 space-y-2">
                                            <input
                                                type="text"
                                                value={ex.name}
                                                onChange={(e) => updateExercise(dayIndex, exIndex, 'name', e.target.value)}
                                                className="w-full bg-transparent border-b border-[var(--border)] focus:border-[var(--primary)] outline-none text-sm font-medium pb-1"
                                                placeholder="Nombre del ejercicio"
                                            />
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)]">Series</label>
                                                    <input
                                                        type="number"
                                                        value={ex.targetSets}
                                                        onChange={(e) => updateExercise(dayIndex, exIndex, 'targetSets', e.target.value)}
                                                        className="w-full bg-[var(--bg-card)] rounded px-2 py-1 text-xs"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)]">Reps</label>
                                                    <input
                                                        type="text"
                                                        value={ex.targetReps}
                                                        onChange={(e) => updateExercise(dayIndex, exIndex, 'targetReps', e.target.value)}
                                                        className="w-full bg-[var(--bg-card)] rounded px-2 py-1 text-xs"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)]">Descanso (s)</label>
                                                    <input
                                                        type="number"
                                                        value={ex.restSeconds || ''}
                                                        onChange={(e) => updateExercise(dayIndex, exIndex, 'restSeconds', e.target.value)}
                                                        className="w-full bg-[var(--bg-card)] rounded px-2 py-1 text-xs"
                                                    />
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                value={ex.note || ''}
                                                onChange={(e) => updateExercise(dayIndex, exIndex, 'note', e.target.value)}
                                                className="w-full bg-transparent text-[10px] text-[var(--text-secondary)] focus:text-white outline-none"
                                                placeholder="Notas (opcional)..."
                                            />
                                        </div>

                                        <button onClick={() => removeExercise(dayIndex, exIndex)} className="text-[var(--text-secondary)] hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}

                                <button
                                    onClick={() => addExercise(dayIndex)}
                                    className="w-full py-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors flex items-center justify-center gap-1"
                                >
                                    <Plus size={14} /> Agregar Ejercicio
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <button
                    onClick={addDay}
                    className="w-full py-3 bg-[var(--bg-card)] rounded-xl border border-[var(--primary)]/50 text-[var(--primary)] font-medium hover:bg-[var(--primary)]/10 transition-colors flex items-center justify-center gap-2"
                >
                    <Plus size={18} /> Agregar Nuevo Día
                </button>
            </div>
        </div>
    );
}
