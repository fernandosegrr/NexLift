import RemoteProvider from '../src/app/RemoteProvider';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import Progress from '../src/pages/Progress.jsx';
import { api } from '../src/services/api.js';
import { AuthProvider, useAuth } from '../src/context/AuthContext.jsx';
import { ToastProvider } from '../src/components/ui/Toast.jsx';
import { downloadSessionPdf } from '../src/utils/sessionPdf.js';

const user = { id: 'analysis-synthetic', username: 'analysis-synthetic' };
localStorage.setItem('nexlift_token', `synthetic.${btoa(JSON.stringify({ userId: user.id }))}.synthetic`);
localStorage.setItem('nexlift_user', JSON.stringify(user));
const session = { id: 'synthetic', date: '2026-10-19T18:00:00Z', exercise: { name: 'Synthetic press', muscleGroup: 'Pecho' }, sets: [{ weight: 80, reps: 10, weightRight: 0, repsRight: 0, rpe: 8, completed: true, setNumber: 1 }] };
window.analysis = { syntheticWrites: 0, pdfs: [], historyRequests: [], async exportSessionPdf() {
    await downloadSessionPdf(session, { userName: user.username });
} };
// Intercept only the download boundary. Both production PDF generators and
// jsPDF/autoTable execute normally; no browser downloads or user files written.
jsPDF.API.save = function (name) {
    window.analysis.pdfs.push({ name, pages: this.getNumberOfPages(), bytes: this.output('arraybuffer').byteLength, content: Object.values(this.internal.pages).flat().join('\n') });
    return this;
};
api.getProfile = async () => user;
api.getLatestWeight = async () => ({ weight: 75 });
api.getProgressBundle = async () => ({ stats: { weeklyVolume: 800, totalWorkouts: 1, totalPRs: 0, currentStreak: 1 }, consistencyCounts: { '2026-10-19': 1 }, prs: [], exercises: [], plateaued: [], plateauCount: 0 });
api.getWorkoutHistory = async (...args) => { window.analysis.historyRequests.push(args); return [session]; };
api.getExerciseProgress = async () => [];
export default function Ready() {
    const { loading } = useAuth();
    React.useEffect(() => { window.analysisReady = !loading; }, [loading]);
    return loading ? null : <Progress />;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><AuthProvider><ToastProvider><RemoteProvider><Ready /></RemoteProvider></ToastProvider></AuthProvider></MemoryRouter>);
