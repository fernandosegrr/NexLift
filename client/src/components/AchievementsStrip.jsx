import { useMemo, useEffect, useRef } from 'react';
import { Award } from 'lucide-react';
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
            <div className="flex items-center justify-between mb-3">
                <span className="font-semibold flex items-center gap-2">
                    <Award size={18} className="text-yellow-500" />
                    Logros
                </span>
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                    {unlocked.length}/{achievements.length}
                </span>
            </div>

            {/* Medallas */}
            <div className="grid grid-cols-5 gap-2">
                {achievements.map(a => (
                    <div
                        key={a.id}
                        title={`${a.title} — ${a.desc}${a.unlocked ? '' : ` (${a.current}/${a.target})`}`}
                        className={`aspect-square rounded-xl flex items-center justify-center text-xl transition-all ${a.unlocked
                            ? 'bg-yellow-500/15 border border-yellow-500/30 shadow-sm'
                            : 'bg-[var(--bg-dark)] border border-[var(--border)] grayscale opacity-40'
                            }`}
                    >
                        {a.emoji}
                    </div>
                ))}
            </div>

            {/* Próximo logro */}
            {next && (
                <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-[var(--text-secondary)]">
                            Próximo: <span className="text-[var(--text-primary)] font-medium">{next.emoji} {next.title}</span>
                        </span>
                        <span className="text-[var(--text-secondary)] tabular-nums">{next.current}/{next.target}</span>
                    </div>
                    <div className="h-2 w-full bg-[var(--bg-dark)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-700"
                            style={{ width: `${next.pct}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
