import { trainingLoadVolume } from '../../generated/training.cjs';
import { mexicoCityDayBounds } from '../../logic.js';
import { getActiveBlock } from '../../logic.js';
import { detectPlateauForExercise } from '../../logic.js';

export function createTrainingService({ prisma , console }) {
const ADAPTIVE_DELOAD_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const ADAPTIVE_DELOAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const ADAPTIVE_DELOAD_VOLUME_DROP_RATIO = 0.85;

const ADAPTIVE_DELOAD_MIN_PLATEAUS = 3;

async function maybeEvaluateAdaptiveDeload(routine, userId) {
    const now = new Date();

    // Cooldown: ya evaluado hace poco, o ya está dentro de una ventana activa.
    if (routine.lastAdaptiveCheckAt && (now - routine.lastAdaptiveCheckAt) < ADAPTIVE_DELOAD_COOLDOWN_MS) return;
    if (routine.adaptiveDeloadUntil && routine.adaptiveDeloadUntil > now) return;
    // Si la rutina ya tiene su propio bloque de descarga activo, el mecanismo
    // standalone no aplica (evita que ambas fuentes "compitan").
    const activeBlock = getActiveBlock(routine.blocks || []);
    if (activeBlock?.phase === 'deload') return;

    const todayBounds = mexicoCityDayBounds(now);
    const weekAgo = new Date(todayBounds.start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(todayBounds.start.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [currentWeekSets, previousWeekSets] = await Promise.all([
        prisma.setLog.findMany({
            where: { workoutLog: { date: { gte: weekAgo }, exercise: { routineDay: { routine: { userId } } } } }
        }),
        prisma.setLog.findMany({
            where: { workoutLog: { date: { gte: twoWeeksAgo, lt: weekAgo }, exercise: { routineDay: { routine: { userId } } } } }
        })
    ]);
    const currentWeekVolume = trainingLoadVolume(currentWeekSets, 'left-only');
    const previousWeekVolume = trainingLoadVolume(previousWeekSets, 'left-only');
    // Sin semana previa real (p.ej. cuenta nueva, o volvió de vacaciones), no hay
    // "declive" que juzgar — evita leer ausencia de datos como señal de descarga.
    const volumeDeclined = previousWeekVolume > 0 && currentWeekVolume < previousWeekVolume * ADAPTIVE_DELOAD_VOLUME_DROP_RATIO;

    // El conteo de plateau es la señal más cara (N queries, una por ejercicio) — solo
    // se calcula si la señal de volumen ya se cumplió, para no gastarla en vano.
    let plateauedCount = 0;
    if (volumeDeclined) {
        const exerciseIds = (routine.days || []).flatMap(d => (d.exercises || []).map(e => e.id));
        for (const exerciseId of exerciseIds) {
            const logs = await prisma.workoutLog.findMany({
                where: { exerciseId },
                include: { sets: true },
                orderBy: { date: 'asc' }
            });
            if (detectPlateauForExercise(logs)) plateauedCount++;
        }
    }

    const data = { lastAdaptiveCheckAt: now };
    if (volumeDeclined && plateauedCount >= ADAPTIVE_DELOAD_MIN_PLATEAUS) {
        data.adaptiveDeloadUntil = new Date(now.getTime() + ADAPTIVE_DELOAD_WINDOW_MS);
    }
    await prisma.routine.update({ where: { id: routine.id }, data });
}

async function checkAdaptiveDeloadForAllUsers() {
    try {
        const routines = await prisma.routine.findMany({
            where: { isActive: true, userId: { not: null }, name: { not: 'ARCHIVED_HISTORY_DO_NOT_DELETE' } },
            include: {
                blocks: true,
                days: { include: { exercises: { select: { id: true } } } }
            }
        });
        for (const routine of routines) {
            await maybeEvaluateAdaptiveDeload(routine, routine.userId);
        }
    } catch (err) {
        console.error('Error checking adaptive deload:', err.message);
    }
}

return { ADAPTIVE_DELOAD_COOLDOWN_MS, ADAPTIVE_DELOAD_WINDOW_MS, ADAPTIVE_DELOAD_VOLUME_DROP_RATIO, ADAPTIVE_DELOAD_MIN_PLATEAUS, maybeEvaluateAdaptiveDeload, checkAdaptiveDeloadForAllUsers };
}
