import { ContractValidationError } from './results.js';

export function fail(path: string, message: string, code = 'INVALID_OPERATION'): never {
    throw new ContractValidationError(code, path, message);
}
export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function record(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) fail(path, `${path} must be an object`);
    return value;
}
export function exact(value: unknown, allowed: readonly string[], path: string, allowUndefined = true): Record<string, unknown> {
    const data = record(value, path);
    if (Object.keys(data).some(key => (!allowUndefined || data[key] !== undefined) && !allowed.includes(key))) fail(path, `Unknown ${path} field`);
    return data;
}
export function identifier(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) fail(path, `${path} is required`);
    return value;
}
export function isOperationId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
}
export function operationId(value: unknown): string {
    if (!isOperationId(value)) fail('operationId', 'operationId must be a UUID');
    return value.toLowerCase();
}
export function isSessionVersion(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
}
export function finite(value: unknown, path: string, max: number, integer = false): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || integer && !Number.isInteger(value)) fail(path, `Invalid ${path}`);
    return value;
}
export function instant(value: unknown): string {
    const match = typeof value === 'string' && value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?(Z|[+-]\d\d:\d\d)$/);
    if (!match) fail('performedAt', 'performedAt must be an ISO instant with an explicit offset and at most millisecond precision');
    const [, y, mo, d, h, min, sec, , zone] = match;
    const check = new Date(0); check.setUTCFullYear(Number(y), Number(mo) - 1, Number(d)); check.setUTCHours(0, 0, 0, 0);
    if (Number(y) < 1 || check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)
        || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
        || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) fail('performedAt', 'Invalid performedAt calendar instant');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || !/^\d{4}-/.test(date.toISOString())) fail('performedAt', 'Invalid performedAt');
    return date.toISOString();
}
export function canonicalInstant(value: unknown, path: string): string {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(path, 'Invalid original date');
    return value;
}
export function text(value: unknown, fallback: string, label: string): string;
export function text(value: unknown, fallback: null, label: string): string | null;
export function text(value: unknown, fallback: string | null, label: string): string | null {
    if (value === undefined) return fallback;
    if (value === null && fallback === null) return null;
    if (typeof value !== 'string' || value.length > 2000) fail(label, `${label} must be a string of at most 2000 characters`);
    return value;
}
