import { createHash } from 'node:crypto';
const canonical = value => JSON.stringify(value, (key, val) => val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]])) : val);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const requestHash = operation => hash({ protocolVersion: 1, ...operation });
export function sessionVersion(log) {
    return hash({ id: log.id, exerciseId: log.exerciseId, date: new Date(log.date).toISOString(), notes: log.notes ?? null,
        sets: [...log.sets].sort((a, b) => a.setNumber - b.setNumber || a.id.localeCompare(b.id)) });
}
