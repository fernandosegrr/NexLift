import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from './services/historyPersistence.js';
import { createRuntime } from './app/runtime.js';
import { createExpressApp } from './app/createExpressApp.js';
import { createProviders } from './infrastructure/external/providers.js';
import { installProcessShutdown } from './infrastructure/jobs/lifecycle.js';
import { operationalLog } from './operations/telemetry.js';

// Existing operational entrypoint remains Express; Fastify is opt-in rehearsal.
// Importing an application factory never starts processes or reads environment.
let startup;
export function startServer({ schemaCheck, host } = {}) {
    if (startup) return startup;
    startup = (async () => {
        if (process.env.NEXLIFT_INFRA_REHEARSAL !== 'true') dotenv.config();
        if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET required in production');
        const prisma = new PrismaClient();
        const config = { jwtSecret: process.env.JWT_SECRET || 'nexlift-secret-key-change-in-production',
            nodeEnv: process.env.NODE_ENV || 'development', corsOrigin: process.env.CORS_ORIGIN,
            trustedProxyCidrs: process.env.NEXLIFT_TRUSTED_PROXY_CIDRS,
            webSessionEnabled: process.env.NEXLIFT_INFRA_REHEARSAL === 'true' && process.env.NEXLIFT_WEB_SESSION_REHEARSAL === 'true',
            webOrigin: process.env.NEXLIFT_WEB_ORIGIN,
            vapidPublicKey: process.env.VAPID_PUBLIC_KEY, backupPruneEnabled: process.env.NEXLIFT_BACKUP_PRUNE_ENABLED === 'true',
            offlineSyncEnabled: process.env.NEXLIFT_OFFLINE_SYNC_ENABLED === 'true' && process.env.NODE_ENV !== 'production',
            resolutionEnabled: process.env.NEXLIFT_CONFLICT_RESOLUTION_ENABLED === 'true' && process.env.NODE_ENV !== 'production' };
        const runtime = createRuntime({ prisma, config, providers: await createProviders(process.env) });
        let server;
        try {
            await prisma.$connect();
            if (schemaCheck) await schemaCheck(prisma);
            const app = createExpressApp({ runtime, schemaCheck: schemaCheck ? () => schemaCheck(prisma) : undefined });
            await runtime.startBackground();
            server = await new Promise((resolve, reject) => {
                const listener = app.listen(Number(process.env.PORT || 3001), host, () => resolve(listener));
                listener.once('error', reject);
            });
            server.requestTimeout = 30000; server.headersTimeout = 30000; server.keepAliveTimeout = 5000;
            installProcessShutdown({ closeHttp: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())),
                forceClose: () => server.closeAllConnections(), runtime });
            operationalLog({ event: 'server_started', category: 'lifecycle' });
            return server;
        } catch (error) {
            if (server) await new Promise(resolve => server.close(resolve));
            await runtime.stopBackground(); await prisma.$disconnect();
            operationalLog({ event: 'startup_failed', category: 'configuration_or_dependency' });
            throw error;
        }
    })();
    return startup;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer().catch(() => { process.exitCode = 1; });
