import type { OperationRequest, OperationReceipt, SetValues } from '../../packages/shared/src/index.js';
import { readOperationReceipt } from '../../packages/shared/src/index.js';

// @ts-expect-error operation identity is a string
const wrongId: OperationRequest = { kind: 'rest.create', operationId: 3, source: 'pwa', performedAt: 'x' };
// @ts-expect-error source has only the existing variants
const wrongSource: OperationRequest = { kind: 'rest.create', operationId: 'x', source: 'mobile', performedAt: 'x' };
// @ts-expect-error sets and changes are mutually exclusive
const both: OperationRequest = { kind: 'workout.replaceSets', operationId: 'x', source: 'pwa', performedAt: 'x', logId: 'x', expectedVersion: 'x', sets: [], changes: {} };
const unknownResponse: unknown = {};
// @ts-expect-error HTTP JSON needs runtime checking
const unchecked: OperationReceipt = unknownResponse;
// @ts-expect-error weight remains numeric
const set: SetValues = { weight: '0', reps: 0, rpe: null, completed: false, weightRight: null, repsRight: null };
const checked: OperationReceipt = readOperationReceipt(unknownResponse);
void [wrongId, wrongSource, both, unchecked, set, checked];
