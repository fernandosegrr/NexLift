// Database-dependent patch application remains transactional in this adapter.
import { OperationError, adaptContract } from './operationContract.js';
import { sanitizeSets } from '../logic.js';
import { parseChanges as sharedChanges, parseResolution as sharedResolution } from '../generated/contracts.cjs';
const fail = message => { throw new OperationError(422, 'INVALID_SESSION_PATCH', message); };
export const parseChanges = input => adaptContract(() => sharedChanges(input));
export const parseResolution = input => adaptContract(() => sharedResolution(input));
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
