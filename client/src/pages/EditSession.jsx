import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Plus, FileDown, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { mexicoCityDateStr } from '../utils/dates';
import { downloadSessionPdf } from '../utils/sessionPdf';

export default function EditSession() {
    const { logId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [session, setSession] = useState(null);
    const [sets, setSets] = useState([]);
    const [isUnilateral, setIsUnilateral] = useState(false);

    useEffect(() => {
        fetchSession();
    }, [logId]);

    async function fetchSession() {
        try {
            const found = await api.getWorkoutSession(logId);

            setSession(found);
            const hasUnilateralData = found.sets.some(s => s.repsRight != null);
            setIsUnilateral(hasUnilateralData || found.exercise?.isUnilateral || false);
            setSets(found.sets.map(s => ({
                id: s.id,
                weight: s.weight.toString(),
                reps: s.reps.toString(),
                weightRight: s.weightRight?.toString() || '',
                repsRight: s.repsRight?.toString() || '',
                // DB guarda 10-RIR; UI edita RIR crudo
                rir: s.rpe != null ? (10 - s.rpe) : null
            })));
        } catch (error) {
            console.error('Error:', error);
            toast.error('Sesión no encontrada');
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
        setSets([...sets, { weight: '', reps: '', weightRight: '', repsRight: '', rir: null }]);
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
            .map(s => {
                const setData = {
                    weight: parseFloat(s.weight),
                    reps: parseInt(s.reps, 10),
                    rpe: s.rir != null ? (10 - s.rir) : null,
                    completed: true
                };
                if (isUnilateral) {
                    setData.weightRight = s.weightRight ? parseFloat(s.weightRight) : null;
                    setData.repsRight = s.repsRight ? parseInt(s.repsRight, 10) : null;
                }
                return setData;
            });

        if (validSets.length === 0) {
            toast.error('Debe haber al menos 1 serie válida');
            return;
        }
        if (validSets.some(s => s.rpe == null)) {
            toast.error('Marca el RIR (0–3) en cada serie');
            return;
        }

        setSaving(true);
        try {
            const result = await api.updateWorkoutSession(logId, validSets);
            clearWorkoutCache();
            // Sin red: se encoló para sincronizar después (P3) — avisar que
            // todavía no está en el server, no fingir un "Sesión actualizada".
            if (result?.queued) {
                toast.info('Guardado local — se sincronizará cuando vuelva la conexión');
            } else {
                toast.success('Sesión actualizada');
            }
            navigate('/settings');
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    // Invalida el cache local de Workout.jsx (localStorage `workout_${dayId}`, TTL 24h)
    // para que si el usuario reabre el entreno de hoy no vea series desactualizadas.
    // No sabemos el dayId aquí, así que limpiamos todas las entradas de workout_*.
    function clearWorkoutCache() {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('workout_')) {
                localStorage.removeItem(key);
            }
        }
    }

    async function handleDownloadPdf() {
        if (!session || exportingPdf) return;
        setExportingPdf(true);
        try {
            // PDF con datos del server (sets del log), no el form a medio editar
            const fresh = await api.getWorkoutSession(logId);
            await downloadSessionPdf(fresh, {
                userName: user?.firstName
                    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
                    : user?.username
            });
            toast.success('PDF de la sesión descargado');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'No se pudo generar el PDF');
        } finally {
            setExportingPdf(false);
        }
    }

    const sessionDayLabel = (() => {
        if (!session?.date) return '';
        const key = mexicoCityDateStr(new Date(session.date));
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    })();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-dark)]">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-dark)] border-b border-[var(--border)]">
                <div className="flex items-center gap-2 p-4">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        aria-label="Volver"
                        className="p-2 rounded-full hover:bg-[var(--bg-card)]"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-bold text-lg">Editar sesión</h1>
                        <p className="text-xs text-[var(--text-secondary)] truncate">
                            {session?.exercise?.name}
                            {isUnilateral && <span className="ml-1 text-orange-400">(Unilateral)</span>}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={exportingPdf || !session}
                        aria-label="Descargar PDF de esta sesión"
                        className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)]/40 disabled:opacity-50"
                        title="PDF de la sesión"
                    >
                        {exportingPdf
                            ? <Loader2 size={18} className="animate-spin" />
                            : <FileDown size={18} />}
                    </button>
                    <button
                        type="button"
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
                    <p className="text-sm text-[var(--text-secondary)] capitalize">
                        {sessionDayLabel}
                    </p>
                    <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={exportingPdf}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)] active:scale-[0.98] disabled:opacity-50"
                    >
                        {exportingPdf
                            ? <Loader2 size={16} className="animate-spin" />
                            : <FileDown size={16} />}
                        Descargar PDF de esta sesión
                    </button>
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
                            <div className="flex items-start gap-3">
                                {/* Set Number */}
                                <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center mt-5">
                                    <span className="text-sm font-bold text-[var(--primary)]">{index + 1}</span>
                                </div>

                                <div className="flex-1 space-y-2">
                                    {/* Left / Bilateral row */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-[var(--text-secondary)] block mb-1">
                                                {isUnilateral ? 'PESO IZQ (kg)' : 'PESO (kg)'}
                                            </label>
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
                                        <div>
                                            <label className="text-[10px] text-[var(--text-secondary)] block mb-1">
                                                {isUnilateral ? 'REPS IZQ' : 'REPS'}
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                value={set.reps}
                                                onChange={e => updateSet(index, 'reps', e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 px-3 text-center font-bold focus:border-[var(--primary)] focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Right side row (unilateral only) */}
                                    {isUnilateral && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] text-orange-400 block mb-1">PESO DER (kg)</label>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    step="0.5"
                                                    value={set.weightRight}
                                                    onChange={e => updateSet(index, 'weightRight', e.target.value)}
                                                    placeholder="0"
                                                    className="w-full bg-[var(--bg-dark)] border border-orange-500/30 rounded-lg py-3 px-3 text-center font-bold focus:border-orange-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-orange-400 block mb-1">REPS DER</label>
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    value={set.repsRight}
                                                    onChange={e => updateSet(index, 'repsRight', e.target.value)}
                                                    placeholder="0"
                                                    className="w-full bg-[var(--bg-dark)] border border-orange-500/30 rounded-lg py-3 px-3 text-center font-bold focus:border-orange-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {/* RIR obligatorio */}
                                    <div className="flex items-center gap-1 min-h-[44px]">
                                        <span className="text-[10px] font-bold text-[var(--text-secondary)] w-8">RIR</span>
                                        {[0, 1, 2, 3].map(rir => (
                                            <button
                                                key={rir}
                                                type="button"
                                                onClick={() => updateSet(index, 'rir', rir)}
                                                aria-label={`RIR ${rir}`}
                                                aria-pressed={set.rir === rir}
                                                className={`flex-1 min-h-[40px] rounded-lg text-xs font-bold ${
                                                    set.rir === rir
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'
                                                }`}
                                            >
                                                {rir === 3 ? '3+' : rir}
                                            </button>
                                        ))}
                                    </div>
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
