import { canonicalInstant, fail, finite, isOperationId, isRecord } from '../validation/primitives.js';
import type { SetValues } from './workoutSessions.js';
import { ContractValidationError } from '../validation/results.js';

export const setFields = ['weight', 'reps', 'rpe', 'completed', 'weightRight', 'repsRight'] as const;
export interface Resolution { conflictId: string; originalOperationId: string; decision: 'local' | 'manual' }
export interface SetChange { id: string; fields: Partial<SetValues> }
export interface SessionChanges {
    session?: { notes?: string | null; date?: string };
    updates?: SetChange[]; additions?: SetChange[]; removals?: string[]; order?: string[];
}
export function parseResolution(value: unknown): Resolution {
    return patch(() => resolution(value));
}
function patch<T>(action: () => T): T {
    try { return action(); }
    catch (error) {
        if (error instanceof ContractValidationError) throw new ContractValidationError('INVALID_SESSION_PATCH', error.issues[0].path, error.message);
        throw error;
    }
}
function resolution(value: unknown): Resolution {
    const data = exactPatch(value, ['conflictId', 'originalOperationId', 'decision']);
    if (!isOperationId(data.conflictId) || data.conflictId !== data.conflictId.toLowerCase()
        || data.conflictId !== data.originalOperationId || data.decision !== 'local' && data.decision !== 'manual') fail('resolution', 'Invalid conflict reference', 'INVALID_SESSION_PATCH');
    return { conflictId: data.conflictId, originalOperationId: data.originalOperationId, decision: data.decision };
}
function exactPatch(value: unknown, allowed: readonly string[]): Record<string, unknown> {
    if (!isRecord(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('patch', 'Invalid patch fields', 'INVALID_SESSION_PATCH');
    return value;
}
function stableId(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) fail('id', 'Stable set ID required', 'INVALID_SESSION_PATCH');
    return value;
}
function patchFields(value: unknown): Partial<SetValues> {
    const data = exactPatch(value, setFields), result: Partial<SetValues> = {};
    if (!Object.keys(data).length) fail('fields', 'Empty set patch', 'INVALID_SESSION_PATCH');
    if ('completed' in data) {
        if (typeof data.completed !== 'boolean') fail('completed', 'Invalid completed', 'INVALID_SESSION_PATCH');
        result.completed = data.completed;
    }
    for (const key of ['weight', 'reps', 'rpe', 'weightRight', 'repsRight'] as const) {
        if (!Object.hasOwn(data, key)) continue;
        if (data[key] === null && (key === 'rpe' || key === 'weightRight' || key === 'repsRight')) result[key] = null;
        else result[key] = finite(data[key], key, key === 'rpe' ? 10 : key.includes('reps') ? 1000 : 2000, !key.startsWith('weight'));
    }
    return result;
}
export function parseChanges(value: unknown): SessionChanges {
    return patch(() => changes(value));
}
function changes(value: unknown): SessionChanges {
    const data = exactPatch(value, ['session', 'updates', 'additions', 'removals', 'order']);
    const result: SessionChanges = {};
    if (data.session !== undefined) {
        const session = exactPatch(data.session, ['notes', 'date']);
        result.session = {};
        if (Object.hasOwn(session, 'notes')) {
            if (session.notes !== null && (typeof session.notes !== 'string' || session.notes.length > 2000)) fail('notes', 'Invalid notes', 'INVALID_SESSION_PATCH');
            result.session.notes = session.notes;
        }
        if (Object.hasOwn(session, 'date')) result.session.date = canonicalInstant(session.date, 'date');
        if (!Object.keys(result.session).length) fail('session', 'Empty session patch', 'INVALID_SESSION_PATCH');
    }
    for (const name of ['updates', 'additions', 'removals', 'order'] as const) {
        if (data[name] === undefined) continue;
        const values = data[name];
        if (!Array.isArray(values) || !values.length || values.length > 50) fail(name, `Invalid ${name}`, 'INVALID_SESSION_PATCH');
        if (name === 'removals' || name === 'order') result[name] = values.map(stableId);
        else result[name] = values.map(value => {
            const item = exactPatch(value, ['id', 'fields']);
            const id = stableId(item.id), fields = patchFields(item.fields);
            if (name === 'additions' && setFields.some(k => !Object.hasOwn(fields, k))) fail('fields', 'New sets require complete values', 'INVALID_SESSION_PATCH');
            return { id, fields };
        });
        const ids = (result[name] ?? []).map(item => typeof item === 'string' ? item : item.id);
        if (new Set(ids).size !== ids.length) fail(name, `Duplicate ${name}`, 'INVALID_SESSION_PATCH');
    }
    const targets = [...(result.updates ?? []), ...(result.additions ?? []), ...(result.removals ?? [])].map(item => typeof item === 'string' ? item : item.id);
    if (new Set(targets).size !== targets.length || !Object.keys(result).length) fail('changes', 'Overlapping or empty patch', 'INVALID_SESSION_PATCH');
    return result;
}
