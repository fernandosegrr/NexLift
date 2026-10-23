

export function createPhotoService({ CLOUDINARY_CONFIGURED, cloudinary, fetch , console }) {
const CATBOX_API = 'https://catbox.moe/user/api.php';

function looksLikeImage(buffer) {
    if (buffer.length < 12) return false;
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true; // JPEG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true; // PNG
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true; // GIF
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return true; // WebP
    return false;
}

async function uploadToCloudinary(base64Data) {
    try {
        const result = await cloudinary.uploader.upload(base64Data, {
            folder: 'nexlift',
            resource_type: 'image'
        });
        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error.message);
        return null;
    }
}

async function uploadBase64ToCatbox(base64Data, extension = 'jpg') {
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    if (!looksLikeImage(buffer)) {
        console.error('Catbox upload rejected: contenido no parece una imagen válida');
        return null;
    }
    const filename = `nexlift_${Date.now()}.${extension}`;

    // Create form data manually for fetch
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    // Catbox es gratuito, anónimo y sin SLA — un fallo aislado (blip de red,
    // timeout puntual) es más probable que un fallo real de la imagen, así que
    // vale la pena reintentar un par de veces antes de darlo por perdido.
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(CATBOX_API, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body,
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) throw new Error(`Catbox upload failed: ${response.status}`);
            const url = (await response.text()).trim();
            // No confiar a ciegas en lo que Catbox devuelva como texto — si alguna vez
            // responde con una página de error en vez de una URL, eso NO debe guardarse
            // como avatarUrl/photoUrl y servirse después como <img src>.
            if (!/^https:\/\/files\.catbox\.moe\/.+/.test(url)) {
                throw new Error(`respuesta inesperada: ${url.slice(0, 100)}`);
            }
            return url;
        } catch (error) {
            console.error(`Catbox upload error (intento ${attempt}/${MAX_ATTEMPTS}):`, error.message);
            if (attempt === MAX_ATTEMPTS) return null;
            await new Promise(resolve => setTimeout(resolve, attempt * 800));
        }
    }
    return null;
}

async function uploadPhoto(base64Data) {
    if (CLOUDINARY_CONFIGURED) return uploadToCloudinary(base64Data);
    return uploadBase64ToCatbox(base64Data, 'jpg');
}

return { CATBOX_API, looksLikeImage, uploadToCloudinary, uploadBase64ToCatbox, uploadPhoto };
}
