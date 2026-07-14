import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, User, Lock, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;

        const user = username.trim();
        if (!user || !password) {
            setError('Usuario y contraseña son obligatorios');
            return;
        }

        setError('');
        setLoading(true);

        try {
            await login(user, password);
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center px-4"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <img
                        src="/logo.png"
                        alt="NexLift"
                        className="w-16 h-16 mx-auto mb-4 rounded-2xl shadow-lg shadow-[var(--primary)]/25"
                    />
                    <h1 className="text-2xl font-bold text-white">NexLift</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Inicia sesión en tu cuenta</p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)]"
                    noValidate
                >
                    {error && (
                        <div
                            role="alert"
                            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400"
                        >
                            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="login-username" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Usuario o Email
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
                                <input
                                    id="login-username"
                                    type="text"
                                    name="username"
                                    value={username}
                                    onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }}
                                    placeholder="tu.usuario"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    autoFocus
                                    aria-invalid={!!error}
                                    className="w-full min-h-[48px] pl-10 pr-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="login-password" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    aria-invalid={!!error}
                                    className="w-full min-h-[48px] pl-10 pr-12 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !username.trim() || !password}
                        className="w-full mt-6 min-h-[48px] py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/25"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                        ) : (
                            <>
                                <LogIn className="w-5 h-5" aria-hidden="true" />
                                Iniciar Sesión
                            </>
                        )}
                    </button>

                    <div className="mt-6 text-center space-y-2">
                        <Link
                            to="/forgot-password"
                            className="block text-sm text-[var(--primary)] hover:brightness-125 transition-colors min-h-[44px] leading-[44px]"
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                        <p className="text-sm text-[var(--text-secondary)]">
                            ¿No tienes cuenta?{' '}
                            <Link to="/register" className="text-[var(--primary)] hover:brightness-125 transition-colors font-medium">
                                Regístrate
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
