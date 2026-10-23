import { fail, isOperationId, isRecord, isSessionVersion } from '../validation/primitives.js';
import { operationKinds } from './workoutOperations.js';
import type { OperationKind, OperationSource } from './workoutOperations.js';
import { isSessionSetView } from './workoutSessions.js';
import type { SessionSetView } from './workoutSessions.js';

export interface ConfirmedOperation {
    operationId: string; kind: OperationKind; source: OperationSource; state: 'confirmed'; performedAt: string; performedDay: string;
}
export interface ReceiptWorkoutLog { id: string; sets: SessionSetView[]; exerciseId?: string; date?: string; notes?: string | null }
export type OperationReceipt = { protocolVersion: 1; ownerId: string; requestHash: string; replayed: boolean } & (
    { operation: ConfirmedOperation & { kind: 'rest.create' }; result: { restLog: { id: string; userId: string; date: string; note: string } } }
    | { operation: ConfirmedOperation & { kind: 'workout.delete' }; result: { deleted: true; logId: string } }
    | { operation: ConfirmedOperation & { kind: 'workout.create' | 'workout.appendSet' | 'workout.replaceSets' }; result: { workoutLog: ReceiptWorkoutLog; sessionVersion: string } });
export interface OperationCapability { protocolVersion: 1; receiptFormat: 'sha256-v1'; userId: string; ready: true; enabled: true; kinds: string[] }

function iso(value: unknown): value is string {
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function isOperationReceipt(value: unknown): value is OperationReceipt {
    if (!isRecord(value) || value.protocolVersion !== 1 || typeof value.ownerId !== 'string' || !value.ownerId
        || !isSessionVersion(value.requestHash) || typeof value.replayed !== 'boolean') return false;
    const op = value.operation, result = value.result;
    if (!isRecord(op) || !isRecord(result) || !isOperationId(op.operationId) || op.operationId !== op.operationId.toLowerCase()
        || !operationKinds.some(kind => kind === op.kind) || op.source !== 'pwa' && op.source !== 'shortcut'
        || op.state !== 'confirmed' || !iso(op.performedAt) || typeof op.performedDay !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(op.performedDay)) return false;
    if (op.kind === 'workout.delete') return result.deleted === true && typeof result.logId === 'string' && !!result.logId;
    if (op.kind === 'rest.create') {
        const rest = result.restLog;
        return isRecord(rest) && typeof rest.id === 'string' && !!rest.id && typeof rest.userId === 'string' && !!rest.userId
            && typeof rest.note === 'string' && iso(rest.date);
    }
    const log = result.workoutLog;
    // Historic append/replace test callers need only id + sets. Complete
    // session reads have a distinct stronger contract (readSessionResponse).
    return isSessionVersion(result.sessionVersion) && isRecord(log) && typeof log.id === 'string' && !!log.id
        && Array.isArray(log.sets) && log.sets.every(isSessionSetView)
        && (log.exerciseId === undefined || typeof log.exerciseId === 'string')
        && (log.date === undefined || iso(log.date)) && (log.notes === undefined || log.notes === null || typeof log.notes === 'string');
}
export function readOperationReceipt(value: unknown): OperationReceipt {
    if (!isOperationReceipt(value)) fail('receipt', 'Incompatible operation receipt; retain the local operation', 'INCOMPATIBLE_OPERATION');
    return value;
}
export function isOperationCapability(value: unknown): value is OperationCapability {
    if (!isRecord(value) || !Array.isArray(value.kinds)) return false;
    const kinds = value.kinds;
    return isRecord(value) && value.protocolVersion === 1 && value.receiptFormat === 'sha256-v1' && typeof value.userId === 'string'
        && value.ready === true && value.enabled === true && kinds.every(kind => typeof kind === 'string')
        && operationKinds.every(kind => kinds.includes(kind));
}
