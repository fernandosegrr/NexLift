import { operationalLog } from './telemetry.js';

export function createHealthHandlers({ prisma, schemaCheck, isClosing = () => false, log = operationalLog }) {
    return {
        live(req, res) {
            res.set('Cache-Control', 'no-store');
            res.status(isClosing() ? 503 : 200).json({ status: isClosing() ? 'unavailable' : 'ok', timestamp: new Date().toISOString() });
        },
        async ready(req, res) {
            res.set('Cache-Control', 'no-store');
            try {
                if (isClosing()) throw new Error('closing');
                await prisma.$transaction(async tx => {
                    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '2000ms'");
                    await tx.$queryRawUnsafe('SELECT 1');
                }, { maxWait: 2000, timeout: 3000 });
                if (schemaCheck) await schemaCheck();
                if (isClosing()) throw new Error('closing');
                res.json({ status: 'ready' });
            } catch {
                log({ event: 'readiness_failed', category: 'dependency_unavailable', requestId: req.requestId, status: 503 });
                res.status(503).json({ status: 'unavailable' });
            }
        }
    };
}
