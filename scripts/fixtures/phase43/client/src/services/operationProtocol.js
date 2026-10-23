import { mexicoCityDateStr } from '../utils/dates.js';

export const operationKinds = ['workout.create', 'workout.appendSet', 'workout.replaceSets', 'workout.delete', 'rest.create'];
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const digest = /^[a-f\d]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => { throw Object.assign(new Error(message), { code: 'INCOMPATIBLE_OPERATION' }); };
export const canonicalJSON = value => JSON.stringify(value, (key, val) => object(val)
    ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]])) : val);
export async function sha256(value) {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function keys(value, allowed) {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid('Hay propiedades no admitidas. Conserva el formulario para revisión.');
}
// No JSON stringify coercion of NaN/Infinity or accidental credential fields.
// This validates the wire format; PostgreSQL remains authoritative.
export function normalizePayload(input) {
    const fields = {
        'workout.create': ['exerciseId', 'sets', 'notes'], 'rest.create': ['note'],
        'workout.appendSet': ['logId', 'expectedVersion', 'sets'],
        'workout.replaceSets': ['logId', 'expectedVersion', 'sets', 'changes', 'resolution'], 'workout.delete': ['logId', 'expectedVersion', 'resolution']
    };
    if (!object(input) || !operationKinds.includes(input.kind)) invalid('Tipo de operación no admitido.');
    keys(input, ['operationId', 'kind', 'source', 'performedAt', ...fields[input.kind]]);
    if (!uuid.test(input.operationId) || input.source !== 'pwa') invalid('Identidad de operación inválida.');
    const time = new Date(input.performedAt);
    if (!Number.isFinite(time.getTime()) || time.toISOString() !== input.performedAt) invalid('Fecha original inválida.');
    const out = { operationId: input.operationId, kind: input.kind, source: 'pwa', performedAt: input.performedAt };
    const text = (value, fallback) => {
        if (value === undefined) return fallback;
        if (value === null && fallback === null) return null;
        if (typeof value !== 'string' || value.length > 2000) invalid('Notas inválidas.');
        return value;
    };
    if (input.kind === 'rest.create') out.note = text(input.note, 'Día de descanso');
    else {
        const id = input.kind === 'workout.create' ? 'exerciseId' : 'logId';
        if (typeof input[id] !== 'string' || !input[id].trim() || input[id] !== input[id].trim()) invalid('Recurso inválido.');
        out[id] = input[id];
        if (id === 'exerciseId') out.notes = text(input.notes, null);
        else {
            if (!digest.test(input.expectedVersion)) invalid('Falta la versión revisada de la sesión. Se conserva el borrador; vuelve a revisarlo con conexión.');
            out.expectedVersion = input.expectedVersion;
        }
        if (input.kind === 'workout.delete' && input.resolution !== undefined) {
            keys(input.resolution, ['conflictId', 'originalOperationId', 'decision']);
            if (!uuid.test(input.resolution.conflictId) || input.resolution.conflictId !== input.resolution.originalOperationId || !['local', 'manual'].includes(input.resolution.decision)) invalid('Referencia de conflicto inválida.');
            out.resolution = { ...input.resolution };
        }
        if (input.kind === 'workout.replaceSets' && input.changes !== undefined) {
            if (input.sets !== undefined) invalid('Usa cambios parciales o series completas, nunca ambos.');
            out.changes = normalizeChanges(input.changes);
            if (input.resolution !== undefined) {
                keys(input.resolution, ['conflictId', 'originalOperationId', 'decision']);
                if (!uuid.test(input.resolution.conflictId) || input.resolution.originalOperationId !== input.resolution.conflictId
                    || !['local', 'manual'].includes(input.resolution.decision)) invalid('Referencia de conflicto inválida.');
                out.resolution = { ...input.resolution };
            }
        } else if (input.kind !== 'workout.delete') {
            if (input.resolution !== undefined) invalid('La resolución requiere cambios parciales.');
            if (!Array.isArray(input.sets) || input.sets.length < 1 || input.sets.length > 50) invalid('Series inválidas.');
            out.sets = input.sets.map(set => {
                keys(set, ['weight', 'reps', 'rpe', 'rir', 'completed', 'weightRight', 'repsRight']);
                const number = (value, max, integer = false) => {
                    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) invalid('Peso, repeticiones o esfuerzo inválidos.');
                    return value;
                };
                const rpe = set.rir === undefined ? set.rpe : 10 - number(set.rir, 4, true);
                if (set.rir !== undefined && set.rpe !== undefined && set.rpe !== rpe) invalid('RIR y RPE incompatibles.');
                if (set.completed !== undefined && typeof set.completed !== 'boolean') invalid('Estado de serie inválido.');
                return { weight: number(set.weight, 2000), reps: number(set.reps, 1000, true),
                    rpe: rpe == null ? null : number(rpe, 10, true), completed: set.completed ?? true,
                    weightRight: set.weightRight == null ? null : number(set.weightRight, 2000),
                    repsRight: set.repsRight == null ? null : number(set.repsRight, 1000, true) };
            });
            if (input.kind === 'workout.appendSet' && out.sets.length !== 1) invalid('Un anexo requiere exactamente una serie.');
            if (input.kind === 'workout.create' && !out.sets.some(s => s.weight > 0 && s.reps > 0)) invalid('Registra al menos una serie con trabajo.');
        }
    }
    if (out.resolution?.originalOperationId === out.operationId) invalid('Cada decisión de resolución requiere un identificador nuevo.');
    return out;
}
export function normalizeChanges(input) {
    keys(input, ['session', 'updates', 'additions', 'removals', 'order']);
    const out = {}, fields = ['weight', 'reps', 'rpe', 'completed', 'weightRight', 'repsRight'];
    if (input.session !== undefined) {
        keys(input.session, ['notes', 'date']); out.session = { ...input.session };
        if (!Object.keys(out.session).length || (Object.hasOwn(out.session, 'notes') && out.session.notes !== null && (typeof out.session.notes !== 'string' || out.session.notes.length > 2000))) invalid('Notas inválidas.');
        if (Object.hasOwn(out.session, 'date') && (typeof out.session.date !== 'string' || !Number.isFinite(Date.parse(out.session.date)) || new Date(out.session.date).toISOString() !== out.session.date)) invalid('Fecha inválida.');
    }
    for (const name of ['updates', 'additions', 'removals', 'order']) {
        if (input[name] === undefined) continue;
        if (!Array.isArray(input[name]) || !input[name].length || input[name].length > 50) invalid('Cambios de series inválidos.');
        out[name] = input[name].map(value => {
            const id = typeof value === 'string' ? value : value?.id;
            if (typeof id !== 'string' || !id.trim() || id !== id.trim()) invalid('Identidad de serie inválida.');
            if (['removals', 'order'].includes(name)) { if (typeof value !== 'string') invalid('Identidad de serie inválida.'); return id; }
            keys(value, ['id', 'fields']); keys(value.fields, fields);
            if (!Object.keys(value.fields).length || (name === 'additions' && fields.some(k => !Object.hasOwn(value.fields, k)))) invalid('Campos de serie incompletos.');
            const set = normalizePayload({ operationId: '00000000-0000-4000-8000-000000000001', source: 'pwa', kind: 'workout.replaceSets',
                logId: 'validation', expectedVersion: '0'.repeat(64), performedAt: '2026-01-01T00:00:00.000Z', sets: [{ weight: 0, reps: 0, rpe: null, completed: true, weightRight: null, repsRight: null, ...value.fields }] }).sets[0];
            return { id, fields: Object.fromEntries(Object.keys(value.fields).map(k => [k, set[k]])) };
        });
        const ids = out[name].map(v => typeof v === 'string' ? v : v.id);
        if (new Set(ids).size !== ids.length) invalid('Identidades de series duplicadas.');
    }
    const ids = [...(out.updates || []), ...(out.additions || []), ...(out.removals || [])].map(v => typeof v === 'string' ? v : v.id);
    if (new Set(ids).size !== ids.length || !Object.keys(out).length) invalid('Cambios vacíos o incompatibles.');
    return out;
}
export const payloadHash = payload => sha256(canonicalJSON({ protocolVersion: 1, ...normalizePayload(payload),
    performedDay: mexicoCityDateStr(new Date(payload.performedAt)) }));

export function verifyCapability(body, ownerId) {
    if (body?.protocolVersion !== 1 || body.receiptFormat !== 'sha256-v1' || body.ready !== true
        || body.enabled !== true || body.userId !== ownerId || !Array.isArray(body.kinds)
        || !operationKinds.every(kind => body.kinds.includes(kind))) invalid('El servidor no tiene habilitado el protocolo compatible. Los datos permanecen en este dispositivo.');
    return body;
}
export function verifyReceipt(item, body, status) {
    const p = item.payload, op = body?.operation, result = body?.result;
    let valid = [200, 201].includes(status) && body?.protocolVersion === 1 && body.ownerId === item.ownerId
        && body.requestHash === item.requestHash && typeof body.replayed === 'boolean'
        && op?.operationId === item.id && op.kind === p.kind && op.source === p.source && op.state === 'confirmed'
        && op.performedAt === p.performedAt && op.performedDay === item.originalDay && object(result);
    if (valid && p.kind === 'workout.delete') valid = result.deleted === true && result.logId === p.logId;
    else if (valid && p.kind === 'rest.create') {
        const log = result.restLog;
        valid = typeof log?.id === 'string' && !!log.id && log.userId === item.ownerId && log.note === p.note && log.date === p.performedAt;
    } else if (valid) {
        const log = result.workoutLog;
        valid = typeof log?.id === 'string' && !!log.id && digest.test(result.sessionVersion) && Array.isArray(log?.sets);
        if (valid && p.kind === 'workout.create') valid = log.exerciseId === p.exerciseId && log.date === p.performedAt && (log.notes ?? null) === p.notes;
        else if (valid) valid = log.id === p.logId;
        if (valid) {
            const ordered = [...log.sets].sort((a, b) => a.setNumber - b.setNumber);
            const actual = p.kind === 'workout.appendSet' ? ordered.slice(-1) : ordered;
            const fields = ['weight', 'reps', 'rpe', 'completed', 'weightRight', 'repsRight'];
            if (p.changes) {
                const byId = new Map(ordered.map(s => [s.id, s]));
                valid = [...(p.changes.updates || []), ...(p.changes.additions || [])].every(s => Object.entries(s.fields).every(([k, v]) => byId.get(s.id)?.[k] === v))
                    && (p.changes.removals || []).every(id => !byId.has(id))
                    && (!p.changes.order || canonicalJSON(ordered.map(s => s.id)) === canonicalJSON(p.changes.order))
                    && Object.entries(p.changes.session || {}).every(([k, v]) => (log[k] ?? null) === v)
                    && (!p.resolution || canonicalJSON(body.resolution) === canonicalJSON(p.resolution));
            } else valid = actual.length === p.sets.length && p.sets.every((s, i) => fields.every(field => s[field] === actual[i]?.[field]));
        }
    }
    if (!valid) invalid('El acuse no corresponde a esta cuenta, operación o contenido. Se conservan los datos para revisión.');
    if (p.resolution && canonicalJSON(body.resolution) !== canonicalJSON(p.resolution)) invalid('El comprobante no corresponde a esta decisión.');
    return body;
}
