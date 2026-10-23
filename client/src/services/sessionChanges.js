import { readSessionResponse } from '../generated/contracts.js';
import { canonicalJSON, sha256 } from './operationProtocol.js';

export const setFields = ['weight', 'reps', 'rpe', 'completed', 'weightRight', 'repsRight'];
export const equalValue = (a, b) => canonicalJSON(a) === canonicalJSON(b);
export const orderedSets = log => [...log.sets].sort((a, b) => a.setNumber - b.setNumber || a.id.localeCompare(b.id));
export async function verifySnapshot(snapshot, ownerId, logId, version) {
    readSessionResponse(snapshot);
    const log = snapshot?.workoutLog;
    if (snapshot?.ownerId !== ownerId || !log || log.id !== logId || snapshot.sessionVersion !== version
        || !Array.isArray(log.sets) || new Set(log.sets.map(s => s.id)).size !== log.sets.length
        || log.sets.some(s => typeof s.id !== 'string' || s.workoutLogId !== logId)) throw new Error('No hay una fotografía base verificable de esta cuenta.');
    const hash = await sha256(canonicalJSON({ id: log.id, exerciseId: log.exerciseId, date: new Date(log.date).toISOString(),
        notes: log.notes ?? null, sets: orderedSets(log) }));
    if (hash !== version) throw new Error('La fotografía no coincide con su versión. Conserva el original para revisión.');
    return structuredClone(snapshot);
}
export function changesFromEditor(base, sets) {
    const before = new Map(base.sets.map(s => [s.id, s])), after = new Set(sets.map(s => s.id));
    if (after.size !== sets.length || sets.some(s => !s.id)) throw new Error('Falta la identidad estable de una serie.');
    const changes = {}, updates = [], additions = [];
    for (const set of sets) {
        const fields = Object.fromEntries(setFields.map(k => [k, set[k] ?? (k === 'completed' ? true : null)]));
        const old = before.get(set.id);
        if (!old) additions.push({ id: set.id, fields });
        else {
            const changed = Object.fromEntries(setFields.filter(k => !equalValue(old[k], fields[k])).map(k => [k, fields[k]]));
            if (Object.keys(changed).length) updates.push({ id: set.id, fields: changed });
        }
    }
    if (updates.length) changes.updates = updates;
    if (additions.length) changes.additions = additions;
    const removals = base.sets.filter(s => !after.has(s.id)).map(s => s.id);
    if (removals.length) changes.removals = removals;
    const order = sets.map(s => s.id);
    if (!equalValue(order, orderedSets(base).map(s => s.id))) changes.order = order;
    return changes;
}

// No positional matching. Missing base/legacy replacement is deliberately
// unavailable for merge, rather than inferring identities from array indices.
export function compareSession(base, payload, remote) {
    if (base && remote && (base.workoutLog.id !== remote.workoutLog.id || base.workoutLog.exerciseId !== remote.workoutLog.exerciseId)) return {
        mergeable: false, differences: [], reason: 'La identidad o el ejercicio de esta sesión cambió. Conserva y exporta los originales para revisión.' };
    if (base && remote && payload.kind === 'workout.delete') {
        const comparison = compareSession(base, { changes: {} }, remote);
        comparison.differences.push({ key: 'session:deleted', target: 'session', field: 'deleted', original: 'Sesión existente', local: 'Eliminar sesión completa',
            remote: 'Sesión existente con los cambios mostrados', localChanged: true, remoteChanged: base.sessionVersion !== remote.sessionVersion,
            conflict: base.sessionVersion !== remote.sessionVersion, prAffected: true,
            explanation: 'La eliminación incluye las series y los cambios remotos mostrados. Solo se ejecuta tras tu confirmación explícita.' });
        comparison.independent = false; return comparison;
    }
    if (!base || !remote || !payload.changes) return { mergeable: false, differences: [], reason: !remote
        ? 'La sesión ya no está disponible para esta cuenta. No se recreará automáticamente.'
        : 'Falta una base completa o la operación antigua no conserva identidades de series. Puedes conservar el servidor y exportar el original.' };
    const original = base.workoutLog, current = remote.workoutLog, differences = [];
    const b = new Map(original.sets.map(s => [s.id, s])), r = new Map(current.sets.map(s => [s.id, s]));
    const add = (key, target, field, before, local, server, localChanged, remoteChanged, extra = {}) => {
        if (!localChanged && !remoteChanged) return;
        differences.push({ key, target, field, original: before, local, remote: server, localChanged, remoteChanged,
            conflict: localChanged && remoteChanged && !equalValue(local, server), prAffected: setFields.includes(field) || ['added', 'removed', 'date'].includes(field), ...extra });
    };
    for (const field of ['notes', 'date']) {
        const before = original[field] ?? null, server = current[field] ?? null;
        const local = Object.hasOwn(payload.changes.session || {}, field) ? payload.changes.session[field] : before;
        add(`session:${field}`, 'session', field, before, local, server, !equalValue(before, local), !equalValue(before, server));
    }
    for (const [id, set] of b) {
        const localRemoval = payload.changes.removals?.includes(id), server = r.get(id);
        const update = payload.changes.updates?.find(s => s.id === id)?.fields || {};
        const local = { ...set, ...update };
        if (!server || localRemoval) {
            const locallyModified = localRemoval || Object.keys(update).some(k => !equalValue(set[k], update[k]));
            add(`set:${id}:structure`, id, 'removed', set, localRemoval ? null : local, server || null,
                locallyModified, !server || setFields.some(k => !equalValue(set[k], server[k])),
                { selectable: localRemoval && !!server, incompatible: !server && locallyModified && !localRemoval,
                    explanation: !server ? 'Serie eliminada remotamente; no se resucitará.' : 'Eliminar esta serie también elimina sus cambios remotos.' });
            continue;
        }
        for (const field of setFields) add(`set:${id}:${field}`, id, field, set[field], local[field], server[field],
            !equalValue(set[field], local[field]), !equalValue(set[field], server[field]));
    }
    for (const set of payload.changes.additions || []) add(`set:${set.id}:added`, set.id, 'added', null, set.fields,
        r.has(set.id) ? r.get(set.id) : null, true, r.has(set.id), { selectable: !r.has(set.id), incompatible: r.has(set.id) });
    for (const [id, set] of r) if (!b.has(id) && !payload.changes.additions?.some(s => s.id === id)) add(`set:${id}:remote-added`, id, 'added', null, null, set, false, true);
    const bo = orderedSets(original).map(s => s.id), ro = orderedSets(current).map(s => s.id), lo = payload.changes.order || bo;
    if (payload.changes.order || !equalValue(bo, ro)) {
        const finalIds = [...r.keys()].filter(id => !payload.changes.removals?.includes(id)).concat((payload.changes.additions || []).map(s => s.id));
        const compatible = lo.length === finalIds.length && lo.every(id => finalIds.includes(id));
        add('session:order', 'session', 'order', bo, lo, ro, !equalValue(bo, lo), !equalValue(bo, ro),
            { selectable: compatible, incompatible: !compatible && !!payload.changes.order });
    }
    if (original.exercise?.isUnilateral !== current.exercise?.isUnilateral) differences.push({ key: 'exercise:unilateral', target: 'exercise', field: 'isUnilateral',
        original: original.exercise?.isUnilateral, local: original.exercise?.isUnilateral, remote: current.exercise?.isUnilateral,
        remoteChanged: true, localChanged: false, selectable: false, explanation: 'Configuración del ejercicio; los lados se comparan por serie. No se modifica desde esta sesión.' });
    return { mergeable: true, differences, independent: differences.every(d => !d.conflict && !d.incompatible) };
}
export function selectedChanges(comparison, selectedKeys) {
    if (!comparison.mergeable) throw new Error(comparison.reason);
    const changes = {}, updates = new Map();
    for (const key of selectedKeys) {
        const diff = comparison.differences.find(d => d.key === key);
        if (!diff?.localChanged || diff.selectable === false || diff.incompatible) throw new Error('Esta estructura requiere revisión; no puede fusionarse con seguridad.');
        if (diff.field === 'order') changes.order = diff.local;
        else if (diff.target === 'session') (changes.session ??= {})[diff.field] = diff.local;
        else if (diff.field === 'removed') (changes.removals ??= []).push(diff.target);
        else if (diff.field === 'added') (changes.additions ??= []).push({ id: diff.target, fields: diff.local });
        else { const update = updates.get(diff.target) || { id: diff.target, fields: {} }; update.fields[diff.field] = diff.local; updates.set(diff.target, update); }
    }
    if (updates.size) changes.updates = [...updates.values()];
    if (!Object.keys(changes).length) throw new Error('Selecciona algún cambio local o conserva la versión del servidor.');
    return changes;
}
