import { assertNoSecrets, clone, storageError } from './database.js';
import { canonicalJSON, sha256, verifyReceipt } from '../services/operationProtocol.js';
import { OPERATION_PREFIX } from '../services/operationStore.js';
import { applyEvent, operationRow, sameEnvelope, statePatch, validateEnvelope } from './operationRepository.js';

export const isLegacyKey = key => key === 'nexlift_offline_queue' || key.startsWith('nexlift_offline_op_v2:')
    || key.startsWith('nexlift_draft_v2:') || key.startsWith('workout_')
    || (key.startsWith(OPERATION_PREFIX) && !key.startsWith(`${OPERATION_PREFIX}lease:`));
export function inspectLegacy(storage) {
    const result = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && isLegacyKey(key)) {
            const raw = storage.getItem(key);
            if (raw !== null) result.push({ key, raw });
        }
    }
    return result.sort((a, b) => a.key.localeCompare(b.key));
}
function identify(source) {
    const data = JSON.parse(source.raw);
    assertNoSecrets(data);
    if (source.key.startsWith(OPERATION_PREFIX)) {
        const match = source.key.match(/^nexlift_operation_v1:([^:]+):([^:]+):(payload|event:[^:]+)$/);
        if (!match) throw new Error('Unknown operation key');
        const ownerId = decodeURIComponent(match[1]), operationId = match[2];
        if (!ownerId) throw new Error('Unknown owner');
        if (match[3] === 'payload') {
            if (data.ownerId !== ownerId || data.id !== operationId) throw new Error('Mismatching owner/identity');
            return { type: 'operation', ownerId, operationId, data };
        }
        if (data.id !== match[3].slice(6) || !Number.isFinite(data.at) || !Number.isInteger(data.sequence) || data.sequence < 1) throw new Error('Invalid state event');
        statePatch(data); return { type: 'event', ownerId, operationId, data };
    }
    if (source.key.startsWith('nexlift_draft_v2:') && data?.version === 2 && typeof data.ownerId === 'string' && data.ownerId
        && ['workout', 'session'].includes(data.kind) && typeof data.resourceId === 'string' && data.resourceId
        && /^\d{4}-\d{2}-\d{2}$/.test(data.originalDay) && Number.isFinite(data.createdAt) && Number.isFinite(data.updatedAt)
        && data.data && typeof data.data === 'object') return { type: 'draft', ownerId: data.ownerId, data };
    // v2 queue entries, array queues and workout_* lack the durable 3.1
    // contract/proof. Keep literally, even when an owner field is present.
    return { type: 'legacy', ownerId: typeof data?.ownerId === 'string' ? data.ownerId : null,
        reason: 'requires_review', data };
}
export function createMigrationService({ db, storage, notify = () => {}, now = Date.now, checkpoint = async () => {} }) {
    let inFlight;
    async function reconcile() {
        const before = inspectLegacy(storage);
        const fingerprint = await sha256(canonicalJSON(before));
        const previous = await db.metadata.get('migration');
        if (previous?.fingerprint === fingerprint && previous.verified) return previous;
        const sources = await Promise.all(before.map(async source => {
            const hash = await sha256(source.raw), id = await sha256(source.key + '\0' + source.raw);
            let parsed;
            try { parsed = identify(source); }
            catch {
                let ownerId = null;
                // Even a corrupt owned journal key must not become an export
                // belonging to an unrelated account. This hint NEVER enables sync.
                try { if (/^nexlift_operation_v1:[^:]+:/.test(source.key)) ownerId = decodeURIComponent(source.key.split(':')[1]); } catch { /* unknown */ }
                parsed = { type: 'legacy', ownerId, reason: 'corrupt_or_sensitive' };
            }
            // Never put credential material in IDB, even inside malformed JSON.
            let safe = true;
            try { assertNoSecrets(source.raw); assertNoSecrets(JSON.parse(source.raw)); }
            catch {
                safe = !/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:token|password|authorization|secret|jwt)\s*["']?\s*:/i.test(source.raw);
            }
            return { id, key: source.key, ...(safe ? { raw: source.raw } : {}), hash, ownerId: parsed.ownerId,
                type: parsed.type, status: 'copied', reason: parsed.reason || null, safe, parsed };
        }));
        // Stage 1 commits literal originals before any interpreted representation.
        await db.transaction('rw', db.sources, db.metadata, async () => {
            for (const { parsed: _parsed, ...source } of sources) {
                if (!await db.sources.get(source.id)) await db.sources.add(source);
            }
            await db.metadata.put({ key: 'migration', status: 'copying', fingerprint, verified: false, finalCutover: false, sourceCount: sources.length });
        });
        notify(); await checkpoint('copied');
        // Validate/hash outside IDB transactions. One corrupt record never
        // prevents preserving all the other records from the same installation.
        for (const source of sources) {
            if (source.parsed.type === 'operation') {
                try { await validateEnvelope(source.parsed.data); }
                catch { source.parsed = { type: 'legacy', reason: 'invalid_payload' }; }
            }
        }
        const ordered = sources.toSorted((a, b) => Number(a.parsed.type === 'event') - Number(b.parsed.type === 'event')
            || (a.parsed.data?.sequence || 0) - (b.parsed.data?.sequence || 0));
        for (let offset = 0; offset < ordered.length; offset += 100) {
            const batch = ordered.slice(offset, offset + 100);
            await db.transaction('rw', db.operations, db.events, db.receipts, db.drafts, db.draftVersions, db.sources, async () => {
                for (const source of batch) {
                    const { parsed } = source;
                    let status = 'verified', reason = parsed.reason || null;
                    if (parsed.type === 'operation') {
                        const existing = await db.operations.get([parsed.ownerId, parsed.operationId]);
                        if (!existing) await db.operations.add(operationRow(parsed.data));
                        else if (!sameEnvelope(existing, parsed.data)) {
                            status = 'blocked'; reason = 'immutable_identity_collision';
                            if (!['confirmed', 'resolved_preserved'].includes(existing.status)) await db.operations.update([parsed.ownerId, parsed.operationId], { status: 'blocked_migration' });
                        }
                    } else if (parsed.type === 'event') {
                        const row = await db.operations.get([parsed.ownerId, parsed.operationId]);
                        let valid = !!row;
                        try { if (parsed.data.status === 'confirmed') verifyReceipt(row?.envelope, parsed.data.receipt, parsed.data.receipt?.replayed ? 200 : 201); }
                        catch { valid = false; }
                        const existing = await db.events.get([parsed.ownerId, parsed.operationId, parsed.data.id]);
                        if (existing && canonicalJSON(existing.event) !== canonicalJSON(parsed.data)) valid = false;
                        if (valid) await applyEvent(db, row, parsed.data);
                        else { status = 'blocked'; reason = 'invalid_or_orphan_event';
                            if (row && !['confirmed', 'resolved_preserved'].includes(row.status)) await db.operations.update([parsed.ownerId, parsed.operationId], { status: 'blocked_migration' });
                        }
                    } else if (parsed.type === 'draft') {
                        const data = parsed.data, id = source.key.slice('nexlift_draft_v2:'.length);
                        // Each source revision has its own immutable recovery
                        // version. A late old-tab save cannot overwrite new edits.
                        const versionKey = [data.ownerId, id, source.id];
                        if (!await db.draftVersions.get(versionKey)) {
                            const original = { ...clone(data), id, version: source.id, recovery: 'legacy_copy', sourceId: source.id };
                            await db.draftVersions.add(original);
                            const current = await db.drafts.get([data.ownerId, id]);
                            if (!current || (current.recovery === 'legacy_copy' && current.updatedAt < data.updatedAt)) await db.drafts.put(original);
                            else if (current.recovery === 'legacy_copy' && current.updatedAt === data.updatedAt
                                && canonicalJSON(current.data) !== canonicalJSON(data.data)) {
                                await db.drafts.update([data.ownerId, id], { recovery: 'requires_review' });
                                status = 'blocked'; reason = 'ambiguous_draft_revision';
                            }
                        }
                    } else { status = 'blocked'; reason ||= 'requires_review'; }
                    await db.sources.update(source.id, { status, reason });
                }
            });
            await checkpoint('batch', offset);
        }
        await checkpoint('before_receipt');
        // Stage 3 reads back the committed copies. No success marker on failure.
        const stored = await db.sources.bulkGet(sources.map(source => source.id));
        for (let i = 0; i < sources.length; i++) {
            if (!stored[i] || stored[i].hash !== sources[i].hash || stored[i].raw !== (sources[i].safe ? sources[i].raw : undefined)
                || (stored[i].raw !== undefined && await sha256(stored[i].raw) !== stored[i].hash)) throw new Error('Migration verification failed');
            const parsed = sources[i].parsed;
            if (stored[i].status === 'verified' && parsed.type === 'operation') {
                const row = await db.operations.get([parsed.ownerId, parsed.operationId]);
                if (!row || !sameEnvelope(row, parsed.data)) throw new Error('Operation copy mismatch');
            }
            if (stored[i].status === 'verified' && parsed.type === 'event') {
                const row = await db.events.get([parsed.ownerId, parsed.operationId, parsed.data.id]);
                if (!row || canonicalJSON(row.event) !== canonicalJSON(parsed.data)) throw new Error('State copy mismatch');
            }
            if (stored[i].status === 'verified' && parsed.type === 'draft') {
                const id = sources[i].key.slice('nexlift_draft_v2:'.length);
                const row = await db.draftVersions.get([parsed.ownerId, id, sources[i].id]);
                if (!row || canonicalJSON(row.data) !== canonicalJSON(parsed.data.data)) throw new Error('Draft copy mismatch');
            }
        }
        const unchanged = canonicalJSON(inspectLegacy(storage)) === canonicalJSON(before);
        const blocked = stored.filter(source => source.status !== 'verified').length;
        const result = { key: 'migration', status: !unchanged ? 'reconciling' : blocked ? 'review' : 'watching',
            verified: unchanged, fingerprint, sourceCount: sources.length, blocked, verifiedAt: now(),
            schemaVersion: 2, finalCutover: false, originalSourcesRetained: true };
        await db.transaction('rw', db.metadata, () => db.metadata.put(result));
        notify();
        if (!unchanged) throw storageError(new Error('Legacy changed while copying; retry before sync'));
        return result;
    }
    return { reconcile() {
        inFlight ??= reconcile().catch(error => { throw storageError(error); }).finally(() => { inFlight = null; });
        return inFlight;
    } };
}
