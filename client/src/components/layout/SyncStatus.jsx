import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getQueue, getQueueStorageError, subscribeQueueChange } from '../../services/offlineQueue';
import { readDrafts, subscribeDraftChange } from '../../services/workoutDrafts';
import { replayOfflineQueue } from '../../services/api';
import OperationStatus from './OperationStatus';
import OfflineStorageStatus from './OfflineStorageStatus';
import { syncReason } from '../../services/offlineSync';

const labels = {
    pending: 'Pendiente de sincronizar', syncing: 'Sincronizando', synced: 'Sincronizado y confirmado',
    temporary_error: 'Error temporal', paused: 'Pausado: requiere sesión', blocked: 'Bloqueado: requiere revisión', conflict: 'Conflicto: requiere revisión'
};
function readState(ownerId) {
    try {
        const all = getQueue({ includeSynced: true });
        const drafts = readDrafts();
        return {
            items: all.filter(item => !item.legacy && item.ownerId === ownerId),
            drafts: drafts.filter(draft => !draft.legacy && draft.ownerId === ownerId),
            legacy: all.some(item => item.legacy) || drafts.some(draft => draft.legacy),
            error: getQueueStorageError()
        };
    } catch (error) { return { items: [], drafts: [], legacy: false, error: error.message }; }
}
function download(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SyncStatus() {
    return <><OfflineStorageStatus /><OperationStatus /><LegacySyncStatus /></>;
}
function LegacySyncStatus() {
    const { user } = useAuth();
    const [state, setState] = useState(() => readState(user?.id));
    useEffect(() => {
        const refresh = () => setState(readState(user?.id));
        refresh();
        const unsubscribe = subscribeQueueChange(refresh);
        const unsubscribeDraft = subscribeDraftChange(refresh);
        window.addEventListener('storage', refresh);
        return () => { unsubscribe(); unsubscribeDraft(); window.removeEventListener('storage', refresh); };
    }, [user?.id]);
    const pending = state.items.filter(item => item.status !== 'synced');
    const needsReview = pending.some(item => ['blocked', 'conflict', 'paused'].includes(item.status));
    const syncing = pending.some(item => item.status === 'syncing');
    const temporary = pending.some(item => item.status === 'temporary_error');
    if (!state.error && !state.items.length && !state.legacy && !state.drafts.length) return null;
    return (
        <details className="mb-3 border border-[var(--border)] rounded-xl p-3 text-xs">
            <summary className="cursor-pointer" aria-live="polite">
                {state.error ? 'Error de almacenamiento: revisa tus datos'
                    : needsReview ? 'Datos locales bloqueados o en conflicto: requieren revisión'
                    : syncing ? 'Sincronizando: esperando confirmación'
                    : temporary ? 'Error temporal: datos locales conservados'
                    : pending.length ? `${pending.length} registros locales pendientes de confirmar`
                    : state.legacy ? 'Datos antiguos conservados: requieren revisión del propietario'
                    : state.items.length ? 'Registros sincronizados y confirmados; borradores conservados' : 'Borradores locales conservados'}
            </summary>
            {state.error && <p role="alert" className="mt-2 text-red-400">{state.error}</p>}
            {!!pending.length && <p className="mt-2">Guardado local no significa guardado en el servidor. Los bloqueos y conflictos requieren revisión; no se reenviarán automáticamente.</p>}
            <ul className="space-y-2 mt-2">
                {state.items.map(item => (
                    <li key={item.id}>
                        <strong>{labels[item.status] || 'Requiere revisión'}</strong> · {item.originalDay} · {item.op}
                        {item.status !== 'synced' && <p>{syncReason(item)}</p>}
                        {item.nextRetryAt && <p>Próxima consulta: {new Date(item.nextRetryAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} (CDMX)</p>}
                        {item.remote && <details><summary>Ver versiones conservadas</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify({ local: item.payload, remote: item.remote }, null, 2)}</pre></details>}
                    </li>
                ))}
            </ul>
            {state.legacy && <p className="mt-2">Hay datos del formato anterior sin propietario verificable. Se conservan intactos en este dispositivo. No se asignan a esta cuenta ni se envían al servidor. Su recuperación requiere identificar al propietario.</p>}
            <div className="flex flex-wrap gap-3 mt-3">
                {!!(state.items.length || state.drafts.length) && <button type="button" className="underline" onClick={() => download({ ownerId: user.id, operations: state.items, drafts: state.drafts }, 'nexlift-datos-locales.json')}>Exportar mis datos locales</button>}
                {state.legacy && <button type="button" className="underline" onClick={() => {
                    try {
                        const raw = { queue: localStorage.getItem('nexlift_offline_queue'), drafts: {} };
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key?.startsWith('workout_')) raw.drafts[key] = localStorage.getItem(key);
                        }
                        download(raw, 'nexlift-legado-sin-propietario.json');
                    } catch (error) { setState(prev => ({ ...prev, error: error.message })); }
                }}>Exportar archivo antiguo sin asignar cuenta</button>}
                {pending.some(item => ['temporary_error', 'pending', 'paused'].includes(item.status)) && <button type="button" className="underline" onClick={() => { void replayOfflineQueue().catch(() => setState(readState(user?.id))); }}>Comprobar estado sin sobrescribir</button>}
            </div>
        </details>
    );
}
