import { operationalLog } from './telemetry.js';

export function installShutdown({ server, prisma, stopTimers, markClosing, timeoutMs = 10000, signals = process, exit = code => process.exit(code), log = operationalLog }) {
    let closing = false;
    const shutdown = async () => {
        if (closing) return;
        closing = true;
        markClosing();
        stopTimers(); // Pending reminders remain persisted for the next startup.
        const deadline = setTimeout(() => {
            log({ event: 'shutdown_timeout', category: 'internal' });
            server.closeAllConnections?.();
            exit(1);
        }, timeoutMs);
        deadline.unref?.();
        try {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            await prisma.$disconnect();
            clearTimeout(deadline);
            signals.off('SIGTERM', shutdown); signals.off('SIGINT', shutdown);
            log({ event: 'shutdown_complete', category: 'lifecycle' });
            exit(0);
        } catch {
            log({ event: 'shutdown_failed', category: 'internal' });
            exit(1);
        }
    };
    signals.on('SIGTERM', shutdown); signals.on('SIGINT', shutdown);
    return shutdown;
}
