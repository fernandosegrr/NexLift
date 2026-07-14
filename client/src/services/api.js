import { enqueueWrite, getQueue, removeFromQueue } from './offlineQueue.js';

// En producción (Vercel), usa ruta relativa. En desarrollo, usa localhost
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

// Helper: Get auth headers from localStorage
function getAuthHeaders() {
    const token = localStorage.getItem('nexlift_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Helper: fetch() envuelto para distinguir fallos de red (offline, DNS, timeout)
// de respuestas HTTP normales. Un fetch() que revienta se ve igual que cualquier
// otro error en el catch del caller si no se etiqueta aquí. `isNetworkError` es
// lo que usan logWorkout/updateWorkoutSession/logRestDay (P3) para decidir si
// encolar en vez de fallar, y replayOfflineQueue() para saber si debe detenerse
// a reintentar más tarde en vez de descartar el item.
async function safeFetch(url, options = {}) {
    try {
        return await fetch(url, options);
    } catch (e) {
        const err = new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        err.isNetworkError = true;
        throw err;
    }
}

// Helper: Fetch with auth
async function authFetch(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };
    const res = await safeFetch(url, { ...options, headers });

    // Token expirado/inválido: limpiar sesión y redirigir al login
    if (res.status === 401) {
        const authPaths = ['/login', '/register', '/forgot-password'];
        if (!authPaths.includes(window.location.pathname)) {
            localStorage.removeItem('nexlift_token');
            localStorage.removeItem('nexlift_user');
            window.location.href = '/login';
        }
    }

    return res;
}

// ==========================================
// OFFLINE QUEUE (P3): escrituras "crudas" (sin cola) del registro de entreno.
// Separadas de los métodos públicos de `api.*` porque tanto ellos COMO
// replayOfflineQueue() necesitan la llamada de red real — si el replay llamara
// a `api.logWorkout` de nuevo y siguiera sin conexión, reencolaría un duplicado
// en vez de dejar intacto el item original para el siguiente intento.
// ==========================================
async function rawLogWorkout(exerciseId, sets, notes = null) {
    const res = await authFetch(`${API_URL}/workouts/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, sets, notes }),
    });
    if (!res.ok) {
        const err = new Error('Failed to log workout');
        err.status = res.status;
        throw err;
    }
    return res.json();
}

async function rawUpdateWorkoutSession(logId, sets) {
    const res = await authFetch(`${API_URL}/workouts/${logId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sets }),
    });
    if (!res.ok) {
        const err = new Error('Failed to update session');
        err.status = res.status;
        throw err;
    }
    return res.json();
}

async function rawLogRestDay(note = null) {
    const res = await authFetch(`${API_URL}/workouts/log-rest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
    });
    if (!res.ok) {
        const err = new Error('Failed to log rest day');
        err.status = res.status;
        throw err;
    }
    return res.json();
}

// ¿Ya existe un log de HOY para este ejercicio? — regla anti-duplicados del
// replay: el POST original pudo haber llegado al server aunque la RESPUESTA se
// perdiera por red (el error de red no distingue esos dos casos), así que antes
// de reintentar un logWorkout encolado hay que revisar esto primero. Mismo
// criterio que ya usa Workout.jsx para las sesiones parciales del Atajo de iOS.
// Usa GET /api/workouts/today-log (calcula "hoy" en CDMX server-side) en vez de
// mandar una fecha calculada en este navegador — un `fecha` de cliente sufre el
// mismo bug de zona horaria que este proyecto ya resolvió 3 veces en otros
// endpoints (encontrado en vivo verificando este fix: sin esto, el replay
// duplicaba el log en vez de actualizar el existente).
async function rawFindTodayLog(exerciseId) {
    const res = await authFetch(`${API_URL}/workouts/today-log?exerciseId=${encodeURIComponent(exerciseId)}`);
    if (!res.ok) {
        const err = new Error('Failed to check today log');
        err.status = res.status;
        throw err;
    }
    return res.json();
}

async function replayOne(item) {
    const { op, payload } = item;
    if (op === 'logRestDay') {
        return rawLogRestDay(payload.note);
    }
    if (op === 'updateWorkoutSession') {
        return rawUpdateWorkoutSession(payload.logId, payload.sets);
    }
    if (op === 'logWorkout') {
        const existing = await rawFindTodayLog(payload.exerciseId);
        return existing
            ? rawUpdateWorkoutSession(existing.id, payload.sets)
            : rawLogWorkout(payload.exerciseId, payload.sets, payload.notes);
    }
    throw new Error(`Operación de cola desconocida: ${op}`);
}

// Drena la cola offline en orden (FIFO). Se llama al recuperar conexión y al
// abrir la app (ver wiring al final del archivo). Nunca corre 2 réplicas a la
// vez (evento `online` y apertura casi simultáneos no deben procesar el mismo
// item dos veces).
let isReplaying = false;
export async function replayOfflineQueue({ onItemSynced, onItemFailed } = {}) {
    if (isReplaying) return;
    if (!localStorage.getItem('nexlift_token')) return; // sin sesión: nada que sincronizar todavía
    isReplaying = true;
    try {
        const queue = getQueue(); // ya poda expirados (>48h) internamente
        for (const item of queue) {
            try {
                await replayOne(item);
                removeFromQueue(item.id);
                onItemSynced?.(item);
            } catch (err) {
                // Sin red, o sesión momentáneamente inválida (401 justo al volver
                // online, antes de que el usuario reintente login): dejar el resto
                // de la cola intacto y reintentar en el próximo evento `online`.
                // Cualquier OTRO error (4xx real de validación, etc.) sí es
                // permanente — sacar de la cola para no reintentar infinito.
                if (err?.isNetworkError || err?.status === 401) break;
                removeFromQueue(item.id);
                onItemFailed?.(item, err);
            }
        }
    } finally {
        isReplaying = false;
    }
}

export const api = {
    // ==========================================
    // STATS
    // ==========================================
    async getOverviewStats() {
        const res = await authFetch(`${API_URL}/stats/overview`);
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
    },

    async getConsistency() {
        const res = await authFetch(`${API_URL}/stats/consistency`);
        if (!res.ok) throw new Error('Failed to fetch consistency');
        return res.json();
    },

    async getPersonalRecords() {
        const res = await authFetch(`${API_URL}/stats/prs`);
        if (!res.ok) throw new Error('Failed to fetch PRs');
        return res.json();
    },

    async getExerciseProgress(exerciseName) {
        const res = await authFetch(`${API_URL}/stats/progress/${encodeURIComponent(exerciseName)}`);
        if (!res.ok) throw new Error('Failed to fetch exercise progress');
        return res.json();
    },

    // ==========================================
    // ROUTINES
    // ==========================================
    async getRoutines() {
        const res = await authFetch(`${API_URL}/routines`);
        if (!res.ok) throw new Error('Failed to fetch routines');
        return res.json();
    },

    async getRoutine(id) {
        const res = await authFetch(`${API_URL}/routines/${id}`);
        if (!res.ok) throw new Error('Failed to fetch routine');
        return res.json();
    },

    async getTrashRoutine() {
        const res = await authFetch(`${API_URL}/routines/trash`);
        if (!res.ok) throw new Error('Failed to fetch trash routine');
        return res.json();
    },

    async getActiveRoutine() {
        const res = await authFetch(`${API_URL}/routines/active`);
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error('Failed to fetch active routine');
        }
        return res.json();
    },

    async createRoutine(routine) {
        const res = await authFetch(`${API_URL}/routines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
        });
        if (!res.ok) throw new Error('Failed to create routine');
        return res.json();
    },

    async importRoutine(routine) {
        const res = await authFetch(`${API_URL}/routines/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
        });
        if (!res.ok) throw new Error('Failed to import routine');
        return res.json();
    },

    async updateRoutine(id, routine) {
        const res = await authFetch(`${API_URL}/routines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
        });
        if (!res.ok) throw new Error('Failed to update routine');
        return res.json();
    },

    async deleteRoutine(id) {
        const res = await authFetch(`${API_URL}/routines/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete routine');
        return res.json();
    },

    async activateRoutine(id) {
        const res = await authFetch(`${API_URL}/routines/${id}/activate`, {
            method: 'PUT',
        });
        if (!res.ok) throw new Error('Failed to activate routine');
        return res.json();
    },

    async createRoutineBlock(routineId, block) {
        const res = await authFetch(`${API_URL}/routines/${routineId}/blocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(block),
        });
        if (!res.ok) throw new Error('Failed to create routine block');
        return res.json();
    },

    async updateRoutineBlock(routineId, blockId, block) {
        const res = await authFetch(`${API_URL}/routines/${routineId}/blocks/${blockId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(block),
        });
        if (!res.ok) throw new Error('Failed to update routine block');
        return res.json();
    },

    async deleteRoutineBlock(routineId, blockId) {
        const res = await authFetch(`${API_URL}/routines/${routineId}/blocks/${blockId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete routine block');
        return res.json();
    },

    async startRoutineBlock(routineId, blockId) {
        const res = await authFetch(`${API_URL}/routines/${routineId}/blocks/${blockId}/start`, {
            method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to start routine block');
        return res.json();
    },

    // ==========================================
    // RUTINA DIARIA CON IA
    // ==========================================
    async setupAiRoutine(profile) {
        const res = await authFetch(`${API_URL}/ai-routine/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to set up AI routine');
        return data;
    },

    // null si no hay perfil configurado o ninguna rutina IA activa (404) — el
    // caller (Dashboard.jsx) lo trata igual que "sin rutina activa".
    async getAiRoutineToday() {
        const res = await authFetch(`${API_URL}/ai-routine/today`);
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error('Failed to fetch AI routine today');
        }
        return res.json();
    },

    // "No me gusta este día, cambia los ejercicios" — solo aplica al día de HOY;
    // cualquier ejercicio con una serie ya registrada hoy se preserva tal cual.
    async reshuffleAiRoutineDay(routineDayId) {
        const res = await authFetch(`${API_URL}/ai-routine/reshuffle/${routineDayId}`, {
            method: 'POST',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to reshuffle day');
        return data;
    },

    // ==========================================
    // WORKOUTS
    // ==========================================
    async logWorkout(exerciseId, sets, notes = null) {
        try {
            return await rawLogWorkout(exerciseId, sets, notes);
        } catch (err) {
            if (!err?.isNetworkError) throw err;
            // Sin red: encolar para sincronizar después (P3) en vez de perder el
            // registro — nunca fingir que se guardó en el server (el caller debe
            // chequear `queued` para avisarle al usuario, no mostrar "¡Guardado!").
            enqueueWrite('logWorkout', { exerciseId, sets, notes });
            return { queued: true };
        }
    },

    async scheduleRestReminder(exerciseId, nextExerciseName = null) {
        const res = await authFetch(`${API_URL}/workouts/rest-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exerciseId, nextExerciseName }),
        });
        if (!res.ok) throw new Error('Failed to schedule rest reminder');
        return res.json();
    },

    // Instrumentación de calibración del entrenador inteligente (P5) — llamar
    // fire-and-forget (`.catch(() => {})`) al tocar la insignia "SUGERIDO", nunca
    // bloqueando el flujo de guardado si esto falla.
    async logSuggestionApplied(exerciseId, suggestedWeight, suggestedReps, phase = null) {
        const res = await authFetch(`${API_URL}/suggestions/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exerciseId, suggestedWeight, suggestedReps, phase }),
        });
        if (!res.ok) throw new Error('Failed to log suggestion');
        return res.json();
    },

    async logRestDay(note = null) {
        try {
            return await rawLogRestDay(note);
        } catch (err) {
            if (!err?.isNetworkError) throw err;
            enqueueWrite('logRestDay', { note });
            return { queued: true };
        }
    },

    async getWorkoutHistory(limit = 30, filters = {}) {
        const params = new URLSearchParams({ limit: String(limit) });
        if (filters.search) params.set('search', filters.search);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        if (filters.dayOfWeek !== undefined && filters.dayOfWeek !== '') params.set('dayOfWeek', String(filters.dayOfWeek));
        if (filters.offset) params.set('offset', String(filters.offset));
        const res = await authFetch(`${API_URL}/workouts/history?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch workout history');
        return res.json();
    },

    async getExerciseHistory(exerciseId) {
        const res = await authFetch(`${API_URL}/workouts/exercise/${exerciseId}/history`);
        if (!res.ok) throw new Error('Failed to fetch exercise history');
        return res.json();
    },

    async getWorkoutSession(logId) {
        const res = await authFetch(`${API_URL}/workouts/${logId}`);
        if (!res.ok) throw new Error('Failed to fetch session');
        return res.json();
    },

    // exerciseId es opcional: solo se usa para que el badge de "pendiente de
    // sincronizar" (Workout.jsx, vía hasPendingWrite) sepa a qué ejercicio
    // corresponde este log si termina encolado — el PUT en sí solo necesita logId.
    async updateWorkoutSession(logId, sets, exerciseId = null) {
        try {
            return await rawUpdateWorkoutSession(logId, sets);
        } catch (err) {
            if (!err?.isNetworkError) throw err;
            enqueueWrite('updateWorkoutSession', { logId, sets, exerciseId });
            return { queued: true };
        }
    },

    async deleteWorkoutSession(logId) {
        const res = await authFetch(`${API_URL}/workouts/${logId}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || 'No se pudo eliminar la sesión');
        }
        return res.json();
    },

    // ==========================================
    // EXERCISES
    // ==========================================
    async getExercises() {
        const res = await authFetch(`${API_URL}/exercises`);
        if (!res.ok) throw new Error('Failed to fetch exercises');
        return res.json();
    },

    async updateExerciseMuscle(exerciseId, muscleGroup) {
        const res = await authFetch(`${API_URL}/exercises/${exerciseId}/muscle`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ muscleGroup }),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || 'No se pudo actualizar el grupo muscular');
        }
        return res.json();
    },

    // ==========================================
    // SYSTEM
    // ==========================================
    async checkServer() {
        try {
            const res = await fetch(`${API_URL}/health`);
            return res.ok;
        } catch (e) {
            return false;
        }
    },

    // ==========================================
    // BODY TRACKING
    // ==========================================
    async getBodyLogs(limit = 90) {
        const res = await authFetch(`${API_URL}/body/logs?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch body logs');
        return res.json();
    },

    async getBodyPhotos() {
        // Endpoint dedicado (solo filas con photoUrl), más ligero que filtrar /logs
        const res = await authFetch(`${API_URL}/body/photos`);
        if (!res.ok) throw new Error('Failed to fetch photos');
        return res.json();
    },

    async getLatestWeight() {
        const res = await authFetch(`${API_URL}/body/logs?limit=1`);
        if (!res.ok) throw new Error('Failed to fetch latest weight');
        const logs = await res.json();
        return logs.find(log => log.weight) || null;
    },

    async logBodyData(data) {
        const res = await authFetch(`${API_URL}/body/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to save body data');
        return result;
    },

    // ==========================================
    // AUTH
    // ==========================================

    async login(username, password) {
        const res = await safeFetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
        return data;
    },

    async register(userData) {
        const res = await safeFetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Error al crear la cuenta');
        return data;
    },

    async getProfile(token) {
        const res = await safeFetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
            // Adjuntar el status para distinguir errores de auth (401) de errores de red
            const err = new Error('Failed to fetch profile');
            err.status = res.status;
            throw err;
        }
        return res.json();
    },

    async updateProfile(token, data) {
        const res = await safeFetch(`${API_URL}/auth/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || 'No se pudo actualizar el perfil');
        }
        return res.json();
    },

    async updateAvatar(avatarBase64) {
        const res = await authFetch(`${API_URL}/auth/avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatar: avatarBase64 }),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || 'No se pudo subir la foto');
        }
        return res.json();
    },

    async changePassword(token, currentPassword, newPassword) {
        const res = await safeFetch(`${API_URL}/auth/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña');
        return data;
    },

    async getSecurityQuestion(username) {
        const res = await safeFetch(`${API_URL}/auth/recover/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Usuario no encontrado o sin pregunta de seguridad');
        return data;
    },

    async recoverPassword(username, answer, newPassword) {
        const res = await safeFetch(`${API_URL}/auth/recover/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, answer, newPassword }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo restablecer la contraseña');
        return data;
    },

    async updateSecurityQuestion(token, question, answer, currentPassword) {
        const res = await safeFetch(`${API_URL}/auth/security-question`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ question, answer, currentPassword }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la pregunta de seguridad');
        return data;
    },

    // ==========================================
    // GOALS
    // ==========================================

    async getGoals() {
        const res = await authFetch(`${API_URL}/goals`);
        if (!res.ok) throw new Error('Failed to fetch goals');
        return res.json();
    },

    async createGoal(goalData) {
        const res = await authFetch(`${API_URL}/goals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(goalData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create goal');
        return data;
    },

    async deleteGoal(goalId) {
        const res = await authFetch(`${API_URL}/goals/${goalId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete goal');
        return res.json();
    },

    async fixWeights(exerciseName, oldWeight, newWeight) {
        const res = await authFetch(`${API_URL}/workouts/fix-weights`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exerciseName, oldWeight, newWeight }),
        });
        if (!res.ok) throw new Error('Failed to fix weights');
        return res.json();
    },

    async updateGoalWeek(goalId, weekNumber, completed) {
        const res = await authFetch(`${API_URL}/goals/${goalId}/weeks`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weekNumber, completed }),
        });
        if (!res.ok) throw new Error('Failed to update goal week');
        return res.json();
    },

    // ==========================================
    // PUSH NOTIFICATIONS
    // ==========================================

    async getVapidPublicKey() {
        const res = await authFetch(`${API_URL}/push/vapid-public-key`);
        if (!res.ok) throw new Error('Failed to fetch VAPID public key');
        return res.json();
    },

    async subscribeToPush(subscription) {
        const res = await authFetch(`${API_URL}/push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription),
        });
        if (!res.ok) throw new Error('Failed to subscribe to push');
        return res.json();
    },

    async unsubscribeFromPush(endpoint) {
        const res = await authFetch(`${API_URL}/push/subscribe`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
        });
        if (!res.ok) throw new Error('Failed to unsubscribe from push');
        return res.json();
    }
};

// Wiring de la cola offline (P3): drena lo pendiente al recuperar conexión Y al
// abrir la app. `api.js` se importa una sola vez por carga de página (módulo ES
// singleton), así que este código de nivel de módulo cubre ambos disparadores
// del plan con un solo punto de entrada — no hace falta llamarlo desde App.jsx.
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { replayOfflineQueue(); });
    replayOfflineQueue();
}
