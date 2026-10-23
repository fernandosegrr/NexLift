import { mexicoCityDateStr } from '../../logic.js';
import { mexicoCityDayBounds } from '../../logic.js';
import { mexicoCityHour } from '../../logic.js';
import { evaluateCreatineReminderStage } from '../../logic.js';
import { operationalLog } from '../../operations/telemetry.js';
import { validPushEndpoint } from './subscriptions.js';
import { randomBytes } from 'node:crypto';

export function createNotificationService({ prisma, VAPID_CONFIGURED, webpush , console, config }) {
const active = new Set();
const schedules = new Map();
let stopping = false, deliveryPaused = false;
const track = (fn, ...args) => {
    const task = Promise.resolve().then(() => fn(...args)).catch(() => console.error());
    active.add(task); task.then(() => active.delete(task), () => active.delete(task));
    return task;
};
async function sendPushToUser(userId, payload, deadline = Date.now() + 24000) {
    if (stopping || deliveryPaused || !VAPID_CONFIGURED) return 0;
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    const content = typeof payload === 'string' ? JSON.parse(payload) : payload;
    let accepted = 0;
    for (const sub of subs) {
        if (stopping || deliveryPaused || Date.now() >= deadline) break;
        if (!validPushEndpoint(sub.endpoint, config.nodeEnv)) continue;
        // Re-check ownership after awaited work: logout/reassignment may have
        // removed this device while another provider request was in flight.
        if (!await prisma.pushSubscription.findFirst({ where: { id: sub.id, userId, p256dh: sub.p256dh, auth: sub.auth } })) continue;
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, creatineReminderEnabled: true } });
        if (!user?.isActive || (content?.type === 'creatine' && !user.creatineReminderEnabled)) continue;
        if (content?.type === 'creatine') {
            const bounds = mexicoCityDayBounds(new Date());
            if (await prisma.bodyLog.findFirst({ where: { userId, creatineTaken: true, date: { gte: bounds.start, lt: bounds.end } } })) continue;
        }
        if (stopping || deliveryPaused) break;
        try {
            const send = () => webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                typeof payload === 'string' ? payload : JSON.stringify(payload),
                { TTL: 300, timeout: Math.min(10000, Math.max(1, deadline - Date.now())) }
            );
            try { await send(); }
            catch (error) {
                // Retry only an explicit provider refusal; a timeout may already
                // have been accepted. Never duplicate an ambiguous attempt.
                const retry = Number(error.headers?.['retry-after'] ?? '1');
                if (![429, 503].includes(error.statusCode) || !Number.isFinite(retry) || retry < 0 || retry > 2 || Date.now() + retry * 1000 >= deadline) throw error;
                operationalLog({ event: 'push_retry', category: 'provider', module: 'notifications' });
                await new Promise(resolve => { setTimeout(resolve, retry * 1000); });
                if (stopping || deliveryPaused || !await prisma.pushSubscription.findFirst({ where: { id: sub.id, userId, p256dh: sub.p256dh, auth: sub.auth } })) continue;
                const current = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, creatineReminderEnabled: true } });
                if (!current?.isActive || (content?.type === 'creatine' && !current.creatineReminderEnabled)) continue;
                if (content?.type === 'creatine') {
                    const bounds = mexicoCityDayBounds(new Date());
                    if (await prisma.bodyLog.findFirst({ where: { userId, creatineTaken: true, date: { gte: bounds.start, lt: bounds.end } } })) continue;
                }
                if (stopping || deliveryPaused || Date.now() >= deadline) continue;
                await send();
            }
            accepted++;
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                // Subscripción expirada/inválida: se limpia sola
                await prisma.pushSubscription.deleteMany({ where: { id: sub.id, userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth } }).catch(() => {});
                operationalLog({ event: 'push_expired', category: 'provider', module: 'notifications' });
            } else {
                operationalLog({ event: 'push_failed', category: 'provider', module: 'notifications' });
            }
        }
    }
    return accepted; // Provider acceptance only, never proof of user delivery.
}

const pendingRestReminders = new Map();

async function firePendingReminder(userId, exerciseId, exerciseName, nextExerciseName, expected) {
    const key = `${userId}:${exerciseId}`;
    if (!expected || pendingRestReminders.get(key)?.id === expected.id) pendingRestReminders.delete(key);
    if (stopping || deliveryPaused) return;
    try {
        if (!expected) expected = await prisma.pendingReminder.findUnique({ where: { userId_exerciseId: { userId, exerciseId } } });
        if (!expected) return;
        if (expected.fireAt.getTime() > Date.now()) {
            const timeout = setTimeout(() => { void track(firePendingReminder, userId, exerciseId, exerciseName, nextExerciseName, expected); },
                Math.min(expected.fireAt.getTime() - Date.now(), 2147483647));
            timeout.unref?.(); pendingRestReminders.set(key, { timer: timeout, id: expected.id }); return;
        }
        const owned = await prisma.exercise.findFirst({ where: { id: exerciseId, routineDay: { routine: { userId } } } });
        if (!owned || stopping || deliveryPaused) return;
        await prisma.$transaction(async tx => {
        const deadline = Date.now() + 24000;
        // A conditional no-op UPDATE locks this exact generation until provider
        // attempt + retirement commit. A crash before sending rolls back and
        // leaves the event restorable; competing processes cannot both claim it.
        const where = { id: expected.id, userId, exerciseId, fireAt: expected.fireAt };
        const claimed = await tx.pendingReminder.updateMany({ where, data: { fireAt: expected.fireAt } });
        if (claimed.count !== 1 || stopping || deliveryPaused) return;
        // Si la serie que se acaba de completar era la última de este ejercicio,
        // el descanso es para el ejercicio SIGUIENTE, no este.
        const body = 'Tu descanso terminó. Abre NexLift para continuar.';
        await sendPushToUser(userId, JSON.stringify({
            title: 'Descanso terminado',
            body,
            exerciseId, eventId: expected.id
        }), deadline);
        if (stopping || deliveryPaused) throw new Error('Delivery paused');
        await tx.pendingReminder.deleteMany({ where });
        }, { maxWait: 5000, timeout: 30000 });
    } catch (err) {
        console.error('Error in scheduleRestReminder:', err.message);
    }
}

async function scheduleRestReminder(userId, exercise, nextExerciseName) {
    if (!VAPID_CONFIGURED) return; // feature no configurada: no-op, no rompe el flujo de logging

    // Si se completan 2+ series casi juntas (ej. registrando series olvidadas de
    // golpe), cada una llama esta función — sin esto, cada llamada agendaba su
    // propio setTimeout independiente y el usuario recibía un push por cada una.
    // Cancelar el pendiente de la misma clave colapsa la ráfaga en un solo aviso,
    // contado desde la serie más reciente.
    const key = `${userId}:${exercise.id}`;
    const existingTimeout = pendingRestReminders.get(key);
    if (existingTimeout) clearTimeout(existingTimeout.timer);

    const restMs = (exercise.restSeconds || 90) * 1000;
    if (!Number.isFinite(restMs) || restMs <= 0 || restMs > 86400000) return;
    const fireAt = new Date(Date.now() + restMs);

    // Persistir ANTES de agendar el setTimeout: si el proceso muere entre este
    // punto y que dispare, restorePendingReminders() lo recupera al reiniciar
    // leyendo esta fila. El @@unique([userId, exerciseId]) hace que esto sea un
    // upsert-reemplazo, igual que el clearTimeout de arriba para el Map en memoria.
    let reminder;
    const generation = `nx4_${randomBytes(16).toString('hex')}`;
    try {
        reminder = await prisma.pendingReminder.upsert({
            where: { userId_exerciseId: { userId, exerciseId: exercise.id } },
            create: { id: generation, userId, exerciseId: exercise.id, fireAt, nextExerciseName: nextExerciseName || null },
            update: { id: generation, fireAt, nextExerciseName: nextExerciseName || null }
        });
    } catch (err) {
        console.error('Error guardando recordatorio pendiente:', err.message);
        return false;
    }
    if (stopping || deliveryPaused) return reminder;

    const timeout = setTimeout(() => {
        void track(firePendingReminder, userId, exercise.id, exercise.name, nextExerciseName, reminder);
    }, Math.max(0, fireAt.getTime() - Date.now()));
    timeout.unref?.();
    pendingRestReminders.set(key, { timer: timeout, id: reminder.id });
    return reminder;
}

async function cancelRestReminder(userId, reminderId, fireAt) {
    const where = { id: reminderId, userId, fireAt };
    const row = await prisma.pendingReminder.findFirst({ where });
    if (!row) return false;
    const removed = await prisma.pendingReminder.deleteMany({ where });
    if (removed.count === 1) {
        const key = `${userId}:${row.exerciseId}`, entry = pendingRestReminders.get(key);
        if (entry?.id === reminderId) { clearTimeout(entry.timer); pendingRestReminders.delete(key); }
    }
    return removed.count === 1;
}

async function restorePendingReminders() {
    if (!VAPID_CONFIGURED || stopping || deliveryPaused) return;
    try {
        const pending = await prisma.pendingReminder.findMany({ include: { exercise: true } });
        if (pending.length === 0) return;

        const FIVE_MIN_MS = 5 * 60 * 1000;
        const now = Date.now();
        let rescheduled = 0, firedNow = 0, discarded = 0;

        for (const reminder of pending) {
            if (stopping || deliveryPaused) break;
            const delay = reminder.fireAt.getTime() - now;
            const key = `${reminder.userId}:${reminder.exerciseId}`;

            if (delay > 0) {
                clearTimeout(pendingRestReminders.get(key)?.timer);
                const timeout = setTimeout(() => {
                    void track(firePendingReminder, reminder.userId, reminder.exerciseId, reminder.exercise.name, reminder.nextExerciseName, reminder);
                }, Math.min(delay, 2147483647));
                timeout.unref?.();
                pendingRestReminders.set(key, { timer: timeout, id: reminder.id });
                rescheduled++;
            } else if (delay > -FIVE_MIN_MS) {
                await firePendingReminder(reminder.userId, reminder.exerciseId, reminder.exercise.name, reminder.nextExerciseName, reminder);
                firedNow++;
            } else {
                await prisma.pendingReminder.deleteMany({ where: { id: reminder.id, fireAt: reminder.fireAt } }).catch(() => {});
                discarded++;
            }
        }
        console.log(`🔔 Recordatorios de descanso al arrancar: ${rescheduled} reagendado(s), ${firedNow} disparado(s) de inmediato, ${discarded} descartado(s) por viejos.`);
        operationalLog({ event: 'reminders_restored', category: 'lifecycle', module: 'notifications', count: rescheduled + firedNow });
    } catch (err) {
        console.error('Error restaurando recordatorios de descanso:', err.message);
    }
}

const REENGAGEMENT_INACTIVE_DAYS = 3;

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
    if (!VAPID_CONFIGURED || stopping || deliveryPaused) return;
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

            if (stopping || deliveryPaused || !await prisma.pushSubscription.count({ where: { userId: user.id } })) continue;
            await prisma.$transaction(async tx => {
            const deadline = Date.now() + 24000;
            const claim = await tx.user.updateMany({ where: { id: user.id, isActive: true, lastReengagementNotifiedAt: user.lastReengagementNotifiedAt },
                data: { lastReengagementNotifiedAt: now } });
            if (claim.count !== 1) return;
            if (stopping || deliveryPaused) throw new Error('Delivery paused');

            const sent = await sendPushToUser(user.id, JSON.stringify({
                title: '¿No vas a entrenar hoy?',
                body: 'Abre NexLift cuando quieras retomar tu entrenamiento.', tag: `reengagement-${todayStr}`, eventId: `reengagement-${todayStr}`
            }), deadline);
            if (sent === 0) throw new Error('Provider did not accept reminder');
            }, { maxWait: 5000, timeout: 30000 });

        }
    } catch (err) {
        console.error('Error checking re-engagement reminders:', err.message);
    }
}

async function checkCreatineReminders() {
    if (!VAPID_CONFIGURED || stopping || deliveryPaused) return;
    try {
        const now = new Date();
        const todayBounds = mexicoCityDayBounds(now);

        const users = await prisma.user.findMany({
            where: { isActive: true, creatineReminderEnabled: true },
            select: {
                id: true,
                creatineReminderTime: true,
                lastCreatineReminderDate: true,
                lastCreatineReminderStage: true
            }
        });

        for (const user of users) {
            const todayLogs = await prisma.bodyLog.findMany({
                where: {
                    userId: user.id,
                    date: { gte: todayBounds.start, lt: todayBounds.end }
                },
                select: { creatineTaken: true }
            });

            if (todayLogs.some(b => !!b.creatineTaken)) {
                continue; // Ya registró su creatina hoy en CDMX
            }

            const nextReminder = evaluateCreatineReminderStage(
                now,
                user.creatineReminderTime || '16:00',
                user.lastCreatineReminderDate,
                user.lastCreatineReminderStage
            );
            if (!nextReminder) continue;

            if (stopping || deliveryPaused || !await prisma.pushSubscription.count({ where: { userId: user.id } })) continue;
            await prisma.$transaction(async tx => {
            const deadline = Date.now() + 24000;
            const claim = await tx.user.updateMany({ where: { id: user.id, isActive: true, creatineReminderEnabled: true,
                lastCreatineReminderDate: user.lastCreatineReminderDate, lastCreatineReminderStage: user.lastCreatineReminderStage,
                bodyLogs: { none: { date: { gte: todayBounds.start, lt: todayBounds.end }, creatineTaken: true } } },
                data: { lastCreatineReminderDate: nextReminder.dateStr, lastCreatineReminderStage: nextReminder.stage } });
            if (claim.count !== 1) return;
            if (stopping || deliveryPaused) throw new Error('Delivery paused');

            const sent = await sendPushToUser(user.id, JSON.stringify({
                title: nextReminder.title,
                body: nextReminder.body,
                tag: nextReminder.tag,
                type: 'creatine',
                eventId: `creatine-${nextReminder.dateStr}-${nextReminder.stage}`,
                url: nextReminder.url || '/'
            }), deadline);
            if (sent === 0) throw new Error('Provider did not accept reminder');
            }, { maxWait: 5000, timeout: 30000 });

        }
    } catch (err) {
        console.error('Error checking creatine reminders:', err.message);
    }
}

const cancelPending = () => { for (const entry of pendingRestReminders.values()) clearTimeout(entry.timer); pendingRestReminders.clear(); };
const schedule = (userId, exercise, nextExerciseName) => {
    if (stopping) return Promise.resolve();
    const key = `${userId}:${exercise.id}`, previous = schedules.get(key) ?? Promise.resolve();
    // The legacy timer check precedes an awaited SQL upsert. Serialize only the
    // same reminder key so concurrent calls cannot both install live timers.
    const task = track(async () => { await previous; return scheduleRestReminder(userId, exercise, nextExerciseName); });
    schedules.set(key, task);
    void task.then(() => { if (schedules.get(key) === task) schedules.delete(key); });
    return task;
};
return { REENGAGEMENT_INACTIVE_DAYS, sendPushToUser: (...args) => track(sendPushToUser, ...args), firePendingReminder,
    scheduleRestReminder: schedule, cancelRestReminder,
    restorePendingReminders, computeUsualGymHour, checkReengagementReminders, checkCreatineReminders, cancelPending,
    pauseDelivery: () => { deliveryPaused = true; cancelPending(); },
    stop: async () => { stopping = true; cancelPending(); await Promise.allSettled([...active]); cancelPending(); } };
}
