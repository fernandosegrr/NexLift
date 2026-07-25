// Resolución de "qué día de rutina toca hoy" para rutinas MANUALES — copia
// deliberada de server/src/logic.js (el proyecto no comparte código
// cliente/servidor, ver "Backend único" en CLAUDE.md). Paridad cubierta por
// routineDays.parity.test.js.
//
// INVARIANTE: RoutineDay.dayName es decorativo. Todo esto lee EXCLUSIVAMENTE
// `weekday` (0=Domingo..6=Sábado) — nunca se vuelve a parsear dayName aquí.
// 0 (Domingo) es un valor válido: comparar siempre con `!= null`, nunca con
// truthiness (`d.weekday &&` descarta Domingo en silencio).
import { mexicoCityDayOfWeek } from './dates.js';

// Orden de UI en español (Lunes→Domingo); `value` es el weekday real (0=Dom).
export const WEEKDAY_OPTIONS = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' }
];

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function weekdayLabel(weekday) {
    return weekday == null ? null : (WEEKDAY_LABELS[weekday] ?? null);
}

// Día de rutina programado para `weekday`, o null si ninguno lo tiene
// asignado. Si dos días quedan con el mismo weekday, gana el de menor `order`.
export function findRoutineDayForWeekday(days, weekday) {
    if (!Array.isArray(days)) return null;
    let best = null;
    for (const d of days) {
        if (d.weekday == null || d.weekday !== weekday) continue;
        if (!best || d.order < best.order) best = d;
    }
    return best;
}

// Días de la semana que son descanso PROGRAMADO — para que la racha/heatmap
// (calculados en servidor) y cualquier vista cliente los traten igual. Solo
// cuenta isRestDay=true CON weekday asignado.
export function scheduledRestWeekdays(days) {
    const set = new Set();
    if (!Array.isArray(days)) return set;
    for (const d of days) {
        if (d.isRestDay && d.weekday != null) set.add(d.weekday);
    }
    return set;
}

// Día de rutina que corresponde a "hoy" (CDMX) para una rutina MANUAL. Las
// rutinas `source: 'ai'` no pasan por aquí — resuelven por su propio camino
// server-side (aiTodayDay en GET /api/stats/home).
export function resolveTodayRoutineDay(days, date = new Date()) {
    return findRoutineDayForWeekday(days, mexicoCityDayOfWeek(date));
}

// Weekdays asignados a más de un día de la rutina (estado inválido que el
// guardado debe bloquear). Los `null` nunca cuentan como duplicado.
export function duplicateWeekdays(days) {
    if (!Array.isArray(days)) return [];
    const seen = new Set();
    const dupes = new Set();
    for (const d of days) {
        if (d.weekday == null) continue;
        if (seen.has(d.weekday)) dupes.add(d.weekday);
        seen.add(d.weekday);
    }
    return [...dupes];
}

// Primer weekday libre en orden Lunes→Domingo, o null si los 7 ya están
// asignados. Usado por "Agregar día" para que un día nuevo nunca quede sin
// programar por defecto.
export function firstFreeWeekday(days) {
    const taken = new Set(
        (Array.isArray(days) ? days : []).map(d => d.weekday).filter(w => w != null)
    );
    for (const { value } of WEEKDAY_OPTIONS) {
        if (!taken.has(value)) return value;
    }
    return null;
}
