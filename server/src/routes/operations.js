import { applyOperation, getOperation, getOperationSession, getOperationCapabilities } from '../services/workoutOperations.js';
import { OperationError } from '../services/operationContract.js';
import { WorkoutRequestError } from '../services/workoutTransaction.js';
import { isDependencyUnavailable } from '../operations/errors.js';

export function mountOperationRoutes(app, { prisma, authMiddleware,
    offlineSyncEnabled = process.env.NEXLIFT_OFFLINE_SYNC_ENABLED === 'true' && process.env.NODE_ENV !== 'production',
    resolutionEnabled = process.env.NEXLIFT_CONFLICT_RESOLUTION_ENABLED === 'true' && process.env.NODE_ENV !== 'production' }) {
    resolutionEnabled = resolutionEnabled && offlineSyncEnabled && process.env.NODE_ENV !== 'production';
    const endpoint = action => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const response = await action(req); res.status(response.status).json(response.body);
        } catch (error) {
            const dependency = isDependencyUnavailable(error);
            const known = error instanceof OperationError || error instanceof WorkoutRequestError;
            const status = dependency ? 503 : known ? error.status : 500;
            if (status === 503) res.set('Retry-After', '1');
            res.status(status).json({ error: known ? error.message : status === 503 ? 'Database temporarily unavailable' : 'Operation failed',
                code: known && error.code ? error.code : status === 503 ? 'DATABASE_UNAVAILABLE' : status === 404 ? 'RESOURCE_NOT_FOUND' : 'OPERATION_FAILED',
                retryable: dependency || error.retryable === true,
                outcome: dependency ? 'unknown' : error.outcome || 'not_committed' });
        }
    };
    app.get('/api/v1/workout-capabilities', authMiddleware, endpoint(async req => ({ status: 200,
        body: await getOperationCapabilities(prisma, req.userId, offlineSyncEnabled, resolutionEnabled) })));
    app.post('/api/v1/workout-operations', authMiddleware, endpoint(req => applyOperation(prisma, req.userId, req.body, { resolutionEnabled })));
    app.get('/api/v1/workout-operations/:operationId', authMiddleware, endpoint(async req => ({ status: 200, body: await getOperation(prisma, req.userId, req.params.operationId) })));
    app.get('/api/v1/workout-sessions/:logId', authMiddleware, endpoint(async req => ({ status: 200, body: await getOperationSession(prisma, req.userId, req.params.logId) })));
}
