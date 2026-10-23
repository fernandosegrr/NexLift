export function rehearsalConfig(env = process.env, { http = true } = {}) {
    if (env.NEXLIFT_INFRA_REHEARSAL !== 'true') throw new Error('Rehearsal opt-in required');
    if (!env.NEXLIFT_RELEASE_DATABASE_URL) throw new Error('Explicit rehearsal target required');
    let url;
    try { url = new URL(env.NEXLIFT_RELEASE_DATABASE_URL); } catch { throw new Error('Invalid rehearsal configuration'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2 || url.hash) {
        throw new Error('Invalid rehearsal configuration');
    }
    // Bound connection/pool waits. Never fall back to DATABASE_URL or .env.
    url.searchParams.set('connect_timeout', '3'); url.searchParams.set('pool_timeout', '3');
    const port = env.PORT === undefined ? 3001 : Number(env.PORT);
    if (http && (env.NODE_ENV !== 'production' || typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.trim().length < 32
        || env.JWT_SECRET === 'nexlift-secret-key-change-in-production' || !Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new Error('Invalid rehearsal HTTP configuration');
    }
    return { url: url.href, port, host: env.NEXLIFT_BIND_HOST || '0.0.0.0' };
}
