import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
// Independent HTTP requests may cross a second boundary. Validate each token's
// real signature, freshness and exact lifetime before normalizing volatile time.
export function comparableIssuedToken(token, secret, now = Math.floor(Date.now() / 1000)) {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'], clockTimestamp: now });
    assert.equal(typeof claims.userId, 'string');
    assert(Number.isInteger(claims.tokenVersion) && claims.tokenVersion >= 0);
    assert(Number.isInteger(claims.iat) && claims.iat <= now && claims.iat >= now - 30, 'Issued token must be fresh within the bounded HTTP request');
    assert.equal(claims.exp - claims.iat, 365 * 86400, 'Token lifetime must remain exactly 365 days');
    return { ...claims, iat: '<verified-fresh-issuance>', exp: '<verified-365-day-expiry>' };
}
