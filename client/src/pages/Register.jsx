import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, User, Lock, Mail, Phone, Calendar, Shield, AlertCircle, Eye, EyeOff, Loader2, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SECURITY_QUESTIONS } from '../utils/securityQuestions';

export default function Register() {
    const navigate = useNavigate();
    const { register } = useAuth();

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        phone: '',
        birthDate: '',
        securityQuestion: '',
        securityAnswer: ''
    });

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (error) setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setError('');

        const firstName = formData.firstName.trim();
        const lastName = formData.lastName.trim();
        const username = formData.username.trim();
        const email = formData.email.trim();

        if (!firstName || !lastName) {
            setError('Nombre y apellidos son obligatorios');
            return;
        }
        if (!username) {
            setError('El username es obligatorio');
            return;
        }
        if (/\s/.test(username)) {
            setError('El username no puede tener espacios');
            return;
        }
        if (!email) {
            setError('El email es obligatorio');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }
        if (formData.password.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres');
            return;
        }

        // Pregunta y respuesta van juntas: no se puede dejar una sola a medias
        const hasQ = !!formData.securityQuestion;
        const answer = (formData.securityAnswer || '').trim();
        if (hasQ && answer.length < 2) {
            setError('Escribe una respuesta de seguridad (mín. 2 caracteres) o quita la pregunta');
            return;
        }
        if (!hasQ && answer) {
            setError('Selecciona una pregunta de seguridad para esa respuesta');
            return;
        }

        setLoading(true);

        try {
            await register({
                username,
                email,
                password: formData.password,
                firstName,
                lastName,
                phone: formData.phone.trim() || undefined,
                birthDate: formData.birthDate || undefined,
                securityQuestion: hasQ ? formData.securityQuestion : undefined,
                securityAnswer: hasQ ? answer : undefined
            });
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message || 'Error al crear cuenta');
        } finally {
            setLoading(false);
        }
    };

    const passwordsMismatch =
        formData.confirmPassword.length > 0 && formData.password !== formData.confirmPassword;

    return (
        <div
            className="min-h-screen bg-[var(--bg-dark)] py-8 px-4"
            style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
            <div className="w-full max-w-md mx-auto">
                <div className="mb-6">
                    <Link to="/login" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-white transition-colors mb-4">
                        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                        Volver al login
                    </Link>
                    <h1 className="text-2xl font-bold text-white">Crear Cuenta</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Completa tus datos para registrarte</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)] space-y-4" noValidate>
                    {error && (
                        <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="reg-firstName" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Nombre(s) *</label>
                            <input
                                id="reg-firstName"
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                placeholder="Fernando"
                                autoComplete="given-name"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="reg-lastName" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Apellidos *</label>
                            <input
                                id="reg-lastName"
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                placeholder="Guerrero"
                                autoComplete="family-name"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="reg-username" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Username *</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
                            <input
                                id="reg-username"
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                placeholder="fernando.segrr"
                                autoComplete="username"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="reg-email" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Email *</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
                            <input
                                id="reg-email"
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="correo@ejemplo.com"
                                autoComplete="email"
                                autoCapitalize="none"
                                className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="reg-password" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Contraseña *</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
                            <input
                                id="reg-password"
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Mínimo 8 caracteres"
                                autoComplete="new-password"
                                minLength={8}
                                className="w-full pl-9 pr-10 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white p-1"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="reg-confirm" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Confirmar Contraseña *</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
                            <input
                                id="reg-confirm"
                                type={showPassword ? 'text' : 'password'}
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="Repite tu contraseña"
                                autoComplete="new-password"
                                minLength={8}
                                className={`w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500 ${
                                    passwordsMismatch ? 'border-red-500/60' : 'border-[var(--border)]'
                                }`}
                                required
                            />
                        </div>
                        {passwordsMismatch && (
                            <p className="text-xs text-red-400 mt-1">Las contraseñas no coinciden</p>
                        )}
                    </div>

                    <div className="border-t border-[var(--border)] pt-4 mt-4">
                        <p className="text-xs text-[var(--text-secondary)] mb-3">Datos opcionales</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="reg-phone" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Teléfono</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
                                <input
                                    id="reg-phone"
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="1234567890"
                                    autoComplete="tel"
                                    className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="reg-birth" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Fecha de Nac.</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
                                <input
                                    id="reg-birth"
                                    type="date"
                                    name="birthDate"
                                    value={formData.birthDate}
                                    onChange={handleChange}
                                    autoComplete="bday"
                                    className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="reg-security-q" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                            <Shield className="inline w-3 h-3 mr-1" aria-hidden="true" />
                            Pregunta de Seguridad
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)]/80 mb-1.5">
                            Recomendada: es la única forma de recuperar la contraseña (sin email).
                        </p>
                        <select
                            id="reg-security-q"
                            name="securityQuestion"
                            value={formData.securityQuestion}
                            onChange={handleChange}
                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
                        >
                            <option value="">Selecciona una pregunta...</option>
                            {SECURITY_QUESTIONS.map((q, i) => (
                                <option key={i} value={q}>{q}</option>
                            ))}
                        </select>
                    </div>

                    {formData.securityQuestion && (
                        <div>
                            <label htmlFor="reg-security-a" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Respuesta *</label>
                            <input
                                id="reg-security-a"
                                type="text"
                                name="securityAnswer"
                                value={formData.securityAnswer}
                                onChange={handleChange}
                                placeholder="Tu respuesta secreta"
                                autoComplete="off"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || passwordsMismatch || formData.password.length < 8}
                        className="w-full mt-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                        ) : (
                            <>
                                <UserPlus className="w-5 h-5" aria-hidden="true" />
                                Crear Cuenta
                            </>
                        )}
                    </button>

                    <p className="text-center text-sm text-[var(--text-secondary)]">
                        ¿Ya tienes cuenta?{' '}
                        <Link to="/login" className="text-purple-400 hover:text-purple-300">
                            Inicia sesión
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
}
