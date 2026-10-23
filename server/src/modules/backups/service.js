import { exportBackup } from '../../services/backupExport.js';
import { mexicoCityDateStr } from '../../logic.js';
import { mexicoCityHour } from '../../logic.js';

export function createBackupService({ prisma, CLOUDINARY_CONFIGURED, uploadBackup, pruneOldBackups , console, config }) {
async function runBackupForUser(user) {
    const data = await exportBackup(prisma, user.id);
    const stored = await uploadBackup(data);
    const retention = await pruneOldBackups(user.id, { dryRun: !config.backupPruneEnabled });
    await prisma.user.update({ where: { id: user.id }, data: { lastBackupAt: new Date(), lastBackupError: null } });
    return { stored, retention };
}

async function runDailyBackup() {
    if (!CLOUDINARY_CONFIGURED) return { skipped: true };
    const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true } });
    const results = [];
    for (const user of users) {
        try {
            await runBackupForUser(user);
            results.push({ userId: user.id, ok: true });
        } catch (err) {
            console.error(`Error en backup diario (usuario ${user.username}):`, err.message);
            await prisma.user.update({ where: { id: user.id }, data: { lastBackupError: 'backup_failed' } }).catch(() => {});
            results.push({ userId: user.id, ok: false, error: 'backup_failed' });
        }
    }
    return { skipped: false, results };
}

let lastBackupRunDateStr = null;

async function maybeRunDailyBackup() {
    const now = new Date();
    const hour = mexicoCityHour(now);
    const todayStr = mexicoCityDateStr(now);
    if (hour !== 4 || lastBackupRunDateStr === todayStr) return;
    lastBackupRunDateStr = todayStr;
    await runDailyBackup();
}

return { runBackupForUser, runDailyBackup, maybeRunDailyBackup };
}
