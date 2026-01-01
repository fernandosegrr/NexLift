const API_BASE = '/api';

export const api = {
    // Routines
    async importRoutine(jsonData) {
        const res = await fetch(`${API_BASE}/routines/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonData)
        });
        if (!res.ok) throw new Error('Failed to import routine');
        return res.json();
    },

    async getRoutines() {
        const res = await fetch(`${API_BASE}/routines`);
        if (!res.ok) throw new Error('Failed to fetch routines');
        return res.json();
    },

    async getRoutine(id) {
        const res = await fetch(`${API_BASE}/routines/${id}`);
        if (!res.ok) throw new Error('Failed to fetch routine');
        return res.json();
    },

    async deleteRoutine(id) {
        const res = await fetch(`${API_BASE}/routines/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete routine');
        return res.json();
    },

    async updateRoutine(id, routineData) {
        const res = await fetch(`${API_BASE}/routines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routineData)
        });
        if (!res.ok) throw new Error('Failed to update routine');
        return res.json();
    },

    // Workouts
    async logWorkout(exerciseId, sets, notes = null) {
        const res = await fetch(`${API_BASE}/workouts/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exerciseId, sets, notes })
        });
        if (!res.ok) throw new Error('Failed to log workout');
        return res.json();
    },

    async logRestDay(note = null) {
        const res = await fetch(`${API_BASE}/workouts/log-rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        });
        if (!res.ok) throw new Error('Failed to log rest day');
        return res.json();
    },

    async getWorkoutHistory(exerciseId = null, limit = 30) {
        const params = new URLSearchParams();
        if (exerciseId) params.append('exerciseId', exerciseId);
        if (limit) params.append('limit', limit);

        const res = await fetch(`${API_BASE}/workouts/history?${params}`);
        if (!res.ok) throw new Error('Failed to fetch history');
        return res.json();
    },

    async getExerciseHistory(exerciseId) {
        const res = await fetch(`${API_BASE}/workouts/exercise/${exerciseId}/history`);
        if (!res.ok) throw new Error('Failed to fetch exercise history');
        return res.json();
    },

    // Stats
    async getOverviewStats() {
        const res = await fetch(`${API_BASE}/stats/overview`);
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
    },

    async getConsistency() {
        const res = await fetch(`${API_BASE}/stats/consistency`);
        if (!res.ok) throw new Error('Failed to fetch consistency');
        return res.json();
    },

    async getExerciseProgress(exerciseName) {
        const res = await fetch(`${API_BASE}/stats/progress/${encodeURIComponent(exerciseName)}`);
        if (!res.ok) throw new Error('Failed to fetch progress');
        return res.json();
    },

    async getPersonalRecords() {
        const res = await fetch(`${API_BASE}/stats/prs`);
        if (!res.ok) throw new Error('Failed to fetch PRs');
        return res.json();
    },

    // Active Routine
    async getActiveRoutine() {
        const res = await fetch(`${API_BASE}/routines/active`);
        if (!res.ok) throw new Error('Failed to fetch active routine');
        return res.json();
    },

    async activateRoutine(id) {
        const res = await fetch(`${API_BASE}/routines/${id}/activate`, {
            method: 'PUT'
        });
        if (!res.ok) throw new Error('Failed to activate routine');
        return res.json();
    },

    async getRoutineStats(id) {
        const res = await fetch(`${API_BASE}/stats/routine/${id}`);
        if (!res.ok) throw new Error('Failed to fetch routine stats');
        return res.json();
    },

    // Exercises
    async getExercises() {
        const res = await fetch(`${API_BASE}/exercises`);
        if (!res.ok) throw new Error('Failed to fetch exercises');
        return res.json();
    },

    async updateExerciseMuscle(id, muscleGroup) {
        const res = await fetch(`${API_BASE}/exercises/${id}/muscle`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ muscleGroup })
        });
        if (!res.ok) throw new Error('Failed to update muscle group');
        return res.json();
    }
};
