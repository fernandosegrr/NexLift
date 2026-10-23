import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App.jsx';
import { api } from '../src/services/api.js';
import { remoteClient } from '../src/app/remote';
import SetCard from '../src/features/workouts/SetCard';
import RirDialog from '../src/features/workouts/RirDialog';
import SessionSetRow from '../src/features/workouts/SessionSetRow';

const identity = () => JSON.parse(localStorage.getItem('nexlift_user'));
const install = id => {
    localStorage.setItem('nexlift_user', JSON.stringify({ id, username: `Cuenta ${id}` }));
    localStorage.setItem('nexlift_token', `synthetic.${btoa(JSON.stringify({ userId: id }))}.synthetic`);
};
install('A');
window.frontend = { reads: [], actions: [], release: null, delay: false, editor: null,
    switchAccount(id) { install(id); window.dispatchEvent(new StorageEvent('storage', { key: 'nexlift_token' })); },
    refresh() { return remoteClient.invalidateQueries(); },
    cache() { return remoteClient.getQueryCache().getAll().map(q => ({ key: q.queryKey, data: q.state.data })); },
};
const day = { id: 'day', dayName: 'Día sintético', exercises: [] };
api.getProfile = async () => identity();
api.getHome = async () => {
    const owner = identity().id;
    window.frontend.reads.push({ domain: 'home', owner, time: performance.now() });
    if (window.frontend.delay) { window.frontend.delay = false; await new Promise(resolve => { window.frontend.release = resolve; }); }
    return { stats: { totalWorkouts: owner === 'A' ? 11 : 22 }, activeRoutine: { id: owner, name: `Confirmado ${owner}`, days: [day] }, prs: [], consistencyCounts: {}, plateauCount: 0 };
};
api.getRoutines = async () => { window.frontend.reads.push({ domain: 'routines', owner: identity().id }); return [{ id: identity().id, name: `Confirmado ${identity().id}`, isActive: true, days: [day] }]; };
api.getGoals = async () => [];
const stableSet = { weight: '80', reps: '8', rir: null, completed: false };
function Editor() {
    const [version, setVersion] = useState(1), [dialog, setDialog] = useState(false);
    return <div>
        <button id="callback-version" onClick={() => setVersion(n => n + 1)}>Cambiar callback {version}</button>
        <SetCard set={stableSet} index={0} isLocked={false} isUnilateral={false} previousBestScore={null}
            onUpdate={() => {}} onToggle={() => window.frontend.actions.push(version)} onSetRIR={() => {}}
            setSuggestion={{ weight: 82.5, reps: 8, rationale: 'Prueba' }} />
        <SessionSetRow set={{ id: 'set-id', weight: '80', reps: '8', weightRight: '70', repsRight: '7', rir: 2 }} index={0} isUnilateral={true} onUpdate={() => {}} onRemove={() => {}} />
        <button id="open-rir" onClick={() => setDialog(true)}>Completar sin RIR</button>
        {dialog && <RirDialog index={0} onClose={() => setDialog(false)} onAnswer={value => { window.frontend.actions.push({ rir: value }); setDialog(false); }} />}
    </div>;
}
export default function Harness() {
    const [editor, setEditor] = useState(false);
    useEffect(() => { window.frontend.editor = () => setEditor(true); return () => { window.frontend.editor = null; }; }, []);
    return editor ? <Editor /> : <App />;
}
createRoot(document.getElementById('root')).render(<Harness />);
