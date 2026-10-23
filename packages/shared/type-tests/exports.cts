import shared = require('@nexlift/shared');
const input: unknown = null;
if (shared.isString(input)) input.trim();
// @ts-expect-error Runtime predicate always returns boolean.
const value: string = shared.isString(input);
void value;
// @ts-expect-error Environment-neutral package has no browser globals.
document.cookie;
// @ts-expect-error Shared does not implicitly inherit Node types.
process.env;
