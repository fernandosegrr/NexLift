import { createOperationStore } from './operationStore.js';
import { createOperationTransport } from './operationTransport.js';
import { createOperationSync } from './operationSync.js';
import { getQueue } from './offlineQueue.js';
import { getStorageRuntime, indexedStorageEnabled, conflictResolutionEnabled } from '../storage/runtime.js';
import { createConflictResolution } from './conflictResolution.js';

export const operationsEnabled = import.meta.env.VITE_WORKOUT_OPERATIONS_ENABLED === 'true';
let runtime;
export function getOperationRuntime(apiUrl) {
    runtime ??= createOperationSync({ enabled: operationsEnabled,
        store: indexedStorageEnabled ? getStorageRuntime().store
            : createOperationStore({ storage: globalThis.localStorage, locks: globalThis.navigator?.locks, events: globalThis.window }),
        transport: createOperationTransport({ apiUrl }),
        legacyBarrier: item => getQueue().some(old => !old.legacy && old.ownerId === item.ownerId && (
            (item.payload.exerciseId && old.payload?.exerciseId === item.payload.exerciseId)
            || (item.payload.logId && old.payload?.logId === item.payload.logId)
            || (item.payload.kind === 'rest.create' && old.op === 'logRestDay' && old.originalDay === item.originalDay))) });
    if (conflictResolutionEnabled && !runtime.conflicts) runtime.conflicts = createConflictResolution({ storage: getStorageRuntime(), sync: runtime });
    return runtime;
}
