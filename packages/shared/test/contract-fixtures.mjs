export const id = '12345678-1234-4000-8000-123456789abc';
export const version = 'a'.repeat(64);
export const at = '2026-10-19T05:59:59.999Z';
export const set = { weight: 80, reps: 8, rpe: 8, completed: true, weightRight: null, repsRight: null };
export function receipt(kind = 'workout.create') {
    return { protocolVersion: 1, ownerId: 'A', requestHash: version, replayed: false,
        operation: { operationId: id, kind, source: 'pwa', state: 'confirmed', performedAt: at, performedDay: '2026-10-18' },
        result: kind === 'workout.delete' ? { deleted: true, logId: 'log' }
            : kind === 'rest.create' ? { restLog: { id: 'rest', userId: 'A', date: at, note: 'Día de descanso' } }
                : { sessionVersion: version, workoutLog: { id: 'log', exerciseId: 'exercise', date: at, notes: null,
                    sets: [{ ...set, id: 's', setNumber: 1, workoutLogId: 'log' }] } } };
}
