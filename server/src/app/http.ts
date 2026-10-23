import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
const require = createRequire(import.meta.url);
// Express 4's extended parser, with identical array/nesting/string semantics.
const qs = require('qs') as { parse(input: string, options: { allowPrototypes: boolean }): Record<string, unknown> };
const iconv = require('iconv-lite') as { decode(input: Buffer, encoding: string): string; encodingExists(encoding: string): boolean };
const etag = require('etag') as (body: string | Buffer, options: { weak: boolean }) => string;
const fresh = require('fresh') as (request: Record<string, unknown>, response: Record<string, unknown>) => boolean;
export function parseQuery(value: string): Record<string, unknown> { return qs.parse(value, { allowPrototypes: true }); }
function charsetOf(type: string | undefined): string { return /charset\s*=\s*"?([^;"\s]+)/i.exec(type || '')?.[1]?.toLowerCase() ?? 'utf-8'; }

export function installHttpBoundary(app: FastifyInstance): void {
    app.addHook('onSend', async (request, reply, payload) => {
        if (reply.getHeader('Cache-Control') !== 'no-store' && (typeof payload === 'string' || Buffer.isBuffer(payload)) && String(reply.getHeader('content-type')).startsWith('application/json')) {
            const tag = reply.getHeader('etag') ?? etag(payload, { weak: true });
            reply.header('ETag', tag);
            if (['GET', 'HEAD'].includes(request.method) && reply.statusCode >= 200 && reply.statusCode < 300 && fresh(request.headers, { etag: tag })) {
                reply.code(304); reply.removeHeader('Content-Type'); reply.removeHeader('Content-Length'); reply.removeHeader('Transfer-Encoding');
                return null;
            }
        }
        return payload;
    });
    app.addHook('onRequest', async (request, reply) => {
        request.id = randomUUID();
        reply.header('X-Request-ID', request.id);
        if (Number(request.headers['content-length']) > 10 * 1024 * 1024) {
            // Drain without buffering before replying. Otherwise an early 413
            // can reset a client still transmitting its body and look offline.
            for await (const chunk of request.raw) { void chunk; }
            return reply.code(413).send({ error: 'Solicitud inválida' });
        }
        const json = /^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '');
        if (!json) delete request.headers['content-encoding']; // ignored entity, as in Express.json
        else {
            const charset = charsetOf(request.headers['content-type']), encoding = (request.headers['content-encoding'] || 'identity').toLowerCase();
            if (!charset.startsWith('utf-') || !iconv.encodingExists(charset) || !['identity', 'gzip', 'deflate'].includes(encoding)) {
                for await (const chunk of request.raw) { void chunk; }
                // Existing safeErrorHandler maps unsupported charset/encoding to
                // a generic 500. Preserve that public response, without details.
                return reply.code(500).send({ error: 'Error interno del servidor' });
            }
        }
    });
    // Express.json strict mode: JSON objects/arrays, empty entity => {}, preserve
    // every property and type. No AJV coercion/default/removal/response schemas.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
        try {
            const text = iconv.decode(body as Buffer, charsetOf(request.headers['content-type']));
            if (!text.length) { done(null, {}); return; }
            if (!/^[\x20\t\r\n]*[\[{]/.test(text)) throw new SyntaxError('Invalid JSON');
            done(null, JSON.parse(text) as unknown);
        } catch { done(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }), undefined); }
    });
    // Legacy Express ignores unrecognised media types; it does not parse forms
    // or text. Apply the same body limit while consuming and discarding bytes.
    app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, _body, done) => { done(null, {}); });
    app.setErrorHandler((error, _request, reply) => {
        const code = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
        const status = code === 413 ? 413 : code === 400 || error instanceof SyntaxError ? 400 : 500;
        void reply.code(status).send({ error: status < 500 ? 'Solicitud inválida' : 'Error interno del servidor' });
    });
}
