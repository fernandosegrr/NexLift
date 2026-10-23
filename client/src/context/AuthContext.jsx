import { accountScope, queryProfile, invalidateAccount } from '../app/remote';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api, replayOfflineQueue } from '../services/api';
import { unsubscribeFromPush } from '../utils/push';
import { clearHomeCache } from '../utils/homeCache';

const AuthContext = createContext(null);

const TOKEN_KEY = 'nexlift_token';
const USER_KEY = 'nexlift_user';

export function AuthProvider({ children }) {
    const authGeneration = useRef(0);
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    // Initialize from localStorage
    useEffect(() => {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        const savedUser = localStorage.getItem(USER_KEY);

        if (savedToken && savedUser) {
            // Parsear usuario guardado de forma segura: si está corrupto, cerrar sesión
            let parsedUser = null;
            try {
                parsedUser = JSON.parse(savedUser);
            } catch {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(USER_KEY);
                setLoading(false);
                return;
            }

            setToken(savedToken);
            setUser(parsedUser);

            // Verify token is still valid
            queryProfile(savedToken, parsedUser.id, () => api.getProfile(savedToken))
                .then(profile => {
                    if (localStorage.getItem(TOKEN_KEY) !== savedToken) return;
                    setUser(profile);
                    localStorage.setItem(USER_KEY, JSON.stringify(profile));
                    void replayOfflineQueue({ resumeAuth: true }).catch(() => {});
                })
                .catch((err) => {
                    // Solo cerrar sesión si el token es realmente inválido (401/auth).
                    // En errores de red (backend caído) mantener la sesión guardada.
                    if (err && err.status === 401 && localStorage.getItem(TOKEN_KEY) === savedToken) {
                        // Function declaration is hoisted; this asynchronous rejection runs after initialization.
                        // eslint-disable-next-line react-hooks/immutability
                        logout();
                    }
                    // Error de red/transitorio: conservar el usuario almacenado.
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const onStorage = event => {
            if (event.key !== TOKEN_KEY && event.key !== USER_KEY && event.key !== null) return;
            if (event.key === TOKEN_KEY || event.key === null) authGeneration.current++;
            try {
                setToken(localStorage.getItem(TOKEN_KEY));
                setUser(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
            } catch { setToken(null); setUser(null); }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Tras login/register, pedir /auth/me para tener el shape completo
    // (_count, securityQuestion, etc.) — la respuesta de login/register es más magra.
    const persistSession = async (authToken, fallbackUser) => {
        setToken(authToken);
        localStorage.setItem(TOKEN_KEY, authToken);
        setUser(fallbackUser);
        localStorage.setItem(USER_KEY, JSON.stringify(fallbackUser));
        window.dispatchEvent?.(new Event('nexlift-session-change'));
        try {
            const profile = await queryProfile(authToken, fallbackUser.id, () => api.getProfile(authToken));
            if (localStorage.getItem(TOKEN_KEY) !== authToken) return fallbackUser;
            setUser(profile);
            localStorage.setItem(USER_KEY, JSON.stringify(profile));
            void replayOfflineQueue({ resumeAuth: true }).catch(() => {});
            return profile;
        } catch {
            if (localStorage.getItem(TOKEN_KEY) !== authToken) return fallbackUser;
            setUser(fallbackUser);
            localStorage.setItem(USER_KEY, JSON.stringify(fallbackUser));
            return fallbackUser;
        }
    };

    // Session recovery can resume read-only inspection, never transfer ownership.
    useEffect(() => {
        if (token && user?.id) void replayOfflineQueue().catch(() => {});
    }, [token, user?.id]);

    const login = async (username, password) => {
        const generation = ++authGeneration.current;
        const { user: userData, token: authToken } = await api.login(username, password);
        if (generation !== authGeneration.current) throw new Error('La sesión cambió');
        return persistSession(authToken, userData);
    };

    const register = async (userData) => {
        const generation = ++authGeneration.current;
        const { user: newUser, token: authToken } = await api.register(userData);
        if (generation !== authGeneration.current) throw new Error('La sesión cambió');
        return persistSession(authToken, newUser);
    };

    function logout() {
        authGeneration.current++;
        accountScope(null, null);
        // Best-effort: revocar la suscripción push de este dispositivo para que la
        // siguiente persona que inicie sesión no siga recibiendo notificaciones de
        // la cuenta anterior. Nunca debe bloquear ni fallar el logout.
        const departingToken = localStorage.getItem(TOKEN_KEY);
        unsubscribeFromPush(departingToken).catch(() => {});

        setUser(null);
        setToken(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.dispatchEvent?.(new Event('nexlift-session-change'));
        clearHomeCache();
    };

    const updateProfile = async (data) => {
        const updated = await api.updateProfile(token, data);
        if (localStorage.getItem(TOKEN_KEY) !== token) return updated;
        const scope = accountScope(user.id, token);
        if (scope) invalidateAccount(scope);
        setUser(prev => {
            const merged = { ...prev, ...updated };
            // Persistir el objeto exacto derivado del estado previo (evita closure obsoleto)
            localStorage.setItem(USER_KEY, JSON.stringify(merged));
            return merged;
        });
        return updated;
    };

    const refreshProfile = async (tokenOverride) => {
        // Acepta un token explícito para el caso en que se llama justo después de
        // updateToken() en el mismo tick: el `token` del closure aún no se actualizó
        // (setState es asíncrono), así que sin el override se usaría el token viejo.
        const effectiveToken = tokenOverride || token;
        if (!effectiveToken) return;
        const profile = await queryProfile(effectiveToken, user.id, () => api.getProfile(effectiveToken));
        if (localStorage.getItem(TOKEN_KEY) !== effectiveToken) return;
        setUser(profile);
        localStorage.setItem(USER_KEY, JSON.stringify(profile));
        return profile;
    };

    // Persiste un token nuevo exactamente igual que login(), sin tocar user/otros
    // datos. Usado cuando el backend rota el token (p.ej. al cambiar contraseña o
    // pregunta de seguridad, que invalida los tokens previos) para que la sesión
    // actual no se cierre sola.
    const updateToken = (newToken) => {
        setToken(newToken);
        localStorage.setItem(TOKEN_KEY, newToken);
        window.dispatchEvent?.(new Event('nexlift-session-change'));
    };

    const value = {
        user,
        token,
        loading,
        isAuthenticated: !!token,
        login,
        register,
        logout,
        updateProfile,
        refreshProfile,
        updateToken
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// Preserve the existing public import path; this mixed module uses full HMR invalidation.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
