import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X, Trophy } from 'lucide-react';

// Context para usar toasts globalmente
const ToastContext = createContext(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

// Proveedor de Toasts
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const toast = {
        success: (msg, duration) => addToast(msg, 'success', duration),
        error: (msg, duration) => addToast(msg, 'error', duration),
        info: (msg, duration) => addToast(msg, 'info', duration),
        pr: (msg, duration) => addToast(msg, 'pr', duration || 4000), // Celebración de PR
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
}

// Contenedor de toasts fijo en pantalla
function ToastContainer({ toasts, removeToast }) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90%] max-w-sm pointer-events-none">
            {toasts.map(toast => (
                <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

// Toast individual
function Toast({ toast, onClose }) {
    const { type, message } = toast;

    const styles = {
        success: {
            bg: 'bg-green-500/90',
            icon: CheckCircle,
            iconColor: 'text-white'
        },
        error: {
            bg: 'bg-red-500/90',
            icon: AlertCircle,
            iconColor: 'text-white'
        },
        info: {
            bg: 'bg-[var(--primary)]/90',
            icon: Info,
            iconColor: 'text-white'
        },
        pr: {
            bg: 'bg-gradient-to-r from-yellow-500 to-orange-500',
            icon: Trophy,
            iconColor: 'text-white'
        }
    };

    const style = styles[type] || styles.info;
    const Icon = style.icon;

    return (
        <div
            className={`${style.bg} backdrop-blur-sm text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slide-down pointer-events-auto`}
        >
            <Icon size={20} className={`${style.iconColor} shrink-0`} />
            <span className="flex-1 text-sm font-medium">{message}</span>
            <button
                onClick={onClose}
                className="p-1 hover:bg-white/20 rounded-full transition-colors shrink-0"
            >
                <X size={16} />
            </button>
        </div>
    );
}

export default Toast;
