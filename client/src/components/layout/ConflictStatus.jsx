import ConflictComparison, { labels, show } from '../../features/offline/ConflictComparison';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { operationRuntime } from '../../services/api';
import { conflictResolutionEnabled } from '../../storage/runtime';

const resolved = c => ['resolved_server', 'resolved_local'].includes(c.status);
export default function ConflictStatus() {
    const { user } = useAuth();
    return conflictResolutionEnabled && user?.id ? <ConflictPanel key={user.id} ownerId={user.id} /> : null;
}
function ConflictPanel({ ownerId }) {
    const [items, setItems] = useState([]), [detail, setDetail] = useState(null), [selected, setSelected] = useState([]);
    const [proposal, setProposal] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
    useEffect(() => {
        let current = true, refreshTimer;
        const runtime = operationRuntime();
        const refresh = async () => {
            try { const next = await runtime.conflicts.list(ownerId); if (current) setItems(next); }
            catch (err) { if (current) setError(err.message); }
        };
        void refresh(); const off = runtime.store.subscribe(() => {
            refreshTimer ??= setTimeout(() => { refreshTimer = undefined; void refresh(); }, 250);
        });
        return () => { current = false; clearTimeout(refreshTimer); off(); };
    }, [ownerId]);
    const act = async task => {
        setBusy(true); setError(null);
        try {
            await task();
            if (operationRuntime().transport.snapshot()?.ownerId !== ownerId) return;
            setItems(await operationRuntime().conflicts.list(ownerId));
        } catch (err) { if (operationRuntime().transport.snapshot()?.ownerId === ownerId) setError(err.message); }
        finally { setBusy(false); }
    };
    async function inspect(id) {
        const result = await operationRuntime().conflicts.inspect(ownerId, id);
        if (operationRuntime().transport.snapshot()?.ownerId !== ownerId) return;
        setDetail(result); setProposal(null); setSelected([]);
    }
    async function exportData() {
        const data = await operationRuntime().conflicts.export(ownerId);
        if (operationRuntime().transport.snapshot()?.ownerId !== ownerId) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'nexlift-conflictos-conservados.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (!items.length && !error) return null;
    const comparison = detail?.observation?.comparison;
    return <section data-conflict-status className="mb-3 p-3 rounded-xl border border-amber-500/50 text-sm">
        <h2 className="font-bold">{items.some(c => !resolved(c)) ? 'Este entrenamiento cambió en otro dispositivo' : 'Decisiones de conflictos conservadas'}</h2>
        <p>Los cambios locales se conservan. Solo un comprobante confirma una escritura en PostgreSQL.</p>
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <ul>{items.map(c => <li key={c.id} className="mt-2">
            {c.original.baseSnapshot?.workoutLog?.exercise?.name || 'Entrenamiento'} · {resolved(c) ? 'Resuelto; originales conservados' : c.status === 'awaiting_receipt' ? 'Propuesta local pendiente de comprobante' : c.status === 'deferred' ? 'Pospuesto; pendiente de revisión' : 'Requiere revisión'}
            <button disabled={busy} className="ml-2 underline" onClick={() => { void act(() => inspect(c.id)); }}>Ver diferencias</button>
            {!!c.dependentIds.length && <p>{c.dependentIds.length} operaciones dependientes conservadas para revisión.</p>}
        </li>)}</ul>
        {detail && <div role="region" aria-label="Comparación del entrenamiento" className="mt-4">
            <p>Base original · cambio de este dispositivo · estado leído del servidor · propuesta aún no aplicada.</p>
            {comparison?.reason && <p role="status">{comparison.reason}</p>}
            {comparison?.independent && <p>Los campos comparados son independientes. La aplicación requiere tu confirmación.</p>}
            <ConflictComparison differences={comparison?.differences || []} selected={selected} onSelect={(key, local) => {
                setSelected(previous => local ? [...new Set([...previous, key])] : previous.filter(item => item !== key)); setProposal(null);
            }} />
            <details className="mt-3"><summary>Historial local y originales recuperables</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ original: detail.original, dependents: detail.dependentIds, history: detail.history, receipt: detail.receipt }, null, 2)}</pre></details>
            {!resolved(detail) && <div className="flex gap-3 flex-wrap mt-3">
                <button disabled={busy || !!detail.activeResolutionId} onClick={() => { void act(async () => { await operationRuntime().conflicts.acceptServer(ownerId, detail.id); setDetail(null); setProposal(null); }); }}>Conservar versión del servidor</button>
                <button disabled={busy || !comparison?.mergeable || !!detail.activeResolutionId} onClick={() => { void act(async () => setProposal(await operationRuntime().conflicts.preview(ownerId, detail.id, [], 'local'))); }}>Vista previa: aplicar mis cambios</button>
                <button disabled={busy || !selected.length || !!detail.activeResolutionId} onClick={() => { void act(async () => setProposal(await operationRuntime().conflicts.preview(ownerId, detail.id, selected, 'manual'))); }}>Revisar selección manual</button>
                <button disabled={busy || !!detail.activeResolutionId} onClick={() => { void act(async () => { await operationRuntime().conflicts.defer(ownerId, detail.id); setDetail(null); setProposal(null); }); }}>Posponer resolución</button>
                {detail.activeResolutionId && <button disabled={busy} onClick={() => { void act(async () => { await operationRuntime().conflicts.retry(ownerId); await inspect(detail.id); }); }}>Consultar resultado del intento enviado</button>}
            </div>}
            {proposal && <div data-conflict-preview className="mt-3 p-3 border rounded-lg"><h3>Vista previa — propuesta sin aplicar</h3>
                <ul>{proposal.selected.map(d => <li key={d.key}>{labels[d.field]} · {d.target}: servidor {show(d.remote)} → propuesto {show(d.local)}</li>)}</ul>
                <p>{proposal.deleteSession ? 'Eliminarás toda la sesión y sus cambios remotos mostrados. Los originales locales y el comprobante se conservan.' : 'Los demás campos del servidor se conservan.'} Si vuelve a cambiar, se detendrá la escritura.</p>
                <button disabled={busy} onClick={() => { void act(async () => { const result = await operationRuntime().conflicts.confirm(ownerId, proposal); setProposal(null); await inspect(detail.id); if (result.status !== 'confirmed') setError('Propuesta guardada en este dispositivo; aún no tiene confirmación del servidor.'); }); }}>Confirmar resolución</button>
            </div>}
            <button className="mt-3 underline" onClick={() => { setDetail(null); setProposal(null); }}>Cerrar comparación; conservar conflicto</button>
        </div>}
        <button className="underline mt-3" disabled={busy} onClick={() => { void act(exportData); }}>Exportar registros afectados y originales</button>
    </section>;
}
