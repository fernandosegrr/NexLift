import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Target, Dumbbell, ChevronDown, Loader2, AlertCircle, User, Calendar, Zap, Search } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { canonicalExerciseKey, normalizeExerciseName, groupHistoryByExercise, best1RMRecent } from '../utils/exerciseName';
import { toSpanishMuscleGroup } from '../utils/muscleGroup';

const MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Hombros', 'Piernas', 'Bíceps', 'Tríceps', 'Core'];

const MUSCLE_COLORS = {
    'Pecho': 'from-blue-500/30 to-blue-600/10 border-blue-500/30 text-blue-400',
    'Espalda': 'from-green-500/30 to-green-600/10 border-green-500/30 text-green-400',
    'Hombros': 'from-orange-500/30 to-orange-600/10 border-orange-500/30 text-orange-400',
    'Piernas': 'from-red-500/30 to-red-600/10 border-red-500/30 text-red-400',
    'Bíceps': 'from-purple-500/30 to-purple-600/10 border-purple-500/30 text-purple-400',
    'Tríceps': 'from-pink-500/30 to-pink-600/10 border-pink-500/30 text-pink-400',
    'Core': 'from-cyan-500/30 to-cyan-600/10 border-cyan-500/30 text-cyan-400',
};

const EXPERIENCE_LEVELS = [
    { id: 'beginner', label: 'Principiante', desc: 'Menos de 1 año', increase: '2.5kg/sem' },
    { id: 'intermediate', label: 'Intermedio', desc: '1-3 años', increase: '1-2kg/sem' },
    { id: 'advanced', label: 'Avanzado', desc: 'Más de 3 años', increase: '0.5-1kg/mes' }
];

const FREQUENCY_OPTIONS = [
    { value: 1, label: '1x por semana' },
    { value: 2, label: '2x por semana' },
    { value: 3, label: '3x por semana' },
    { value: 4, label: '4+ por semana' }
];

export default function NewGoal() {
    const navigate = useNavigate();
    const toast = useToast();

    const [step, setStep] = useState(1);
    const [selectedMuscle, setSelectedMuscle] = useState('');
    const [selectedExercise, setSelectedExercise] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [targetReps, setTargetReps] = useState('5');
    const [exercises, setExercises] = useState([]);
    const [search, setSearch] = useState('');
    const [sessionCountForSelected, setSessionCountForSelected] = useState(0);
    const [best1RMForSelected, setBest1RMForSelected] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [needsManualData, setNeedsManualData] = useState(false);

    // Manual data (fallback)
    const [currentOneRepMax, setCurrentOneRepMax] = useState('');
    const [currentEightRepMax, setCurrentEightRepMax] = useState('');
    const [experienceLevel, setExperienceLevel] = useState('');
    const [frequencyPerWeek, setFrequencyPerWeek] = useState(2);

    useEffect(() => {
        async function fetchData() {
            try {
                // Rutinas (sin papelera), catálogo completo (incluye archivados) e
                // historial completo. Consolidamos todo por ejercicio CANÓNICO para no
                // perder ejercicios por nombres/músculos inconsistentes entre rutinas.
                const [routines, history, catalog] = await Promise.all([
                    api.getRoutines(),
                    api.getWorkoutHistory(500),
                    api.getExercises().catch(() => [])
                ]);

                // Historial agrupado por ejercicio canónico (sesiones, 1RM, músculo)
                const histGroups = groupHistoryByExercise(history);

                // Mapa canónico -> ejercicio mostrable
                const map = new Map();
                const addExercise = (name, muscleGroup, fromRoutine) => {
                    if (!name) return;
                    const key = canonicalExerciseKey(name);
                    if (!key) return;
                    let e = map.get(key);
                    if (!e) { e = { key, name, muscleGroup: null, fromRoutine: false }; map.set(key, e); }
                    // Preferir el nombre tal como aparece en una rutina visible (lo que el usuario ve hoy)
                    if (fromRoutine && !e.fromRoutine) { e.name = name; e.fromRoutine = true; }
                    if (!e.muscleGroup && muscleGroup) {
                        e.muscleGroup = toSpanishMuscleGroup(muscleGroup) || muscleGroup;
                    }
                };

                routines.forEach(r => r.days?.forEach(d => d.exercises?.forEach(e => addExercise(e.name, e.muscleGroup, true))));
                (catalog || []).forEach(e => addExercise(e.name, e.muscleGroup, false));
                (history || []).forEach(w => addExercise(w.exercise?.name, w.exercise?.muscleGroup, false));

                // Enriquecer con sesiones / 1RM del historial agrupado
                const list = [];
                for (const e of map.values()) {
                    const g = histGroups.get(e.key);
                    const sessionCount = g ? g.sessions.length : 0;
                    const best1RM = g ? best1RMRecent(g.sessions) : 0;
                    list.push({
                        key: e.key,
                        name: e.name,
                        muscleGroup: toSpanishMuscleGroup(e.muscleGroup || g?.muscleGroup) || null,
                        sessionCount,
                        best1RM
                    });
                }
                // Más entrenados primero
                list.sort((a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name));
                setExercises(list);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const muscleMatches = (e, muscle) =>
        toSpanishMuscleGroup(e.muscleGroup).toLowerCase() === muscle.toLowerCase();

    const filteredExercises = useMemo(() => {
        const q = normalizeExerciseName(search);
        if (q) {
            // Con búsqueda activa ignoramos el filtro de músculo (robustez: siempre se encuentra)
            return exercises.filter(e => normalizeExerciseName(e.name).includes(q));
        }
        if (!selectedMuscle) return [];
        return exercises.filter(e => muscleMatches(e, selectedMuscle));
    }, [exercises, selectedMuscle, search]);

    async function handleSubmit() {
        if (!selectedExercise || !targetWeight || !targetReps) return;

        if (parseFloat(targetWeight) > 1000) {
            toast.error('El peso objetivo parece irreal (>1000kg).');
            return;
        }

        if (needsManualData) {
            if ((currentOneRepMax && parseFloat(currentOneRepMax) > 1000) ||
                (currentEightRepMax && parseFloat(currentEightRepMax) > 1000)) {
                toast.error('Los pesos actuales parecen irreales (>1000kg).');
                return;
            }
            if (!currentOneRepMax || !experienceLevel) {
                toast.error('Completa los campos de fuerza');
                return;
            }
        }

        setSaving(true);
        try {
            const goalData = {
                exerciseName: selectedExercise,
                muscleGroup: toSpanishMuscleGroup(selectedMuscle) || selectedMuscle || null,
                targetWeight: parseFloat(targetWeight),
                targetReps: parseInt(targetReps, 10)
            };

            if (needsManualData) {
                goalData.currentOneRepMax = parseFloat(currentOneRepMax);
                goalData.currentEightRepMax = currentEightRepMax ? parseFloat(currentEightRepMax) : null;
                goalData.experienceLevel = experienceLevel;
                goalData.frequencyPerWeek = frequencyPerWeek;
            } else if (best1RMForSelected > 0) {
                // Snapshot del 1RM real como respaldo si el match de historial falla después
                goalData.currentOneRepMax = Math.round(best1RMForSelected * 10) / 10;
            }

            await api.createGoal(goalData);
            toast.success('Objetivo creado');
            // Abre Progress en la pestaña de objetivos (si el tab se lee de state local, al menos aterriza en Progress)
            navigate('/progress', { state: { tab: 'goals' } });
        } catch (err) {
            toast.error(err.message || 'Error al crear objetivo');
        } finally {
            setSaving(false);
        }
    }

    function handleMuscleSelect(muscle) {
        setSelectedMuscle(muscle);
        setSelectedExercise('');
        setSearch('');
        setStep(2);
    }

    function handleExerciseSelect(ex) {
        setSelectedExercise(ex.name);
        // Hereda el músculo real del ejercicio (importante si se llegó por búsqueda global)
        if (ex.muscleGroup) setSelectedMuscle(toSpanishMuscleGroup(ex.muscleGroup) || ex.muscleGroup);
        setSessionCountForSelected(ex.sessionCount);
        setBest1RMForSelected(ex.best1RM);
        setStep(3);
    }

    function handleTargetContinue() {
        if (!targetWeight) return;
        const tw = parseFloat(targetWeight);
        if (!Number.isFinite(tw) || tw <= 0) {
            toast.error('El peso objetivo no es válido');
            return;
        }
        // Aviso si la meta está por debajo del 1RM actual estimado
        if (best1RMForSelected > 0 && tw < best1RMForSelected * 0.85 && parseInt(targetReps, 10) <= 3) {
            const ok = window.confirm(
                `Tu 1RM reciente es ~${Math.round(best1RMForSelected)} kg y la meta es ${tw} kg × ${targetReps}. ¿Seguro?`
            );
            if (!ok) return;
        }

        // Solo pedimos datos manuales si NO hay historial utilizable (sesiones + 1RM real)
        if (sessionCountForSelected < 2 || best1RMForSelected <= 0) {
            setNeedsManualData(true);
            setStep(4);
        } else {
            handleSubmit();
        }
    }

    const totalSteps = needsManualData ? 4 : 3;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-24 animate-fade-in">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[var(--bg-main)]/95 backdrop-blur-lg border-b border-[var(--border)]">
                <div className="flex items-center gap-3 px-4 py-4">
                    <button
                        onClick={() => step > 1 ? setStep(step - 1) : navigate('/progress')}
                        className="w-10 h-10 rounded-full bg-[var(--bg-card)] flex items-center justify-center border border-[var(--border)]"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex-1">
                        <h1 className="font-bold text-lg">Nuevo Objetivo</h1>
                        <p className="text-xs text-[var(--text-secondary)]">Paso {step} de {totalSteps}</p>
                    </div>
                </div>
                <div className="h-1 bg-[var(--bg-dark)]">
                    <div
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${(step / totalSteps) * 100}%` }}
                    />
                </div>
            </div>

            <div className="px-4 py-6">
                {/* Steps 1-3 match previous implementation... omitting for brevity if file is overwritten completely */}
                {step === 1 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="grid grid-cols-2 gap-3">
                            {MUSCLE_GROUPS.map(muscle => {
                                const count = exercises.filter(e => muscleMatches(e, muscle)).length;
                                return (
                                    <button
                                        key={muscle}
                                        onClick={() => handleMuscleSelect(muscle)}
                                        disabled={count === 0}
                                        className={`p-5 rounded-2xl border bg-gradient-to-br ${MUSCLE_COLORS[muscle] || ''} hover:scale-[1.02] disabled:opacity-40 text-left`}
                                    >
                                        <Dumbbell className="w-7 h-7 mb-2" />
                                        <p className="font-bold text-white">{muscle}</p>
                                        <p className="text-[11px] text-white/70 mt-0.5">{count} ejercicio{count === 1 ? '' : 's'}</p>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => { setSelectedMuscle(''); setSearch(''); setStep(2); }}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-secondary)] hover:border-purple-500/40 hover:text-white transition-colors"
                        >
                            <Search size={16} /> Buscar entre todos mis ejercicios
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-3 animate-fade-in">
                        {/* Buscador (ignora el filtro de músculo cuando se usa) */}
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                            <input
                                autoFocus={!selectedMuscle}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar ejercicio..."
                                className="w-full pl-9 pr-3 py-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm focus:border-purple-500 outline-none"
                            />
                        </div>

                        {filteredExercises.length === 0 ? (
                            <div className="text-center py-10 text-[var(--text-secondary)] text-sm">
                                {search ? 'Ningún ejercicio coincide con la búsqueda.' : 'Escribe para buscar un ejercicio.'}
                            </div>
                        ) : filteredExercises.map(ex => (
                            <button
                                key={ex.key}
                                onClick={() => handleExerciseSelect(ex)}
                                className="w-full p-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-left flex justify-between items-center gap-3 hover:border-purple-500/40 transition-colors"
                            >
                                <span className="font-medium">{ex.name}</span>
                                <span className={`text-xs shrink-0 ${ex.sessionCount > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                                    {ex.sessionCount > 0 ? `${ex.sessionCount} ${ex.sessionCount === 1 ? 'sesión' : 'sesiones'}` : 'Sin datos'}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)] flex gap-3">
                            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                                <Target className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <p className="font-bold">{selectedExercise}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{selectedMuscle}</p>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm text-[var(--text-secondary)] block mb-2">Peso objetivo (kg)</label>
                            <input
                                type="number"
                                min="1"
                                max="1000"
                                value={targetWeight}
                                onChange={e => setTargetWeight(e.target.value)}
                                className="w-full p-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-2xl font-bold text-center focus:border-purple-500 outline-none"
                                placeholder="100"
                            />
                        </div>

                        <div>
                            <label className="text-sm text-[var(--text-secondary)] block mb-2">Reps objetivo</label>
                            <div className="flex gap-2">
                                {[1, 3, 5, 8, 10, 12].map(num => (
                                    <button
                                        key={num}
                                        onClick={() => setTargetReps(String(num))}
                                        className={`flex-1 py-3 rounded-xl font-bold ${targetReps === String(num) ? 'bg-purple-500 text-white' : 'bg-[var(--bg-card)] border-[var(--border)]'}`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleTargetContinue}
                            disabled={!targetWeight}
                            className="w-full py-4 bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20"
                        >
                            Continuar
                        </button>
                    </div>
                )}

                {/* Step 4: Advanced Strength Profiling */}
                {step === 4 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center">
                            <h2 className="text-xl font-bold mb-2">Fuerza inicial</h2>
                            <p className="text-sm text-[var(--text-secondary)]">
                                No encontramos suficiente historial de <span className="text-white font-medium">{selectedExercise}</span>.
                                Introduce tu fuerza actual y crearemos el plan.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                                    <Zap size={16} className="text-yellow-400" />
                                    Máximo para 1 Repetición (1RM)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={currentOneRepMax}
                                    onChange={e => setCurrentOneRepMax(e.target.value)}
                                    placeholder="Ej: 100"
                                    className="w-full p-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl font-bold"
                                />
                                <p className="text-xs text-[var(--text-secondary)] mt-1">Si no lo sabes exacto, estíma el peso máximo que puedes levantar una sola vez.</p>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                                    <Dumbbell size={16} className="text-blue-400" />
                                    Máximo para 8 Repeticiones
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={currentEightRepMax}
                                    onChange={e => setCurrentEightRepMax(e.target.value)}
                                    placeholder="Ej: 80"
                                    className="w-full p-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl font-bold"
                                />
                                <p className="text-xs text-[var(--text-secondary)] mt-1">Peso con el que llegas al fallo muscular en la repetición 8.</p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-[var(--border)]">
                            <label className="block text-sm font-medium mb-3">Nivel de Experiencia</label>
                            <div className="space-y-2">
                                {EXPERIENCE_LEVELS.map(level => (
                                    <button
                                        key={level.id}
                                        onClick={() => setExperienceLevel(level.id)}
                                        className={`w-full p-3 rounded-xl border text-left flex justify-between items-center ${experienceLevel === level.id ? 'bg-purple-500/20 border-purple-500' : 'bg-[var(--bg-card)] border-[var(--border)]'}`}
                                    >
                                        <span>{level.label}</span>
                                        <span className="text-xs opacity-50">{level.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={saving || !currentOneRepMax || !experienceLevel}
                            className="w-full py-4 bg-purple-500 text-white font-bold rounded-xl mt-4"
                        >
                            {saving ? <Loader2 className="animate-spin mx-auto" /> : 'Crear Plan Personalizado'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
