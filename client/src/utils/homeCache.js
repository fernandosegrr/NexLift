// Cache de sesión del Dashboard: pinta al instante con datos de la última visita
// y revalida en red (stale-while-revalidate). TTL corto en memoria de pestaña.
const KEY = 'nexlift_home_v2';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 min: aún útil al volver a la app

export function readHomeCache() {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.data || !parsed?.ts) return null;
        if (Date.now() - parsed.ts > MAX_AGE_MS) return null;
        return parsed.data;
    } catch {
        return null;
    }
}

export function writeHomeCache(data) {
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
        // quota / private mode — ignore
    }
}

export function clearHomeCache() {
    try { sessionStorage.removeItem(KEY); } catch { /* */ }
}
