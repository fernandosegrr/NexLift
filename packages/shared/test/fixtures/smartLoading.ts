import { computeWorkoutSuggestion, suggestNextSetFromToday, evaluateWorkoutSuggestion, pickWorkReference } from '../../src/index.js';
// @ts-expect-error Sessions require a sets boundary; a flat list is not history.
computeWorkoutSuggestion([{ weight: 80, reps: 10 }], '8-12', 2.5);
// @ts-expect-error Increment is a parsed kg quantity, not a form string.
computeWorkoutSuggestion([], '8-12', '2.5');
// @ts-expect-error Intra options require parsed rep counts.
suggestNextSetFromToday([], { lo: '8' });
// @ts-expect-error An effective reference is distinct from unknown legacy fields.
pickWorkReference([{ weight: '80', reps: 10, rir: 2 }], 8);
const result = evaluateWorkoutSuggestion([{ sets: [{ weight: '80', reps: '10', rpe: 8 }] }], '8-12', 2.5);
if (result.recommendation) {
    // @ts-expect-error Recommendation output is readonly.
    result.recommendation.weight = 90;
    // @ts-expect-error Explanation does not enter the public recommendation.
    result.recommendation.explanation;
}
