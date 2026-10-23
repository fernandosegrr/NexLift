// Kept separate from the historical test that strips all type-tests directives.
import { cappedEpley1RM } from '../../src/index.js';
const value: number = cappedEpley1RM(80, 10);
void value;
// @ts-expect-error The result is numeric, never a formatted string.
const text: string = cappedEpley1RM('80', '10');
void text;
// @ts-expect-error Both historical input positions must be explicit.
cappedEpley1RM(80);
// @ts-expect-error Domain estimates have no presentation properties.
cappedEpley1RM(80, 10).formatted;
// @ts-expect-error A function cannot become a numeric result.
const invalid: number = cappedEpley1RM;
void invalid;
