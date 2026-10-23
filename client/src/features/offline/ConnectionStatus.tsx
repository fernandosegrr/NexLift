import { useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

function subscribe(refresh: () => void): () => void {
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return (): void => { window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
}
function online(): boolean { return navigator.onLine; }
export default function ConnectionStatus(): ReactElement | null {
    const connected = useSyncExternalStore(subscribe, online, () => true);
    return connected ? null : <p role="status" className="mb-3 p-3 text-sm rounded-xl border border-amber-500/50 text-amber-300">
        Sin conexión. Los borradores se conservan en este dispositivo. Los datos confirmados se actualizarán al conectar.
    </p>;
}
