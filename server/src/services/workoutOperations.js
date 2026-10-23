import { OperationError, parseOperation, requestHash, operationId, sessionVersion } from './operationContract.js';
import { withWorkoutTransaction, lockOwnedExercise, lockOwnedWorkout, WorkoutRequestError } from './workoutTransaction.js';
import { recalcPRForExercise } from './personalRecords.js';
import { applySessionPatch } from './sessionPatch.js';
import { operationKinds } from '../generated/contracts.cjs';

const include = { sets: { orderBy: [{ setNumber: 'asc' }, { id: 'asc' }] }, exercise: true };
const data = (set, index) => ({ ...set, setNumber: index + 1 });
const unavailable = () => new OperationError(503, 'OPERATIONS_NOT_READY', 'Operation storage is unavailable; retry with the same operationId.', { retryable: true, outcome: 'unknown' });
export async function assertOperationStorage(prisma) {
    const [row] = await prisma.$queryRaw`SELECT to_regclass('nexlift_operations."IdempotencyRecord"') IS NOT NULL AS present`;
    if (!row.present) throw unavailable();
}
async function readReceipt(tx, userId, id) {
    return (await tx.$queryRaw`SELECT "requestHash", response FROM nexlift_operations."IdempotencyRecord"
        WHERE "userId"=${userId} AND "operationId"=${id}::uuid`)[0];
}
// Read-only negotiation. Inspect the real SQL journal and HTTP role, rather
// than trusting a feature flag or the presence of a Prisma model (SQL-managed).
export async function getOperationCapabilities(prisma, userId, enabled, resolutionEnabled = false) {
    await assertOperationStorage(prisma);
    await prisma.$queryRaw`SELECT "userId", "operationId", "requestHash", response
        FROM nexlift_operations."IdempotencyRecord" WHERE false`;
    const [rights] = await prisma.$queryRaw`SELECT
        has_table_privilege(current_user, 'nexlift_operations."IdempotencyRecord"', 'SELECT') AS readable,
        has_table_privilege(current_user, 'nexlift_operations."IdempotencyRecord"', 'INSERT') AS writable`;
    if (!rights.readable || !rights.writable) throw unavailable();
    return { protocolVersion: 1, receiptFormat: 'sha256-v1', userId, ready: true, enabled,
        kinds: operationKinds,
        ...(enabled && resolutionEnabled ? { resolutions: { version: 1, partialSets: true, stableSetIds: true, deleteResolution: true } } : {}) };
}
const wireReceipt = (response, userId, fingerprint, replayed) => ({ ...response, ownerId: userId, requestHash: fingerprint, replayed });
export async function getOperation(prisma, userId, id) {
    id = operationId(id); await assertOperationStorage(prisma);
    const record = await readReceipt(prisma, userId, id);
    if (!record) throw new OperationError(404, 'OPERATION_NOT_FOUND', 'Operation not found');
    return wireReceipt(record.response, userId, record.requestHash, true);
}
export async function getOperationSession(prisma, userId, logId) {
    return withWorkoutTransaction(prisma, userId, async tx => {
        const log = await lockOwnedWorkout(tx, logId, userId);
        const workoutLog = await tx.workoutLog.findUnique({ where: { id: log.id }, include });
        return { workoutLog, sessionVersion: sessionVersion(workoutLog) };
    });
}
export async function applyOperation(prisma, userId, input, { resolutionEnabled = false } = {}) {
    const operation = parseOperation(input), fingerprint = requestHash(operation);
    if ((operation.changes || operation.resolution) && !resolutionEnabled) throw new OperationError(503, 'RESOLUTIONS_NOT_READY', 'Partial resolution is not enabled.', { retryable: true });
    await assertOperationStorage(prisma);
    try {
        return await withWorkoutTransaction(prisma, userId, async tx => {
            const previous = await readReceipt(tx, userId, operation.operationId);
            if (previous) {
                if (previous.requestHash !== fingerprint) throw new OperationError(409, 'OPERATION_CONTENT_CONFLICT', 'operationId was already used with different content.');
                return { status: 200, body: wireReceipt(previous.response, userId, fingerprint, true) };
            }
            let result, resourceId, status = 201;
            if (operation.kind === 'rest.create') {
                const restLog = await tx.restLog.create({ data: { userId, note: operation.note, date: new Date(operation.performedAt) } });
                resourceId = restLog.id; result = { restLog };
            } else {
                let exercise, log;
                if (operation.kind === 'workout.create') {
                    exercise = await lockOwnedExercise(tx, operation.exerciseId, userId);
                    log = await tx.workoutLog.create({ data: { exerciseId: exercise.id, date: new Date(operation.performedAt),
                        notes: operation.notes, sets: { create: operation.sets.map(data) } }, include });
                } else {
                    const owned = await lockOwnedWorkout(tx, operation.logId, userId); exercise = owned.exercise;
                    log = await tx.workoutLog.findUnique({ where: { id: owned.id }, include });
                    if (sessionVersion(log) !== operation.expectedVersion) throw new OperationError(409, 'SESSION_VERSION_CONFLICT', 'Session changed. Review its current version before creating another operation.');
                    if (operation.kind === 'workout.delete') {
                        await tx.workoutLog.delete({ where: { id: log.id } });
                        result = { deleted: true, logId: log.id }; status = 200;
                    } else {
                        if (operation.changes) {
                            await applySessionPatch(tx, log, operation.changes); status = 200;
                        } else if (operation.kind === 'workout.replaceSets') {
                            await tx.setLog.deleteMany({ where: { workoutLogId: log.id } }); status = 200;
                            await tx.setLog.createMany({ data: operation.sets.map((s, i) => ({ ...data(s, i), workoutLogId: log.id })) });
                        } else {
                            const next = Math.max(0, ...log.sets.map(s => s.setNumber));
                            await tx.setLog.create({ data: { ...data(operation.sets[0], next), workoutLogId: log.id } });
                        }
                        log = await tx.workoutLog.findUnique({ where: { id: log.id }, include });
                    }
                }
                resourceId = log.id;
                await recalcPRForExercise(tx, exercise.name, userId);
                result ??= { workoutLog: log, sessionVersion: sessionVersion(log) };
            }
            // Freeze JSON (including dates) before saving. Both the initial HTTP
            // response and later retries use this exact committed result snapshot.
            const response = JSON.parse(JSON.stringify({ protocolVersion: 1, operation: {
                operationId: operation.operationId, kind: operation.kind, source: operation.source, state: 'confirmed',
                performedAt: operation.performedAt, performedDay: operation.performedDay
            }, result, ...(operation.resolution ? { resolution: operation.resolution } : {}) }));
            await tx.$executeRaw`INSERT INTO nexlift_operations."IdempotencyRecord"
                ("userId","operationId",kind,"requestHash","performedAt","performedDay","resourceId","responseStatus",response)
                VALUES (${userId},${operation.operationId}::uuid,${operation.kind},${fingerprint},${new Date(operation.performedAt)},
                    ${operation.performedDay}::date,${resourceId},${status},${JSON.stringify(response)}::jsonb)`;
            return { status, body: wireReceipt(response, userId, fingerprint, false) };
        }, { maxAttempts: 12, retryReceiptConflict: true });
    } catch (error) {
        // An unconfirmed COMMIT is safe to reconcile by the SAME operation ID;
        // no new ID or blind legacy replay is suggested.
        if (error instanceof WorkoutRequestError && ['WORKOUT_OUTCOME_UNKNOWN', 'WORKOUT_CONFLICT'].includes(error.code)) {
            throw new OperationError(503, 'OPERATION_RETRY_REQUIRED', 'Retry or query with the same operationId.', { retryable: true, outcome: error.outcome });
        }
        throw error;
    }
}
