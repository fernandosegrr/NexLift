import { ECDH } from 'node:crypto';
const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
export function validPushEndpoint(value, nodeEnv) {
    if (typeof value !== 'string' || value.length > 2048) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port
            && (hosts.includes(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
                || (nodeEnv === 'test' && url.hostname === 'synthetic.invalid'));
    } catch { return false; }
}
export function validPushKeys(keys) {
    const decode = (value, size) => typeof value === 'string' && value.length <= 90 && /^[A-Za-z0-9_-]+={0,2}$/.test(value)
        && Buffer.from(value, 'base64url').length === size;
    if (!decode(keys?.p256dh, 65) || Buffer.from(keys.p256dh, 'base64url')[0] !== 4 || !decode(keys?.auth, 16)) return false;
    try { ECDH.convertKey(Buffer.from(keys.p256dh, 'base64url'), 'prime256v1'); return true; } catch { return false; }
}
