// Opt-in disposable rehearsal ONLY. No migrations, no shell, one HTTP process.
import { rehearsalConfig } from './rehearsal-config.js';
import { assertSchemaReady } from './releaseGate.js';
import { operationalLog } from '../src/operations/telemetry.js';

try {
    const config = rehearsalConfig();
    process.env.DATABASE_URL = config.url;
    process.env.PORT = String(config.port);
    // Dynamic import: configuration is validated before creating clients/timers.
    const { startServer } = await import('../src/index.js');
    await startServer({ schemaCheck: assertSchemaReady, host: config.host });
} catch {
    operationalLog({ event: 'rehearsal_start_blocked', category: 'configuration_or_dependency' });
    process.exitCode = 1;
}
