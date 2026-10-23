import { QueryClient } from '@tanstack/react-query';

export class RemoteReadError extends Error {
    constructor(message: string, readonly code: 'session_changed' | 'incompatible') { super(message); }
}
export interface AccountScope { ownerId: string; generation: number; token: string }
let generation = 0;
let active: AccountScope | null = null;
export const remoteClient = new QueryClient({ defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 300_000, retry: retryRead,
        refetchOnWindowFocus: true, refetchOnReconnect: true },
    mutations: { retry: false, networkMode: 'always' },
} });

export function retryRead(count: number, error: unknown): boolean {
    if (count >= 1 || error instanceof RemoteReadError) return false;
    if (!error || typeof error !== 'object') return false;
    if ('status' in error) return error.status === 503 || error.status === 502 || error.status === 504;
    return 'isNetworkError' in error && error.isNetworkError === true;
}

// Tokens never occur in query keys. A generation also isolates logout/login of
// the SAME account and token rotation. Cancel + clear only touches remote RAM.
export function accountScope(ownerId: string | null, token: string | null): AccountScope | null {
    if (active?.ownerId === ownerId && active?.token === token) return active;
    void remoteClient.cancelQueries();
    remoteClient.clear();
    active = ownerId && token ? { ownerId, token, generation: ++generation } : null;
    return active;
}
export function queryKey(scope: AccountScope | null, domain: string, params: readonly unknown[] = []): readonly unknown[] {
    return ['nexlift', scope?.generation ?? 0, scope?.ownerId ?? null, domain, ...params];
}
export function isCurrentScope(scope: AccountScope): boolean {
    return active === scope && globalThis.localStorage?.getItem('nexlift_token') === scope.token;
}
export async function guardedRead<T>(scope: AccountScope, signal: AbortSignal, load: () => Promise<unknown>, decode: (value: unknown) => T): Promise<T> {
    if (!isCurrentScope(scope) || signal.aborted) throw new RemoteReadError('La sesión cambió.', 'session_changed');
    const value: unknown = await load();
    if (!isCurrentScope(scope) || signal.aborted) throw new RemoteReadError('La sesión cambió.', 'session_changed');
    return decode(value);
}
export function readObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RemoteReadError('Respuesta incompatible; vuelve a consultar.', 'incompatible');
    return Object.fromEntries(Object.entries(value));
}
export function readCollection(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new RemoteReadError('Respuesta incompatible; vuelve a consultar.', 'incompatible');
    return value.map(readObject);
}
export function invalidateAccount(scope: AccountScope): void {
    if (isCurrentScope(scope)) void remoteClient.invalidateQueries({ queryKey: ['nexlift', scope.generation, scope.ownerId] });
}

export async function queryProfile(token: string, ownerId: string, load: () => Promise<unknown>): Promise<Record<string, unknown>> {
    if (globalThis.localStorage?.getItem('nexlift_token') !== token) throw new RemoteReadError('La sesión cambió.', 'session_changed');
    const scope = accountScope(ownerId, token);
    if (!scope) throw new RemoteReadError('Inicia sesión.', 'session_changed');
    // Auth bootstrap must settle offline, so the saved account can open its
    // durable drafts. Query's normal online pause must not hold Auth.loading.
    return remoteClient.fetchQuery({ queryKey: queryKey(scope, 'profile'), staleTime: 0, networkMode: 'always', retry: false,
        queryFn: ({ signal }) => guardedRead(scope, signal, load, value => {
            const profile = readObject(value);
            if (profile.id !== ownerId) throw new RemoteReadError('Perfil incompatible con la cuenta.', 'incompatible');
            return profile;
        }) });
}
