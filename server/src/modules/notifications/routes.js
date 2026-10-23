import { validPushEndpoint, validPushKeys } from './subscriptions.js';
import { randomBytes } from 'node:crypto';

export function registerRoutes(app, { prisma, authMiddleware, sendPushToUser , console, config, VAPID_CONFIGURED }) {
app.get('/api/push/vapid-public-key', authMiddleware, async (req, res) => {
    res.json({ publicKey: config.vapidPublicKey || null });
});

app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        if (!validPushEndpoint(endpoint, config.nodeEnv) || !validPushKeys(keys)) {
            return res.status(400).json({ error: 'Required: endpoint, keys.p256dh, keys.auth' });
        }

        const subscription = await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: {},
            create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }
        });
        if (subscription.userId !== req.userId) return res.status(409).json({ error: 'Subscription unavailable' });
        await prisma.pushSubscription.updateMany({ where: { id: subscription.id, userId: req.userId }, data: { p256dh: keys.p256dh, auth: keys.auth } });

        res.status(201).json({ message: 'Subscribed', subscription: { id: subscription.id, userId: req.userId, createdAt: subscription.createdAt } });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

app.delete('/api/push/subscribe', authMiddleware, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 2048) {
            return res.status(400).json({ error: 'Required: endpoint' });
        }
        await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
        res.json({ message: 'Unsubscribed' });
    } catch (error) {
        console.error('Error deleting push subscription:', error);
        res.status(500).json({ error: 'Failed to delete subscription' });
    }
});

app.put('/api/push/creatine-reminder', authMiddleware, async (req, res) => {
    try {
        const { enabled, time } = req.body || {};
        const data = {};
        if (typeof enabled === 'boolean') data.creatineReminderEnabled = enabled;
        if (typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time.trim())) {
            const [hh, mm] = time.trim().split(':').map(Number);
            if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
                data.creatineReminderTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                // Reiniciar el estado del día para permitir reevaluar con la nueva hora
                data.lastCreatineReminderStage = 0;
            }
        }
        const updated = await prisma.user.update({
            where: { id: req.userId },
            data,
            select: {
                id: true,
                creatineReminderEnabled: true,
                creatineReminderTime: true
            }
        });
        res.json(updated);
    } catch (error) {
        console.error('Error updating creatine reminder:', error);
        res.status(500).json({ error: 'Failed to update creatine reminder preferences' });
    }
});

app.post('/api/push/test-creatine', authMiddleware, async (req, res) => {
    try {
        if (!VAPID_CONFIGURED) {
            return res.status(400).json({ error: 'VAPID keys no configuradas en el servidor' });
        }
        const subs = await prisma.pushSubscription.findMany({ where: { userId: req.userId } });
        if (subs.length === 0) {
            return res.status(400).json({ error: 'No hay dispositivos suscritos a notificaciones Push' });
        }
        const accepted = await sendPushToUser(req.userId, {
            title: 'NexLift — Creatina',
            body: '⚡ Hora de tu creatina (5g). Márcala en NexLift.',
            tag: 'creatine-reminder',
            eventId: randomBytes(16).toString('hex'),
            url: '/?checkin=creatine'
        });
        res.json({ ok: true, sentTo: accepted || 0, attempted: subs.length, status: accepted ? 'provider_accepted' : 'not_accepted' });
    } catch (error) {
        console.error('Error testing creatine push:', error);
        res.status(500).json({ error: 'Failed to send test push' });
    }
});

}
