import type { ReactNode, ReactElement } from 'react';
export interface AuthUser { id: string; [key: string]: unknown }
export interface AuthValue { user: AuthUser | null; token: string | null; loading: boolean; isAuthenticated: boolean; login: (username: string, password: string) => Promise<unknown>; register: (data: Record<string, unknown>) => Promise<unknown>; logout: () => void; updateProfile: (data: Record<string, unknown>) => Promise<unknown>; refreshProfile: (tokenOverride?: string) => Promise<unknown>; updateToken: (token: string) => void }
export function useAuth(): AuthValue;
export function AuthProvider(props: { children: ReactNode }): ReactElement;
