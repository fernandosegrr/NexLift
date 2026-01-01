// En producción (Vercel), usa ruta relativa. En desarrollo, usa localhost
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

export const api = {
    // ==========================================
    // STATS
    // ==========================================
    async getOverviewStats() {
        const res = await fetch(`${API_URL}/stats/overview`);
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
    },

    async getConsistency() {
        const res = await fetch(`${API_URL}/stats/consistency`);
        if (!res.ok) throw new Error('Failed to fetch consistency');
        return res.json();
    },

    async getPersonalRecords() {
        const res = await fetch(`${API_URL}/stats/prs`);
        if (!res.ok) throw new Error('Failed to fetch PRs');
        return res.json();
    },

    async getExerciseProgress(exerciseName) {
        const res = await fetch(`${API_URL}/stats/progress/${encodeURIComponent(exerciseName)}`);
        if (!res.ok) throw new Error('Failed to fetch exercise progress');
        return res.json();
    },

    // ==========================================
    // ROUTINES
    // ==========================================
    async getRoutines() {
        const res = await fetch(`${API_URL}/routines`);
        if (!res.ok) throw new Error('Failed to fetch routines');
        return res.json();
    },

    async getRoutine(id) {
        const res = await fetch(`${API_URL}/routines/${id}`);
        if (!res.ok) throw new Error('Failed to fetch routine');
        return res.json();
    },

    async getActiveRoutine() {
        const res = await fetch(`${API_URL}/routines/active`);
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error('Failed to fetch active routine');
        }
        return res.json();
    },

    async createRoutine(routine) {
        const res = await fetch(`${API_URL}/routines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
        });
        if (!res.ok) throw new Error('Failed to create routine');
        return res.json();
    },

    async importRoutine(routine) {
        const res = await fetch(`${API_URL}/routines/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
        });
        if (!res.ok) throw new Error('Failed to import routine');
        return res.json();
    },

    async updateRoutine(id, routine) {
        const res = await fetch(`${API_URL}/routines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
        });
        if (!res.ok) throw new Error('Failed to update routine');
        return res.json();
    },

    async deleteRoutine(id) {
        const res = await fetch(`${API_URL}/routines/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete routine');
        return res.json();
    },

    async activateRoutine(id) {
        const res = await fetch(`${API_URL}/routines/${id}/activate`, {
            method: 'PUT',
        });
        if (!res.ok) throw new Error('Failed to activate routine');
        return res.json();
    },

    // ==========================================
    // WORKOUTS
    // ==========================================
    async logWorkout(exerciseId, sets, notes = null) {
        const res = await fetch(`${API_URL}/workouts/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exerciseId, sets, notes }),
        });
        if (!res.ok) throw new Error('Failed to log workout');
        return res.json();
    },

    async logRestDay(note = null) {
        const res = await fetch(`${API_URL}/workouts/log-rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note }),
        });
        if (!res.ok) throw new Error('Failed to log rest day');
        return res.json();
    },

    async getWorkoutHistory() {
        const res = await fetch(`${API_URL}/workouts/history`);
        if (!res.ok) throw new Error('Failed to fetch workout history');
        return res.json();
    },

    async getExerciseHistory(exerciseId) {
        const res = await fetch(`${API_URL}/workouts/exercise/${exerciseId}/history`);
        if (!res.ok) throw new Error('Failed to fetch exercise history');
        return res.json();
    },

    // ==========================================
    // EXERCISES
    // ==========================================
    async getExercises() {
        const res = await fetch(`${API_URL}/exercises`);
        if (!res.ok) throw new Error('Failed to fetch exercises');
        return res.json();
    },

    async updateExerciseMuscle(exerciseId, muscleGroup) {
        const res = await fetch(`${API_URL}/exercises/${exerciseId}/muscle`, {
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
    }
};
