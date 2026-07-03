import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, User, Shield, Lock, AlertCircle, CheckCircle, Loader2, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';

export default function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1); // 1: username, 2: answer question, 3: success
    const [username, setUsername] = useState('');
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGetQuestion = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const trimmedUsername = username.trim();
        try {
            const { question: q } = await api.getSecurityQuestion(trimmedUsername);
            setUsername(trimmedUsername);
            setQuestion(q);
            setStep(2);
        } catch (err) {
            setError(err.message || 'Usuario no encontrado');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');

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
            await api.recoverPassword(username, answer, newPassword);
            setStep(3);
        } catch (err) {
            setError(err.message || 'Respuesta incorrecta');
        } finally {
            setLoading(false);
        }
    };

    if (step === 3) {
        return (
            <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center px-4">
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">¡Contraseña Restablecida!</h1>
                    <p className="text-[var(--text-secondary)] mb-6">
                        Tu contraseña ha sido cambiada exitosamente.
                    </p>
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all"
                    >
                        Ir a Iniciar Sesión
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="mb-6">
                    <Link to="/login" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-white transition-colors mb-4">
                        <ChevronLeft className="w-5 h-5" />
                        Volver al login
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                            <KeyRound className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Recuperar Contraseña</h1>
                            <p className="text-sm text-[var(--text-secondary)]">
                                {step === 1 ? 'Ingresa tu usuario o email' : 'Responde tu pregunta de seguridad'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step 1: Enter username */}
                {step === 1 && (
                    <form onSubmit={handleGetQuestion} className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)]">
                        {error && (
                            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Usuario o Email
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="tu.usuario"
                                    className="w-full pl-10 pr-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continuar'}
                        </button>
                    </form>
                )}

                {/* Step 2: Answer security question */}
                {step === 2 && (
                    <form onSubmit={handleResetPassword} className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)] space-y-4">
                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        {/* Security Question */}
                        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                            <div className="flex items-center gap-2 text-purple-400 mb-2">
                                <Shield className="w-4 h-4" />
                                <span className="text-sm font-medium">Pregunta de Seguridad</span>
                            </div>
                            <p className="text-white">{question}</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Tu Respuesta
                            </label>
                            <input
                                type="text"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                placeholder="Escribe tu respuesta"
                                className="w-full px-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Nueva Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    className="w-full pl-10 pr-12 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Confirmar Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repite tu contraseña"
                                    className="w-full pl-10 pr-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Restablecer Contraseña'}
                        </button>

                        <button
                            type="button"
                            onClick={() => { setStep(1); setError(''); }}
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
