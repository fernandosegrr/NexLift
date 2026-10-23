import { createHash } from 'node:crypto';
import { sanitizeSets, mexicoCityDateStr } from '../logic.js';
import { parseChanges, parseResolution } from './sessionPatch.js';

export class OperationError extends Error {
    constructor(status, code, message, { retryable = false, outcome = 'not_committed' } = {}) {
        super(message); Object.assign(this, { status, code, retryable, outcome });
    }
}
const invalid = message => { throw new OperationError(422, 'INVALID_OPERATION', message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, label) {
    if (!object(value)) invalid(`${label} must be an object`);
    if (Object.keys(value).some(k => value[k] !== undefined && !allowed.includes(k))) invalid(`Unknown ${label} field`);
}
export function operationId(value) {
    if (typeof value !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) invalid('operationId must be a UUID');
    return value.toLowerCase();
}
function identifier(value, label) {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) invalid(`${label} is required`);
    return value;
}
function instant(value) {
    // Explicit offset required. Check calendar components BEFORE Date can roll
    // an impossible February date into March. PostgreSQL stores millisecond data.
    const m = typeof value === 'string' && value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?(Z|[+-]\d\d:\d\d)$/);
    if (!m) invalid('performedAt must be an ISO instant with an explicit offset and at most millisecond precision');
    const [, y, mo, d, h, min, sec, , zone] = m;
    const check = new Date(0); check.setUTCFullYear(Number(y), Number(mo) - 1, Number(d)); check.setUTCHours(0, 0, 0, 0);
    if (Number(y) < 1 || check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)
        || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
        || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) invalid('Invalid performedAt calendar instant');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || !/^\d{4}-/.test(date.toISOString())) invalid('Invalid performedAt');
    return date.toISOString();
}
function text(value, fallback, label) {
    if (value === undefined) return fallback;
    if (value === null && fallback === null) return null;
    if (typeof value !== 'string' || value.length > 2000) invalid(`${label} must be a string of at most 2000 characters`);
    return value;
}
function sets(raw) {
    if (!Array.isArray(raw)) invalid('sets must be an array');
    const normalized = raw.map(s => {
        keys(s, ['weight', 'reps', 'rpe', 'rir', 'weightRight', 'repsRight', 'completed'], 'set');
        for (const name of ['weight', 'reps', 'weightRight', 'repsRight', 'rpe', 'rir']) {
            if (s[name] === undefined || (s[name] === null && !['weight', 'reps', 'rir'].includes(name))) continue;
            if (typeof s[name] !== 'number' || !Number.isFinite(s[name]) || (name !== 'weight' && name !== 'weightRight' && !Number.isInteger(s[name]))) invalid(`Invalid ${name}`);
        }
        if (s.completed !== undefined && typeof s.completed !== 'boolean') invalid('completed must be boolean');
        if (s.rir !== undefined && (s.rir < 0 || s.rir > 4)) invalid('rir must be an integer from 0 to 4');
        if (s.rir !== undefined && s.rpe !== undefined && s.rpe !== 10 - s.rir) invalid('rir and rpe conflict');
        return { ...s, rpe: s.rir === undefined ? s.rpe : 10 - s.rir };
    });
    const parsed = sanitizeSets(normalized);
    if (parsed.error) invalid(parsed.error);
    return parsed.sets;
}
export function parseOperation(input) {
    if (!object(input)) invalid('Operation must be an object');
    const common = ['operationId', 'kind', 'source', 'performedAt'];
    const fields = {
        'workout.create': ['exerciseId', 'sets', 'notes'],
        'workout.appendSet': ['logId', 'expectedVersion', 'sets'],
        'workout.replaceSets': ['logId', 'expectedVersion', 'sets', 'changes', 'resolution'],
        'workout.delete': ['logId', 'expectedVersion', 'resolution'],
        'rest.create': ['note']
    };
    if (typeof input.kind !== 'string' || !Object.hasOwn(fields, input.kind)) invalid('Unsupported operation kind');
    keys(input, [...common, ...fields[input.kind]], 'operation');
    const id = operationId(input.operationId), performedAt = instant(input.performedAt);
    if (!['pwa', 'shortcut'].includes(input.source)) invalid('source must be pwa or shortcut');
    const clean = { operationId: id, kind: input.kind, source: input.source, performedAt, performedDay: mexicoCityDateStr(new Date(performedAt)) };
    if (input.kind === 'rest.create') clean.note = text(input.note, 'Día de descanso', 'note');
    else {
        if (input.kind === 'workout.create') {
            clean.exerciseId = identifier(input.exerciseId, 'exerciseId'); clean.notes = text(input.notes, null, 'notes');
        } else {
            clean.logId = identifier(input.logId, 'logId');
            if (typeof input.expectedVersion !== 'string' || !/^[a-f\d]{64}$/.test(input.expectedVersion)) invalid('expectedVersion must be the current sessionVersion');
            clean.expectedVersion = input.expectedVersion;
        }
        if (input.kind === 'workout.delete' && input.resolution !== undefined) clean.resolution = parseResolution(input.resolution);
        if (input.kind === 'workout.replaceSets' && input.changes !== undefined) {
            if (input.sets !== undefined) invalid('Use changes or sets, never both');
            clean.changes = parseChanges(input.changes);
            if (input.resolution !== undefined) clean.resolution = parseResolution(input.resolution);
        } else if (input.kind !== 'workout.delete') {
            if (input.resolution !== undefined) invalid('Resolution requires a partial patch');
            clean.sets = sets(input.sets);
            if (input.kind === 'workout.appendSet' && clean.sets.length !== 1) invalid('appendSet requires exactly one set');
            if (input.kind === 'workout.create' && !clean.sets.some(s => s.weight > 0 && s.reps > 0)) invalid('At least one set with work is required');
        }
    }
    if (clean.resolution?.originalOperationId === clean.operationId) invalid('A resolution requires a new operationId');
    return clean;
}
const canonical = value => JSON.stringify(value, (key, val) => val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]])) : val);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const requestHash = operation => hash({ protocolVersion: 1, ...operation });
export function sessionVersion(log) {
    return hash({ id: log.id, exerciseId: log.exerciseId, date: new Date(log.date).toISOString(), notes: log.notes ?? null,
        sets: [...log.sets].sort((a, b) => a.setNumber - b.setNumber || a.id.localeCompare(b.id)) });
}
