import training from '../generated/training.cjs';
const { cappedEpley1RM: epley1RM, canonicalExerciseKey, normalizeExerciseName, isSameExercise, groupTrainingHistory, best1RMRecent, bestOneRepMaxForTarget, detectPlateau, trainingCivilDate } = training;
export { epley1RM, canonicalExerciseKey, normalizeExerciseName, isSameExercise, best1RMRecent, bestOneRepMaxForTarget, detectPlateau };
// Existing goals retain device/process-day grouping. Read-only consumers may
// select CDMX explicitly; no achievedAt or historic records are reinterpreted.
export function groupHistoryByExercise(history, { calendarPolicy = 'legacy-device-day' } = {}) {
    if (!['legacy-device-day', 'cdmx-civil'].includes(calendarPolicy)) throw new RangeError('Unknown history calendar policy');
    return groupTrainingHistory(history, calendarPolicy === 'cdmx-civil' ? trainingCivilDate : instant => new Date(instant).toLocaleDateString('en-CA'));
}
