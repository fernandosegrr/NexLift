import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    HeartPulse, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
    Save, X, Flame, Check, Play, Pencil, ChevronLeft, Zap
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { mexicoCityDateStr } from '../utils/dates';
import { estimateCardioCalories } from '../utils/cardioCalories';

const ACTIVITIES = [
    { id: 'caminadora', label: 'Cinta', emoji: '🏃' },
    { id: 'bici', label: 'Bici', emoji: '🚴' },
    { id: 'eliptica', label: 'Elíptica', emoji: '⚡' },
    { id: 'otro', label: 'Otro', emoji: '💪' }
];

/** Atajos del patrón típico en cinta (un toque = tramo ya hecho). */
const QUICK_PRESETS = [
    { durationMin: '10', incline: '12', label: '10′', sub: '@12' },
    { durationMin: '5', incline: '3', label: '5′', sub: '@3' },
    { durationMin: '10', incline: '15', label: '10′', sub: '@15' },
    { durationMin: '5', incline: '0', label: '5′', sub: '@0' }
];

const DRAFT_KEY_PREFIX = 'nexlift_cardio_draft_';

function draftKey(day = mexicoCityDateStr()) {
    return `${DRAFT_KEY_PREFIX}${day}`;
}

function newSegId() {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeSegment({ durationMin = '10', incline = '12', speed = '', completed = false } = {}) {
    return {
        id: newSegId(),
        durationMin: String(durationMin),
        incline: incline === '' || incline == null ? '' : String(incline),
        speed: speed === '' || speed == null ? '' : String(speed),
        completed: !!completed,
        completedAt: completed ? Date.now() : null
    };
}

function defaultPlanSegments() {
    return [
        makeSegment({ durationMin: '10', incline: '12', completed: false }),
        makeSegment({ durationMin: '5', incline: '3', completed: false }),
        makeSegment({ durationMin: '10', incline: '12', completed: false })
    ];
}

function emptyDraft() {
    return {
        version: 1,
        activity: 'caminadora',
        note: '',
        calories: '',
        segments: defaultPlanSegments(),
        startedAt: Date.now(),
        updatedAt: Date.now()
    };
}

function loadDraft() {
    try {
        const raw = localStorage.getItem(draftKey());
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || !Array.isArray(d.segments)) return null;
        // Permitir draft vacío (modo ir sumando)
        d.segments = (d.segments || []).map(s => ({
            ...makeSegment({}),
            ...s,
            id: s.id || newSegId(),
            durationMin: s.durationMin != null ? String(s.durationMin) : '',
            incline: s.incline != null && s.incline !== '' ? String(s.incline) : '',
            speed: s.speed != null && s.speed !== '' ? String(s.speed) : '',
            completed: !!s.completed
        }));
        return d;
    } catch {
        return null;
    }
}

function saveDraft(draft) {
    try {
        localStorage.setItem(draftKey(), JSON.stringify({
            ...draft,
            updatedAt: Date.now()
        }));
    } catch { /* localStorage lleno / privado */ }
}

function clearDraft() {
    try {
        localStorage.removeItem(draftKey());
    } catch { /* ignore */ }
}

function activityMeta(id) {
    return ACTIVITIES.find(a => a.id === id) || ACTIVITIES[3];
}

function formatSessionDate(date) {
    const key = mexicoCityDateStr(new Date(date));
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-MX', {
        weekday: 'short', day: 'numeric', month: 'short'
    });
}

function parseSegNums(seg) {
    return {
        durationMin: parseFloat(seg.durationMin),
        incline: seg.incline === '' || seg.incline == null ? null : parseFloat(seg.incline),
        speed: seg.speed === '' || seg.speed == null ? null : parseFloat(seg.speed)
    };
}

function segLabel(seg) {
    const min = seg.durationMin || '?';
    const inc = seg.incline !== '' && seg.incline != null ? seg.incline : '—';
    return `${min}′ @${inc}`;
}

/** Stepper numérico táctil (gym-friendly, sin teclado si no hace falta). */
function NumStepper({ label, value, onChange, step = 1, min = 0, max = 999, suffix = '' }) {
    const n = parseFloat(value);
    const safe = Number.isFinite(n) ? n : 0;
    const bump = (dir) => {
        const next = Math.round((safe + dir * step) * 10) / 10;
        const clamped = Math.min(max, Math.max(min, next));
        onChange(String(clamped));
    };
    return (
        <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                {label}
            </span>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => bump(-1)}
                    aria-label={`Bajar ${label}`}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-[var(--bg-dark)] border border-[var(--border)] text-xl font-bold text-[var(--text-secondary)] active:scale-95 active:bg-[var(--bg-card)]"
                >
                    −
                </button>
                <div className="w-16 text-center">
                    <input
                        type="number"
                        inputMode="decimal"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        className="w-full bg-transparent text-center text-2xl font-black tabular-nums outline-none focus:text-[var(--primary)]"
                        aria-label={label}
                    />
                    {suffix && (
                        <span className="block text-[10px] text-[var(--text-secondary)] -mt-0.5">{suffix}</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => bump(1)}
                    aria-label={`Subir ${label}`}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-[var(--bg-dark)] border border-[var(--border)] text-xl font-bold text-[var(--text-secondary)] active:scale-95 active:bg-[var(--bg-card)]"
                >
                    +
                </button>
            </div>
        </div>
    );
}

function ProgressRing({ done, total, size = 64 }) {
    const pct = total > 0 ? Math.min(1, done / total) : 0;
    const stroke = 5;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - pct);
    return (
        <svg width={size} height={size} className="shrink-0 -rotate-90" aria-hidden>
            <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="var(--border)"
                strokeWidth={stroke}
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="var(--success)"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={offset}
                className="transition-[stroke-dashoffset] duration-500"
            />
        </svg>
    );
}

export default function Cardio() {
    const toast = useToast();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [bodyWeightKg, setBodyWeightKg] = useState(null);

    const [draft, setDraft] = useState(null);
    const hydratedRef = useRef(false);

    const [quickMin, setQuickMin] = useState('10');
    const [quickIncline, setQuickIncline] = useState('12');
    const [showCustom, setShowCustom] = useState(false);
    const [editingSegId, setEditingSegId] = useState(null);
    const [showFinish, setShowFinish] = useState(false);

    useEffect(() => {
        const existing = loadDraft();
        if (existing) setDraft(existing);
        hydratedRef.current = true;
    }, []);

    useEffect(() => {
        if (!hydratedRef.current) return;
        if (draft) saveDraft(draft);
    }, [draft]);

    async function loadHistory() {
        setLoading(true);
        try {
            const [data, bodyLogs] = await Promise.all([
                api.getCardioSessions(40),
                api.getBodyLogs(1).catch(() => [])
            ]);
            setSessions(Array.isArray(data) ? data : []);
            const w = Array.isArray(bodyLogs) && bodyLogs[0]?.weight
                ? Number(bodyLogs[0].weight)
                : null;
            setBodyWeightKg(Number.isFinite(w) && w > 0 ? w : null);
        } catch (e) {
            console.error(e);
            toast.error('No se pudo cargar el historial');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadHistory(); }, []);

    const startSession = useCallback((mode = 'plan') => {
        if (draft) return;
        const base = emptyDraft();
        if (mode === 'empty') base.segments = [];
        setDraft(base);
        saveDraft(base);
        setShowFinish(false);
        setEditingSegId(null);
    }, [draft]);

    const discardSession = useCallback(() => {
        if (!draft) return;
        const hasDone = draft.segments.some(s => s.completed);
        if (hasDone && !window.confirm('¿Descartar la sesión? Se pierde lo no guardado.')) {
            return;
        }
        clearDraft();
        setDraft(null);
        setShowFinish(false);
        setEditingSegId(null);
        toast.info('Sesión descartada');
    }, [draft, toast]);

    const updateDraft = useCallback((patch) => {
        setDraft(prev => (prev ? { ...prev, ...patch, updatedAt: Date.now() } : prev));
    }, []);

    const updateSegment = useCallback((id, field, value) => {
        setDraft(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                updatedAt: Date.now(),
                segments: prev.segments.map(s => (s.id === id ? { ...s, [field]: value } : s))
            };
        });
    }, []);

    const toggleSegmentDone = useCallback((id) => {
        setDraft(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                updatedAt: Date.now(),
                segments: prev.segments.map(s => {
                    if (s.id !== id) return s;
                    const next = !s.completed;
                    return { ...s, completed: next, completedAt: next ? Date.now() : null };
                })
            };
        });
        setEditingSegId(null);
    }, []);

    const removeSegment = useCallback((id) => {
        setDraft(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                updatedAt: Date.now(),
                segments: prev.segments.filter(s => s.id !== id)
            };
        });
        setEditingSegId(cur => (cur === id ? null : cur));
    }, []);

    const addPendingSegment = useCallback(() => {
        let newId = null;
        setDraft(prev => {
            if (!prev) return prev;
            const last = prev.segments[prev.segments.length - 1];
            const nextIncline = last?.incline === '12' || last?.incline === 12 ? '3' : '12';
            const nextMin = last?.durationMin === '10' ? '5' : '10';
            const seg = makeSegment({
                durationMin: nextMin,
                incline: nextIncline,
                speed: last?.speed || '',
                completed: false
            });
            newId = seg.id;
            return {
                ...prev,
                updatedAt: Date.now(),
                segments: [...prev.segments, seg]
            };
        });
        if (newId) setEditingSegId(newId);
    }, []);

    const logDoneSegment = useCallback((partial) => {
        const nextSeg = makeSegment({
            durationMin: partial.durationMin ?? '10',
            incline: partial.incline ?? '12',
            speed: partial.speed ?? '',
            completed: true
        });
        setDraft(prev => {
            if (!prev) {
                return { ...emptyDraft(), segments: [nextSeg], updatedAt: Date.now() };
            }
            return {
                ...prev,
                segments: [...prev.segments, nextSeg],
                updatedAt: Date.now()
            };
        });
        toast.success(`${partial.durationMin || '?'}′ @${partial.incline ?? '—'} · listo`);
    }, [toast]);

    const logQuickCustom = useCallback(() => {
        const min = parseFloat(quickMin);
        if (!Number.isFinite(min) || min <= 0) {
            toast.error('Minutos inválidos');
            return;
        }
        logDoneSegment({
            durationMin: String(quickMin),
            incline: quickIncline === '' ? '' : String(quickIncline)
        });
        setQuickIncline(prev => (String(prev) === '12' ? '3' : '12'));
        setQuickMin(prev => (prev === '10' ? '5' : '10'));
        setShowCustom(false);
    }, [quickMin, quickIncline, logDoneSegment, toast]);

    const doneSegments = useMemo(
        () => (draft?.segments || []).filter(s => s.completed),
        [draft]
    );
    const pendingSegments = useMemo(
        () => (draft?.segments || []).filter(s => !s.completed),
        [draft]
    );
    const doneMin = useMemo(
        () => doneSegments.reduce((a, s) => a + (parseFloat(s.durationMin) || 0), 0),
        [doneSegments]
    );
    const planMin = useMemo(
        () => (draft?.segments || []).reduce((a, s) => a + (parseFloat(s.durationMin) || 0), 0),
        [draft]
    );
    const estimatedKcal = useMemo(() => {
        if (!draft) return null;
        const clean = doneSegments
            .map(parseSegNums)
            .filter(s => Number.isFinite(s.durationMin) && s.durationMin > 0);
        return estimateCardioCalories({
            activity: draft.activity,
            segments: clean,
            weightKg: bodyWeightKg
        });
    }, [draft, doneSegments, bodyWeightKg]);

    const currentPending = pendingSegments[0] || null;
    const currentPendingId = currentPending?.id || null;
    const progressPct = draft?.segments?.length
        ? Math.round((doneSegments.length / draft.segments.length) * 100)
        : 0;

    async function handleSave() {
        if (!draft) return;
        const clean = doneSegments
            .map(parseSegNums)
            .filter(s => Number.isFinite(s.durationMin) && s.durationMin > 0);

        if (clean.length === 0) {
            toast.error('Marca al menos un tramo con ✓');
            return;
        }

        let calPayload = null;
        if (draft.calories !== '' && draft.calories != null) {
            const n = parseInt(String(draft.calories).trim(), 10);
            if (!Number.isFinite(n) || n < 0 || n > 10000) {
                toast.error('Calorías inválidas (0–10000)');
                return;
            }
            calPayload = n;
        }

        const pendingLeft = pendingSegments.length;
        if (pendingLeft > 0) {
            if (!window.confirm(
                `${pendingLeft} tramo${pendingLeft === 1 ? '' : 's'} sin marcar no se guardarán. ¿OK?`
            )) return;
        }

        setSaving(true);
        try {
            const created = await api.createCardioSession({
                activity: draft.activity,
                segments: clean,
                note: (draft.note || '').trim() || null,
                calories: calPayload
            });
            setSessions(prev => [created, ...prev]);
            clearDraft();
            setDraft(null);
            setShowFinish(false);
            const kcalPart = created.calories != null ? ` · ${created.calories} kcal` : '';
            toast.success(`Guardado · ${created.totalMin} min${kcalPart}`);
        } catch (e) {
            toast.error(e.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id) {
        if (!window.confirm('¿Borrar esta sesión?')) return;
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

    const weekKcal = useMemo(() => {
        const cutoff = mexicoCityDateStr(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
        return sessions
            .filter(s => mexicoCityDateStr(new Date(s.date)) >= cutoff)
            .reduce((a, s) => a + (s.calories || 0), 0);
    }, [sessions]);

    // ——— UI bits reutilizados ———
    const QuickPresetGrid = ({ className = '' }) => (
        <div className={`grid grid-cols-4 gap-2 ${className}`}>
            {QUICK_PRESETS.map(p => (
                <button
                    key={p.label + p.sub}
                    type="button"
                    onClick={() => logDoneSegment(p)}
                    className="flex flex-col items-center justify-center min-h-[72px] rounded-2xl bg-rose-500/12 border border-rose-500/25 active:scale-[0.96] active:bg-rose-500/25 transition-all"
                >
                    <span className="text-lg font-black text-rose-200 tabular-nums leading-none">{p.label}</span>
                    <span className="text-xs font-bold text-rose-300/80 mt-1">{p.sub}</span>
                </button>
            ))}
        </div>
    );

    return (
        <div className={`max-w-lg mx-auto space-y-4 animate-fade-in ${draft ? 'pb-40' : 'pb-8'}`}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link
                    to="/"
                    className="w-10 h-10 min-w-[40px] rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] active:scale-95"
                    aria-label="Volver al inicio"
                >
                    <ChevronLeft size={20} />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center">
                            <HeartPulse size={18} className="text-rose-400" aria-hidden />
                        </span>
                        Cardio
                    </h1>
                </div>
                {!draft && (
                    <div className="text-right shrink-0">
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-wide">
                            Semana
                        </p>
                        <p className="text-sm font-black tabular-nums">
                            {Math.round(weekMin * 10) / 10}
                            <span className="text-[var(--text-secondary)] font-semibold text-xs ml-0.5">min</span>
                        </p>
                    </div>
                )}
            </div>

            {/* ========== IDLE ========== */}
            {!draft && (
                <div className="space-y-4">
                    {/* Hero CTA */}
                    <div className="relative overflow-hidden rounded-3xl border border-rose-500/20 bg-gradient-to-br from-rose-500/15 via-[var(--bg-card)] to-[var(--bg-card)] p-5">
                        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-rose-500/10 blur-2xl pointer-events-none" />
                        <p className="text-xs font-bold uppercase tracking-wider text-rose-300/90 mb-1">
                            En la máquina
                        </p>
                        <h2 className="text-lg font-black leading-snug mb-1">
                            Terminé un tramo → un toque
                        </h2>
                        <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                            Se guarda solo en el teléfono. No se pierde si cierras la app.
                        </p>
                        <QuickPresetGrid />
                        <button
                            type="button"
                            onClick={() => { startSession('empty'); setShowCustom(true); }}
                            className="w-full mt-3 min-h-[44px] text-sm font-semibold text-rose-300/90 flex items-center justify-center gap-1.5"
                        >
                            Otro valor (min + incl.)…
                        </button>
                    </div>

                    {/* Plan opcional */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4">
                        <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
                            O con plan
                        </p>
                        <button
                            type="button"
                            onClick={() => startSession('plan')}
                            className="w-full min-h-[52px] rounded-2xl bg-[var(--primary)] text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                            <Play size={18} fill="currentColor" aria-hidden />
                            10′@12 → 5′@3 → 10′@12
                        </button>
                        <p className="text-[11px] text-[var(--text-secondary)] text-center mt-2">
                            Marcas cada tramo con ✓ al terminarlo
                        </p>
                    </div>

                    {/* Stats semana si hay kcal */}
                    {(weekMin > 0 || weekKcal > 0) && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3">
                                <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">Min semana</p>
                                <p className="text-xl font-black tabular-nums mt-0.5">
                                    {Math.round(weekMin * 10) / 10}
                                </p>
                            </div>
                            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3">
                                <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase flex items-center gap-1">
                                    <Flame size={10} className="text-orange-400" /> kcal
                                </p>
                                <p className="text-xl font-black tabular-nums mt-0.5 text-orange-300">
                                    {weekKcal || '—'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========== SESIÓN EN CURSO ========== */}
            {draft && (
                <div className="space-y-3">
                    {/* Hero progreso */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-4">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <ProgressRing done={doneSegments.length} total={Math.max(draft.segments.length, 1)} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
                                    <span className="text-sm font-black tabular-nums leading-none">
                                        {doneSegments.length}
                                    </span>
                                    <span className="text-[9px] text-[var(--text-secondary)] font-bold">
                                        /{draft.segments.length || 0}
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-bold text-[var(--success)] uppercase tracking-wide">
                                        En curso
                                    </span>
                                    <span className="text-[10px] text-[var(--text-secondary)]">
                                        auto-guardado
                                    </span>
                                </div>
                                <p className="text-2xl font-black tabular-nums leading-none">
                                    {Math.round(doneMin * 10) / 10}
                                    <span className="text-sm font-semibold text-[var(--text-secondary)] ml-1">min</span>
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
                                    {doneSegments.length} hecho{doneSegments.length === 1 ? '' : 's'}
                                    {pendingSegments.length > 0 && (
                                        <> · {pendingSegments.length} pendiente{pendingSegments.length === 1 ? '' : 's'}</>
                                    )}
                                    {planMin > doneMin && (
                                        <> · plan {Math.round(planMin * 10) / 10}′</>
                                    )}
                                </p>
                            </div>
                        </div>
                        {/* Barra fina */}
                        {draft.segments.length > 0 && (
                            <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-dark)] overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-[var(--success)] transition-all duration-500"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        )}
                        {/* Chips timeline */}
                        {draft.segments.length > 0 && (
                            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 scrollbar-none">
                                {draft.segments.map((s, i) => {
                                    const isCurrent = s.id === currentPendingId;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => {
                                                if (s.completed) setEditingSegId(editingSegId === s.id ? null : s.id);
                                                else setEditingSegId(s.id);
                                            }}
                                            className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-xl tabular-nums border transition-colors ${
                                                s.completed
                                                    ? 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30'
                                                    : isCurrent
                                                        ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                                                        : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border)]'
                                            }`}
                                        >
                                            {s.completed ? '✓ ' : isCurrent ? '→ ' : ''}
                                            {segLabel(s)}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Actividad — chips horizontales */}
                    <div className="flex gap-2 overflow-x-auto pb-0.5">
                        {ACTIVITIES.map(a => {
                            const on = draft.activity === a.id;
                            return (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => updateDraft({ activity: a.id })}
                                    className={`shrink-0 min-h-[44px] px-3.5 rounded-full text-sm font-bold border transition-all ${
                                        on
                                            ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-lg shadow-purple-900/30'
                                            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)]'
                                    }`}
                                >
                                    <span className="mr-1" aria-hidden>{a.emoji}</span>
                                    {a.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* CTA del tramo actual del plan */}
                    {currentPending && (
                        <div className="rounded-3xl border border-rose-500/35 bg-gradient-to-b from-rose-500/10 to-[var(--bg-card)] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300/90">
                                        Siguiente tramo
                                    </p>
                                    <p className="text-3xl font-black tabular-nums tracking-tight mt-0.5">
                                        {segLabel(currentPending)}
                                    </p>
                                </div>
                                <Zap size={22} className="text-rose-400/60 shrink-0" aria-hidden />
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleSegmentDone(currentPending.id)}
                                className="w-full min-h-[56px] rounded-2xl bg-[var(--success)] text-white text-base font-black flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-emerald-900/30"
                            >
                                <Check size={22} strokeWidth={3} />
                                Listo — lo hice
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingSegId(
                                    editingSegId === currentPending.id ? null : currentPending.id
                                )}
                                className="w-full min-h-[40px] text-xs font-semibold text-[var(--text-secondary)] flex items-center justify-center gap-1"
                            >
                                <Pencil size={12} />
                                Ajustar min / inclinación
                            </button>
                        </div>
                    )}

                    {/* Atajos extras (siempre visibles en sesión) */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                                + Tramo extra
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowCustom(v => !v)}
                                className="text-xs font-bold text-[var(--primary)] min-h-[36px] px-2"
                            >
                                {showCustom ? 'Cerrar' : 'Custom'}
                            </button>
                        </div>
                        <QuickPresetGrid />
                        {showCustom && (
                            <div className="pt-2 border-t border-[var(--border)] space-y-3 animate-fade-in">
                                <div className="flex justify-around">
                                    <NumStepper
                                        label="Minutos"
                                        value={quickMin}
                                        onChange={setQuickMin}
                                        step={1}
                                        min={0.5}
                                        max={120}
                                        suffix="min"
                                    />
                                    <NumStepper
                                        label="Inclinación"
                                        value={quickIncline}
                                        onChange={setQuickIncline}
                                        step={1}
                                        min={0}
                                        max={40}
                                        suffix="%"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={logQuickCustom}
                                    className="w-full min-h-[48px] rounded-2xl bg-rose-500 text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
                                >
                                    <Check size={18} strokeWidth={3} />
                                    Añadir {quickMin}′ @{quickIncline || '—'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Lista de tramos — compacta */}
                    <div>
                        <div className="flex items-center justify-between mb-2 px-0.5">
                            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                                Resumen
                            </p>
                            <button
                                type="button"
                                onClick={addPendingSegment}
                                className="text-xs font-bold text-[var(--primary)] flex items-center gap-1 min-h-[36px]"
                            >
                                <Plus size={14} /> Pendiente
                            </button>
                        </div>

                        {draft.segments.length === 0 ? (
                            <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-2xl p-6 text-center">
                                <p className="text-sm text-[var(--text-secondary)]">
                                    Sin tramos. Usa un atajo de arriba.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {draft.segments.map((seg, i) => {
                                    const isCurrent = seg.id === currentPendingId;
                                    const isEditing = editingSegId === seg.id;
                                    return (
                                        <div
                                            key={seg.id}
                                            className={`rounded-2xl border overflow-hidden transition-all ${
                                                seg.completed
                                                    ? 'bg-[var(--success)]/8 border-[var(--success)]/25'
                                                    : isCurrent
                                                        ? 'bg-[var(--bg-card)] border-rose-500/40'
                                                        : 'bg-[var(--bg-card)] border-[var(--border)]'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 p-2.5 pl-3">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSegmentDone(seg.id)}
                                                    aria-label={seg.completed ? 'Desmarcar' : 'Marcar hecho'}
                                                    aria-pressed={seg.completed}
                                                    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                                                        seg.completed
                                                            ? 'bg-[var(--success)] text-white'
                                                            : 'bg-[var(--bg-dark)] border border-[var(--border)] text-[var(--text-secondary)]'
                                                    }`}
                                                >
                                                    {seg.completed
                                                        ? <Check size={20} strokeWidth={3} />
                                                        : <span className="text-sm font-black tabular-nums">{i + 1}</span>}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingSegId(isEditing ? null : seg.id)}
                                                    className="flex-1 min-w-0 text-left min-h-[44px] flex flex-col justify-center"
                                                >
                                                    <span className="font-bold text-sm tabular-nums">
                                                        {segLabel(seg)}
                                                        {seg.speed !== '' && seg.speed != null && (
                                                            <span className="text-[var(--text-secondary)] font-medium text-xs ml-1.5">
                                                                · {seg.speed} km/h
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="text-[10px] text-[var(--text-secondary)]">
                                                        {seg.completed
                                                            ? 'Hecho'
                                                            : isCurrent
                                                                ? 'Ahora'
                                                                : 'Pendiente'}
                                                        {' · tocar para editar'}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeSegment(seg.id)}
                                                    aria-label="Borrar tramo"
                                                    className="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-red-400/50 hover:text-red-400"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>

                                            {isEditing && (
                                                <div className="px-3 pb-3 pt-1 border-t border-[var(--border)]/60 space-y-3 animate-fade-in">
                                                    <div className="flex justify-around">
                                                        <NumStepper
                                                            label="Minutos"
                                                            value={seg.durationMin}
                                                            onChange={v => updateSegment(seg.id, 'durationMin', v)}
                                                            step={1}
                                                            min={0.5}
                                                            max={120}
                                                            suffix="min"
                                                        />
                                                        <NumStepper
                                                            label="Inclinación"
                                                            value={seg.incline === '' ? '0' : seg.incline}
                                                            onChange={v => updateSegment(seg.id, 'incline', v)}
                                                            step={1}
                                                            min={0}
                                                            max={40}
                                                            suffix="%"
                                                        />
                                                    </div>
                                                    {draft.activity === 'caminadora' && (
                                                        <div>
                                                            <label className="text-[10px] text-[var(--text-secondary)] mb-1 block text-center">
                                                                Velocidad km/h (opc.)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                min="0"
                                                                step="0.1"
                                                                value={seg.speed}
                                                                onChange={e => updateSegment(seg.id, 'speed', e.target.value)}
                                                                placeholder="—"
                                                                className="w-full min-h-[44px] bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-center font-bold focus:border-[var(--primary)] outline-none"
                                                            />
                                                        </div>
                                                    )}
                                                    {!seg.completed && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSegmentDone(seg.id)}
                                                            className="w-full min-h-[48px] rounded-xl bg-[var(--success)] text-white font-bold flex items-center justify-center gap-2"
                                                        >
                                                            <Check size={18} strokeWidth={3} /> Marcar hecho
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Cierre: kcal + nota (colapsable) */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowFinish(v => !v)}
                            className="w-full flex items-center justify-between p-3.5 min-h-[48px] text-left"
                        >
                            <span className="text-sm font-bold flex items-center gap-2">
                                <Flame size={16} className="text-orange-400" aria-hidden />
                                Cerrar sesión
                                {draft.calories !== '' && draft.calories != null && (
                                    <span className="text-xs font-semibold text-orange-300 tabular-nums">
                                        · {draft.calories} kcal
                                    </span>
                                )}
                            </span>
                            {showFinish
                                ? <ChevronUp size={18} className="text-[var(--text-secondary)]" />
                                : <ChevronDown size={18} className="text-[var(--text-secondary)]" />}
                        </button>
                        {showFinish && (
                            <div className="px-3.5 pb-4 space-y-3 border-t border-[var(--border)] pt-3 animate-fade-in">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1.5 block">
                                        Calorías (opcional)
                                    </label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        max="10000"
                                        value={draft.calories}
                                        onChange={e => updateDraft({ calories: e.target.value })}
                                        placeholder="Lo que diga la máquina"
                                        className="w-full min-h-[48px] px-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-base font-bold tabular-nums focus:border-[var(--primary)] outline-none"
                                    />
                                    {estimatedKcal != null && doneSegments.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => updateDraft({ calories: String(estimatedKcal) })}
                                            className="mt-2 text-xs font-bold text-[var(--primary)] min-h-[36px]"
                                        >
                                            Usar estimación ≈ {estimatedKcal} kcal
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1.5 block">
                                        Nota
                                    </label>
                                    <input
                                        type="text"
                                        value={draft.note}
                                        onChange={e => updateDraft({ note: e.target.value })}
                                        placeholder="ej. Z2, me sentí bien"
                                        className="w-full min-h-[44px] px-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-sm focus:border-[var(--primary)] outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Barra fija Guardar */}
                    <div
                        className="fixed inset-x-0 z-40 p-3 pointer-events-none lg:bottom-0"
                        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <div className="max-w-lg mx-auto flex gap-2 pointer-events-auto">
                            <button
                                type="button"
                                onClick={discardSession}
                                className="min-h-[54px] w-14 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)]"
                                aria-label="Descartar sesión"
                            >
                                <X size={20} />
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || doneSegments.length === 0}
                                className="flex-1 min-h-[54px] rounded-2xl bg-[var(--primary)] text-white font-black text-base flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-purple-900/40 active:scale-[0.98]"
                            >
                                {saving ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Save size={18} />
                                )}
                                {doneSegments.length === 0
                                    ? 'Marca un tramo'
                                    : `Guardar · ${Math.round(doneMin * 10) / 10} min`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Historial — más limpio; se oculta un poco si hay sesión activa */}
            <div className={draft ? 'opacity-80' : ''}>
                <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2 px-0.5">
                    Historial
                </h2>
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-7 h-7 animate-spin text-[var(--primary)]" />
                    </div>
                ) : sessions.length === 0 ? (
                    !draft && (
                        <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-2xl p-6 text-center">
                            <HeartPulse className="w-9 h-9 text-[var(--border)] mx-auto mb-2" />
                            <p className="text-sm font-semibold text-[var(--text-secondary)]">
                                Aún no hay sesiones guardadas
                            </p>
                        </div>
                    )
                ) : (
                    <div className="space-y-2">
                        {sessions.map(s => {
                            const open = expandedId === s.id;
                            const meta = activityMeta(s.activity);
                            return (
                                <div
                                    key={s.id}
                                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(open ? null : s.id)}
                                        className="w-full flex items-center gap-3 p-3.5 text-left min-h-[56px]"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-lg shrink-0" aria-hidden>
                                            {meta.emoji}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm">{meta.label}</span>
                                                <span className="text-[11px] text-[var(--text-secondary)] capitalize">
                                                    {formatSessionDate(s.date)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--text-secondary)] tabular-nums mt-0.5">
                                                <span className="font-semibold text-[var(--text-primary)]/80">
                                                    {s.totalMin} min
                                                </span>
                                                {' · '}
                                                {s.segmentCount} tramo{s.segmentCount === 1 ? '' : 's'}
                                                {s.calories != null && (
                                                    <span className="text-orange-300/90"> · {s.calories} kcal</span>
                                                )}
                                            </p>
                                        </div>
                                        {open
                                            ? <ChevronUp size={18} className="text-[var(--text-secondary)] shrink-0" />
                                            : <ChevronDown size={18} className="text-[var(--text-secondary)] shrink-0" />}
                                    </button>
                                    {open && (
                                        <div className="px-3.5 pb-3.5 border-t border-[var(--border)] pt-3 space-y-2">
                                            <div className="flex flex-wrap gap-1.5">
                                                {(s.segments || []).map((seg, i) => (
                                                    <span
                                                        key={seg.id || i}
                                                        className="text-xs font-bold tabular-nums px-2.5 py-1.5 rounded-xl bg-[var(--bg-dark)] border border-[var(--border)]"
                                                    >
                                                        {seg.durationMin}′
                                                        {seg.incline != null ? ` @${seg.incline}` : ''}
                                                        {seg.speed != null ? ` · ${seg.speed}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                            {s.note && (
                                                <p className="text-xs text-[var(--text-secondary)] px-0.5">{s.note}</p>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(s.id)}
                                                className="w-full min-h-[40px] text-xs font-semibold text-red-400/90 flex items-center justify-center gap-1.5"
                                            >
                                                <Trash2 size={14} /> Borrar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {!draft && (
                <p className="text-center text-[11px] text-[var(--text-secondary)]/60 px-4 pb-2">
                    Cuenta para racha y heatmap · no afecta Smart Loading
                </p>
            )}
        </div>
    );
}
