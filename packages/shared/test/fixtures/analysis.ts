import { trainingLoadVolume, routinePhaseStatusAt, groupTrainingHistory, detectPlateau, trainingCivilDayBounds, linearRegression } from '../../src/index.js';
trainingLoadVolume([{weight: 80, reps: 10}], 'recorded-sides');
// @ts-expect-error Policies must be explicit.
trainingLoadVolume([], 'universal');
// @ts-expect-error A clock is required at the pure boundary.
routinePhaseStatusAt({blocks: []});
// @ts-expect-error Instants are not stored as unlabelled epoch numbers in blocks.
routinePhaseStatusAt({blocks: [{phase: 'deload', startedAt: 100}]}, new Date(0));
// @ts-expect-error Grouping requires an explicit calendar adapter.
groupTrainingHistory([]);
// @ts-expect-error No mutation of session inputs.
const mutate = (sessions: readonly {best1RM: number}[]): void => { sessions.push({best1RM: 1}); };
// @ts-expect-error Metrics are numeric observations.
detectPlateau([{best1RM: '100'}]);
// @ts-expect-error A civil date is not an opaque object.
trainingCivilDayBounds({date: '2026-01-01'});
// @ts-expect-error Regression requires paired numeric observations.
linearRegression([{x: 1, y: '2'}]);
void mutate;
