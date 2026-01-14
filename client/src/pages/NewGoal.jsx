import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Target, Dumbbell, ChevronDown, Loader2, AlertCircle, User, Calendar, Zap } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

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
    const [workoutHistory, setWorkoutHistory] = useState({});
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
                // Fetch exercises from routines
                const routines = await api.getRoutines();
                const allExercises = [];
                const seen = new Set();
                routines.forEach(r => r.days?.forEach(d => {
                    d.exercises?.forEach(e => {
                        if (!seen.has(e.name.toLowerCase())) {
                            allExercises.push({ name: e.name, muscleGroup: e.muscleGroup });
                            seen.add(e.name.toLowerCase());
                        }
                    });
                }));
                setExercises(allExercises);

                // Fetch workout history to check data availability
                const history = await api.getWorkoutHistory(500);
                const grouped = {};
                history?.forEach(workout => {
                    const name = workout.exercise?.name?.toLowerCase().trim();
                    if (!name) return;
                    if (!grouped[name]) grouped[name] = { sessions: {} };

                    const dateKey = new Date(workout.date).toISOString().split('T')[0];
                    if (!grouped[name].sessions[dateKey]) {
                        grouped[name].sessions[dateKey] = true;
                    }
                });

                // Convert to session count
                Object.keys(grouped).forEach(name => {
                    grouped[name] = Object.keys(grouped[name].sessions).length;
                });
                setWorkoutHistory(grouped);

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const filteredExercises = useMemo(() => {
        if (!selectedMuscle) return [];
        return exercises.filter(e => e.muscleGroup === selectedMuscle);
    }, [exercises, selectedMuscle]);

    function getSessionCount(exerciseName) {
        const normalizedName = exerciseName.toLowerCase().trim();
        return workoutHistory[normalizedName] || 0;
    }

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
                muscleGroup: selectedMuscle,
                targetWeight: parseFloat(targetWeight),
                targetReps: parseInt(targetReps)
            };

            if (needsManualData) {
                goalData.currentOneRepMax = parseFloat(currentOneRepMax);
                goalData.currentEightRepMax = currentEightRepMax ? parseFloat(currentEightRepMax) : null;
                goalData.experienceLevel = experienceLevel;
                goalData.frequencyPerWeek = frequencyPerWeek;
            }

            await api.createGoal(goalData);
            toast.success('Objetivo creado');
            navigate('/progress');
        } catch (err) {
            toast.error('Error al crear objetivo');
        } finally {
            setSaving(false);
        }
    }

    function handleMuscleSelect(muscle) {
        setSelectedMuscle(muscle);
        setSelectedExercise('');
        setStep(2);
    }

    function handleExerciseSelect(name) {
        setSelectedExercise(name);
        setStep(3);
    }

    function handleTargetContinue() {
        if (!targetWeight) return;

        const sessionCount = getSessionCount(selectedExercise);
        if (sessionCount < 3) {
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
                    <div className="grid grid-cols-2 gap-3 animate-fade-in">
                        {MUSCLE_GROUPS.map(muscle => (
                            <button
                                key={muscle}
                                onClick={() => handleMuscleSelect(muscle)}
                                disabled={exercises.filter(e => e.muscleGroup === muscle).length === 0}
                                className={`p-5 rounded-2xl border bg-gradient-to-br ${MUSCLE_COLORS[muscle] || ''} hover:scale-[1.02] disabled:opacity-40`}
                            >
                                <Dumbbell className="w-7 h-7 mb-2" />
                                <p className="font-bold text-white">{muscle}</p>
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-2 animate-fade-in">
                        {filteredExercises.map(ex => (
                            <button
                                key={ex.name}
                                onClick={() => handleExerciseSelect(ex.name)}
                                className="w-full p-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-left flex justify-between"
                            >
                                <span className="font-medium">{ex.name}</span>
                                <span className={getSessionCount(ex.name) > 0 ? "text-green-400 text-xs" : "text-gray-500 text-xs"}>
                                    {getSessionCount(ex.name) > 0 ? `${getSessionCount(ex.name)} sesiones` : 'Sin datos'}
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
                            <h2 className="text-xl font-bold mb-2">Perfil de Fuerza</h2>
                            <p className="text-sm text-[var(--text-secondary)]">
                                Necesitamos estos datos para calcular tu eficiencia muscular y crear el plan
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
