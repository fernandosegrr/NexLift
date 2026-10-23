import type { HttpResult, RatePolicy, RequestInput } from './contracts.js';

// Exact legacy window/key/count semantics; each runtime owns its store. Expired
// entries are swept lazily, so constructing apps creates no interval/process.
export function createRateLimiter(now: () => number = Date.now): (input: RequestInput, policy: RatePolicy) => HttpResult | undefined {
    const store = new Map<string, { count: number; resetAt: number }>();
    let nextSweep = now() + 15 * 60 * 1000;
    return (input, { windowMs = 15 * 60 * 1000, max = 12, keyFn }) => {
        const time = now();
        if (time >= nextSweep) {
            for (const [key, entry] of store) if (time > entry.resetAt) store.delete(key);
            nextSweep = time + 15 * 60 * 1000;
        }
        const key = keyFn ? keyFn(input) : `${input.ip}:${input.path}`;
        const entry = store.get(key);
        if (!entry && store.size >= 50000) return { status: 429, headers: { 'Retry-After': '60' }, body: { error: 'Demasiados intentos. Espera 1 min.' } };
        if (!entry || time > entry.resetAt) { store.set(key, { count: 1, resetAt: time + windowMs }); return; }
        if (++entry.count > max) {
            const retrySec = Math.ceil((entry.resetAt - time) / 1000);
            return { status: 429, headers: { 'Retry-After': String(retrySec) },
                body: { error: `Demasiados intentos. Espera ${Math.ceil(retrySec / 60)} min.` } };
        }
    };
}
