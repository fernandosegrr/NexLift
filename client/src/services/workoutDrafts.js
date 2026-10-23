import { getSessionIdentity } from './offlineQueue.js';
import { mexicoCityDateStr } from '../utils/dates.js';

const PREFIX = 'nexlift_draft_v2:';
const listeners = new Set();
export function subscribeDraftChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of listeners) { try { fn(); } catch { /* subscriber */ } } }

export function readDrafts() {
    const drafts = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) drafts.push({ key, ...JSON.parse(localStorage.getItem(key)) });
        else if (key?.startsWith('workout_')) drafts.push({ key, legacy: true, ownerId: null });
    }
    return drafts;
}

// Each editor instance has its own key. Resuming copies into a new instance;
// another tab's or yesterday's draft is never overwritten or deleted.
export function createDraftStore(kind, resourceId, ownerId) {
    const createdAt = Date.now();
    const originalDay = mexicoCityDateStr(new Date(createdAt));
    const id = globalThis.crypto?.randomUUID?.() || `${createdAt}_${Math.random().toString(36).slice(2)}`;
    const key = `${PREFIX}${id}`;
    function load() {
        if (!ownerId) return null;
        return readDrafts().filter(draft => !draft.legacy && draft.ownerId === ownerId
            && draft.kind === kind && draft.resourceId === resourceId
            && (kind === 'session' || draft.originalDay === originalDay))
            .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.data ?? null;
    }
    function save(data) {
        if (!ownerId || getSessionIdentity()?.ownerId !== ownerId) throw new Error('La cuenta cambió. El borrador no se guardó bajo otra cuenta.');
        localStorage.setItem(key, JSON.stringify({ version: 2, ownerId, kind, resourceId,
            createdAt, originalDay, updatedAt: Date.now(), data }));
        notify();
    }
    return { load, save, originalDay };
}
