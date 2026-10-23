import { registerRoutes as auth } from '../modules/auth/routes.js';
import { registerRoutes as routines } from '../modules/routines/routes.js';
import { registerRoutes as mesocycles } from '../modules/mesocycles/routes.js';
import { registerRoutes as exercises } from '../modules/exercises/routes.js';
import { registerRoutes as ai } from '../modules/ai/routes.js';
import { registerRoutes as workouts } from '../modules/workouts/routes.js';
import { registerRoutes as operations } from '../modules/operations/routes.js';
import { registerRoutes as shortcuts } from '../modules/shortcuts/routes.js';
import { registerRoutes as notifications } from '../modules/notifications/routes.js';
import { registerRoutes as training } from '../modules/training/routes.js';
import { registerRoutes as bodyTracking } from '../modules/bodyTracking/routes.js';
import { registerRoutes as goals } from '../modules/goals/routes.js';
import { registerRoutes as backups } from '../modules/backups/routes.js';
import { registerRoutes as coach } from '../modules/coach/routes.js';
import { createHash } from 'node:crypto';
import { authInputError } from '../modules/auth/validation.js';

export function buildRoutes(services) {
    const routes = [];
    for (const [domain, register] of Object.entries({ auth, routines, mesocycles, exercises, ai, workouts, operations,
        shortcuts, notifications, training, bodyTracking, goals, backups, coach })) {
        const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (path, ...handlers) => {
            const handler = handlers.pop();
            if (typeof handler !== 'function' || handlers.some(guard => !['auth', 'rate'].includes(guard?.kind))) throw new Error('Invalid route definition');
            routes.push({ domain, method: method.toUpperCase(), path, guards: handlers, handler });
        }]));
        register(app, { ...services, authMiddleware: { kind: 'auth' }, rateLimit: (policy = {}) => ({ kind: 'rate', policy }) });
    }
    const keys = routes.map(r => `${r.method} ${r.path}`);
    const expensive = new Map([
        ['/api/auth/avatar', 12], ['/api/routines/import', 12], ['/api/backup/import', 6], ['/api/backup/run', 6],
        ['/api/backup/export', 12], ['/api/push/subscribe', 30], ['/api/push/test-creatine', 6],
        ['/api/ai-routine/setup', 12], ['/api/ai-routine/reshuffle/:routineDayId', 12], ['/api/body', 60], ['/api/body/log', 60]
    ]);
    for (const route of routes) {
        if (route.domain === 'auth') {
            const original = route.handler;
            route.handler = (req, res) => authInputError(route.path, req.body)
                ? res.status(400).json({ error: 'Campos requeridos o formato inválido' }) : original(req, res);
        }
        if (expensive.has(route.path) && (route.method !== 'GET' || route.path === '/api/backup/export')) {
            const max = expensive.get(route.path);
            for (const identity of ['owner', 'origin']) route.guards.push({ kind: 'rate', policy: { max, keyFn: req =>
                `cost:${route.method}:${route.path}:${identity}:${identity === 'owner' ? req.userId : req.ip}` } });
        }
        if (route.path === '/api/auth/login' || route.path.startsWith('/api/auth/recover/')) {
            route.guards.push({ kind: 'rate', policy: { max: route.path === '/api/auth/login' ? 30 : 5,
                windowMs: 30 * 60 * 1000, keyFn: req => {
                    const name = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
                    return `identity:${route.path}:${createHash('sha256').update(name.slice(0, 254)).digest('hex')}`;
                } } });
        }
    }
    if (new Set(keys).size !== keys.length) throw new Error('Duplicate route definition');
    // Fail closed: a new public endpoint must be explicitly reviewed here.
    const publicRoutes = new Set(['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/recover/question', 'POST /api/auth/recover/verify']);
    for (const route of routes) if (!route.guards.some(guard => guard.kind === 'auth') && !publicRoutes.has(`${route.method} ${route.path}`)) throw new Error('Missing authentication guard');
    return routes;
}
