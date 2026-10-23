import type { ReactElement } from 'react';

interface Props { fetching: boolean; stale: boolean; error: Error | null; updatedAt: number; retry: () => void }
export default function RemoteStatus({ fetching, stale, error, updatedAt, retry }: Props): ReactElement | null {
    if (!fetching && !stale && !error) return null;
    return <div className="text-xs text-[var(--text-secondary)] mb-3" role={error ? 'alert' : 'status'}>
        {error ? 'No se pudo actualizar. Los datos locales se conservan.' : fetching ? 'Consultando datos confirmados…' : 'Datos confirmados pendientes de actualizar.'}
        {!!updatedAt && <span> Última consulta: {new Date(updatedAt).toLocaleTimeString('es-MX')}.</span>}
        {error && <button type="button" className="underline min-h-[44px] px-3" onClick={retry}>Volver a consultar</button>}
    </div>;
}
