import { readBackendSource } from '../../../scripts/lib/backend-source.mjs';
// Mount the actual inline production handlers without importing index.js:
// importing the entrypoint would load .env and start unrelated background jobs.
import { withWorkoutTransaction, lockRoutineWorkoutGraph, WorkoutRequestError } from '../../src/services/workoutTransaction.js';
import { getRecycleBinDay } from '../../src/routes/updateRoutine.js';
import { normalizeImportedExercise } from '../../src/services/routineImportContract.js';
import { mexicoCityDateStr, mexicoCityDayBounds } from '../../src/logic.js';
import { pickReplacementExercises } from '../../src/data/splitTemplates.js';
import { EXERCISE_CATALOG } from '../../src/data/exerciseCatalog.js';
import { hasRetainedExerciseData } from '../../src/services/historyPersistence.js';

export async function mountGraphRoutes(app, getClient) {
    const source = await readBackendSource();
    const blocks = ["app.delete('/api/routines/:id', authMiddleware, async", "app.post('/api/ai-routine/reshuffle/:routineDayId', authMiddleware, async"]
        .map(prefix => {
            const begin = source.indexOf(prefix), end = source.indexOf('\n});', begin);
            if (begin < 0 || end < 0) throw Error('Production graph handler not found');
            return source.slice(begin, end + '\n});'.length);
        });
    // This source is trusted repository code, never request-supplied text.
    const mount = new Function('app', 'prisma', 'authMiddleware', 'withWorkoutTransaction', 'lockRoutineWorkoutGraph',
        'WorkoutRequestError', 'getRecycleBinDay', 'normalizeImportedExercise', 'mexicoCityDateStr', 'mexicoCityDayBounds',
        'pickReplacementExercises', 'EXERCISE_CATALOG', 'console', 'hasRetainedExerciseData', blocks.join('\n'));
    const client = new Proxy({}, { get: (_, key) => getClient()[key] });
    mount(app, client, (req, res, next) => next(), withWorkoutTransaction, lockRoutineWorkoutGraph, WorkoutRequestError,
        getRecycleBinDay, normalizeImportedExercise, mexicoCityDateStr, mexicoCityDayBounds, pickReplacementExercises,
        EXERCISE_CATALOG, { error: () => {} }, hasRetainedExerciseData);
}
