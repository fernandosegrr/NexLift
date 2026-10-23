// A compatible extension of workout.replaceSets. No replacement/deletion of
// unselected rows: all targets are stable SetLog IDs in the locked session.
import { OperationError } from './operationContract.js';
import { sanitizeSets } from '../logic.js';

const fail = message => { throw new OperationError(422, 'INVALID_SESSION_PATCH', message); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fields = ['weight', 'reps', 'rpe', 'completed', 'weightRight', 'repsRight'];
function exact(v, allowed) {
    if (!object(v) || Object.keys(v).some(k => !allowed.includes(k))) fail('Invalid patch fields');
}
const id = v => { if (typeof v !== 'string' || !v.trim() || v !== v.trim()) fail('Stable set ID required'); return v; };
export function parseChanges(raw) {
    exact(raw, ['session', 'updates', 'additions', 'removals', 'order']);
    const out = {};
    if (raw.session !== undefined) {
        exact(raw.session, ['notes', 'date']); out.session = {};
        if (Object.hasOwn(raw.session, 'notes')) {
            if (raw.session.notes !== null && (typeof raw.session.notes !== 'string' || raw.session.notes.length > 2000)) fail('Invalid notes');
            out.session.notes = raw.session.notes;
        }
        if (Object.hasOwn(raw.session, 'date')) {
            const date = new Date(raw.session.date);
            if (typeof raw.session.date !== 'string' || !Number.isFinite(date.getTime()) || date.toISOString() !== raw.session.date) fail('Invalid original date');
            out.session.date = raw.session.date;
        }
        if (!Object.keys(out.session).length) fail('Empty session patch');
    }
    for (const name of ['updates', 'additions', 'removals', 'order']) {
        if (raw[name] === undefined) continue;
        if (!Array.isArray(raw[name]) || !raw[name].length || raw[name].length > 50) fail(`Invalid ${name}`);
        out[name] = raw[name].map(value => {
            if (['removals', 'order'].includes(name)) return id(value);
            exact(value, ['id', 'fields']); id(value.id); exact(value.fields, fields);
            if (!Object.keys(value.fields).length) fail('Empty set patch');
            for (const [key, v] of Object.entries(value.fields)) {
                if (key === 'completed') { if (typeof v !== 'boolean') fail('Invalid completed'); continue; }
                if (v === null && ['rpe', 'weightRight', 'repsRight'].includes(key)) continue;
                const max = key === 'rpe' ? 10 : key.includes('reps') ? 1000 : 2000;
                if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (!key.startsWith('weight') && !Number.isInteger(v))) fail(`Invalid ${key}`);
            }
            if (name === 'additions' && fields.some(k => !Object.hasOwn(value.fields, k))) fail('New sets require complete values');
            return { id: value.id, fields: { ...value.fields } };
        });
        const ids = out[name].map(v => typeof v === 'string' ? v : v.id);
        if (new Set(ids).size !== ids.length) fail(`Duplicate ${name}`);
    }
    const targets = [...(out.updates || []), ...(out.additions || []), ...(out.removals || [])].map(v => typeof v === 'string' ? v : v.id);
    if (new Set(targets).size !== targets.length || !Object.keys(out).length) fail('Overlapping or empty patch');
    return out;
}
export function parseResolution(raw) {
    exact(raw, ['conflictId', 'originalOperationId', 'decision']);
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(raw.conflictId) || raw.conflictId !== raw.originalOperationId
        || !['local', 'manual'].includes(raw.decision)) fail('Invalid conflict reference');
    return { ...raw };
}
export async function applySessionPatch(tx, log, changes) {
    const byId = new Map(log.sets.map(set => [set.id, { ...set }]));
    for (const set of changes.updates || []) {
        if (!byId.has(set.id)) throw new OperationError(409, 'SET_IDENTITY_CONFLICT', 'A selected set no longer exists. Review the session.');
        Object.assign(byId.get(set.id), set.fields);
    }
    for (const id of changes.removals || []) {
        if (!byId.delete(id)) throw new OperationError(409, 'SET_IDENTITY_CONFLICT', 'A selected set no longer exists.');
    }
    for (const set of changes.additions || []) {
        if (byId.has(set.id) || await tx.setLog.findUnique({ where: { id: set.id }, select: { id: true } })) throw new OperationError(409, 'SET_IDENTITY_CONFLICT', 'New set ID is already used.');
        byId.set(set.id, { ...set.fields, id: set.id });
    }
    const order = changes.order || [...byId.keys()];
    if (order.length !== byId.size || order.some(id => !byId.has(id))) throw new OperationError(409, 'SET_ORDER_CONFLICT', 'Order must include every current set exactly once.');
    const parsed = sanitizeSets(order.map(id => byId.get(id)));
    if (parsed.error) fail(parsed.error);
    for (const set of changes.updates || []) await tx.setLog.update({ where: { id: set.id }, data: set.fields });
    if (changes.removals) await tx.setLog.deleteMany({ where: { workoutLogId: log.id, id: { in: changes.removals } } });
    for (const set of changes.additions || []) await tx.setLog.create({ data: { id: set.id, ...set.fields, workoutLogId: log.id, setNumber: order.indexOf(set.id) + 1 } });
    // Only renumber when structure/order changes; preserve stable IDs.
    if (changes.order || changes.additions || changes.removals) for (const [index, id] of order.entries()) await tx.setLog.update({ where: { id }, data: { setNumber: index + 1 } });
    if (changes.session) await tx.workoutLog.update({ where: { id: log.id }, data: { ...changes.session,
        ...(changes.session.date ? { date: new Date(changes.session.date) } : {}) } });
}
