import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown, Layers, Check, AlertTriangle, Bot } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { EXERCISES } from '../data/exercises';
import { MUSCLE_OPTIONS, toSpanishMuscleGroup } from '../utils/muscleGroup';
import { duplicateWeekdays, firstFreeWeekday, weekdayLabel } from '../utils/routineDays';
import WeekdayPicker from '../components/ui/WeekdayPicker';

const BLOCK_PHASES = [
    { value: 'accumulation', label: 'Acumulación' },
    { value: 'intensification', label: 'Intensificación' },
    { value: 'deload', label: 'Descarga' },
    { value: 'custom', label: 'Personalizado' }
];

// Días de la semana quitados a propósito: RoutineDay.weekday (asignado con
// WeekdayPicker) es ahora la única fuente de "qué día toca" — sugerir aquí
// nombres de días enseñaba el modelo mental que causaba el bug original
// (dayName nunca se vuelve a parsear en lectura).
const DAY_NAME_SUGGESTIONS = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body'];

function catalogMatch(name) {
    if (!name?.trim()) return null;
    const q = name.trim().toLowerCase();
    return EXERCISES.find(e => e.name.toLowerCase() === q)
        || EXERCISES.find(e => e.name.toLowerCase().includes(q) || q.includes(e.name.toLowerCase()));
}

export default function EditRoutine() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [routine, setRoutine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [knownExercises, setKnownExercises] = useState([]);

    const [blocks, setBlocks] = useState([]);
    const [savingBlockIndex, setSavingBlockIndex] = useState(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const [routineData, exercisesData] = await Promise.all([
                    api.getRoutine(id),
                    api.getExercises()
                ]);
                // Normaliza muscleGroup a español al cargar (datos viejos en inglés)
                const normalized = {
                    ...routineData,
                    days: (routineData.days || []).map(day => ({
                        ...day,
                        exercises: (day.exercises || []).map(ex => ({
                            ...ex,
                            muscleGroup: toSpanishMuscleGroup(ex.muscleGroup)
                        }))
                    }))
                };
                setRoutine(normalized);
                setBlocks(routineData.blocks || []);

                const fromDb = (exercisesData || []).map(e => e.name);
                const fromCatalog = EXERCISES.map(e => e.name);
                const unique = [...new Set([...fromDb, ...fromCatalog])].sort((a, b) =>
                    a.localeCompare(b, 'es', { sensitivity: 'base' })
                );
                setKnownExercises(unique);
            } catch (error) {
                console.error('Error:', error);
                toast.error('Error al cargar la rutina');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const isAi = routine?.source === 'ai';

    // --- BLOCKS ---
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
            const payload = {
                name: block.name.trim(),
                phase: block.phase,
                order: block.order,
                durationWeeks: parseInt(block.durationWeeks, 10) || 4
            };
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

        [newBlocks[index], newBlocks[swapIndex]].forEach(b => {
            if (b.id) {
                api.updateRoutineBlock(id, b.id, {
                    name: b.name,
                    phase: b.phase,
                    order: b.order,
                    durationWeeks: b.durationWeeks
                }).catch(() => toast.error('Error al reordenar bloques'));
            }
        });
    };

    // --- SAVE ROUTINE ---
    const handleSave = async () => {
        if (isAi) {
            toast.error('Las rutinas IA no se editan aquí. Reconfigura el perfil desde Rutinas.');
            return;
        }
        if (!routine.name.trim()) {
            toast.error('La rutina necesita un nombre');
            return;
        }
        if (!routine.days?.length) {
            toast.error('Agrega al menos un día');
            return;
        }

        const emptyDayName = routine.days.find(d => !String(d.dayName || '').trim());
        if (emptyDayName) {
            toast.error('Hay un día sin nombre');
            return;
        }

        const dupes = duplicateWeekdays(routine.days);
        if (dupes.length > 0) {
            toast.error(`Dos días tienen asignado el mismo día de la semana: ${weekdayLabel(dupes[0])}`);
            return;
        }
        if (routine.isActive && !routine.days.some(d => d.weekday != null)) {
            toast.error('Ningún día tiene día de la semana asignado — la rutina activa no sabría qué toca hoy');
            return;
        }

        const emptyDay = routine.days.find(day => !day.isRestDay && (day.exercises || []).length === 0);
        if (emptyDay) {
            toast.error(`"${emptyDay.dayName}" no tiene ejercicios. Agrega uno o márcalo como descanso.`);
            return;
        }

        const emptyEx = routine.days.some(day =>
            !day.isRestDay && (day.exercises || []).some(ex => !String(ex.name || '').trim())
        );
        if (emptyEx) {
            toast.error('Hay ejercicios sin nombre');
            return;
        }

        const invalidSets = routine.days.some(day =>
            (day.exercises || []).some(ex => {
                const n = parseInt(ex.targetSets, 10);
                return !Number.isFinite(n) || n < 1;
            })
        );
        if (invalidSets) {
            toast.error('Hay ejercicios con series inválidas (mínimo 1)');
            return;
        }

        setSaving(true);
        const payload = {
            name: routine.name.trim(),
            description: routine.description || '',
            days: routine.days.map((day, order) => ({
                ...day,
                order,
                dayName: day.dayName.trim(),
                exercises: day.isRestDay
                    ? []
                    : (day.exercises || []).map((ex, exOrder) => ({
                        ...ex,
                        order: exOrder,
                        name: ex.name.trim(),
                        muscleGroup: toSpanishMuscleGroup(ex.muscleGroup) || null,
                        targetSets: parseInt(ex.targetSets, 10) || 3,
                        targetReps: String(ex.targetReps || '8-12').trim() || '8-12',
                        restSeconds: parseInt(ex.restSeconds, 10) || 60,
                        note: ex.note || '',
                        isUnilateral: !!ex.isUnilateral
                    }))
            }))
        };
        try {
            await api.updateRoutine(id, payload);
            toast.success('Rutina actualizada');
            navigate('/routines');
        } catch (error) {
            console.error('Error updating routine:', error);
            toast.error(error.message || 'Error al guardar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    const updateRoutineField = (field, value) => {
        setRoutine(prev => ({ ...prev, [field]: value }));
    };

    // --- DAYS ---
    const updateDay = (index, field, value) => {
        setRoutine(prev => ({
            ...prev,
            days: prev.days.map((day, i) => i === index ? { ...day, [field]: value } : day)
        }));
    };

    const addDay = () => {
        setRoutine(prev => ({
            ...prev,
            days: [...prev.days, {
                dayName: `Día ${prev.days.length + 1}`,
                isRestDay: false,
                weekday: firstFreeWeekday(prev.days),
                exercises: []
            }]
        }));
    };

    // Asignar un weekday ya tomado por OTRO día se lo quita a ese otro día
    // (con aviso) en vez de permitir el duplicado — ver validateRoutineDayWeekdays
    // en el servidor, que de todos modos lo rechazaría al guardar.
    const updateDayWeekday = (index, weekday) => {
        const stolenFrom = weekday != null
            ? routine.days.find((d, i) => i !== index && d.weekday === weekday)
            : null;
        if (stolenFrom) {
            toast.info(`"${weekdayLabel(weekday)}" se movió de "${stolenFrom.dayName}" a "${routine.days[index].dayName}"`);
        }
        setRoutine(prev => ({
            ...prev,
            days: prev.days.map((day, i) => {
                if (i === index) return { ...day, weekday };
                if (weekday != null && day.weekday === weekday) return { ...day, weekday: null };
                return day;
            })
        }));
    };

    const removeDay = (index) => {
        if (!window.confirm('¿Borrar este día y sus ejercicios?')) return;
        setRoutine(prev => ({
            ...prev,
            days: prev.days.filter((_, i) => i !== index)
        }));
    };

    const moveDay = (index, direction) => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === routine.days.length - 1) return;
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        setRoutine(prev => {
            const newDays = [...prev.days];
            [newDays[index], newDays[swapIndex]] = [newDays[swapIndex], newDays[index]];
            return { ...prev, days: newDays };
        });
    };

    // --- EXERCISES ---
    const updateExercise = (dayIndex, exIndex, field, value) => {
        setRoutine(prev => ({
            ...prev,
            days: prev.days.map((day, dIdx) => {
                if (dIdx !== dayIndex) return day;
                return {
                    ...day,
                    exercises: day.exercises.map((ex, eIdx) => {
                        if (eIdx !== exIndex) return ex;
                        const next = { ...ex, [field]: value };
                        // Al escribir el nombre, rellena grupo/unilateral si calza el catálogo
                        if (field === 'name') {
                            const hit = catalogMatch(value);
                            if (hit) {
                                if (!next.muscleGroup) {
                                    next.muscleGroup = toSpanishMuscleGroup(hit.muscleGroup);
                                }
                                if (hit.isUnilateral) next.isUnilateral = true;
                            }
                        }
                        if (field === 'muscleGroup') {
                            next.muscleGroup = toSpanishMuscleGroup(value);
                        }
                        return next;
                    })
                };
            })
        }));
    };

    const addExercise = (dayIndex) => {
        // Inmutable — el push sobre la copia antigua mutaba el estado
        setRoutine(prev => ({
            ...prev,
            days: prev.days.map((day, i) => {
                if (i !== dayIndex) return day;
                return {
                    ...day,
                    exercises: [
                        ...(day.exercises || []),
                        {
                            name: '',
                            muscleGroup: '',
                            targetSets: 3,
                            targetReps: '8-12',
                            restSeconds: 90,
                            note: '',
                            isUnilateral: false
                        }
                    ]
                };
            })
        }));
    };

    const removeExercise = (dayIndex, exIndex) => {
        setRoutine(prev => ({
            ...prev,
            days: prev.days.map((day, dIdx) => {
                if (dIdx !== dayIndex) return day;
                return {
                    ...day,
                    exercises: day.exercises.filter((_, eIdx) => eIdx !== exIndex)
                };
            })
        }));
    };

    const moveExercise = (dayIndex, exIndex, direction) => {
        const exercises = routine.days[dayIndex].exercises;
        if (direction === 'up' && exIndex === 0) return;
        if (direction === 'down' && exIndex === exercises.length - 1) return;

        setRoutine(prev => ({
            ...prev,
            days: prev.days.map((day, dIdx) => {
                if (dIdx !== dayIndex) return day;
                const newExercises = [...day.exercises];
                const swapIndex = direction === 'up' ? exIndex - 1 : exIndex + 1;
                [newExercises[exIndex], newExercises[swapIndex]] = [newExercises[swapIndex], newExercises[exIndex]];
                return { ...day, exercises: newExercises };
            })
        }));
    };

    const exerciseSuggestions = useMemo(() => knownExercises, [knownExercises]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!routine) {
        return (
            <div className="text-center py-12 space-y-3">
                <p className="text-[var(--text-secondary)]">Rutina no encontrada</p>
                <Link to="/routines" className="text-[var(--primary)] font-medium">Volver a rutinas</Link>
            </div>
        );
    }

    if (isAi) {
        return (
            <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-500/15 flex items-center justify-center">
                    <Bot size={28} className="text-purple-400" />
                </div>
                <h1 className="text-xl font-bold">{routine.name}</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                    Esta rutina la gestiona el entrenador IA (un día nuevo por sesión).
                    No se edita a mano: reconfigura el perfil o cambia los ejercicios del día desde la lista de rutinas.
                </p>
                <div className="flex flex-col gap-2">
                    <Link
                        to="/ai-routine/setup"
                        className="py-3 rounded-xl bg-[var(--primary)] text-white font-bold"
                    >
                        Reconfigurar perfil IA
                    </Link>
                    <Link to="/routines" className="py-3 text-[var(--text-secondary)] text-sm">
                        Volver a rutinas
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-24 animate-fade-in max-w-2xl mx-auto">
            {/* Header sticky */}
            <div className="flex items-center justify-between sticky top-0 bg-[var(--bg-main)]/95 backdrop-blur-md p-4 -mx-4 border-b border-[var(--border)] z-20">
                <Link
                    to={`/routines/${id}`}
                    aria-label="Volver"
                    className="text-[var(--text-secondary)] hover:text-white p-2 -ml-2"
                >
                    <ArrowLeft size={22} />
                </Link>
                <span className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-card)] px-2 py-1 rounded">
                    Editor
                </span>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg font-medium hover:bg-opacity-90 disabled:opacity-50 transition-all active:scale-95"
                >
                    {saving
                        ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        : <Save size={18} />}
                    {saving ? '...' : 'Guardar'}
                </button>
            </div>

            {/* Info */}
            <div className="space-y-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1 uppercase tracking-wider font-bold">
                        Nombre
                    </label>
                    <input
                        type="text"
                        value={routine.name}
                        onChange={(e) => updateRoutineField('name', e.target.value)}
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-4 py-3 focus:border-[var(--primary)] outline-none font-bold text-lg transition-colors"
                        placeholder="Ej. Hipertrofia PPL"
                    />
                </div>
                <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1 uppercase tracking-wider font-bold">
                        Descripción
                    </label>
                    <input
                        type="text"
                        value={routine.description || ''}
                        onChange={(e) => updateRoutineField('description', e.target.value)}
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-4 py-3 focus:border-[var(--primary)] outline-none text-sm transition-colors"
                        placeholder="Ej. Enfocada en fuerza y básicos"
                    />
                </div>
            </div>

            {/* Mesociclos */}
            <div className="space-y-3 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <Layers size={16} className="text-[var(--primary)]" aria-hidden />
                    <h3 className="font-bold text-sm">Mesociclos</h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                    Opcional. Cada bloque se guarda al instante (no con el botón Guardar general).
                </p>

                {blocks.map((block, index) => (
                    <div
                        key={block.id || `draft-${index}`}
                        className="flex gap-2 items-start bg-[var(--bg-main)]/50 p-3 rounded-xl border border-transparent hover:border-[var(--border)] transition-colors"
                    >
                        <div className="flex flex-col gap-1 mt-1">
                            <button type="button" onClick={() => moveBlock(index, 'up')} disabled={index === 0} aria-label="Subir bloque" className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md">
                                <ArrowUp size={14} />
                            </button>
                            <button type="button" onClick={() => moveBlock(index, 'down')} disabled={index === blocks.length - 1} aria-label="Bajar bloque" className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md">
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
                                        {BLOCK_PHASES.map(p => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Semanas</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={1}
                                        value={block.durationWeeks}
                                        onChange={(e) => updateBlockField(index, 'durationWeeks', e.target.value)}
                                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[var(--primary)] outline-none text-center"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1 mt-1">
                            <button type="button" onClick={() => saveBlock(index)} disabled={savingBlockIndex === index} aria-label="Guardar bloque" className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--primary)] disabled:opacity-40 bg-[var(--bg-card)] rounded-md">
                                <Check size={14} />
                            </button>
                            <button type="button" onClick={() => removeBlock(index)} aria-label="Borrar bloque" className="p-1.5 text-[var(--text-secondary)] hover:text-red-400 bg-[var(--bg-card)] rounded-md">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}

                <button
                    type="button"
                    onClick={addBlockDraft}
                    className="w-full py-2.5 border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={16} /> Agregar bloque
                </button>
            </div>

            {/* Hint grupos musculares */}
            <div className="flex gap-2 items-start text-xs text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
                <AlertTriangle size={14} className="text-[var(--warning)] shrink-0 mt-0.5" />
                <p>
                    Asigna el <strong className="text-[var(--text-primary)]">grupo muscular</strong> (sobre todo Piernas)
                    para que las sugerencias suban de 5&nbsp;kg y no de 2.5&nbsp;kg.
                </p>
            </div>

            {/* Days */}
            <div className="space-y-6">
                {routine.days.map((day, dayIndex) => (
                    <div key={day.id || dayIndex} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                        <div className="p-3 bg-[var(--bg-dark)] border-b border-[var(--border)] flex items-center gap-3">
                            <div className="flex flex-col gap-1">
                                <button type="button" onClick={() => moveDay(dayIndex, 'up')} disabled={dayIndex === 0} aria-label="Subir día" className="p-1 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 rounded">
                                    <ArrowUp size={18} />
                                </button>
                                <button type="button" onClick={() => moveDay(dayIndex, 'down')} disabled={dayIndex === routine.days.length - 1} aria-label="Bajar día" className="p-1 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 rounded">
                                    <ArrowDown size={18} />
                                </button>
                            </div>

                            <div className="flex-1 min-w-0">
                                <input
                                    type="text"
                                    list="day-name-suggestions"
                                    value={day.dayName}
                                    onChange={(e) => updateDay(dayIndex, 'dayName', e.target.value)}
                                    className="bg-transparent font-bold text-lg w-full outline-none focus:text-[var(--primary)] placeholder:text-[var(--text-secondary)]/50"
                                    placeholder={`Día ${dayIndex + 1}`}
                                />
                                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-1 cursor-pointer w-fit select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!day.isRestDay}
                                        onChange={(e) => updateDay(dayIndex, 'isRestDay', e.target.checked)}
                                        className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg-card)] text-[var(--primary)] focus:ring-0"
                                    />
                                    Día de descanso
                                </label>
                            </div>

                            <button type="button" onClick={() => removeDay(dayIndex)} aria-label="Borrar día" className="text-[var(--text-secondary)] hover:text-red-400 p-2 hover:bg-red-500/10 rounded-lg transition-colors">
                                <Trash2 size={20} />
                            </button>
                        </div>

                        <div className="px-3 pb-3">
                            <WeekdayPicker
                                value={day.weekday ?? null}
                                takenBy={routine.days.reduce((acc, d, i) => {
                                    if (i !== dayIndex && d.weekday != null) acc[d.weekday] = d.dayName;
                                    return acc;
                                }, {})}
                                onChange={(weekday) => updateDayWeekday(dayIndex, weekday)}
                            />
                        </div>

                        {!day.isRestDay && (
                            <div className="p-3 space-y-3">
                                {(day.exercises || []).map((ex, exIndex) => (
                                    <div key={ex.id || exIndex} className="flex gap-3 items-start bg-[var(--bg-main)]/50 p-3 rounded-xl border border-transparent hover:border-[var(--border)] transition-colors">
                                        <div className="flex flex-col gap-1 mt-1">
                                            <button type="button" onClick={() => moveExercise(dayIndex, exIndex, 'up')} disabled={exIndex === 0} aria-label="Subir ejercicio" className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md">
                                                <ArrowUp size={14} />
                                            </button>
                                            <button type="button" onClick={() => moveExercise(dayIndex, exIndex, 'down')} disabled={exIndex === day.exercises.length - 1} aria-label="Bajar ejercicio" className="p-1.5 text-[var(--text-secondary)] hover:text-white disabled:opacity-20 bg-[var(--bg-card)] rounded-md">
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>

                                        <div className="flex-1 space-y-3 min-w-0">
                                            <input
                                                type="text"
                                                list="exercise-suggestions"
                                                value={ex.name}
                                                onChange={(e) => updateExercise(dayIndex, exIndex, 'name', e.target.value)}
                                                className="w-full bg-transparent border-b border-[var(--border)] focus:border-[var(--primary)] outline-none text-sm font-semibold pb-1 placeholder:text-[var(--text-secondary)]/50"
                                                placeholder="Nombre del ejercicio"
                                            />
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                <div className="col-span-2 sm:col-span-1">
                                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Grupo</label>
                                                    <select
                                                        value={toSpanishMuscleGroup(ex.muscleGroup) || ''}
                                                        onChange={(e) => updateExercise(dayIndex, exIndex, 'muscleGroup', e.target.value)}
                                                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[var(--primary)] outline-none"
                                                    >
                                                        <option value="">—</option>
                                                        {MUSCLE_OPTIONS.map(o => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Series</label>
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        min={1}
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
                                                        placeholder="8-12"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Descanso</label>
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        min={0}
                                                        value={ex.restSeconds ?? ''}
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
                                                    checked={!!ex.isUnilateral}
                                                    onChange={(e) => updateExercise(dayIndex, exIndex, 'isUnilateral', e.target.checked)}
                                                    className="w-3.5 h-3.5 rounded accent-orange-500"
                                                />
                                                <span className={`text-[10px] font-bold ${ex.isUnilateral ? 'text-orange-400' : 'text-[var(--text-secondary)]/50'}`}>
                                                    Unilateral (izq/der)
                                                </span>
                                            </label>
                                        </div>

                                        <button type="button" onClick={() => removeExercise(dayIndex, exIndex)} aria-label="Quitar ejercicio" className="text-[var(--text-secondary)] hover:text-red-400 p-2 mt-1 hover:bg-red-500/10 rounded-lg transition-colors">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    onClick={() => addExercise(dayIndex)}
                                    className="w-full py-3 border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus size={16} /> Agregar ejercicio
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <button
                    type="button"
                    onClick={addDay}
                    className="w-full py-4 bg-[var(--bg-card)] rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-secondary)] font-medium hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={20} /> Agregar día
                </button>
            </div>

            {/* Sticky save bottom on mobile */}
            <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)] to-transparent z-10 pointer-events-none md:hidden">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="pointer-events-auto w-full py-3.5 bg-[var(--primary)] text-white font-bold rounded-xl shadow-xl disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                    {saving ? 'Guardando...' : <><Save size={18} /> Guardar rutina</>}
                </button>
            </div>

            <datalist id="exercise-suggestions">
                {exerciseSuggestions.map(name => (
                    <option key={name} value={name} />
                ))}
            </datalist>
            <datalist id="day-name-suggestions">
                {DAY_NAME_SUGGESTIONS.map(name => (
                    <option key={name} value={name} />
                ))}
            </datalist>
        </div>
    );
}
