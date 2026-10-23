import { performance } from 'node:perf_hooks';
import { once } from 'node:events';
import { createRuntime } from '../../src/app/runtime.js';
import { fakeProviders } from './phase7-providers.js';
const framework = process.argv[2];
if (!['express', 'fastify'].includes(framework)) throw new Error('Synthetic framework benchmark required');
const start = performance.now();
const runtime = createRuntime({ prisma: {}, config: { jwtSecret: 'synthetic-benchmark', nodeEnv: 'test' }, providers: fakeProviders() });
const app = framework === 'express' ? (await import('../../src/app/createExpressApp.js')).createExpressApp({ runtime })
    : await (await import('../../build/app/createApp.js')).createApp({ runtime });
let server;
if (framework === 'express') { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); }
else { await app.listen({ host: '127.0.0.1', port: 0 }); server = app.server; }
const startupMs = performance.now() - start;
for (let i = 0; i < 200; i++) { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/health`); if (r.status !== 200) throw new Error('Health failed'); await r.arrayBuffer(); }
global.gc?.();
const memory = process.memoryUsage(), close = performance.now();
if (framework === 'fastify') await app.close(); else { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
await runtime.stopBackground();
console.log(JSON.stringify({ framework, scenario: 'independent process, full route graph, mock database, 200 health warmups',
    node: process.versions.node, startupMs, memory, closeMs: performance.now() - close }));
