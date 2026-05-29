// Logros derivados de las estadísticas reales del usuario (sin backend).
// Cada logro: { id, emoji, title, desc, current, target, unlocked, pct }

export function computeAchievements({ stats = {}, prs = [] } = {}) {
    const totalWorkouts = stats.totalWorkouts || 0;
    const streak = stats.currentStreak || 0;
    const daysLast30 = stats.trainingDaysLast30 || 0;
    const totalPRs = stats.totalPRs ?? prs.length ?? 0;
    const maxWeight = prs.reduce((m, p) => Math.max(m, Number(p.weight) || 0), 0);

    const defs = [
        { id: 'first-workout', emoji: '🏋️', title: 'Primer paso', desc: 'Tu primer entrenamiento', current: totalWorkouts, target: 1 },
        { id: 'workouts-10', emoji: '🔟', title: 'Calentando', desc: '10 sesiones', current: totalWorkouts, target: 10 },
        { id: 'workouts-50', emoji: '💪', title: 'Constante', desc: '50 sesiones', current: totalWorkouts, target: 50 },
        { id: 'workouts-100', emoji: '🏆', title: 'Centurión', desc: '100 sesiones', current: totalWorkouts, target: 100 },
        { id: 'streak-7', emoji: '🔥', title: 'En racha', desc: '7 días seguidos', current: streak, target: 7 },
        { id: 'streak-30', emoji: '⚡', title: 'Imparable', desc: '30 días seguidos', current: streak, target: 30 },
        { id: 'first-pr', emoji: '⭐', title: 'Récord roto', desc: 'Tu primer PR', current: totalPRs, target: 1 },
        { id: 'pr-10', emoji: '🎯', title: 'Rompedor', desc: '10 récords personales', current: totalPRs, target: 10 },
        { id: 'consistency-20', emoji: '📅', title: 'Disciplina', desc: '20 días activos en 30', current: daysLast30, target: 20 },
        { id: 'plates-100', emoji: '💯', title: 'Club de los 100', desc: 'Levanta 100 kg', current: Math.floor(maxWeight), target: 100 },
    ];

    return defs.map(d => ({
        ...d,
        unlocked: d.current >= d.target,
        pct: Math.min(100, Math.round((d.current / d.target) * 100)),
    }));
}
