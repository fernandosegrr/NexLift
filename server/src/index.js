import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { v2 as cloudinary } from 'cloudinary';
import { isSameExercise, groupHistoryByExercise, bestOneRepMaxForTarget, epley1RM } from './utils/exerciseName.js';
import { deduplicateExercises } from './services/exerciseAgent.js';

dotenv.config();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'nexlift-secret-key-change-in-production';

// Seguridad: en producción NUNCA arrancar con el secreto por defecto. Si JWT_SECRET
// no está definida, cualquiera podría falsificar tokens de cualquier usuario.
// Define JWT_SECRET en las variables de entorno (EasyPanel) antes de desplegar.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET no está definida en producción. Configúrala en las variables de entorno antes de iniciar.');
    process.exit(1);
}

// Catbox upload function (inline to avoid external dependencies)
const CATBOX_API = 'https://catbox.moe/user/api.php';

// Cloudinary: CDN de imágenes con SLA real, a diferencia de Catbox (host gratuito
// anónimo sin garantías). Opcional — si no está configurado, todo sigue cayendo a
// Catbox como antes. Activar con CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET (ver
// server/.env.example).
const CLOUDINARY_CONFIGURED = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (CLOUDINARY_CONFIGURED) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

// Sniff de los primeros bytes: antes se forzaba Content-Type: image/jpeg sin
// comprobar que los bytes decodificados fueran realmente una imagen, así que
// cualquier binario podía subirse disfrazado de foto.
function looksLikeImage(buffer) {
    if (buffer.length < 12) return false;
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true; // JPEG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true; // PNG
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true; // GIF
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return true; // WebP
    return false;
}

async function uploadToCloudinary(base64Data) {
    try {
        const result = await cloudinary.uploader.upload(base64Data, {
            folder: 'nexlift',
            resource_type: 'image'
        });
        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error.message);
        return null;
    }
}

async function uploadBase64ToCatbox(base64Data, extension = 'jpg') {
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    if (!looksLikeImage(buffer)) {
        console.error('Catbox upload rejected: contenido no parece una imagen válida');
        return null;
    }
    const filename = `nexlift_${Date.now()}.${extension}`;

    // Create form data manually for fetch
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    // Catbox es gratuito, anónimo y sin SLA — un fallo aislado (blip de red,
    // timeout puntual) es más probable que un fallo real de la imagen, así que
    // vale la pena reintentar un par de veces antes de darlo por perdido.
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(CATBOX_API, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body,
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) throw new Error(`Catbox upload failed: ${response.status}`);
            const url = (await response.text()).trim();
            // No confiar a ciegas en lo que Catbox devuelva como texto — si alguna vez
            // responde con una página de error en vez de una URL, eso NO debe guardarse
            // como avatarUrl/photoUrl y servirse después como <img src>.
            if (!/^https:\/\/files\.catbox\.moe\/.+/.test(url)) {
                throw new Error(`respuesta inesperada: ${url.slice(0, 100)}`);
            }
            return url;
        } catch (error) {
            console.error(`Catbox upload error (intento ${attempt}/${MAX_ATTEMPTS}):`, error.message);
            if (attempt === MAX_ATTEMPTS) return null;
            await new Promise(resolve => setTimeout(resolve, attempt * 800));
        }
    }
    return null;
}

// Punto único de subida de fotos: usa Cloudinary si está configurado (más
// confiable), si no cae a Catbox. Todos los endpoints de foto (avatar, cuerpo,
// progreso) pasan por aquí para que el cambio de proveedor sea transparente.
async function uploadPhoto(base64Data) {
    if (CLOUDINARY_CONFIGURED) return uploadToCloudinary(base64Data);
    return uploadBase64ToCatbox(base64Data, 'jpg');
}

// Auth middleware (inline to avoid external dependencies)
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        // tokenVersion: cambiar contraseña o la pregunta de seguridad la incrementa,
        // así un token filtrado deja de servir apenas el dueño real "arregla" la
        // cuenta — sin esto, un JWT de 365 días robado seguía siendo válido aunque
        // se cambiara la contraseña.
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { isActive: true, tokenVersion: true }
        });
        if (!user || !user.isActive || user.tokenVersion !== (decoded.tokenVersion || 0)) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }
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

// Detrás del proxy de EasyPanel/Docker: confía en X-Forwarded-For para que req.ip
// sea la IP real del cliente (necesario para el rate limiting).
app.set('trust proxy', 1);

// Middleware
// CORS: el frontend en producción se sirve del MISMO origen que esta API
// (express.static más abajo), así que no necesita CORS en absoluto — solo hace
// falta para el dev server de Vite (puerto distinto) y para cualquier origen
// cross-origin explícito que se agregue vía CORS_ORIGIN (coma-separado). Los
// Atajos de iOS llaman por HTTP directo, no por fetch de navegador: CORS no les
// aplica. Antes: cors() sin opciones reflejaba cualquier Origin.
const corsAllowlist = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: corsAllowlist.length > 0 ? corsAllowlist : (process.env.NODE_ENV === 'production' ? false : true)
}));
// contentSecurityPolicy desactivado: la CSP por defecto de helmet asume assets
// propios servidos con nonces/hashes que este build de Vite no genera — activarla
// tal cual rompería el bundle. Las demás cabeceras (X-Frame-Options, nosniff, etc.)
// sí quedan activas y son las que de verdad faltaban.
app.use(helmet({ contentSecurityPolicy: false }));
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

// `client` opcional: pasar un `tx` de prisma.$transaction cuando se llama desde
// dentro de una transacción (ver DELETE/PUT /api/routines/:id), para que el
// archivado de ejercicios sea parte de la misma transacción atómica.
async function getRecycleBinDay(userId, client = prisma) {
    let routine = await client.routine.findFirst({
        where: { userId, name: "ARCHIVED_HISTORY_DO_NOT_DELETE", isActive: false }
    });

    if (!routine) {
        routine = await client.routine.create({
            data: {
                userId,
                name: "ARCHIVED_HISTORY_DO_NOT_DELETE",
                description: "System routine for preserving history of renamed/deleted exercises.",
                isActive: false
            }
        });
    }

    let day = await client.routineDay.findFirst({
        where: { routineId: routine.id }
    });

    if (!day) {
        day = await client.routineDay.create({
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
// MESOCICLOS (RoutineBlock) — bloques de periodización opcionales por rutina
// ============================================
const ROUTINE_BLOCK_PHASES = ['accumulation', 'intensification', 'deload', 'custom'];

// Bloque activo = el de `startedAt` no-nulo más reciente. Calculado en lectura a
// propósito (no un `isActive` guardado): arrancar un bloque nuevo reemplaza al
// viejo sin ningún paso de limpieza, y no hay invariante "a lo más un activo" que
// mantener a mano en cada escritura.
function getActiveBlock(blocks) {
    const started = (blocks || []).filter(b => b.startedAt != null);
    if (!started.length) return null;
    return started.reduce((latest, b) => (b.startedAt > latest.startedAt ? b : latest), started[0]);
}

// Semana actual dentro de un bloque (1-indexed), o null si el bloque no ha arrancado.
function currentWeekInBlock(block, now = new Date()) {
    if (!block?.startedAt) return null;
    const daysSince = Math.floor((now.getTime() - block.startedAt.getTime()) / (24 * 60 * 60 * 1000));
    return Math.floor(daysSince / 7) + 1;
}

// ============================================
// RATE LIMITING (en memoria) para endpoints sensibles de auth
// Una sola instancia en Docker; si se escala, migrar a Redis.
// ============================================
const rateLimitStore = new Map();
// keyFn opcional: por defecto limita por IP+ruta; algunas rutas (recuperación de
// contraseña) también necesitan un segundo límite por CUENTA objetivo, para que
// un atacante con IPs rotativas no pueda evadirlo probando contra un solo usuario.
function rateLimit({ windowMs = 15 * 60 * 1000, max = 12, keyFn } = {}) {
    return (req, res, next) => {
        // Salvaguarda: sin esto, un Map en memoria sin tope crece sin límite entre
        // barridos de 15 min si llegan muchas claves distintas (IPs/rutas/cuentas).
        if (rateLimitStore.size > 50000) rateLimitStore.clear();

        const key = keyFn ? keyFn(req) : `${req.ip}:${req.path}`;
        const now = Date.now();
        const entry = rateLimitStore.get(key);
        if (!entry || now > entry.resetAt) {
            rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        entry.count++;
        if (entry.count > max) {
            const retrySec = Math.ceil((entry.resetAt - now) / 1000);
            res.set('Retry-After', String(retrySec));
            return res.status(429).json({ error: `Demasiados intentos. Espera ${Math.ceil(retrySec / 60)} min.` });
        }
        next();
    };
}
// Limpieza periódica de entradas expiradas (no bloquea el cierre del proceso)
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitStore) if (now > v.resetAt) rateLimitStore.delete(k);
}, 15 * 60 * 1000).unref?.();

// ============================================
// WEB PUSH: temporizador de descanso. En memoria (setTimeout), no persistente —
// mismo criterio de tamaño que el resto del proyecto (un VPS, sin colas/Redis en
// ningún otro lado; `shared/` se eliminó justo para evitar complejidad prematura).
// Límite aceptado: un timer pendiente no sobrevive a un reinicio/redeploy del
// servidor a mitad del descanso.
// ============================================
const VAPID_CONFIGURED = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (VAPID_CONFIGURED) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// Envía un push a todas las suscripciones de un usuario, limpiando las que ya
// expiraron/son inválidas (404/410). Compartido por scheduleRestReminder y
// checkReengagementReminders.
async function sendPushToUser(userId, payload) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    for (const sub of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            );
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                // Subscripción expirada/inválida: se limpia sola
                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            } else {
                console.error('Error sending push notification:', err.message);
            }
        }
    }
    return subs.length;
}

async function scheduleRestReminder(userId, exercise) {
    if (!VAPID_CONFIGURED) return; // feature no configurada: no-op, no rompe el flujo de logging
    const restMs = (exercise.restSeconds || 90) * 1000;

    setTimeout(async () => {
        try {
            await sendPushToUser(userId, JSON.stringify({
                title: 'Descanso terminado',
                body: `Es hora de tu siguiente serie de ${exercise.name}`,
                exerciseId: exercise.id
            }));
        } catch (err) {
            console.error('Error in scheduleRestReminder:', err.message);
        }
    }, restMs).unref?.();
}

// ============================================
// RE-ENGAGEMENT: si el usuario lleva varios días sin entrenar y ahora mismo es
// alrededor de su hora habitual de gym (inferida de su propio historial), le
// manda un push. Se revisa cada 30 min; nunca más de uno por día por usuario
// (lastReengagementNotifiedAt). Mismo criterio de tamaño que el resto del
// proyecto: setInterval en memoria, sin colas ni cron externo.
// ============================================
const REENGAGEMENT_INACTIVE_DAYS = 3;

// Hora del día (0-23, CDMX) más frecuente en las últimas sesiones reales del
// usuario. null si no hay historial suficiente para inferir un patrón confiable.
async function computeUsualGymHour(userId) {
    const recentLogs = await prisma.workoutLog.findMany({
        where: { exercise: { routineDay: { routine: { userId } } } },
        orderBy: { date: 'desc' },
        take: 40,
        select: { date: true }
    });
    if (recentLogs.length < 5) return null;

    const hourCounts = {};
    for (const log of recentLogs) {
        const hour = mexicoCityHour(log.date);
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    let bestHour = null, bestCount = 0;
    for (const hour of Object.keys(hourCounts)) {
        if (hourCounts[hour] > bestCount) { bestCount = hourCounts[hour]; bestHour = parseInt(hour, 10); }
    }
    return bestHour;
}

async function checkReengagementReminders() {
    if (!VAPID_CONFIGURED) return;
    try {
        const now = new Date();
        const nowHour = mexicoCityHour(now);
        const todayStr = mexicoCityDateStr(now);

        const users = await prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, lastReengagementNotifiedAt: true }
        });

        for (const user of users) {
            if (user.lastReengagementNotifiedAt && mexicoCityDateStr(user.lastReengagementNotifiedAt) === todayStr) {
                continue; // ya se le avisó hoy
            }

            const lastLog = await prisma.workoutLog.findFirst({
                where: { exercise: { routineDay: { routine: { userId: user.id } } } },
                orderBy: { date: 'desc' },
                select: { date: true }
            });
            if (!lastLog) continue; // sin historial todavía: nada que "retomar"

            const daysSince = Math.floor((now.getTime() - lastLog.date.getTime()) / (24 * 60 * 60 * 1000));
            if (daysSince < REENGAGEMENT_INACTIVE_DAYS) continue;

            const usualHour = await computeUsualGymHour(user.id);
            if (usualHour === null || usualHour !== nowHour) continue;

            const sent = await sendPushToUser(user.id, JSON.stringify({
                title: '¿No vas a entrenar hoy?',
                body: `Llevas ${daysSince} días sin registrar un entreno — normalmente a esta hora ya andas en el gym.`
            }));
            if (sent === 0) continue; // sin suscripciones activas, no cuenta como "avisado"

            await prisma.user.update({ where: { id: user.id }, data: { lastReengagementNotifiedAt: now } });
        }
    } catch (err) {
        console.error('Error checking re-engagement reminders:', err.message);
    }
}
setInterval(checkReengagementReminders, 30 * 60 * 1000).unref?.();

// ============================================
// DESCARGA ADAPTATIVA — combina volumen semanal a la baja + varios ejercicios en
// plateau a la vez para activar (Routine.adaptiveDeloadUntil) una reducción
// automática de la sugerencia de peso. Solo aplica a rutinas SIN un bloque de fase
// 'deload' propio (ver getRoutinePhaseStatus) — si ya hay uno, ese manda.
// ============================================
const ADAPTIVE_DELOAD_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // no re-evaluar antes de 7 días
const ADAPTIVE_DELOAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;   // duración de la ventana de descarga
const ADAPTIVE_DELOAD_VOLUME_DROP_RATIO = 0.85;              // volumen actual < 85% del anterior
const ADAPTIVE_DELOAD_MIN_PLATEAUS = 3;                      // "varios" ejercicios a la vez

// Números de primera aproximación, sin validar contra datos reales de uso — ver
// Riesgos en el plan. Ajustar aquí (únicos dos lugares que los usan) si en la
// práctica disparan de más o de menos.
async function maybeEvaluateAdaptiveDeload(routine, userId) {
    const now = new Date();

    // Cooldown: ya evaluado hace poco, o ya está dentro de una ventana activa.
    if (routine.lastAdaptiveCheckAt && (now - routine.lastAdaptiveCheckAt) < ADAPTIVE_DELOAD_COOLDOWN_MS) return;
    if (routine.adaptiveDeloadUntil && routine.adaptiveDeloadUntil > now) return;
    // Si la rutina ya tiene su propio bloque de descarga activo, el mecanismo
    // standalone no aplica (evita que ambas fuentes "compitan").
    const activeBlock = getActiveBlock(routine.blocks || []);
    if (activeBlock?.phase === 'deload') return;

    const todayBounds = mexicoCityDayBounds(now);
    const weekAgo = new Date(todayBounds.start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(todayBounds.start.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [currentWeekSets, previousWeekSets] = await Promise.all([
        prisma.setLog.findMany({
            where: { workoutLog: { date: { gte: weekAgo }, exercise: { routineDay: { routine: { userId } } } } }
        }),
        prisma.setLog.findMany({
            where: { workoutLog: { date: { gte: twoWeeksAgo, lt: weekAgo }, exercise: { routineDay: { routine: { userId } } } } }
        })
    ]);
    const currentWeekVolume = currentWeekSets.reduce((acc, s) => acc + s.weight * s.reps, 0);
    const previousWeekVolume = previousWeekSets.reduce((acc, s) => acc + s.weight * s.reps, 0);
    // Sin semana previa real (p.ej. cuenta nueva, o volvió de vacaciones), no hay
    // "declive" que juzgar — evita leer ausencia de datos como señal de descarga.
    const volumeDeclined = previousWeekVolume > 0 && currentWeekVolume < previousWeekVolume * ADAPTIVE_DELOAD_VOLUME_DROP_RATIO;

    // El conteo de plateau es la señal más cara (N queries, una por ejercicio) — solo
    // se calcula si la señal de volumen ya se cumplió, para no gastarla en vano.
    let plateauedCount = 0;
    if (volumeDeclined) {
        const exerciseIds = (routine.days || []).flatMap(d => (d.exercises || []).map(e => e.id));
        for (const exerciseId of exerciseIds) {
            const logs = await prisma.workoutLog.findMany({
                where: { exerciseId },
                include: { sets: true },
                orderBy: { date: 'asc' }
            });
            if (detectPlateauForExercise(logs)) plateauedCount++;
        }
    }

    const data = { lastAdaptiveCheckAt: now };
    if (volumeDeclined && plateauedCount >= ADAPTIVE_DELOAD_MIN_PLATEAUS) {
        data.adaptiveDeloadUntil = new Date(now.getTime() + ADAPTIVE_DELOAD_WINDOW_MS);
    }
    await prisma.routine.update({ where: { id: routine.id }, data });
}

async function checkAdaptiveDeloadForAllUsers() {
    try {
        const routines = await prisma.routine.findMany({
            where: { isActive: true, userId: { not: null }, name: { not: 'ARCHIVED_HISTORY_DO_NOT_DELETE' } },
            include: {
                blocks: true,
                days: { include: { exercises: { select: { id: true } } } }
            }
        });
        for (const routine of routines) {
            await maybeEvaluateAdaptiveDeload(routine, routine.userId);
        }
    } catch (err) {
        console.error('Error checking adaptive deload:', err.message);
    }
}
// Señal semanal y lenta por diseño — a diferencia del recordatorio de reenganche
// (cada 30 min), no hace falta granularidad fina, así que corre 1x/día.
setInterval(checkAdaptiveDeloadForAllUsers, 24 * 60 * 60 * 1000).unref?.();

// ============================================
// PERSONAL RECORDS: recálculo derivado de los logs reales
// Se llama tras crear/editar/eliminar sesiones para que no queden récords fantasma.
// Considera ambos lados en unilateral (el récord es el mejor esfuerzo de una extremidad).
// ============================================
async function recalcPRForExercise(exerciseName, userId) {
    if (!exerciseName) return;
    const nameLower = exerciseName.toLowerCase();
    const logs = await prisma.workoutLog.findMany({
        where: {
            exercise: {
                name: { equals: exerciseName, mode: 'insensitive' },
                routineDay: { routine: { userId } }
            }
        },
        include: { sets: true },
        // orderBy explícito: sin esto, ante un empate exacto de est1RM el desempate
        // (comparación estricta `>` de abajo) dependía del orden arbitrario en que
        // Postgres devolviera las filas — la fecha del PR podía "saltar" entre
        // recálculos. Con orden ascendente, la ocurrencia MÁS ANTIGUA gana el empate,
        // de forma determinista.
        orderBy: { date: 'asc' }
    });

    let best = null; // { weight, reps, est1RM, date }
    for (const log of logs) {
        for (const s of log.sets) {
            const candidates = [{ w: s.weight, r: s.reps }];
            if (s.weightRight != null || s.repsRight != null) {
                candidates.push({ w: s.weightRight ?? s.weight, r: s.repsRight ?? s.reps });
            }
            for (const c of candidates) {
                const w = Number(c.w) || 0;
                const r = Number(c.r) || 0;
                if (w <= 0 || r <= 0) continue;
                const est = (r > 1 && r < 37) ? w * (1 + r / 30) : w;
                if (!best || est > best.est1RM) best = { weight: w, reps: r, est1RM: est, date: log.date };
            }
        }
    }

    await prisma.personalRecord.deleteMany({ where: { userId, exerciseName: nameLower } });
    if (best) {
        await prisma.personalRecord.create({
            data: {
                userId,
                exerciseName: nameLower,
                weight: best.weight,
                reps: best.reps,
                estimated1RM: best.est1RM,
                date: best.date
            }
        });
    }
}

// Valida y normaliza un array de sets entrante. Devuelve { error } o { sets }.
function sanitizeSets(rawSets, { unilateral = false } = {}) {
    if (!Array.isArray(rawSets) || rawSets.length === 0) {
        return { error: 'Se requiere al menos 1 serie' };
    }
    const sets = [];
    for (const s of rawSets) {
        const weight = parseFloat(s.weight);
        const reps = parseInt(s.reps);
        if (!Number.isFinite(weight) || weight < 0 || weight > 2000) {
            return { error: 'Peso inválido (0-2000 kg)' };
        }
        if (!Number.isInteger(reps) || reps < 0 || reps > 1000) {
            return { error: 'Repeticiones inválidas (0-1000)' };
        }
        const clean = {
            weight,
            reps,
            rpe: s.rpe != null && Number.isFinite(parseFloat(s.rpe)) ? parseFloat(s.rpe) : null,
            completed: s.completed !== false
        };
        if (s.weightRight != null) {
            const wR = parseFloat(s.weightRight);
            clean.weightRight = Number.isFinite(wR) && wR >= 0 && wR <= 2000 ? wR : null;
        }
        if (s.repsRight != null) {
            const rR = parseInt(s.repsRight);
            clean.repsRight = Number.isInteger(rR) && rR >= 0 && rR <= 1000 ? rR : null;
        }
        sets.push(clean);
    }
    return { sets };
}

// Valida/normaliza las métricas de composición corporal. Antes se guardaban con
// un parseFloat sin ningún límite (un NaN o un valor absurdo como bodyFat: -50 se
// persistía tal cual y se graficaba así) — mismo criterio de rango que sanitizeSets.
const BODY_METRIC_RANGES = {
    weight: [0, 500], bmi: [0, 100], bodyFat: [0, 100], muscleMass: [0, 300],
    bmr: [0, 10000], bodyWater: [0, 100], visceralFat: [0, 100], boneMass: [0, 50], protein: [0, 100]
};
function sanitizeBodyMetrics(body) {
    const clean = {};
    for (const [key, [min, max]] of Object.entries(BODY_METRIC_RANGES)) {
        if (body[key] == null || body[key] === '') { clean[key] = null; continue; }
        const val = parseFloat(body[key]);
        if (!Number.isFinite(val) || val < min || val > max) {
            return { error: `${key} inválido (rango esperado ${min}-${max})` };
        }
        clean[key] = val;
    }
    return { clean };
}

// ============================================
// HELPERS: Smart Loading (port literal de client/src/pages/Workout.jsx:50-139,
// usado por el Atajo de iOS vía GET /api/shortcuts/next-set). El comportamiento
// numérico debe coincidir exacto con lo que la PWA ya sugiere en /workout.
// ============================================

// Parsea el rango de reps objetivo ("8-12", "5", "AMRAP") -> { lo, hi }
function parseRepRange(targetReps) {
    const nums = String(targetReps || '').match(/\d+/g);
    if (!nums) return { lo: 8, hi: 12 };
    const a = parseInt(nums[0], 10);
    const b = nums[1] ? parseInt(nums[1], 10) : a;
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

// Devuelve los valores efectivos de una serie (en unilateral usa el lado débil,
// que es el que limita la progresión)
function effectiveWorkoutSet(set) {
    const w = Number(set.weight) || 0;
    const r = Number(set.reps) || 0;
    const hasRight = set.weightRight != null || set.repsRight != null;
    const wR = set.weightRight != null ? Number(set.weightRight) : w;
    const rR = set.repsRight != null ? Number(set.repsRight) : r;
    const rir = set.rpe != null ? (10 - set.rpe) : (set.rir != null ? set.rir : null);
    return {
        weight: hasRight ? Math.min(w, wR) : w,
        reps: hasRight ? Math.min(r, rR) : r,
        rir
    };
}

// Redondea el peso a una rejilla sensata. Si el peso base ya cae en la rejilla del
// incremento (barras/discos), se mantiene esa rejilla; si no (poleas/placas con
// valores raros como 6.8kg), se redondea al medio kilo para no distorsionar el peso real.
function roundWorkoutWeight(w, increment, base) {
    const grid = (Math.abs(base % increment) < 0.01) ? increment : 0.5;
    return Math.round(w / grid) * grid;
}

// Plateau para UN ejercicio (por id) — usado por el trigger adaptativo de descarga.
// A diferencia del cliente (exerciseName.js), aquí NO hace falta consolidar variantes
// de nombre: cada Exercise ya tiene un id estable dentro de la rutina activa, así que
// se agrupa directo por WorkoutLogs de ese id. Mismo criterio que detectPlateau:
// últimas min(6, N) sesiones (día local CDMX), mitad reciente no supera a la antigua,
// requiere >=4 sesiones para tener señal.
function detectPlateauForExercise(workoutLogs) {
    const byDay = new Map();
    for (const log of workoutLogs) {
        const dayKey = mexicoCityDateStr(log.date);
        let best = byDay.get(dayKey) || 0;
        for (const set of log.sets) {
            const eff = effectiveWorkoutSet(set);
            if (eff.weight <= 0 || eff.reps <= 0) continue;
            const rm = (eff.reps > 1 && eff.reps < 37) ? eff.weight * (1 + eff.reps / 30) : eff.weight;
            if (rm > best) best = rm;
        }
        byDay.set(dayKey, best);
    }
    const sessions = [...byDay.keys()].sort().map(day => byDay.get(day));
    if (sessions.length < 4) return false;

    const window = sessions.slice(-Math.min(6, sessions.length));
    const splitAt = Math.floor(window.length / 2);
    const olderBest = Math.max(0, ...window.slice(0, splitAt));
    const recentBest = Math.max(0, ...window.slice(splitAt));
    return recentBest <= olderBest;
}

// Fuente única de verdad para "en qué fase está esta rutina ahora mismo". Prioridad
// fija: un bloque activo (cualquier fase) manda siempre; si no hay ninguno, cae al
// mecanismo adaptativo standalone (que solo conoce 'deload', no hay forma de
// "acumular/intensificar automáticamente" sin un bloque configurado — ver discusión
// con el usuario). NINGÚN otro lugar del código debe recalcular esto por su cuenta —
// todo lector nuevo (suggestion, UI, lo que sea) debe llamar a esta función.
function getRoutinePhaseStatus(routine) {
    const activeBlock = getActiveBlock(routine.blocks || []);
    if (activeBlock) {
        return { isDeload: activeBlock.phase === 'deload', source: 'block', phase: activeBlock.phase, block: activeBlock };
    }
    if (routine.adaptiveDeloadUntil && routine.adaptiveDeloadUntil > new Date()) {
        return { isDeload: true, source: 'adaptive', phase: 'deload', until: routine.adaptiveDeloadUntil };
    }
    return { isDeload: false, source: null, phase: null };
}

// Ajusta el rango de reps objetivo según la fase activa — NO modifica el rango
// guardado del ejercicio (Exercise.targetReps), solo el usado para ESTA sugerencia:
// - intensificación: rango a la mitad (menos reps -> exige más peso para llegar al tope)
// - acumulación: techo del rango +50% (más reps antes de subir peso)
// - descarga/personalizado/sin bloque activo: rango sin cambios (descarga solo ajusta
//   el peso final, ver computeWorkoutSuggestion)
function adjustRepRangeForPhase(lo, hi, phase) {
    if (phase === 'intensification') {
        const newLo = Math.max(1, Math.round(lo * 0.5));
        return { lo: newLo, hi: Math.max(newLo, Math.round(hi * 0.5)) };
    }
    if (phase === 'accumulation') {
        return { lo, hi: Math.round(hi * 1.5) };
    }
    return { lo, hi };
}

/**
 * Sugerencia de peso y reps por DOBLE PROGRESIÓN — idéntico a Workout.jsx.
 * Toma como referencia la SERIE DE TRABAJO MÁS FUERTE de la última sesión (mayor
 * 1RM estimado), y a ese peso usa las MEJORES reps logradas. `sessions` debe venir
 * ordenado por fecha DESC (igual que GET /api/workouts/exercise/:id/history).
 */
function computeWorkoutSuggestion(sessions, targetReps, increment, phase = null) {
    if (!sessions || sessions.length === 0) return null;
    const parsedRange = parseRepRange(targetReps);
    const { lo, hi } = adjustRepRangeForPhase(parsedRange.lo, parsedRange.hi, phase);

    const working = (sessions[0].sets || [])
        .map(effectiveWorkoutSet)
        .filter(s => s.weight > 0 && s.reps > 0);
    if (working.length === 0) return null;

    const rm = (s) => s.weight * (1 + s.reps / 30);
    const ref = working.reduce((best, s) => (rm(s) > rm(best) ? s : best), working[0]);

    const sameWeight = working.filter(s => Math.abs(s.weight - ref.weight) < 0.01);
    const refReps = Math.max(...sameWeight.map(s => s.reps));
    const knownRir = sameWeight.map(s => s.rir).filter(v => v != null);
    const rir = knownRir.length ? Math.min(...knownRir) : null;

    let weight, reps, rationale;

    if (refReps >= hi) {
        weight = roundWorkoutWeight(ref.weight + increment, increment, ref.weight);
        reps = lo;
        rationale = `Alcanzaste ${refReps} reps con ${ref.weight}kg (tope del rango): sube a ${weight}kg y reinicia en ${lo}.`;
    } else {
        const bump = (rir != null && rir >= 3) ? 2 : 1;
        weight = ref.weight;
        reps = Math.min(hi, refReps + bump);
        rationale = rir != null
            ? `Hiciste ${ref.weight}kg × ${refReps} (RIR ${rir}): mantén el peso y apunta a ${reps} reps.`
            : `Hiciste ${ref.weight}kg × ${refReps}: mantén el peso y apunta a ${reps} reps.`;
    }

    if (weight <= 0 || reps <= 0) return null;
    return { weight, reps, rationale, basedOn: sessions.length };
}

// ============================================
// HELPERS: "Qué día toca" (port literal de client/src/pages/Dashboard.jsx:76-87),
// usado por GET /api/shortcuts/next-set para resolver el RoutineDay de hoy igual
// que ya lo hace el Dashboard de la PWA.
// ============================================

function getTodayName(dateObj = new Date()) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dateObj.getDay()];
}

function normalizeDay(day) {
    return day.toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .slice(0, 3);
}

// ============================================
// HELPERS: Zona horaria — app de un solo usuario, siempre en Ciudad de México.
// TODA fecha "de calendario" (qué día es hoy, dónde empieza/termina un día) debe
// resolverse aquí. El contenedor corre en UTC (Docker/Alpine sin TZ fijada), así
// que new Date()/getFullYear()/getMonth()/getDate()/getDay() usados directo quedan
// desalineados hasta 6 horas: cualquier cosa registrada después de las 6pm hora de
// CDMX caía en el "día" siguiente. Usado por: racha y heatmap (stats/overview,
// stats/consistency), los endpoints de Atajos iOS, y el filtro por día de semana.
// ============================================
const APP_TIMEZONE = 'America/Mexico_City';

// "YYYY-MM-DD" del día calendario de CDMX que contiene `date`.
function mexicoCityDateStr(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
}

// Offset UTC de CDMX (minutos, negativo = detrás de UTC) en el instante `date`.
// Se calcula en vivo vía Intl en vez de fijar -06:00 a mano, para no romper si
// México reactivara el horario de verano.
function mexicoCityUtcOffsetMinutes(date = new Date()) {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, timeZoneName: 'shortOffset' })
        .formatToParts(date).find(p => p.type === 'timeZoneName')?.value || 'GMT-6';
    const match = part.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) return -360;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (parseInt(match[2], 10) * 60 + (match[3] ? parseInt(match[3], 10) : 0));
}

// Límites reales [inicio, fin) del día calendario de CDMX que contiene `date`,
// como instantes UTC — para filtrar columnas DateTime con gte/lt correctamente.
function mexicoCityDayBounds(date = new Date()) {
    const dateStr = mexicoCityDateStr(date);
    const offsetMin = mexicoCityUtcOffsetMinutes(date);
    const sign = offsetMin <= 0 ? '-' : '+';
    const abs = Math.abs(offsetMin);
    const offsetStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    const start = new Date(`${dateStr}T00:00:00${offsetStr}`);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), dateStr };
}

// Día de la semana (0=domingo) de un "YYYY-MM-DD", sin ambigüedad de zona horaria
// (ancla a mediodía UTC antes de leer getUTCDay, así nunca cruza al día vecino).
function dayOfWeekFromDateStr(dateStr) {
    return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

// Resuelve el día objetivo para los endpoints de Atajos: ?date=YYYY-MM-DD explícito
// (backfill, se interpreta como medianoche de CDMX de ese día) o el día calendario
// real de CDMX ahora mismo. Devuelve esa medianoche como instante UTC real — ya
// sirve directo como límite inferior de "hoy" (ver next-set/log-set).
function resolveTargetDate(dateParam) {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        // Ancla a mediodía UTC de esa fecha para que, al leer el día calendario de
        // CDMX de ese instante, nunca se cruce al día anterior/siguiente.
        return mexicoCityDayBounds(new Date(`${dateParam}T12:00:00Z`)).start;
    }
    return mexicoCityDayBounds(new Date()).start;
}

// Hora del día (0-23) de un instante, en CDMX — usado para inferir la hora
// habitual de entrenar del usuario (ver checkReengagementReminders).
function mexicoCityHour(date = new Date()) {
    const h = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIMEZONE, hour: '2-digit', hour12: false
    }).format(date), 10);
    return h === 24 ? 0 : h; // algunos runtimes devuelven "24" para medianoche
}

// ============================================
// ROUTES: Routine Import
// ============================================

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/auth/register
app.post('/api/auth/register', rateLimit(), async (req, res) => {
    try {
        let { username, email, password, firstName, lastName, phone, birthDate, securityQuestion, securityAnswer } = req.body;
        username = username?.trim();
        email = email?.trim();

        if (!username || !email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Campos requeridos: username, email, password, firstName, lastName' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
        }
        if (securityAnswer && securityAnswer.trim().length < 2) {
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
            select: { id: true, username: true, email: true, firstName: true, lastName: true, phone: true, birthDate: true, avatarUrl: true, createdAt: true, tokenVersion: true }
        });

        const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
        delete user.tokenVersion;
        res.status(201).json({ user, token });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Error al crear cuenta' });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', rateLimit(), async (req, res) => {
    try {
        let { username, password } = req.body;
        username = username?.trim();

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

        const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
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
app.put('/api/auth/password', authMiddleware, rateLimit({ max: 8 }), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
        }
        if (newPassword.length < 8) {
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
            where: { id: req.userId },
            data: { passwordHash, tokenVersion: { increment: 1 } }
        });
        const token = jwt.sign({ userId: updated.id, tokenVersion: updated.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
        res.json({ message: 'Contraseña actualizada', token });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

// POST /api/auth/recover/question - Get security question
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
        console.error('Get security question error:', error);
        res.status(500).json({ error: 'Error' });
    }
});

// POST /api/auth/recover/verify - Verify answer and reset password
// Doble límite: por IP (rateLimit() de siempre) Y por CUENTA objetivo — sin el
// segundo, alguien con IPs rotativas podía forzar-bruta la respuesta de seguridad
// contra un único username sin ningún cooldown de cuenta.
app.post('/api/auth/recover/verify', rateLimit(), rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 5,
    keyFn: (req) => `recover-account:${(req.body.username || '').toLowerCase().trim()}`
}), async (req, res) => {
    try {
        const username = req.body.username?.trim();
        const { answer, newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres' });
        }
        const user = await prisma.user.findFirst({
            where: { OR: [{ username: username?.toLowerCase() }, { email: username?.toLowerCase() }] }
        });
        if (!user || !user.securityAnswerHash) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const valid = await bcrypt.compare((answer || '').toLowerCase().trim(), user.securityAnswerHash);
        if (!valid) return res.status(401).json({ error: 'Respuesta incorrecta' });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        // También invalida cualquier token viejo (robado o no) — quien acaba de
        // restablecer la contraseña por esta vía debe volver a iniciar sesión.
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
        res.json({ message: 'Contraseña restablecida exitosamente' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Error al restablecer contraseña' });
    }
});

// PUT /api/auth/security-question - Update security question
// Antes solo pedía un JWT válido — un token robado (XSS, dispositivo compartido)
// alcanzaba para reescribir en silencio el único mecanismo de recuperación de la
// cuenta. Ahora exige la contraseña actual, igual que PUT /api/auth/password.
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
            where: { id: req.userId },
            data: { securityQuestion: question, securityAnswerHash, tokenVersion: { increment: 1 } }
        });
        const token = jwt.sign({ userId: updated.id, tokenVersion: updated.tokenVersion }, JWT_SECRET, { expiresIn: '365d' });
        res.json({ message: 'Pregunta de seguridad actualizada', token });
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

        // Deduplicación de ejercicios (Tarea 4): una sola llamada al LLM (u a su
        // fallback determinista) para TODO el import, no una por ejercicio. Un
        // "create" anidado de una Routine/RoutineDay totalmente nueva no puede
        // hacer "connect" a un Exercise ya existente (cada entrada crea una fila
        // nueva) — el valor del matching aquí es reusar el NOMBRE canónico, igual
        // que ya hace recalcPRForExercise/history (matching por nombre, no por id).
        const flatExercises = [];
        days.forEach((day, dayIndex) => {
            (day.exercises || []).forEach((exercise, exIndex) => {
                flatExercises.push({ dayIndex, exIndex, name: exercise.name });
            });
        });

        const canonicalExercises = await prisma.exercise.findMany({
            where: { routineDay: { routine: { userId: req.userId } } },
            select: { id: true, name: true, muscleGroup: true },
            distinct: ['name']
        });

        const verdicts = await deduplicateExercises(flatExercises, canonicalExercises);
        const canonicalById = new Map(canonicalExercises.map(ex => [ex.id, ex]));
        const verdictByFlatIndex = new Map(verdicts.map(v => [v.index, v]));

        let flatIndex = 0;
        const resolveExerciseName = (exercise) => {
            const verdict = verdictByFlatIndex.get(flatIndex++);
            if (verdict?.matchedId) {
                return canonicalById.get(verdict.matchedId)?.name || normalizeExerciseName(exercise.name);
            }
            return verdict?.cleanedName || normalizeExerciseName(exercise.name);
        };

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
                                name: resolveExerciseName(exercise),
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
                },
                blocks: { orderBy: { order: 'asc' } }
            },
            orderBy: { createdAt: 'desc' }
        });
        // activeBlock/currentWeek calculados aquí (no solo en /active): Workout.jsx
        // busca el día por dayId iterando TODAS las rutinas del usuario, no solo la
        // marcada isActive.
        res.json(routines.map(r => {
            const activeBlock = getActiveBlock(r.blocks);
            const phaseStatus = getRoutinePhaseStatus(r);
            return { ...r, activeBlock, currentWeek: currentWeekInBlock(activeBlock), isDeload: phaseStatus.isDeload, phase: phaseStatus.phase };
        }));
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
                },
                blocks: { orderBy: { order: 'asc' } }
            }
        });
        if (!routine) return res.json(routine);
        const activeBlock = getActiveBlock(routine.blocks);
        const phaseStatus = getRoutinePhaseStatus(routine);
        res.json({ ...routine, activeBlock, currentWeek: currentWeekInBlock(activeBlock), isDeload: phaseStatus.isDeload, phase: phaseStatus.phase });
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
                },
                blocks: { orderBy: { order: 'asc' } }
            }
        });

        if (!routine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        const activeBlock = getActiveBlock(routine.blocks);
        const phaseStatus = getRoutinePhaseStatus(routine);
        res.json({ ...routine, activeBlock, currentWeek: currentWeekInBlock(activeBlock), isDeload: phaseStatus.isDeload, phase: phaseStatus.phase });
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

        // Envuelto en transacción: archivar-lo-que-tiene-historial y luego borrar la
        // rutina eran pasos independientes antes — si algo fallaba a la mitad, podía
        // quedar a medio archivar. También cierra la ventana de carrera contra un
        // WorkoutLog nuevo llegando (p.ej. desde un Atajo) entre el conteo y el borrado.
        await prisma.$transaction(async (tx) => {
            const routineDays = await tx.routineDay.findMany({
                where: { routineId: req.params.id },
                include: { exercises: { select: { id: true } } }
            });

            for (const day of routineDays) {
                for (const ex of day.exercises) {
                    const logCount = await tx.workoutLog.count({ where: { exerciseId: ex.id } });
                    if (logCount > 0) {
                        const binId = await getRecycleBinDay(req.userId, tx);
                        await tx.exercise.update({
                            where: { id: ex.id },
                            data: { routineDayId: binId }
                        });
                    }
                }
            }

            await tx.routine.delete({ where: { id: req.params.id } });
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
        const { name, description, days } = req.body;

        // Verify ownership
        const existingRoutine = await prisma.routine.findFirst({
            where: { id: routineId, userId: req.userId }
        });

        if (!existingRoutine) {
            return res.status(404).json({ error: 'Routine not found' });
        }

        // Deduplicación de ejercicios nuevos (Tarea 4): UNA sola llamada para todo
        // el PUT, no una por ejercicio. Solo aplica a exercises SIN `id` (genuinamente
        // nuevos) — el renombrado de un ejercicio existente (con id) ya tiene su
        // propio flujo de archivo/restauración más abajo y no pasa por aquí.
        const newExerciseEntries = [];
        days.forEach((day, dayIdx) => {
            (day.exercises || []).forEach((ex, exIdx) => {
                if (!ex.id) newExerciseEntries.push({ dayIdx, exIdx, name: ex.name });
            });
        });

        let canonicalExercisesForDedup = [];
        const dedupVerdictByEntry = new Map();
        if (newExerciseEntries.length > 0) {
            canonicalExercisesForDedup = await prisma.exercise.findMany({
                where: { routineDay: { routine: { userId: req.userId } } },
                select: { id: true, name: true, muscleGroup: true, routineDayId: true },
                distinct: ['name']
            });
            const verdicts = await deduplicateExercises(newExerciseEntries, canonicalExercisesForDedup);
            verdicts.forEach((v, i) => {
                const entry = newExerciseEntries[i];
                dedupVerdictByEntry.set(`${entry.dayIdx}:${entry.exIdx}`, v);
            });
        }
        const canonicalByIdForDedup = new Map(canonicalExercisesForDedup.map(ex => [ex.id, ex]));

        // Toda la escritura (info básica, días, ejercicios) va en UNA transacción:
        // antes eran ~decenas de prisma.X sueltos, y si algo fallaba a la mitad (p.ej.
        // la carrera de conteo-de-logs-luego-borrado, o un targetSets corrupto) la
        // rutina quedaba parcialmente actualizada con un 500 genérico. La búsqueda
        // de dedup (llamada externa, puede tardar) se queda FUERA a propósito para
        // no sostener la transacción abierta esperando una respuesta de red.
        const updatedRoutine = await prisma.$transaction(async (tx) => {
            // 1. Update basic info
            await tx.routine.update({
                where: { id: routineId },
                data: { name, description }
            });

            // 2. Handle Days
            const existingDaysList = await tx.routineDay.findMany({
                where: { routineId },
                select: { id: true }
            });
            const incomingDayIds = days.filter(d => d.id).map(d => d.id);
            const daysToDelete = existingDaysList.filter(d => !incomingDayIds.includes(d.id)).map(d => d.id);

            if (daysToDelete.length > 0) {
                // SAFE DELETE DAYS: Archive exercises with logs first
                const staleDays = await tx.routineDay.findMany({
                    where: { id: { in: daysToDelete } },
                    include: { exercises: { select: { id: true } } }
                });

                for (const d of staleDays) {
                    for (const ex of d.exercises) {
                        const logCount = await tx.workoutLog.count({ where: { exerciseId: ex.id } });
                        if (logCount > 0) {
                            const binId = await getRecycleBinDay(req.userId, tx);
                            await tx.exercise.update({
                                where: { id: ex.id },
                                data: { routineDayId: binId }
                            });
                        }
                    }
                }
                await tx.routineDay.deleteMany({ where: { id: { in: daysToDelete } } });
            }

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

                // 3. Handle Exercises
                if (day.exercises && Array.isArray(day.exercises)) {
                    const existingExercises = await tx.exercise.findMany({
                        where: { routineDayId: dayId },
                        select: { id: true }
                    });
                    const incomingExIds = day.exercises.filter(e => e.id).map(e => e.id);
                    const exToDelete = existingExercises.filter(e => !incomingExIds.includes(e.id)).map(e => e.id);

                    if (exToDelete.length > 0) {
                        for (const exId of exToDelete) {
                            const logCount = await tx.workoutLog.count({ where: { exerciseId: exId } });
                            if (logCount > 0) {
                                // Safe Delete: Has history, move to archive
                                const binId = await getRecycleBinDay(req.userId, tx);
                                await tx.exercise.update({
                                    where: { id: exId },
                                    data: { routineDayId: binId }
                                });
                            } else {
                                // True Delete: No history
                                await tx.exercise.delete({ where: { id: exId } });
                            }
                        }
                    }

                    for (let j = 0; j < day.exercises.length; j++) {
                        const ex = day.exercises[j];
                        const normalizedName = normalizeExerciseName(ex.name);
                        // Fallback consistente: sin esto, un targetSets vacío/no numérico
                        // se guardaba como NaN y rompía en silencio la detección de "día
                        // completo" (next-set/Atajos) hasta corregirlo a mano.
                        const cleanTargetSets = parseInt(ex.targetSets) || 3;

                        if (ex.id) {
                            const currentExercise = await tx.exercise.findUnique({
                                where: { id: ex.id },
                                select: { name: true }
                            });

                            const currentName = currentExercise ? normalizeExerciseName(currentExercise.name) : '';

                            if (currentName !== normalizedName) {
                                // Check for history
                                const logCount = await tx.workoutLog.count({
                                    where: { exerciseId: ex.id }
                                });

                                if (logCount > 0) {
                                    // Has history: Move current to Recycle Bin
                                    const binId = await getRecycleBinDay(req.userId, tx);

                                    await tx.exercise.update({
                                        where: { id: ex.id },
                                        data: { routineDayId: binId }
                                    });

                                    // Check if NEW name exists in Archive to RESTORE instead of Create
                                    const archivedEx = await tx.exercise.findFirst({
                                        where: {
                                            routineDayId: binId,
                                            name: normalizedName
                                        }
                                    });

                                    if (archivedEx) {
                                        await tx.exercise.update({
                                            where: { id: archivedEx.id },
                                            data: {
                                                routineDayId: dayId,
                                                targetSets: cleanTargetSets,
                                                targetReps: ex.targetReps,
                                                restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                                note: ex.note,
                                                isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                                order: j
                                            }
                                        });
                                    } else {
                                        // Make new if not found in archive
                                        await tx.exercise.create({
                                            data: {
                                                routineDayId: dayId,
                                                name: normalizedName,
                                                targetSets: cleanTargetSets,
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
                            await tx.exercise.update({
                                where: { id: ex.id },
                                data: {
                                    name: normalizedName,
                                    targetSets: cleanTargetSets,
                                    targetReps: ex.targetReps,
                                    restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                    note: ex.note,
                                    isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                    order: j
                                }
                            });

                        } else {
                            const binId = await getRecycleBinDay(req.userId, tx);
                            const verdict = dedupVerdictByEntry.get(`${i}:${j}`);
                            const resolvedName = verdict?.matchedId
                                ? (canonicalByIdForDedup.get(verdict.matchedId)?.name || normalizedName)
                                : (verdict?.cleanedName || normalizedName);

                            // Si el veredicto (LLM o fallback) apunta a un ejercicio que HOY
                            // vive en la papelera, restaurarlo (preserva su historial) — igual
                            // que ya hacía el matching exacto. Si apunta a uno ACTIVO en otro
                            // día, NO reengancharlo solo (evita sacarlo de donde vive sin que
                            // el usuario lo pida): se crea uno nuevo con el nombre canónico, que
                            // igual comparte historial/PRs por nombre con el resto de la app.
                            let archivedEx = null;
                            if (verdict?.matchedId) {
                                const matched = canonicalByIdForDedup.get(verdict.matchedId);
                                if (matched && matched.routineDayId === binId) archivedEx = matched;
                            }
                            if (!archivedEx) {
                                archivedEx = await tx.exercise.findFirst({
                                    where: {
                                        routineDayId: binId,
                                        name: { equals: resolvedName, mode: 'insensitive' }
                                    }
                                });
                            }

                            if (archivedEx) {
                                await tx.exercise.update({
                                    where: { id: archivedEx.id },
                                    data: {
                                        routineDayId: dayId,
                                        targetSets: cleanTargetSets,
                                        targetReps: ex.targetReps || '8-12',
                                        restSeconds: ex.restSeconds ? parseInt(ex.restSeconds) : null,
                                        note: ex.note,
                                        isUnilateral: ex.isUnilateral !== undefined ? ex.isUnilateral : false,
                                        order: j
                                    }
                                });
                            } else {
                                await tx.exercise.create({
                                    data: {
                                        routineDayId: dayId,
                                        name: resolvedName,
                                        targetSets: cleanTargetSets,
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

            return tx.routine.findUnique({
                where: { id: routineId },
                include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
            });
        }, { timeout: 20000 }); // rutinas grandes con muchos ejercicios pueden tardar más que el default de 5s

        res.json(updatedRoutine);
    } catch (error) {
        console.error('Error updating routine:', error);
        res.status(500).json({ error: 'Failed to update routine' });
    }
});

// ============================================
// ROUTES: Mesociclos (RoutineBlock)
// ============================================

// GET /api/routines/:id/blocks - Listar bloques de una rutina
app.get('/api/routines/:id/blocks', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const blocks = await prisma.routineBlock.findMany({
            where: { routineId: req.params.id },
            orderBy: { order: 'asc' }
        });
        res.json(blocks);
    } catch (error) {
        console.error('Error fetching routine blocks:', error);
        res.status(500).json({ error: 'Failed to fetch routine blocks' });
    }
});

// POST /api/routines/:id/blocks - Crear un bloque nuevo
app.post('/api/routines/:id/blocks', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const { name, phase, order, durationWeeks } = req.body;
        if (!name) return res.status(400).json({ error: 'Required: name' });
        if (phase && !ROUTINE_BLOCK_PHASES.includes(phase)) {
            return res.status(400).json({ error: `phase must be one of: ${ROUTINE_BLOCK_PHASES.join(', ')}` });
        }

        const block = await prisma.routineBlock.create({
            data: {
                routineId: req.params.id,
                name,
                phase: phase || 'custom',
                order: Number.isInteger(order) ? order : 0,
                durationWeeks: durationWeeks ? parseInt(durationWeeks) : 4
            }
        });
        res.status(201).json(block);
    } catch (error) {
        console.error('Error creating routine block:', error);
        res.status(500).json({ error: 'Failed to create routine block' });
    }
});

// PUT /api/routines/:id/blocks/:blockId - Editar un bloque
app.put('/api/routines/:id/blocks/:blockId', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const existing = await prisma.routineBlock.findFirst({
            where: { id: req.params.blockId, routineId: req.params.id }
        });
        if (!existing) return res.status(404).json({ error: 'Block not found' });

        const { name, phase, order, durationWeeks } = req.body;
        if (phase && !ROUTINE_BLOCK_PHASES.includes(phase)) {
            return res.status(400).json({ error: `phase must be one of: ${ROUTINE_BLOCK_PHASES.join(', ')}` });
        }

        const block = await prisma.routineBlock.update({
            where: { id: req.params.blockId },
            data: {
                name: name ?? existing.name,
                phase: phase ?? existing.phase,
                order: Number.isInteger(order) ? order : existing.order,
                durationWeeks: durationWeeks ? parseInt(durationWeeks) : existing.durationWeeks
            }
        });
        res.json(block);
    } catch (error) {
        console.error('Error updating routine block:', error);
        res.status(500).json({ error: 'Failed to update routine block' });
    }
});

// DELETE /api/routines/:id/blocks/:blockId - Borrar un bloque
app.delete('/api/routines/:id/blocks/:blockId', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const existing = await prisma.routineBlock.findFirst({
            where: { id: req.params.blockId, routineId: req.params.id }
        });
        if (!existing) return res.status(404).json({ error: 'Block not found' });

        await prisma.routineBlock.delete({ where: { id: req.params.blockId } });
        res.json({ message: 'Block deleted successfully' });
    } catch (error) {
        console.error('Error deleting routine block:', error);
        res.status(500).json({ error: 'Failed to delete routine block' });
    }
});

// POST /api/routines/:id/blocks/:blockId/start - Arrancar un bloque (lo vuelve el activo)
app.post('/api/routines/:id/blocks/:blockId/start', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const existing = await prisma.routineBlock.findFirst({
            where: { id: req.params.blockId, routineId: req.params.id }
        });
        if (!existing) return res.status(404).json({ error: 'Block not found' });

        const block = await prisma.routineBlock.update({
            where: { id: req.params.blockId },
            data: { startedAt: new Date() }
        });
        res.json(block);
    } catch (error) {
        console.error('Error starting routine block:', error);
        res.status(500).json({ error: 'Failed to start routine block' });
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

        // Validación/normalización server-side (evita pesos negativos/absurdos y NaN)
        const { sets: cleanSets, error: setsError } = sanitizeSets(sets);
        if (setsError) return res.status(400).json({ error: setsError });

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
                    create: cleanSets.map((set, index) => ({
                        setNumber: index + 1,
                        weight: set.weight,
                        reps: set.reps,
                        rpe: set.rpe,
                        weightRight: set.weightRight ?? null,
                        repsRight: set.repsRight ?? null,
                        completed: set.completed
                    }))
                }
            },
            include: {
                sets: true,
                exercise: true
            }
        });

        // Recalcula el PR del ejercicio desde los logs reales (consistente, incluye unilateral)
        await recalcPRForExercise(exercise.name, req.userId);
        // El aviso de descanso ya no se programa aquí: el frontend lo pide por
        // cada serie individual vía POST /api/workouts/rest-reminder en cuanto
        // se marca completada, en vez de una sola vez al guardar todo el
        // ejercicio junto (dejarlo aquí también duplicaría el aviso de la
        // última serie).

        res.status(201).json({
            message: 'Workout logged successfully!',
            workoutLog
        });
    } catch (error) {
        console.error('Error logging workout:', error);
        res.status(500).json({ error: 'Failed to log workout' });
    }
});

// POST /api/workouts/rest-reminder - Programa el push de "descanso terminado"
// para UNA serie, sin tocar WorkoutLog/SetLog. Existe aparte de POST
// /api/workouts/log porque ese endpoint recibe TODAS las series de un
// ejercicio en una sola llamada (batch) — este endpoint deja que el frontend
// dispare el aviso por cada serie individual que se marca completada, sin
// tener que rediseñar cómo se persisten los datos.
app.post('/api/workouts/rest-reminder', authMiddleware, async (req, res) => {
    try {
        const { exerciseId } = req.body;
        if (!exerciseId) {
            return res.status(400).json({ error: 'Required: exerciseId' });
        }
        const exercise = await prisma.exercise.findFirst({
            where: { id: exerciseId, routineDay: { routine: { userId: req.userId } } }
        });
        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found or unauthorized' });
        }
        scheduleRestReminder(req.userId, exercise);
        res.status(202).json({ message: 'Rest reminder scheduled' });
    } catch (error) {
        console.error('Error scheduling rest reminder:', error);
        res.status(500).json({ error: 'Failed to schedule rest reminder' });
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
            filtered = logs.filter(log => dayOfWeekFromDateStr(mexicoCityDateStr(log.date)) === dow);
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

// ============================================
// ROUTES: iOS Shortcuts
// Endpoints "amigables para Shortcuts" (JSON plano, sin anidar) para registrar
// series con fricción mínima desde un Atajo de iOS. Auth: el mismo Bearer JWT de
// siempre (expira en 365 días, se obtiene una vez con POST /api/auth/login y se
// pega en el Atajo — no hay mecanismo de auth nuevo).
// ============================================

// Respuesta base: siempre trae los mismos campos (algunos null según el caso) para
// que el Atajo pueda ramificar con un solo booleano sin manejar formas distintas.
function baseShortcutResponse() {
    return {
        isRestDay: false,
        dayComplete: false,
        noActiveRoutine: false,
        dayName: null,
        exerciseId: null,
        exerciseName: null,
        muscleGroup: null,
        targetSets: null,
        setsLoggedToday: null,
        targetRepsRange: null,
        restSeconds: null,
        isUnilateral: null,
        suggestedWeight: null,
        suggestedReps: null,
        rationale: null
    };
}

// GET /api/shortcuts/next-set - Qué ejercicio toca ahora y a qué peso/reps
app.get('/api/shortcuts/next-set', authMiddleware, async (req, res) => {
    try {
        const targetDate = resolveTargetDate(req.query.date);
        const startOfDay = targetDate; // ya es medianoche real de CDMX (ver resolveTargetDate)
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        const todayName = getTodayName(targetDate);

        const routine = await prisma.routine.findFirst({
            where: { isActive: true, userId: req.userId },
            include: {
                days: {
                    include: { exercises: { orderBy: { order: 'asc' } } },
                    orderBy: { order: 'asc' }
                },
                blocks: true
            }
        });

        if (!routine) {
            return res.json({ ...baseShortcutResponse(), noActiveRoutine: true });
        }

        const phaseStatus = getRoutinePhaseStatus(routine);

        const todayRoutineDay = routine.days.find(d => normalizeDay(d.dayName) === normalizeDay(todayName));

        if (!todayRoutineDay || todayRoutineDay.isRestDay) {
            return res.json({ ...baseShortcutResponse(), isRestDay: true, dayName: todayName });
        }

        const exerciseIds = todayRoutineDay.exercises.map(e => e.id);
        const todayLogs = exerciseIds.length
            ? await prisma.workoutLog.findMany({
                where: { exerciseId: { in: exerciseIds }, date: { gte: startOfDay, lt: endOfDay } },
                include: { sets: true }
            })
            : [];
        const loggedCountByExercise = {};
        for (const log of todayLogs) {
            loggedCountByExercise[log.exerciseId] = (loggedCountByExercise[log.exerciseId] || 0) + log.sets.length;
        }

        const nextExercise = todayRoutineDay.exercises.find(
            ex => (loggedCountByExercise[ex.id] || 0) < ex.targetSets
        );

        if (!nextExercise) {
            return res.json({ ...baseShortcutResponse(), dayName: todayRoutineDay.dayName, dayComplete: true });
        }

        const setsLoggedToday = loggedCountByExercise[nextExercise.id] || 0;

        // Historial: mismo criterio que GET /api/workouts/exercise/:exerciseId/history
        // (match por nombre, insensible a mayúsculas, últimas 20 sesiones)
        const history = await prisma.workoutLog.findMany({
            where: {
                exercise: {
                    name: { equals: nextExercise.name, mode: 'insensitive' },
                    routineDay: { routine: { userId: req.userId } }
                }
            },
            include: { sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { date: 'desc' },
            take: 20
        });

        const base = {
            ...baseShortcutResponse(),
            dayName: todayRoutineDay.dayName,
            exerciseId: nextExercise.id,
            exerciseName: nextExercise.name,
            muscleGroup: nextExercise.muscleGroup,
            targetSets: nextExercise.targetSets,
            setsLoggedToday,
            targetRepsRange: nextExercise.targetReps,
            restSeconds: nextExercise.restSeconds,
            isUnilateral: nextExercise.isUnilateral,
            isDeload: phaseStatus.isDeload,
            phase: phaseStatus.phase
        };

        if (history.length === 0) {
            return res.json({ ...base, rationale: 'sin historial' });
        }

        const increment = nextExercise.muscleGroup === 'Piernas' ? 5 : 2.5;
        const suggestion = computeWorkoutSuggestion(history, nextExercise.targetReps, increment, phaseStatus.phase);

        if (!suggestion) {
            return res.json({ ...base, rationale: 'sin historial' });
        }

        // Descarga: reduce el peso sugerido ~10% (misma rejilla de redondeo que la
        // sugerencia normal), sin tocar `rationale` — lo consume el Atajo de iOS
        // externo y no se controla cómo parsea ese string.
        const suggestedWeight = phaseStatus.isDeload
            ? roundWorkoutWeight(suggestion.weight * 0.9, increment, suggestion.weight)
            : suggestion.weight;

        res.json({
            ...base,
            suggestedWeight,
            suggestedReps: suggestion.reps,
            rationale: suggestion.rationale
        });
    } catch (error) {
        console.error('Error resolving next-set:', error);
        res.status(500).json({ error: 'Failed to resolve next set' });
    }
});

// POST /api/shortcuts/log-set - Registrar UNA serie (a diferencia de POST
// /api/workouts/log, que recibe un array de series). Acumula en el WorkoutLog de
// HOY para ese ejercicio si ya existe uno (evita fragmentar la sesión en varios
// WorkoutLog cuando el Atajo llama varias veces seguidas).
app.post('/api/shortcuts/log-set', authMiddleware, async (req, res) => {
    try {
        const { exerciseId, weight, reps, rpe, weightRight, repsRight } = req.body;

        if (!exerciseId) {
            return res.status(400).json({ error: 'Required: exerciseId' });
        }

        const { sets: cleanSets, error: setsError } = sanitizeSets([{ weight, reps, rpe, weightRight, repsRight }]);
        if (setsError) return res.status(400).json({ error: setsError });
        const cleanSet = cleanSets[0];

        const exercise = await prisma.exercise.findFirst({
            where: { id: exerciseId, routineDay: { routine: { userId: req.userId } } }
        });
        if (!exercise) {
            return res.status(404).json({ error: 'Exercise not found or unauthorized' });
        }

        const explicitDate = req.query.date || req.body.date;
        const targetDate = resolveTargetDate(explicitDate);
        const startOfDay = targetDate; // ya es medianoche real de CDMX (ver resolveTargetDate)
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        // Envuelto en transacción: encontrar-o-crear el WorkoutLog de "hoy" no es
        // atómico entre dos llamadas casi simultáneas del Atajo (p.ej. un reintento
        // tras timeout) sin esto — ambas podrían ver "no existe" y crear un log
        // duplicado, fragmentando la sesión que este endpoint existe para evitar.
        const workoutLog = await prisma.$transaction(async (tx) => {
            let log = await tx.workoutLog.findFirst({
                where: { exerciseId, date: { gte: startOfDay, lt: endOfDay } },
                include: { sets: true }
            });

            if (log) {
                await tx.setLog.create({
                    data: {
                        workoutLogId: log.id,
                        setNumber: log.sets.length + 1,
                        weight: cleanSet.weight,
                        reps: cleanSet.reps,
                        rpe: cleanSet.rpe,
                        weightRight: cleanSet.weightRight ?? null,
                        repsRight: cleanSet.repsRight ?? null,
                        completed: cleanSet.completed
                    }
                });
                return tx.workoutLog.findUnique({
                    where: { id: log.id },
                    include: { sets: true, exercise: true }
                });
            }

            return tx.workoutLog.create({
                data: {
                    exerciseId,
                    // Con ?date= explícito (backfill) no hay hora real que guardar, se usa
                    // medianoche real de CDMX del día pedido. Sin override (uso normal en
                    // vivo desde el Atajo) se guarda la hora real, igual que
                    // /api/workouts/log — si no, la PWA no puede mostrar la hora real de
                    // guardado (siempre caía a medianoche) para sets registrados vía Atajo.
                    date: explicitDate ? targetDate : new Date(),
                    sets: {
                        create: [{
                            setNumber: 1,
                            weight: cleanSet.weight,
                            reps: cleanSet.reps,
                            rpe: cleanSet.rpe,
                            weightRight: cleanSet.weightRight ?? null,
                            repsRight: cleanSet.repsRight ?? null,
                            completed: cleanSet.completed
                        }]
                    }
                },
                include: { sets: true, exercise: true }
            });
        });

        await recalcPRForExercise(exercise.name, req.userId);
        scheduleRestReminder(req.userId, exercise);

        res.status(201).json({
            message: 'Set logged successfully!',
            workoutLog,
            setsLoggedToday: workoutLog.sets.length,
            targetSets: exercise.targetSets
        });
    } catch (error) {
        console.error('Error logging set via shortcut:', error);
        res.status(500).json({ error: 'Failed to log set' });
    }
});

// ============================================
// ROUTES: Push Notifications
// ============================================

// GET /api/push/vapid-public-key - Clave pública para pushManager.subscribe()
app.get('/api/push/vapid-public-key', authMiddleware, async (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe - Guarda/actualiza la subscripción de este dispositivo
app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ error: 'Required: endpoint, keys.p256dh, keys.auth' });
        }

        const subscription = await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: { userId: req.userId, p256dh: keys.p256dh, auth: keys.auth },
            create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }
        });

        res.status(201).json({ message: 'Subscribed', subscription });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// DELETE /api/push/subscribe - Elimina la subscripción de este dispositivo
app.delete('/api/push/subscribe', authMiddleware, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ error: 'Required: endpoint' });
        }
        await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
        res.json({ message: 'Unsubscribed' });
    } catch (error) {
        console.error('Error deleting push subscription:', error);
        res.status(500).json({ error: 'Failed to delete subscription' });
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

        // Validación/normalización server-side
        const { sets: cleanSets, error: setsError } = sanitizeSets(sets);
        if (setsError) return res.status(400).json({ error: setsError });

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
                data: cleanSets.map((set, i) => ({
                    workoutLogId: logId,
                    setNumber: i + 1,
                    weight: set.weight,
                    reps: set.reps,
                    rpe: set.rpe,
                    weightRight: set.weightRight ?? null,
                    repsRight: set.repsRight ?? null,
                    completed: set.completed
                }))
            });

            return tx.workoutLog.findUnique({
                where: { id: logId },
                include: { sets: { orderBy: { setNumber: 'asc' } }, exercise: true }
            });
        });

        // Recalcula el PR del ejercicio (puede subir o bajar tras la edición)
        if (updated?.exercise?.name) {
            await recalcPRForExercise(updated.exercise.name, req.userId);
        }

        res.json({ message: 'Session updated!', workoutLog: updated });
    } catch (error) {
        console.error('Error updating workout:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// DELETE /api/workouts/:logId - Delete a workout session
app.delete('/api/workouts/:logId', authMiddleware, async (req, res) => {
    try {
        // Verify ownership (incluye el nombre del ejercicio para recalcular el PR después)
        const existingLog = await prisma.workoutLog.findFirst({
            where: {
                id: req.params.logId,
                exercise: {
                    routineDay: {
                        routine: { userId: req.userId }
                    }
                }
            },
            include: { exercise: { select: { name: true } } }
        });

        if (!existingLog) {
            return res.status(404).json({ error: 'Workout log not found or unauthorized' });
        }

        await prisma.workoutLog.delete({ where: { id: req.params.logId } });

        // Recalcula el PR: si el récord venía de esta sesión, ya no debe quedar fantasma
        await recalcPRForExercise(existingLog.exercise?.name, req.userId);

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
        const todayBounds = mexicoCityDayBounds();
        const thirtyDaysAgo = new Date(todayBounds.start.getTime() - 30 * 24 * 60 * 60 * 1000);

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

        // Calculate unique training days (día calendario de CDMX, no UTC)
        const uniqueDays = new Set([
            ...recentWorkouts.map(w => mexicoCityDateStr(w.date)),
            ...recentRestLogs.map(r => mexicoCityDateStr(r.date))
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
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(todayBounds.start.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = mexicoCityDateStr(checkDate);
            const dayOfWeek = dayOfWeekFromDateStr(dateStr);

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
        const weekAgo = new Date(todayBounds.start.getTime() - 7 * 24 * 60 * 60 * 1000);

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
        const threeSixtyFiveDaysAgo = new Date(mexicoCityDayBounds().start.getTime() - 365 * 24 * 60 * 60 * 1000);

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

        // Add auto-rest events for scheduled rest days (last 365 days) — día
        // calendario de CDMX, no UTC (ver HELPERS: Zona horaria)
        const loggedDates = new Set([
            ...workouts.map(w => mexicoCityDateStr(w.date)),
            ...restLogs.map(r => mexicoCityDateStr(r.date))
        ]);

        if (restDaySet.size > 0) {
            const todayStart = mexicoCityDayBounds().start;
            for (let i = 0; i < 365; i++) {
                const checkDate = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
                const dateStr = mexicoCityDateStr(checkDate);
                if (!loggedDates.has(dateStr) && restDaySet.has(dayOfWeekFromDateStr(dateStr))) {
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
        const hasPhoto = !!photo;

        const { clean: cleanMetrics, error: metricsError } = sanitizeBodyMetrics({ weight, bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein });
        if (metricsError) return res.status(400).json({ error: metricsError });
        const hasNonPhotoData = Object.values(cleanMetrics).some(v => v != null);

        if (!hasNonPhotoData && !hasPhoto) {
            return res.status(400).json({ error: 'Se requiere peso, foto o datos de composición corporal' });
        }

        // Upload de la foto si viene en base64. uploadPhoto nunca lanza (captura
        // sus propios errores y devuelve null) — antes esto se silenciaba del
        // todo: se guardaba el registro igual con photoUrl: null y se
        // respondía 201 "guardado" aunque la foto nunca subiera.
        let photoUrl = null;
        if (hasPhoto) {
            photoUrl = (photo.startsWith('data:image') || photo.length > 500)
                ? await uploadPhoto(photo)
                : photo; // ya era una URL
        }
        const photoFailed = hasPhoto && !photoUrl;

        // La foto era el único dato y falló: no crear un registro vacío, avisar
        // para que se reintente.
        if (photoFailed && !hasNonPhotoData) {
            return res.status(502).json({ error: 'No se pudo subir la foto. Intenta de nuevo.' });
        }

        const bodyLog = await prisma.bodyLog.create({
            data: {
                userId: req.userId,
                photoUrl,
                note: note || null,
                ...cleanMetrics
            }
        });

        res.status(201).json({
            message: 'Body log saved!',
            bodyLog: { ...bodyLog, photo: bodyLog.photoUrl },
            photoFailed // true solo si había más datos y solo falló la foto
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

        const { clean: cleanMetrics, error: metricsError } = sanitizeBodyMetrics({ weight });
        if (metricsError) return res.status(400).json({ error: metricsError });

        // Upload photo if it's base64
        let photoUrl = null;
        if (photo) {
            if (photo.startsWith('data:image') || photo.length > 500) {
                try {
                    console.log('📸 Uploading photo (legacy)...');
                    photoUrl = await uploadPhoto(photo);
                    console.log('✅ Photo uploaded:', photoUrl);
                } catch (uploadError) {
                    console.error('❌ Photo upload failed:', uploadError.message);
                    photoUrl = null;
                }
            } else {
                photoUrl = photo;
            }
        }

        const bodyLog = await prisma.bodyLog.create({
            data: {
                userId: req.userId,
                weight: cleanMetrics.weight,
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
// Verdad de "cumplido" (achievedAt): se calcula aquí de forma perezosa contra el
// historial real de WorkoutLog/SetLog, nunca se confía en un flag del cliente.
// Es una puerta de un solo sentido: una vez detectado, se persiste y no se vuelve
// a evaluar (igual que un PR, es un hecho histórico). Usa bestOneRepMaxForTarget
// (no best1RMRecent) para no repetir el bug original: una serie submáxima de
// muchas reps no debe poder "demostrar" que se cumplió una meta exigente en pocas
// reps solo por extrapolación de Epley — ver exerciseName.js.
app.get('/api/goals', authMiddleware, async (req, res) => {
    try {
        const goals = await prisma.goal.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });

        const pendingGoals = goals.filter(g => !g.achievedAt);
        let logs = null;
        if (pendingGoals.length > 0) {
            logs = await prisma.workoutLog.findMany({
                where: { exercise: { routineDay: { routine: { userId: req.userId } } } },
                include: { sets: true, exercise: true }
            });
        }

        const resolved = await Promise.all(goals.map(async (goal) => {
            if (goal.achievedAt) return goal; // ya persistido, hecho histórico, no se re-deriva

            const matching = logs.filter(l => isSameExercise(l.exercise.name, goal.exerciseName));
            if (matching.length === 0) return goal;

            const grouped = groupHistoryByExercise(matching);
            const sessions = [...grouped.values()][0]?.sessions || [];
            if (sessions.length < 2) return goal; // mismo mínimo que usa GoalCard para tener "hasHistory"

            const starting1RM = bestOneRepMaxForTarget(sessions, goal.targetReps, 3);
            if (starting1RM <= 0) return goal; // sin series cercanas al objetivo, sin evidencia suficiente

            const target1RM = goal.targetReps === 1 ? goal.targetWeight : epley1RM(goal.targetWeight, goal.targetReps);
            if (starting1RM >= target1RM) {
                return prisma.goal.update({ where: { id: goal.id }, data: { achievedAt: new Date() } });
            }
            return goal;
        }));

        res.json(resolved);
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

        const cleanWeight = parseFloat(targetWeight);
        const cleanReps = parseInt(targetReps);

        // Evita crear el mismo objetivo dos veces (mismo ejercicio+peso+reps, sin
        // cumplir todavía) — se encontró un caso real de esto sin ningún aviso.
        const duplicate = await prisma.goal.findFirst({
            where: {
                userId: req.userId,
                exerciseName: { equals: exerciseName, mode: 'insensitive' },
                targetWeight: cleanWeight,
                targetReps: cleanReps,
                achievedAt: null
            }
        });
        if (duplicate) {
            return res.status(409).json({ error: 'Ya tienes un objetivo activo para ese ejercicio con ese peso y esas reps' });
        }

        const goal = await prisma.goal.create({
            data: {
                userId: req.userId,
                exerciseName,
                muscleGroup: muscleGroup || null,
                targetWeight: cleanWeight,
                targetReps: cleanReps,
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
