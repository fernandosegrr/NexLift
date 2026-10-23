import { assertNoSecrets, clone, storageError } from './database.js';
import { mexicoCityDateStr } from '../utils/dates.js';

export function createDraftRepository({ db, ready, identity, notify = () => {}, onError = () => {}, now = Date.now, uuid = () => crypto.randomUUID() }) {
    const failure = cause => { const error = storageError(cause); onError(error); return error; };
    return {
        async list(ownerId) {
            await ready();
            if (identity()?.ownerId !== ownerId) return [];
            return db.drafts.filter(row => row.ownerId === ownerId).toArray();
        },
        editor(kind, resourceId, ownerId) {
            const id = uuid(), createdAt = now(), originalDay = mexicoCityDateStr(createdAt);
            let version = 0;
            let chain = Promise.resolve();
            function assertOwner() { if (!ownerId || identity()?.ownerId !== ownerId) throw storageError(new Error('Draft owner changed')); }
            return { id, originalDay,
                async load() {
                    try {
                        assertOwner(); await ready(); assertOwner();
                        const rows = await db.drafts.where('[ownerId+kind+resourceId]').equals([ownerId, kind, resourceId]).toArray();
                        return clone(rows.filter(row => row.recovery !== 'requires_review' && (kind === 'session' || row.originalDay === originalDay)).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.data ?? null);
                    } catch (error) { throw failure(error); }
                },
                save(content) {
                    // Snapshot before awaits. Serialize this editor's revisions;
                    // other editor instances use different logical draft IDs.
                    let data;
                    try { assertOwner(); assertNoSecrets(content); data = clone(content); }
                    catch (error) { return Promise.reject(failure(error)); }
                    const write = async () => {
                        await ready(); assertOwner();
                        const updatedAt = now();
                        const result = await db.transaction('rw', db.drafts, db.draftVersions, async () => {
                            assertOwner();
                            const old = await db.drafts.get([ownerId, id]);
                            if ((old?.version || 0) !== version) throw new Error('Draft version conflict');
                            const row = { id, ownerId, kind, resourceId, createdAt, originalDay, updatedAt, data, version: version + 1, recovery: 'saved' };
                            await db.draftVersions.add(row); await db.drafts.put(row); return row;
                        });
                        version = result.version; notify(); return clone(result);
                    };
                    const pending = chain.then(write).catch(error => { throw failure(error); });
                    chain = pending.catch(() => {}); return pending;
                }
            };
        }
    };
}
