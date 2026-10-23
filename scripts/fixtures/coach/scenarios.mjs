export function coachScenario({ count = 10, change = () => {}, weight = () => 80, reps = () => 10 } = {}) {
    const sessions = Array.from({ length: count }, (_, i) => ({ id: `session${i}`, exerciseId: 'bench', date: new Date(Date.UTC(2026, 8, 13 + i * 4, 18)).toISOString(), name: 'Press banca', muscleGroup: 'chest', unilateral: false, routineId: 'routine', blockId: null, phase: null,
        sets: Array.from({ length: 3 }, (_, j) => ({ id: `s${i}_${j}`, weight: weight(i), reps: reps(i), rpe: 8, completed: true, weightRight: null, repsRight: null })) }));
    const input = { now: '2026-10-23T18:00:00.000Z', days: 56, sessions, exercises: [{ id: 'bench', name: 'Press banca', muscleGroup: 'chest', targetReps: '8-12', isUnilateral: false }], configs: [], checkIns: [], body: [], measurements: [], blocks: [], truncated: false };
    change(input); return input;
}
export const equipment = (increment = 2.5, availableLoads = []) => ({ exerciseId: 'bench', directMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], indirectWeight: 0.5, equipment: 'barbell', increment, availableLoads, updatedAt: '2026-01-01T00:00:00.000Z' });
