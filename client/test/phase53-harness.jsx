import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { api } from '../src/services/api.js';
import { AuthProvider, useAuth } from '../src/context/AuthContext.jsx';
import { ToastProvider } from '../src/components/ui/Toast.jsx';
import Workout from '../src/pages/Workout.jsx';

// Test-only synthetic adapters. No backend/provider or production URL is used.
const user = { id: 'smart-synthetic', username: 'smart-synthetic' };
localStorage.setItem('nexlift_token', `synthetic.${btoa(JSON.stringify({ userId: user.id }))}.synthetic`);
localStorage.setItem('nexlift_user', JSON.stringify(user));
const exercise = { id: 'smart-ex', name: 'Synthetic press', muscleGroup: 'Pecho', targetSets: 2, targetReps: '8-12', restSeconds: 90, isUnilateral: false };
const history = [{ id: 'past', date: '2020-01-01T18:00:00Z', sets: [{ setNumber: 1, weight: 80, reps: 12, rpe: 9, completed: true }] }];
window.phase53 = { writes: [], suggestionLogs: [], input(label, value) {
    const input = document.querySelector(`[aria-label="${label}"]`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
} };
api.getProfile = async () => user;
api.getRoutines = async () => [{ id: 'routine', days: [{ id: 'smart-day', dayName: 'Synthetic day', exercises: [exercise] }] }];
api.getExerciseHistory = async () => history;
api.getGoals = async () => [];
api.scheduleRestReminder = async () => ({});
api.logSuggestionApplied = async (...args) => { window.phase53.suggestionLogs.push(args); };
api.logWorkout = async (exerciseId, sets) => {
    window.phase53.writes.push({ exerciseId, sets });
    return { workoutLog: { id: 'synthetic-saved', exerciseId, sets, date: new Date().toISOString() } };
};
export default function Ready() { const { loading } = useAuth(); return loading ? null : <Workout />; }
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/workout/smart-day']}><AuthProvider><ToastProvider><Routes><Route path="/workout/:dayId" element={<Ready />} /></Routes></ToastProvider></AuthProvider></MemoryRouter>);
