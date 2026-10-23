import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { remoteClient, accountScope, invalidateAccount, isCurrentScope } from './remote';
import { operationRuntime } from '../services/api';
import { getQueue, subscribeQueueChange } from '../services/offlineQueue';

export default function RemoteProvider({ children }) {
    const { user, token } = useAuth();
    const scope = accountScope(user?.id ?? null, token);
    useEffect(() => {
        if (!scope) return;
        let live = true, timer, running = false, dirty = false;
        const seen = new Set();
        const runtime = operationRuntime();
        const refresh = async () => {
            // No full journal read when only the inactive auth query exists,
            // or all unobserved views already await revalidation. This matters
            // during long workouts and large recovered queues.
            if (!remoteClient.getQueryCache().getAll().some(query => query.queryKey[3] !== 'profile'
                && (query.isActive() || (query.state.data !== undefined && !query.state.isInvalidated)))) return;
            if (running) { dirty = true; return; }
            running = true;
            try {
                const operations = await runtime.store.list(scope.ownerId, { includeHistory: false });
                if (!live || !isCurrentScope(scope)) return;
                // These statuses are written ONLY after the existing verifier.
                // Pending/409/incompatible/recovered connection never commit.
                const receipts = [...operations.filter(x => x.status === 'confirmed' && x.receipt),
                    ...getQueue({ includeSynced: true }).filter(x => x.ownerId === scope.ownerId && x.status === 'synced' && x.receipt)];
                let changed = false;
                for (const item of receipts) if (!seen.has(item.id)) { seen.add(item.id); changed = true; }
                if (changed) invalidateAccount(scope);
            } catch { /* Existing storage indicators report storage failures. */ }
            finally { running = false; if (dirty && live) { dirty = false; schedule(); } }
        };
        const schedule = () => { timer ??= setTimeout(() => { timer = undefined; void refresh(); }, 250); };
        const onCommit = () => invalidateAccount(scope);
        const off = runtime.store.subscribe(schedule), offLegacy = subscribeQueueChange(schedule);
        window.addEventListener('nexlift-remote-commit', onCommit);
        void refresh();
        return () => { live = false; clearTimeout(timer); off(); offLegacy(); window.removeEventListener('nexlift-remote-commit', onCommit); };
    }, [scope]);
    return <QueryClientProvider client={remoteClient}>{children}</QueryClientProvider>;
}
