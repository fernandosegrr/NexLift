import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { accountScope, guardedRead, queryKey } from './remote';

// Forms/drafts never initialize from a refetch in this hook. Only remote views
// subscribe. Callers pass all server filters in params, including civil dates.
export function useRemoteRead<T>(
    domain: string, params: readonly unknown[], load: () => Promise<unknown>,
    decode: (value: unknown) => T,
    enabled = true,
): UseQueryResult<T, Error> {
    const { user, token } = useAuth();
    const scope = accountScope(user?.id ?? null, token ?? null);
    return useQuery({ queryKey: queryKey(scope, domain, params), enabled: !!scope && enabled,
        queryFn: ({ signal }) => {
            if (!scope) throw new Error('Inicia sesión para consultar.');
            return guardedRead(scope, signal, load, decode);
        } });
}
