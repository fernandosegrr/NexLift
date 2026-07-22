import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    HeartPulse, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
    Save, X, Flame, Check, Play, Pencil, ChevronLeft
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

/**
 * Atajos de un toque. Textos en lenguaje normal (no jerga de gym).
 * "Cuesta" = qué tan empinada va la cinta. Velocidad en km/h es obligatoria.
 */
const DEFAULT_SPEED = '5';
const QUICK_PRESETS = [
    { durationMin: '10', incline: '12', speed: '5', title: '10 minutos', effort: 'Cuesta fuerte' },
    { durationMin: '5', incline: '3', speed: '5.5', title: '5 minutos', effort: 'Cuesta suave' },
    { durationMin: '10', incline: '15', speed: '4.5', title: '10 minutos', effort: 'Cuesta muy fuerte' },
    { durationMin: '5', incline: '0', speed: '5.5', title: '5 minutos', effort: 'Plana (sin cuesta)' }
];

const DRAFT_KEY_PREFIX = 'nexlift_cardio_draft_';

function draftKey(day = mexicoCityDateStr()) {
    return `${DRAFT_KEY_PREFIX}${day}`;
}

function newSegId() {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeSegment({ durationMin = '10', incline = '12', speed = DEFAULT_SPEED, completed = false } = {}) {
    return {
        id: newSegId(),
        durationMin: String(durationMin),
        incline: incline === '' || incline == null ? '' : String(incline),
        speed: speed === '' || speed == null ? DEFAULT_SPEED : String(speed),
        completed: !!completed,
        completedAt: completed ? Date.now() : null
    };
}

function defaultPlanSegments() {
    return [
        makeSegment({ durationMin: '10', incline: '12', speed: '5', completed: false }),
        makeSegment({ durationMin: '5', incline: '3', speed: '5.5', completed: false }),
        makeSegment({ durationMin: '10', incline: '12', speed: '5', completed: false })
    ];
}

function hasValidSpeed(seg) {
    const sp = parseFloat(seg?.speed);
    return Number.isFinite(sp) && sp > 0 && sp <= 50;
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

/**
 * Traduce el número de inclinación de la máquina a lenguaje humano.
 * La mayoría de gente no sabe qué es "inclinación 12" sin contexto.
 */
function inclineWords(incline) {
    if (incline === '' || incline == null) {
        return { short: 'Sin cuesta', detail: 'Sin inclinación definida', bars: 0 };
    }
    const n = Number(incline);
    if (!Number.isFinite(n) || n <= 0) {
        return { short: 'Plana', detail: 'Suelo plano', bars: 0 };
    }
    if (n <= 4) return { short: 'Cuesta suave', detail: `Empinada un poco (${n} en la máquina)`, bars: 1 };
    if (n <= 8) return { short: 'Cuesta media', detail: `Empinada media (${n} en la máquina)`, bars: 2 };
    if (n <= 12) return { short: 'Cuesta fuerte', detail: `Bastante empinada (${n} en la máquina)`, bars: 3 };
    return { short: 'Cuesta muy fuerte', detail: `Muy empinada (${n} en la máquina)`, bars: 4 };
}

function segLabel(seg) {
    const min = seg.durationMin || '?';
    const { short } = inclineWords(seg.incline);
    const sp = hasValidSpeed(seg) ? ` · ${seg.speed} km/h` : '';
    return `${min} min · ${short}${sp}`;
}

function segLabelShort(seg) {
    return segLabel(seg);
}

/** Barras tipo “qué tan empinado” (0–4), más intuitivo que un número suelto. */
function InclineBars({ level = 0 }) {
    return (
        <div className="flex items-end gap-0.5 h-3" aria-hidden>
            {[1, 2, 3, 4].map(i => (
                <span
                    key={i}
                    className={`w-1 rounded-sm ${
                        i <= level ? 'bg-rose-400' : 'bg-[var(--border)]'
                    }`}
                    style={{ height: `${6 + i * 2}px` }}
                />
            ))}
        </div>
    );
}

/** Stepper numérico táctil (gym-friendly, sin teclado si no hace falta). */
function NumStepper({ label, value, onChange, step = 1, min = 0, max = 999, suffix = '' }) {
    const n = parseFloat(value);
    const safe = Number.isFinite(n) ? n : 0;
    const bump = (dir) => {
        const decimals = step < 1 ? 1 : 0;
        const factor = 10 ** decimals;
        const next = Math.round((safe + dir * step) * factor) / factor;
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
                        className="w-full bg-transparent text-center text-2xl font-black tabular-nums outline-none focus:text-rose-300"
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

/** Puntos de progreso (evita anillos SVG raros / líneas visuales raras). */
function ProgressDots({ done, total }) {
    const n = Math.max(total, 1);
    return (
        <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: n }, (_, i) => (
                <span
                    key={i}
                    className={`h-2.5 rounded-full transition-colors ${
                        i < done
                            ? 'w-2.5 bg-[var(--success)]'
                            : i === done
                                ? 'w-4 bg-rose-400'
                                : 'w-2.5 bg-[var(--border)]'
                    }`}
                />
            ))}
        </div>
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
    const [quickSpeed, setQuickSpeed] = useState(DEFAULT_SPEED);
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
            const target = prev.segments.find(s => s.id === id);
            // Al marcar como hecho, velocidad es obligatoria
            if (target && !target.completed && !hasValidSpeed(target)) {
                toast.error('Pon la velocidad (km/h) de la máquina antes de marcar listo');
                // Abrir editor en el siguiente tick (no anular con setEditingSegId(null))
                queueMicrotask(() => setEditingSegId(id));
                return prev;
            }
            queueMicrotask(() => setEditingSegId(null));
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
    }, [toast]);

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
                speed: last?.speed || DEFAULT_SPEED,
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
        const speed = partial.speed != null && partial.speed !== ''
            ? String(partial.speed)
            : DEFAULT_SPEED;
        if (!hasValidSpeed({ speed })) {
            toast.error('Velocidad obligatoria (km/h)');
            return;
        }
        const nextSeg = makeSegment({
            durationMin: partial.durationMin ?? '10',
            incline: partial.incline ?? '12',
            speed,
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
        toast.success(`${segLabel(nextSeg)} · listo`);
    }, [toast]);

    const logQuickCustom = useCallback(() => {
        const min = parseFloat(quickMin);
        if (!Number.isFinite(min) || min <= 0) {
            toast.error('Minutos inválidos');
            return;
        }
        if (!hasValidSpeed({ speed: quickSpeed })) {
            toast.error('Velocidad obligatoria (km/h de la máquina)');
            return;
        }
        logDoneSegment({
            durationMin: String(quickMin),
            incline: quickIncline === '' ? '' : String(quickIncline),
            speed: String(quickSpeed)
        });
        setQuickIncline(prev => (String(prev) === '12' ? '3' : '12'));
        setQuickMin(prev => (prev === '10' ? '5' : '10'));
        setShowCustom(false);
    }, [quickMin, quickIncline, quickSpeed, logDoneSegment, toast]);

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

    async function handleSave() {
        if (!draft) return;
        const missingSpeed = doneSegments.find(s => !hasValidSpeed(s));
        if (missingSpeed) {
            toast.error('Cada tramo hecho necesita velocidad (km/h)');
            setEditingSegId(missingSpeed.id);
            return;
        }

        const clean = doneSegments
            .map(parseSegNums)
            .filter(s => Number.isFinite(s.durationMin) && s.durationMin > 0 && Number.isFinite(s.speed) && s.speed > 0);

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
        <div className={`grid grid-cols-2 gap-2 ${className}`}>
            {QUICK_PRESETS.map(p => {
                const lvl = inclineWords(p.incline);
                return (
                    <button
                        key={p.title + p.effort}
                        type="button"
                        onClick={() => logDoneSegment(p)}
                        className="flex flex-col items-start justify-center min-h-[80px] px-3 py-2.5 rounded-2xl bg-[var(--bg-dark)] border border-[var(--border)] active:scale-[0.97] active:border-rose-400/50 active:bg-rose-500/10 transition-all text-left"
                    >
                        <span className="text-base font-black text-white tabular-nums leading-none">
                            {p.title}
                        </span>
                        <span className="text-[12px] font-semibold text-rose-200/95 mt-1 leading-tight">
                            {p.effort}
                        </span>
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5 tabular-nums">
                            {p.speed} km/h
                        </span>
                        <div className="mt-1.5">
                            <InclineBars level={lvl.bars} />
                        </div>
                    </button>
                );
            })}
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
                    {/* Hero CTA — sin bloques morados; lenguaje simple */}
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
                        <div>
                            <h2 className="text-lg font-black leading-snug">
                                ¿Qué acabas de hacer?
                            </h2>
                            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                                Elige <span className="text-white font-semibold">cuánto tiempo</span>,
                                {' '}<span className="text-white font-semibold">qué tan empinada</span>
                                {' '}iba y la <span className="text-white font-semibold">velocidad (km/h)</span>
                                {' '}de la máquina. Un toque y queda en el teléfono.
                            </p>
                        </div>

                        {/* Mini guía visual de “cuesta” */}
                        <div className="rounded-2xl bg-[var(--bg-dark)] border border-[var(--border)] p-3 space-y-2">
                            <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                                Qué significa “cuesta”
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                {[
                                    { bars: 0, t: 'Plana', d: 'Suelo horizontal' },
                                    { bars: 1, t: 'Suave', d: 'Un poquito arriba' },
                                    { bars: 3, t: 'Fuerte', d: 'Bien empinada' },
                                    { bars: 4, t: 'Muy fuerte', d: 'Muy empinada' }
                                ].map(row => (
                                    <div key={row.t} className="flex items-center gap-2">
                                        <InclineBars level={row.bars} />
                                        <div className="min-w-0">
                                            <p className="font-bold text-white leading-tight">{row.t}</p>
                                            <p className="text-[10px] text-[var(--text-secondary)] leading-tight">{row.d}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <QuickPresetGrid />
                        <button
                            type="button"
                            onClick={() => { startSession('empty'); setShowCustom(true); }}
                            className="w-full min-h-[44px] text-sm font-semibold text-[var(--text-secondary)] flex items-center justify-center gap-1.5 border border-dashed border-[var(--border)] rounded-xl"
                        >
                            Otro tiempo o cuesta…
                        </button>
                    </div>

                    {/* Plan opcional — rose, no morado primary */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
                        <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                            Prefieres un plan listo
                        </p>
                        <button
                            type="button"
                            onClick={() => startSession('plan')}
                            className="w-full min-h-[52px] px-3 rounded-2xl bg-rose-500/90 text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] py-3"
                        >
                            <Play size={18} fill="currentColor" aria-hidden />
                            Empezar plan de 3 tramos
                        </button>
                        <ul className="text-xs text-[var(--text-secondary)] space-y-1 px-1">
                            <li>1. 10 min · cuesta fuerte</li>
                            <li>2. 5 min · cuesta suave</li>
                            <li>3. 10 min · cuesta fuerte</li>
                        </ul>
                        <p className="text-[11px] text-[var(--text-secondary)] text-center pt-1">
                            Vas marcando cada uno con ✓ cuando lo termines
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
                    {/* Hero progreso — limpio, sin anillo ni barra morada */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-[var(--success)] uppercase tracking-wide">
                                    Sesión en curso
                                </p>
                                <p className="text-3xl font-black tabular-nums leading-none mt-1">
                                    {Math.round(doneMin * 10) / 10}
                                    <span className="text-base font-semibold text-[var(--text-secondary)] ml-1">min</span>
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                                    {doneSegments.length} tramo{doneSegments.length === 1 ? '' : 's'} hecho
                                    {doneSegments.length === 1 ? '' : 's'}
                                    {pendingSegments.length > 0 && (
                                        <> · {pendingSegments.length} por hacer</>
                                    )}
                                </p>
                            </div>
                            <span className="text-[10px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-dark)] border border-[var(--border)] px-2 py-1 rounded-lg shrink-0">
                                Auto-guardado
                            </span>
                        </div>
                        {draft.segments.length > 0 && (
                            <ProgressDots
                                done={doneSegments.length}
                                total={draft.segments.length}
                            />
                        )}
                    </div>

                    {/* Actividad — rose activo, no morado */}
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
                                            ? 'bg-rose-500 text-white border-rose-500'
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
                        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                        Siguiente tramo
                                    </p>
                                    <p className="text-2xl font-black tabular-nums tracking-tight mt-0.5 leading-tight">
                                        {currentPending.durationMin || '?'} minutos
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <InclineBars level={inclineWords(currentPending.incline).bars} />
                                        <p className="text-sm font-semibold text-rose-200/95">
                                            {inclineWords(currentPending.incline).short}
                                        </p>
                                    </div>
                                    <p className="text-sm font-bold tabular-nums text-white mt-1">
                                        Velocidad: {hasValidSpeed(currentPending) ? `${currentPending.speed} km/h` : 'falta ponerla'}
                                    </p>
                                    <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                                        {inclineWords(currentPending.incline).detail}
                                    </p>
                                </div>
                            </div>
                            {!hasValidSpeed(currentPending) && (
                                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2">
                                    <p className="text-xs text-amber-100 font-semibold leading-snug">
                                        Falta la velocidad (km/h de la máquina). Toca “Cambiar…” y ponla antes de marcar listo.
                                    </p>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => toggleSegmentDone(currentPending.id)}
                                className="w-full min-h-[56px] rounded-2xl bg-[var(--success)] text-white text-base font-black flex items-center justify-center gap-2 active:scale-[0.98]"
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
                                Cambiar tiempo, cuesta o velocidad
                            </button>
                        </div>
                    )}

                    {/* Atajos extras (siempre visibles en sesión) */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                                + Otro tramo
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowCustom(v => !v)}
                                className="text-xs font-bold text-rose-300 min-h-[36px] px-2"
                            >
                                {showCustom ? 'Cerrar' : 'Ajustar a mano'}
                            </button>
                        </div>
                        <QuickPresetGrid />
                        {showCustom && (
                            <div className="pt-2 border-t border-[var(--border)] space-y-3 animate-fade-in">
                                <p className="text-[11px] text-[var(--text-secondary)] text-center leading-snug">
                                    Usa los números de la pantalla de la máquina. Velocidad es obligatoria.
                                </p>
                                <div className="flex justify-around flex-wrap gap-y-3">
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
                                        label="Cuesta"
                                        value={quickIncline}
                                        onChange={setQuickIncline}
                                        step={1}
                                        min={0}
                                        max={40}
                                        suffix=""
                                    />
                                    <NumStepper
                                        label="Velocidad"
                                        value={quickSpeed}
                                        onChange={setQuickSpeed}
                                        step={0.1}
                                        min={0.1}
                                        max={50}
                                        suffix="km/h"
                                    />
                                </div>
                                <p className="text-center text-xs font-semibold text-rose-200/90">
                                    {inclineWords(quickIncline).short} · {quickSpeed || '?'} km/h
                                </p>
                                <button
                                    type="button"
                                    onClick={logQuickCustom}
                                    className="w-full min-h-[48px] rounded-2xl bg-rose-500 text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] px-3 text-center leading-snug"
                                >
                                    <Check size={18} strokeWidth={3} className="shrink-0" />
                                    <span>
                                        Añadir {quickMin} min · {inclineWords(quickIncline).short} · {quickSpeed} km/h
                                    </span>
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
                                className="text-xs font-bold text-rose-300 flex items-center gap-1 min-h-[36px]"
                            >
                                <Plus size={14} /> Añadir pendiente
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
                                                    <span className="font-bold text-sm tabular-nums leading-snug">
                                                        {segLabel(seg)}
                                                    </span>
                                                    <span className="text-[10px] text-[var(--text-secondary)]">
                                                        {seg.completed
                                                            ? 'Hecho'
                                                            : !hasValidSpeed(seg)
                                                                ? 'Falta velocidad'
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
                                                    <div className="flex justify-around flex-wrap gap-y-3">
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
                                                            label="Cuesta"
                                                            value={seg.incline === '' ? '0' : seg.incline}
                                                            onChange={v => updateSegment(seg.id, 'incline', v)}
                                                            step={1}
                                                            min={0}
                                                            max={40}
                                                            suffix=""
                                                        />
                                                        <NumStepper
                                                            label="Velocidad"
                                                            value={seg.speed === '' ? DEFAULT_SPEED : seg.speed}
                                                            onChange={v => updateSegment(seg.id, 'speed', v)}
                                                            step={0.1}
                                                            min={0.1}
                                                            max={50}
                                                            suffix="km/h"
                                                        />
                                                    </div>
                                                    <p className="text-center text-xs font-semibold text-rose-200/90">
                                                        {inclineWords(seg.incline).detail}
                                                        {hasValidSpeed(seg) ? ` · ${seg.speed} km/h` : ' · falta velocidad'}
                                                    </p>
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
                                        className="w-full min-h-[48px] px-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-base font-bold tabular-nums focus:border-rose-400 outline-none"
                                    />
                                    {estimatedKcal != null && doneSegments.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => updateDraft({ calories: String(estimatedKcal) })}
                                            className="mt-2 text-xs font-bold text-rose-300 min-h-[36px]"
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
                                        placeholder="ej. me sentí bien"
                                        className="w-full min-h-[44px] px-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-sm focus:border-rose-400 outline-none"
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
                                className="flex-1 min-h-[54px] rounded-2xl bg-rose-500 text-white font-black text-base flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]"
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
                                                        className="text-xs font-semibold tabular-nums px-2.5 py-1.5 rounded-xl bg-[var(--bg-dark)] border border-[var(--border)]"
                                                    >
                                                        {segLabelShort({
                                                            durationMin: seg.durationMin,
                                                            incline: seg.incline != null ? String(seg.incline) : '',
                                                            speed: seg.speed != null ? String(seg.speed) : ''
                                                        })}
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
