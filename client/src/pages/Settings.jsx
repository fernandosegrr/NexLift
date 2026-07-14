import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings as SettingsIcon, Dumbbell, Check, ChevronDown, Info, History,
    Trash2, Edit3, AlertTriangle, X, User, Lock, Shield, Download, Eye, EyeOff,
    Loader2, ChevronLeft, Save, CheckCircle, AlertCircle, Search, Filter,
    Bell, BellOff, FileDown
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';
import { useAuth } from '../context/AuthContext';
import { isPushSupported, getCurrentPushSubscription, subscribeToPush, unsubscribeFromPush } from '../utils/push';
import { downloadSessionPdf } from '../utils/sessionPdf';
import { MUSCLE_OPTIONS as MUSCLE_OPTION_DEFS, toSpanishMuscleGroup } from '../utils/muscleGroup';
import { mexicoCityDateStr } from '../utils/dates';
import { SECURITY_QUESTIONS } from '../utils/securityQuestions';

// Valores canónicos en español (+ Otros para residuales)
const MUSCLE_OPTIONS = [
    ...MUSCLE_OPTION_DEFS.map(o => o.value),
    'Otros'
];

// Agrupa logs por día CDMX (no por toLocaleDateString del device — falla de noche)
function formatHistoryDateLabel(dateStr) {
    if (!dateStr) return 'Sin fecha';
    const dayKey = mexicoCityDateStr(new Date(dateStr));
    const [year, month, day] = dayKey.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return date.toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'short'
    });
}

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
    'Antebrazos': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    'Core': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'Otros': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    'Sin clasificar': 'bg-amber-500/20 text-amber-400 border-amber-500/30'
};

export default function Settings() {
    const navigate = useNavigate();
    const toast = useToast();
    const { user, token, refreshProfile, updateToken } = useAuth();

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

    // Push notifications state (recordatorio de descanso)
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);

    useEffect(() => {
        if (!isPushSupported()) return;
        getCurrentPushSubscription().then(sub => setPushSubscribed(!!sub)).catch(() => {});
    }, []);

    async function handleTogglePush() {
        setPushLoading(true);
        try {
            if (pushSubscribed) {
                await unsubscribeFromPush();
                setPushSubscribed(false);
                toast.success('Notificaciones desactivadas');
            } else {
                await subscribeToPush();
                setPushSubscribed(true);
                toast.success('Notificaciones activadas');
            }
        } catch (err) {
            toast.error(err.message || 'No se pudo cambiar el estado de las notificaciones');
        } finally {
            setPushLoading(false);
        }
    }

    // Password state
    const [passwordData, setPasswordData] = useState({
        currentPassword: '', newPassword: '', confirmPassword: ''
    });
    const [showPasswords, setShowPasswords] = useState(false);

    // Security question state
    const [securityData, setSecurityData] = useState({ question: '', answer: '', currentPassword: '' });

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
                birthDate: user.birthDate ? String(user.birthDate).split('T')[0] : ''
            });
            // Solo sincronizar la pregunta mostrada; no tocar respuesta/contraseña
            // del form (evitar borrar lo que el usuario está escribiendo al refresh).
            setSecurityData(prev => ({
                ...prev,
                question: user.securityQuestion || prev.question || ''
            }));
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
            toast.error('No se pudo cargar la configuración');
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
            if (reqId === historyReqId.current) toast.error('No se pudo filtrar el historial');
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
            // Misma pre-filtro de 1ª palabra que fetchFilteredHistory (coherente con fuzzy)
            const serverSearch = historyFilters.search ? historyFilters.search.split(' ')[0] : '';
            const data = await api.getWorkoutHistory(50, {
                ...historyFilters,
                search: serverSearch,
                offset: nextPage * 50
            });
            // Ignore stale responses (a newer fetch was started after this one)
            if (reqId !== historyReqId.current) return;
            setWorkoutHistory(prev => [...prev, ...(data || [])]);
            setHasMoreHistory((data || []).length >= 50);
        } catch (err) {
            console.error(err);
            toast.error('No se pudieron cargar más sesiones');
        } finally {
            if (reqId === historyReqId.current) setHistoryLoading(false);
        }
    }

    // Profile handlers
    const handleUpdateProfile = async () => {
        setError(''); setSuccess('');
        const first = (profileData.firstName || '').trim();
        const last = (profileData.lastName || '').trim();
        if (!first || !last) {
            setError('Nombre y apellidos son obligatorios');
            return;
        }
        setProfileLoading(true);
        try {
            await api.updateProfile(token, {
                ...profileData,
                firstName: first,
                lastName: last,
                phone: (profileData.phone || '').trim(),
                birthDate: profileData.birthDate || null
            });
            await refreshProfile();
            setSuccess('Perfil actualizado');
            toast.success('Perfil actualizado');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message || 'No se pudo actualizar el perfil');
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
            const result = await api.changePassword(token, passwordData.currentPassword, passwordData.newPassword);
            // Cambiar la contraseña invalida todos los tokens previos en el backend;
            // persistir el token nuevo que devuelve para no cerrar la sesión actual.
            if (result?.token) updateToken(result.token);
            setSuccess('Contraseña cambiada');
            toast.success('Contraseña actualizada');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message || 'No se pudo cambiar la contraseña');
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
        if ((securityData.answer || '').trim().length < 2) {
            setError('La respuesta de seguridad es demasiado corta'); return;
        }
        if (!securityData.currentPassword) {
            setError('Ingresa tu contraseña actual para confirmar'); return;
        }
        setProfileLoading(true);
        try {
            const result = await api.updateSecurityQuestion(token, securityData.question, securityData.answer, securityData.currentPassword);
            // Igual que al cambiar contraseña: esto invalida los tokens previos,
            // así que persistimos el token nuevo para no cerrar la sesión actual.
            // Se pasa explícito a refreshProfile porque el `token` del contexto
            // todavía no se actualizó en este mismo tick (setState es async).
            if (result?.token) updateToken(result.token);
            await refreshProfile(result?.token);
            setSuccess('Pregunta actualizada');
            toast.success('Pregunta de seguridad actualizada');
            setSecurityData(prev => ({ ...prev, answer: '', currentPassword: '' }));
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message || 'No se pudo actualizar la pregunta');
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
                version: '2.7.0',
                exportDate: new Date().toISOString(),
                exportDateCdmx: mexicoCityDateStr(),
                routines: sanitizeRoutines,
                workouts: sanitizeWorkouts,
                bodyLogs: sanitizeBodyLogs,
                personalRecords: sanitizePRs
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nexlift-backup-${mexicoCityDateStr()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success('Datos exportados');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Error exportando datos');
        } finally {
            setExporting(false);
        }
    }

    // Muscle update — siempre valor español canónico (piernas +5 kg en Smart Loading)
    async function updateMuscle(exerciseId, muscleGroup) {
        if (saving) return;
        const canonical = toSpanishMuscleGroup(muscleGroup) || muscleGroup;
        setSaving(exerciseId);
        try {
            await api.updateExerciseMuscle(exerciseId, canonical);
            // Misma regla que el backend: mismo nombre → mismo grupo en toda la cuenta
            setExercises(prev => prev.map(ex => {
                const target = prev.find(e => e.id === exerciseId);
                if (!target) return ex;
                if (ex.id === exerciseId || ex.name === target.name) {
                    return { ...ex, muscleGroup: canonical };
                }
                return ex;
            }));
            toast.success(`Clasificado como ${canonical}`);
        } catch (err) {
            toast.error('Error al guardar el grupo muscular');
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

    const [exportingSessionId, setExportingSessionId] = useState(null);
    async function handleSessionPdf(session) {
        if (!session?.id || exportingSessionId) return;
        setExportingSessionId(session.id);
        try {
            // Refresca el log completo (historial listado a veces trae menos detalle)
            const full = await api.getWorkoutSession(session.id);
            await downloadSessionPdf(full, {
                userName: user?.firstName
                    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
                    : user?.username
            });
            toast.success('PDF de la sesión descargado');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'No se pudo generar el PDF');
        } finally {
            setExportingSessionId(null);
        }
    }

    const exercisesByMuscle = useMemo(() => {
        const groups = exercises.reduce((acc, ex) => {
            const raw = toSpanishMuscleGroup(ex.muscleGroup);
            const muscle = raw || 'Sin clasificar';
            if (!acc[muscle]) acc[muscle] = [];
            acc[muscle].push(ex);
            return acc;
        }, {});
        const ordered = {};
        MUSCLE_OPTIONS.forEach(m => { if (groups[m]) ordered[m] = groups[m]; });
        // Residuales (p.ej. etiquetas raras no mapeadas)
        Object.keys(groups).forEach(m => {
            if (!ordered[m]) ordered[m] = groups[m];
        });
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

        // Orden estable por día CDMX (más reciente primero; el API suele venir desc)
        const groups = {};
        const dayOrder = [];
        filtered.forEach(session => {
            const dayKey = session.date ? mexicoCityDateStr(new Date(session.date)) : 'unknown';
            const label = formatHistoryDateLabel(session.date);
            if (!groups[dayKey]) {
                groups[dayKey] = { label, sessions: [] };
                dayOrder.push(dayKey);
            }
            groups[dayKey].sessions.push(session);
        });
        const ordered = {};
        dayOrder.forEach(k => {
            const { label, sessions } = groups[k];
            if (ordered[label]) ordered[label] = [...ordered[label], ...sessions];
            else ordered[label] = sessions;
        });
        return { sessionsByDate: ordered, fuzzyFilteredCount: filtered.length };
    }, [workoutHistory, historyFilters.search]);

    const stats = useMemo(() => ({
        total: exercises.length,
        classified: exercises.filter(e => {
            const m = toSpanishMuscleGroup(e.muscleGroup);
            return m && m !== 'Sin clasificar';
        }).length,
        unclassified: exercises.filter(e => {
            const m = toSpanishMuscleGroup(e.muscleGroup);
            return !m || m === 'Sin clasificar';
        }).length
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
                    type="button"
                    onClick={() => navigate('/profile')}
                    aria-label="Volver al perfil"
                    className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center hover:border-purple-500/50 transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <SettingsIcon size={24} className="text-[var(--primary)]" aria-hidden="true" />
                        Configuración
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm">Ajusta tu cuenta y preferencias</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 bg-[var(--bg-dark)] p-1 rounded-xl overflow-x-auto" role="tablist" aria-label="Secciones de configuración">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeSection === tab.id}
                        onClick={() => { setActiveSection(tab.id); setError(''); setSuccess(''); }}
                        className={`flex-1 py-2.5 min-w-[70px] rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1 ${activeSection === tab.id
                            ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-900/30'
                            : 'text-[var(--text-secondary)] hover:text-white'
                            }`}
                    >
                        <tab.icon size={16} aria-hidden="true" />
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

                    {/* Push Notifications Card */}
                    {isPushSupported() && (
                        <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    {pushSubscribed ? <Bell size={18} className="text-purple-400" /> : <BellOff size={18} className="text-[var(--text-secondary)]" />}
                                    Recordatorio de Descanso
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleTogglePush}
                                    disabled={pushLoading}
                                    role="switch"
                                    aria-checked={pushSubscribed}
                                    aria-label={pushSubscribed ? 'Desactivar recordatorio de descanso' : 'Activar recordatorio de descanso'}
                                    className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${pushSubscribed ? 'bg-purple-500' : 'bg-[var(--bg-dark)] border border-[var(--border)]'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${pushSubscribed ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] mt-2">
                                Recibe un aviso cuando termine tu tiempo de descanso entre series, aunque tengas la app en segundo plano.
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]/70 mt-1">
                                En iPhone solo funciona si añades NexLift a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) — no funciona en una pestaña de Safari.
                            </p>
                        </div>
                    )}

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
                            <button
                                type="button"
                                onClick={() => setShowPasswords(!showPasswords)}
                                aria-label={showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                            >
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
                            disabled={profileLoading || passwordData.newPassword !== passwordData.confirmPassword || passwordData.newPassword.length < 8}
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
                            {SECURITY_QUESTIONS.map((q, i) => <option key={i} value={q}>{q}</option>)}
                            {/* Si la pregunta actual no está en la lista (dato legacy), mostrarla igual */}
                            {securityData.question && !SECURITY_QUESTIONS.includes(securityData.question) && (
                                <option value={securityData.question}>{securityData.question}</option>
                            )}
                        </select>
                        <input
                            type="text"
                            value={securityData.answer}
                            onChange={(e) => setSecurityData(s => ({ ...s, answer: e.target.value }))}
                            placeholder="Tu respuesta secreta"
                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-teal-500 focus:outline-none"
                            required
                        />
                        <div className="relative">
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={securityData.currentPassword}
                                onChange={(e) => setSecurityData(s => ({ ...s, currentPassword: e.target.value }))}
                                placeholder="Contraseña actual (para confirmar)"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white pr-10 focus:border-teal-500 focus:outline-none"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPasswords(!showPasswords)}
                                aria-label={showPasswords ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                            >
                                {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <button
                            type="submit"
                            disabled={profileLoading || !securityData.question || !securityData.answer || !securityData.currentPassword}
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
                                                        const isSelected = toSpanishMuscleGroup(exercise.muscleGroup) === option;
                                                        return (
                                                            <button
                                                                key={option}
                                                                type="button"
                                                                onClick={() => !isSelected && updateMuscle(exercise.id, option)}
                                                                disabled={saving === exercise.id || isSelected}
                                                                aria-pressed={isSelected}
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
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => fetchFilteredHistory(true)}
                                    disabled={historyLoading}
                                    className="flex-1 py-2 text-xs font-medium text-white bg-[var(--primary)] rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Aplicar filtros
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const cleared = { search: '', dateFrom: '', dateTo: '', dayOfWeek: '' };
                                        setHistoryFilters(cleared);
                                        fetchFilteredHistory(true, cleared);
                                    }}
                                    className="flex-1 py-2 text-xs text-[var(--text-secondary)] hover:text-white border border-[var(--border)] rounded-lg transition-colors"
                                >
                                    Limpiar
                                </button>
                            </div>
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
                                                        {session.exercise?.muscleGroup && (() => {
                                                            const mg = toSpanishMuscleGroup(session.exercise.muscleGroup) || session.exercise.muscleGroup;
                                                            return (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${MUSCLE_COLORS[mg] || MUSCLE_COLORS['Otros']}`}>
                                                                    {mg}
                                                                </span>
                                                            );
                                                        })()}
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
                                                                {set.rpe != null && set.rpe !== '' && (
                                                                    <span className="text-[var(--text-secondary)] ml-1">R{10 - set.rpe}</span>
                                                                )}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSessionPdf(session)}
                                                        disabled={exportingSessionId === session.id}
                                                        aria-label="Descargar PDF de la sesión"
                                                        title="PDF"
                                                        className="w-11 h-11 rounded-xl bg-[var(--bg-dark)] hover:bg-[var(--primary)]/20 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-all flex items-center justify-center disabled:opacity-50"
                                                    >
                                                        {exportingSessionId === session.id
                                                            ? <Loader2 size={18} className="animate-spin" />
                                                            : <FileDown size={18} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/session/${session.id}/edit`)}
                                                        aria-label="Editar sesión"
                                                        className="w-11 h-11 rounded-xl bg-[var(--bg-dark)] hover:bg-[var(--primary)]/20 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-all flex items-center justify-center"
                                                    >
                                                        <Edit3 size={18} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeletingSession(session)}
                                                        aria-label="Eliminar sesión"
                                                        className="w-11 h-11 rounded-xl bg-[var(--bg-dark)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-500 transition-all flex items-center justify-center"
                                                    >
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
                <Portal>
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => !deleting && setDeletingSession(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-session-title"
                >
                    <div className="relative bg-[var(--bg-card)]/95 backdrop-blur-md rounded-2xl p-6 max-w-sm w-full border border-[var(--border)]" onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => !deleting && setDeletingSession(null)}
                            disabled={deleting}
                            aria-label="Cerrar"
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--bg-dark)] flex items-center justify-center text-[var(--text-secondary)]"
                        >
                            <X size={16} />
                        </button>
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={32} className="text-red-500" />
                        </div>
                        <h3 id="delete-session-title" className="text-xl font-bold text-center mb-2">¿Eliminar sesión?</h3>
                        <p className="text-sm text-[var(--text-secondary)] text-center mb-6">
                            Se eliminará <strong>{deletingSession.exercise?.name}</strong>. <span className="text-red-400 text-xs">Esta acción no se puede deshacer.</span>
                        </p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setDeletingSession(null)} disabled={deleting} className="flex-1 py-3.5 rounded-xl font-semibold bg-[var(--bg-dark)] text-white border border-[var(--border)]">
                                Cancelar
                            </button>
                            <button type="button" onClick={confirmDeleteSession} disabled={deleting} className="flex-1 py-3.5 rounded-xl font-semibold bg-red-500 text-white flex items-center justify-center gap-2">
                                {deleting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Trash2 size={18} />Eliminar</>}
                            </button>
                        </div>
                    </div>
                </div>
                </Portal>
            )}
        </div>
    );
}