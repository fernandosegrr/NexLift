import { mountOperationRoutes } from '../../routes/operations.js';

export function registerRoutes(app, { prisma, authMiddleware, config }) {
mountOperationRoutes(app, { prisma, authMiddleware, offlineSyncEnabled: config.offlineSyncEnabled, resolutionEnabled: config.resolutionEnabled });

}
