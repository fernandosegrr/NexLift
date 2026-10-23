import { BlockList, isIP } from 'node:net';

// Trust addresses, never a hop count: direct callers cannot choose their IP.
export function trustedProxy(value = '') {
    const blocks = new BlockList();
    for (const item of value.split(',').map(s => s.trim()).filter(Boolean)) {
        const [address, prefix] = item.split('/'), family = isIP(address);
        if (!family || (prefix !== undefined && !/^\d+$/.test(prefix))) throw new Error('Invalid trusted proxy CIDR');
        if (prefix === undefined) blocks.addAddress(address, family === 4 ? 'ipv4' : 'ipv6');
        else blocks.addSubnet(address, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
    }
    return address => {
        const normalized = address?.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
        const family = isIP(normalized || '');
        return family ? blocks.check(normalized, family === 4 ? 'ipv4' : 'ipv6') : false;
    };
}

export function securityHeaders(config) {
    const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
    return { [config.cspEnforce === true ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only']: policy,
        'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()' };
}

export function privateApi(pathname) {
    try { return /^\/api(?:\/|$)/i.test(decodeURIComponent(pathname)); } catch { return true; }
}
