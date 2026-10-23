import { exportBackup } from '../services/backupExport.js';
import { restoreBackup } from '../services/backupRestore.js';
import { BackupError } from '../services/backupFormat.js';

const respondError = (res, error) => res.status(error instanceof BackupError ? error.status : 500).json({
    ok: false, success: false, error: error instanceof BackupError ? error.message : 'Falló el respaldo; no se entregó un archivo parcial.',
    ...(error instanceof BackupError ? error.details : {})
});
export const createExportBackupHandler = ({ prisma }) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await exportBackup(prisma, req.userId)); } catch (e) { respondError(res, e); }
};
export const createImportBackupHandler = ({ prisma }) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const allowed = ['dryRun', 'allowIncomplete', 'restoreProfile'];
        if (Object.entries(req.query).some(([key, value]) => !allowed.includes(key) || !['true', 'false'].includes(value))) throw new BackupError('Opciones de importación inválidas; use true o false y nombres documentados.', 400);
        const options = {
            dryRun: req.query.dryRun === 'true', allowIncomplete: req.query.allowIncomplete === 'true', restoreProfile: req.query.restoreProfile === 'true'
        };
        res.json(await restoreBackup(prisma, req.body, req.userId, options));
    } catch (e) { respondError(res, e); }
};
