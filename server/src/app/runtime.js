import { createPhotoService } from '../infrastructure/external/photos.js';
import { createCloudBackupStore } from '../services/backupService.js';
import { createAiService } from '../modules/ai/service.js';
import { createNotificationService } from '../modules/notifications/service.js';
import { createBackupService } from '../modules/backups/service.js';
import { createTrainingService } from '../modules/training/service.js';
import { createWorkoutService } from '../modules/workouts/service.js';
import { operationalLog } from '../operations/telemetry.js';
import { createWebSessions } from '../modules/auth/webSessions.js';
const backgroundOwners = new WeakMap();

// No environment files, new Prisma clients, provider configuration, jobs, signal
// handlers or SQL at import/build time. One explicit runtime per running server.
export function createRuntime({ prisma, config, providers }) {
    if (!prisma || !config?.jwtSecret || !providers) throw new Error('Explicit runtime dependencies required');
    config = { ...config, offlineSyncEnabled: config.nodeEnv !== 'production' && config.offlineSyncEnabled === true,
        resolutionEnabled: config.nodeEnv !== 'production' && config.offlineSyncEnabled === true && config.resolutionEnabled === true };
    const logger = { error: () => operationalLog({ event: 'service_failed', category: 'dependency_or_internal' }),
        log: () => operationalLog({ event: 'service_event', category: 'lifecycle' }) };
    const common = { prisma, JWT_SECRET: config.jwtSecret, HISTORY_SESSIONS_WINDOW: 10,
        CLOUDINARY_CONFIGURED: !!providers.cloudinaryConfigured, VAPID_CONFIGURED: !!providers.vapidConfigured,
        console: logger, config };
    const photos = createPhotoService({ ...common, cloudinary: providers.cloudinary, fetch: providers.fetch });
    const notifications = createNotificationService({ ...common, webpush: providers.webpush });
    const store = providers.backupStore ?? createCloudBackupStore(providers.cloudinary, providers.fetch);
    const backups = createBackupService({ ...common, ...store });
    const ai = createAiService({ ...common, chooseExercisesForDay: providers.chooseExercisesForDay });
    const training = createTrainingService(common);
    const webSessions = createWebSessions(config);
    let started = false, stopped = false, closing = false, startPromise;
    const owner = {};
    const intervals = [], active = new Set();
    const every = (fn, milliseconds) => {
        let running = false;
        const timer = setInterval(() => {
            if (running || stopped || closing) return;
            running = true;
            const work = Promise.resolve().then(fn).catch(() => logger.error()).finally(() => { running = false; active.delete(work); });
            active.add(work);
        }, milliseconds);
        timer.unref?.(); intervals.push(timer);
    };
    return {
        services: { ...common, webSessions, ...photos, ...notifications, ...backups, ...ai, ...training, ...createWorkoutService({ ...common, ...notifications }),
            deduplicateExercises: providers.deduplicateExercises },
        prisma, config,
        isClosing: () => closing,
        markClosing: () => { closing = true; notifications.pauseDelivery(); },
        startBackground() {
            if (stopped) return Promise.reject(new Error('Runtime already stopped'));
            if (started) return startPromise;
            if (backgroundOwners.has(prisma)) return Promise.reject(new Error('Background jobs already owned for this Prisma client'));
            backgroundOwners.set(prisma, owner);
            started = true;
            startPromise = (async () => {
                await notifications.restorePendingReminders();
                if (stopped) return;
                every(notifications.checkReengagementReminders, 30 * 60 * 1000);
                every(notifications.checkCreatineReminders, 15 * 60 * 1000);
                every(training.checkAdaptiveDeloadForAllUsers, 24 * 60 * 60 * 1000);
                every(backups.maybeRunDailyBackup, 30 * 60 * 1000);
            })();
            return startPromise;
        },
        async stopBackground() {
            closing = true; stopped = true;
            webSessions.clear();
            intervals.forEach(clearInterval); await notifications.stop();
            await startPromise?.catch(() => {});
            await Promise.allSettled([...active]);
            await notifications.stop();
            if (backgroundOwners.get(prisma) === owner) backgroundOwners.delete(prisma);
        }
    };
}
