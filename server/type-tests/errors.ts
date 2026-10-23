import { isDependencyUnavailable } from '../src/operations/errors.js';
import { isString } from '@nexlift/shared';
const failed: unknown = { cause: { code: 'P1001' } };
const unavailable: boolean = isDependencyUnavailable(failed);
void unavailable;
// @ts-expect-error Classification returns a boolean, never an error string.
const wrong: string = isDependencyUnavailable(failed);
void wrong;
// @ts-expect-error Unknown exceptions must be narrowed before property access.
failed.code;
// @ts-expect-error No implicit browser globals in server modules.
window.localStorage;
const payload: unknown = null;
// @ts-expect-error A type predicate must be applied before string operations.
payload.trim();
if (isString(payload)) payload.trim();
