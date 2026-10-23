import SessionSetRow from '../features/workouts/SessionSetRow';
import { formRirToStoredRpe, storedRpeToFormRir } from '../generated/training.js';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, FileDown, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { mexicoCityDateStr } from '../utils/dates';
import { downloadSessionPdf } from '../utils/sessionPdf';
import { usePreparedDraft } from '../storage/usePreparedDraft';
import DraftBoundary from '../components/layout/DraftBoundary';
import { conflictResolutionEnabled } from '../storage/runtime';

export default function EditSession() {
    const { logId } = useParams();
    const { user } = useAuth();
    return <DraftBoundary key={`${user?.id}:${logId}`} kind="session" resourceId={logId} ownerId={user?.id}><EditSessionPage /></DraftBoundary>;
}

function EditSessionPage() {
    const { logId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();
    const draftStore = usePreparedDraft('session', logId, user?.id);
    const [draft] = useState(() => {
        try { return { data: draftStore.load(), error: null }; }
        catch (error) { return { data: null, error: error.message }; }
    });
    const [draftError, setDraftError] = useState(draft.error);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [session, setSession] = useState(null);
    const [sets, setSets] = useState([]);
    const [isUnilateral, setIsUnilateral] = useState(false);
    const [notes, setNotes] = useState(draft.data && Object.hasOwn(draft.data, 'notes') ? draft.data.notes : draft.data?.session?.notes ?? null);

    useEffect(() => {
        fetchSession();
    }, [logId]);

    useEffect(() => {
        if (!session || loading || draft.error) return;
        let current = true;
        void Promise.resolve().then(() => draftStore.save({ session, sets, isUnilateral, notes }))
            .then(() => { if (current) setDraftError(null); })
            .catch(error => { if (current) setDraftError(`No se pudo guardar el borrador: ${error.message}. Copia tus datos antes de salir.`); });
        return () => { current = false; };
    }, [session, sets, isUnilateral, notes, loading, draftStore, draft.error]);

    async function fetchSession() {
        const restoreDraft = () => {
            setSession(draft.data.session);
            setSets(draft.data.sets);
            setIsUnilateral(draft.data.isUnilateral);
        };
        if (draft.data) restoreDraft();
        try {
            const found = await api.getWorkoutSession(logId);

            if (draft.data) return; // preserve recovered edits, including a differing remote version

            setSession(found);
            setNotes(found.notes ?? null);
            const hasUnilateralData = found.sets.some(s => s.repsRight != null);
            setIsUnilateral(hasUnilateralData || found.exercise?.isUnilateral || false);
            setSets(found.sets.map(s => ({
                id: s.id,
                weight: s.weight.toString(),
                reps: s.reps.toString(),
                weightRight: s.weightRight?.toString() || '',
                repsRight: s.repsRight?.toString() || '',
                // DB guarda 10-RIR; UI edita RIR crudo
                rir: storedRpeToFormRir(s.rpe),
                completed: s.completed
            })));
        } catch (error) {
            console.error('Error:', error);
            if (!draft.data) {
                toast.error('No se pudo cargar la sesión; los borradores se conservan');
                navigate('/settings');
            }
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
        setSets([...sets, { id: crypto.randomUUID(), weight: '', reps: '', weightRight: '', repsRight: '', rir: null }]);
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
                    ...(conflictResolutionEnabled ? { id: s.id } : {}),
                    weight: parseFloat(s.weight),
                    reps: parseInt(s.reps, 10),
                    rpe: formRirToStoredRpe(s.rir),
                    completed: s.completed ?? true
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
            const result = await api.updateWorkoutSession(logId, validSets, session?.exerciseId, { ownerId: user.id, expectedVersion: session?.sessionVersion,
                ...(conflictResolutionEnabled ? { baseSnapshot: { ownerId: user.id, workoutLog: session, sessionVersion: session?.sessionVersion }, notes } : {}) });
            // Sin red: se encoló para sincronizar después (P3) — avisar que
            // todavía no está en el server, no fingir un "Sesión actualizada".
            if (result?.queued) {
                toast.info(result.reason || 'Guardado local — pendiente de confirmar en el servidor');
            } else {
                toast.success(result?.unchanged ? 'No hay cambios nuevos' : 'Sesión actualizada');
            }
            navigate('/settings');
        } catch (error) {
            console.error('Error:', error);
            toast.error(error.isStorageError ? error.message : 'Error al guardar; el borrador se conserva');
        } finally {
            setSaving(false);
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
            {draftError && <p role="alert" className="p-3 text-sm text-red-400">{draftError}</p>}
            {draft.data && <p role="status" className="p-3 text-sm text-amber-400">Borrador local recuperado. Puede diferir de la sesión remota; revisa los datos antes de guardar.</p>}
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
                {conflictResolutionEnabled && <label className="block mb-4 text-sm">Notas del entrenamiento
                    <textarea aria-label="Notas del entrenamiento" value={notes ?? ''} onChange={e => setNotes(e.target.value)} maxLength={2000}
                        className="block w-full p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]" />
                </label>}
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

                    {sets.map((set, index) => <SessionSetRow key={set.id || index} set={set} index={index} isUnilateral={isUnilateral} onUpdate={updateSet} onRemove={removeSet} />)}

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
