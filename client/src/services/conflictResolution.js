import { normalizePayload, payloadHash } from './operationProtocol.js';
import { compareSession, equalValue, selectedChanges, verifySnapshot } from './sessionChanges.js';
import { mexicoCityDateStr } from '../utils/dates.js';

export function createConflictResolution({ storage, sync, now = Date.now }) {
    const repository = storage.conflicts, { transport } = sync;
    const sessionFor = ownerId => {
        const session = transport.snapshot();
        if (!session || session.ownerId !== ownerId || !repository) throw new Error('Inicia sesión con la cuenta propietaria.');
        return session;
    };
    async function readRemote(session, logId) {
        try {
            const { body } = await transport.request(session, `/v1/workout-sessions/${encodeURIComponent(logId)}`);
            const snapshot = { ...body, ownerId: session.ownerId };
            await verifySnapshot(snapshot, session.ownerId, logId, body.sessionVersion); transport.assertSession(session);
            return { status: 'available', snapshot, version: body.sessionVersion };
        } catch (error) {
            if (error.status === 404) return { status: 'unavailable', snapshot: null, version: null };
            if (error.status === 403) return { status: 'forbidden', snapshot: null, version: null };
            throw error;
        }
    }
    return {
        list(ownerId) { sessionFor(ownerId); return repository.list(ownerId); },
        async inspect(ownerId, id) {
            const session = sessionFor(ownerId); await repository.list(ownerId);
            const conflict = await repository.get(ownerId, id); if (!conflict) throw new Error('No se encontró el conflicto de esta cuenta.');
            const remote = await readRemote(session, conflict.sessionId); transport.assertSession(session);
            let base = null;
            if (conflict.baseSnapshot) {
                try { base = await verifySnapshot(conflict.baseSnapshot, ownerId, conflict.sessionId, conflict.baseVersion); } catch { /* never fabricate base */ }
            }
            const comparison = compareSession(base, conflict.original.payload, remote.snapshot);
            const observations = { remote, comparison, readAt: now() };
            return repository.observe(ownerId, id, observations);
        },
        async preview(ownerId, id, keys, decision = 'manual') {
            const session = sessionFor(ownerId), conflict = await this.inspect(ownerId, id); transport.assertSession(session);
            if (conflict.activeResolutionId) throw new Error('Ya hay un intento enviado. Consulta su comprobante o el conflicto más reciente.');
            const items = await sync.store.list(ownerId);
            const deps = conflict.original.dependsOn;
            const visiting = new Set(), visited = new Set(), byId = new Map(items.map(i => [i.id, i]));
            const check = id => {
                if (visiting.has(id)) throw new Error('Hay un ciclo de dependencias. Conserva y exporta los originales para revisión.');
                if (visited.has(id)) return;
                const item = byId.get(id); if (!item) throw new Error('Falta una operación dependiente. Conserva los originales para revisión.');
                if (['confirmed', 'resolved_preserved'].includes(item.status)) return;
                visiting.add(id); for (const dependency of item.dependsOn) check(dependency);
                visiting.delete(id); visited.add(id);
            };
            check(conflict.operationId);
            if (deps.some(id => !items.some(i => i.id === id && ['confirmed', 'resolved_preserved'].includes(i.status)))) throw new Error('Resuelve primero las operaciones anteriores de esta sesión.');
            const { comparison, remote } = conflict.observation;
            const selected = decision === 'local' ? comparison.differences.filter(d => d.localChanged).map(d => d.key) : keys;
            const deleteSession = conflict.original.payload.kind === 'workout.delete';
            if (deleteSession && (!comparison.mergeable || selected.length !== 1 || selected[0] !== 'session:deleted')) throw new Error('Revisa la eliminación completa y confirma expresamente esa selección.');
            const changes = deleteSession ? null : selectedChanges(comparison, selected);
            return { conflictId: id, revision: conflict.revision, remoteVersion: remote.version, decision,
                changes, deleteSession, selected: comparison.differences.filter(d => selected.includes(d.key)), readAt: now() };
        },
        async confirm(ownerId, proposal) {
            const session = sessionFor(ownerId), conflict = await repository.get(ownerId, proposal.conflictId);
            if (!conflict || conflict.revision !== proposal.revision) throw new Error('La comparación cambió. Revisa una nueva vista previa.');
            const remote = await readRemote(session, conflict.sessionId); transport.assertSession(session);
            if (remote.status !== 'available' || remote.version !== proposal.remoteVersion) {
                await this.inspect(ownerId, conflict.id); throw new Error('El entrenamiento volvió a cambiar. Revisa las diferencias nuevas antes de confirmar.');
            }
            // Reconstruct the selected fields from the persisted, verified
            // observation: a UI proposal cannot smuggle unrelated changes.
            const deleteSession = conflict.original.payload.kind === 'workout.delete';
            if (deleteSession && (proposal.selected.length !== 1 || proposal.selected[0].key !== 'session:deleted')) throw new Error('Falta la selección explícita de eliminación.');
            const selected = deleteSession ? null : selectedChanges(conflict.observation.comparison, proposal.selected.map(d => d.key));
            if (!equalValue(selected, proposal.changes) || !['manual', 'local'].includes(proposal.decision)) throw new Error('La vista previa no coincide con los cambios seleccionados.');
            const operationId = crypto.randomUUID(), performedAt = new Date(now()).toISOString();
            const payload = normalizePayload({ operationId, performedAt, source: 'pwa', kind: deleteSession ? 'workout.delete' : 'workout.replaceSets', logId: conflict.sessionId,
                expectedVersion: remote.version, ...(deleteSession ? {} : { changes: selected }), resolution: { conflictId: conflict.id, originalOperationId: conflict.operationId, decision: proposal.decision } });
            const requestHash = await payloadHash(payload); transport.assertSession(session);
            const earlier = await sync.store.list(ownerId);
            const envelope = { format: 1, id: operationId, ownerId, payload, requestHash, originalDay: mexicoCityDateStr(performedAt),
                createdAt: now(), localOrder: 1 + Math.max(0, ...earlier.map(i => i.localOrder || 0)), dependsOn: [], initialStatus: 'pending', baseSnapshot: remote.snapshot };
            await repository.prepare(ownerId, conflict.id, proposal.revision, envelope, proposal);
            // The existing engine alone sends/retries. A lost reply cannot
            // generate another decision/UUID, even across browser restarts.
            await sync.run(); transport.assertSession(session);
            return sync.store.get(ownerId, operationId);
        },
        async acceptServer(ownerId, id) {
            const session = sessionFor(ownerId), conflict = await repository.get(ownerId, id);
            if (!conflict?.observation) throw new Error('Consulta primero las diferencias.');
            const remote = await readRemote(session, conflict.sessionId); transport.assertSession(session);
            if (remote.status !== conflict.observation.remote.status || remote.version !== conflict.observation.remote.version) {
                await this.inspect(ownerId, id); throw new Error('El servidor cambió. Revisa de nuevo antes de conservar esa versión.');
            }
            await repository.acceptServer(ownerId, id, conflict.revision, { ...remote, verifiedAt: now() });
            transport.assertSession(session); await sync.run();
        },
        defer(ownerId, id) { sessionFor(ownerId); return repository.defer(ownerId, id); },
        async retry(ownerId) { const session = sessionFor(ownerId); await sync.retry(); transport.assertSession(session); },
        async export(ownerId) { const session = sessionFor(ownerId); const data = await storage.export(ownerId); transport.assertSession(session); return data; }
    };
}
