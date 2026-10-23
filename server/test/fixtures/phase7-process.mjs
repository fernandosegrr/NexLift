import { startFastify } from '../../src/entrypoints/fastify.mjs';
import { installEgressGuard } from '../../staging/egress.mjs';
import { operationalLog } from '../../src/operations/telemetry.js';
if (!process.send) throw new Error('IPC fixture required');
installEgressGuard();
try {
    const app = await startFastify();
    process.send({ port: app.server.address().port });
    process.on('message', message => { if (['SIGTERM', 'SIGINT'].includes(message)) process.emit(message); });
} catch {
    operationalLog({ event: 'startup_failed', category: 'configuration_or_dependency' }); process.exitCode = 1;
}
