// En producción (Vercel), usa ruta relativa. En desarrollo, usa localhost
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

// Helper: Get auth headers from localStorage
function getAuthHeaders() {
    const token = localStorage.getItem('nexlift_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Helper: Fetch with auth
async function authFetch(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
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

    async logRestDay(note = null) {
        const res = await authFetch(`${API_URL}/workouts/log-rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note }),
        });
        if (!res.ok) throw new Error('Failed to log rest day');
        return res.json();
    },

    async getWorkoutHistory(limit = 30) {
        const res = await authFetch(`${API_URL}/workouts/history?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch workout history');
        return res.json();
    },

    async getExerciseHistory(exerciseId) {
        const res = await authFetch(`${API_URL}/workouts/exercise/${exerciseId}/history`);
        if (!res.ok) throw new Error('Failed to fetch exercise history');
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
        if (!res.ok) throw new Error('Failed to save body data');
        return res.json();
    },

    // ==========================================
    // AUTH
    // ==========================================

    async login(username, password) {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        return data;
    },

    async register(userData) {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        return data;
    },

    async getProfile(token) {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch profile');
        return res.json();
    },

    async updateProfile(token, data) {
        const res = await fetch(`${API_URL}/auth/profile`, {
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

    async changePassword(token, currentPassword, newPassword) {
        const res = await fetch(`${API_URL}/auth/password`, {
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
        const res = await fetch(`${API_URL}/auth/recover/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'User not found');
        return data;
    },

    async recoverPassword(username, answer, newPassword) {
        const res = await fetch(`${API_URL}/auth/recover/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, answer, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Recovery failed');
        return data;
    },

    async updateSecurityQuestion(token, question, answer) {
        const res = await fetch(`${API_URL}/auth/security-question`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ question, answer }),
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
        if (!res.ok) throw new Error('Failed to create goal');
        return res.json();
    },

    async deleteGoal(goalId) {
        const res = await authFetch(`${API_URL}/goals/${goalId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete goal');
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
    }
};
