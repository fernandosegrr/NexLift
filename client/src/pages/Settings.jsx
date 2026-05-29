import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings as SettingsIcon, Dumbbell, Check, ChevronDown, Info, History,
    Trash2, Edit3, AlertTriangle, X, User, Lock, Shield, Download, Eye, EyeOff,
    Loader2, ChevronLeft, Save, CheckCircle, AlertCircle, Search, Filter, ChevronRight,
    Calendar
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

const MUSCLE_OPTIONS = [
    'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Piernas', 'Core', 'Otros'
];

// Fuzzy search utilities
function normalizeForSearch(str) {
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
}

function fuzzyMatch(query, target) {
    const nq = normalizeForSearch(query);
    const nt = normalizeForSearch(target);
    if (!nq || !nt) return 0;

    // Exact substring
    if (nt.includes(nq)) return 1.0;

    // Each query word must match somewhere
    const queryWords = nq.split(' ');
    const allWordsMatch = queryWords.every(qw => {
        if (nt.includes(qw)) return true;
        // Plural handling
        const plural = qw.endsWith('s') ? qw.slice(0, -1) : qw + 's';
        if (nt.includes(plural)) return true;
        // Levenshtein against each target word
        const targetWords = nt.split(' ');
        return targetWords.some(tw => {
            if (tw.length < 3 || qw.length < 3) return false;
            return levenshtein(qw, tw) <= 2;
        });
    });
    if (allWordsMatch && queryWords.length > 1) return 0.85;

    // Single word fuzzy
    if (queryWords.length === 1) {
        // Plural handling
        const plural = nq.endsWith('s') ? nq.slice(0, -1) : nq + 's';
        if (nt.includes(plural)) return 0.95;
        // Levenshtein against target words
        const targetWords = nt.split(' ');
        for (const tw of targetWords) {
            if (tw.length < 3 || nq.length < 3) continue;
            const dist = levenshtein(nq, tw);
            if (dist <= 1) return 0.8;
            if (dist <= 2) return 0.6;
        }
        // Sliding window for substring-like matches
        if (nq.length >= 3) {
            for (let i = 0; i <= nt.length - nq.length; i++) {
                const window = nt.substring(i, i + nq.length);
                if (levenshtein(nq, window) <= 1) return 0.7;
            }
        }
    }

    return allWordsMatch ? 0.5 : 0;
}

const MUSCLE_COLORS = {
    'Pecho': 'bg-red-500/20 text-red-400 border-red-500/30',
    'Espalda': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Hombros': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'Bíceps': 'bg-green-500/20 text-green-400 border-green-500/30',
    'Tríceps': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'Piernas': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'Core': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'Otros': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    'Sin clasificar': 'bg-amber-500/20 text-amber-400 border-amber-500/30'
};

const securityQuestions = [
    'Nombre de tu primera mascota',
    'Ciudad donde naciste',
    'Nombre de tu mejor amigo de infancia',
    'Marca de tu primer carro',
    'Nombre de tu escuela primaria',
    'Apodo de un familiar cercano'
];

export default function Settings() {
    const navigate = useNavigate();
    const toast = useToast();
    const { user, token, refreshProfile } = useAuth();

    // Tab state
    const [activeSection, setActiveSection] = useState('profile');

    // Exercise/History data
    const [exercises, setExercises] = useState([]);
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [trashRoutine, setTrashRoutine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);
    const [expandedMuscle, setExpandedMuscle] = useState(null);

    // Profile edit state
    const [profileData, setProfileData] = useState({
        firstName: '', lastName: '', phone: '', birthDate: ''
    });
    const [profileLoading, setProfileLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Password state
    const [passwordData, setPasswordData] = useState({
        currentPassword: '', newPassword: '', confirmPassword: ''
    });
    const [showPasswords, setShowPasswords] = useState(false);

    // Security question state
    const [securityData, setSecurityData] = useState({ question: '', answer: '' });

    // Delete modal
    const [deletingSession, setDeletingSession] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Export state
    const [exporting, setExporting] = useState(false);

    // History filters
    const [historyFilters, setHistoryFilters] = useState({
        search: '', dateFrom: '', dateTo: '', dayOfWeek: ''
    });
    const [historyPage, setHistoryPage] = useState(0);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    // Sequencing guard: ignore stale responses from concurrent history fetches
    const historyReqId = useRef(0);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (user) {
            setProfileData({
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                phone: user.phone || '',
                birthDate: user.birthDate ? user.birthDate.split('T')[0] : ''
            });
            setSecurityData({ question: user.securityQuestion || '', answer: '' });
        }
    }, [user]);

    async function fetchData() {
        try {
            const [exercisesData, historyData, trashData] = await Promise.all([
                api.getExercises(),
                api.getWorkoutHistory(50),
                api.getTrashRoutine()
            ]);
            setExercises(exercisesData || []);
            setWorkoutHistory(historyData || []);
            setTrashRoutine(trashData);
            setHasMoreHistory((historyData || []).length >= 50);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchFilteredHistory(resetPage = true, filterOverride = null) {
        const reqId = ++historyReqId.current;
        const filters = filterOverride || historyFilters;
        setHistoryLoading(true);
        const page = resetPage ? 0 : historyPage;
        if (resetPage) setHistoryPage(0);
        try {
            // Send first word only as server pre-filter for broader results; fuzzy filter client-side
            const serverSearch = filters.search ? filters.search.split(' ')[0] : '';
            const data = await api.getWorkoutHistory(50, {
                ...filters,
                search: serverSearch,
                offset: page * 50
            });
            // Ignore stale responses (a newer fetch was started after this one)
            if (reqId !== historyReqId.current) return;
            if (resetPage) {
                setWorkoutHistory(data || []);
            } else {
                setWorkoutHistory(prev => [...prev, ...(data || [])]);
            }
            setHasMoreHistory((data || []).length >= 50);
        } catch (err) {
            console.error(err);
        } finally {
            if (reqId === historyReqId.current) setHistoryLoading(false);
        }
    }

    async function loadMoreHistory() {
        const reqId = ++historyReqId.current;
        const nextPage = historyPage + 1;
        setHistoryPage(nextPage);
        setHistoryLoading(true);
        try {
            const data = await api.getWorkoutHistory(50, {
                ...historyFilters,
                offset: nextPage * 50
            });
            // Ignore stale responses (a newer fetch was started after this one)
            if (reqId !== historyReqId.current) return;
            setWorkoutHistory(prev => [...prev, ...(data || [])]);
            setHasMoreHistory((data || []).length >= 50);
        } catch (err) {
            console.error(err);
        } finally {
            if (reqId === historyReqId.current) setHistoryLoading(false);
        }
    }

    // Profile handlers
    const handleUpdateProfile = async () => {
        setError(''); setSuccess(''); setProfileLoading(true);
        try {
            await api.updateProfile(token, profileData);
            await refreshProfile();
            setSuccess('Perfil actualizado');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setProfileLoading(false);
        }
    };

    // Password handler
    const handleChangePassword = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError('Las contraseñas no coinciden'); return;
        }
        if (passwordData.newPassword.length < 8) {
            setError('Mínimo 8 caracteres'); return;
        }
        setProfileLoading(true);
        try {
            await api.changePassword(token, passwordData.currentPassword, passwordData.newPassword);
            setSuccess('Contraseña cambiada');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setProfileLoading(false);
        }
    };

    // Security question handler
    const handleUpdateSecurity = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (!securityData.question || !securityData.answer) {
            setError('Pregunta y respuesta requeridas'); return;
        }
        setProfileLoading(true);
        try {
            await api.updateSecurityQuestion(token, securityData.question, securityData.answer);
            await refreshProfile();
            setSuccess('Pregunta actualizada');
            setSecurityData(prev => ({ ...prev, answer: '' }));
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setProfileLoading(false);
        }
    };

    // Export handler - sanitized (no IDs)
    async function exportAllData() {
        setExporting(true);
        try {
            const [routines, workouts, bodyLogs, prs] = await Promise.all([
                api.getRoutines(),
                api.getWorkoutHistory(9999),
                api.getBodyLogs(9999),
                api.getPersonalRecords()
            ]);

            // Sanitize: remove all IDs and internal fields
            const sanitizeRoutines = routines.map(r => ({
                name: r.name,
                description: r.description,
                isActive: r.isActive,
                days: r.days?.map(d => ({
                    dayName: d.dayName,
                    isRestDay: d.isRestDay,
                    exercises: d.exercises?.map(e => ({
                        name: e.name,
                        muscleGroup: e.muscleGroup,
                        targetSets: e.targetSets,
                        targetReps: e.targetReps,
                        restSeconds: e.restSeconds,
                        isUnilateral: e.isUnilateral || false,
                        note: e.note
                    }))
                }))
            }));

            const sanitizeWorkouts = workouts.map(w => ({
                date: w.date,
                exerciseName: w.exercise?.name,
                sets: w.sets?.map(s => ({
                    weight: s.weight,
                    reps: s.reps,
                    rpe: s.rpe ?? null,
                    weightRight: s.weightRight ?? null,
                    repsRight: s.repsRight ?? null
                }))
            }));

            const sanitizeBodyLogs = bodyLogs.map(b => ({
                date: b.date,
                weight: b.weight,
                bmi: b.bmi,
                bodyFat: b.bodyFat,
                muscleMass: b.muscleMass,
                note: b.note
            }));

            const sanitizePRs = prs.map(p => ({
                exerciseName: p.exerciseName,
                weight: p.weight,
                reps: p.reps,
                estimated1RM: p.estimated1RM,
                date: p.date
            }));

            const exportData = {
                version: '1.9.9',
                exportDate: new Date().toISOString(),
                routines: sanitizeRoutines,
                workouts: sanitizeWorkouts,
                bodyLogs: sanitizeBodyLogs,
                personalRecords: sanitizePRs
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nexlift-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Datos exportados');
        } catch (err) {
            toast.error('Error exportando datos');
        } finally {
            setExporting(false);
        }
    }

    // Muscle update
    async function updateMuscle(exerciseId, muscleGroup) {
        if (saving) return;
        setSaving(exerciseId);
        try {
            await api.updateExerciseMuscle(exerciseId, muscleGroup);
            setExercises(prev => prev.map(ex =>
                ex.id === exerciseId ? { ...ex, muscleGroup } : ex
            ));
            toast.success(`Clasificado como ${muscleGroup}`);
        } catch (err) {
            toast.error('Error al guardar');
        } finally {
            setSaving(null);
        }
    }

    // Delete session
    async function confirmDeleteSession() {
        if (!deletingSession || deleting) return;
        setDeleting(true);
        try {
            await api.deleteWorkoutSession(deletingSession.id);
            toast.success('Sesión eliminada');
            setWorkoutHistory(prev => prev.filter(s => s.id !== deletingSession.id));
            setDeletingSession(null);
        } catch (err) {
            toast.error('Error al eliminar');
        } finally {
            setDeleting(false);
        }
    }

    const exercisesByMuscle = useMemo(() => {
        const groups = exercises.reduce((acc, ex) => {
            const muscle = ex.muscleGroup || 'Sin clasificar';
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});
        const ordered = {};
        MUSCLE_OPTIONS.forEach(m => { if (groups[m]) ordered[m] = groups[m]; });
        if (groups['Sin clasificar']) ordered['Sin clasificar'] = groups['Sin clasificar'];
        return ordered;
    }, [exercises]);

    const { sessionsByDate, fuzzyFilteredCount } = useMemo(() => {
        let filtered = workoutHistory;

        // Apply client-side fuzzy filter when search is active
        if (historyFilters.search && historyFilters.search.length >= 2) {
            filtered = workoutHistory
                .map(session => ({
                    session,
                    score: fuzzyMatch(historyFilters.search, session.exercise?.name || '')
                }))
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score)
                .map(item => item.session);
        }

        const groups = {};
        filtered.forEach(session => {
            const dateStr = new Date(session.date).toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'short'
            });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(session);
        });
        return { sessionsByDate: groups, fuzzyFilteredCount: filtered.length };
    }, [workoutHistory, historyFilters.search]);

    const stats = useMemo(() => ({
        total: exercises.length,
        classified: exercises.filter(e => e.muscleGroup && e.muscleGroup !== 'Sin clasificar').length,
        unclassified: exercises.filter(e => !e.muscleGroup || e.muscleGroup === 'Sin clasificar').length
    }), [exercises]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const tabs = [
        { id: 'profile', label: 'Cuenta', icon: User },
        { id: 'security', label: 'Seguridad', icon: Shield },
        { id: 'muscles', label: 'Músculos', icon: Dumbbell },
        { id: 'history', label: 'Historial', icon: History },
    ];

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto pb-24">
            {/* Header with Back Button */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate('/profile')}
                    className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center hover:border-purple-500/50 transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <SettingsIcon size={24} className="text-[var(--primary)]" />
                        Configuración
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm">Ajusta tu cuenta y preferencias</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 bg-[var(--bg-dark)] p-1 rounded-xl overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveSection(tab.id); setError(''); setSuccess(''); }}
                        className={`flex-1 py-2.5 min-w-[70px] rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1 ${activeSection === tab.id
                            ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-900/30'
                            : 'text-[var(--text-secondary)] hover:text-white'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Alerts */}
            {(error || success) && (
                <div className={`p-3 rounded-xl flex items-center gap-2 ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-green-500/10 border border-green-500/30 text-green-400'}`}>
                    {error ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                    <span className="text-sm">{error || success}</span>
                </div>
            )}

            {/* TAB: Account/Profile */}
            {activeSection === 'profile' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)] space-y-4">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <User size={18} className="text-purple-400" />
                            Datos Personales
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre(s)</label>
                                <input
                                    type="text"
                                    value={profileData.firstName}
                                    onChange={(e) => setProfileData(p => ({ ...p, firstName: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Apellidos</label>
                                <input
                                    type="text"
                                    value={profileData.lastName}
                                    onChange={(e) => setProfileData(p => ({ ...p, lastName: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--text-secondary)] mb-1">Teléfono</label>
                            <input
                                type="tel"
                                value={profileData.phone}
                                onChange={(e) => setProfileData(p => ({ ...p, phone: e.target.value }))}
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--text-secondary)] mb-1">Fecha de Nacimiento</label>
                            <input
                                type="date"
                                value={profileData.birthDate}
                                onChange={(e) => setProfileData(p => ({ ...p, birthDate: e.target.value }))}
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={handleUpdateProfile}
                            disabled={profileLoading}
                            className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                        >
                            {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar Cambios
                        </button>
                    </div>

                    {/* Export Data Card */}
                    <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]">
                        <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                            <Download size={18} className="text-blue-400" />
                            Exportar Datos
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-4">
                            Descarga todos tus datos en formato JSON: rutinas, entrenamientos, mediciones y récords.
                        </p>
                        <button
                            onClick={exportAllData}
                            disabled={exporting}
                            className="w-full py-3 bg-blue-500/20 text-blue-400 font-medium rounded-xl border border-blue-500/30 hover:bg-blue-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {exporting ? 'Exportando...' : 'Descargar Backup'}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB: Security */}
            {activeSection === 'security' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Password Change */}
                    <form onSubmit={handleChangePassword} className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)] space-y-4">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <Lock size={18} className="text-red-400" />
                            Cambiar Contraseña
                        </h3>
                        <div className="relative">
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={passwordData.currentPassword}
                                onChange={(e) => setPasswordData(p => ({ ...p, currentPassword: e.target.value }))}
                                placeholder="Contraseña actual"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white pr-10 focus:border-red-500 focus:outline-none"
                                required
                            />
                            <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                                {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <input
                            type={showPasswords ? 'text' : 'password'}
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))}
                            placeholder="Nueva contraseña (mín. 8 caracteres)"
                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-green-500 focus:outline-none"
                            required
                        />
                        <input
                            type={showPasswords ? 'text' : 'password'}
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData(p => ({ ...p, confirmPassword: e.target.value }))}
                            placeholder="Confirmar nueva contraseña"
                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-blue-500 focus:outline-none"
                            required
                        />
                        <button
                            type="submit"
                            disabled={profileLoading || passwordData.newPassword !== passwordData.confirmPassword}
                            className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white font-medium rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-500/25"
                        >
                            {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            Cambiar Contraseña
                        </button>
                    </form>

                    {/* Security Question */}
                    <form onSubmit={handleUpdateSecurity} className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)] space-y-4">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <Shield size={18} className="text-emerald-400" />
                            Pregunta de Seguridad
                        </h3>
                        {user?.securityQuestion && (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                <p className="text-xs text-emerald-400 mb-1">Pregunta actual:</p>
                                <p className="text-sm text-white">{user.securityQuestion}</p>
                            </div>
                        )}
                        <select
                            value={securityData.question}
                            onChange={(e) => setSecurityData(s => ({ ...s, question: e.target.value }))}
                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                            required
                        >
                            <option value="">Selecciona pregunta...</option>
                            {securityQuestions.map((q, i) => <option key={i} value={q}>{q}</option>)}
                        </select>
                        <input
                            type="text"
                            value={securityData.answer}
                            onChange={(e) => setSecurityData(s => ({ ...s, answer: e.target.value }))}
                            placeholder="Tu respuesta secreta"
                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-teal-500 focus:outline-none"
                            required
                        />
                        <button
                            type="submit"
                            disabled={profileLoading || !securityData.question || !securityData.answer}
                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                        >
                            {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                            {user?.securityQuestion ? 'Actualizar' : 'Activar'}
                        </button>
                    </form>
                </div>
            )}

            {/* TAB: Muscles */}
            {activeSection === 'muscles' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border)] text-center">
                            <p className="text-xl font-bold text-[var(--primary)]">{stats.total}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase">Total</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border)] text-center">
                            <p className="text-xl font-bold text-green-400">{stats.classified}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase">Clasificados</p>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border)] text-center">
                            <p className="text-xl font-bold text-amber-400">{stats.unclassified}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase">Pendientes</p>
                        </div>
                    </div>

                    <div className="bg-[var(--bg-card)]/80 border border-[var(--border)] rounded-xl p-4 text-sm flex gap-3 items-start">
                        <Info size={20} className="text-[var(--primary)] shrink-0" />
                        <p className="text-[var(--text-secondary)]">Toca un grupo para ver y reclasificar ejercicios.</p>
                    </div>

                    <div className="space-y-2">
                        {Object.entries(exercisesByMuscle).map(([muscle, muscleExercises]) => (
                            <div key={muscle} className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                                <button
                                    onClick={() => setExpandedMuscle(expandedMuscle === muscle ? null : muscle)}
                                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2.5 h-2.5 rounded-full ${MUSCLE_COLORS[muscle]?.split(' ')[0] || 'bg-gray-500/50'}`} />
                                        <span className="font-medium">{muscle}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${MUSCLE_COLORS[muscle] || MUSCLE_COLORS['Otros']}`}>
                                            {muscleExercises.length}
                                        </span>
                                    </div>
                                    <ChevronDown size={18} className={`text-[var(--text-secondary)] transition-transform ${expandedMuscle === muscle ? 'rotate-180' : ''}`} />
                                </button>

                                {expandedMuscle === muscle && (
                                    <div className="px-4 pb-4 space-y-3 animate-fade-in bg-[var(--bg-dark)]/40 pt-3 border-t border-[var(--border)]">
                                        {muscleExercises.map(exercise => (
                                            <div key={exercise.id} className="bg-[var(--bg-card)] rounded-lg p-3 border border-[var(--border)]">
                                                <p className="text-sm font-semibold truncate mb-3">{exercise.name}</p>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {MUSCLE_OPTIONS.map(option => {
                                                        const isSelected = exercise.muscleGroup === option;
                                                        return (
                                                            <button
                                                                key={option}
                                                                onClick={() => !isSelected && updateMuscle(exercise.id, option)}
                                                                disabled={saving === exercise.id || isSelected}
                                                                className={`px-2 py-2 rounded-lg text-[11px] font-medium transition-all border ${isSelected
                                                                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                                                    : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/50'
                                                                    }`}
                                                            >
                                                                {isSelected ? <span className="flex items-center justify-center gap-1"><Check size={10} />{option}</span> : option}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB: History */}
            {activeSection === 'history' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Search Bar */}
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                value={historyFilters.search}
                                onChange={(e) => setHistoryFilters(f => ({ ...f, search: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && fetchFilteredHistory()}
                                placeholder="Buscar ejercicio..."
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${showFilters ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)]'}`}
                        >
                            <Filter size={18} />
                        </button>
                        <button
                            onClick={() => fetchFilteredHistory()}
                            disabled={historyLoading}
                            className="px-4 h-12 rounded-xl bg-[var(--primary)] text-white text-sm font-medium disabled:opacity-50"
                        >
                            {historyLoading ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
                        </button>
                    </div>

                    {/* Filters Panel */}
                    {showFilters && (
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] space-y-3 animate-fade-in">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Desde</label>
                                    <input
                                        type="date"
                                        value={historyFilters.dateFrom}
                                        onChange={(e) => setHistoryFilters(f => ({ ...f, dateFrom: e.target.value }))}
                                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm text-white focus:border-[var(--primary)] focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Hasta</label>
                                    <input
                                        type="date"
                                        value={historyFilters.dateTo}
                                        onChange={(e) => setHistoryFilters(f => ({ ...f, dateTo: e.target.value }))}
                                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm text-white focus:border-[var(--primary)] focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Día de la semana</label>
                                <select
                                    value={historyFilters.dayOfWeek}
                                    onChange={(e) => setHistoryFilters(f => ({ ...f, dayOfWeek: e.target.value }))}
                                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm text-white focus:border-[var(--primary)] focus:outline-none"
                                >
                                    <option value="">Todos</option>
                                    <option value="1">Lunes</option>
                                    <option value="2">Martes</option>
                                    <option value="3">Miércoles</option>
                                    <option value="4">Jueves</option>
                                    <option value="5">Viernes</option>
                                    <option value="6">Sábado</option>
                                    <option value="0">Domingo</option>
                                </select>
                            </div>
                            <button
                                onClick={() => {
                                    const cleared = { search: '', dateFrom: '', dateTo: '', dayOfWeek: '' };
                                    setHistoryFilters(cleared);
                                    fetchFilteredHistory(true, cleared);
                                }}
                                className="w-full py-2 text-xs text-[var(--text-secondary)] hover:text-white border border-[var(--border)] rounded-lg transition-colors"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    )}

                    {/* Warning */}
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-sm flex gap-3 items-start">
                        <AlertTriangle size={18} className="text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-yellow-200/90 text-xs">Edita o elimina sesiones. <strong>Los cambios son permanentes.</strong></p>
                    </div>

                    <div className="space-y-4">
                        {/* Papelera / Archivo */}
                        {trashRoutine && (
                            <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] flex items-center justify-between shadow-lg shadow-black/20">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[var(--bg-dark)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)]">
                                        <Trash2 size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white">Papelera de Historial</h3>
                                        <p className="text-xs text-[var(--text-secondary)]">
                                            {trashRoutine.days?.[0]?.exercises?.length || 0} ejercicios archivados
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate(`/routines/${trashRoutine.id}`)}
                                    className="px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--primary)] text-sm font-medium rounded-lg border border-[var(--border)] hover:border-[var(--primary)] hover:text-white transition-all"
                                >
                                    Ver Archivo
                                </button>
                            </div>
                        )}

                        {/* Results count */}
                        <p className="text-xs text-[var(--text-secondary)]">
                            {historyFilters.search ? fuzzyFilteredCount : workoutHistory.length} sesiones {historyFilters.search || historyFilters.dateFrom || historyFilters.dateTo || historyFilters.dayOfWeek ? '(filtrado)' : ''}
                        </p>

                        {Object.entries(sessionsByDate).map(([dateStr, sessions]) => (
                            <div key={dateStr}>
                                <div className="sticky top-0 z-10 bg-[var(--bg-dark)]/95 backdrop-blur-sm py-2 mb-2 border-b border-[var(--border)]">
                                    <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">{dateStr}</p>
                                </div>
                                <div className="space-y-2">
                                    {sessions.map(session => (
                                        <div key={session.id} className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                        <p className="font-semibold text-sm">{session.exercise?.name || 'Ejercicio'}</p>
                                                        {session.exercise?.muscleGroup && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${MUSCLE_COLORS[session.exercise.muscleGroup] || MUSCLE_COLORS['Otros']}`}>
                                                                {session.exercise.muscleGroup}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {session.sets?.map((set, i) => (
                                                            <span key={i} className="text-xs bg-[var(--bg-dark)] px-2.5 py-1.5 rounded-lg border border-[var(--border)] font-mono">
                                                                {(set.repsRight != null || set.weightRight != null) ? (
                                                                    <span className="text-orange-400">
                                                                        I:<span className="text-[var(--primary)] font-bold">{set.weight}</span>×{set.reps}
                                                                        {' '}D:<span className="text-[var(--primary)] font-bold">{set.weightRight ?? set.weight}</span>×{set.repsRight ?? set.reps}
                                                                    </span>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-[var(--primary)] font-bold">{set.weight}</span>kg × <span className="font-bold">{set.reps}</span>
                                                                    </>
                                                                )}
                                                                {set.rpe && <span className="text-[var(--text-secondary)] ml-1">R{10 - set.rpe}</span>}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1.5 shrink-0">
                                                    <button onClick={() => navigate(`/session/${session.id}/edit`)} className="w-11 h-11 rounded-xl bg-[var(--bg-dark)] hover:bg-[var(--primary)]/20 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-all flex items-center justify-center">
                                                        <Edit3 size={18} />
                                                    </button>
                                                    <button onClick={() => setDeletingSession(session)} className="w-11 h-11 rounded-xl bg-[var(--bg-dark)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-500 transition-all flex items-center justify-center">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Load More Button */}
                        {hasMoreHistory && workoutHistory.length > 0 && (
                            <button
                                onClick={loadMoreHistory}
                                disabled={historyLoading}
                                className="w-full py-3 text-sm text-[var(--primary)] hover:bg-[var(--bg-card)] rounded-xl font-medium transition-all border border-[var(--border)] flex items-center justify-center gap-2"
                            >
                                {historyLoading ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} />}
                                Cargar más sesiones
                            </button>
                        )}
                    </div>

                    {workoutHistory.length === 0 && !historyLoading && (
                        <div className="bg-[var(--bg-card)] rounded-xl p-8 text-center border border-[var(--border)]">
                            <History size={32} className="mx-auto text-[var(--text-secondary)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)]">
                                {historyFilters.search || historyFilters.dateFrom ? 'Sin resultados para estos filtros.' : 'Aún no hay sesiones registradas.'}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Delete Modal */}
            {deletingSession && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !deleting && setDeletingSession(null)}>
                    <div className="bg-[var(--bg-card)]/95 backdrop-blur-md rounded-2xl p-6 max-w-sm w-full border border-[var(--border)]" onClick={e => e.stopPropagation()}>
                        <button onClick={() => !deleting && setDeletingSession(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--bg-dark)] flex items-center justify-center text-[var(--text-secondary)]">
                            <X size={16} />
                        </button>
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={32} className="text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-center mb-2">¿Eliminar sesión?</h3>
                        <p className="text-sm text-[var(--text-secondary)] text-center mb-6">
                            Se eliminará <strong>{deletingSession.exercise?.name}</strong>. <span className="text-red-400 text-xs">Esta acción no se puede deshacer.</span>
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingSession(null)} disabled={deleting} className="flex-1 py-3.5 rounded-xl font-semibold bg-[var(--bg-dark)] text-white border border-[var(--border)]">
                                Cancelar
                            </button>
                            <button onClick={confirmDeleteSession} disabled={deleting} className="flex-1 py-3.5 rounded-xl font-semibold bg-red-500 text-white flex items-center justify-center gap-2">
                                {deleting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Trash2 size={18} />Eliminar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}