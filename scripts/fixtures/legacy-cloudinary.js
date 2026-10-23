/**
 * Helpers de entrega Cloudinary.
 * Las fotos se guardan como URL full-res; en galería conviene servir un
 * transform (w/q/f) para no bajar 3MB por miniatura (caso real: foto 12-feb = 3.3MB).
 */

const CLOUDINARY_UPLOAD = '/image/upload/';

/**
 * @param {string|null|undefined} url
 * @param {{ width?: number, height?: number, crop?: string, quality?: string|number }} [opts]
 * @returns {string} URL transformada o la original si no es Cloudinary
 */
export function cloudinaryThumb(url, opts = {}) {
    if (!url || typeof url !== 'string') return url || '';
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

    // Insertar transforms justo después de /image/upload/
    return url.replace(CLOUDINARY_UPLOAD, `${CLOUDINARY_UPLOAD}${parts.join(',')}/`);
}

/** Versión modal / detalle: más ancha, sigue optimizada. */
export function cloudinaryDisplay(url) {
    return cloudinaryThumb(url, { width: 1200, quality: 'auto' });
}
