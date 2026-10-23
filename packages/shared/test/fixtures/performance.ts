import { rirToStoredRpe, storedRpeToRir, formRirToStoredRpe, selectHistoricalPersonalRecord, personalRecordEpley1RM } from '../../src/index.js';
// Negative compiler fixtures; runtime JSON has separate validation tests.
// @ts-expect-error Unlabelled number cannot identify an effort context.
rirToStoredRpe(2);
// @ts-expect-error Stored effort cannot masquerade as user-declared RIR.
rirToStoredRpe({ kind: 'stored-rpe', value: 8 });
// @ts-expect-error A declared RIR is not a stored RPE.
storedRpeToRir({ kind: 'user-rir', value: 2 });
// @ts-expect-error Forms must be parsed before entering this typed adapter.
formRirToStoredRpe('2');
// @ts-expect-error A session needs its original opaque date value.
selectHistoricalPersonalRecord([{ sets: [{ weight: 80, reps: 10 }] }]);
// @ts-expect-error The PR formula accepts coerced numeric work only.
personalRecordEpley1RM('80', 10);
const result = selectHistoricalPersonalRecord([{ date: 'original', sets: [{ weight: 80, reps: 10 }] }]);
// @ts-expect-error Consumers must not mutate a derived performance record.
if (result) result.weight = 90;
// @ts-expect-error Counts and opaque dates cannot be interchanged.
const count: number = result?.date;
void count;
