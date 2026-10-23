// Classify by stable driver codes, never by matching error messages (which can
// contain credentials). A programming/query error must not become an auth 401.
const unavailable = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037',
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
    'EAI_AGAIN', 'ENOTFOUND', '57P01', '57P02', '57P03', '53300', '53400', '57014']);
export function isDependencyUnavailable(error) {
    for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth++) {
        if (unavailable.has(current.code) || unavailable.has(current.errorCode)) return true;
        if (typeof current.code === 'string' && /^08[A-Z0-9]{3}$/.test(current.code)) return true;
        // Raw-query PostgreSQL codes are nested under Prisma's P2010 metadata.
        if (current.code === 'P2010' && (unavailable.has(current.meta?.code) || /^08[A-Z0-9]{3}$/.test(current.meta?.code || ''))) return true;
    }
    return false;
}
