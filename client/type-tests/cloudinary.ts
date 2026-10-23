import { cloudinaryThumb, cloudinaryDisplay, type CloudinaryOptions } from '../src/utils/cloudinary.js';
import { isString, type StringGuard } from '@nexlift/shared';

const options: CloudinaryOptions = { width: 360, height: 360, quality: 'auto' };
const result: string = cloudinaryThumb(null, options);
cloudinaryDisplay(result);
const input: unknown = 'example';
const guard: StringGuard = isString;
if (guard(input)) input.toUpperCase();
// @ts-expect-error Width is a number, not a CSS string.
cloudinaryThumb('https://example.invalid', { width: '360px' });
// @ts-expect-error Network records are not implicitly strings.
cloudinaryDisplay({ url: result });
// @ts-expect-error Null is allowed as an input but not as an options object.
cloudinaryThumb(undefined, null);
// @ts-expect-error Returns a URL string, not a number.
const invalidReturn: number = cloudinaryThumb(result);
void invalidReturn;
// @ts-expect-error No invented options.
cloudinaryThumb(result, { secret: 'not-an-option' });
// @ts-expect-error Browser globals do not add exports to shared.
import { prisma } from '@nexlift/shared';
void prisma;
