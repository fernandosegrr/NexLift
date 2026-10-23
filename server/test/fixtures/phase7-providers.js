// Providers for isolated server tests. Never used by a production entrypoint.
import { canonicalExerciseKey, normalizeExerciseName } from '../../src/utils/exerciseName.js';
export const unavailable = async () => { throw new Error('External provider disabled in rehearsal'); };
export const deduplicateExercises = async (incoming, existing) => {
    const byKey = new Map(existing.map(ex => [canonicalExerciseKey(ex.name), ex]));
    return incoming.map((ex, index) => { const found = byKey.get(canonicalExerciseKey(ex.name));
        return found ? { index, matchedId: found.id, cleanedName: null } : { index, matchedId: null, cleanedName: normalizeExerciseName(ex.name) || ex.name }; });
};
export function fakeProviders(more = {}) {
    return { cloudinaryConfigured: false, vapidConfigured: false, fetch: unavailable,
        cloudinary: { uploader: { upload: unavailable } },
        backupStore: { uploadBackup: unavailable, pruneOldBackups: unavailable }, deduplicateExercises, ...more };
}
