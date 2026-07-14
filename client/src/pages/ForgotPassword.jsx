import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, User, Shield, Lock, AlertCircle, CheckCircle, Loader2, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';

export default function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1); // 1: username, 2: answer, 3: success
    const [username, setUsername] = useState('');
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const passwordsMismatch =
        confirmPassword.length > 0 && newPassword !== confirmPassword;

    const handleGetQuestion = async (e) => {
        e.preventDefault();
        if (loading) return;
        setError('');

        const trimmedUsername = username.trim();
        if (!trimmedUsername) {
            setError('Ingresa tu usuario o email');
            return;
        }

        setLoading(true);
        try {
            const { question: q } = await api.getSecurityQuestion(trimmedUsername);
            setUsername(trimmedUsername);
            setQuestion(q);
            setAnswer('');
            setNewPassword('');
            setConfirmPassword('');
            setStep(2);
        } catch (err) {
            setError(err.message || 'Usuario no encontrado o sin pregunta de seguridad');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (loading) return;
        setError('');

        const trimmedAnswer = answer.trim();
        if (!trimmedAnswer) {
            setError('Escribe la respuesta de seguridad');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }
        if (newPassword.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres');
            return;
        }

        setLoading(true);
        try {
            await api.recoverPassword(username, trimmedAnswer, newPassword);
            setStep(3);
        } catch (err) {
            setError(err.message || 'Respuesta incorrecta');
        } finally {
            setLoading(false);
        }
    };

    const goBackToStep1 = () => {
        setStep(1);
        setError('');
        setQuestion('');
        setAnswer('');
        setNewPassword('');
        setConfirmPassword('');
    };

    if (step === 3) {
        return (
            <div
                className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center px-4"
                style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-green-500" aria-hidden="true" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">¡Contraseña restablecida!</h1>
                    <p className="text-[var(--text-secondary)] mb-2">
                        Ya puedes iniciar sesión con la nueva contraseña.
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]/80 mb-6">
                        Las sesiones abiertas en otros dispositivos quedaron cerradas por seguridad.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/login', { replace: true })}
                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all"
                    >
                        Ir a Iniciar Sesión
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center px-4"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
            <div className="w-full max-w-md">
                <div className="mb-6">
                    <Link to="/login" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-white transition-colors mb-4">
                        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                        Volver al login
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                            <KeyRound className="w-6 h-6 text-purple-500" aria-hidden="true" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Recuperar Contraseña</h1>
                            <p className="text-sm text-[var(--text-secondary)]">
                                {step === 1 ? 'Ingresa tu usuario o email' : 'Responde tu pregunta de seguridad'}
                            </p>
                        </div>
                    </div>
                    {/* Step indicator */}
                    <div className="flex gap-2 mt-4" aria-hidden="true">
                        <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-purple-500' : 'bg-[var(--border)]'}`} />
                        <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-purple-500' : 'bg-[var(--border)]'}`} />
                    </div>
                </div>

                {step === 1 && (
                    <form onSubmit={handleGetQuestion} className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)]" noValidate>
                        {error && (
                            <div role="alert" className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                                <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        <div>
                            <label htmlFor="fp-username" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Usuario o Email
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
                                <input
                                    id="fp-username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }}
                                    placeholder="tu.usuario"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    autoFocus
                                    className="w-full pl-10 pr-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !username.trim()}
                            className="w-full mt-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : 'Continuar'}
                        </button>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={handleResetPassword} className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)] space-y-4" noValidate>
                        {error && (
                            <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                                <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                            <div className="flex items-center gap-2 text-purple-400 mb-2">
                                <Shield className="w-4 h-4" aria-hidden="true" />
                                <span className="text-sm font-medium">Pregunta de Seguridad</span>
                            </div>
                            <p className="text-white">{question}</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-2">Cuenta: <span className="text-white/80">{username}</span></p>
                        </div>

                        <div>
                            <label htmlFor="fp-answer" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Tu Respuesta
                            </label>
                            <input
                                id="fp-answer"
                                type="text"
                                value={answer}
                                onChange={(e) => { setAnswer(e.target.value); if (error) setError(''); }}
                                placeholder="Escribe tu respuesta"
                                autoComplete="off"
                                autoCapitalize="none"
                                className="w-full px-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="fp-new-pass" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Nueva Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
                                <input
                                    id="fp-new-pass"
                                    type={showPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => { setNewPassword(e.target.value); if (error) setError(''); }}
                                    placeholder="Mínimo 8 caracteres"
                                    autoComplete="new-password"
                                    minLength={8}
                                    className="w-full pl-10 pr-12 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white p-1"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="fp-confirm" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Confirmar Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
                                <input
                                    id="fp-confirm"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(''); }}
                                    placeholder="Repite tu contraseña"
                                    autoComplete="new-password"
                                    minLength={8}
                                    className={`w-full pl-10 pr-4 py-3 bg-[var(--bg-dark)] border rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500 ${
                                        passwordsMismatch ? 'border-red-500/60' : 'border-[var(--border)]'
                                    }`}
                                    required
                                />
                            </div>
                            {passwordsMismatch && (
                                <p className="text-xs text-red-400 mt-1">Las contraseñas no coinciden</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || passwordsMismatch || newPassword.length < 8 || !answer.trim()}
                            className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : 'Restablecer Contraseña'}
                        </button>

                        <button
                            type="button"
                            onClick={goBackToStep1}
                            className="w-full py-2 text-[var(--text-secondary)] hover:text-white transition-colors text-sm"
                        >
                            Usar otro usuario
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
