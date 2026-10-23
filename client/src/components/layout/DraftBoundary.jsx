import { useEffect, useState } from 'react';
import { getStorageRuntime, indexedStorageEnabled } from '../../storage/runtime.js';
import { PreparedDraft } from '../../storage/usePreparedDraft.js';
import { operationRuntime } from '../../services/api.js';

export default function DraftBoundary(props) {
    return indexedStorageEnabled ? <IndexedDraftBoundary {...props} /> : props.children;
}
function IndexedDraftBoundary({ kind, resourceId, ownerId, children }) {
    const [state, setState] = useState({ store: null, error: null });
    useEffect(() => {
        let current = true;
        const editor = getStorageRuntime().drafts.editor(kind, resourceId, ownerId);
        void editor.load().then(data => {
            if (current) setState({ store: { originalDay: editor.originalDay, load: () => data,
                async save(content) {
                    const transport = operationRuntime().transport, session = transport.snapshot();
                    if (!session || session.ownerId !== ownerId || !await transport.bound(session)) throw new Error('Verifica esta cuenta con conexión antes de guardar el borrador.');
                    transport.assertSession(session); return editor.save(content);
                }
            }, error: null });
        }).catch(error => { if (current) setState({ store: null, error: error.message }); });
        return () => { current = false; };
    }, [kind, resourceId, ownerId]);
    if (!state.store) return <p role={state.error ? 'alert' : 'status'} className="p-4 text-sm">{state.error || 'Preparando almacenamiento offline'}</p>;
    return <PreparedDraft.Provider value={state.store}>{children}</PreparedDraft.Provider>;
}
