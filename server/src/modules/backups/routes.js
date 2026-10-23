import { operationalLog } from '../../operations/telemetry.js';
import { createExportBackupHandler } from '../../routes/backup.js';
import { createImportBackupHandler } from '../../routes/backup.js';

export function registerRoutes(app, { prisma, authMiddleware, runBackupForUser, CLOUDINARY_CONFIGURED , console }) {
app.post('/api/backup/run', authMiddleware, async (req, res) => {
    if (!CLOUDINARY_CONFIGURED) {
        return res.status(503).json({ error: 'Backup no configurado: faltan credenciales de Cloudinary' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, username: true } });
        const { stored, retention } = await runBackupForUser(user);
        res.json({ ok: true, lastBackupAt: new Date().toISOString(), ...stored, retention, prunedCount: retention.deleted, keptCount: retention.kept });
    } catch (error) {
        console.error('Error en backup manual:', error.message);
        res.status(500).json({ error: 'Failed to run backup' });
    }
});

app.get('/api/backup/export', authMiddleware, createExportBackupHandler({ prisma }));

app.post('/api/backup/import', authMiddleware, createImportBackupHandler({ prisma }));

app.get('/api/backup/status', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { lastBackupAt: true, lastBackupError: true } });
        res.set('Cache-Control', 'no-store');
        res.json({ configured: CLOUDINARY_CONFIGURED, lastBackupAt: user?.lastBackupAt ?? null, hasBackupError: !!user?.lastBackupError });
    } catch {
        operationalLog({ event: 'backup_status_failed', category: 'internal', requestId: req.requestId, status: 500 });
        res.status(500).json({ error: 'No se pudo consultar el estado del respaldo' });
    }
});

}
