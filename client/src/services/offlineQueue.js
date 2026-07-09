// Cola de sincronización offline (P3 del plan de mejoras) — SOLO almacenamiento
// en localStorage + pub/sub para que la UI reaccione. Deliberadamente sin
// dependencia de api.js (que sí importa este módulo): api.js necesita encolar Y
// reintentar con las funciones de red reales, así que si este archivo importara
// api.js de vuelta se formaría un ciclo. La lógica de red/reintento vive en
// api.js (replayOfflineQueue) — aquí solo se guarda/lee/borra la cola.
const QUEUE_KEY = 'nexlift_offline_queue';
const EXPIRY_MS = 48 * 60 * 60 * 1000; // datos de hace >48h probablemente ya se registraron por otra vía

function readQueue() {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

// Persiste sin notificar — usado por getQueue() para guardar la poda de
// expirados sin disparar los listeners (ver por qué en getQueue).
function writeQueueSilent(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function writeQueue(queue) {
    writeQueueSilent(queue);
    listeners.forEach(fn => fn(queue));
}

function pruneExpired(queue) {
    const now = Date.now();
    return queue.filter(item => now - item.timestamp < EXPIRY_MS);
}

// op: 'logWorkout' | 'updateWorkoutSession' | 'logRestDay'
// payload: datos suficientes para reintentar la escritura (ver replayOfflineQueue en api.js)
export function enqueueWrite(op, payload) {
    const queue = pruneExpired(readQueue());
    const item = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        op,
        payload,
        timestamp: Date.now()
    };
    queue.push(item);
    writeQueue(queue);
    return item;
}

// Bug real encontrado en vivo (stack overflow confirmado en el navegador): esta
// función es la que Workout.jsx llama indirectamente (vía hasPendingWrite) desde
// DENTRO de un callback suscrito con subscribeQueueChange. Si getQueue llamara a
// writeQueue (que notifica listeners) en cada lectura, cualquier suscriptor que a
// su vez leyera la cola (el caso normal) disparaba el ciclo: leer -> notificar ->
// leer -> notificar... hasta reventar el stack. Por eso la poda se persiste
// SILENCIOSA — un simple `get` nunca debe notificar, solo las mutaciones reales
// (enqueueWrite/removeFromQueue) lo hacen.
export function getQueue() {
    const raw = readQueue();
    const pruned = pruneExpired(raw);
    if (pruned.length !== raw.length) writeQueueSilent(pruned);
    return pruned;
}

export function removeFromQueue(id) {
    writeQueue(readQueue().filter(item => item.id !== id));
}

// ¿Hay algo pendiente de sincronizar para este ejercicio? — usado por Workout.jsx
// para mostrar el badge "pendiente de sincronizar" en la tarjeta afectada.
export function hasPendingWrite(exerciseId) {
    if (!exerciseId) return false;
    return getQueue().some(item => item.payload?.exerciseId === exerciseId);
}

// Suscripción simple (sin poll) para que los componentes se re-rendericen cuando
// la cola cambia (se encola algo nuevo, o el replay la vacía).
const listeners = new Set();
export function subscribeQueueChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
