import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'nexlift-secret-key-change-in-production';

// Catbox upload function (inline to avoid external dependencies)
const CATBOX_API = 'https://catbox.moe/user/api.php';

async function uploadBase64ToCatbox(base64Data, extension = 'jpg') {
    try {
        const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Clean, 'base64');
        const filename = `nexlift_${Date.now()}.${extension}`;

        // Create form data manually for fetch
        const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`),
            buffer,
            Buffer.from(`\r\n--${boundary}--\r\n`)
        ]);

        const response = await fetch(CATBOX_API, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body
        });

        if (!response.ok) throw new Error(`Catbox upload failed: ${response.status}`);
        const url = await response.text();
        return url.trim();
    } catch (error) {
        console.error('Catbox upload error:', error.message);
        return null;
    }
}

// Auth middleware (inline to avoid external dependencies)
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from client/dist (for production)
app.use(express.static(path.join(__dirname, '../../client/dist')));

// ============================================
// HELPERS
// ============================================

/**
 * Normaliza nombre de ejercicio para consistencia en PRs
 * - Quita prefijos de numeración (a1., b.2, etc.)
 * - Convierte a minúsculas
 * - Limpia espacios extras
 */
function normalizeExerciseName(name) {
    if (!name) return '';
    return name
        .replace(/^[a-z]\.?\d+\.?\s*/i, '') // Quita prefijos "a1.", "b.2", "A1 ", etc.
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' '); // Normaliza espacios múltiples
}

async function getRecycleBinDay(userId) {
    let routine = await prisma.routine.findFirst({
        where: { userId, name: "ARCHIVED_HISTORY_DO_NOT_DELETE", isActive: false }
    });

    if (!routine) {
        routine = await prisma.routine.create({
            data: {
                userId,
                name: "ARCHIVED_HISTORY_DO_NOT_DELETE",
                description: "System routine for preserving history of renamed/deleted exercises.",
                isActive: false
            }
        });
    }

    let day = await prisma.routineDay.findFirst({
        where: { routineId: routine.id }
    });

    if (!day) {
        day = await prisma.routineDay.create({
            data: {
                routineId: routine.id,
                dayName: "Bin",
                order: 0
            }
        });
    }
    return day.id;
}

// ============================================
// ROUTES: Routine Import
// ============================================

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, phone, birthDate, securityQuestion, securityAnswer } = req.body;

        if (!username || !email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Campos requeridos: username, email, password, firstName, lastName' });
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
        const securityAnswerHash = securityAnswer ? await bcrypt.hash(securityAnswer.toLowerCase().trim(), 10) : null;

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
            select: { id: true, username: true, email: true, firstName: true, lastName: true, phone: true, birthDate: true, avatarUrl: true, createdAt: true }
        });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '365d' });
        res.status(201).json({ user, token });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Error al crear cuenta' });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username y password requeridos' });
        }

        const user = await prisma.user.findFirst({
            where: { OR: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] }
        });

        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '365d' });
        res.json({
            user: { id: user.id, username: user.username, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone, birthDate: user.birthDate, avatarUrl: user.avatarUrl, createdAt: user.createdAt },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// GET /api/auth/me - Get current user profile
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true, username: true, email: true, firstName: true, lastName: true,
                phone: true, birthDate: true, avatarUrl: true, securityQuestion: true,
                createdAt: true, lastLogin: true,
                _count: { select: { routines: true, bodyLogs: true, personalRecords: true } }
            }
        });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(user);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// PUT /api/auth/profile - Update profile
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
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
            select: { id: true, username: true, email: true, firstName: true, lastName: true, phone: true, birthDate: true, avatarUrl: true }
        });
        res.json(user);
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// PUT /api/auth/password - Change password
app.put('/api/auth/password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: req.userId }, data: { passwordHash } });
        res.json({ message: 'Contraseña actualizada' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

// POST /api/auth/recover/question - Get security question
app.post('/api/auth/recover/question', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await prisma.user.findFirst({
            where: { OR: [{ username: username?.toLowerCase() }, { email: username?.toLowerCase() }] },
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
});

// POST /api/auth/recover/verify - Verify answer and reset password
app.post('/api/auth/recover/verify', async (req, res) => {
    try {
        const { username, answer, newPassword } = req.body;
        const user = await prisma.user.findFirst({
            where: { OR: [{ username: username?.toLowerCase() }, { email: username?.toLowerCase() }] }
        });
        if (!user || !user.securityAnswerHash) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const valid = await bcrypt.compare(answer.toLowerCase().trim(), user.securityAnswerHash);
        if (!valid) return res.status(401).json({ error: 'Respuesta incorrecta' });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
        res.json({ message: 'Contraseña restablecida exitosamente' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Error al restablecer contraseña' });
    }
});

// PUT /api/auth/security-question - Update security question
app.put('/api/auth/security-question', authMiddleware, async (req, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ error: 'Pregunta y respuesta requeridas' });
        }
        const securityAnswerHash = await bcrypt.hash(answer.toLowerCase().trim(), 10);
        await prisma.user.update({
            where: { id: req.userId },
            data: { securityQuestion: question, securityAnswerHash }
        });
        res.json({ message: 'Pregunta de seguridad actualizada' });
    } catch (error) {
        console.error('Update security question error:', error);
        res.status(500).json({ error: 'Error al actualizar pregunta de seguridad' });
    }
});

// POST /api/auth/avatar - Upload avatar to Catbox
app.post('/api/auth/avatar', authMiddleware, async (req, res) => {
    try {
        const { avatar } = req.body;

        if (!avatar) {
            return res.status(400).json({ error: 'Avatar requerido' });
        }

        // Upload to Catbox
        let avatarUrl = null;
        if (avatar.startsWith('data:image') || avatar.length > 500) {
            try {
                console.log('📸 Uploading avatar to Catbox...');
                avatarUrl = await uploadBase64ToCatbox(avatar, 'jpg');
                console.log('✅ Avatar uploaded:', avatarUrl);
            } catch (uploadError) {
                console.error('❌ Catbox upload failed:', uploadError.message);
                return res.status(500).json({ error: 'Error al subir imagen' });
            }
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

// ============================================
// ROUTES: Routine Import
// ============================================

// POST /api/routines/import - Import JSON routine
app.post('/api/routines/import', authMiddleware, async (req, res) => {
    try {
        const { name, description, days } = req.body;

        // Validate structure
        if (!name || !days || !Array.isArray(days)) {
            return res.status(400).json({
                error: 'Invalid JSON structure. Required: name, days[]'
            });
        }

        // Create routine with nested days and exercises
        const routine = await prisma.routine.create({
            data: {
                userId: req.userId,
                name,
                description: description || null,
                days: {
                    create: days.map((day, dayIndex) => ({
                        dayName: day.dayName,
                        isRestDay: day.isRestDay || false,
                        order: dayIndex,
                        exercises: {
                            create: (day.exercises || []).map((exercise, exIndex) => ({
                                name: normalizeExerciseName(exercise.name),
                                targetSets: exercise.sets || 3,
                                targetReps: exercise.reps || '8-12',
                                restSeconds: exercise.rest || null,
                                note: exercise.note || null,
                                isUnilateral: exercise.isUnilateral || false,
                                order: exercise.order !== undefined ? exercise.order : exIndex
                            }))
                        }
                    }))
                }
            },
            include: {
                days: {
                    include: {
                        exercises: { orderBy: { order: 'asc' } }
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });

        res.status(201).json({
            message: 'Routine imported successfully!',
            routine
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to import routine' });
    }
});

// ============================================
// ROUTES: Routines CRUD
// ============================================

// GET /api/routines - List all routines
app.get('/api/routines', authMiddleware, async (req, res) => {
    try {
        const routines = await prisma.routine.findMany({
            where: {
                userId: req.userId,
                name: { not: "ARCHIVED_HISTORY_DO_NOT_DELETE" }
            },
            include: {
                days: {
                    include: {
                        exercises: { orderBy: { order: 'asc' } }
                    },
                    orderBy: { order: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(routines);
    } catch (error) {
        console.error('Error fetching routines:', error);
        res.status(500).json({ error: 'Failed to fetch routines' });
    }
});

// GET /api/routines/trash - Get the system archive routine
app.get('/api/routines/trash', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: {
                userId: req.userId,
                name: "ARCHIVED_HISTORY_DO_NOT_DELETE"
            },
            include: {
                days: {
                    include: {
                        exercises: { orderBy: { order: 'asc' } }
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });
        // Return null if not found (no trash yet), frontend handles it
        res.json(routine || null);
    } catch (error) {
        console.error('Error fetching trash routine:', error);
        res.status(500).json({ error: 'Failed to fetch trash routine' });
    }
});

// GET /api/routines/active - Get active routine (MUST be before :id)
app.get('/api/routines/active', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { isActive: true, userId: req.userId },
            include: {
                days: {
                    include: {
                        exercises: {
                            include: {
                                workoutLogs: {
                                    include: { sets: true },
                                    orderBy: { date: 'desc' },
                                    take: 1
                                }
                            },
                            orderBy: { order: 'asc' }
                        }
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });
        res.json(routine);
    } catch (error) {
        console.error('Error fetching active routine:', error);
        res.status(500).json({ error: 'Failed to fetch active routine' });
    }
});

// GET /api/routines/:id - Get single routine
app.get('/api/routines/:id', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId },
            include: {
                days: {
                    include: {
                        exercises: {
                            include: {
                                workoutLogs: {
                                    include: { sets: true },
                                    orderBy: { date: 'desc' },
                                    take: 5
                                }
                            },
                            orderBy: { order: 'asc' }
                        }
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        res.json(routine);
    } catch (error) {
        console.error('Error fetching routine:', error);
        res.status(500).json({ error: 'Failed to fetch routine' });
    }
});

// DELETE /api/routines/:id - Delete routine
app.delete('/api/routines/:id', authMiddleware, async (req, res) => {
    try {
        // Verify ownership
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // PRE-DELETE: Archive exercises with history
        const routineDays = await prisma.routineDay.findMany({
            where: { routineId: req.params.id },
            include: { exercises: { select: { id: true } } }
        });

        for (const day of routineDays) {
            for (const ex of day.exercises) {
                const logCount = await prisma.workoutLog.count({ where: { exerciseId: ex.id } });
                if (logCount > 0) {
                    const binId = await getRecycleBinDay(req.userId);
                    await prisma.exercise.update({
                        where: { id: ex.id },
                        data: { routineDayId: binId }
                    });
                }
            }
        }

        await prisma.routine.delete({
            where: { id: req.params.id }
        });
        res.json({ message: 'Routine deleted successfully' });
    } catch (error) {
        console.error('Error deleting routine:', error);
        res.status(500).json({ error: 'Failed to delete routine' });
    }
});

// PUT /api/routines/:id - Update routine (Full Structure)
app.put('/api/routines/:id', authMiddleware, async (req, res) => {
    try {
        const routineId = req.params.id;
        console.log(`DEBUG: PUT routine ${routineId}`);
        const { name, description, days } = req.body;

        // Verify ownership
        const existingRoutine = await prisma.routine.findFirst({
            where: { id: routineId, userId: req.userId }
        });

        if (!existingRoutine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // 1. Update basic info
        await prisma.routine.update({
            where: { id: routineId },
            data: { name, description }
        });

        // 2. Handle Days
        const existingDays = await prisma.routineDay.findMany({
            where: { routineId },
            select: { id: true }
        });
        const incomingDayIds = days.filter(d => d.id).map(d => d.id);
        const daysToDelete = existingDays.filter(d => !incomingDayIds.includes(d.id)).map(d => d.id);

        if (daysToDelete.length > 0) {
            // SAFE DELETE DAYS: Archive exercises with logs first
            const days = await prisma.routineDay.findMany({
                where: { id: { in: daysToDelete } },
                include: { exercises: { select: { id: true } } }
            });

            for (const d of days) {
                for (const ex of d.exercises) {
                    const logCount = await prisma.workoutLog.count({ where: { exerciseId: ex.id } });
                    if (logCount > 0) {
                        const binId = await getRecycleBinDay(req.userId);
                        await prisma.exercise.update({
                            where: { id: ex.id },
                            data: { routineDayId: binId }
                        });
                    }
                }
            }
            await prisma.routineDay.deleteMany({ where: { id: { in: daysToDelete } } });
        }

        for (let i = 0; i < days.length; i++) {
            const day = days[i];
            let dayId = day.id;

            if (dayId) {
                await prisma.routineDay.update({
                    where: { id: dayId },
                    data: {
                        dayName: day.dayName,
                        isRestDay: day.isRestDay || false,
                        order: i
                    }
                });
            } else {
                const newDay = await prisma.routineDay.create({
                    data: {
                        routineId,
                        dayName: day.dayName,
                        isRestDay: day.isRestDay || false,
                        order: i
                    }
                });
                dayId = newDay.id;
            }

            // 3. Handle Exercises
            if (day.exercises && Array.isArray(day.exercises)) {
                const existingExercises = await prisma.exercise.findMany({
                    where: { routineDayId: dayId },
                    select: { id: true }
                });
                const incomingExIds = day.exercises.filter(e => e.id).map(e => e.id);
                const exToDelete = existingExercises.filter(e => !incomingExIds.includes(e.id)).map(e => e.id);

                if (exToDelete.length > 0) {
                    for (const exId of exToDelete) {
                        const logCount = await prisma.workoutLog.count({ where: { exerciseId: exId } });
                        if (logCount > 0) {
                            // Safe Delete: Has history, move to archive
                            console.log(`Archiving deleted exercise ${exId} to preserve history`);
                            const binId = await getRecycleBinDay(req.userId);
                            await prisma.exercise.update({
                                where: { id: exId },
                                data: { routineDayId: binId }
                            });
                        } else {
                            // True Delete: No history
                            await prisma.exercise.delete({ where: { id: exId } });
                        }
                    }
                }

                for (let j = 0; j < day.exercises.length; j++) {
                    const ex = day.exercises[j];
                    const normalizedName = normalizeExerciseName(ex.name);

                    if (ex.id) {
                        const currentExercise = await prisma.exercise.findUnique({
                            where: { id: ex.id },
                            select: { name: true }
                        });

                        const currentName = currentExercise ? normalizeExerciseName(currentExercise.name) : '';

                        if (currentName !== normalizedName) {
                            // Check for history
                            const logCount = await prisma.workoutLog.count({
                                where: { exerciseId: ex.id }
                            });
                            console.log(`DEBUG: Rename "${currentName}" -> "${normalizedName}". LogCount: ${logCount}`);

                            if (logCount > 0) {
                                // Has history: Move current to Recycle Bin
                                console.log(`Archiving exercise "${currentExercise.name}" due to rename/replace to "${normalizedName}"`);
                                const binId = await getRecycleBinDay(req.userId);

                                await prisma.exercise.update({
                                    where: { id: ex.id },
                                    data: { routineDayId: binId }
                                });

                                // Check if NEW name exists in Archive to RESTORE instead of Create
                                const archivedEx = await prisma.exercise.findFirst({
                                    where: {
                                        routineDayId: binId,
                                        name: normalizedName
                                    }
                                });

                                if (archivedEx) {
                                    console.log(`Restoring archived exercise "${normalizedName}" (ID: ${archivedEx.id})`);
                                    await prisma.exercise.update({
                                        where: { id: archivedEx.id },
                                        data: {
                                            routineDayId: dayId,
                                            targetSets: parseInt(ex.targetSets),
                                            targetReps: ex.targetReps,
                                            restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                            note: ex.note,
                                            isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                            order: j
                                        }
                                    });
                                } else {
                                    // Make new if not found in archive
                                    await prisma.exercise.create({
                                        data: {
                                            routineDayId: dayId,
                                            name: normalizedName,
                                            targetSets: parseInt(ex.targetSets),
                                            targetReps: ex.targetReps,
                                            restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                            note: ex.note,
                                            isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                            order: j
                                        }
                                    });
                                }
                                continue; // Skip the standard update
                            }
                        }

                        // Update existing (No history or name didn't change)
                        await prisma.exercise.update({
                            where: { id: ex.id },
                            data: {
                                name: normalizedName,
                                targetSets: parseInt(ex.targetSets),
                                targetReps: ex.targetReps,
                                restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                note: ex.note,
                                isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                order: j
                            }
                        });

                    } else {
                        const binId = await getRecycleBinDay(req.userId);
                        console.log(`DEBUG: Checking archive for "${normalizedName}" in bin ${binId}`);
                        const archivedEx = await prisma.exercise.findFirst({
                            where: {
                                routineDayId: binId,
                                name: { equals: normalizedName, mode: 'insensitive' }
                            }
                        });
                        console.log(`DEBUG: Search result:`, archivedEx ? archivedEx.id : 'null');

                        if (archivedEx) {
                            console.log(`Restoring archived exercise "${normalizedName}" (ID: ${archivedEx.id})`);
                            await prisma.exercise.update({
                                where: { id: archivedEx.id },
                                data: {
                                    routineDayId: dayId,
                                    targetSets: parseInt(ex.targetSets || 3),
                                    targetReps: ex.targetReps || '8-12',
                                    restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                    note: ex.note,
                                    isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                    order: j
                                }
                            });
                        } else {
                            await prisma.exercise.create({
                                data: {
                                    routineDayId: dayId,
                                    name: normalizedName,
                                    targetSets: parseInt(ex.targetSets || 3),
                                    targetReps: ex.targetReps || '8-12',
                                    restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                    note: ex.note,
                                    isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                    order: j
                                }
                            });
                        }
                    }
                }
            }
        }

        const updatedRoutine = await prisma.routine.findUnique({
            where: { id: routineId },
            include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
        });

        res.json(updatedRoutine);
    } catch (error) {
        console.error('Error updating routine:', error);
        res.status(500).json({ error: 'Failed to update routine' });
    }
});

// ============================================
// ROUTES: Exercises
// ============================================

// GET /api/exercises - Get all exercises with muscle groups
app.get('/api/exercises', authMiddleware, async (req, res) => {
    try {
        const exercises = await prisma.exercise.findMany({
            where: {
                routineDay: {
                    routine: {
                        userId: req.userId
                    }
                }
            },
            select: {
                id: true,
                name: true,
                muscleGroup: true
            },
            distinct: ['name']
        });
        res.json(exercises);
    } catch (error) {
        console.error('Error fetching exercises:', error);
        res.status(500).json({ error: 'Failed to fetch exercises' });
    }
});

// PUT /api/exercises/:id/muscle - Update muscle group
app.put('/api/exercises/:id/muscle', authMiddleware, async (req, res) => {
    try {
        const { muscleGroup } = req.body;

        // Verify ownership
        const exercise = await prisma.exercise.findFirst({
            where: {
                id: req.params.id,
                routineDay: { routine: { userId: req.userId } }
            }
        });

        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found' });
        }

        await prisma.exercise.update({
            where: { id: req.params.id },
            data: { muscleGroup }
        });

        // Also update all exercises with the same name FOR THIS USER
        await prisma.exercise.updateMany({
            where: {
                name: exercise.name,
                routineDay: { routine: { userId: req.userId } }
            },
            data: { muscleGroup }
        });

        res.json({ message: 'Muscle group updated', exercise: { ...exercise, muscleGroup } });
    } catch (error) {
        console.error('Error updating muscle group:', error);
        res.status(500).json({ error: 'Failed to update muscle group' });
    }
});

// PUT /api/routines/:id/activate - Activate a routine
app.put('/api/routines/:id/activate', authMiddleware, async (req, res) => {
    try {
        const routineToActivate = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });

        if (!routineToActivate) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // Deactivate all routines FOR THIS USER first
        await prisma.routine.updateMany({
            where: { isActive: true, userId: req.userId },
            data: { isActive: false }
        });

        // Activate the selected routine
        const routine = await prisma.routine.update({
            where: { id: req.params.id },
            data: { isActive: true },
            include: {
                days: {
                    include: { exercises: { orderBy: { order: 'asc' } } },
                    orderBy: { order: 'asc' }
                }
            }
        });

        res.json({ message: 'Routine activated!', routine });
    } catch (error) {
        console.error('Error activating routine:', error);
        res.status(500).json({ error: 'Failed to activate routine' });
    }
});

// GET /api/stats/routine/:id - Get stats for a specific routine
app.get('/api/stats/routine/:id', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId },
            include: {
                days: {
                    include: {
                        exercises: {
                            include: {
                                workoutLogs: {
                                    include: { sets: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // Calculate stats for this routine
        let totalSessions = 0;
        let totalVolume = 0;
        let exerciseCount = 0;
        const exerciseProgress = {};

        routine.days.forEach(day => {
            day.exercises.forEach(exercise => {
                exerciseCount++;
                exercise.workoutLogs.forEach(log => {
                    totalSessions++;
                    log.sets.forEach(set => {
                        totalVolume += set.weight * set.reps;
                    });

                    // Track progress per exercise
                    if (!exerciseProgress[exercise.name]) {
                        exerciseProgress[exercise.name] = [];
                    }
                    const maxWeight = Math.max(...log.sets.map(s => s.weight));
                    exerciseProgress[exercise.name].push({
                        date: log.date,
                        maxWeight
                    });
                });
            });
        });

        res.json({
            routineId: routine.id,
            routineName: routine.name,
            totalSessions,
            totalVolume: Math.round(totalVolume),
            exerciseCount,
            exerciseProgress
        });
    } catch (error) {
        console.error('Error fetching routine stats:', error);
        res.status(500).json({ error: 'Failed to fetch routine stats' });
    }
});

// ============================================
// ROUTES: Workout Logging
// ============================================

// POST /api/workouts/log - Log a workout session
app.post('/api/workouts/log', authMiddleware, async (req, res) => {
    try {
        const { exerciseId, sets, notes } = req.body;

        if (!exerciseId || !sets || !Array.isArray(sets)) {
            return res.status(400).json({
                error: 'Required: exerciseId, sets[]'
            });
        }

        // Verify exercise belongs to user
        const exercise = await prisma.exercise.findFirst({
            where: {
                id: exerciseId,
                routineDay: { routine: { userId: req.userId } }
            }
        });

        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found or unauthorized' });
        }

        const workoutLog = await prisma.workoutLog.create({
            data: {
                exerciseId,
                notes: notes || null,
                sets: {
                    create: sets.map((set, index) => ({
                        setNumber: index + 1,
                        weight: set.weight,
                        reps: set.reps,
                        rpe: set.rpe || null,
                        weightRight: set.weightRight != null ? parseFloat(set.weightRight) : null,
                        repsRight: set.repsRight != null ? parseInt(set.repsRight) : null,
                        completed: set.completed !== false
                    }))
                }
            },
            include: {
                sets: true,
                exercise: true
            }
        });

        // Check and update PR
        if (exercise) {
            for (const set of sets) {
                // Calculate estimated 1RM using Epley formula (consistent with frontend)
                let estimated1RM = set.weight;
                if (set.reps > 1 && set.reps < 37) {
                    estimated1RM = set.weight * (1 + set.reps / 30);
                }

                // Check if this is a new PR FOR THIS USER
                const existingPR = await prisma.personalRecord.findFirst({
                    where: {
                        exerciseName: exercise.name.toLowerCase(),
                        userId: req.userId
                    },
                    orderBy: { estimated1RM: 'desc' }
                });

                if (!existingPR || estimated1RM > (existingPR.estimated1RM || 0)) {
                    await prisma.personalRecord.create({
                        data: {
                            userId: req.userId,
                            exerciseName: exercise.name.toLowerCase(),
                            weight: set.weight,
                            reps: set.reps,
                            estimated1RM
                        }
                    });
                }
            }
        }

        res.status(201).json({
            message: 'Workout logged successfully!',
            workoutLog
        });
    } catch (error) {
        console.error('Error logging workout:', error);
        res.status(500).json({ error: 'Failed to log workout' });
    }
});

// POST /api/workouts/log-rest - Log a rest day
app.post('/api/workouts/log-rest', authMiddleware, async (req, res) => {
    try {
        const { note } = req.body;
        const restLog = await prisma.restLog.create({
            data: {
                userId: req.userId,
                note: note || 'Día de descanso'
            }
        });
        res.status(201).json({ message: 'Rest logged!', restLog });
    } catch (error) {
        console.error('Error logging rest:', error);
        res.status(500).json({ error: 'Failed to log rest' });
    }
});

// GET /api/workouts/history - Get workout history with filters
app.get('/api/workouts/history', authMiddleware, async (req, res) => {
    try {
        const { exerciseId, limit = 30, search, dateFrom, dateTo, dayOfWeek, offset = 0 } = req.query;

        // Base filter: logs belonging to user's exercises
        const where = {
            exercise: {
                routineDay: {
                    routine: { userId: req.userId }
                }
            }
        };

        if (exerciseId) {
            where.exerciseId = exerciseId;
        }

        // Search by exercise name
        if (search) {
            where.exercise = {
                ...where.exercise,
                name: { contains: search, mode: 'insensitive' }
            };
        }

        // Date range filter
        if (dateFrom || dateTo) {
            where.date = {};
            if (dateFrom) where.date.gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                where.date.lte = end;
            }
        }

        const logs = await prisma.workoutLog.findMany({
            where,
            include: {
                sets: { orderBy: { setNumber: 'asc' } },
                exercise: true
            },
            orderBy: { date: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        // Filter by day of week on application side (Prisma doesn't support this natively)
        let filtered = logs;
        if (dayOfWeek !== undefined && dayOfWeek !== '') {
            const dow = parseInt(dayOfWeek);
            filtered = logs.filter(log => new Date(log.date).getDay() === dow);
        }

        res.json(filtered);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch workout history' });
    }
});

// PUT /api/workouts/fix-weights - Bulk fix weights for exercise logs
app.put('/api/workouts/fix-weights', authMiddleware, async (req, res) => {
    try {
        const { exerciseName, oldWeight, newWeight } = req.body;

        if (!exerciseName || oldWeight === undefined || newWeight === undefined) {
            return res.status(400).json({ error: 'exerciseName, oldWeight, newWeight required' });
        }

        // Find all sets matching the criteria for this user's exercises
        const matchingLogs = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { contains: exerciseName, mode: 'insensitive' },
                    routineDay: { routine: { userId: req.userId } }
                }
            },
            include: { sets: true, exercise: true }
        });

        let updatedCount = 0;
        for (const log of matchingLogs) {
            for (const set of log.sets) {
                if (Math.abs(set.weight - parseFloat(oldWeight)) < 0.1) {
                    await prisma.setLog.update({
                        where: { id: set.id },
                        data: { weight: parseFloat(newWeight) }
                    });
                    updatedCount++;
                }
            }
        }

        // Also fix personal records
        const prUpdated = await prisma.personalRecord.updateMany({
            where: {
                userId: req.userId,
                exerciseName: { contains: exerciseName, mode: 'insensitive' },
                weight: { gte: parseFloat(oldWeight) - 0.1, lte: parseFloat(oldWeight) + 0.1 }
            },
            data: { weight: parseFloat(newWeight) }
        });

        res.json({
            message: `Fixed ${updatedCount} sets and ${prUpdated.count} PRs`,
            setsUpdated: updatedCount,
            prsUpdated: prUpdated.count
        });
    } catch (error) {
        console.error('Error fixing weights:', error);
        res.status(500).json({ error: 'Failed to fix weights' });
    }
});

// GET /api/workouts/exercise/:exerciseId/history - Get history for specific exercise
// Search by exercise NAME to include history from all routines with the same exercise
app.get('/api/workouts/exercise/:exerciseId/history', authMiddleware, async (req, res) => {
    try {
        // First, get the exercise to find its name AND verify ownership
        const exercise = await prisma.exercise.findFirst({
            where: {
                id: req.params.exerciseId,
                routineDay: { routine: { userId: req.userId } }
            },
            select: { name: true }
        });

        if (!exercise) {
            return res.json([]);
        }

        // Find all workout logs for exercises with the same name (case-insensitive)
        const logs = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: {
                        equals: exercise.name,
                        mode: 'insensitive'
                    },
                    routineDay: {
                        routine: { userId: req.userId }
                    }
                }
            },
            include: {
                sets: { orderBy: { setNumber: 'asc' } }
            },
            orderBy: { date: 'desc' },
            take: 20
        });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching exercise history:', error);
        res.status(500).json({ error: 'Failed to fetch exercise history' });
    }
});

// GET /api/workouts/:logId - Fetch a single session by ID
app.get('/api/workouts/:logId', authMiddleware, async (req, res) => {
    try {
        const logId = req.params.logId;
        const log = await prisma.workoutLog.findFirst({
            where: {
                id: logId,
                exercise: { routineDay: { routine: { userId: req.userId } } }
            },
            include: {
                sets: { orderBy: { setNumber: 'asc' } },
                exercise: true
            }
        });

        if (!log) return res.status(404).json({ error: 'Session not found' });
        res.json(log);
    } catch (error) {
        console.error('Error fetching session:', error);
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

// PUT /api/workouts/:logId - Update a workout session
app.put('/api/workouts/:logId', authMiddleware, async (req, res) => {
    try {
        const logId = req.params.logId;
        const { sets } = req.body;

        if (!sets || !Array.isArray(sets)) {
            return res.status(400).json({ error: 'Sets array required' });
        }

        // Verify ownership via relation chain
        const existingLog = await prisma.workoutLog.findFirst({
            where: {
                id: logId,
                exercise: {
                    routineDay: {
                        routine: { userId: req.userId }
                    }
                }
            }
        });

        if (!existingLog) {
            return res.status(404).json({ error: 'Workout log not found or unauthorized' });
        }

        // Transaction: delete old sets and create new ones
        const updated = await prisma.$transaction(async (tx) => {
            // Delete existing sets
            await tx.setLog.deleteMany({ where: { workoutLogId: logId } });

            // Create new sets
            await tx.setLog.createMany({
                data: sets.map((set, i) => ({
                    workoutLogId: logId,
                    setNumber: i + 1,
                    weight: parseFloat(set.weight),
                    reps: parseInt(set.reps),
                    rpe: set.rpe ? parseFloat(set.rpe) : null,
                    weightRight: set.weightRight != null ? parseFloat(set.weightRight) : null,
                    repsRight: set.repsRight != null ? parseInt(set.repsRight) : null,
                    completed: true
                }))
            });

            return tx.workoutLog.findUnique({
                where: { id: logId },
                include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true }
            });
        });

        res.json({ message: 'Session updated!', workoutLog: updated });
    } catch (error) {
        console.error('Error updating workout:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// DELETE /api/workouts/:logId - Delete a workout session
app.delete('/api/workouts/:logId', authMiddleware, async (req, res) => {
    try {
        // Verify ownership
        const existingLog = await prisma.workoutLog.findFirst({
            where: {
                id: req.params.logId,
                exercise: {
                    routineDay: {
                        routine: { userId: req.userId }
                    }
                }
            }
        });

        if (!existingLog) {
            return res.status(404).json({ error: 'Workout log not found or unauthorized' });
        }

        await prisma.workoutLog.delete({ where: { id: req.params.logId } });
        res.json({ message: 'Session deleted!' });
    } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// ============================================
// ROUTES: Statistics & Progress
// ============================================

// GET /api/stats/overview - Get overall stats
app.get('/api/stats/overview', authMiddleware, async (req, res) => {
    try {
        const totalWorkouts = await prisma.workoutLog.count({
            where: { exercise: { routineDay: { routine: { userId: req.userId } } } }
        });
        const totalRoutines = await prisma.routine.count({
            where: { userId: req.userId }
        });
        const totalPRs = await prisma.personalRecord.count({
            where: { userId: req.userId }
        });

        // Get last 30 days workout count for streak calculation
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentWorkouts = await prisma.workoutLog.findMany({
            where: {
                date: { gte: thirtyDaysAgo },
                exercise: { routineDay: { routine: { userId: req.userId } } }
            },
            select: { date: true }
        });
        const recentRestLogs = await prisma.restLog.findMany({
            where: {
                date: { gte: thirtyDaysAgo },
                userId: req.userId
            },
            select: { date: true }
        });

        // Calculate unique training days
        const uniqueDays = new Set([
            ...recentWorkouts.map(w => w.date.toISOString().split('T')[0]),
            ...recentRestLogs.map(r => r.date.toISOString().split('T')[0])
        ]);

        // Get active routine to detect scheduled rest days
        const activeRoutine = await prisma.routine.findFirst({
            where: { userId: req.userId, isActive: true },
            include: { days: { orderBy: { order: 'asc' } } }
        });

        // Build a map of which day-of-week is a rest day in the routine
        const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const restDaySet = new Set();
        if (activeRoutine?.days) {
            activeRoutine.days.forEach(d => {
                if (d.isRestDay) {
                    const normalized = d.dayName.toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3);
                    DAY_NAMES.forEach((name, idx) => {
                        const norm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3);
                        if (norm === normalized) restDaySet.add(idx);
                    });
                }
            });
        }

        // Calculate current streak (up to 365 days)
        // Scheduled rest days count as streak continuity automatically
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];
            const dayOfWeek = checkDate.getDay();

            if (uniqueDays.has(dateStr)) {
                streak++;
            } else if (restDaySet.has(dayOfWeek)) {
                // Scheduled rest day - counts as streak continuation
                streak++;
            } else if (i > 0) {
                break;
            }
        }

        // Get volume this week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const weekSets = await prisma.setLog.findMany({
            where: {
                workoutLog: {
                    date: { gte: weekAgo },
                    exercise: { routineDay: { routine: { userId: req.userId } } }
                }
            }
        });

        const weeklyVolume = weekSets.reduce((acc, set) => {
            return acc + (set.weight * set.reps);
        }, 0);

        res.json({
            totalWorkouts,
            totalRoutines,
            totalPRs,
            currentStreak: streak,
            trainingDaysLast30: uniqueDays.size,
            weeklyVolume: Math.round(weeklyVolume)
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/stats/consistency - Get consistency data (calendar heatmap)
app.get('/api/stats/consistency', authMiddleware, async (req, res) => {
    try {
        const threeSixtyFiveDaysAgo = new Date();
        threeSixtyFiveDaysAgo.setDate(threeSixtyFiveDaysAgo.getDate() - 365);

        const workouts = await prisma.workoutLog.findMany({
            where: {
                date: { gte: threeSixtyFiveDaysAgo },
                exercise: { routineDay: { routine: { userId: req.userId } } }
            },
            select: { date: true }
        });
        const restLogs = await prisma.restLog.findMany({
            where: {
                date: { gte: threeSixtyFiveDaysAgo },
                userId: req.userId
            },
            select: { date: true }
        });

        // Get active routine to identify scheduled rest days
        const activeRoutine = await prisma.routine.findFirst({
            where: { userId: req.userId, isActive: true },
            include: { days: { orderBy: { order: 'asc' } } }
        });

        const DAY_NAMES_NORM = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
        const restDaySet = new Set();
        if (activeRoutine?.days) {
            activeRoutine.days.forEach(d => {
                if (d.isRestDay) {
                    const normalized = d.dayName.toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3);
                    DAY_NAMES_NORM.forEach((name, idx) => {
                        if (name === normalized) restDaySet.add(idx);
                    });
                }
            });
        }

        // Build events list including auto-rest days
        const allEvents = [
            ...workouts.map(w => w.date),
            ...restLogs.map(r => r.date)
        ];

        // Add auto-rest events for scheduled rest days (last 365 days)
        const loggedDates = new Set([
            ...workouts.map(w => w.date.toISOString().split('T')[0]),
            ...restLogs.map(r => r.date.toISOString().split('T')[0])
        ]);

        if (restDaySet.size > 0) {
            const today = new Date();
            for (let i = 0; i < 365; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(checkDate.getDate() - i);
                const dateStr = checkDate.toISOString().split('T')[0];
                if (!loggedDates.has(dateStr) && restDaySet.has(checkDate.getDay())) {
                    allEvents.push(checkDate);
                }
            }
        }

        res.json({ events: allEvents });
    } catch (error) {
        console.error('Error fetching consistency:', error);
        res.status(500).json({ error: 'Failed to fetch consistency data' });
    }
});

// GET /api/stats/progress/:exerciseName - Get progress for an exercise
app.get('/api/stats/progress/:exerciseName', authMiddleware, async (req, res) => {
    try {
        const exerciseName = decodeURIComponent(req.params.exerciseName);

        const logs = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { contains: exerciseName, mode: 'insensitive' },
                    routineDay: { routine: { userId: req.userId } }
                }
            },
            include: {
                sets: { orderBy: { setNumber: 'asc' } }
            },
            orderBy: { date: 'asc' },
            take: 50
        });

        // Calculate max weight and estimated 1RM per session
        const progressData = logs.map(log => {
            const maxSet = log.sets.reduce((max, set) => {
                // Epley formula with safety check
                let est1RM = set.weight;
                if (set.reps > 1 && set.reps < 37) {
                    est1RM = set.weight * (1 + set.reps / 30);
                }
                return est1RM > max.est1RM ? { ...set, est1RM } : max;
            }, { est1RM: 0 });

            return {
                date: log.date,
                maxWeight: Math.max(...log.sets.map(s => s.weight)),
                estimated1RM: Math.round(maxSet.est1RM * 10) / 10,
                totalVolume: log.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0)
            };
        });

        res.json(progressData);
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: 'Failed to fetch progress data' });
    }
});

// GET /api/stats/prs - Get all personal records
app.get('/api/stats/prs', authMiddleware, async (req, res) => {
    try {
        // Get best PR for each exercise FOR THIS USER
        const allPRs = await prisma.personalRecord.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' }
        });

        // Group by exercise and get the best one
        const prsByExercise = {};
        allPRs.forEach(pr => {
            if (!prsByExercise[pr.exerciseName] ||
                (pr.estimated1RM || 0) > (prsByExercise[pr.exerciseName].estimated1RM || 0)) {
                prsByExercise[pr.exerciseName] = pr;
            }
        });

        res.json(Object.values(prsByExercise).sort((a, b) => b.weight - a.weight));
    } catch (error) {
        console.error('Error fetching PRs:', error);
        res.status(500).json({ error: 'Failed to fetch PRs' });
    }
});
// ============================================
// ROUTES: Body Tracking (Peso & Fotos)
// ============================================

// GET /api/body/logs - Client-compatible route
app.get('/api/body/logs', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 90;

        const logs = await prisma.bodyLog.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' },
            take: Math.min(limit, 500)
        });

        // Map photoUrl to photo for frontend compatibility
        const mappedLogs = logs.map(log => ({
            ...log,
            photo: log.photoUrl || null
        }));

        res.json(mappedLogs);
    } catch (error) {
        console.error('Error fetching body logs:', error);
        res.status(500).json({ error: 'Failed to fetch body logs' });
    }
});

// POST /api/body/log - Client-compatible route (with Catbox upload)
app.post('/api/body/log', authMiddleware, async (req, res) => {
    try {
        const { weight, photo, note, bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein } = req.body;

        if (!weight && !photo) {
            return res.status(400).json({ error: 'Weight or photo required' });
        }

        // Upload photo to Catbox if it's base64
        let photoUrl = null;
        if (photo) {
            if (photo.startsWith('data:image') || photo.length > 500) {
                // It's base64 data, upload to Catbox
                try {
                    console.log('📸 Uploading photo to Catbox...');
                    photoUrl = await uploadBase64ToCatbox(photo, 'jpg');
                    console.log('✅ Photo uploaded:', photoUrl);
                } catch (uploadError) {
                    console.error('❌ Catbox upload failed:', uploadError.message);
                    // Continue without photo rather than failing entire request
                    photoUrl = null;
                }
            } else {
                // Already a URL
                photoUrl = photo;
            }
        }

        const bodyLog = await prisma.bodyLog.create({
            data: {
                userId: req.userId,
                weight: weight ? parseFloat(weight) : null,
                photoUrl,
                note: note || null,
                bmi: bmi ? parseFloat(bmi) : null,
                bodyFat: bodyFat ? parseFloat(bodyFat) : null,
                muscleMass: muscleMass ? parseFloat(muscleMass) : null,
                bmr: bmr ? parseFloat(bmr) : null,
                bodyWater: bodyWater ? parseFloat(bodyWater) : null,
                visceralFat: visceralFat ? parseFloat(visceralFat) : null,
                boneMass: boneMass ? parseFloat(boneMass) : null,
                protein: protein ? parseFloat(protein) : null
            }
        });

        res.status(201).json({
            message: 'Body log saved!',
            bodyLog: { ...bodyLog, photo: bodyLog.photoUrl }
        });
    } catch (error) {
        console.error('Error saving body log:', error);
        res.status(500).json({ error: 'Failed to save body log' });
    }
});

// GET /api/body - Get body logs history (legacy)
app.get('/api/body', authMiddleware, async (req, res) => {
    try {
        const { limit = 90, includePhotos = false } = req.query;

        const logs = await prisma.bodyLog.findMany({
            where: { userId: req.userId },
            select: {
                id: true,
                date: true,
                weight: true,
                photoUrl: includePhotos === 'true',
                note: true
            },
            orderBy: { date: 'desc' },
            take: parseInt(limit)
        });

        const mappedLogs = logs.map(log => ({
            id: log.id,
            date: log.date,
            weight: log.weight,
            photo: log.photoUrl || null,
            note: log.note
        }));

        res.json(mappedLogs);
    } catch (error) {
        console.error('Error fetching body logs:', error);
        res.status(500).json({ error: 'Failed to fetch body logs' });
    }
});

// GET /api/body/photos - Get only photo entries
app.get('/api/body/photos', authMiddleware, async (req, res) => {
    try {
        const photos = await prisma.bodyLog.findMany({
            where: {
                userId: req.userId,
                photoUrl: { not: null }
            },
            select: {
                id: true,
                date: true,
                photoUrl: true,
                note: true
            },
            orderBy: { date: 'desc' },
            take: 12 // Last 12 months
        });

        const mappedPhotos = photos.map(p => ({
            id: p.id,
            date: p.date,
            photo: p.photoUrl,
            note: p.note
        }));

        res.json(mappedPhotos);
    } catch (error) {
        console.error('Error fetching photos:', error);
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

// POST /api/body - Log weight and/or photo (with Catbox upload)
app.post('/api/body', authMiddleware, async (req, res) => {
    try {
        const { weight, photo, note } = req.body;

        if (!weight && !photo) {
            return res.status(400).json({ error: 'Weight or photo required' });
        }

        // Upload photo to Catbox if it's base64
        let photoUrl = null;
        if (photo) {
            if (photo.startsWith('data:image') || photo.length > 500) {
                try {
                    console.log('📸 Uploading photo to Catbox (legacy)...');
                    photoUrl = await uploadBase64ToCatbox(photo, 'jpg');
                    console.log('✅ Photo uploaded:', photoUrl);
                } catch (uploadError) {
                    console.error('❌ Catbox upload failed:', uploadError.message);
                    photoUrl = null;
                }
            } else {
                photoUrl = photo;
            }
        }

        const bodyLog = await prisma.bodyLog.create({
            data: {
                userId: req.userId,
                weight: weight ? parseFloat(weight) : null,
                photoUrl,
                note: note || null
            }
        });

        res.status(201).json({
            message: 'Body log saved!',
            bodyLog: { id: bodyLog.id, date: bodyLog.date, weight: bodyLog.weight, photo: bodyLog.photoUrl }
        });
    } catch (error) {
        console.error('Error saving body log:', error);
        res.status(500).json({ error: 'Failed to save body log' });
    }
});

// GET /api/body/latest - Get most recent weight
app.get('/api/body/latest', authMiddleware, async (req, res) => {
    try {
        const latest = await prisma.bodyLog.findFirst({
            where: {
                userId: req.userId,
                weight: { not: null }
            },
            orderBy: { date: 'desc' },
            select: { date: true, weight: true }
        });

        res.json(latest || { weight: null });
    } catch (error) {
        console.error('Error fetching latest weight:', error);
        res.status(500).json({ error: 'Failed to fetch latest weight' });
    }
});

// ============================================
// GOALS
// ============================================

// GET /api/goals - Get all goals
app.get('/api/goals', authMiddleware, async (req, res) => {
    try {
        const goals = await prisma.goal.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(goals);
    } catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ error: 'Failed to fetch goals' });
    }
});

// POST /api/goals - Create goal
app.post('/api/goals', authMiddleware, async (req, res) => {
    try {
        const {
            exerciseName,
            muscleGroup,
            targetWeight,
            targetReps,
            // Manual data for fallback predictions
            currentOneRepMax,
            currentEightRepMax,
            experienceLevel,
            frequencyPerWeek
        } = req.body;

        if (!exerciseName || !targetWeight || !targetReps) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const goal = await prisma.goal.create({
            data: {
                userId: req.userId,
                exerciseName,
                muscleGroup: muscleGroup || null,
                targetWeight: parseFloat(targetWeight),
                targetReps: parseInt(targetReps),
                currentOneRepMax: currentOneRepMax ? parseFloat(currentOneRepMax) : null,
                currentEightRepMax: currentEightRepMax ? parseFloat(currentEightRepMax) : null,
                experienceLevel: experienceLevel || null,
                frequencyPerWeek: frequencyPerWeek ? parseInt(frequencyPerWeek) : null
            }
        });
        res.status(201).json(goal);
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

// PUT /api/goals/:id/weeks - Toggle completed week
app.put('/api/goals/:id/weeks', authMiddleware, async (req, res) => {
    try {
        const { weekNumber, completed } = req.body; // completed: boolean
        const goal = await prisma.goal.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });

        if (!goal) return res.status(404).json({ error: 'Goal not found' });

        let newCompletedWeeks = goal.completedWeeks || [];
        if (completed) {
            if (!newCompletedWeeks.includes(weekNumber)) {
                newCompletedWeeks.push(weekNumber);
            }
        } else {
            newCompletedWeeks = newCompletedWeeks.filter(w => w !== weekNumber);
        }

        const updated = await prisma.goal.update({
            where: { id: req.params.id },
            data: { completedWeeks: newCompletedWeeks }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating goal weeks:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

// DELETE /api/goals/:id - Delete goal
app.delete('/api/goals/:id', authMiddleware, async (req, res) => {
    try {
        const goal = await prisma.goal.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!goal) return res.status(404).json({ error: 'Goal not found' });

        await prisma.goal.delete({ where: { id: req.params.id } });
        res.json({ message: 'Goal deleted' });
    } catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});

// ============================================
// AI-Powered Weight Suggestion
// ============================================

// POST /api/ai/suggest - Get AI suggestion for weight/reps based on exercise history
app.post('/api/ai/suggest', authMiddleware, async (req, res) => {
    try {
        const { exerciseId } = req.body;

        if (!exerciseId) {
            return res.status(400).json({ error: 'exerciseId required' });
        }

        // Get exercise info
        const exercise = await prisma.exercise.findFirst({
            where: {
                id: exerciseId,
                routineDay: { routine: { userId: req.userId } }
            }
        });

        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found' });
        }

        // Get last 10 sessions for this exercise (by name, cross-routine)
        const history = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { equals: exercise.name, mode: 'insensitive' },
                    routineDay: { routine: { userId: req.userId } }
                }
            },
            include: { sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { date: 'desc' },
            take: 10
        });

        if (history.length < 2) {
            return res.json({ suggestion: null, reason: 'Historial insuficiente (min. 2 sesiones)' });
        }

        // Format history for AI
        const historyText = history.map((log, i) => {
            const date = new Date(log.date).toLocaleDateString('es-ES');
            const setsText = log.sets.map(s => {
                const rir = s.rpe ? `RIR ${10 - s.rpe}` : 'sin RIR';
                return `${s.weight}kg x ${s.reps} reps (${rir})`;
            }).join(', ');
            return `Sesión ${i + 1} (${date}): ${setsText}`;
        }).join('\n');

        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY) {
            // Fallback: use math-based suggestion
            return res.json({ suggestion: null, reason: 'API key de OpenAI no configurada' });
        }

        const prompt = `Eres un entrenador de fuerza experto. Analiza el historial de "${exercise.name}" (meta: ${exercise.targetSets}x${exercise.targetReps}) y sugiere peso y repeticiones para la próxima sesión.

Historial (más reciente primero):
${historyText}

Reglas:
- Analiza tendencia de RIR, peso y repeticiones
- Si RIR promedio es alto (2-3), sugiere subir peso ligeramente
- Si RIR es bajo (0-1), mantener o bajar peso
- Incrementos máximos: 2.5kg para tren superior, 5kg para tren inferior
- Prioriza técnica y seguridad

Responde SOLO con JSON: {"weight": number, "reps": number, "reasoning": "explicación breve en español"}`;

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 200
            })
        });

        if (!aiResponse.ok) {
            console.error('OpenAI API error:', aiResponse.status);
            return res.json({ suggestion: null, reason: 'Error de API de IA' });
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '';

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const suggestion = JSON.parse(jsonMatch[0]);
            return res.json({ suggestion });
        }

        res.json({ suggestion: null, reason: 'No se pudo parsear respuesta de IA' });
    } catch (error) {
        console.error('Error getting AI suggestion:', error);
        res.status(500).json({ error: 'Failed to get AI suggestion' });
    }
});

// ============================================
// Health Check
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// SPA Fallback - Must be LAST route
// ============================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});


// Start server with DB connection test
async function startServer() {
    try {
        // Test database connection before starting
        console.log('🔄 Testing database connection...');
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        app.listen(PORT, () => {
            console.log(`🏋️ NexLift API running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        console.error('📋 Check DATABASE_URL environment variable');
        process.exit(1);
    }
}

startServer();
