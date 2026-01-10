import { uploadBase64ToCatbox } from '../utils/catbox.js';

/**
 * Body tracking routes factory
 * @param {PrismaClient} prisma
 */
export function createBodyRoutes(prisma) {
    return {
        /**
         * GET /api/body/logs
         */
        async getLogs(req, res) {
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
        },

        /**
         * POST /api/body/log
         */
        async logBody(req, res) {
            try {
                const { weight, photo, note, bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein } = req.body;

                if (!weight && !photo) {
                    return res.status(400).json({ error: 'Weight or photo required' });
                }

                // Upload photo to Catbox if it's base64
                let photoUrl = null;
                if (photo) {
                    if (photo.startsWith('data:image') || photo.length > 500) {
                        try {
                            console.log('📸 Uploading photo to Catbox...');
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
        },

        /**
         * GET /api/body
         */
        async getHistory(req, res) {
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
        },

        /**
         * GET /api/body/photos
         */
        async getPhotos(req, res) {
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
                    take: 12
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
        },

        /**
         * GET /api/body/latest
         */
        async getLatest(req, res) {
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
                console.error('Error fetching latest body log:', error);
                res.status(500).json({ error: 'Failed to fetch latest' });
            }
        }
    };
}
