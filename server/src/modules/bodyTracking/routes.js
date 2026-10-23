import { mexicoCityDayBounds } from '../../logic.js';
import { resolveTargetDate } from '../../logic.js';
import { sanitizeBodyMetrics } from './validation.js';

export function registerRoutes(app, { prisma, authMiddleware, uploadPhoto , console }) {
app.get('/api/body/logs', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 90;

        const logs = await prisma.bodyLog.findMany({
            where: { userId: req.userId },
            orderBy: { date: 'desc' },
            take: Math.min(limit, 500)
        });

        // Map photoUrl to photo for frontend. Cadena vacía ≠ null en Prisma y
        // se colaba como tile roto en la galería (caso real post-migración).
        const mappedLogs = logs.map(log => ({
            ...log,
            photo: (log.photoUrl && String(log.photoUrl).trim()) || null,
            photoUrl: (log.photoUrl && String(log.photoUrl).trim()) || null
        }));

        res.json(mappedLogs);
    } catch (error) {
        console.error('Error fetching body logs:', error);
        res.status(500).json({ error: 'Failed to fetch body logs' });
    }
});

app.get('/api/body/checkin', authMiddleware, async (req, res) => {
    try {
        const targetStart = resolveTargetDate(req.query.date);
        const dayBounds = mexicoCityDayBounds(targetStart);
        const logs = await prisma.bodyLog.findMany({
            where: {
                userId: req.userId,
                date: { gte: dayBounds.start, lt: dayBounds.end }
            },
            select: { creatineTaken: true, dietCompliant: true, zeroLiquidCalories: true }
        });
        res.json({
            date: dayBounds.dateStr,
            creatineTaken: logs.some(b => !!b.creatineTaken),
            dietCompliant: logs.some(b => !!b.dietCompliant),
            zeroLiquidCalories: logs.some(b => !!b.zeroLiquidCalories)
        });
    } catch (error) {
        console.error('Error fetching daily checkin:', error);
        res.status(500).json({ error: 'Failed to fetch daily check-in' });
    }
});

app.put('/api/body/checkin', authMiddleware, async (req, res) => {
    try {
        const { creatineTaken, dietCompliant, zeroLiquidCalories, date } = req.body || {};
        const targetStart = resolveTargetDate(date);
        const dayBounds = mexicoCityDayBounds(targetStart);
        const todayBounds = mexicoCityDayBounds();

        const existingLogs = await prisma.bodyLog.findMany({
            where: {
                userId: req.userId,
                date: { gte: dayBounds.start, lt: dayBounds.end }
            },
            orderBy: { date: 'desc' }
        });

        const nextCreatine = typeof creatineTaken === 'boolean'
            ? creatineTaken
            : existingLogs.some(b => !!b.creatineTaken);
        const nextDiet = typeof dietCompliant === 'boolean'
            ? dietCompliant
            : existingLogs.some(b => !!b.dietCompliant);
        const nextZeroLiquid = typeof zeroLiquidCalories === 'boolean'
            ? zeroLiquidCalories
            : existingLogs.some(b => !!b.zeroLiquidCalories);

        if (existingLogs.length > 0) {
            await prisma.bodyLog.updateMany({
                where: {
                    userId: req.userId,
                    date: { gte: dayBounds.start, lt: dayBounds.end }
                },
                data: {
                    creatineTaken: nextCreatine,
                    dietCompliant: nextDiet,
                    zeroLiquidCalories: nextZeroLiquid
                }
            });
        } else {
            const logDate = dayBounds.start.getTime() === todayBounds.start.getTime()
                ? new Date()
                : new Date(dayBounds.start.getTime() + 12 * 60 * 60 * 1000);
            await prisma.bodyLog.create({
                data: {
                    userId: req.userId,
                    date: logDate,
                    creatineTaken: nextCreatine,
                    dietCompliant: nextDiet,
                    zeroLiquidCalories: nextZeroLiquid
                }
            });
        }

        res.json({
            date: dayBounds.dateStr,
            creatineTaken: nextCreatine,
            dietCompliant: nextDiet,
            zeroLiquidCalories: nextZeroLiquid
        });
    } catch (error) {
        console.error('Error updating daily checkin:', error);
        res.status(500).json({ error: 'Failed to update daily check-in' });
    }
});

app.post('/api/body/log', authMiddleware, async (req, res) => {
    try {
        const {
            weight, photo, note, bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein,
            creatineTaken, dietCompliant, zeroLiquidCalories
        } = req.body;
        const hasPhoto = !!photo;

        const { clean: cleanMetrics, error: metricsError } = sanitizeBodyMetrics({ weight, bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein });
        if (metricsError) return res.status(400).json({ error: metricsError });
        const hasNonPhotoData = Object.values(cleanMetrics).some(v => v != null);
        const hasHabitData = typeof creatineTaken === 'boolean' || typeof dietCompliant === 'boolean' || typeof zeroLiquidCalories === 'boolean';

        if (!hasNonPhotoData && !hasPhoto && !hasHabitData) {
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
        if (photoFailed && !hasNonPhotoData && !hasHabitData) {
            return res.status(502).json({ error: 'No se pudo subir la foto. Intenta de nuevo.' });
        }

        // Preservar los hábitos ya marcados hoy en CDMX (y si hoy solo existía un
        // registro de hábitos sin peso/foto, actualizarlo en vez de duplicar fila).
        const todayBounds = mexicoCityDayBounds();
        const todayLogs = await prisma.bodyLog.findMany({
            where: {
                userId: req.userId,
                date: { gte: todayBounds.start, lt: todayBounds.end }
            },
            orderBy: { date: 'desc' }
        });

        const mergedHabits = {
            creatineTaken: typeof creatineTaken === 'boolean' ? creatineTaken : todayLogs.some(b => !!b.creatineTaken),
            dietCompliant: typeof dietCompliant === 'boolean' ? dietCompliant : todayLogs.some(b => !!b.dietCompliant),
            zeroLiquidCalories: typeof zeroLiquidCalories === 'boolean' ? zeroLiquidCalories : todayLogs.some(b => !!b.zeroLiquidCalories)
        };

        const habitOnlyLog = todayLogs.find(b =>
            b.weight == null && !b.photoUrl && b.bmi == null && b.bodyFat == null && b.muscleMass == null
        );

        let bodyLog;
        if (habitOnlyLog) {
            bodyLog = await prisma.bodyLog.update({
                where: { id: habitOnlyLog.id },
                data: {
                    photoUrl: photoUrl ?? habitOnlyLog.photoUrl,
                    note: note || habitOnlyLog.note || null,
                    ...cleanMetrics,
                    ...mergedHabits
                }
            });
        } else {
            bodyLog = await prisma.bodyLog.create({
                data: {
                    userId: req.userId,
                    photoUrl,
                    note: note || null,
                    ...cleanMetrics,
                    ...mergedHabits
                }
            });
        }

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

app.get('/api/body/photos', authMiddleware, async (req, res) => {
    try {
        const photos = await prisma.bodyLog.findMany({
            where: {
                userId: req.userId,
                photoUrl: { not: null },
                NOT: { photoUrl: '' }
            },
            select: {
                id: true,
                date: true,
                photoUrl: true,
                weight: true,
                note: true
            },
            orderBy: { date: 'desc' },
            take: 50
        });

        // Defensa extra: trim / hosts vacíos
        const mappedPhotos = photos
            .filter(p => p.photoUrl && String(p.photoUrl).trim().startsWith('http'))
            .map(p => ({
                id: p.id,
                date: p.date,
                photo: p.photoUrl.trim(),
                weight: p.weight,
                note: p.note
            }));

        res.json(mappedPhotos);
    } catch (error) {
        console.error('Error fetching photos:', error);
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

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

}
