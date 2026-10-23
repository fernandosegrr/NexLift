import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRestTimer } from '../src/features/workouts/useRestTimer';
import { api } from '../src/services/api';

localStorage.setItem('nexlift_token', 'synthetic-rest-A');
localStorage.setItem('nexlift_user', '{"id":"A"}');
export default function Timer() {
    const [status, setStatus] = useState('Listo');
    const timer = useRestTimer(() => { void api.cancelRestReminder().then(result => setStatus(result?.cancelled ? 'Cancelado' : 'Sin confirmación')).catch(() => setStatus('Sólo local')); });
    return <main>
        <button id="start" onClick={() => { timer.start(90); setStatus('Programando'); void api.scheduleRestReminder('ea').then(() => setStatus('Programado')).catch(() => setStatus('Error al programar')); }}>Programar</button>
        <button id="stop" onClick={() => { setStatus('Detenido localmente'); timer.stop(); }}>Detener</button>
        <output id="seconds">{timer.secondsLeft ?? 'sin temporizador'}</output><output id="status">{status}</output>
    </main>;
}
const root = createRoot(document.getElementById('root'));
window.restRehearsal = { unmount: () => root.unmount() };
root.render(<Timer />);
