import { useMemo, useEffect, useRef, useState } from 'react';
import { Award, Check, Lock, X } from 'lucide-react';
import { computeAchievements } from '../utils/achievements';
import { useToast } from './ui/Toast';

const SEEN_KEY = 'nexlift_achievements_seen';

export default function AchievementsStrip({ stats, prs = [] }) {
    const toast = useToast();
    const achievements = useMemo(() => computeAchievements({ stats, prs }), [stats, prs]);

    const unlocked = useMemo(() => achievements.filter(a => a.unlocked), [achievements]);
    const next = useMemo(
        () => achievements.filter(a => !a.unlocked).sort((a, b) => b.pct - a.pct)[0] || null,
        [achievements]
    );

    // Logro mostrado en el detalle superior: por defecto el próximo a conseguir.
    const detail = useMemo(
        () => next || unlocked[unlocked.length - 1] || null,
        [next, unlocked]
    );

    // Logro tocado por el usuario: abre el modal con el detalle completo.
    const [modalId, setModalId] = useState(null);
    const modalAchievement = useMemo(
        () => achievements.find(a => a.id === modalId) || null,
        [achievements, modalId]
    );

    // Notifica logros recién desbloqueados (compara contra lo ya visto en localStorage).
    const notified = useRef(false);
    useEffect(() => {
        if (notified.current || !stats) return;
        notified.current = true;

        let seen = [];
        try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { seen = []; }
        const seenSet = new Set(seen);
        const newly = unlocked.filter(a => !seenSet.has(a.id));

        // En la primera carga solo sembramos lo visto (sin spamear). Después, avisamos lo nuevo.
        if (seen.length > 0 && newly.length > 0) {
            newly.slice(0, 3).forEach(a => toast?.success?.(`Logro desbloqueado: ${a.emoji} ${a.title}`));
        }
        if (newly.length > 0 || seen.length === 0) {
            localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked.map(a => a.id)));
        }
    }, [unlocked, stats, toast]);

    if (!achievements.length) return null;

    return (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-2">
                    <Award size={18} className="text-yellow-500" />
                    Logros
                </span>
                <span className="text-xs text-[var(--text-secondary)] font-medium tabular-nums">
                    {unlocked.length}/{achievements.length} desbloqueados
                </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
                Medallas que ganas al entrenar. Toca una para ver cómo conseguirla.
            </p>

            {/* Detalle (logro seleccionado o, por defecto, el próximo a conseguir) */}
            {detail && (
                <div className="mb-4 p-3 rounded-xl bg-[var(--bg-dark)] border border-[var(--border)] flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${detail.unlocked ? 'bg-yellow-500/15' : 'bg-[var(--bg-card)]'}`}>
                        {detail.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm truncate">{detail.title}</span>
                            {detail.unlocked ? (
                                <span className="text-[10px] font-bold text-green-400 flex items-center gap-0.5 shrink-0">
                                    <Check size={11} /> Conseguido
                                </span>
                            ) : (
                                <span className="text-[10px] text-[var(--text-secondary)] tabular-nums shrink-0">
                                    {detail.current}/{detail.target}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] truncate">{detail.desc}</p>
                        {!detail.unlocked && (
                            <div className="h-1.5 w-full bg-[var(--bg-card)] rounded-full overflow-hidden mt-1.5">
                                <div
                                    className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-700"
                                    style={{ width: `${detail.pct}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Medallas: emoji + nombre + estado (siempre visible, no depende de hover) */}
            <div className="grid grid-cols-3 gap-2">
                {achievements.map(a => {
                    const isSel = detail && detail.id === a.id;
                    return (
                        <button
                            key={a.id}
                            onClick={() => setModalId(a.id)}
                            className={`relative flex flex-col items-center gap-1 rounded-xl p-2.5 border transition-all active:scale-95 ${a.unlocked
                                ? 'bg-yellow-500/10 border-yellow-500/30'
                                : 'bg-[var(--bg-dark)] border-[var(--border)]'
                                } ${isSel ? 'ring-2 ring-[var(--primary)]' : ''}`}
                        >
                            <span className={`text-2xl leading-none ${a.unlocked ? '' : 'grayscale opacity-40'}`}>
                                {a.emoji}
                            </span>
                            <span className={`text-[10px] font-medium text-center leading-tight ${a.unlocked ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                                {a.title}
                            </span>
                            {a.unlocked ? (
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green-500 text-black flex items-center justify-center">
                                    <Check size={10} strokeWidth={3} />
                                </span>
                            ) : (
                                <span className="text-[9px] text-[var(--text-secondary)] tabular-nums flex items-center gap-0.5">
                                    <Lock size={8} /> {a.current}/{a.target}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Modal de detalle: se abre al tocar una medalla */}
            {modalAchievement && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end animate-fade-in"
                    onClick={() => setModalId(null)}
                >
                    <div
                        className="bg-[var(--bg-card)] w-full max-h-[80vh] rounded-t-3xl overflow-hidden flex flex-col shadow-2xl animate-slide-up"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${modalAchievement.unlocked ? 'bg-yellow-500/15' : 'bg-[var(--bg-dark)]'}`}>
                                    <span className={modalAchievement.unlocked ? '' : 'grayscale opacity-40'}>{modalAchievement.emoji}</span>
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-lg text-[var(--text-primary)] truncate">{modalAchievement.title}</h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Logro</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setModalId(null)}
                                className="p-2 bg-[var(--bg-dark)] rounded-full hover:bg-[var(--border)] transition-colors active:scale-90 shrink-0"
                            >
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto overscroll-contain">
                            <p className="text-sm text-[var(--text-secondary)] mb-4">{modalAchievement.desc}</p>

                            {modalAchievement.unlocked ? (
                                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                                    <span className="w-8 h-8 rounded-full bg-green-500 text-black flex items-center justify-center shrink-0">
                                        <Check size={16} strokeWidth={3} />
                                    </span>
                                    <div>
                                        <p className="font-bold text-green-400 text-sm">Conseguido</p>
                                        <p className="text-xs text-[var(--text-secondary)]">
                                            {modalAchievement.current}/{modalAchievement.target} — objetivo cumplido
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-[var(--bg-dark)]/50 rounded-xl p-3 border border-[var(--border)]">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                            <Lock size={11} /> Progreso
                                        </span>
                                        <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                                            {modalAchievement.current}/{modalAchievement.target}
                                        </span>
                                    </div>
                                    <div className="h-2 w-full bg-[var(--bg-card)] rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-700"
                                            style={{ width: `${modalAchievement.pct}%` }}
                                        />
                                    </div>
                                    <p className="text-[11px] text-[var(--text-secondary)] mt-2">
                                        Te faltan {Math.max(0, modalAchievement.target - modalAchievement.current)} para conseguirlo.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
