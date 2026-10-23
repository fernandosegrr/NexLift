import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseConfig } from './release-config.js';
import { artifactManifest } from './release-artifacts.mjs';
import { assertReleaseSchema } from './release-preflight.mjs';
import { operationalLog } from '../src/operations/telemetry.js';
import { logStartupFailure } from './release-diagnostics.mjs';

export async function startRelease({ env = process.env, providers, signals, exit } = {}) {
    const config = releaseConfig(env);
    await artifactManifest();
    const { PrismaClient } = await import('../src/services/historyPersistence.js');
    const { createRuntime } = await import('../src/app/runtime.js');
    const { installProcessShutdown } = await import('../src/infrastructure/jobs/lifecycle.js');
    const prisma = new PrismaClient({ datasources: { db: { url: config.url } } });
    let runtime, app, server, shutdown;
    try {
        await prisma.$connect();
        if (config.rehearsal) {
            const [identity] = await prisma.$queryRaw`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`;
            if (identity.marker !== env.NEXLIFT_DISPOSABLE_MARKER) throw new Error('Disposable identity rejected');
        }
        await assertReleaseSchema(prisma);
        if (config.rehearsal && !providers) {
            const unavailable = async () => { throw new Error('External provider disabled'); };
            const { deterministicFallback } = await import('../src/modules/exercises/deduplicate.js');
            providers = { cloudinaryConfigured: false, vapidConfigured: false, fetch: unavailable,
                cloudinary: { uploader: { upload: unavailable } }, backupStore: { uploadBackup: unavailable, pruneOldBackups: unavailable },
                deduplicateExercises: async (incoming, existing) => deterministicFallback(incoming, existing) };
        }
        providers ??= await (await import('../src/infrastructure/external/providers.js')).createProviders(env);
        runtime = createRuntime({ prisma, config, providers });
        const schemaCheck = () => assertReleaseSchema(prisma);
        if (config.transport === 'express') {
            const { createExpressApp } = await import('../src/app/createExpressApp.js');
            app = createExpressApp({ runtime, schemaCheck });
            // One runtime, one HTTP listener, one set of background jobs.
            await runtime.startBackground();
            server = await new Promise((resolve, reject) => {
                const listener = app.listen(config.port, config.host, () => resolve(listener)); listener.once('error', reject);
            });
            server.requestTimeout = 30000; server.headersTimeout = 30000; server.keepAliveTimeout = 5000;
        } else {
            const { createApp } = await import('../build/app/createApp.js');
            app = await createApp({ runtime, schemaCheck });
            await runtime.startBackground();
            await app.listen({ port: config.port, host: config.host }); server = app.server;
        }
        const closeHttp = config.transport === 'fastify' ? () => app.close()
            : () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        shutdown = installProcessShutdown({ closeHttp, forceClose: () => server.closeAllConnections(), runtime,
            ...(signals ? { signals } : {}), ...(exit ? { exit } : {}) });
        operationalLog({ event: 'server_started', category: 'lifecycle' });
        return { server, runtime, shutdown };
    } catch (error) {
        if (app?.close) await app.close();
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        await runtime?.stopBackground(); await prisma.$disconnect(); throw error;
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    startRelease().catch(error => { logStartupFailure(error); process.exitCode = 1; });
}
