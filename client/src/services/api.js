// En producción (Vercel), usa ruta relativa. En desarrollo, usa localhost
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

// Helper: Get auth headers from localStorage
function getAuthHeaders() {
    const token = localStorage.getItem('nexlift_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Helper: fetch() envuelto para distinguir fallos de red (offline, DNS, timeout)
// de respuestas HTTP normales. Un fetch() que revienta se ve igual que cualquier
// otro error en el catch del caller si no se etiqueta aquí.
async function safeFetch(url, options = {}) {
    try {
        return await fetch(url, options);
    } catch (e) {
        throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
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
    // WORKOUTS
    // ==========================================
    async logWorkout(exerciseId, sets, notes = null) {
        const res = await authFetch(`${API_URL}/workouts/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exerciseId, sets, notes }),
        });
        if (!res.ok) throw new Error('Failed to log workout');
        return res.json();
    },

    async scheduleRestReminder(exerciseId) {
        const res = await authFetch(`${API_URL}/workouts/rest-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exerciseId }),
        });
        if (!res.ok) throw new Error('Failed to schedule rest reminder');
        return res.json();
    },

    async logRestDay(note = null) {
        const res = await authFetch(`${API_URL}/workouts/log-rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note }),
        });
        if (!res.ok) throw new Error('Failed to log rest day');
        return res.json();
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

    async updateWorkoutSession(logId, sets) {
        const res = await authFetch(`${API_URL}/workouts/${logId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sets }),
        });
        if (!res.ok) throw new Error('Failed to update session');
        return res.json();
    },

    async deleteWorkoutSession(logId) {
        const res = await authFetch(`${API_URL}/workouts/${logId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete session');
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
        if (!res.ok) throw new Error('Failed to update muscle group');
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
        const res = await authFetch(`${API_URL}/body/logs?limit=100`);
        if (!res.ok) throw new Error('Failed to fetch photos');
        const logs = await res.json();
        return logs.filter(log => log.photo);
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        return data;
    },

    async register(userData) {
        const res = await safeFetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
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
        if (!res.ok) throw new Error('Failed to update profile');
        return res.json();
    },

    async updateAvatar(avatarBase64) {
        const res = await authFetch(`${API_URL}/auth/avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatar: avatarBase64 }),
        });
        if (!res.ok) throw new Error('Failed to upload avatar');
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
        if (!res.ok) throw new Error(data.error || 'Failed to change password');
        return data;
    },

    async getSecurityQuestion(username) {
        const res = await safeFetch(`${API_URL}/auth/recover/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'User not found');
        return data;
    },

    async recoverPassword(username, answer, newPassword) {
        const res = await safeFetch(`${API_URL}/auth/recover/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, answer, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Recovery failed');
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update security question');
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
