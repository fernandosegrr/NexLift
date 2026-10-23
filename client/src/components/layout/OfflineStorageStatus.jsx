import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSessionIdentity } from '../../services/offlineQueue';
import { getStorageRuntime, indexedStorageEnabled } from '../../storage/runtime';
import { requestPersistence, storageEstimate } from '../../storage/storageHealth';

export default function OfflineStorageStatus() {
    return indexedStorageEnabled ? <StoragePanel /> : null;
}
function StoragePanel() {
    const { user } = useAuth();
    const [view, setView] = useState({ health: { status: 'preparing' }, pending: 0, drafts: 0, legacy: 0 });
    const [policy, setPolicy] = useState({});
    useEffect(() => {
        let current = true, refreshTimer;
        const runtime = getStorageRuntime();
        const refresh = async () => {
            try {
                const result = await runtime.summary(user?.id);
                if (current) setView({ ...result, ownerId: user?.id });
            } catch (error) { if (current) setView({ health: { status: 'error', error: error.message }, pending: 0, drafts: 0, legacy: 0 }); }
        };
        void refresh();
        void storageEstimate().then(result => { if (current) setPolicy(result); });
        const stop = runtime.subscribe(() => {
            const health = runtime.health();
            if (health.status !== 'ready') setView(prev => ({ ...prev, health }));
            refreshTimer ??= setTimeout(() => { refreshTimer = undefined; void refresh(); }, 250);
        });
        return () => { current = false; clearTimeout(refreshTimer); stop(); };
    }, [user?.id]);
    const backup = async includeUnassigned => {
        try {
            const data = await getStorageRuntime().export(user.id, { includeUnassigned });
            if (getSessionIdentity()?.ownerId !== user.id) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'nexlift-respaldo-local.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { setView(prev => ({ ...prev, health: { status: 'error', error: error.message } })); }
    };
    const own = view.ownerId === user?.id;
    return <details className="mb-3 border border-[var(--border)] rounded-xl p-3 text-xs" data-offline-storage>
        <summary aria-live="polite">{view.health.status === 'error' ? 'No pudimos guardar o leer en este dispositivo'
            : view.health.status !== 'ready' ? 'Preparando almacenamiento offline' : 'Almacenamiento offline disponible'}</summary>
        {view.health.error && <p role="alert" className="mt-2 text-red-400">{view.health.error}</p>}
        {own && <p className="mt-2">{view.pending} operaciones pendientes · {view.drafts} borradores recuperables</p>}
        {view.health.migration?.verified && <p>Recuperamos tus entrenamientos pendientes. Copia verificada; seguimos vigilando los datos de pestañas anteriores.</p>}
        {view.health.migration?.status === 'watching' && <p>Migración inicial completada. Los originales se conservan para reconciliar pestañas antiguas.</p>}
        {own && view.legacy > 0 && <p>Hay registros antiguos que necesitan revisión. Se conservan sin enviarlos automáticamente.</p>}
        {policy.quota !== undefined && <p>Uso aproximado: {Math.round((policy.usage || 0) / 1024 / 1024)} de {Math.round(policy.quota / 1024 / 1024)} MB.</p>}
        <p>{policy.persisted ? 'El navegador concedió almacenamiento persistente.' : 'El navegador puede liberar datos locales. Conserva un respaldo exportado.'} El usuario y el sistema pueden borrar datos del dispositivo.</p>
        <div className="mt-3 flex flex-wrap gap-3">
            <button className="underline" type="button" onClick={() => { void backup(false); }}>Exportar mi respaldo local</button>
            <button className="underline" type="button" onClick={() => { void backup(true); }}>Exportar también registros sin propietario para revisión</button>
            {policy.persistSupported && !policy.persisted && <button className="underline" type="button" onClick={() => { void requestPersistence().then(() => storageEstimate()).then(setPolicy); }}>Solicitar conservación en este navegador</button>}
        </div>
    </details>;
}
