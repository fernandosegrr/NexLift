import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

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

    const login = async (username, password) => {
        const { user: userData, token: authToken } = await api.login(username, password);
        setUser(userData);
        setToken(authToken);
        localStorage.setItem(TOKEN_KEY, authToken);
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
        return userData;
    };

    const register = async (userData) => {
        const { user: newUser, token: authToken } = await api.register(userData);
        setUser(newUser);
        setToken(authToken);
        localStorage.setItem(TOKEN_KEY, authToken);
        localStorage.setItem(USER_KEY, JSON.stringify(newUser));
        return newUser;
    };

    const logout = () => {
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

    const refreshProfile = async () => {
        if (!token) return;
        const profile = await api.getProfile(token);
        setUser(profile);
        localStorage.setItem(USER_KEY, JSON.stringify(profile));
        return profile;
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
        refreshProfile
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
