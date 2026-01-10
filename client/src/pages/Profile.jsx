import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Mail, Phone, Calendar, Lock, Shield, LogOut,
    Save, Eye, EyeOff, AlertCircle, CheckCircle,
    Loader2, Edit2, X, Camera, Award, Dumbbell, Scale, Crown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export default function Profile() {
    const navigate = useNavigate();
    const { user, token, logout, refreshProfile } = useAuth();
    const fileInputRef = useRef(null);

    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [showAvatarModal, setShowAvatarModal] = useState(false);

    // Profile edit state
    const [editMode, setEditMode] = useState(false);
    const [profileData, setProfileData] = useState({
        firstName: '',
        lastName: '',
        phone: '',
        birthDate: ''
    });

    // Password change state
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showPasswords, setShowPasswords] = useState(false);

    // Security question state
    const [securityData, setSecurityData] = useState({
        question: '',
        answer: ''
    });

    const securityQuestions = [
        'Nombre de tu primera mascota',
        'Ciudad donde naciste',
        'Nombre de tu mejor amigo de infancia',
        'Marca de tu primer carro',
        'Nombre de tu escuela primaria',
        'Apodo de un familiar cercano'
    ];

    useEffect(() => {
        if (user) {
            setProfileData({
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                phone: user.phone || '',
                birthDate: user.birthDate ? user.birthDate.split('T')[0] : ''
            });
            setSecurityData({
                question: user.securityQuestion || '',
                answer: ''
            });
        }
    }, [user]);

    // Refresh profile when tab becomes visible again
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && token) {
                refreshProfile();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [token, refreshProfile]);

    const handleUpdateProfile = async () => {
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            await api.updateProfile(token, profileData);
            await refreshProfile();
            setSuccess('Perfil actualizado');
            setEditMode(false);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (passwordData.newPassword.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres');
            return;
        }

        setLoading(true);

        try {
            await api.changePassword(token, passwordData.currentPassword, passwordData.newPassword);
            setSuccess('Contraseña cambiada exitosamente');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSecurity = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!securityData.question || !securityData.answer) {
            setError('Pregunta y respuesta requeridas');
            return;
        }

        setLoading(true);

        try {
            await api.updateSecurityQuestion(token, securityData.question, securityData.answer);
            await refreshProfile();
            setSuccess('Pregunta de seguridad actualizada');
            setSecurityData(prev => ({ ...prev, answer: '' }));
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    // Compress image for avatar
    const compressImage = (file, maxSize = 400) => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

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
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = URL.createObjectURL(file);
        });
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Por favor selecciona una imagen');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Compress image
            const compressedBase64 = await compressImage(file, 400);

            // Upload to backend (which uploads to Catbox)
            const res = await fetch(
                import.meta.env.PROD ? '/api/auth/avatar' : 'http://localhost:3001/api/auth/avatar',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ avatar: compressedBase64 })
                }
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to upload avatar');
            }

            await refreshProfile();
            setSuccess('Avatar actualizado');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Fix timezone issue - parse as local date, not UTC (for Birthdays)
    const formatDate = (dateStr) => {
        if (!dateStr) return 'No especificada';

        // If it's a full ISO string, extract just the date part and parse as local
        const dateOnly = dateStr.split('T')[0];
        const [year, month, day] = dateOnly.split('-').map(Number);

        // Create date using local timezone (month is 0-indexed)
        const date = new Date(year, month - 1, day);

        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Format timestamp explicitly converting UTC to Local (for Last Login)
    const formatTimestamp = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getInitials = () => {
        return `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
    };

    const getMembershipDays = () => {
        if (!user?.createdAt) return 0;
        const created = new Date(user.createdAt);
        const now = new Date();
        return Math.floor((now - created) / (1000 * 60 * 60 * 24));
    };

    if (!user) return null;

    return (
        <div className="pb-24 max-w-2xl mx-auto">
            {/* Hero Header with Gradient */}
            <div className="relative mb-6">
                <div className="h-32 bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 rounded-b-3xl" />

                {/* Avatar Floating */}
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                    <div className="relative">
                        {/* Avatar image - click to view large */}
                        {user.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={user.firstName}
                                loading="lazy"
                                onClick={() => setShowAvatarModal(true)}
                                className="w-24 h-24 rounded-full border-4 border-[var(--bg-dark)] object-cover shadow-xl cursor-pointer hover:scale-105 transition-transform"
                            />
                        ) : (
                            <div
                                className="w-24 h-24 rounded-full border-4 border-[var(--bg-dark)] bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-3xl font-bold text-white shadow-xl"
                            >
                                {getInitials()}
                            </div>
                        )}

                        {/* Camera button - separate from avatar */}
                        <button
                            onClick={handleAvatarClick}
                            className="absolute -bottom-1 -right-1 w-8 h-8 bg-[var(--primary)] rounded-full border-2 border-[var(--bg-dark)] flex items-center justify-center shadow-lg hover:bg-purple-600 transition-colors"
                        >
                            <Camera className="w-4 h-4 text-white" />
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleAvatarChange}
                            accept="image/*"
                            className="hidden"
                        />

                        {/* Online indicator */}
                        <div className="absolute bottom-1 left-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[var(--bg-dark)]" />
                    </div>
                </div>
            </div>

            {/* User Info Card */}
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
                        <h1 className="text-lg text-[var(--text-secondary)] font-medium">{user.firstName} {user.lastName}</h1>
                        <Crown className="w-4 h-4 text-yellow-400" />
                    </div>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-1">{user.email}</p>

                {/* Member badge */}
                <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 bg-purple-500/10 rounded-full border border-purple-500/30">
                    <Award className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-purple-400">Miembro por {getMembershipDays()} días</span>
                </div>
            </div>

            {/* Stats Cards */}
            {user._count && (
                <div className="grid grid-cols-3 gap-3 px-4 mt-6">
                    <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl p-4 border border-purple-500/20 text-center">
                        <Dumbbell className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{user._count.routines}</p>
                        <p className="text-xs text-[var(--text-secondary)]">Rutinas</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-2xl p-4 border border-blue-500/20 text-center">
                        <Scale className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{user._count.bodyLogs}</p>
                        <p className="text-xs text-[var(--text-secondary)]">Body Logs</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-2xl p-4 border border-amber-500/20 text-center">
                        <Award className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{user._count.personalRecords}</p>
                        <p className="text-xs text-[var(--text-secondary)]">PRs</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 px-4 mt-6 overflow-x-auto pb-2">
                {[
                    { id: 'profile', label: 'Perfil', icon: User },
                    { id: 'password', label: 'Contraseña', icon: Lock },
                    { id: 'security', label: 'Seguridad', icon: Shield }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setError(''); setSuccess(''); }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-purple-500/50'
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Alerts */}
            <div className="px-4 mt-4">
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center gap-2 text-green-400">
                        <CheckCircle className="w-5 h-5 shrink-0" />
                        <span className="text-sm">{success}</span>
                    </div>
                )}
            </div>

            {/* Tab Content */}
            <div className="px-4">
                <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]">

                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-white">Información Personal</h3>
                                <button
                                    onClick={() => setEditMode(!editMode)}
                                    className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                                >
                                    {editMode ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                                    {editMode ? 'Cancelar' : 'Editar'}
                                </button>
                            </div>

                            {editMode ? (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre(s)</label>
                                            <input
                                                type="text"
                                                value={profileData.firstName}
                                                onChange={(e) => setProfileData(p => ({ ...p, firstName: e.target.value }))}
                                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-[var(--text-secondary)] mb-1">Apellidos</label>
                                            <input
                                                type="text"
                                                value={profileData.lastName}
                                                onChange={(e) => setProfileData(p => ({ ...p, lastName: e.target.value }))}
                                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Teléfono</label>
                                        <input
                                            type="tel"
                                            value={profileData.phone}
                                            onChange={(e) => setProfileData(p => ({ ...p, phone: e.target.value }))}
                                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Fecha de Nacimiento</label>
                                        <input
                                            type="date"
                                            value={profileData.birthDate}
                                            onChange={(e) => setProfileData(p => ({ ...p, birthDate: e.target.value }))}
                                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none transition-colors"
                                        />
                                    </div>
                                    <button
                                        onClick={handleUpdateProfile}
                                        disabled={loading}
                                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Guardar Cambios
                                    </button>
                                </>
                            ) : (
                                <div className="grid gap-3">
                                    {/* Name Card */}
                                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 p-4 hover:border-purple-500/40 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                                <User className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs text-purple-300 font-medium uppercase tracking-wider">Nombre completo</p>
                                                <p className="text-white text-lg font-semibold">{user.firstName} {user.lastName}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Email Card */}
                                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 p-4 hover:border-blue-500/40 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                                <Mail className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-blue-300 font-medium uppercase tracking-wider">Email</p>
                                                <p className="text-white text-lg font-semibold truncate">{user.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Phone Card */}
                                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/20 p-4 hover:border-green-500/40 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                                                <Phone className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs text-green-300 font-medium uppercase tracking-wider">Teléfono</p>
                                                <p className="text-white text-lg font-semibold">{user.phone || 'No especificado'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Birthday Card */}
                                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 p-4 hover:border-amber-500/40 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                                                <Calendar className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs text-amber-300 font-medium uppercase tracking-wider">Fecha de nacimiento</p>
                                                <p className="text-white text-lg font-semibold">{formatDate(user.birthDate)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Password Tab */}
                    {activeTab === 'password' && (
                        <form onSubmit={handleChangePassword} className="space-y-5">
                            {/* Security Header */}
                            <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-2xl border border-red-500/20">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                                    <Lock className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white">Cambiar Contraseña</h3>
                                    <p className="text-xs text-red-300">Área protegida • Usa una contraseña segura</p>
                                </div>
                            </div>

                            {/* Current Password */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <Lock className="w-4 h-4 text-red-400" />
                                    Contraseña Actual
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPasswords ? 'text' : 'password'}
                                        value={passwordData.currentPassword}
                                        onChange={(e) => setPasswordData(p => ({ ...p, currentPassword: e.target.value }))}
                                        className="w-full px-4 py-3 bg-[var(--bg-dark)] border-2 border-[var(--border)] rounded-xl text-white pr-12 focus:border-red-500 focus:outline-none transition-all"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords(!showPasswords)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white transition-colors"
                                    >
                                        {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            {/* New Password */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <Shield className="w-4 h-4 text-green-400" />
                                    Nueva Contraseña
                                </label>
                                <input
                                    type={showPasswords ? 'text' : 'password'}
                                    value={passwordData.newPassword}
                                    onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))}
                                    placeholder="Mínimo 8 caracteres"
                                    className="w-full px-4 py-3 bg-[var(--bg-dark)] border-2 border-[var(--border)] rounded-xl text-white focus:border-green-500 focus:outline-none transition-all"
                                    required
                                />
                                {passwordData.newPassword && (
                                    <div className="flex items-center gap-2 text-xs">
                                        <div className={`h-1 flex-1 rounded-full ${passwordData.newPassword.length >= 8 ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <span className={passwordData.newPassword.length >= 8 ? 'text-green-400' : 'text-red-400'}>
                                            {passwordData.newPassword.length >= 8 ? '✓ Segura' : `${8 - passwordData.newPassword.length} caracteres más`}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Confirm Password */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <CheckCircle className="w-4 h-4 text-blue-400" />
                                    Confirmar Nueva Contraseña
                                </label>
                                <input
                                    type={showPasswords ? 'text' : 'password'}
                                    value={passwordData.confirmPassword}
                                    onChange={(e) => setPasswordData(p => ({ ...p, confirmPassword: e.target.value }))}
                                    placeholder="Repite la contraseña"
                                    className="w-full px-4 py-3 bg-[var(--bg-dark)] border-2 border-[var(--border)] rounded-xl text-white focus:border-blue-500 focus:outline-none transition-all"
                                    required
                                />
                                {passwordData.confirmPassword && passwordData.newPassword && (
                                    <div className="flex items-center gap-2 text-xs">
                                        {passwordData.confirmPassword === passwordData.newPassword ? (
                                            <span className="text-green-400">✓ Las contraseñas coinciden</span>
                                        ) : (
                                            <span className="text-red-400">✗ Las contraseñas no coinciden</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={loading || passwordData.newPassword !== passwordData.confirmPassword || passwordData.newPassword.length < 8}
                                className="w-full py-3.5 bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold rounded-xl hover:from-red-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-red-500/25"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                                Cambiar Contraseña
                            </button>
                        </form>
                    )}

                    {/* Security Tab */}
                    {activeTab === 'security' && (
                        <form onSubmit={handleUpdateSecurity} className="space-y-5">
                            {/* Security Header */}
                            <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl border border-emerald-500/20">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                    <Shield className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white">Pregunta de Seguridad</h3>
                                    <p className="text-xs text-emerald-300">Recuperación de cuenta • Solo tú conoces la respuesta</p>
                                </div>
                            </div>

                            {/* Info Box */}
                            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                <p className="text-sm text-blue-300">
                                    🔐 Esta pregunta te permitirá recuperar tu cuenta si olvidas tu contraseña.
                                    Elige algo que solo tú puedas recordar.
                                </p>
                            </div>

                            {/* Current Question */}
                            {user.securityQuestion && (
                                <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                                        <span className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Pregunta Configurada</span>
                                    </div>
                                    <p className="text-white font-medium">{user.securityQuestion}</p>
                                </div>
                            )}

                            {/* New Question */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <Shield className="w-4 h-4 text-emerald-400" />
                                    {user.securityQuestion ? 'Cambiar Pregunta' : 'Selecciona una Pregunta'}
                                </label>
                                <select
                                    value={securityData.question}
                                    onChange={(e) => setSecurityData(s => ({ ...s, question: e.target.value }))}
                                    className="w-full px-4 py-3 bg-[var(--bg-dark)] border-2 border-[var(--border)] rounded-xl text-white focus:border-emerald-500 focus:outline-none transition-all appearance-none cursor-pointer"
                                    required
                                >
                                    <option value="">Selecciona una pregunta...</option>
                                    {securityQuestions.map((q, i) => (
                                        <option key={i} value={q}>{q}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Answer */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <Lock className="w-4 h-4 text-teal-400" />
                                    Tu Respuesta Secreta
                                </label>
                                <input
                                    type="text"
                                    value={securityData.answer}
                                    onChange={(e) => setSecurityData(s => ({ ...s, answer: e.target.value }))}
                                    placeholder="Solo tú debes saber esta respuesta..."
                                    className="w-full px-4 py-3 bg-[var(--bg-dark)] border-2 border-[var(--border)] rounded-xl text-white focus:border-teal-500 focus:outline-none transition-all"
                                    required
                                />
                                <p className="text-xs text-[var(--text-secondary)]">
                                    ⚠️ La respuesta no distingue mayúsculas. Será encriptada de forma segura.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !securityData.question || !securityData.answer}
                                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                                {user.securityQuestion ? 'Actualizar Seguridad' : 'Activar Protección'}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* Logout Button */}
            <div className="px-4 mt-6">
                <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-red-500/10 text-red-400 font-medium rounded-xl border border-red-500/30 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                >
                    <LogOut className="w-5 h-5" />
                    Cerrar Sesión
                </button>
            </div>

            {/* Account Info */}
            <div className="mt-4 text-center text-xs text-[var(--text-secondary)]">
                {user.lastLogin && <p>Último acceso: {formatTimestamp(user.lastLogin)}</p>}
            </div>

            {/* Avatar Modal */}
            {showAvatarModal && user.avatarUrl && (
                <div
                    className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm"
                    onClick={() => setShowAvatarModal(false)}
                >
                    <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowAvatarModal(false)}
                            className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors p-2"
                        >
                            <X size={32} />
                        </button>
                        <img
                            src={user.avatarUrl}
                            alt={user.firstName}
                            className="w-full h-auto rounded-2xl shadow-2xl border border-[var(--border)]"
                        />
                        <div className="mt-6 flex justify-center">
                            <button
                                onClick={() => {
                                    setShowAvatarModal(false);
                                    handleAvatarClick();
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-full font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/25"
                            >
                                <Camera size={20} />
                                Cambiar Foto
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
