// Defense in depth for the dedicated staging process. Never loaded by production.
// PostgreSQL's native Prisma engine is constrained separately by generated URLs.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

export function isLoopback(host) { return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host); }
const blocked = () => { throw new Error('STAGING_EXTERNAL_NETWORK_DISABLED'); };
export function installEgressGuard({ databaseHost } = {}) {
    const allowed = host => isLoopback(host) || (databaseHost && host === databaseHost);
    for (const module of [http, https]) {
        for (const method of ['request', 'get']) {
            const original = module[method];
            module[method] = function (input, ...args) {
                const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input?.hostname || input?.host || 'localhost';
                if (!allowed(host)) blocked();
                return original.call(this, input, ...args);
            };
        }
    }
    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
        const first = Array.isArray(args[0]) ? args[0][0] : args[0];
        if (typeof first === 'object' && first.path) {
            if (!String(first.path).includes('nexlift-stage-')) blocked();
        } else {
            const host = typeof first === 'object' ? first.host || 'localhost' : typeof args[1] === 'string' ? args[1] : 'localhost';
            if (!allowed(host)) blocked();
        }
        return originalConnect.apply(this, args);
    };
    const originalTLS = tls.connect;
    tls.connect = function (...args) {
        const first = args[0];
        const host = typeof first === 'object' ? first.host || first.servername || 'localhost' : typeof args[1] === 'string' ? args[1] : 'localhost';
        if (!allowed(host)) blocked();
        return originalTLS.apply(this, args);
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function (input, options) {
        if (!allowed(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname)) return Promise.reject(new Error('STAGING_EXTERNAL_NETWORK_DISABLED'));
        return originalFetch(input, options);
    };
    syncBuiltinESMExports();
}
