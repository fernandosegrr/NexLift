import { decodeRoutineImportResponse } from '../generated/routineResponse.js';
import { readSessionResponse } from '../generated/contracts.js';
import { submitWorkoutWrite, replayQueue } from './offlineSync.js';
import { getOperationRuntime, operationsEnabled } from './operationRuntime.js';
import { conflictResolutionEnabled } from '../storage/runtime.js';
import { changesFromEditor } from './sessionChanges.js';

// En producción (Vercel), usa ruta relativa. En desarrollo, usa localhost
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');
let activeRestRequest;
function storedOwner() { try { return JSON.parse(localStorage.getItem('nexlift_user') || 'null')?.id; } catch { return null; } }

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
    const authorization = typeof options.headers?.get === 'function' ? options.headers.get('authorization')
        : options.headers?.Authorization || options.headers?.authorization;
    const startedToken = globalThis.localStorage?.getItem('nexlift_token');
    const changed = () => Object.assign(new Error('La sesión cambió durante la solicitud.'), { code: 'SESSION_CHANGED' });
    if (authorization && startedToken && authorization !== `Bearer ${startedToken}`) throw changed();
    let response;
    try {
        response = await fetch(url, options);
    } catch (e) {
        const err = new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        err.isNetworkError = true;
        throw err;
    }
    const currentToken = globalThis.localStorage?.getItem('nexlift_token');
    if (authorization && (startedToken || currentToken) && authorization !== (currentToken ? `Bearer ${currentToken}` : undefined)) throw changed();
    return response;
}

// Helper: Fetch with auth
async function authFetch(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };
    const res = await safeFetch(url, { ...options, headers, cache: 'no-store' });
    if (headers.Authorization && headers.Authorization !== getAuthHeaders().Authorization) {
        throw Object.assign(new Error('La sesión cambió durante la solicitud.'), { code: 'SESSION_CHANGED' });
    }

    // Token expirado/inválido: limpiar sesión y redirigir al login
    if (res.status === 401 && headers.Authorization === getAuthHeaders().Authorization) {
        const authPaths = ['/login', '/register', '/forgot-password'];
        if (!authPaths.includes(window.location.pathname)) {
            localStorage.removeItem('nexlift_token');
            localStorage.removeItem('nexlift_user');
            window.location.href = '/login';
        }
    }

    if (!res.ok && (!options.method || options.method === 'GET') && res.status !== 404) {
        throw Object.assign(new Error(`HTTP ${res.status}: no se pudo consultar.`), { status: res.status, retryAfter: res.headers.get('Retry-After') });
    }
    if (res.ok && options.method && !['GET', 'HEAD'].includes(options.method) && headers.Authorization === getAuthHeaders().Authorization) {
        globalThis.window?.dispatchEvent?.(new Event('nexlift-remote-commit'));
    }
    return res;
}

// Queue replay never repeats ambiguous mutations on the current API.
export function replayOfflineQueue(options) {
    return operationsEnabled ? getOperationRuntime(API_URL).run(options) : replayQueue(API_URL, options);
}
export const operationRuntime = () => getOperationRuntime(API_URL);
export { operationsEnabled };

export const api = {
    async coach(path = '/report', body, method = 'GET') {
        const startedAuthorization = getAuthHeaders().Authorization;
        if (globalThis.navigator?.onLine === false) throw new Error('Sin conexión: Coach necesita conexión. No se confirmó ni se encoló ningún guardado.');
        const res = await authFetch(`${API_URL}/coach${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
        const result = await res.json();
        if (startedAuthorization !== getAuthHeaders().Authorization) throw new Error('La sesión cambió durante la consulta de Coach.');
        if (!res.ok) throw new Error(result.error || 'Coach no disponible. No se confirmó ningún guardado.');
        return result;
    },
    // ==========================================
    // STATS
    // ==========================================
    async getOverviewStats() {
        const res = await authFetch(`${API_URL}/stats/overview`);
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
    },

    /** Plateau calculado en servidor (últimas 10 sesiones/ejercicio). */
    async getPlateaus() {
        const res = await authFetch(`${API_URL}/stats/plateaus`);
        if (!res.ok) throw new Error('Failed to fetch plateaus');
        return res.json();
    },

    /** Bundle de Progreso: 1 round-trip (stats + constancia + PRs + plateau + ejercicios). */
    async getProgressBundle() {
        const res = await authFetch(`${API_URL}/stats/progress-page`);
        if (!res.ok) throw new Error('Failed to fetch progress');
        return res.json();
    },

    /** Bundle del Dashboard: 1 round-trip (stats + constancia + PRs + plateau + rutina). */
    async getHome() {
        const res = await authFetch(`${API_URL}/stats/home`);
        if (!res.ok) throw new Error('Failed to fetch home');
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
        if (!res.ok) throw Object.assign(new Error('Failed to fetch routines'), { status: res.status });
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
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to import routine');
        }
        return decodeRoutineImportResponse(res);
    },

    async updateRoutine(id, routine) {
        const res = await authFetch(`${API_URL}/routines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to update routine');
        }
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
    async logWorkout(exerciseId, sets, notes = null, context) {
        if (operationsEnabled) return operationRuntime().capture('workout.create', { exerciseId, sets, notes }, context);
        return submitWorkoutWrite(API_URL, 'logWorkout', { exerciseId, sets, notes }, context);
    },

    async scheduleRestReminder(exerciseId, nextExerciseName = null) {
        const session = { token: localStorage.getItem('nexlift_token'), ownerId: storedOwner() };
        const pending = authFetch(`${API_URL}/workouts/rest-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) },
            body: JSON.stringify({ exerciseId, nextExerciseName }),
        }).then(res => {
            if (!res.ok) throw Object.assign(new Error('Failed to schedule rest reminder'), { status: res.status });
            return res.json();
        });
        activeRestRequest = { ...session, pending };
        return pending;
    },

    async cancelRestReminder() {
        const active = activeRestRequest;
        activeRestRequest = null;
        const sameOwner = () => active && localStorage.getItem('nexlift_token') && (localStorage.getItem('nexlift_token') === active.token || (active.ownerId && storedOwner() === active.ownerId));
        if (!active || !sameOwner()) return;
        const scheduled = await active.pending;
        if (!sameOwner()) return;
        const reminder = scheduled?.reminder;
        if (typeof reminder?.id !== 'string' || typeof reminder?.fireAt !== 'string') return;
        const response = await authFetch(`${API_URL}/workouts/rest-reminder`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reminderId: reminder.id, fireAt: reminder.fireAt }) });
        if (!response.ok) throw Object.assign(new Error('No se pudo cancelar el aviso remoto'), { status: response.status });
        return response.json();
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

    async logRestDay(note = null, context) {
        if (operationsEnabled) return operationRuntime().capture('rest.create', note === null ? {} : { note }, context);
        return submitWorkoutWrite(API_URL, 'logRestDay', { note }, context);
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
        if (operationsEnabled) {
            const runtime = operationRuntime(), session = runtime.transport.snapshot();
            const { body } = await runtime.transport.request(session, `/v1/workout-sessions/${encodeURIComponent(logId)}`);
            readSessionResponse(body);
            return { ...body.workoutLog, sessionVersion: body.sessionVersion };
        }
        const res = await authFetch(`${API_URL}/workouts/${logId}`);
        if (!res.ok) throw new Error('Failed to fetch session');
        return res.json();
    },

    async updateWorkoutSession(logId, sets, exerciseId = null, context) {
        if (conflictResolutionEnabled && context?.baseSnapshot) {
            const changes = changesFromEditor(context.baseSnapshot.workoutLog, sets);
            if (context.notes !== undefined && context.notes !== (context.baseSnapshot.workoutLog.notes ?? null)) changes.session = { notes: context.notes };
            if (!Object.keys(changes).length) return { unchanged: true };
            return operationRuntime().capture('workout.replaceSets', { logId, changes, expectedVersion: context.expectedVersion }, context);
        }
        if (operationsEnabled) return operationRuntime().capture('workout.replaceSets', { logId, sets, expectedVersion: context?.expectedVersion }, context);
        return submitWorkoutWrite(API_URL, 'updateWorkoutSession', { logId, sets, exerciseId }, context);
    },

    async deleteWorkoutSession(logId, context) {
        if (operationsEnabled) return operationRuntime().capture('workout.delete', { logId, expectedVersion: context?.expectedVersion }, context);
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

    async getDailyCheckin(date = null) {
        const qs = date ? `?date=${encodeURIComponent(date)}` : '';
        const res = await authFetch(`${API_URL}/body/checkin${qs}`);
        if (!res.ok) throw new Error('Failed to fetch daily check-in');
        return res.json();
    },

    async updateDailyCheckin(habits) {
        const res = await authFetch(`${API_URL}/body/checkin`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(habits),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Failed to update daily check-in');
        return result;
    },

    async exportBackup() {
        const res = await authFetch(`${API_URL}/backup/export`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error exportando respaldo');
        return result;
    },

    async importBackup(backupData, options = {}) {
        const res = await authFetch(`${API_URL}/backup/import?${new URLSearchParams(options)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backupData),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Failed to import backup');
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
            cache: 'no-store',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
            // Adjuntar el status para distinguir errores de auth (401) de errores de red
            const err = new Error('Failed to fetch profile');
            err.status = res.status;
            throw err;
        }
        const profile = await res.json();
        if (operationsEnabled) await operationRuntime().transport.remember(profile, token);
        return profile;
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

    async getVapidPublicKey(token) {
        const res = await authFetch(`${API_URL}/push/vapid-public-key`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error('Failed to fetch VAPID public key');
        return res.json();
    },

    async subscribeToPush(subscription, token) {
        const res = await authFetch(`${API_URL}/push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(subscription),
        });
        if (!res.ok) throw new Error('Failed to subscribe to push');
        return res.json();
    },

    async unsubscribeFromPush(endpoint, token) {
        const res = await authFetch(`${API_URL}/push/subscribe`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ endpoint }),
        });
        if (!res.ok) throw new Error('Failed to unsubscribe from push');
        return res.json();
    },

    async updateCreatineReminder({ enabled, time }) {
        const res = await authFetch(`${API_URL}/push/creatine-reminder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, time }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo guardar el recordatorio de creatina');
        return data;
    },

    async testCreatinePush() {
        const res = await authFetch(`${API_URL}/push/test-creatine`, {
            method: 'POST',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo enviar la notificación de prueba');
        return data;
    }
};

// Wiring de la cola offline (P3): drena lo pendiente al recuperar conexión Y al
// abrir la app. `api.js` se importa una sola vez por carga de página (módulo ES
// singleton), así que este código de nivel de módulo cubre ambos disparadores
// del plan con un solo punto de entrada — no hace falta llamarlo desde App.jsx.
if (typeof window !== 'undefined') {
    if (operationsEnabled) operationRuntime().start();
    window.addEventListener('online', () => { void replayOfflineQueue().catch(() => {}); });
    // No competir con el primer paint: drenar la cola cuando el browser esté idle
    const kickReplay = () => { void replayOfflineQueue().catch(() => {}); };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(kickReplay, { timeout: 2500 });
    } else {
        setTimeout(kickReplay, 400);
    }
}
