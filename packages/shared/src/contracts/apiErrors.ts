import { isRecord } from '../validation/primitives.js';

export type ApiFailure = 'authentication' | 'forbidden' | 'conflict' | 'validation' | 'recoverable' | 'incompatible';
export interface ApiErrorBody { error?: string; code?: string; retryable?: boolean; outcome?: 'unknown' | 'not_committed' }
/** Classification uses HTTP status, never trusts an unvalidated server message. */
export function classifyApiFailure(status: unknown, body: unknown = null): ApiFailure {
    if (status === 401) return 'authentication';
    if (status === 403) return 'forbidden';
    if (status === 409) return 'conflict';
    if (status === 400 || status === 404 || status === 422) return 'validation';
    if (status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return 'recoverable';
    if (isRecord(body) && body.code === 'INCOMPATIBLE_OPERATION') return 'incompatible';
    return 'incompatible';
}
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
    return isRecord(value) && (value.error === undefined || typeof value.error === 'string')
        && (value.code === undefined || typeof value.code === 'string') && (value.retryable === undefined || typeof value.retryable === 'boolean')
        && (value.outcome === undefined || value.outcome === 'unknown' || value.outcome === 'not_committed');
}
