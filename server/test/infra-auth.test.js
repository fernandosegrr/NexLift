import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createAuthMiddleware } from '../src/middleware/auth.js';

const secret = 'synthetic-test-secret';
const token = (claims = {}, options = {}) => jwt.sign({ userId: 'A', tokenVersion: 2, ...claims }, secret, options);
async function invoke({ authorization = `Bearer ${token()}`, user = { isActive: true, tokenVersion: 2 }, error } = {}) {
    let calls = 0, next = false;
    const records = [];
    const req = { headers: { authorization }, requestId: 'synthetic-request' };
    const res = { statusCode: 200, headers: {}, status(n) { this.statusCode = n; return this; },
        set(k,v) { this.headers[k] = v; return this; }, json(body) { this.body = body; return this; } };
    const prisma = { user: { async findUnique() { calls++; if (error) throw error; return user; } } };
    await createAuthMiddleware({ prisma, secret, log: record => records.push(record) })(req, res, () => { next = true; });
    return { res, req, calls, next, records };
}
test('invalid JWT is 401 before querying PostgreSQL', async () => {
    const result = await invoke({ authorization: 'Bearer invalid' });
    assert.equal(result.res.statusCode, 401); assert.equal(result.calls, 0);
});
test('revoked tokenVersion is 401', async () => {
    assert.equal((await invoke({ user: { isActive: true, tokenVersion: 3 } })).res.statusCode, 401);
});
test('PostgreSQL unreachable is 503, preserving the authentication distinction', async () => {
    assert.equal((await invoke({ error: { code: 'P1001', message: 'secret-db-url' } })).res.statusCode, 503);
});
test('unexpected internal session lookup error is 500', async () => {
    assert.equal((await invoke({ error: new Error('secret-internal') })).res.statusCode, 500);
});
for (const code of ['P1002', 'P1008', 'P1017', 'P2024', 'P2037', 'ECONNRESET', 'ETIMEDOUT', '57P01', '08006']) {
    test(`temporary DB failure ${code} returns 503 and Retry-After without internal details`, async () => {
        const result = await invoke({ error: { code, message: 'secret-password-jwt-url' } });
        assert.equal(result.res.statusCode, 503); assert.equal(result.res.headers['Retry-After'], '5');
        assert.equal(result.next, false);
        assert.equal(JSON.stringify(result.res.body).includes('secret'), false);
        assert.deepEqual(result.records, [{ event: 'auth_error', category: 'dependency_unavailable', requestId: 'synthetic-request', status: 503 }]);
    });
}
test('expired JWT is 401 without a database query', async () => {
    const result = await invoke({ authorization: `Bearer ${token({}, { expiresIn: -1 })}` });
    assert.equal(result.res.statusCode, 401); assert.equal(result.calls, 0);
});
test('missing token is 401', async () => {
    assert.equal((await invoke({ authorization: '' })).res.statusCode, 401);
});
test('unknown and disabled accounts retain generic 401 without revealing which condition failed', async () => {
    const a = await invoke({ user: null }), b = await invoke({ user: { isActive: false, tokenVersion: 2 } });
    assert.equal(a.res.statusCode, 401); assert.equal(b.res.statusCode, 401); assert.deepEqual(a.res.body, b.res.body);
});
test('valid token preserves userId and calls the next handler', async () => {
    const result = await invoke(); assert.equal(result.next, true); assert.equal(result.req.userId, 'A');
});
test('legacy JWT without tokenVersion remains valid only for version zero', async () => {
    const authorization = `Bearer ${jwt.sign({ userId: 'A' }, secret)}`;
    assert.equal((await invoke({ authorization, user: { isActive: true, tokenVersion: 0 } })).next, true);
    assert.equal((await invoke({ authorization })).res.statusCode, 401);
});
test('invalid signed claim shapes are rejected before DB access', async () => {
    for (const claims of [{ userId: null }, { userId: {} }, { tokenVersion: '2' }, { tokenVersion: -1 }]) {
        const result = await invoke({ authorization: `Bearer ${token(claims)}` });
        assert.equal(result.res.statusCode, 401); assert.equal(result.calls, 0);
    }
});
test('raw PostgreSQL timeout nested inside Prisma and connection causes are transient', async () => {
    assert.equal((await invoke({ error: { code: 'P2010', meta: { code: '57014' } } })).res.statusCode, 503);
    assert.equal((await invoke({ error: { cause: { code: 'ECONNREFUSED' } } })).res.statusCode, 503);
});
test('schema, credentials and query bugs are internal 500, never invalid user credentials', async () => {
    for (const code of ['P1000', 'P2021', 'P2022', 'P2002']) {
        assert.equal((await invoke({ error: { code } })).res.statusCode, 500);
    }
});
