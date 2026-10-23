import { canonicalExerciseKey, normalizeExerciseName } from '../../utils/exerciseName.js';
export function deterministicFallback(incomingExercises, canonicalExercises) {
    const byKey = new Map(canonicalExercises.map(ex => [canonicalExerciseKey(ex.name), ex]));
    return incomingExercises.map((ex, index) => {
        const match = byKey.get(canonicalExerciseKey(ex.name));
        return match
            ? { index, matchedId: match.id, cleanedName: null }
            : { index, matchedId: null, cleanedName: normalizeExerciseName(ex.name) || ex.name };
    });
}
