import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App.jsx';
import { api } from '../src/services/api.js';
import { remoteClient } from '../src/app/remote';
import { buildCoachReport, answerCoach } from '../../packages/shared/src/domain/coach/engine.ts';
import { coachScenario, equipment } from '../../scripts/fixtures/coach/scenarios.mjs';
const identity = () => JSON.parse(localStorage.getItem('nexlift_user'));
function install(id) { localStorage.setItem('nexlift_user', JSON.stringify({ id, username: id })); localStorage.setItem('nexlift_token', `synthetic.${btoa(JSON.stringify({ userId: id }))}.synthetic`); }
install('A'); history.replaceState(null, '', '/test/coach-harness.html');
const input = coachScenario(); input.now = '2026-10-24T04:00:00.000Z'; input.configs = [equipment()]; input.body = [{ id: 'w1', date: '2026-10-01T18:00:00Z', weight: 70, muscleMass: null, photoUrl: null }, { id: 'w2', date: '2026-10-20T18:00:00Z', weight: 71, muscleMass: null, photoUrl: null }];
const checks = [], suggestions = [], actualRequest = api.coach.bind(api);
window.coachTest = { writes: [], reads: [], realRequest: actualRequest, delayed: false, release: null, input,
    refresh: () => remoteClient.invalidateQueries(), switchAccount(id) { install(id); window.dispatchEvent(new StorageEvent('storage', { key: 'nexlift_token' })); }, cache: () => remoteClient.getQueryCache().getAll().map(q => q.state.data) };
api.getProfile = async () => identity(); api.getHome = async () => ({ stats: {}, activeRoutine: null, prs: [], consistencyCounts: {}, plateauCount: 0 }); api.getGoals = async () => [];
api.coach = async (path, body, method = 'GET') => {
    if (!navigator.onLine) throw Error('Sin conexión: no se confirmó ni se encoló ningún guardado.');
    const owner = identity().id;
    if (method !== 'GET') window.coachTest.writes.push({ path, body, method, owner });
    else window.coachTest.reads.push({ path, owner });
    const report = () => { const cloned = structuredClone(input); if (owner === 'B') { cloned.exercises[0].name = 'Ejercicio privado B'; cloned.sessions = []; cloned.checkIns = []; cloned.configs = []; } return buildCoachReport(cloned); };
    if (path.startsWith('/report')) { if (window.coachTest.delayed) { window.coachTest.delayed = false; await new Promise(resolve => { window.coachTest.release = resolve; }); } return report(); }
    if (path === '/ask') return answerCoach(report(), body.message, body.exerciseId);
    if (path === '/check-ins') return checks.filter(c => c.owner === owner);
    if (path.startsWith('/check-ins/')) { const date = path.split('/').at(-1); const index = checks.findIndex(c => c.date === date && c.owner === owner); if (index >= 0) checks.splice(index, 1); if (method !== 'DELETE') checks.push({ ...body, date, owner, updatedAt: new Date().toISOString() }); return { saved: true }; }
    if (path.endsWith('/config')) { if (method === 'PUT') input.configs = [{ ...body, exerciseId: 'bench', updatedAt: new Date().toISOString() }]; if (method === 'DELETE') input.configs = []; return input.configs[0] || null; }
    if (path.endsWith('/results')) return [];
    if (path === '/suggestions') return suggestions;
    if (path.endsWith('/suggestions')) { const s = { id: 'suggestion', exerciseId: 'bench', createdAt: new Date().toISOString(), outcome: 'presented', evaluation: 'pending', payload: report().loading[0] }; suggestions.push(s); return s; }
    if (path.endsWith('/feedback')) { suggestions[0].outcome = body.outcome; suggestions[0].evaluation = 'ignored'; return suggestions[0]; }
    if (path === '/measurements') { input.measurements = [{ ...body, id: 'measure' }]; return input.measurements[0]; }
    if (path.startsWith('/measurements/') && method === 'DELETE') { input.measurements = []; return { deleted: true }; }
    throw Error('Unsupported synthetic API');
};
// BrowserRouter receives the real route while Vite still loads this harness entry.
history.replaceState(null, '', '/coach');
createRoot(document.getElementById('root')).render(<App />);
