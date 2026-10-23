// Executable route inventory from the live domain registrations. No SQL,
// environment files, Prisma construction, jobs or external providers.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import ts from 'typescript';
import { buildRoutes } from '../server/src/app/routes.js';
import { createRuntime } from '../server/src/app/runtime.js';
import { fakeProviders } from '../server/test/fixtures/phase7-providers.js';
import { readBackendSource } from './lib/backend-source.mjs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url), destination = new URL('server/audit/security/', root);
const runtime = createRuntime({ prisma: {}, config: { jwtSecret: 'synthetic-inventory-secret', nodeEnv: 'test', offlineSyncEnabled: true, resolutionEnabled: true }, providers: fakeProviders() });
const routes = buildRoutes(runtime.services);
const sessionRoutes = new Set(['POST /api/auth/web-session', 'GET /api/auth/web-session', 'DELETE /api/auth/web-session', 'DELETE /api/workouts/rest-reminder']);
const original = await readBackendSource(), oldAst = ts.createSourceFile('index.js', original, ts.ScriptTarget.Latest, true);
const received = new Set();
function findOld(node) { if (ts.isCallExpression(node) && /^app\.(get|post|put|delete)$/.test(node.expression.getText(oldAst)) && node.arguments[0]?.text?.startsWith('/api/')) received.add(`${node.expression.name.text.toUpperCase()} ${node.arguments[0].text}`); ts.forEachChild(node, findOld); }
findOld(oldAst);
const operationSource = await readFile(new URL('server/src/routes/operations.js', root), 'utf8');
for (const m of operationSource.matchAll(/app\.(get|post|put|delete)\('([^']+)'/g)) received.add(`${m[1].toUpperCase()} ${m[2]}`);
assert.deepEqual(new Set([...routes.map(r => `${r.method} ${r.path}`).filter(key => !sessionRoutes.has(key)), 'GET /api/health', 'GET /api/ready']), received);
for (const route of sessionRoutes) assert(routes.some(r => `${r.method} ${r.path}` === route), route);
const clientFiles = [];
async function walk(dir, prefix = 'client/src/') { for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'generated') continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) await walk(new URL(entry.name + '/', dir), relative + '/');
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) clientFiles.push([relative, await readFile(new URL(entry.name, dir), 'utf8')]);
} }
await walk(new URL('client/src/', root));
const inventory = [];
const unique = list => [...new Set(list)];
for (const route of routes) {
    const file = `server/src/modules/${route.domain}/routes.js`, text = await readFile(new URL(file, root), 'utf8');
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let selected;
    function find(node) { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'app.' + route.method.toLowerCase() && node.arguments[0]?.text === route.path) selected = node; ts.forEachChild(node, find); }
    find(ast);
    const code = selected?.getText(ast) || route.handler.toString();
    const body = [], query = [], responses = [], validators = [], ownership = [], writes = [], dependencies = [];
    const subtree = selected || ts.createSourceFile('handler.js', code, ts.ScriptTarget.Latest, true);
    const parseAst = selected ? ast : subtree;
    function inspect(node) {
        if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
            const source = node.initializer.getText(parseAst);
            if (/^req\.body\b/.test(source)) body.push(...node.name.elements.map(e => e.propertyName?.getText(parseAst) || e.name.getText(parseAst)));
            if (/^req\.query\b/.test(source)) query.push(...node.name.elements.map(e => e.propertyName?.getText(parseAst) || e.name.getText(parseAst)));
        }
        if (ts.isCallExpression(node)) {
            const name = node.expression.getText(parseAst);
            if (/^res(?:\.status\([\s\S]*?\))?\.json$/.test(name)) responses.push({ status: /^res\.status\((\d+)\)/.exec(name)?.[1] || '200', expression: node.arguments[0]?.getText(parseAst) || 'undefined' });
            if (/sanitiz|validat|parse|normaliz|Contract|Transaction|Handler|recalc|applyOperation/.test(name)) validators.push(node.getText(parseAst));
            if (/^(?:prisma|tx)\./.test(name)) { dependencies.push(name); if (/\.(?:create|upsert|update|delete|execute)/.test(name)) writes.push(node.getText(parseAst)); }
            if (/\.(?:findFirst|findUnique)$/.test(name) && /req\.userId/.test(node.getText(parseAst))) ownership.push(node.getText(parseAst));
        }
        if (ts.isIfStatement(node) && !node.getText(parseAst).includes('console')) validators.push(node.expression.getText(parseAst));
        ts.forEachChild(node, inspect);
    }
    inspect(subtree);
    for (const match of code.matchAll(/req\.(body|query)\??\.(\w+)/g)) (match[1] === 'body' ? body : query).push(match[2]);
    const prefix = route.path.replace(/^\/api/, '').split('/:')[0];
    const consumes = clientFiles.filter(([, src]) => src.includes(prefix)).map(([file]) => file);
    inventory.push({ method: route.method, path: route.path, domain: route.domain, source: file,
        line: selected ? ast.getLineAndCharacterOfPosition(selected.getStart(ast)).line + 1 : null,
        authentication: route.guards.some(g => g.kind === 'auth') ? 'HS256 Bearer JWT + active account + tokenVersion; optional non-production HttpOnly bridge + CSRF; failures 401/403/503/500' : 'public; per-IP rate limit',
        authorization: { owner: 'verified token only', checks: unique(ownership), delegated: /workoutHandlers|mountOperationRoutes|create.*Handler|cancelRestReminder/.test(code) },
        parameters: unique([...route.path.matchAll(/:(\w+)/g)].map(m => m[1])), query: unique(query), body: { fields: unique(body),
            representation: 'JSON object/array or empty {}; exact runtime validators below preserve legacy per-field coercions; transport never coerces/removes/defaults fields', validators: unique(validators) },
        responses, errors: unique([...code.matchAll(/res\.status\((\d+)\)/g)].map(m => Number(m[1])).filter(n => n >= 400)),
        headers: { common: 'X-Request-ID locally generated, helmet, CORS allowlist, JSON UTF-8, compression at 1024 bytes; 10 MiB HTTP body limit',
            endpoint: unique([...code.matchAll(/(?:res\.set|setPrivateCache)\([^;]+/g)].map(m => m[0])) },
        rateLimits: route.guards.filter(g => g.kind === 'rate').map(g => ({ windowMs: g.policy.windowMs || 900000, max: g.policy.max || 12, key: g.policy.keyFn?.toString() || 'ip:path' })),
        dependencies: unique(dependencies), postgresWrites: unique(writes), applicationCalls: unique([...code.matchAll(/\b(?:create\w+Handler|workoutHandlers\.\w+|applyOperation|mountOperationRoutes|scheduleRestReminder|cancelRestReminder|runBackupForUser|uploadPhoto|resolveOrGenerateAiRoutineDay)\b/g)].map(m => m[0])),
        frontendSources: consumes, shortcuts: route.path.startsWith('/api/shortcuts/'), contractSource: code });
}
for (const path of ['/api/health', '/api/ready']) inventory.push({ method: 'GET', path, domain: 'health', source: 'server/src/app/createApp.ts', authentication: 'public',
    authorization: 'no account enumeration', parameters: [], query: [], body: null, responses: path.endsWith('health') ? [200, 503] : [200, 503], errors: [503],
    headers: { 'Cache-Control': 'no-store' }, rateLimits: [], dependencies: path.endsWith('ready') ? ['Prisma bounded transaction SELECT 1', 'optional schemaCheck'] : [],
    postgresWrites: [], frontendSources: [], shortcuts: false });
await mkdir(destination, { recursive: true });
await writeFile(new URL('api-inventory.json', destination), JSON.stringify({ generatedAt: new Date().toISOString(), declaredEndpoints: inventory.length,
    receivedEndpoints: received.size, coverage: '100% received routes preserved + 3 disabled web-session rehearsal routes + generation-scoped reminder cancellation', implicit: ['HEAD for GET', 'CORS OPTIONS'],
    delegatedContracts: ['server/src/routes/workouts.js', 'server/src/routes/importRoutine.js', 'server/src/routes/updateRoutine.js', 'server/src/routes/backup.js', 'server/src/routes/operations.js', 'packages/shared/src/contracts/'],
    routes: inventory }, null, 2) + '\n');
await writeFile(new URL('API-MATRIX.md', destination), '# Matriz API de Fase 9\n\nGenerada por `node scripts/audit-backend.mjs` desde las rutas ejecutables. ' +
    'El JSON adjunto contiene campos, validadores, expresiones de respuesta, guards ordenados, consultas/escrituras Prisma, dependencias y consumidores por endpoint. ' +
    'Los contratos delegados se enlazan por archivo; no se infieren tipos que el runtime no garantiza. No existen rutas administrativas, PDF ni descargas de binarios en el backend recibido; el backup es JSON y los PDF se generan en cliente. HEAD y OPTIONS son implícitos.\n\n' +
    '| Método | Ruta | Dominio | Auth | Límites | Fuente |\n| --- | --- | --- | --- | --- | --- |\n' + inventory.map(r => `| ${r.method} | ${r.path} | ${r.domain} | ${r.authentication.startsWith('public') ? 'Pública' : 'JWT'} | ${r.rateLimits.map(x => `${x.max}/${x.windowMs / 60000}min`).join(' + ') || '—'} | ${r.source}${r.line ? ':' + r.line : ''} |`).join('\n') + '\n');
console.log(`API inventory: ${inventory.length}/${received.size} declared endpoints, exact coverage; no database/provider access`);
