import { operationalLog } from '../../operations/telemetry.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { compareCredential, passwordValid } from './validation.js';
import { isDependencyUnavailable } from '../../operations/errors.js';

function authFailure(error, req, res, event, message) {
    const unavailable = isDependencyUnavailable(error);
    const conflict = error?.code === 'P2025' && ['/api/auth/password', '/api/auth/security-question', '/api/auth/recover/verify'].includes(req.path);
    const status = conflict ? 409 : unavailable ? 503 : 500;
    operationalLog({ event, category: conflict ? 'conflict' : unavailable ? 'dependency_unavailable' : 'internal', requestId: req.requestId, status });
    if (unavailable) res.set('Retry-After', '5');
    return res.status(status).json({ error: conflict ? 'La cuenta cambió. Vuelve a verificar tus credenciales.' : unavailable ? 'Servicio temporalmente no disponible' : message });
}

export function registerRoutes(app, { prisma, authMiddleware, rateLimit, uploadPhoto, JWT_SECRET , console, webSessions }) {
const sessionResult = (handler) => (req, res) => { const result = handler(req); for (const [key, value] of Object.entries(result.headers)) res.set(key, value); return res.status(result.status).json(result.body); };
app.post('/api/auth/web-session', authMiddleware, rateLimit({ max: 12 }), sessionResult(req => webSessions.exchange(req)));
app.get('/api/auth/web-session', authMiddleware, sessionResult(req => webSessions.inspect(req)));
app.delete('/api/auth/web-session', authMiddleware, sessionResult(req => webSessions.logout(req)));
app.post('/api/auth/register', rateLimit(), async (req, res) => {
    try {
        let { username, email, password, firstName, lastName, phone, birthDate, securityQuestion, securityAnswer } = req.body;
        username = username?.trim();
        email = email?.trim();

        firstName = typeof firstName === 'string' ? firstName.trim() : firstName;
        lastName = typeof lastName === 'string' ? lastName.trim() : lastName;

        if (!username || !email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Campos requeridos: username, email, password, firstName, lastName' });
        }
        if (/\s/.test(username)) {
            return res.status(400).json({ error: 'El username no puede tener espacios' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
        }
        // Pregunta y respuesta deben ir juntas (o ninguna)
        const hasQ = !!(securityQuestion && String(securityQuestion).trim());
        const hasA = !!(securityAnswer && String(securityAnswer).trim());
        if (hasQ !== hasA) {
            return res.status(400).json({ error: 'Pregunta y respuesta de seguridad deben ir juntas' });
        }
        if (hasA && securityAnswer.trim().length < 2) {
            return res.status(400).json({ error: 'La respuesta de seguridad es demasiado corta' });
        }

        const existing = await prisma.user.findFirst({
            where: { OR: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] }
        });

        if (existing) {
            return res.status(409).json({
                error: existing.username === username.toLowerCase() ? 'Username ya existe' : 'Email ya registrado'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const securityAnswerHash = hasA ? await bcrypt.hash(securityAnswer.toLowerCase().trim(), 10) : null;

        // birthDate: anclar a mediodía UTC para no desfasar el día civil (mismo criterio que PUT /profile)
        let birthDateValue = null;
        if (birthDate) {
            const day = String(birthDate).split('T')[0];
            birthDateValue = new Date(`${day}T12:00:00.000Z`);
            if (Number.isNaN(birthDateValue.getTime())) {
                return res.status(400).json({ error: 'Fecha de nacimiento inválida' });
            }
        }

        const user = await prisma.user.create({
            data: {
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                passwordHash,
                firstName,
                lastName,
                phone: (phone && String(phone).trim()) || null,
                birthDate: birthDateValue,
                securityQuestion: hasQ ? String(securityQuestion).trim() : null,
                securityAnswerHash
            },
            select: { id: true, username: true, email: true, firstName: true, lastName: true, phone: true, birthDate: true, avatarUrl: true, createdAt: true, tokenVersion: true }
        });

        const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
        delete user.tokenVersion;
        res.status(201).json({ user, token });
    } catch (error) {
        authFailure(error, req, res, 'register_failed', 'Error al crear cuenta');
    }
});

app.post('/api/auth/login', rateLimit(), async (req, res) => {
    try {
        let { username, password } = req.body;
        username = username?.trim();

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        }

        const user = await prisma.user.findFirst({
            where: { OR: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] }
        });

        const valid = await compareCredential(password, user?.passwordHash);
        if (!user || !user.isActive || !valid) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

        const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                birthDate: user.birthDate,
                avatarUrl: user.avatarUrl,
                creatineReminderEnabled: user.creatineReminderEnabled,
                creatineReminderTime: user.creatineReminderTime,
                createdAt: user.createdAt
            },
            token
        });
    } catch (error) {
        authFailure(error, req, res, 'login_failed', 'Error al iniciar sesión');
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true, username: true, email: true, firstName: true, lastName: true,
                phone: true, birthDate: true, avatarUrl: true, securityQuestion: true,
                creatineReminderEnabled: true, creatineReminderTime: true,
                createdAt: true, lastLogin: true,
                _count: { select: { routines: true, bodyLogs: true, personalRecords: true } }
            }
        });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(user);
    } catch (error) {
        authFailure(error, req, res, 'profile_failed', 'Error al obtener perfil');
    }
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName, phone, birthDate } = req.body;
        if (firstName !== undefined && !String(firstName || '').trim()) {
            return res.status(400).json({ error: 'El nombre es obligatorio' });
        }
        if (lastName !== undefined && !String(lastName || '').trim()) {
            return res.status(400).json({ error: 'Los apellidos son obligatorios' });
        }

        // birthDate: string ISO día → Date; string vacío/null → limpia el campo
        let birthDateValue = undefined;
        if (birthDate === null || birthDate === '') {
            birthDateValue = null;
        } else if (birthDate) {
            // Anclar a mediodía UTC para no desfasar el día calendario
            const day = String(birthDate).split('T')[0];
            birthDateValue = new Date(`${day}T12:00:00.000Z`);
            if (Number.isNaN(birthDateValue.getTime())) {
                return res.status(400).json({ error: 'Fecha de nacimiento inválida' });
            }
        }

        const user = await prisma.user.update({
            where: { id: req.userId },
            data: {
                firstName: firstName !== undefined ? String(firstName).trim() : undefined,
                lastName: lastName !== undefined ? String(lastName).trim() : undefined,
                phone: phone !== undefined ? (String(phone).trim() || null) : undefined,
                birthDate: birthDateValue
            },
            select: { id: true, username: true, email: true, firstName: true, lastName: true, phone: true, birthDate: true, avatarUrl: true }
        });
        res.json(user);
    } catch (error) {
        authFailure(error, req, res, 'profile_update_failed', 'Error al actualizar perfil');
    }
});

app.put('/api/auth/password', authMiddleware, rateLimit({ max: 8 }), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
        }
        if (!passwordValid(newPassword)) {
            return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        // Incrementar tokenVersion invalida cualquier otro JWT filtrado — se firma
        // uno nuevo abajo para que ESTA sesión (la que sí demostró conocer la
        // contraseña actual) no se cierre sola.
        const updated = await prisma.user.update({
            where: { id: req.userId, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion },
            data: { passwordHash, tokenVersion: { increment: 1 } }
        });
        const token = jwt.sign({ userId: updated.id, tokenVersion: updated.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
        res.json({ message: 'Contraseña actualizada', token });
    } catch (error) {
        authFailure(error, req, res, 'password_change_failed', 'Error al cambiar contraseña');
    }
});

app.post('/api/auth/recover/question', rateLimit(), async (req, res) => {
    try {
        const username = req.body.username?.trim();
        const user = await prisma.user.findFirst({
            where: { OR: [{ username: username?.toLowerCase() }, { email: username?.toLowerCase() }] },
            select: { securityQuestion: true }
        });
        if (!user || !user.securityQuestion) {
            return res.status(404).json({ error: 'Usuario no encontrado o sin pregunta de seguridad' });
        }
        res.json({ question: user.securityQuestion });
    } catch (error) {
        authFailure(error, req, res, 'security_question_failed', 'Error');
    }
});

app.post('/api/auth/recover/verify', rateLimit(), rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 5,
    keyFn: (req) => `recover-account:${typeof req.body?.username === 'string' ? req.body.username.toLowerCase().trim().slice(0, 254) : ''}`
}), async (req, res) => {
    try {
        const username = req.body.username?.trim();
        const { answer, newPassword } = req.body;
        if (!passwordValid(newPassword)) {
            return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres' });
        }
        const user = await prisma.user.findFirst({
            where: { OR: [{ username: username?.toLowerCase() }, { email: username?.toLowerCase() }] }
        });
        const valid = await compareCredential((answer || '').toLowerCase().trim(), user?.securityAnswerHash);
        if (!user || !user.isActive || !user.securityAnswerHash || !valid) return res.status(401).json({ error: 'Respuesta incorrecta' });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        // También invalida cualquier token viejo (robado o no) — quien acaba de
        // restablecer la contraseña por esta vía debe volver a iniciar sesión.
        await prisma.user.update({ where: { id: user.id, securityAnswerHash: user.securityAnswerHash, tokenVersion: user.tokenVersion }, data: { passwordHash, tokenVersion: { increment: 1 } } });
        res.json({ message: 'Contraseña restablecida exitosamente' });
    } catch (error) {
        authFailure(error, req, res, 'password_reset_failed', 'Error al restablecer contraseña');
    }
});

app.put('/api/auth/security-question', authMiddleware, rateLimit({ max: 8 }), async (req, res) => {
    try {
        const { currentPassword, question, answer } = req.body;
        if (!currentPassword || !question || !answer) {
            return res.status(400).json({ error: 'Contraseña actual, pregunta y respuesta requeridas' });
        }
        if (answer.trim().length < 2) {
            return res.status(400).json({ error: 'La respuesta de seguridad es demasiado corta' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

        const securityAnswerHash = await bcrypt.hash(answer.toLowerCase().trim(), 10);
        const updated = await prisma.user.update({
            where: { id: req.userId, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion },
            data: { securityQuestion: question, securityAnswerHash, tokenVersion: { increment: 1 } }
        });
        const token = jwt.sign({ userId: updated.id, tokenVersion: updated.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
        res.json({ message: 'Pregunta de seguridad actualizada', token });
    } catch (error) {
        authFailure(error, req, res, 'security_update_failed', 'Error al actualizar pregunta de seguridad');
    }
});

app.post('/api/auth/avatar', authMiddleware, async (req, res) => {
    try {
        const { avatar } = req.body;

        if (!avatar) {
            return res.status(400).json({ error: 'Avatar requerido' });
        }

        // Upload
        let avatarUrl = null;
        if (avatar.startsWith('data:image') || avatar.length > 500) {
            console.log('📸 Uploading avatar...');
            avatarUrl = await uploadPhoto(avatar);
            if (!avatarUrl) {
                return res.status(400).json({ error: 'No se pudo subir la imagen (formato inválido o error del servicio)' });
            }
            console.log('✅ Avatar uploaded:', avatarUrl);
        } else {
            avatarUrl = avatar;
        }

        // Update user
        const user = await prisma.user.update({
            where: { id: req.userId },
            data: { avatarUrl },
            select: { id: true, avatarUrl: true }
        });

        res.json({ message: 'Avatar actualizado', avatarUrl: user.avatarUrl });
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Error al actualizar avatar' });
    }
});

}
