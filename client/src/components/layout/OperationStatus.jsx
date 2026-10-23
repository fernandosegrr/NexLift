import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { operationRuntime } from '../../services/api';
import { operationLabels } from '../../services/operationSync';
import ConflictStatus from './ConflictStatus';
import { getStorageRuntime, indexedStorageEnabled } from '../../storage/runtime';

export default function OperationStatus() {
    const { user } = useAuth();
    const [view, setView] = useState({ items: [], error: null });
    const [visibleCount, setVisibleCount] = useState(50);
    useEffect(() => {
        let current = true, reading = false, dirty = false, refreshTimer;
        const runtime = operationRuntime();
        const scheduleRefresh = () => {
            dirty = true;
            refreshTimer ??= setTimeout(() => { refreshTimer = undefined; void refresh(); }, 250);
        };
        const refresh = async () => {
            if (reading) { dirty = true; return; }
            reading = true; dirty = false;
            try {
                const items = user?.id ? await runtime.store.list(user.id, { includeHistory: false }) : [];
                if (current) setView({ items, error: null });
            } catch (error) { if (current) setView(prev => ({ ...prev, error: error.message })); }
            finally { reading = false; if (dirty && current) scheduleRefresh(); }
        };
        void refresh();
        const unsubscribe = runtime.store.subscribe(scheduleRefresh);
        return () => { current = false; clearTimeout(refreshTimer); unsubscribe(); };
    }, [user?.id]);
    const items = view.items.filter(item => item.ownerId === user?.id);
    if (!items.length && !view.error) return null;
    const pending = items.filter(item => !['confirmed', 'resolved_preserved'].includes(item.status));
    const syncing = pending.filter(item => item.status === 'syncing').length;
    const review = pending.some(item => ['conflict', 'blocked_validation', 'blocked_dependency', 'blocked_incompatible', 'blocked_forbidden', 'blocked_migration'].includes(item.status));
    const last = Math.max(0, ...items.map(item => item.confirmedAt || 0));
    const exportData = async () => {
        try {
            const current = await operationRuntime().store.list(user.id);
            const data = indexedStorageEnabled ? await getStorageRuntime().export(user.id) : { version: 1, ownerId: user.id, operations: current };
            if (operationRuntime().transport.snapshot()?.ownerId !== user.id) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'nexlift-operaciones-pendientes.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { setView(prev => ({ ...prev, error: error.message })); }
    };
    return <><ConflictStatus /><details className="mb-3 border border-[var(--border)] rounded-xl p-3 text-xs">
        <summary className="cursor-pointer" aria-live="polite">{view.error ? 'Error de almacenamiento: conserva tus datos'
            : review ? 'Hay datos que requieren revisión' : syncing ? `Sincronizando ${syncing} operaciones`
            : pending.length ? `${pending.length} operaciones guardadas en este dispositivo` : 'Entrenamientos sincronizados'}</summary>
        {view.error && <p role="alert" className="mt-2 text-red-400">{view.error}</p>}
        <p className="mt-2">El guardado local queda pendiente hasta verificar el comprobante del servidor.</p>
        {review && <p>La cola espera la revisión del primer registro bloqueado. Los registros posteriores se conservan, aunque correspondan a otros ejercicios.</p>}
        {!!last && <p>Última sincronización verificada: {new Date(last).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} (CDMX)</p>}
        <ul data-operation-list className="mt-2 space-y-2">{items.slice(0, visibleCount).map(item => <li key={item.id}>
            <strong>{operationLabels[item.status] || 'Requiere revisión'}</strong> · {item.originalDay} · {item.payload.kind}
            {item.lastError && <p>{item.lastError}</p>}
            {item.nextRetryAt && <p>Próximo intento: {new Date(item.nextRetryAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} (CDMX)</p>}
            {item.status !== 'confirmed' && <details><summary>Ver datos originales conservados</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify({ payload: item.payload, dependsOn: item.dependsOn, errorCode: item.errorCode }, null, 2)}</pre></details>}
        </li>)}</ul>
        {items.length > visibleCount && <button type="button" className="underline mt-2" onClick={() => setVisibleCount(n => n + 50)}>Ver 50 registros más ({visibleCount} de {items.length})</button>}
        <div className="mt-3 flex flex-wrap gap-3">
            {!!pending.length && <button type="button" className="underline" onClick={() => { void operationRuntime().retry().catch(error => setView(prev => ({ ...prev, error: error.message }))); }}>Reintentar operaciones recuperables</button>}
            <button type="button" className="underline" onClick={() => { void exportData(); }}>Exportar operaciones y comprobantes</button>
        </div>
    </details></>;
}
