import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings, LogOut, Camera, Award, Dumbbell, Scale, Crown, X,
    Phone, Calendar
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024; // 8 MB antes de comprimir

export default function Profile() {
    const navigate = useNavigate();
    const { user, logout, refreshProfile } = useAuth();
    const toast = useToast();
    const fileInputRef = useRef(null);

    const [loading, setLoading] = useState(false);
    const [showAvatarModal, setShowAvatarModal] = useState(false);

    const handleAvatarClick = () => {
        // Permite re-elegir el mismo archivo (onchange no dispara si no se limpia)
        if (fileInputRef.current) fileInputRef.current.value = '';
        fileInputRef.current?.click();
    };

    // Compress image for avatar
    const compressImage = (file, maxSize = 400) => {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            img.onload = () => {
                let { width, height } = img;
                const ratio = Math.min(maxSize / width, maxSize / height);
                if (ratio < 1) {
                    width *= ratio;
                    height *= ratio;
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(objectUrl);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('No se pudo cargar la imagen'));
            };
            img.src = objectUrl;
        });
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Selecciona un archivo de imagen');
            return;
        }
        if (file.size > MAX_AVATAR_BYTES) {
            toast.error('La imagen es demasiado grande (máx. 8 MB)');
            return;
        }

        setLoading(true);

        try {
            const compressedBase64 = await compressImage(file, 400);
            await api.updateAvatar(compressedBase64);
            await refreshProfile();
            toast.success('Foto actualizada');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'No se pudo actualizar la foto');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // birthDate puede llegar como ISO completo; parsear solo la parte de fecha
    // para no desfasar un día por zona horaria (UTC vs local).
    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        const dateOnly = String(dateStr).split('T')[0];
        const [year, month, day] = dateOnly.split('-').map(Number);
        if (!year || !month || !day) return null;
        const date = new Date(year, month - 1, day, 12, 0, 0);
        return date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const getInitials = () => {
        return `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';
    };

    const getMembershipDays = () => {
        if (!user?.createdAt) return 0;
        const created = new Date(user.createdAt);
        const now = new Date();
        const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
        return Math.max(0, days);
    };

    if (!user) return null;

    const birthLabel = formatDate(user.birthDate);

    return (
        <div className="pb-24 max-w-2xl mx-auto">
            {/* Hero Header with Gradient + Settings Button */}
            <div className="relative mb-6">
                <div className="h-32 bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 rounded-b-3xl" />

                <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    aria-label="Configuración"
                    className="absolute top-4 right-4 w-10 h-10 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/40 transition-colors"
                >
                    <Settings className="w-5 h-5" />
                </button>

                {/* Avatar Floating */}
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                    <div className="relative">
                        {user.avatarUrl ? (
                            <button
                                type="button"
                                onClick={() => setShowAvatarModal(true)}
                                aria-label="Ver foto de perfil"
                                className="block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                            >
                                <img
                                    src={user.avatarUrl}
                                    alt={`Foto de ${user.firstName || user.username}`}
                                    loading="lazy"
                                    className="w-24 h-24 rounded-full border-4 border-[var(--bg-dark)] object-cover shadow-xl hover:scale-105 transition-transform"
                                />
                            </button>
                        ) : (
                            <div
                                className="w-24 h-24 rounded-full border-4 border-[var(--bg-dark)] bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-3xl font-bold text-white shadow-xl"
                                aria-hidden="true"
                            >
                                {getInitials()}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleAvatarClick}
                            disabled={loading}
                            aria-label="Cambiar foto de perfil"
                            className="absolute -bottom-1 -right-1 w-8 h-8 bg-[var(--primary)] rounded-full border-2 border-[var(--bg-dark)] flex items-center justify-center shadow-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
                        >
                            {loading
                                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <Camera className="w-4 h-4 text-white" />}
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleAvatarChange}
                            accept="image/*"
                            className="hidden"
                            aria-hidden="true"
                        />

                        <div
                            className="absolute bottom-1 left-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[var(--bg-dark)]"
                            title="En línea"
                            aria-hidden="true"
                        />
                    </div>
                </div>
            </div>

            {/* User Info */}
            <div className="mt-14 text-center px-4">
                <div className="flex flex-col items-center justify-center mb-1">
                    <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 mb-1 flex items-center gap-2">
                        @{user.username}
                        {user.username === 'fernando.segrr' && (
                            <span className="px-2 py-0.5 text-[10px] bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-bold uppercase tracking-wider shadow-lg shadow-purple-500/30 border border-white/10">
                                Creador
                            </span>
                        )}
                    </p>
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg text-[var(--text-secondary)] font-medium">
                            {user.firstName} {user.lastName}
                        </h1>
                        <Crown className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                    </div>
                </div>
                {user.email && (
                    <p className="text-sm text-[var(--text-secondary)] mt-1 break-all">{user.email}</p>
                )}

                {/* Contact / birth chips when set in Configuración */}
                {(user.phone || birthLabel) && (
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                        {user.phone && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                                {user.phone}
                            </span>
                        )}
                        {birthLabel && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                                {birthLabel}
                            </span>
                        )}
                    </div>
                )}

                <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 bg-purple-500/10 rounded-full border border-purple-500/30">
                    <Award className="w-4 h-4 text-purple-400" aria-hidden="true" />
                    <span className="text-sm text-purple-400">
                        Miembro por {getMembershipDays()} {getMembershipDays() === 1 ? 'día' : 'días'}
                    </span>
                </div>
            </div>

            {/* Stats Cards */}
            {user._count && (
                <div className="grid grid-cols-3 gap-3 px-4 mt-6">
                    <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl p-4 border border-purple-500/20 text-center">
                        <Dumbbell className="w-6 h-6 text-purple-400 mx-auto mb-2" aria-hidden="true" />
                        <p className="text-2xl font-bold text-white">{user._count.routines ?? 0}</p>
                        <p className="text-xs text-[var(--text-secondary)]">Rutinas</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-2xl p-4 border border-blue-500/20 text-center">
                        <Scale className="w-6 h-6 text-blue-400 mx-auto mb-2" aria-hidden="true" />
                        <p className="text-2xl font-bold text-white">{user._count.bodyLogs ?? 0}</p>
                        <p className="text-xs text-[var(--text-secondary)]">Mediciones</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-2xl p-4 border border-amber-500/20 text-center">
                        <Award className="w-6 h-6 text-amber-400 mx-auto mb-2" aria-hidden="true" />
                        <p className="text-2xl font-bold text-white">{user._count.personalRecords ?? 0}</p>
                        <p className="text-xs text-[var(--text-secondary)]">PRs</p>
                    </div>
                </div>
            )}

            <div className="px-4 mt-6">
                <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full py-3 bg-red-500/10 text-red-400 font-medium rounded-xl border border-red-500/30 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                >
                    <LogOut className="w-5 h-5" aria-hidden="true" />
                    Cerrar Sesión
                </button>
            </div>

            {/* Avatar Modal */}
            {showAvatarModal && user.avatarUrl && (
                <Portal>
                    <div
                        className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm"
                        onClick={() => setShowAvatarModal(false)}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Foto de perfil"
                    >
                        <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={() => setShowAvatarModal(false)}
                                aria-label="Cerrar"
                                className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors p-2"
                            >
                                <X size={32} />
                            </button>
                            <img
                                src={user.avatarUrl}
                                alt={`Foto de ${user.firstName || user.username}`}
                                className="w-full h-auto rounded-2xl shadow-2xl border border-[var(--border)]"
                            />
                            <div className="mt-6 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAvatarModal(false);
                                        handleAvatarClick();
                                    }}
                                    className="flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-full font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/25"
                                >
                                    <Camera size={20} aria-hidden="true" />
                                    Cambiar Foto
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
}
