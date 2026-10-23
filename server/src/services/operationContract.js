// Compatibility entry; implementation is strict TypeScript.
import compiled from '../generated/operationContract.cjs';
export const { OperationError, adaptContract, operationId, parseOperation } = compiled;
export { requestHash, sessionVersion } from './operationHash.js';
