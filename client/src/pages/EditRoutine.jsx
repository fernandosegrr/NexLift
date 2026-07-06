import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle, Layers, Check } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

const BLOCK_PHASES = [
    { value: 'accumulation', label: 'Acumulación' },
    { value: 'intensification', label: 'Intensificación' },
    { value: 'deload', label: 'Descarga' },
    { value: 'custom', label: 'Personalizado' }
];

export default function EditRoutine() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [routine, setRoutine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [knownExercises, setKnownExercises] = useState([]); // For autocomplete

    // Mesociclos: se guardan aparte de la rutina (endpoints propios), no vía el
    // botón "Guardar" general — cada acción (crear/editar/borrar/reordenar) es
    // inmediata, igual que "Iniciar bloque" en RoutineDetail.
    const [blocks, setBlocks] = useState([]);
    const [savingBlockIndex, setSavingBlockIndex] = useState(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const [routineData, exercisesData] = await Promise.all([
                    api.getRoutine(id),
                    api.getExercises()
                ]);
                setRoutine(routineData);
                setBlocks(routineData.blocks || []);
                // Extract unique names for autocomplete
                const uniqueNames = [...new Set(exercisesData.map(e => e.name.toLowerCase()))];
                setKnownExercises(uniqueNames.sort());
            } catch (error) {
                console.error('Error:', error);
                toast.error('Error al cargar la rutina');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [id]);

    // --- BLOCK OPERATIONS (mesociclos) ---
    const updateBlockField = (index, field, value) => {
        setBlocks(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b));
    };

    const addBlockDraft = () => {
        setBlocks(prev => [...prev, { name: '', phase: 'custom', durationWeeks: 4, order: prev.length }]);
    };

    const saveBlock = async (index) => {
        const block = blocks[index];
        if (!block.name.trim()) {
            toast.error('El bloque necesita un nombre');
            return;
        }
        setSavingBlockIndex(index);
        try {
            const payload = { name: block.name, phase: block.phase, order: block.order, durationWeeks: parseInt(block.durationWeeks) || 4 };
            const saved = block.id
                ? await api.updateRoutineBlock(id, block.id, payload)
                : await api.createRoutineBlock(id, payload);
            setBlocks(prev => prev.map((b, i) => i === index ? saved : b));
            toast.success('Bloque guardado');
        } catch (error) {
            console.error('Error saving block:', error);
            toast.error('Error al guardar el bloque');
        } finally {
            setSavingBlockIndex(null);
        }
    };

    const removeBlock = async (index) => {
        const block = blocks[index];
        if (block.id) {
            if (!window.confirm('¿Borrar este bloque?')) return;
            try {
                await api.deleteRoutineBlock(id, block.id);
            } catch (error) {
                console.error('Error deleting block:', error);
                toast.error('Error al borrar el bloque');
                return;
            }
        }
        setBlocks(prev => prev.filter((_, i) => i !== index));
    };

    const moveBlock = (index, direction) => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === blocks.length - 1) return;
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        const newBlocks = [...blocks];
        [newBlocks[index], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[index]];
        newBlocks[index] = { ...newBlocks[index], order: index };
        newBlocks[swapIndex] = { ...newBlocks[swapIndex], order: swapIndex };
        setBlocks(newBlocks);

        // Persistir el nuevo orden solo en los bloques que ya existen en el servidor
        [newBlocks[index], newBlocks[swapIndex]].forEach(b => {
            if (b.id) api.updateRoutineBlock(id, b.id, b).catch(() => toast.error('Error al reordenar bloques'));
        });
    };

    const handleSave = async () => {
        if (!routine.name.trim()) {
            toast.error('La rutina necesita un nombre');
            return;
        }

        const emptyDay = routine.days.find(day => !day.isRestDay && (day.exercises || []).length === 0);
        if (emptyDay) {
            toast.error(`"${emptyDay.dayName || 'Día'}" no tiene ejercicios. Agrega al menos uno o márcalo como descanso.`);
            return;
        }

        const invalidSets = routine.days.some(day =>
            (day.exercises || []).some(ex => isNaN(parseInt(ex.targetSets, 10)))
        );
        if (invalidSets) {
            toast.error('Hay ejercicios con series inválidas. Revisa los números.');
            return;
        }

        setSaving(true);
        const payload = {
            ...routine,
            days: routine.days.map(day => ({
                ...day,
                exercises: (day.exercises || []).map(ex => ({
                    ...ex,
                    targetSets: parseInt(ex.targetSets, 10) || 3,
                    restSeconds: parseInt(ex.restSeconds, 10) || 60
                }))
            }))
        };
        try {
            await api.updateRoutine(id, payload);
            toast.success('Rutina actualizada');
            navigate('/routines');
        } catch (error) {
            console.error('Error updating routine:', error);
            toast.error('Error al guardar. Intenta de nuevo.');
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
            dayName: '',
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
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    // --- EXERCISE OPERATIONS ---
    const updateExercise = (dayIndex, exIndex, field, value) => {
        setRoutine(prev => {
            const newDays = prev.days.map((day, dIdx) => {
                if (dIdx !== dayIndex) return day;
                return {
                    ...day,
                    exercises: day.exercises.map((ex, eIdx) => {
                        if (eIdx !== exIndex) return ex;
                        return { ...ex, [field]: value };
                    })
                };
            });
            return { ...prev, days: newDays };
        });
    };

    const addExercise = (dayIndex) => {
        const newDays = [...routine.days];
        newDays[dayIndex].exercises.push({
            name: '',
            muscleGroup: '',
            targetSets: 3,
            targetReps: '8-12',
            restSeconds: 60,
            note: '',
            isUnilateral: false
        });
        setRoutine(prev => ({ ...prev, days: newDays }));
    };

    const removeExercise = (dayIndex, exIndex) => {
        setRoutine(prev => {
            const newDays = prev.days.map((day, dIdx) => {
                if (dIdx !== dayIndex) return day;
                return {
                    ...day,
                    exercises: day.exercises.filter((_, eIdx) => eIdx !== exIndex)
                };
            });
            return { ...prev, days: newDays };
        });
    };

    const moveExercise = (dayIndex, exIndex, direction) => {
        const exercises = routine.days[dayIndex].exercises;
        if (direction === 'up' && exIndex === 0) return;
        if (direction === 'down' && exIndex === exercises.length - 1) return;

        setRoutine(prev => {
            const newDays = prev.days.map((day, dIdx) => {
                if (dIdx !== dayIndex) return day;

                const newExercises = [...day.exercises];
                const swapIndex = direction === 'up' ? exIndex - 1 : exIndex + 1;
                [newExercises[exIndex], newExercises[swapIndex]] = [newExercises[swapIndex], newExercises[exIndex]];

                return { ...day, exercises: newExercises };
            });
            return { ...prev, days: newDays };
        });
    };

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!routine) return <div className="text-center py-10">No encontrado</div>;

    return (
        <div className="space-y-6 pb-20 animate-fade-in max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-[var(--bg-main)]/95 backdrop-blur-md p-4 -mx-4 border-b border-[var(--border)] z-20">
                <Link to={`/routines/${id}`} className="text-[var(--text-secondary)] hover:text-white p-2 -ml-2">
                    <ArrowLeft size={22} />
                </Link>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-card)] px-2 py-1 rounded">MODO EDITOR</span>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg font-medium hover:bg-opacity-90 disabled:opacity-50 transition-all active:scale-95"
                >
                    {saving ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                    {saving ? '...' : 'Guardar'}
                </button>
            </div>

            {/* Routine Info */}
            <div className="space-y-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1 uppercase tracking-wider font-bold">Nombre de la Rutina</label>
                    <input
                        type="text"
                        value={routine.name}
                        onChange={(e) => updateRoutineField('name', e.target.value)}
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-4 py-3 focus:border-[var(--primary)] outline-none font-bold text-lg transition-colors"
                        placeholder="Ej. Hipertrofia PPL"
                    />
                </div>
                <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1 uppercase tracking-wider font-bold">Descripción</label>
                    <input
                        type="text"
                        value={routine.description || ''}
                        onChange={(e) => updateRoutineField('description', e.target.value)}
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-4 py-3 focus:border-[var(--primary)] outline-none text-sm transition-colors"
                        placeholder="Ej. Enfocada en fuerza y básicos"
                    />
                </div>
            </div>

            {/* Mesociclos (bloques) — opcional, se guarda aparte de la rutina */}
            <div className="space-y-3 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <Layers size={16} className="text-[var(--primary)]" />
                    <h3 className="font-bold text-sm">Mesociclos</h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                    Opcional: divide esta rutina en bloques (acumulación, intensificación, descarga...). Cada bloque se guarda al instante, no con el botón "Guardar" general.
                </p>

                {blocks.map((block, index) => (
                    <div key={block.id || `draft-${index}`} className="flex gap-2 items-start bg-[var(--bg-main)]/50 p-3 rounded-xl border border-transparent hover:border-[var(--border)] transition-colors">
                        <div className="flex flex-col gap-1 mt-1">
                            <button
                                onClick={() => moveBlock(index, 'up')}
                                disabled={index === 0}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md"
                            >
                                <ArrowUp size={14} />
                            </button>
                            <button
                                onClick={() => moveBlock(index, 'down')}
                                disabled={index === blocks.length - 1}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md"
                            >
                                <ArrowDown size={14} />
                            </button>
                        </div>

                        <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={block.name}
                                    onChange={(e) => updateBlockField(index, 'name', e.target.value)}
                                    className="flex-1 bg-transparent border-b border-[var(--border)] focus:border-[var(--primary)] outline-none text-sm font-semibold pb-1 placeholder:text-[var(--text-secondary)]/50"
                                    placeholder="Nombre del bloque"
                                />
                                {block.startedAt && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--primary)]/40 bg-[var(--primary)]/15 text-[var(--primary)] font-semibold shrink-0">
                                        Iniciado
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Fase</label>
                                    <select
                                        value={block.phase}
                                        onChange={(e) => updateBlockField(index, 'phase', e.target.value)}
                                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[var(--primary)] outline-none"
                                    >
                                        {BLOCK_PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Duración (semanas)</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={block.durationWeeks}
                                        onChange={(e) => updateBlockField(index, 'durationWeeks', e.target.value)}
                                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[var(--primary)] outline-none text-center"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1 mt-1">
                            <button
                                onClick={() => saveBlock(index)}
                                disabled={savingBlockIndex === index}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--primary)] disabled:opacity-40 bg-[var(--bg-card)] rounded-md"
                                title="Guardar bloque"
                            >
                                <Check size={14} />
                            </button>
                            <button
                                onClick={() => removeBlock(index)}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-red-400 bg-[var(--bg-card)] rounded-md"
                                title="Borrar bloque"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}

                <button
                    onClick={addBlockDraft}
                    className="w-full py-2.5 border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={16} /> Agregar Bloque
                </button>
            </div>

            {/* Days List */}
            <div className="space-y-6">
                {routine.days.map((day, dayIndex) => (
                    <div key={dayIndex} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden transition-all hover:border-[var(--border)]/80">
                        {/* Day Header */}
                        <div className="p-3 bg-[var(--bg-dark)] border-b border-[var(--border)] flex items-center gap-3">
                            <div className="flex flex-col gap-1">
                                <button
                                    onClick={() => moveDay(dayIndex, 'up')}
                                    disabled={dayIndex === 0}
                                    className="p-1 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 active:bg-[var(--bg-card)] rounded"
                                >
                                    <ArrowUp size={18} />
                                </button>
                                <button
                                    onClick={() => moveDay(dayIndex, 'down')}
                                    disabled={dayIndex === routine.days.length - 1}
                                    className="p-1 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 active:bg-[var(--bg-card)] rounded"
                                >
                                    <ArrowDown size={18} />
                                </button>
                            </div>

                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={day.dayName}
                                    onChange={(e) => updateDay(dayIndex, 'dayName', e.target.value)}
                                    className="bg-transparent font-bold text-lg w-full outline-none focus:text-[var(--primary)] placeholder:text-[var(--text-secondary)]/50"
                                    placeholder={`Día ${dayIndex + 1}`}
                                />
                                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-1 cursor-pointer w-fit select-none">
                                    <input
                                        type="checkbox"
                                        checked={day.isRestDay}
                                        onChange={(e) => updateDay(dayIndex, 'isRestDay', e.target.checked)}
                                        className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg-card)] text-[var(--primary)] focus:ring-0"
                                    />
                                    Es día de descanso
                                </label>
                            </div>

                            <button onClick={() => removeDay(dayIndex)} className="text-[var(--text-secondary)] hover:text-red-400 p-2 hover:bg-red-500/10 rounded-lg transition-colors">
                                <Trash2 size={20} />
                            </button>
                        </div>

                        {/* Exercises List */}
                        {!day.isRestDay && (
                            <div className="p-3 space-y-3">
                                {day.exercises.map((ex, exIndex) => (
                                    <div key={exIndex} className="flex gap-3 items-start bg-[var(--bg-main)]/50 p-3 rounded-xl border border-transparent hover:border-[var(--border)] transition-colors">
                                        <div className="flex flex-col gap-1 mt-1">
                                            <button
                                                onClick={() => moveExercise(dayIndex, exIndex, 'up')}
                                                disabled={exIndex === 0}
                                                className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md"
                                            >
                                                <ArrowUp size={14} />
                                            </button>
                                            <button
                                                onClick={() => moveExercise(dayIndex, exIndex, 'down')}
                                                disabled={exIndex === day.exercises.length - 1}
                                                className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>

                                        <div className="flex-1 space-y-3">
                                            <input
                                                type="text"
                                                list="exercise-suggestions"
                                                value={ex.name}
                                                onChange={(e) => updateExercise(dayIndex, exIndex, 'name', e.target.value)}
                                                className="w-full bg-transparent border-b border-[var(--border)] focus:border-[var(--primary)] outline-none text-sm font-semibold pb-1 placeholder:text-[var(--text-secondary)]/50"
                                                placeholder="Nombre del ejercicio"
                                            />
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Series</label>
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        value={ex.targetSets}
                                                        onChange={(e) => updateExercise(dayIndex, exIndex, 'targetSets', e.target.value)}
                                                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[var(--primary)] outline-none text-center"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Reps</label>
                                                    <input
                                                        type="text"
                                                        value={ex.targetReps}
                                                        onChange={(e) => updateExercise(dayIndex, exIndex, 'targetReps', e.target.value)}
                                                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[var(--primary)] outline-none text-center"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Descanso</label>
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        value={ex.restSeconds || ''}
                                                        onChange={(e) => updateExercise(dayIndex, exIndex, 'restSeconds', e.target.value)}
                                                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[var(--primary)] outline-none text-center"
                                                        placeholder="seg"
                                                    />
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                value={ex.note || ''}
                                                onChange={(e) => updateExercise(dayIndex, exIndex, 'note', e.target.value)}
                                                className="w-full bg-transparent text-[11px] text-[var(--text-secondary)] focus:text-white outline-none placeholder:text-[var(--text-secondary)]/40"
                                                placeholder="Notas (opcional)..."
                                            />
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={ex.isUnilateral || false}
                                                    onChange={(e) => updateExercise(dayIndex, exIndex, 'isUnilateral', e.target.checked)}
                                                    className="w-3.5 h-3.5 rounded accent-orange-500"
                                                />
                                                <span className={`text-[10px] font-bold ${ex.isUnilateral ? 'text-orange-400' : 'text-[var(--text-secondary)]/50'}`}>
                                                    Unilateral
                                                </span>
                                            </label>
                                        </div>

                                        <button
                                            onClick={() => removeExercise(dayIndex, exIndex)}
                                            className="text-[var(--text-secondary)] hover:text-red-400 p-2 mt-1 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}

                                <button
                                    onClick={() => addExercise(dayIndex)}
                                    className="w-full py-3 border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus size={16} /> Agregar Ejercicio
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <button
                    onClick={addDay}
                    className="w-full py-4 bg-[var(--bg-card)] rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-secondary)] font-medium hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={20} /> Agregar Nuevo Día
                </button>
            </div>

            {/* Datalist for exercise autocomplete */}
            <datalist id="exercise-suggestions">
                {knownExercises.map(name => (
                    <option key={name} value={name} />
                ))}
            </datalist>
        </div>
    );
}