import { isString } from '@nexlift/shared';

export interface CloudinaryOptions {
    width?: number;
    height?: number;
    crop?: string;
    quality?: string | number;
}

const CLOUDINARY_UPLOAD = '/image/upload/';

/** Pure URL transformation; no network request or payload validation. */
export function cloudinaryThumb(url: string | null | undefined, opts: CloudinaryOptions = {}): string {
    if (!url || !isString(url)) return url || '';
    if (!url.includes('res.cloudinary.com') || !url.includes(CLOUDINARY_UPLOAD)) {
        return url;
    }
    const width = opts.width ?? 400;
    const height = opts.height;
    const crop = opts.crop ?? (height ? 'fill' : 'limit');
    const quality = opts.quality ?? 'auto';
    const parts = [`w_${width}`, `q_${quality}`, 'f_auto'];
    if (height) parts.push(`h_${height}`, `c_${crop}`);
    else parts.push(`c_${crop}`);
    return url.replace(CLOUDINARY_UPLOAD, `${CLOUDINARY_UPLOAD}${parts.join(',')}/`);
}

export function cloudinaryDisplay(url: string | null | undefined): string {
    return cloudinaryThumb(url, { width: 1200, quality: 'auto' });
}
