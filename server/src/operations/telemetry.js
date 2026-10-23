import { randomUUID } from 'node:crypto';

// Callers provide only fixed events/categories. Never serialize Error, request,
// headers, paths, query strings, usernames, bodies or environment variables.
export function operationalLog({ event, category, requestId, status, module, durationMs, count }, write = line => process.stderr.write(line)) {
    const safeLabel = value => typeof value === 'string' && /^[a-z_]{1,64}$/.test(value) ? value : 'unknown';
    const record = { timestamp: new Date().toISOString(), event: safeLabel(event), category: safeLabel(category) };
    if (typeof requestId === 'string' && /^[a-f0-9-]{36}$/i.test(requestId)) record.requestId = requestId;
    if (Number.isInteger(status) && status >= 100 && status <= 599) record.status = status;
    if (module !== undefined) record.module = safeLabel(module);
    if (Number.isFinite(durationMs) && durationMs >= 0) record.durationMs = Math.round(durationMs);
    if (Number.isSafeInteger(count) && count >= 0) record.count = count;
    write(`${JSON.stringify(record)}\n`);
}
export function requestContext(req, res, next) {
    const started = performance.now();
    req.requestId = randomUUID(); // Do not trust client-supplied correlation IDs.
    res.set('X-Request-ID', req.requestId);
    res.once('finish', () => operationalLog({ event: 'http_complete', category: 'http', module: 'http',
        requestId: req.requestId, status: res.statusCode, durationMs: performance.now() - started }));
    next();
}
export function safeErrorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    operationalLog({ event: 'http_error', category: status < 500 ? 'invalid_request' : 'internal', requestId: req.requestId, status });
    res.status(status).json({ error: status < 500 ? 'Solicitud inválida' : 'Error interno del servidor' });
}
