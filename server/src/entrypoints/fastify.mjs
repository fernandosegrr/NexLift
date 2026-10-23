import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../../build/app/createApp.js';
import { createRuntime } from '../app/runtime.js';
import { PrismaClient } from '../services/historyPersistence.js';
import { installProcessShutdown } from '../infrastructure/jobs/lifecycle.js';
import { operationalLog } from '../operations/telemetry.js';
import { deterministicFallback } from '../modules/exercises/deduplicate.js';
import { assertSchemaReady } from '../../deploy/releaseGate.js';

// Development/disposable rehearsal entrypoint. Never reads .env or permits a
// production URL. The existing Express production command is unchanged.
export async function startFastify({ env = process.env, providers, schemaCheck = assertSchemaReady } = {}) {
    if (env.NEXLIFT_FASTIFY_REHEARSAL !== 'true' || env.NODE_ENV === 'production' || !env.JWT_SECRET)
        throw new Error('Fastify requires explicit non-production rehearsal configuration');
    const target = new URL(env.DATABASE_URL);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !/^\/nexlift_ops_test_/.test(target.pathname)
        || !/^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$/.test(env.NEXLIFT_DISPOSABLE_MARKER || '')) throw new Error('Disposable local PostgreSQL required');
    const prisma = new PrismaClient({ datasources: { db: { url: target.href } } });
    // The process is deliberately incapable of calling real providers in this phase.
    const unavailable = async () => { throw new Error('External providers disabled in rehearsal'); };
    const runtime = createRuntime({ prisma, config: { jwtSecret: env.JWT_SECRET, nodeEnv: env.NODE_ENV || 'test', corsOrigin: env.CORS_ORIGIN,
        trustedProxyCidrs: env.NEXLIFT_TRUSTED_PROXY_CIDRS,
        coachEnabled: env.NEXLIFT_COACH_ENABLED === 'true',
        webSessionEnabled: env.NEXLIFT_WEB_SESSION_REHEARSAL === 'true', webOrigin: env.NEXLIFT_WEB_ORIGIN,
        offlineSyncEnabled: env.NEXLIFT_OFFLINE_SYNC_ENABLED === 'true', resolutionEnabled: env.NEXLIFT_CONFLICT_RESOLUTION_ENABLED === 'true' },
        providers: providers ?? { cloudinaryConfigured: false, vapidConfigured: false, fetch: unavailable, cloudinary: { uploader: { upload: unavailable } },
            backupStore: { uploadBackup: unavailable, pruneOldBackups: unavailable },
            deduplicateExercises: async (incoming, existing) => deterministicFallback(incoming, existing) } });
    let app;
    try {
        const [identity] = await prisma.$queryRaw`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`;
        if (identity.marker !== env.NEXLIFT_DISPOSABLE_MARKER) throw new Error('Disposable identity mismatch');
        if (schemaCheck) await schemaCheck(prisma);
        app = await createApp({ runtime, schemaCheck: schemaCheck ? () => schemaCheck(prisma) : undefined });
        await runtime.startBackground();
        await app.listen({ port: Number(env.PORT || 3001), host: env.HOST || '127.0.0.1' });
        installProcessShutdown({ closeHttp: () => app.close(), forceClose: () => app.server.closeAllConnections(), runtime });
        operationalLog({ event: 'server_started', category: 'lifecycle' });
        return app;
    } catch (error) { await app?.close(); await runtime.stopBackground(); await prisma.$disconnect(); throw error; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startFastify().catch(() => {
    operationalLog({ event: 'startup_failed', category: 'configuration_or_dependency' }); process.exitCode = 1;
});
