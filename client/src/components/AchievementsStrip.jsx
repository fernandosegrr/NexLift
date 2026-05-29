import { useMemo, useEffect, useRef, useState } from 'react';
import { Award, Check, Lock } from 'lucide-react';
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

    // Logro mostrado en el detalle: el que toque el usuario, o por defecto el próximo a conseguir.
    const [selectedId, setSelectedId] = useState(null);
    const detail = useMemo(
        () => achievements.find(a => a.id === selectedId) || next || unlocked[unlocked.length - 1] || null,
        [achievements, selectedId, next, unlocked]
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
                            onClick={() => setSelectedId(a.id)}
                            className={`relative flex flex-col items-center gap-1 rounded-xl p-2.5 border transition-all ${a.unlocked
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
        </div>
    );
}
