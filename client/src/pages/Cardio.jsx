import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    HeartPulse, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
    Clock, Mountain, Save, X
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { mexicoCityDateStr } from '../utils/dates';

const ACTIVITIES = [
    { id: 'caminadora', label: 'Caminadora' },
    { id: 'bici', label: 'Bici' },
    { id: 'eliptica', label: 'Elíptica' },
    { id: 'otro', label: 'Otro' }
];

function emptySegment() {
    return { durationMin: '10', incline: '12', speed: '', note: '' };
}

function activityLabel(id) {
    return ACTIVITIES.find(a => a.id === id)?.label || id;
}

function formatSessionDate(date) {
    const key = mexicoCityDateStr(new Date(date));
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-MX', {
        weekday: 'short', day: 'numeric', month: 'short'
    });
}

export default function Cardio() {
    const toast = useToast();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    const [activity, setActivity] = useState('caminadora');
    const [note, setNote] = useState('');
    // Default útil: 10@12 → 5@3 (el patrón del usuario)
    const [segments, setSegments] = useState([
        { durationMin: '10', incline: '12', speed: '', note: '' },
        { durationMin: '5', incline: '3', speed: '', note: '' },
        { durationMin: '10', incline: '12', speed: '', note: '' }
    ]);

    async function load() {
        setLoading(true);
        try {
            const data = await api.getCardioSessions(40);
            setSessions(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            toast.error('No se pudo cargar el historial de cardio');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    const totalFormMin = useMemo(
        () => segments.reduce((a, s) => a + (parseFloat(s.durationMin) || 0), 0),
        [segments]
    );

    function updateSegment(i, field, value) {
        setSegments(prev => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
    }

    function addSegment() {
        setSegments(prev => {
            const last = prev[prev.length - 1];
            // Alternar inclinación al estilo del usuario si venía de 12
            const nextIncline = last?.incline === '12' || last?.incline === 12 ? '3' : '12';
            return [...prev, { durationMin: '5', incline: nextIncline, speed: '', note: '' }];
        });
    }

    function removeSegment(i) {
        setSegments(prev => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
    }

    async function handleSave() {
        const clean = segments
            .map(s => ({
                durationMin: parseFloat(s.durationMin),
                incline: s.incline === '' || s.incline == null ? null : parseFloat(s.incline),
                speed: s.speed === '' || s.speed == null ? null : parseFloat(s.speed)
            }))
            .filter(s => Number.isFinite(s.durationMin) && s.durationMin > 0);

        if (clean.length === 0) {
            toast.error('Agrega al menos un tramo con minutos');
            return;
        }

        setSaving(true);
        try {
            const created = await api.createCardioSession({
                activity,
                segments: clean,
                note: note.trim() || null
            });
            setSessions(prev => [created, ...prev]);
            setShowForm(false);
            setNote('');
            setSegments([
                { durationMin: '10', incline: '12', speed: '', note: '' },
                { durationMin: '5', incline: '3', speed: '', note: '' },
                { durationMin: '10', incline: '12', speed: '', note: '' }
            ]);
            toast.success(`Cardio guardado · ${created.totalMin} min`);
        } catch (e) {
            toast.error(e.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id) {
        if (!window.confirm('¿Borrar esta sesión de cardio?')) return;
        try {
            await api.deleteCardioSession(id);
            setSessions(prev => prev.filter(s => s.id !== id));
            toast.success('Sesión borrada');
        } catch {
            toast.error('No se pudo borrar');
        }
    }

    const weekMin = useMemo(() => {
        const cutoff = mexicoCityDateStr(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
        return sessions
            .filter(s => mexicoCityDateStr(new Date(s.date)) >= cutoff)
            .reduce((a, s) => a + (s.totalMin || 0), 0);
    }, [sessions]);

    return (
        <div className="max-w-lg mx-auto space-y-4 animate-fade-in pb-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <HeartPulse className="text-[var(--primary)]" aria-hidden />
                        Cardio
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                        Caminadora y tramos · sin series de fuerza
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowForm(v => !v)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-bold flex items-center gap-1.5 shrink-0"
                >
                    {showForm ? <X size={16} /> : <Plus size={16} />}
                    {showForm ? 'Cerrar' : 'Nueva'}
                </button>
            </div>

            {/* Resumen semana */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center">
                    <Clock size={20} className="text-[var(--primary)]" aria-hidden />
                </div>
                <div>
                    <p className="text-xs text-[var(--text-secondary)]">Esta semana (7 días)</p>
                    <p className="text-xl font-bold tabular-nums">
                        {Math.round(weekMin * 10) / 10}
                        <span className="text-sm font-semibold text-[var(--text-secondary)] ml-1">min</span>
                    </p>
                </div>
            </div>

            {/* Formulario nueva sesión */}
            {showForm && (
                <div className="bg-[var(--bg-card)] border border-[var(--primary)]/30 rounded-2xl p-4 space-y-4">
                    <div>
                        <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Actividad</p>
                        <div className="grid grid-cols-2 gap-2">
                            {ACTIVITIES.map(a => (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => setActivity(a.id)}
                                    className={`min-h-[44px] rounded-xl text-sm font-semibold border transition-colors ${
                                        activity === a.id
                                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                            : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)]'
                                    }`}
                                >
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                                Tramos · {totalFormMin || 0} min total
                            </p>
                            <button
                                type="button"
                                onClick={addSegment}
                                className="text-xs font-bold text-[var(--primary)] flex items-center gap-1 min-h-[36px]"
                            >
                                <Plus size={14} /> Tramo
                            </button>
                        </div>
                        <div className="space-y-2">
                            {segments.map((seg, i) => (
                                <div
                                    key={i}
                                    className="bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl p-3"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                                            TRAMO {i + 1}
                                        </span>
                                        {segments.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeSegment(i)}
                                                aria-label={`Borrar tramo ${i + 1}`}
                                                className="p-1.5 text-red-400/80 hover:text-red-400"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                                <Clock size={10} /> Minutos
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min="0.5"
                                                step="0.5"
                                                value={seg.durationMin}
                                                onChange={e => updateSegment(i, 'durationMin', e.target.value)}
                                                className="w-full min-h-[44px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-center font-bold text-lg focus:border-[var(--primary)] outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                                <Mountain size={10} /> Inclinación
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min="0"
                                                max="40"
                                                step="0.5"
                                                value={seg.incline}
                                                onChange={e => updateSegment(i, 'incline', e.target.value)}
                                                placeholder="—"
                                                className="w-full min-h-[44px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-center font-bold text-lg focus:border-[var(--primary)] outline-none"
                                            />
                                        </div>
                                    </div>
                                    {activity === 'caminadora' && (
                                        <div className="mt-2">
                                            <label className="text-[10px] text-[var(--text-secondary)] mb-1 block">
                                                Velocidad km/h (opcional)
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min="0"
                                                step="0.1"
                                                value={seg.speed}
                                                onChange={e => updateSegment(i, 'speed', e.target.value)}
                                                placeholder="ej. 5.5"
                                                className="w-full min-h-[40px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-center text-sm focus:border-[var(--primary)] outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">Nota (opcional)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="ej. Z2, me sentí bien"
                            className="w-full min-h-[44px] px-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-sm focus:border-[var(--primary)] outline-none"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full min-h-[48px] py-3 rounded-2xl bg-[var(--primary)] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={18} />}
                        Guardar sesión
                    </button>
                </div>
            )}

            {/* Historial */}
            <div>
                <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
                    Historial
                </h2>
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-2xl p-8 text-center">
                        <HeartPulse className="w-10 h-10 text-[var(--border)] mx-auto mb-3" />
                        <p className="font-semibold text-[var(--text-secondary)]">Sin cardio aún</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                            Toca Nueva y arma tus tramos (ej. 10′@12 → 5′@3 → 10′@12)
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sessions.map(s => {
                            const open = expandedId === s.id;
                            const inclinePath = (s.segments || [])
                                .map(seg => (seg.incline != null ? seg.incline : '—'))
                                .join(' → ');
                            return (
                                <div
                                    key={s.id}
                                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(open ? null : s.id)}
                                        className="w-full flex items-center gap-3 p-4 text-left min-h-[56px]"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-sm">
                                                    {activityLabel(s.activity)}
                                                </span>
                                                <span className="text-xs text-[var(--text-secondary)] capitalize">
                                                    {formatSessionDate(s.date)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                                                {s.totalMin} min · {s.segmentCount} tramo{s.segmentCount === 1 ? '' : 's'}
                                                {inclinePath && inclinePath !== '—' && (
                                                    <span className="text-[var(--text-secondary)]/80"> · incl. {inclinePath}</span>
                                                )}
                                            </p>
                                        </div>
                                        {open ? <ChevronUp size={18} className="text-[var(--text-secondary)]" /> : <ChevronDown size={18} className="text-[var(--text-secondary)]" />}
                                    </button>
                                    {open && (
                                        <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 space-y-2">
                                            {(s.segments || []).map((seg, i) => (
                                                <div
                                                    key={seg.id || i}
                                                    className="flex items-center justify-between bg-[var(--bg-dark)] rounded-xl px-3 py-2.5 text-sm"
                                                >
                                                    <span className="text-[var(--text-secondary)] text-xs font-bold w-8">
                                                        #{i + 1}
                                                    </span>
                                                    <span className="font-bold tabular-nums">{seg.durationMin} min</span>
                                                    <span className="text-[var(--text-secondary)] tabular-nums">
                                                        {seg.incline != null ? `incl. ${seg.incline}` : '—'}
                                                    </span>
                                                    <span className="text-[var(--text-secondary)] tabular-nums text-xs">
                                                        {seg.speed != null ? `${seg.speed} km/h` : ''}
                                                    </span>
                                                </div>
                                            ))}
                                            {s.note && (
                                                <p className="text-xs text-[var(--text-secondary)] px-1">{s.note}</p>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(s.id)}
                                                className="w-full min-h-[40px] text-xs font-semibold text-red-400/90 flex items-center justify-center gap-1.5"
                                            >
                                                <Trash2 size={14} /> Borrar sesión
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <p className="text-center text-[11px] text-[var(--text-secondary)]/70 px-4">
                El cardio cuenta para tu racha y el heatmap. No afecta Smart Loading ni volumen de pesas.
            </p>
            <div className="text-center">
                <Link to="/" className="text-sm font-semibold text-[var(--primary)]">
                    ← Inicio
                </Link>
            </div>
        </div>
    );
}
