import { isString } from '@nexlift/shared';

const unavailable: ReadonlySet<unknown> = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037',
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
    'EAI_AGAIN', 'ENOTFOUND', '57P01', '57P02', '57P03', '53300', '53400', '57014']);

// Preserve JavaScript property lookup, including inherited driver properties and
// primitive boxing. Unknown exceptions are not asserted to be Error instances.
function property(value: unknown, key: string): unknown {
    if (value === null || value === undefined) return undefined;
    return Reflect.get(Object(value), key, value);
}

export function isDependencyUnavailable(error: unknown): boolean {
    for (let current = error, depth = 0; current && depth < 4; current = property(current, 'cause'), depth++) {
        if (unavailable.has(property(current, 'code')) || unavailable.has(property(current, 'errorCode'))) return true;
        if (isString(property(current, 'code')) && /^08[A-Z0-9]{3}$/.test(`${property(current, 'code')}`)) return true;
        if (property(current, 'code') === 'P2010' && (unavailable.has(property(property(current, 'meta'), 'code')) ||
            /^08[A-Z0-9]{3}$/.test(`${property(property(current, 'meta'), 'code') || ''}`))) return true;
    }
    return false;
}
