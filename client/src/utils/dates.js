// Día calendario en América/Ciudad de México — misma convención que
// server/src/logic.js (mexicoCityDateStr). El teléfono del usuario suele estar
// en CDMX, pero no lo asumimos: si el device está en otra zona (viaje, reloj
// mal), "¿hay log de hoy?" se desalinea del server y aparecen sesiones fantasma
// o se pierde el resume del Atajo.
export function mexicoCityDateStr(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(d);
}

// 0=domingo … 6=sábado del día calendario CDMX (ancla a mediodía UTC, igual
// que dayOfWeekFromDateStr en el server — sin ambigüedad de zona).
export function mexicoCityDayOfWeek(date = new Date()) {
    const dateStr = mexicoCityDateStr(date);
    return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function mexicoCityTodayName(date = new Date()) {
    return DAY_NAMES_ES[mexicoCityDayOfWeek(date)];
}

// Últimos `n` días calendario CDMX inclusive (hoy = último), como YYYY-MM-DD.
export function mexicoCityLastNDays(n = 30, date = new Date()) {
    const days = [];
    const base = date instanceof Date ? date : new Date(date);
    for (let i = n - 1; i >= 0; i--) {
        days.push(mexicoCityDateStr(new Date(base.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    return days;
}
