import type { CanonicalOperation } from '@nexlift/shared';
import { sanitizeSets, mexicoCityDateStr } from '../logic.js';
import { ContractValidationError, operationId as sharedOperationId, parseWorkoutOperation } from '@nexlift/shared';

export class OperationError extends Error {
    declare status: number;
    declare code: string;
    declare retryable: boolean;
    declare outcome: 'not_committed' | 'unknown';
    constructor(status: number, code: string, message: string, { retryable = false, outcome = 'not_committed' }: { retryable?: boolean; outcome?: 'not_committed' | 'unknown' } = {}) {
        super(message); Object.assign(this, { status, code, retryable, outcome });
    }
}

export function adaptContract<T>(action: () => T): T {
    try { return action(); }
    catch (error) {
        if (error instanceof ContractValidationError) throw new OperationError(422, error.code, error.message);
        throw error;
    }
}
export const operationId = (value: unknown): string => adaptContract(() => sharedOperationId(value));
export const parseOperation = (input: unknown): CanonicalOperation => adaptContract(() => parseWorkoutOperation(input, { sanitizeSets, mexicoCityDateStr }));
export { requestHash, sessionVersion } from './operationHash.js';
