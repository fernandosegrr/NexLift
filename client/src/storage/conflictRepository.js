import { assertNoSecrets, clone, storageError } from './database.js';
import { applyEvent, operationRow, validateEnvelope } from './operationRepository.js';

// Deterministic conflict identity = original operation UUID, scoped by account.
// All decisions, envelopes and observations are retained. No delete/clear API.
export function createConflictRepository({ db, ready, identity, notify, coordination, onError = () => {}, now = Date.now }) {
    const assertOwner = ownerId => { if (identity()?.ownerId !== ownerId) throw new Error('La cuenta cambió. Los registros siguen con su propietario.'); };
    async function history(ownerId, conflictId, type, data) {
        assertNoSecrets(data);
        await db.conflictHistory.add({ ownerId, conflictId, id: crypto.randomUUID(), type, at: now(), data: clone(data) });
    }
    async function ensure(row, reason) {
        const key = [row.ownerId, row.id], old = await db.conflicts.get(key);
        if (old) return old;
        const value = { ownerId: row.ownerId, id: row.id, operationId: row.id, sessionId: row.envelope.payload.logId || null,
            original: clone(row.envelope), baseVersion: row.envelope.payload.expectedVersion || null,
            baseSnapshot: row.envelope.baseSnapshot || null, localState: clone(row.envelope.payload), reason,
            detectedAt: now(), status: 'unresolved', revision: 1, dependentIds: [] };
        await db.conflicts.add(value); await history(row.ownerId, row.id, 'detected', { reason }); return value;
    }
    async function preserve(row) {
        if (['confirmed', 'resolved_preserved'].includes(row.status)) return;
        await applyEvent(db, row, { status: 'resolved_preserved', id: crypto.randomUUID(), sequence: (row.currentEvent?.sequence || 0) + 1, at: now(),
            lastError: 'Original conservado; consulta la decisión y su comprobante en conflictos.' }, { preserveOriginal: true });
    }
    async function closeAncestors(row, decision) {
        const visited = new Set(); let ref = row.envelope.payload.resolution;
        while (ref && !visited.has(ref.conflictId)) {
            visited.add(ref.conflictId);
            const ancestor = await db.conflicts.get([row.ownerId, ref.conflictId]);
            if (!ancestor || ancestor.activeResolutionId !== row.id) break;
            ancestor.status = decision.type === 'accepted_server' ? 'resolved_server' : 'resolved_local';
            ancestor.resolvedAt = now(); ancestor.revision++;
            await db.conflicts.put(ancestor); await history(row.ownerId, ancestor.id, 'descendant_resolved', decision);
            row = await db.operations.get([row.ownerId, ancestor.operationId]); if (!row) break;
            await preserve(row); ref = row.envelope.payload.resolution;
        }
    }
    const methods = {
        // Invoked in operationRepository's state/receipt transaction.
        async onState(row, patch) {
            if (row.envelope.payload.logId && ['conflict', 'blocked_forbidden', 'blocked_validation'].includes(patch.status)) await ensure(row, patch.errorCode || patch.status);
            const ref = row.envelope.payload.resolution;
            if (!ref) return;
            const conflict = await db.conflicts.get([row.ownerId, ref.conflictId]);
            if (!conflict || conflict.activeResolutionId !== row.id) return;
            if (patch.status === 'confirmed') {
                conflict.status = 'resolved_local'; conflict.resolvedAt = now(); conflict.receipt = clone(patch.receipt);
                const original = await db.operations.get([row.ownerId, conflict.operationId]); if (original) await preserve(original);
                if (original) await closeAncestors(original, { type: 'receipt', operationId: row.id, receipt: patch.receipt });
            } else if (['conflict', 'blocked_validation', 'blocked_forbidden'].includes(patch.status)) conflict.status = 'reconflict';
            conflict.revision++; await db.conflicts.put(conflict);
            await history(row.ownerId, conflict.id, 'attempt_state', { operationId: row.id, status: patch.status, receipt: patch.receipt || null });
        },
        async list(ownerId) {
            assertOwner(ownerId); await ready();
            const result = await db.transaction('rw', db.tables, async () => {
                assertOwner(ownerId);
                const rows = await db.operations.where('[ownerId+status]').anyOf(['conflict', 'blocked_dependency', 'blocked_forbidden', 'blocked_validation'].map(status => [ownerId, status])).toArray();
                for (const row of rows) if (row.envelope.payload.logId) await ensure(row, row.errorCode || row.status);
                const conflicts = await db.conflicts.where('ownerId').equals(ownerId).toArray();
                for (const conflict of conflicts) {
                    const affected = new Set([conflict.operationId]); let frontier = [conflict.operationId];
                    while (frontier.length) {
                        const children = await db.operations.where('dependsOn').anyOf(frontier).filter(row => row.ownerId === ownerId).toArray();
                        frontier = children.filter(row => !affected.has(row.id)).map(row => row.id);
                        for (const id of frontier) affected.add(id);
                    }
                    conflict.dependentIds = [...affected].filter(id => id !== conflict.operationId);
                    await db.conflicts.put(conflict);
                }
                return conflicts;
            });
            assertOwner(ownerId); return result;
        },
        async get(ownerId, id) {
            assertOwner(ownerId); await ready();
            const value = await db.conflicts.get([ownerId, id]);
            const records = await db.conflictHistory.where('[ownerId+conflictId]').equals([ownerId, id]).toArray();
            assertOwner(ownerId); return value ? { ...value, history: records } : null;
        },
        async observe(ownerId, id, observation) {
            assertNoSecrets(observation); assertOwner(ownerId); await ready();
            await db.transaction('rw', db.conflicts, db.conflictHistory, async () => {
                assertOwner(ownerId); const c = await db.conflicts.get([ownerId, id]); if (!c) throw new Error('Conflicto inexistente.');
                c.observation = clone(observation); c.revision++; await db.conflicts.put(c);
                await history(ownerId, id, 'remote_observed', observation);
            }); notify(); return this.get(ownerId, id);
        },
        async defer(ownerId, id) {
            assertOwner(ownerId); await ready();
            await db.transaction('rw', db.conflicts, db.conflictHistory, async () => {
                assertOwner(ownerId); const c = await db.conflicts.get([ownerId, id]);
                if (!c || !['unresolved', 'deferred', 'reconflict'].includes(c.status)) throw new Error('Esta decisión ya tiene un intento pendiente.');
                c.status = 'deferred'; c.revision++; await db.conflicts.put(c); await history(ownerId, id, 'deferred', {});
            }); notify();
        },
        async acceptServer(ownerId, id, revision, observation) {
            assertNoSecrets(observation); assertOwner(ownerId); await ready();
            await db.transaction('rw', db.tables, async () => {
                assertOwner(ownerId); await coordination.assertFence(ownerId);
                const c = await db.conflicts.get([ownerId, id]);
                if (!c || c.revision !== revision || !['unresolved', 'deferred', 'reconflict'].includes(c.status)) throw new Error('El conflicto cambió en otra pestaña. Revisa de nuevo.');
                // An unresolved submitted attempt is never abandoned: reconcile
                // its UUID before another decision can be prepared.
                if (c.activeResolutionId) throw new Error('Consulta primero el comprobante del intento enviado.');
                const row = await db.operations.get([ownerId, c.operationId]);
                await preserve(row); c.status = 'resolved_server'; c.resolvedAt = now(); c.acceptedRemote = clone(observation); c.revision++;
                await db.conflicts.put(c); await history(ownerId, id, 'accepted_server', observation);
                await closeAncestors(row, { type: 'accepted_server', conflictId: id, observation });
            }); notify();
        },
        async prepare(ownerId, id, revision, envelope, proposal) {
            assertOwner(ownerId); await ready(); await validateEnvelope(envelope); assertNoSecrets(proposal);
            await db.transaction('rw', db.tables, async () => {
                assertOwner(ownerId); await coordination.assertFence(ownerId);
                const c = await db.conflicts.get([ownerId, id]);
                if (!c || c.revision !== revision || !['unresolved', 'deferred', 'reconflict'].includes(c.status) || c.activeResolutionId) throw new Error('Ya existe una decisión o el conflicto cambió. Consulta su resultado.');
                if (envelope.ownerId !== ownerId || envelope.payload.resolution?.conflictId !== id || envelope.dependsOn.length) throw new Error('Decisión incompatible.');
                await db.operations.add(operationRow(envelope));
                c.status = 'awaiting_receipt'; c.activeResolutionId = envelope.id; c.revision++;
                await db.conflicts.put(c); await history(ownerId, id, 'decision_prepared', { envelope, proposal });
            }); notify(); return envelope.id;
        },
        async processingList(ownerId, items) {
            assertOwner(ownerId);
            const active = (await db.conflicts.where('ownerId').equals(ownerId).toArray()).filter(c => c.status === 'awaiting_receipt').map(c => c.activeResolutionId);
            return [...items.filter(i => active.includes(i.id)), ...items.filter(i => !active.includes(i.id))];
        }
    };
    return Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, async function (...args) {
        try { return await method.apply(this, args); }
        catch (cause) {
            if (cause?.isStorageError || /^(QuotaExceeded|DatabaseClosed|Version|Abort|InvalidState|Constraint|MissingAPI)Error$/.test(cause?.name || '')) {
                const error = storageError(cause); onError(error); throw error;
            }
            throw cause;
        }
    }]));
}
