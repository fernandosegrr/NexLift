import net from 'node:net';
import { stageHome, databaseURL } from './environment.mjs';
import { loadState, assertTarget } from './identity.mjs';
import { installEgressGuard } from './egress.mjs';
import { assertSchemaReady } from '../deploy/releaseGate.js';

try {
    const root = stageHome(), state = await loadState(root);
    if (!state.ready || process.env.NEXLIFT_RELEASE_DATABASE_URL !== databaseURL(state, 'runtime', 'app')) throw new Error('Invalid staging runtime configuration');
    await assertTarget(state, 'runtime');
    // Admin credential is used only by the local identity check above. The app
    // receives its separate DML role and cannot alter tables or migration history.
    process.env.DATABASE_URL = databaseURL(state, 'runtime', 'app');
    installEgressGuard();
    const { startServer } = await import('../src/index.js');
    await startServer({ schemaCheck: assertSchemaReady, host: '127.0.0.1' });
    const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\nexlift-stage-${state.id}` : `${root}/nexlift-stage-${state.id}.sock`;
    const control = net.createServer(socket => {
        let input = '', handled = false; socket.setTimeout(2000, () => socket.destroy());
        socket.on('error', () => {});
        socket.on('data', data => {
            input += data;
            if (input.length > 512) { socket.destroy(); return; }
            if (handled || !input.includes('\n')) return;
            handled = true;
            try {
                const request = JSON.parse(input);
                if (request.secret !== state.controlSecret || !['status', 'stop'].includes(request.command)) { socket.destroy(); return; }
                socket.end(JSON.stringify({ id: state.id, ready: true, pid: process.pid }));
                if (request.command === 'stop') { control.close(); process.emit('SIGTERM'); }
            } catch { socket.destroy(); }
        });
    });
    control.listen(socketPath);
    process.once('SIGTERM', () => control.close()); process.once('SIGINT', () => control.close());
} catch {
    process.stderr.write('{"event":"staging_start_blocked"}\n'); process.exitCode = 1;
}
