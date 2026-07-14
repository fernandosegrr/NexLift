// vitest corre estos tests en entorno 'node' (sin DOM) — el resto de la suite
// (exerciseName, smartLoading) no lo necesita, así que en vez de agregar
// jsdom/happy-dom como dependencia nueva solo para este archivo, se instala un
// stub mínimo de localStorage antes de importar el módulo bajo prueba.
import { describe, it, expect, beforeEach, vi } from 'vitest';

function makeFakeLocalStorage() {
    let store = {};
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; }
    };
}

beforeEach(() => {
    globalThis.localStorage = makeFakeLocalStorage();
    vi.resetModules(); // el módulo guarda `listeners` en un Set a nivel de módulo
});

describe('offlineQueue', () => {
    it('enqueueWrite agrega un item recuperable con getQueue', async () => {
        const { enqueueWrite, getQueue } = await import('./offlineQueue.js');
        enqueueWrite('logWorkout', { exerciseId: 'ex1', sets: [{ weight: 100, reps: 5 }] });
        const queue = getQueue();
        expect(queue.length).toBe(1);
        expect(queue[0].op).toBe('logWorkout');
        expect(queue[0].payload.exerciseId).toBe('ex1');
    });

    it('hasPendingWrite es true solo para el exerciseId encolado', async () => {
        const { enqueueWrite, hasPendingWrite } = await import('./offlineQueue.js');
        enqueueWrite('logWorkout', { exerciseId: 'ex1', sets: [] });
        expect(hasPendingWrite('ex1')).toBe(true);
        expect(hasPendingWrite('ex2')).toBe(false);
        expect(hasPendingWrite(undefined)).toBe(false);
    });

    it('removeFromQueue saca exactamente ese item', async () => {
        const { enqueueWrite, removeFromQueue, getQueue } = await import('./offlineQueue.js');
        const a = enqueueWrite('logWorkout', { exerciseId: 'ex1', sets: [] });
        const b = enqueueWrite('logWorkout', { exerciseId: 'ex2', sets: [] });
        removeFromQueue(a.id);
        const queue = getQueue();
        expect(queue.length).toBe(1);
        expect(queue[0].id).toBe(b.id);
    });

    it('getQueue poda items de más de 48h', async () => {
        const { getQueue } = await import('./offlineQueue.js');
        const old = Date.now() - 49 * 60 * 60 * 1000;
        localStorage.setItem('nexlift_offline_queue', JSON.stringify([
            { id: 'stale', op: 'logWorkout', payload: { exerciseId: 'ex1' }, timestamp: old },
            { id: 'fresh', op: 'logWorkout', payload: { exerciseId: 'ex2' }, timestamp: Date.now() }
        ]));
        const queue = getQueue();
        expect(queue.length).toBe(1);
        expect(queue[0].id).toBe('fresh');
    });

    it('REGRESIÓN: un listener que llama hasPendingWrite no causa recursión infinita', async () => {
        // Bug real encontrado en vivo (stack overflow en el navegador): getQueue()
        // notificaba listeners incluso en una simple lectura (para persistir la
        // poda de expirados) — un listener típico como el de Workout.jsx llama
        // hasPendingWrite -> getQueue de vuelta, causando un ciclo infinito.
        const { enqueueWrite, hasPendingWrite, subscribeQueueChange } = await import('./offlineQueue.js');
        subscribeQueueChange(() => hasPendingWrite('ex1'));
        expect(() => enqueueWrite('logWorkout', { exerciseId: 'ex1', sets: [] })).not.toThrow();
    });

    it('subscribeQueueChange se notifica al encolar y al borrar', async () => {
        const { enqueueWrite, removeFromQueue, subscribeQueueChange } = await import('./offlineQueue.js');
        const fn = vi.fn();
        const unsubscribe = subscribeQueueChange(fn);
        const item = enqueueWrite('logRestDay', { note: null });
        expect(fn).toHaveBeenCalledTimes(1);
        removeFromQueue(item.id);
        expect(fn).toHaveBeenCalledTimes(2);
        unsubscribe();
        enqueueWrite('logRestDay', { note: null });
        expect(fn).toHaveBeenCalledTimes(2); // ya no debe notificar tras desuscribirse
    });

    it('getQueue NO notifica listeners al solo leer (poda silenciosa)', async () => {
        const { getQueue, subscribeQueueChange } = await import('./offlineQueue.js');
        const old = Date.now() - 49 * 60 * 60 * 1000;
        localStorage.setItem('nexlift_offline_queue', JSON.stringify([
            { id: 'stale', op: 'logWorkout', payload: { exerciseId: 'ex1' }, timestamp: old }
        ]));
        const fn = vi.fn();
        subscribeQueueChange(fn);
        getQueue(); // poda stale en silencio
        expect(fn).not.toHaveBeenCalled();
    });

    it('hasPendingWrite cubre updateWorkoutSession con exerciseId en payload', async () => {
        const { enqueueWrite, hasPendingWrite } = await import('./offlineQueue.js');
        enqueueWrite('updateWorkoutSession', { logId: 'l1', sets: [], exerciseId: 'ex9' });
        expect(hasPendingWrite('ex9')).toBe(true);
        expect(hasPendingWrite('other')).toBe(false);
    });
});
