import { operationalLog } from '../../operations/telemetry.js';

export function installProcessShutdown({ closeHttp, forceClose, runtime, signals = process, exit = code => process.exit(code), timeoutMs = 10000 }) {
    let pending;
    const shutdown = () => {
        if (pending) return pending;
        runtime.markClosing();
        pending = (async () => {
            const deadline = setTimeout(() => { forceClose?.(); exit(1); }, timeoutMs); deadline.unref?.();
            try {
                await closeHttp();
                await runtime.stopBackground();
                await runtime.prisma.$disconnect();
                signals.off('SIGTERM', shutdown); signals.off('SIGINT', shutdown);
                operationalLog({ event: 'shutdown_complete', category: 'lifecycle' });
                exit(0);
            } catch {
                operationalLog({ event: 'shutdown_failed', category: 'internal' }); exit(1);
            } finally { clearTimeout(deadline); }
        })();
        return pending;
    };
    signals.on('SIGTERM', shutdown); signals.on('SIGINT', shutdown);
    return shutdown;
}
