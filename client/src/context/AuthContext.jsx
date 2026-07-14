import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { unsubscribeFromPush } from '../utils/push';

const AuthContext = createContext(null);

const TOKEN_KEY = 'nexlift_token';
const USER_KEY = 'nexlift_user';

export function AuthProvider({ children }) {
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
            } catch (e) {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(USER_KEY);
                setLoading(false);
                return;
            }

            setToken(savedToken);
            setUser(parsedUser);

            // Verify token is still valid
            api.getProfile(savedToken)
                .then(profile => {
                    setUser(profile);
                    localStorage.setItem(USER_KEY, JSON.stringify(profile));
                })
                .catch((err) => {
                    // Solo cerrar sesión si el token es realmente inválido (401/auth).
                    // En errores de red (backend caído) mantener la sesión guardada.
                    if (err && err.status === 401) {
                        logout();
                    }
                    // Error de red/transitorio: conservar el usuario almacenado.
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    // Tras login/register, pedir /auth/me para tener el shape completo
    // (_count, securityQuestion, etc.) — la respuesta de login/register es más magra.
    const persistSession = async (authToken, fallbackUser) => {
        setToken(authToken);
        localStorage.setItem(TOKEN_KEY, authToken);
        try {
            const profile = await api.getProfile(authToken);
            setUser(profile);
            localStorage.setItem(USER_KEY, JSON.stringify(profile));
            return profile;
        } catch {
            setUser(fallbackUser);
            localStorage.setItem(USER_KEY, JSON.stringify(fallbackUser));
            return fallbackUser;
        }
    };

    const login = async (username, password) => {
        const { user: userData, token: authToken } = await api.login(username, password);
        return persistSession(authToken, userData);
    };

    const register = async (userData) => {
        const { user: newUser, token: authToken } = await api.register(userData);
        return persistSession(authToken, newUser);
    };

    const logout = () => {
        // Best-effort: revocar la suscripción push de este dispositivo para que la
        // siguiente persona que inicie sesión no siga recibiendo notificaciones de
        // la cuenta anterior. Nunca debe bloquear ni fallar el logout.
        unsubscribeFromPush().catch(() => {});

        setUser(null);
        setToken(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    };

    const updateProfile = async (data) => {
        const updated = await api.updateProfile(token, data);
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
        const profile = await api.getProfile(effectiveToken);
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

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
