import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { uploadBase64ToCatbox } from '../shared/utils/catbox.js';

// Singleton pattern for Prisma in serverless
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const JWT_SECRET = process.env.JWT_SECRET || 'nexlift-secret-key-change-in-production';

function getUserId(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.userId;
    } catch {
        return null;
    }
}

/**
 * Normaliza nombre de ejercicio para consistencia en PRs
 * - Quita prefijos de numeración (a1., b.2, etc.)
 * - Convierte a minúsculas
 * - Limpia espacios extras
 */
function normalizeExerciseName(name) {
    if (!name) return '';
    return name
        .replace(/^[a-z]\.?\d+\.?\s*/i, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url, method, body } = req;

    // Parse URL properly to separate pathname from query string
    const parsedUrl = new URL(url, `http://${req.headers.host}`);
    const path = parsedUrl.pathname.replace('/api', '');
    const searchParams = parsedUrl.searchParams;

    try {
        // ==========================================
        // AUTH ROUTES
        // ==========================================

        // POST /api/auth/register
        if (path === '/auth/register' && method === 'POST') {
            const { username, email, password, firstName, lastName, phone, birthDate, securityQuestion, securityAnswer } = body;
            if (!username || !email || !password || !firstName || !lastName) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const existing = await prisma.user.findFirst({
                where: { OR: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] }
            });

            if (existing) {
                return res.status(409).json({ error: existing.username === username.toLowerCase() ? 'Username exists' : 'Email exists' });
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
                select: { id: true, username: true, email: true, firstName: true, lastName: true, createdAt: true }
            });

            const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '365d' });
            return res.status(201).json({ user, token });
        }

        // POST /api/auth/login
        if (path === '/auth/login' && method === 'POST') {
            const { username, password } = body;
            if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

            const user = await prisma.user.findFirst({
                where: { OR: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] }
            });

            if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });

            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

            await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

            const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '365d' });
            return res.json({
                user: { id: user.id, username: user.username, email: user.email, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl },
                token
            });
        }

        // GET /api/auth/me
        if (path === '/auth/me' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true, username: true, email: true, firstName: true, lastName: true,
                    phone: true, birthDate: true, avatarUrl: true, securityQuestion: true,
                    createdAt: true, lastLogin: true,
                    _count: { select: { routines: true, bodyLogs: true, personalRecords: true } }
                }
            });
            if (!user) return res.status(404).json({ error: 'User not found' });
            return res.json(user);
        }

        // PUT /api/auth/profile
        if (path === '/auth/profile' && method === 'PUT') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { firstName, lastName, phone, birthDate } = body;
            const user = await prisma.user.update({
                where: { id: userId },
                data: {
                    firstName: firstName || undefined,
                    lastName: lastName || undefined,
                    phone: phone || undefined,
                    birthDate: birthDate ? new Date(birthDate) : undefined
                },
                select: { id: true, username: true, email: true, firstName: true, lastName: true, phone: true, birthDate: true, avatarUrl: true }
            });
            return res.json(user);
        }

        // PUT /api/auth/password
        if (path === '/auth/password' && method === 'PUT') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { currentPassword, newPassword } = body;
            const user = await prisma.user.findUnique({ where: { id: userId } });

            const valid = await bcrypt.compare(currentPassword, user.passwordHash);
            if (!valid) return res.status(401).json({ error: 'Incorrect password' });

            const passwordHash = await bcrypt.hash(newPassword, 10);
            await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
            return res.json({ message: 'Password updated' });
        }

        // POST /api/auth/recover/question
        if (path === '/auth/recover/question' && method === 'POST') {
            const { username } = body;
            const user = await prisma.user.findFirst({
                where: { OR: [{ username: username?.toLowerCase() }, { email: username?.toLowerCase() }] },
                select: { securityQuestion: true }
            });
            if (!user || !user.securityQuestion) return res.status(404).json({ error: 'Not found or no question' });
            return res.json({ question: user.securityQuestion });
        }

        // POST /api/auth/recover/verify
        if (path === '/auth/recover/verify' && method === 'POST') {
            const { username, answer, newPassword } = body;
            const user = await prisma.user.findFirst({
                where: { OR: [{ username: username?.toLowerCase() }, { email: username?.toLowerCase() }] }
            });
            if (!user || !user.securityAnswerHash) return res.status(404).json({ error: 'User not found' });

            const valid = await bcrypt.compare(answer.toLowerCase().trim(), user.securityAnswerHash);
            if (!valid) return res.status(401).json({ error: 'Incorrect answer' });

            const passwordHash = await bcrypt.hash(newPassword, 10);
            await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
            return res.json({ message: 'Password reset successful' });
        }

        // PUT /api/auth/security-question
        if (path === '/auth/security-question' && method === 'PUT') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { question, answer } = body;
            const securityAnswerHash = await bcrypt.hash(answer.toLowerCase().trim(), 10);
            await prisma.user.update({
                where: { id: userId },
                data: { securityQuestion: question, securityAnswerHash }
            });
            return res.json({ message: 'Security question updated' });
        }

        // ==========================================
        // ROUTINES
        // ==========================================

        // POST /api/routines/import
        if (path === '/routines/import' && method === 'POST') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { name, description, days } = body;
            if (!name || !days || !Array.isArray(days)) {
                return res.status(400).json({ error: 'Invalid JSON structure' });
            }

            const routine = await prisma.routine.create({
                data: {
                    userId,
                    name,
                    description: description || null,
                    days: {
                        create: days.map((day, dayIndex) => ({
                            dayName: day.dayName,
                            isRestDay: day.isRestDay || false,
                            order: dayIndex,
                            exercises: {
                                create: (day.exercises || []).map((ex, exIndex) => ({
                                    name: normalizeExerciseName(ex.name),
                                    targetSets: ex.sets || 3,
                                    targetReps: ex.reps || '8-12',
                                    restSeconds: ex.rest || null,
                                    note: ex.note || null,
                                    order: ex.order !== undefined ? ex.order : exIndex
                                }))
                            }
                        }))
                    }
                },
                include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
            });
            return res.status(201).json({ message: 'Routine imported!', routine });
        }

        // GET /api/routines/active
        if (path === '/routines/active' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const routine = await prisma.routine.findFirst({
                where: { isActive: true, userId },
                include: {
                    days: {
                        include: {
                            exercises: {
                                include: {
                                    workoutLogs: { include: { sets: true }, orderBy: { date: 'desc' }, take: 1 }
                                },
                                orderBy: { order: 'asc' }
                            }
                        },
                        orderBy: { order: 'asc' }
                    }
                }
            });
            return res.json(routine);
        }

        // GET /api/routines
        if (path === '/routines' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const routines = await prisma.routine.findMany({
                where: { userId },
                include: {
                    days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } }
                },
                orderBy: { createdAt: 'desc' }
            });
            return res.json(routines);
        }

        // GET /api/routines/:id
        const routineMatch = path.match(/^\/routines\/([^/]+)$/);
        if (routineMatch && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const routine = await prisma.routine.findFirst({
                where: { id: routineMatch[1], userId },
                include: {
                    days: {
                        include: {
                            exercises: {
                                include: {
                                    workoutLogs: { include: { sets: true }, orderBy: { date: 'desc' }, take: 5 }
                                },
                                orderBy: { order: 'asc' }
                            }
                        },
                        orderBy: { order: 'asc' }
                    }
                }
            });
            if (!routine) return res.status(404).json({ error: 'Not found' });
            return res.json(routine);
        }

        // PUT /api/routines/:id/activate
        const activateMatch = path.match(/^\/routines\/([^/]+)\/activate$/);
        if (activateMatch && method === 'PUT') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const routineToActivate = await prisma.routine.findFirst({
                where: { id: activateMatch[1], userId }
            });
            if (!routineToActivate) return res.status(404).json({ error: 'Routine not found' });

            await prisma.routine.updateMany({ where: { isActive: true, userId }, data: { isActive: false } });

            const routine = await prisma.routine.update({
                where: { id: activateMatch[1] },
                data: { isActive: true },
                include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
            });
            return res.json({ message: 'Activated!', routine });
        }

        // PUT /api/routines/:id - Update routine structure
        const updateMatch = path.match(/^\/routines\/([^/]+)$/);
        if (updateMatch && method === 'PUT') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const routineId = updateMatch[1];

            const owned = await prisma.routine.findFirst({ where: { id: routineId, userId } });
            if (!owned) return res.status(404).json({ error: 'Routine not found' });

            const { name, description, days } = body;

            // Transacción para evitar corrupción de datos
            const updatedRoutine = await prisma.$transaction(async (tx) => {
                // 1. Update basic info
                await tx.routine.update({
                    where: { id: routineId },
                    data: { name, description }
                });

                // 2. Handle Days (Delete removed ones)
                const existingDays = await tx.routineDay.findMany({
                    where: { routineId },
                    select: { id: true }
                });
                const incomingDayIds = days.filter(d => d.id).map(d => d.id);
                const daysToDelete = existingDays.filter(d => !incomingDayIds.includes(d.id)).map(d => d.id);

                if (daysToDelete.length > 0) {
                    await tx.routineDay.deleteMany({ where: { id: { in: daysToDelete } } });
                }

                // 3. Upsert Days and Exercises
                for (let i = 0; i < days.length; i++) {
                    const day = days[i];
                    let dayId = day.id;

                    if (dayId) {
                        await tx.routineDay.update({
                            where: { id: dayId },
                            data: {
                                dayName: day.dayName,
                                isRestDay: day.isRestDay || false,
                                order: i
                            }
                        });
                    } else {
                        const newDay = await tx.routineDay.create({
                            data: {
                                routineId,
                                dayName: day.dayName,
                                isRestDay: day.isRestDay || false,
                                order: i
                            }
                        });
                        dayId = newDay.id;
                    }

                    // Handle Exercises for this Day
                    if (day.exercises && Array.isArray(day.exercises)) {
                        const existingExercises = await tx.exercise.findMany({
                            where: { routineDayId: dayId },
                            select: { id: true }
                        });
                        const incomingExIds = day.exercises.filter(e => e.id).map(e => e.id);
                        const exToDelete = existingExercises.filter(e => !incomingExIds.includes(e.id)).map(e => e.id);

                        if (exToDelete.length > 0) {
                            await tx.exercise.deleteMany({ where: { id: { in: exToDelete } } });
                        }

                        for (let j = 0; j < day.exercises.length; j++) {
                            const ex = day.exercises[j];
                            const exData = {
                                name: normalizeExerciseName(ex.name),
                                targetSets: parseInt(ex.targetSets || 3),
                                targetReps: String(ex.targetReps || '8-12'),
                                restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                note: ex.note || null,
                                order: j,
                                routineDayId: dayId // Needed for create
                            };

                            if (ex.id) {
                                // Fetch current name for smart renaming
                                const currentExercise = await tx.exercise.findUnique({
                                    where: { id: ex.id },
                                    select: { name: true }
                                });

                                // Remove routineDayId for update as it doesn't change
                                const { routineDayId, ...updateData } = exData;
                                await tx.exercise.update({
                                    where: { id: ex.id },
                                    data: updateData
                                });

                                // SMART PR RENAMING:
                                if (currentExercise && normalizeExerciseName(currentExercise.name) !== normalizeExerciseName(ex.name)) {
                                    console.log(`Renaming PRs (Vercel): "${currentExercise.name}" -> "${normalizeExerciseName(ex.name)}"`);
                                    await tx.personalRecord.updateMany({
                                        where: {
                                            userId, // Only user's PRs
                                            exerciseName: {
                                                equals: currentExercise.name,
                                                mode: 'insensitive'
                                            }
                                        },
                                        data: { exerciseName: normalizeExerciseName(ex.name) }
                                    });
                                }
                            } else {
                                await tx.exercise.create({
                                    data: exData
                                });
                            }
                        }
                    }
                }

                // Return fresh data
                return tx.routine.findUnique({
                    where: { id: routineId },
                    include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
                });
            });

            return res.json(updatedRoutine);
        }

        // DELETE /api/routines/:id
        if (routineMatch && method === 'DELETE') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const owned = await prisma.routine.findFirst({ where: { id: routineMatch[1], userId } });
            if (!owned) return res.status(404).json({ error: 'Routine not found' });

            await prisma.routine.delete({ where: { id: routineMatch[1] } });
            return res.json({ message: 'Deleted' });
        }

        // ==========================================
        // EXERCISES
        // ==========================================

        // GET /api/exercises
        if (path === '/exercises' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const exercises = await prisma.exercise.findMany({
                where: {
                    routineDay: { routine: { userId } }
                },
                select: { id: true, name: true, muscleGroup: true },
                distinct: ['name'],
                orderBy: { name: 'asc' }
            });
            return res.json(exercises);
        }

        // PUT /api/exercises/:id/muscle
        const exMuscleMatch = path.match(/^\/exercises\/([^/]+)\/muscle$/);
        if (exMuscleMatch && method === 'PUT') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { muscleGroup } = body;

            // Verify ownership
            const exercise = await prisma.exercise.findFirst({
                where: {
                    id: exMuscleMatch[1],
                    routineDay: { routine: { userId } }
                }
            });

            if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

            await prisma.exercise.update({
                where: { id: exMuscleMatch[1] },
                data: { muscleGroup }
            });

            await prisma.exercise.updateMany({
                where: {
                    name: exercise.name,
                    routineDay: { routine: { userId } }
                },
                data: { muscleGroup }
            });
            return res.json({ message: 'Updated', exercise: { ...exercise, muscleGroup } });
        }

        // ==========================================
        // WORKOUTS
        // ==========================================

        // POST /api/workouts/log
        if (path === '/workouts/log' && method === 'POST') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { exerciseId, sets, notes } = body;
            if (!exerciseId || !sets) {
                return res.status(400).json({ error: 'Missing data' });
            }

            // Verify exercise belongs to user
            const exercise = await prisma.exercise.findFirst({
                where: {
                    id: exerciseId,
                    routineDay: { routine: { userId } }
                }
            });

            if (!exercise) return res.status(404).json({ error: 'Exercise not found or unauthorized' });

            const workoutLog = await prisma.workoutLog.create({
                data: {
                    exerciseId,
                    notes: notes || null,
                    sets: {
                        create: sets.map((set, i) => ({
                            setNumber: i + 1,
                            weight: parseFloat(set.weight),
                            reps: parseInt(set.reps),
                            rpe: set.rpe ? parseFloat(set.rpe) : null,
                            completed: true
                        }))
                    }
                },
                include: { sets: true, exercise: true }
            });

            // Update PR with safety check
            if (exercise) {
                for (const set of sets) {
                    const weight = parseFloat(set.weight);
                    const reps = parseInt(set.reps);

                    // Safety: Avoid edge cases with Epley formula
                    let est1RM = weight;
                    if (reps > 1 && reps < 37) {
                        est1RM = weight * (1 + reps / 30); // Epley formula
                    }

                    const existingPR = await prisma.personalRecord.findFirst({
                        where: {
                            exerciseName: exercise.name.toLowerCase(),
                            userId
                        },
                        orderBy: { estimated1RM: 'desc' }
                    });

                    if (!existingPR || est1RM > (existingPR.estimated1RM || 0)) {
                        await prisma.personalRecord.create({
                            data: {
                                userId,
                                exerciseName: exercise.name.toLowerCase(),
                                weight: weight,
                                reps: reps,
                                estimated1RM: est1RM
                            }
                        });
                    }
                }
            }

            return res.status(201).json({ message: 'Logged!', workoutLog });
        }

        // POST /api/workouts/log-rest
        if (path === '/workouts/log-rest' && method === 'POST') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { note } = body;
            const restLog = await prisma.restLog.create({
                data: { userId, note: note || 'Día de descanso' }
            });
            return res.status(201).json({ message: 'Rest logged!', restLog });
        }

        // GET /api/workouts/history
        if (path === '/workouts/history' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const limit = parseInt(searchParams.get('limit')) || 30;

            const logs = await prisma.workoutLog.findMany({
                where: {
                    exercise: {
                        routineDay: { routine: { userId } }
                    }
                },
                include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true },
                orderBy: { date: 'desc' },
                take: Math.min(limit, 1000)
            });
            return res.json(logs);
        }

        // PUT /api/workouts/:logId - Update a workout session
        const workoutUpdateMatch = path.match(/^\/workouts\/([^/]+)$/);
        if (workoutUpdateMatch && method === 'PUT') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const logId = workoutUpdateMatch[1];
            const { sets } = body;

            if (!sets || !Array.isArray(sets)) {
                return res.status(400).json({ error: 'Sets array required' });
            }

            // Verify ownership
            const existingLog = await prisma.workoutLog.findFirst({
                where: {
                    id: logId,
                    exercise: { routineDay: { routine: { userId } } }
                }
            });

            if (!existingLog) return res.status(404).json({ error: 'Log not found' });

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
                        completed: true
                    }))
                });

                return tx.workoutLog.findUnique({
                    where: { id: logId },
                    include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true }
                });
            });

            return res.json({ message: 'Session updated!', workoutLog: updated });
        }

        // DELETE /api/workouts/:logId - Delete a workout session
        const workoutDeleteMatch = path.match(/^\/workouts\/([^/]+)$/);
        if (workoutDeleteMatch && method === 'DELETE') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const logId = workoutDeleteMatch[1];

            // Verify ownership
            const existingLog = await prisma.workoutLog.findFirst({
                where: {
                    id: logId,
                    exercise: { routineDay: { routine: { userId } } }
                }
            });

            if (!existingLog) return res.status(404).json({ error: 'Log not found' });

            await prisma.workoutLog.delete({ where: { id: logId } });

            return res.json({ message: 'Session deleted!' });
        }

        // GET /api/workouts/exercise/:id/history
        // Search by exercise NAME to include history from all routines with the same exercise
        const exHistoryMatch = path.match(/^\/workouts\/exercise\/([^/]+)\/history$/);
        if (exHistoryMatch && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            // First, get the exercise to find its name AND verify ownership
            const exercise = await prisma.exercise.findFirst({
                where: {
                    id: exHistoryMatch[1],
                    routineDay: { routine: { userId } }
                },
                select: { name: true }
            });

            if (!exercise) {
                return res.json([]);
            }

            // Find all workout logs for exercises with the same name (case-insensitive) AND belonging to user
            const logs = await prisma.workoutLog.findMany({
                where: {
                    exercise: {
                        name: {
                            equals: exercise.name,
                            mode: 'insensitive'
                        },
                        routineDay: { routine: { userId } }
                    }
                },
                include: { sets: { orderBy: { setNumber: 'asc' } } },
                orderBy: { date: 'desc' },
                take: 20
            });
            return res.json(logs);
        }

        // ==========================================
        // BODY TRACKING
        // ==========================================

        // ==========================================
        // BODY TRACKING
        // ==========================================

        // GET /api/body/logs
        if (path === '/body/logs' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const limit = parseInt(searchParams.get('limit')) || 30;

            const logs = await prisma.bodyLog.findMany({
                where: { userId },
                orderBy: { date: 'desc' },
                take: Math.min(limit, 500)
            });

            // Map photoUrl to photo for frontend compatibility
            const mappedLogs = logs.map(log => ({
                ...log,
                photo: log.photoUrl || null
            }));

            return res.json(mappedLogs);
        }

        // POST /api/body/log (with Catbox upload)
        if (path === '/body/log' && method === 'POST') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const {
                weight, photo, note,
                bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein
            } = body;

            // At least weight, photo, or any body composition data required
            const hasBodyData = weight || photo || bmi || bodyFat || muscleMass;
            if (!hasBodyData) {
                return res.status(400).json({ error: 'Weight, photo, or body composition data required' });
            }

            // Upload photo to Catbox if it's base64
            let photoUrl = null;
            if (photo) {
                if (photo.startsWith('data:image') || photo.length > 500) {
                    try {
                        console.log('📸 [Vercel] Uploading photo to Catbox...');
                        photoUrl = await uploadBase64ToCatbox(photo, 'jpg');
                        console.log('✅ [Vercel] Photo uploaded:', photoUrl);
                    } catch (uploadError) {
                        console.error('❌ [Vercel] Catbox upload failed:', uploadError.message);
                        photoUrl = null;
                    }
                } else {
                    photoUrl = photo;
                }
            }

            const bodyLog = await prisma.bodyLog.create({
                data: {
                    userId,
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
            return res.json({ message: 'Body log saved!', bodyLog: { ...bodyLog, photo: bodyLog.photoUrl } });
        }

        // GET /api/body (Legacy/History)
        if (path === '/body' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const limit = parseInt(searchParams.get('limit')) || 90;
            const includePhotos = searchParams.get('includePhotos') === 'true';

            const logs = await prisma.bodyLog.findMany({
                where: { userId },
                select: {
                    id: true,
                    date: true,
                    weight: true,
                    photoUrl: includePhotos,
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

            return res.json(mappedLogs);
        }

        // GET /api/body/photos
        if (path === '/body/photos' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const photos = await prisma.bodyLog.findMany({
                where: {
                    userId,
                    photoUrl: { not: null }
                },
                select: {
                    id: true,
                    date: true,
                    photoUrl: true,
                    note: true
                },
                orderBy: { date: 'desc' },
                take: 12
            });

            const mappedPhotos = photos.map(p => ({
                id: p.id,
                date: p.date,
                photo: p.photoUrl,
                note: p.note
            }));

            return res.json(mappedPhotos);
        }

        // POST /api/body (Legacy with Catbox upload)
        if (path === '/body' && method === 'POST') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const { weight, photo, note } = body;

            if (!weight && !photo) {
                return res.status(400).json({ error: 'Weight or photo required' });
            }

            // Upload photo to Catbox if it's base64
            let photoUrl = null;
            if (photo) {
                if (photo.startsWith('data:image') || photo.length > 500) {
                    try {
                        console.log('📸 [Vercel Legacy] Uploading photo to Catbox...');
                        photoUrl = await uploadBase64ToCatbox(photo, 'jpg');
                        console.log('✅ [Vercel Legacy] Photo uploaded:', photoUrl);
                    } catch (uploadError) {
                        console.error('❌ [Vercel Legacy] Catbox upload failed:', uploadError.message);
                        photoUrl = null;
                    }
                } else {
                    photoUrl = photo;
                }
            }

            const bodyLog = await prisma.bodyLog.create({
                data: {
                    userId,
                    weight: weight ? parseFloat(weight) : null,
                    photoUrl,
                    note: note || null
                }
            });

            return res.json({
                message: 'Body log saved!',
                bodyLog: { id: bodyLog.id, date: bodyLog.date, weight: bodyLog.weight, photo: bodyLog.photoUrl }
            });
        }

        // GET /api/body/latest
        if (path === '/body/latest' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const latest = await prisma.bodyLog.findFirst({
                where: {
                    userId,
                    weight: { not: null }
                },
                orderBy: { date: 'desc' },
                select: { date: true, weight: true }
            });
            return res.json(latest || { weight: null });
        }

        // ==========================================
        // STATS
        // ==========================================

        // GET /api/stats/overview
        if (path === '/stats/overview' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const totalWorkouts = await prisma.workoutLog.count({
                where: { exercise: { routineDay: { routine: { userId } } } }
            });
            const totalRoutines = await prisma.routine.count({
                where: { userId }
            });
            const totalPRs = await prisma.personalRecord.count({
                where: { userId }
            });

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentWorkouts = await prisma.workoutLog.findMany({
                where: {
                    date: { gte: thirtyDaysAgo },
                    exercise: { routineDay: { routine: { userId } } }
                },
                select: { date: true }
            });
            const recentRestLogs = await prisma.restLog.findMany({
                where: {
                    date: { gte: thirtyDaysAgo },
                    userId
                },
                select: { date: true }
            });

            const uniqueDays = new Set([
                ...recentWorkouts.map(w => w.date.toISOString().split('T')[0]),
                ...recentRestLogs.map(r => r.date.toISOString().split('T')[0])
            ]);

            // Calculate streak (up to 365 days)
            let streak = 0;
            const today = new Date();
            for (let i = 0; i < 365; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(checkDate.getDate() - i);
                const dateStr = checkDate.toISOString().split('T')[0];
                if (uniqueDays.has(dateStr)) streak++;
                else if (i > 0) break;
            }

            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekSets = await prisma.setLog.findMany({
                where: {
                    workoutLog: {
                        date: { gte: weekAgo },
                        exercise: { routineDay: { routine: { userId } } }
                    }
                },
                select: { weight: true, reps: true }
            });
            const weeklyVolume = weekSets.reduce((acc, s) => acc + (s.weight * s.reps), 0);

            return res.json({
                totalWorkouts, totalRoutines, totalPRs,
                currentStreak: streak,
                trainingDaysLast30: uniqueDays.size,
                weeklyVolume: Math.round(weeklyVolume)
            });
        }

        // GET /api/stats/consistency
        if (path === '/stats/consistency' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const workouts = await prisma.workoutLog.findMany({
                where: {
                    date: { gte: ninetyDaysAgo },
                    exercise: { routineDay: { routine: { userId } } }
                },
                select: { date: true }
            });
            const restLogs = await prisma.restLog.findMany({
                where: {
                    date: { gte: ninetyDaysAgo },
                    userId
                },
                select: { date: true }
            });

            // Return raw timestamps for frontend processing (Timezone fix)
            const allEvents = [
                ...workouts.map(w => w.date),
                ...restLogs.map(r => r.date)
            ];

            return res.json({ events: allEvents });
        }

        // GET /api/stats/prs
        if (path === '/stats/prs' && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const allPRs = await prisma.personalRecord.findMany({
                where: { userId },
                orderBy: { date: 'desc' }
            });
            const byEx = {};
            allPRs.forEach(pr => {
                if (!byEx[pr.exerciseName] || (pr.estimated1RM || 0) > (byEx[pr.exerciseName].estimated1RM || 0)) {
                    byEx[pr.exerciseName] = pr;
                }
            });
            // Ordenar por peso absoluto (mayor primero)
            const sortedPRs = Object.values(byEx).sort((a, b) => b.weight - a.weight);
            return res.json(sortedPRs);
        }

        // GET /api/stats/progress/:name
        const progressMatch = path.match(/^\/stats\/progress\/(.+)$/);
        if (progressMatch && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const name = decodeURIComponent(progressMatch[1]);
            const logs = await prisma.workoutLog.findMany({
                where: {
                    exercise: {
                        name: { contains: name, mode: 'insensitive' },
                        routineDay: { routine: { userId } }
                    }
                },
                include: { sets: { orderBy: { setNumber: 'asc' } } },
                orderBy: { date: 'asc' },
                take: 50
            });

            const data = logs.map(log => {
                const maxSet = log.sets.reduce((max, s) => {
                    // Epley formula with safety check
                    let e = s.weight;
                    if (s.reps > 1 && s.reps < 37) {
                        e = s.weight * (1 + s.reps / 30);
                    }
                    return e > max.e ? { ...s, e } : max;
                }, { e: 0 });
                return {
                    date: log.date,
                    maxWeight: Math.max(...log.sets.map(s => s.weight)),
                    estimated1RM: Math.round(maxSet.e * 10) / 10,
                    totalVolume: log.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
                };
            });
            return res.json(data);
        }

        // GET /api/stats/routine/:id
        const routineStatsMatch = path.match(/^\/stats\/routine\/([^/]+)$/);
        if (routineStatsMatch && method === 'GET') {
            const userId = getUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const routine = await prisma.routine.findFirst({
                where: { id: routineStatsMatch[1], userId },
                include: {
                    days: {
                        include: {
                            exercises: { include: { workoutLogs: { include: { sets: true } } } }
                        }
                    }
                }
            });
            if (!routine) return res.status(404).json({ error: 'Not found' });

            let totalSessions = 0, totalVolume = 0, exerciseCount = 0;
            routine.days.forEach(d => {
                d.exercises.forEach(e => {
                    exerciseCount++;
                    e.workoutLogs.forEach(l => {
                        totalSessions++;
                        l.sets.forEach(s => totalVolume += s.weight * s.reps);
                    });
                });
            });

            return res.json({ routineId: routine.id, routineName: routine.name, totalSessions, totalVolume: Math.round(totalVolume), exerciseCount });
        }

        // GET /api/health
        if (path === '/health' && method === 'GET') {
            return res.json({ status: 'ok', timestamp: new Date().toISOString() });
        }

        // 404
        return res.status(404).json({ error: 'Not found', path });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}