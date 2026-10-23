import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isString, workspaceProbe } from '@nexlift/shared';

test('shared: emitted ESM package exports a real runtime predicate', () => {
    assert.equal(workspaceProbe, 'nexlift-shared-resolution-ok');
    for (const value of [null, undefined, 0, false, {}, [], new String('x')]) assert.equal(isString(value), false);
    for (const value of ['', '0', 'peso kg / RIR / operationId']) assert.equal(isString(value), true);
});
test('shared: Node 24 CommonJS require consumes the same compiled export', () => {
    const require = createRequire(import.meta.url);
    assert.equal(require('@nexlift/shared').isString, isString);
});
