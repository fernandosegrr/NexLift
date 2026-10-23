import { afterEach, beforeEach, expect, it, vi } from 'vitest';

function session(id = 'A') {
    localStorage.setItem('nexlift_token', `x.${btoa(JSON.stringify({ userId: id }))}.x`);
    localStorage.setItem('nexlift_user', JSON.stringify({ id }));
}
beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T05:59:00Z'));
    const map = new Map();
    vi.stubGlobal('localStorage', {
        getItem: k => map.get(k) ?? null,
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        key: i => [...map.keys()][i] ?? null,
        get length() { return map.size; }
    });
    session();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('recarga recupera series sin borrar el borrador anterior', async () => {
    const { createDraftStore, readDrafts } = await import('./workoutDrafts.js');
    const first = createDraftStore('workout', 'day1', 'A');
    const data = { workoutData: { ex1: [{ weight: '80', reps: '5' }] }, completedExerciseIds: [] };
    first.save(data);
    vi.resetModules();
    const { createDraftStore: reloaded } = await import('./workoutDrafts.js');
    const second = reloaded('workout', 'day1', 'A');
    expect(second.load()).toEqual(data);
    second.save({ ...data, completedExerciseIds: ['ex1'] });
    expect(readDrafts()).toHaveLength(2);
    expect(readDrafts()[0].data).toEqual(data);
});
it('cruzar medianoche conserva el borrador original y evita cargarlo como nuevo día', async () => {
    const { createDraftStore, readDrafts } = await import('./workoutDrafts.js');
    const first = createDraftStore('workout', 'day1', 'A');
    first.save({ sets: [1] });
    vi.setSystemTime(new Date('2026-10-19T06:01:00Z'));
    first.save({ sets: [1, 2] });
    expect(readDrafts()[0]).toMatchObject({ originalDay: '2026-10-18', data: { sets: [1, 2] } });
    expect(createDraftStore('workout', 'day1', 'A').load()).toBeNull();
});
it('más de 48 horas no elimina borradores', async () => {
    const { createDraftStore, readDrafts } = await import('./workoutDrafts.js');
    createDraftStore('workout', 'day1', 'A').save({ sets: [1] });
    vi.setSystemTime(Date.now() + 72 * 3600000);
    expect(readDrafts()).toHaveLength(1);
    expect(readDrafts()[0].data).toEqual({ sets: [1] });
});
it('un usuario no carga ni sobrescribe borradores de otro', async () => {
    const { createDraftStore, readDrafts } = await import('./workoutDrafts.js');
    const first = createDraftStore('workout', 'day1', 'A');
    first.save({ sets: ['A'] });
    session('B');
    expect(createDraftStore('workout', 'day1', 'B').load()).toBeNull();
    expect(() => first.save({ sets: ['wrong account'] })).toThrow();
    createDraftStore('workout', 'day1', 'B').save({ sets: ['B'] });
    expect(readDrafts().map(draft => draft.data.sets)).toEqual([['A'], ['B']]);
});
it('dos editores conservan borradores diferentes para la misma sesión', async () => {
    const { createDraftStore, readDrafts } = await import('./workoutDrafts.js');
    const a = createDraftStore('session', 'log1', 'A');
    const b = createDraftStore('session', 'log1', 'A');
    a.save({ sets: [1] });
    b.save({ sets: [2] });
    expect(readDrafts()).toHaveLength(2);
    expect(readDrafts().map(draft => draft.data.sets)).toEqual([[1], [2]]);
});
it('los borradores workout_* legacy permanecen intactos y no se asignan', async () => {
    const { createDraftStore, readDrafts } = await import('./workoutDrafts.js');
    const raw = '{"workoutData":{"old":[1]},"timestamp":1}';
    localStorage.setItem('workout_day1', raw);
    const store = createDraftStore('workout', 'day1', 'A');
    expect(store.load()).toBeNull();
    store.save({ sets: [2] });
    expect(localStorage.getItem('workout_day1')).toBe(raw);
    expect(readDrafts()[0]).toMatchObject({ legacy: true, ownerId: null });
});
it('un fallo de almacenamiento se propaga y conserva el borrador anterior', async () => {
    const { createDraftStore, readDrafts } = await import('./workoutDrafts.js');
    const store = createDraftStore('session', 'log1', 'A');
    store.save({ sets: [1] });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => store.save({ sets: [2] })).toThrow('QuotaExceededError');
    expect(readDrafts()[0].data).toEqual({ sets: [1] });
});
it('leer y cargar borradores no notifica ni escribe', async () => {
    const { createDraftStore, readDrafts, subscribeDraftChange } = await import('./workoutDrafts.js');
    const store = createDraftStore('session', 'log1', 'A');
    store.save({ sets: [1] });
    const notify = vi.fn(() => readDrafts());
    const write = vi.spyOn(localStorage, 'setItem');
    subscribeDraftChange(notify);
    for (let i = 0; i < 100; i++) { readDrafts(); store.load(); }
    expect(notify).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
});
it('una edición de sesión histórica puede recuperarse otro día sin cambiar su fecha', async () => {
    const { createDraftStore } = await import('./workoutDrafts.js');
    const data = { session: { id: 'log1', date: '2026-09-01T18:00:00Z' }, sets: [{ weight: '80', reps: '8' }] };
    createDraftStore('session', 'log1', 'A').save(data);
    vi.setSystemTime(Date.now() + 72 * 3600000);
    expect(createDraftStore('session', 'log1', 'A').load()).toEqual(data);
});
