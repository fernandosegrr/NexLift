const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = {
    // Stats
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

    // Routines
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
            method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to activate routine');
        return res.json();
    },

    // Workouts
    async logWorkout(data) {
        const res = await fetch(`${API_URL}/workouts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to log workout');
        return res.json();
    },

    async logRestDay() {
        const res = await fetch(`${API_URL}/workouts/log-rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('Failed to log rest day');
        return res.json();
    },

    async getHistory(exerciseId) {
        const res = await fetch(`${API_URL}/workouts/history/${exerciseId}`);
        if (!res.ok) throw new Error('Failed to fetch history');
        return res.json();
    },

    // Data
    async getMuscleGroups() {
        const res = await fetch(`${API_URL}/exercises/muscle-groups`);
        if (!res.ok) throw new Error('Failed to fetch muscle groups');
        return res.json();
    },

    async getExercises() {
        const res = await fetch(`${API_URL}/exercises`);
        if (!res.ok) throw new Error('Failed to fetch exercises');
        return res.json();
    },

    // System
    async checkServer() {
        try {
            const res = await fetch(`${API_URL}/health`);
            return res.ok;
        } catch (e) {
            return false;
        }
    }
};