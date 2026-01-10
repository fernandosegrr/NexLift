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
        setError('');
        setLoading(true);

        try {
            await login(username, password);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <img
                        src="/logo.png"
                        alt="NexLift"
                        className="w-16 h-16 mx-auto mb-4 rounded-2xl shadow-lg shadow-purple-500/25"
                    />
                    <h1 className="text-2xl font-bold text-white">NexLift</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Inicia sesión en tu cuenta</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)]">
                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Username */}
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
                                    className="w-full pl-10 pr-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500 transition-colors"
                                    required
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-12 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500 transition-colors"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <LogIn className="w-5 h-5" />
                                Iniciar Sesión
                            </>
                        )}
                    </button>

                    {/* Links */}
                    <div className="mt-6 text-center space-y-2">
                        <Link
                            to="/forgot-password"
                            className="block text-sm text-purple-400 hover:text-purple-300 transition-colors"
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                        <p className="text-sm text-[var(--text-secondary)]">
                            ¿No tienes cuenta?{' '}
                            <Link to="/register" className="text-purple-400 hover:text-purple-300 transition-colors">
                                Regístrate
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
