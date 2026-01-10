import { hashPassword, verifyPassword, hashSecurityAnswer, verifySecurityAnswer } from '../utils/password.js';
import { generateToken } from '../middleware/auth.js';

/**
 * Auth routes factory
 * @param {PrismaClient} prisma
 */
export function createAuthRoutes(prisma) {
    return {
        /**
         * POST /api/auth/register
         */
        async register(req, res) {
            try {
                const {
                    username, email, password,
                    firstName, lastName, phone, birthDate,
                    securityQuestion, securityAnswer
                } = req.body;

                // Validaciones básicas
                if (!username || !email || !password || !firstName || !lastName) {
                    return res.status(400).json({
                        error: 'Campos requeridos: username, email, password, firstName, lastName'
                    });
                }

                // Verificar si ya existe
                const existing = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: username.toLowerCase() },
                            { email: email.toLowerCase() }
                        ]
                    }
                });

                if (existing) {
                    return res.status(409).json({
                        error: existing.username === username.toLowerCase()
                            ? 'El nombre de usuario ya está en uso'
                            : 'El email ya está registrado'
                    });
                }

                // Hash password y pregunta de seguridad
                const passwordHash = await hashPassword(password);
                const securityAnswerHash = securityAnswer
                    ? await hashSecurityAnswer(securityAnswer)
                    : null;

                // Crear usuario
                const user = await prisma.user.create({
                    data: {
                        username: username.toLowerCase(),
                        email: email.toLowerCase(),
                        passwordHash,
                        firstName,
                        lastName,
                        phone: phone || null,
                        birthDate: birthDate ? new Date(birthDate) : null,
                        securityQuestion: securityQuestion || null,
                        securityAnswerHash
                    },
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        createdAt: true
                    }
                });

                // Generar token
                const token = generateToken(user.id);

                res.status(201).json({ user, token });
            } catch (error) {
                console.error('Register error:', error);
                res.status(500).json({ error: 'Error al crear cuenta' });
            }
        },

        /**
         * POST /api/auth/login
         */
        async login(req, res) {
            try {
                const { username, password } = req.body;

                if (!username || !password) {
                    return res.status(400).json({ error: 'Username y password requeridos' });
                }

                // Buscar usuario
                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: username.toLowerCase() },
                            { email: username.toLowerCase() }
                        ]
                    }
                });

                if (!user) {
                    return res.status(401).json({ error: 'Credenciales inválidas' });
                }

                if (!user.isActive) {
                    return res.status(403).json({ error: 'Cuenta desactivada' });
                }

                // Verificar password
                const valid = await verifyPassword(password, user.passwordHash);
                if (!valid) {
                    return res.status(401).json({ error: 'Credenciales inválidas' });
                }

                // Actualizar último login
                await prisma.user.update({
                    where: { id: user.id },
                    data: { lastLogin: new Date() }
                });

                // Generar token
                const token = generateToken(user.id);

                res.json({
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        avatarUrl: user.avatarUrl
                    },
                    token
                });
            } catch (error) {
                console.error('Login error:', error);
                res.status(500).json({ error: 'Error al iniciar sesión' });
            }
        },

        /**
         * GET /api/auth/me
         */
        async getProfile(req, res) {
            try {
                const user = await prisma.user.findUnique({
                    where: { id: req.userId },
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        birthDate: true,
                        avatarUrl: true,
                        securityQuestion: true,
                        createdAt: true,
                        lastLogin: true,
                        _count: {
                            select: {
                                routines: true,
                                bodyLogs: true,
                                personalRecords: true
                            }
                        }
                    }
                });

                if (!user) {
                    return res.status(404).json({ error: 'Usuario no encontrado' });
                }

                res.json(user);
            } catch (error) {
                console.error('Get profile error:', error);
                res.status(500).json({ error: 'Error al obtener perfil' });
            }
        },

        /**
         * PUT /api/auth/profile
         */
        async updateProfile(req, res) {
            try {
                const { firstName, lastName, phone, birthDate } = req.body;

                const user = await prisma.user.update({
                    where: { id: req.userId },
                    data: {
                        firstName: firstName || undefined,
                        lastName: lastName || undefined,
                        phone: phone || undefined,
                        birthDate: birthDate ? new Date(birthDate) : undefined
                    },
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        birthDate: true,
                        avatarUrl: true
                    }
                });

                res.json(user);
            } catch (error) {
                console.error('Update profile error:', error);
                res.status(500).json({ error: 'Error al actualizar perfil' });
            }
        },

        /**
         * PUT /api/auth/password
         */
        async changePassword(req, res) {
            try {
                const { currentPassword, newPassword } = req.body;

                if (!currentPassword || !newPassword) {
                    return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
                }

                const user = await prisma.user.findUnique({
                    where: { id: req.userId }
                });

                const valid = await verifyPassword(currentPassword, user.passwordHash);
                if (!valid) {
                    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
                }

                const passwordHash = await hashPassword(newPassword);
                await prisma.user.update({
                    where: { id: req.userId },
                    data: { passwordHash }
                });

                res.json({ message: 'Contraseña actualizada' });
            } catch (error) {
                console.error('Change password error:', error);
                res.status(500).json({ error: 'Error al cambiar contraseña' });
            }
        },

        /**
         * POST /api/auth/recover/question
         * Get security question for a user
         */
        async getSecurityQuestion(req, res) {
            try {
                const { username } = req.body;

                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: username?.toLowerCase() },
                            { email: username?.toLowerCase() }
                        ]
                    },
                    select: { securityQuestion: true }
                });

                if (!user || !user.securityQuestion) {
                    return res.status(404).json({ error: 'Usuario no encontrado o sin pregunta de seguridad' });
                }

                res.json({ question: user.securityQuestion });
            } catch (error) {
                console.error('Get security question error:', error);
                res.status(500).json({ error: 'Error' });
            }
        },

        /**
         * POST /api/auth/recover/verify
         * Verify security answer and reset password
         */
        async verifySecurityAndReset(req, res) {
            try {
                const { username, answer, newPassword } = req.body;

                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: username?.toLowerCase() },
                            { email: username?.toLowerCase() }
                        ]
                    }
                });

                if (!user || !user.securityAnswerHash) {
                    return res.status(404).json({ error: 'Usuario no encontrado' });
                }

                const valid = await verifySecurityAnswer(answer, user.securityAnswerHash);
                if (!valid) {
                    return res.status(401).json({ error: 'Respuesta incorrecta' });
                }

                const passwordHash = await hashPassword(newPassword);
                await prisma.user.update({
                    where: { id: user.id },
                    data: { passwordHash }
                });

                res.json({ message: 'Contraseña restablecida exitosamente' });
            } catch (error) {
                console.error('Reset password error:', error);
                res.status(500).json({ error: 'Error al restablecer contraseña' });
            }
        },

        /**
         * PUT /api/auth/security-question
         */
        async updateSecurityQuestion(req, res) {
            try {
                const { question, answer } = req.body;

                if (!question || !answer) {
                    return res.status(400).json({ error: 'Pregunta y respuesta requeridas' });
                }

                const securityAnswerHash = await hashSecurityAnswer(answer);

                await prisma.user.update({
                    where: { id: req.userId },
                    data: {
                        securityQuestion: question,
                        securityAnswerHash
                    }
                });

                res.json({ message: 'Pregunta de seguridad actualizada' });
            } catch (error) {
                console.error('Update security question error:', error);
                res.status(500).json({ error: 'Error al actualizar pregunta de seguridad' });
            }
        }
    };
}
