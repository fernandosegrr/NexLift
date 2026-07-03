import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, User, Lock, Mail, Phone, Calendar, Shield, AlertCircle, Eye, EyeOff, Loader2, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

    const securityQuestions = [
        'Nombre de tu primera mascota',
        'Ciudad donde naciste',
        'Nombre de tu mejor amigo de infancia',
        'Marca de tu primer carro',
        'Nombre de tu escuela primaria',
        'Apodo de un familiar cercano'
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (formData.password.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres');
            return;
        }

        setLoading(true);

        try {
            await register({
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName,
                phone: formData.phone || undefined,
                birthDate: formData.birthDate || undefined,
                securityQuestion: formData.securityQuestion || undefined,
                securityAnswer: formData.securityAnswer || undefined
            });
            navigate('/');
        } catch (err) {
            setError(err.message || 'Error al crear cuenta');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-dark)] py-8 px-4" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
            <div className="w-full max-w-md mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <Link to="/login" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-white transition-colors mb-4">
                        <ChevronLeft className="w-5 h-5" />
                        Volver al login
                    </Link>
                    <h1 className="text-2xl font-bold text-white">Crear Cuenta</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Completa tus datos para registrarte</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border)] space-y-4">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Row: First Name, Last Name */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Nombre(s) *</label>
                            <input
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                placeholder="Fernando"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Apellidos *</label>
                            <input
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                placeholder="Guerrero"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    </div>

                    {/* Username */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Username *</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                placeholder="fernando.segrr"
                                className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Email *</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="correo@ejemplo.com"
                                className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Contraseña *</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Mínimo 8 caracteres"
                                className="w-full pl-9 pr-10 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Confirmar Contraseña *</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="Repite tu contraseña"
                                className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                required
                            />
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[var(--border)] pt-4 mt-4">
                        <p className="text-xs text-[var(--text-secondary)] mb-3">Datos opcionales</p>
                    </div>

                    {/* Phone and Birth Date */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Teléfono</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="1234567890"
                                    className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Fecha de Nac.</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                                <input
                                    type="date"
                                    name="birthDate"
                                    value={formData.birthDate}
                                    onChange={handleChange}
                                    className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Security Question */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                            <Shield className="inline w-3 h-3 mr-1" />
                            Pregunta de Seguridad
                        </label>
                        <select
                            name="securityQuestion"
                            value={formData.securityQuestion}
                            onChange={handleChange}
                            className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
                        >
                            <option value="">Selecciona una pregunta...</option>
                            {securityQuestions.map((q, i) => (
                                <option key={i} value={q}>{q}</option>
                            ))}
                        </select>
                    </div>

                    {formData.securityQuestion && (
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Respuesta</label>
                            <input
                                type="text"
                                name="securityAnswer"
                                value={formData.securityAnswer}
                                onChange={handleChange}
                                placeholder="Tu respuesta secreta"
                                className="w-full px-3 py-2.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-purple-500"
                            />
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <UserPlus className="w-5 h-5" />
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
