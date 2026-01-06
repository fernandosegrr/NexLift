import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

export default function EditSession() {
    const { logId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [session, setSession] = useState(null);
    const [sets, setSets] = useState([]);

    useEffect(() => {
        fetchSession();
    }, [logId]);

    async function fetchSession() {
        try {
            // Get workout history and find the specific session
            const history = await api.getWorkoutHistory(100);
            const found = history.find(s => s.id === logId);

            if (!found) {
                toast.error('Sesión no encontrada');
                navigate('/settings');
                return;
            }

            setSession(found);
            setSets(found.sets.map(s => ({
                id: s.id,
                weight: s.weight.toString(),
                reps: s.reps.toString(),
                rpe: s.rpe || null
            })));
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error cargando sesión');
            navigate('/settings');
        } finally {
            setLoading(false);
        }
    }

    function updateSet(index, field, value) {
        const newSets = [...sets];
        newSets[index][field] = value;
        setSets(newSets);
    }

    function addSet() {
        setSets([...sets, { weight: '', reps: '', rpe: null }]);
    }

    function removeSet(index) {
        if (sets.length <= 1) {
            toast.error('Debe haber al menos 1 serie');
            return;
        }
        setSets(sets.filter((_, i) => i !== index));
    }

    async function saveChanges() {
        const validSets = sets
            .filter(s => s.weight !== '' && s.reps !== '')
            .map(s => ({
                weight: parseFloat(s.weight),
                reps: parseInt(s.reps),
                rpe: s.rpe ? parseFloat(s.rpe) : null
            }));

        if (validSets.length === 0) {
            toast.error('Debe haber al menos 1 serie válida');
            return;
        }

        setSaving(true);
        try {
            await api.updateWorkoutSession(logId, validSets);
            toast.success('Sesión actualizada');
            navigate('/settings');
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-dark)]">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-dark)] border-b border-[var(--border)]">
                <div className="flex items-center gap-3 p-4">
                    <button
                        onClick={() => navigate('/settings')}
                        className="p-2 rounded-full hover:bg-[var(--bg-card)]"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1">
                        <h1 className="font-bold text-lg">Editar Sesión</h1>
                        <p className="text-xs text-[var(--text-secondary)]">
                            {session?.exercise?.name}
                        </p>
                    </div>
                    <button
                        onClick={saveChanges}
                        disabled={saving}
                        className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={16} />
                                Guardar
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Session Info */}
            <div className="p-4">
                <div className="bg-[var(--bg-card)] rounded-xl p-4 mb-4 border border-[var(--border)]">
                    <h2 className="font-bold text-lg">{session?.exercise?.name}</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        {new Date(session?.date).toLocaleDateString('es-ES', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        })}
                    </p>
                </div>

                {/* Sets Editor */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm text-[var(--text-secondary)]">SERIES</h3>
                        <span className="text-xs text-[var(--text-secondary)]">{sets.length} series</span>
                    </div>

                    {sets.map((set, index) => (
                        <div
                            key={index}
                            className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]"
                        >
                            <div className="flex items-center gap-3">
                                {/* Set Number */}
                                <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                                    <span className="text-sm font-bold text-[var(--primary)]">{index + 1}</span>
                                </div>

                                {/* Weight Input */}
                                <div className="flex-1">
                                    <label className="text-[10px] text-[var(--text-secondary)] block mb-1">PESO (kg)</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.5"
                                        value={set.weight}
                                        onChange={e => updateSet(index, 'weight', e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 px-3 text-center font-bold focus:border-[var(--primary)] focus:outline-none"
                                    />
                                </div>

                                {/* Reps Input */}
                                <div className="flex-1">
                                    <label className="text-[10px] text-[var(--text-secondary)] block mb-1">REPS</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={set.reps}
                                        onChange={e => updateSet(index, 'reps', e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 px-3 text-center font-bold focus:border-[var(--primary)] focus:outline-none"
                                    />
                                </div>

                                {/* Delete Button */}
                                <button
                                    onClick={() => removeSet(index)}
                                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg mt-4"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Add Set Button */}
                    <button
                        onClick={addSet}
                        className="w-full py-4 border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--text-secondary)] flex items-center justify-center gap-2 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                    >
                        <Plus size={18} />
                        Agregar Serie
                    </button>
                </div>
            </div>
        </div>
    );
}
