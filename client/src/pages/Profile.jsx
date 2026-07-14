import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Settings, LogOut, Camera, Award, Dumbbell, Scale, X,
    Phone, Calendar, ChevronRight, Crown, HeartPulse
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';
import { cloudinaryThumb, cloudinaryDisplay } from '../utils/cloudinary';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

export default function Profile() {
    const navigate = useNavigate();
    const { user, logout, refreshProfile } = useAuth();
    const toast = useToast();
    const fileInputRef = useRef(null);

    const [loading, setLoading] = useState(false);
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [avatarReady, setAvatarReady] = useState(false);

    // Nueva URL → reset del fade-in
    useEffect(() => {
        setAvatarReady(false);
    }, [user?.avatarUrl]);

    const handleAvatarClick = () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
        fileInputRef.current?.click();
    };

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

    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        const dateOnly = String(dateStr).split('T')[0];
        const [year, month, day] = dateOnly.split('-').map(Number);
        if (!year || !month || !day) return null;
        const date = new Date(year, month - 1, day, 12, 0, 0);
        return date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const getInitials = () =>
        `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';

    const getMembershipDays = () => {
        if (!user?.createdAt) return 0;
        const created = new Date(user.createdAt);
        return Math.max(0, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)));
    };

    if (!user) return null;

    const isCreator = user.username === 'fernando.segrr';
    const birthLabel = formatDate(user.birthDate);
    const avatarThumb = user.avatarUrl
        ? cloudinaryThumb(user.avatarUrl, { width: 240, height: 240, crop: 'fill', quality: 'auto' })
        : null;
    const avatarFull = user.avatarUrl ? cloudinaryDisplay(user.avatarUrl) : null;
    const membershipDays = getMembershipDays();

    return (
        <div className="max-w-lg mx-auto pb-8 animate-fade-in">
            {/* Top bar: solo acciones, sin logo de app */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-white">Perfil</h1>
                <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    aria-label="Configuración"
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-white hover:border-[var(--primary)]/40 transition-colors"
                >
                    <Settings className="w-5 h-5" />
                </button>
            </div>

            {/* Identity card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-6 mb-4">
                <div className="flex flex-col items-center text-center">
                    {/* Avatar */}
                    <div className="relative mb-4">
                        {avatarThumb ? (
                            <button
                                type="button"
                                onClick={() => setShowAvatarModal(true)}
                                aria-label="Ver foto de perfil"
                                className="relative block w-[88px] h-[88px] rounded-full overflow-hidden ring-2 ring-[var(--primary)]/40 ring-offset-2 ring-offset-[var(--bg-card)] focus-ring bg-[var(--bg-dark)]"
                            >
                                {!avatarReady && (
                                    <span
                                        className="absolute inset-0 flex items-center justify-center text-xl font-bold text-white bg-[var(--primary)]"
                                        aria-hidden
                                    >
                                        {getInitials()}
                                    </span>
                                )}
                                <img
                                    src={avatarThumb}
                                    alt=""
                                    width={88}
                                    height={88}
                                    decoding="async"
                                    fetchPriority="high"
                                    onLoad={() => setAvatarReady(true)}
                                    className={`w-full h-full object-cover transition-opacity duration-200 ${
                                        avatarReady ? 'opacity-100' : 'opacity-0'
                                    }`}
                                />
                            </button>
                        ) : (
                            <div
                                className="w-[88px] h-[88px] rounded-full bg-[var(--primary)] flex items-center justify-center text-2xl font-bold text-white ring-2 ring-[var(--primary)]/40 ring-offset-2 ring-offset-[var(--bg-card)]"
                                aria-hidden
                            >
                                {getInitials()}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleAvatarClick}
                            disabled={loading}
                            aria-label="Cambiar foto de perfil"
                            className="absolute -bottom-0.5 -right-0.5 w-9 h-9 min-w-[36px] min-h-[36px] bg-[var(--primary)] rounded-full border-2 border-[var(--bg-card)] flex items-center justify-center shadow-md hover:brightness-110 disabled:opacity-50"
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
                            aria-hidden
                        />
                    </div>

                    <h2 className="text-lg font-bold text-white leading-tight">
                        {user.firstName} {user.lastName}
                    </h2>
                    <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
                        <p className="text-sm text-[var(--text-secondary)]">@{user.username}</p>
                        {isCreator && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
                                <Crown className="w-3 h-3" aria-hidden />
                                Creador
                            </span>
                        )}
                    </div>

                    {user.email && (
                        <p className="text-xs text-[var(--text-secondary)]/80 mt-2 break-all max-w-full px-2">
                            {user.email}
                        </p>
                    )}

                    {(user.phone || birthLabel) && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                            {user.phone && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-dark)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                    <Phone className="w-3 h-3" aria-hidden />
                                    {user.phone}
                                </span>
                            )}
                            {birthLabel && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-dark)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                    <Calendar className="w-3 h-3" aria-hidden />
                                    {birthLabel}
                                </span>
                            )}
                        </div>
                    )}

                    <p className="mt-3 text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-[var(--primary)]" aria-hidden />
                        Miembro · {membershipDays} {membershipDays === 1 ? 'día' : 'días'}
                    </p>
                </div>

                {/* Stats row */}
                {user._count && (
                    <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-[var(--border)]">
                        <div className="text-center">
                            <Dumbbell className="w-4 h-4 text-[var(--primary)] mx-auto mb-1" aria-hidden />
                            <p className="text-lg font-bold tabular-nums text-white">{user._count.routines ?? 0}</p>
                            <p className="text-[10px] text-[var(--text-secondary)]">Rutinas</p>
                        </div>
                        <div className="text-center border-x border-[var(--border)]">
                            <Scale className="w-4 h-4 text-[var(--accent)] mx-auto mb-1" aria-hidden />
                            <p className="text-lg font-bold tabular-nums text-white">{user._count.bodyLogs ?? 0}</p>
                            <p className="text-[10px] text-[var(--text-secondary)]">Mediciones</p>
                        </div>
                        <div className="text-center">
                            <Award className="w-4 h-4 text-[var(--warning)] mx-auto mb-1" aria-hidden />
                            <p className="text-lg font-bold tabular-nums text-white">{user._count.personalRecords ?? 0}</p>
                            <p className="text-[10px] text-[var(--text-secondary)]">PRs</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Menu */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden mb-4">
                <Link
                    to="/cardio"
                    className="flex items-center gap-3 min-h-[52px] px-4 py-3 border-b border-[var(--border)] active:bg-[var(--bg-dark)]/60"
                >
                    <span className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
                        <HeartPulse className="w-4 h-4 text-rose-400" aria-hidden />
                    </span>
                    <span className="flex-1 font-medium text-sm text-left">Cardio</span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden />
                </Link>
                <Link
                    to="/body"
                    className="flex items-center gap-3 min-h-[52px] px-4 py-3 border-b border-[var(--border)] active:bg-[var(--bg-dark)]/60"
                >
                    <span className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                        <Scale className="w-4 h-4 text-[var(--accent)]" aria-hidden />
                    </span>
                    <span className="flex-1 font-medium text-sm text-left">Cuerpo y mediciones</span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden />
                </Link>
                <Link
                    to="/settings"
                    className="flex items-center gap-3 min-h-[52px] px-4 py-3 active:bg-[var(--bg-dark)]/60"
                >
                    <span className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center shrink-0">
                        <Settings className="w-4 h-4 text-[var(--primary)]" aria-hidden />
                    </span>
                    <span className="flex-1 font-medium text-sm text-left">Configuración</span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden />
                </Link>
            </div>

            <button
                type="button"
                onClick={handleLogout}
                className="w-full min-h-[48px] py-3 rounded-2xl font-medium text-sm text-red-400 bg-red-500/10 border border-red-500/25 hover:bg-red-500/15 flex items-center justify-center gap-2"
            >
                <LogOut className="w-4 h-4" aria-hidden />
                Cerrar sesión
            </button>

            {showAvatarModal && avatarFull && (
                <Portal>
                    <div
                        className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 animate-fade-in"
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
                                className="absolute -top-12 right-0 text-white/70 hover:text-white p-2 min-w-[44px] min-h-[44px]"
                            >
                                <X size={28} />
                            </button>
                            <img
                                src={avatarFull}
                                alt={`Foto de ${user.firstName || user.username}`}
                                className="w-full h-auto rounded-2xl border border-[var(--border)]"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAvatarModal(false);
                                    handleAvatarClick();
                                }}
                                className="mt-4 w-full min-h-[48px] flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-white rounded-2xl font-medium"
                            >
                                <Camera size={18} aria-hidden />
                                Cambiar foto
                            </button>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
}
