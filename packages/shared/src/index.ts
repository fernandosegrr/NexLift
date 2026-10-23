// A runtime predicate, not validation of an API/database payload.
export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

export type StringGuard = typeof isString;

export const workspaceProbe = 'nexlift-shared-resolution-ok';

export * from './validation/results.js';
export { isOperationId, isSessionVersion, operationId } from './validation/primitives.js';
export * from './contracts/workoutOperations.js';
export * from './contracts/workoutSessions.js';
export * from './contracts/conflicts.js';
export * from './contracts/receipts.js';
export * from './contracts/apiErrors.js';
export * from './contracts/routines.js';
export { cappedEpley1RM } from './domain/training/performance.js';

export * from './domain/training/effort.js';
export * from './domain/training/personalRecords.js';

export * from './domain/training/smartLoading.js';

export * from './domain/training/calendar.js';
export * from './domain/training/volume.js';
export * from './domain/training/mesocycles.js';
export * from './domain/training/exerciseIdentity.js';
export * from './domain/training/progress.js';
export * from './domain/coach/types.js';
export * from './domain/coach/engine.js';
