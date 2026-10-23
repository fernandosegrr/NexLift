import { trustedProxy } from '../src/app/security.js';

// No dotenv, fallback URL, deployment side effects or secrets in errors.
export function releaseConfig(env) {
    const fail = key => { throw new Error(`Release configuration rejected: ${key}`); };
    if (env.NODE_ENV !== 'production') fail('NODE_ENV');
    if (!['express', 'fastify'].includes(env.NEXLIFT_HTTP_TRANSPORT)) fail('NEXLIFT_HTTP_TRANSPORT');
    if (env.NEXLIFT_HTTP_TRANSPORT === 'fastify' && env.NEXLIFT_FASTIFY_ACTIVATION !== 'reviewed-v4') fail('NEXLIFT_FASTIFY_ACTIVATION');
    if (!['rehearsal', 'release'].includes(env.NEXLIFT_RELEASE_MODE)) fail('NEXLIFT_RELEASE_MODE');
    if (typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.trim().length < 32 || /change-in-production|synthetic/i.test(env.JWT_SECRET)) fail('JWT_SECRET');
    let target;
    try { target = new URL(env.NEXLIFT_RELEASE_DATABASE_URL); } catch { fail('NEXLIFT_RELEASE_DATABASE_URL'); }
    if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.username || !target.hostname || target.pathname.length < 2 || target.hash) fail('NEXLIFT_RELEASE_DATABASE_URL');
    // Runtime is single replica until shared rate limiting/topology is approved.
    if (env.NEXLIFT_REPLICAS !== '1') fail('NEXLIFT_REPLICAS');
    for (const key of ['NEXLIFT_OFFLINE_SYNC_ENABLED', 'NEXLIFT_CONFLICT_RESOLUTION_ENABLED', 'NEXLIFT_WEB_SESSION_REHEARSAL', 'NEXLIFT_BACKUP_PRUNE_ENABLED']) {
        if (env[key] !== undefined && env[key] !== 'false') fail(key);
    }
    if (env.NEXLIFT_COACH_ENABLED !== undefined && !['true', 'false'].includes(env.NEXLIFT_COACH_ENABLED)) fail('NEXLIFT_COACH_ENABLED');
    const port = env.PORT === undefined ? 3001 : Number(env.PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('PORT');
    const host = env.NEXLIFT_BIND_HOST || '0.0.0.0';
    if (!['0.0.0.0', '127.0.0.1', '::', '::1'].includes(host)) fail('NEXLIFT_BIND_HOST');
    try { trustedProxy(env.NEXLIFT_TRUSTED_PROXY_CIDRS); } catch { fail('NEXLIFT_TRUSTED_PROXY_CIDRS'); }
    for (const origin of (env.CORS_ORIGIN || '').split(',').filter(Boolean)) {
        try { const u = new URL(origin); if (u.origin !== origin || u.protocol !== 'https:') fail('CORS_ORIGIN'); } catch { fail('CORS_ORIGIN'); }
    }
    if (env.NEXLIFT_RELEASE_MODE === 'rehearsal') {
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !/^\/nexlift_ops_test_phase6_[a-f0-9_]+$/.test(target.pathname)
            || !/^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$/.test(env.NEXLIFT_DISPOSABLE_MARKER || '')) fail('disposable identity');
    }
    target.searchParams.set('connect_timeout', '3'); target.searchParams.set('pool_timeout', '3');
    return { url: target.href, port, host, transport: env.NEXLIFT_HTTP_TRANSPORT, rehearsal: env.NEXLIFT_RELEASE_MODE === 'rehearsal',
        jwtSecret: env.JWT_SECRET, nodeEnv: 'production', coachEnabled: env.NEXLIFT_COACH_ENABLED !== 'false', corsOrigin: env.CORS_ORIGIN, trustedProxyCidrs: env.NEXLIFT_TRUSTED_PROXY_CIDRS,
        vapidPublicKey: env.NEXLIFT_RELEASE_MODE === 'release' ? env.VAPID_PUBLIC_KEY : undefined };
}
