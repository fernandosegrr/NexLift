import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Dumbbell, Bot, Loader2, Check } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

const GOALS = [
    { id: 'hypertrophy', label: 'Ganar músculo', desc: 'Más volumen, 8-12 reps por serie' },
    { id: 'strength', label: 'Ganar fuerza', desc: 'Más peso, 4-6 reps por serie' },
    { id: 'general', label: 'Salud general', desc: 'Mantenerme activo, 10-15 reps por serie' }
];

const EQUIPMENT_OPTIONS = [
    { id: 'barbell', label: 'Barra' },
    { id: 'dumbbell', label: 'Mancuernas' },
    { id: 'machine', label: 'Máquinas' },
    { id: 'cable', label: 'Poleas' },
    { id: 'bodyweight', label: 'Peso corporal' }
];

const EXPERIENCE_LEVELS = [
    { id: 'beginner', label: 'Principiante', desc: 'Menos de 1 año entrenando' },
    { id: 'intermediate', label: 'Intermedio', desc: '1-3 años entrenando' },
    { id: 'advanced', label: 'Avanzado', desc: 'Más de 3 años entrenando' }
];

const TOTAL_STEPS = 4;

export default function AiRoutineSetup() {
    const navigate = useNavigate();
    const toast = useToast();

    const [step, setStep] = useState(1);
    const [goal, setGoal] = useState('');
    const [daysPerWeek, setDaysPerWeek] = useState(null);
    const [equipment, setEquipment] = useState([]);
    const [experienceLevel, setExperienceLevel] = useState('');
    const [saving, setSaving] = useState(false);

    function toggleEquipment(id) {
        setEquipment(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
    }

    async function handleSubmit() {
        setSaving(true);
        try {
            const result = await api.setupAiRoutine({ goal, daysPerWeek, equipment, experienceLevel });
            toast.success('¡Tu rutina IA está lista!');
            // El día de hoy puede ser de descanso justo al configurar (perfil
            // reconfigurado con historial reciente) — en ese caso no hay a dónde
            // "entrenar hoy", así que se va a Rutinas en vez de /workout/undefined.
            navigate(result.day?.id ? `/workout/${result.day.id}` : '/routines');
        } catch (err) {
            toast.error(err.message || 'Error al configurar la rutina IA');
        } finally {
            setSaving(false);
        }
    }

    function goBack() {
        if (step > 1) setStep(step - 1);
        else navigate('/import');
    }

    return (
        <div className="min-h-screen pb-24 animate-fade-in">
            <div className="sticky top-0 z-20 bg-[var(--bg-main)]/95 backdrop-blur-lg border-b border-[var(--border)]">
                <div className="flex items-center gap-3 px-4 py-4">
                    <button
                        onClick={goBack}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-card)] flex items-center justify-center border border-[var(--border)]"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex-1">
                        <h1 className="font-bold text-lg flex items-center gap-2">
                            <Bot size={18} className="text-[var(--primary)]" /> Rutina con IA
                        </h1>
                        <p className="text-xs text-[var(--text-secondary)]">Paso {step} de {TOTAL_STEPS}</p>
                    </div>
                </div>
                <div className="h-1 bg-[var(--bg-dark)]">
                    <div
                        className="h-full bg-[var(--primary)] transition-all duration-300"
                        style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                    />
                </div>
            </div>

            <div className="px-4 py-6">
                {step === 1 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="text-center mb-2">
                            <h2 className="text-xl font-bold mb-1">¿Cuál es tu objetivo?</h2>
                            <p className="text-sm text-[var(--text-secondary)]">Define el tipo de series que la IA va a priorizar</p>
                        </div>
                        {GOALS.map(g => (
                            <button
                                key={g.id}
                                onClick={() => { setGoal(g.id); setStep(2); }}
                                className={`w-full p-4 rounded-xl border text-left transition-colors ${goal === g.id ? 'bg-[var(--primary)]/20 border-[var(--primary)]' : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--primary)]/40'
                                    }`}
                            >
                                <p className="font-bold">{g.label}</p>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{g.desc}</p>
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="text-center mb-2">
                            <h2 className="text-xl font-bold mb-1">¿Cuántos días por semana?</h2>
                            <p className="text-sm text-[var(--text-secondary)]">La IA arma el split según esta frecuencia</p>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                            {[2, 3, 4, 5, 6].map(n => (
                                <button
                                    key={n}
                                    onClick={() => { setDaysPerWeek(n); setStep(3); }}
                                    className={`py-5 rounded-xl font-bold text-lg border transition-colors ${daysPerWeek === n ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--primary)]/40'
                                        }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center mb-2">
                            <h2 className="text-xl font-bold mb-1">¿Qué equipo tienes disponible?</h2>
                            <p className="text-sm text-[var(--text-secondary)]">Elige todo lo que apliquen — puedes marcar varios</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {EQUIPMENT_OPTIONS.map(eq => {
                                const selected = equipment.includes(eq.id);
                                return (
                                    <button
                                        key={eq.id}
                                        onClick={() => toggleEquipment(eq.id)}
                                        className={`p-4 rounded-xl border flex items-center gap-2 transition-colors ${selected ? 'bg-[var(--primary)]/20 border-[var(--primary)] text-white' : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]'
                                            }`}
                                    >
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)]'
                                            }`}>
                                            {selected && <Check size={14} className="text-white" />}
                                        </div>
                                        <span className="text-sm font-medium">{eq.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setStep(4)}
                            disabled={equipment.length === 0}
                            className="w-full py-4 bg-[var(--primary)] text-white font-bold rounded-xl shadow-lg shadow-[var(--primary)]/20 disabled:opacity-40"
                        >
                            Continuar
                        </button>
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center mb-2">
                            <h2 className="text-xl font-bold mb-1">¿Cuál es tu experiencia?</h2>
                            <p className="text-sm text-[var(--text-secondary)]">Ajusta qué tan avanzados son los ejercicios elegidos</p>
                        </div>
                        <div className="space-y-2">
                            {EXPERIENCE_LEVELS.map(level => (
                                <button
                                    key={level.id}
                                    onClick={() => setExperienceLevel(level.id)}
                                    className={`w-full p-4 rounded-xl border text-left flex justify-between items-center transition-colors ${experienceLevel === level.id ? 'bg-[var(--primary)]/20 border-[var(--primary)]' : 'bg-[var(--bg-card)] border-[var(--border)]'
                                        }`}
                                >
                                    <span className="font-bold">{level.label}</span>
                                    <span className="text-xs text-[var(--text-secondary)]">{level.desc}</span>
                                </button>
                            ))}
                        </div>

                        <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)] flex gap-3">
                            <div className="w-11 h-11 bg-[var(--primary)]/20 rounded-xl flex items-center justify-center shrink-0">
                                <Dumbbell className="w-5 h-5 text-[var(--primary)]" />
                            </div>
                            <p className="text-xs text-[var(--text-secondary)]">
                                El peso y las reps de cada serie los sigue calculando el Smart Loading determinista de siempre — la IA solo decide qué ejercicios tocan hoy.
                            </p>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={saving || !experienceLevel}
                            className="w-full py-4 bg-[var(--primary)] text-white font-bold rounded-xl shadow-lg shadow-[var(--primary)]/20 disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 className="animate-spin" size={20} /> : 'Crear mi rutina IA'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
