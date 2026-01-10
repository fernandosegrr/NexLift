import FormData from 'form-data';
import fetch from 'node-fetch';

const CATBOX_API = 'https://catbox.moe/user/api.php';

/**
 * Upload a file buffer to Catbox.moe
 * @param {Buffer} fileBuffer - The file data
 * @param {string} filename - Original filename (with extension)
 * @returns {Promise<string>} - URL of uploaded file
 */
export async function uploadToCatbox(fileBuffer, filename) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', fileBuffer, { filename });

    const response = await fetch(CATBOX_API, {
        method: 'POST',
        body: form
    });

    if (!response.ok) {
        throw new Error(`Catbox upload failed: ${response.status}`);
    }

    const url = await response.text();
    return url.trim();
}

/**
 * Convert base64 image to buffer and upload to Catbox
 * @param {string} base64Data - Base64 encoded image (with or without data URI prefix)
 * @param {string} extension - File extension (jpg, png, etc.)
 * @returns {Promise<string>} - URL of uploaded file
 */
export async function uploadBase64ToCatbox(base64Data, extension = 'jpg') {
    // Remove data URI prefix if present
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');

    // Convert to buffer
    const buffer = Buffer.from(base64Clean, 'base64');

    // Generate filename
    const filename = `nexlift_${Date.now()}.${extension}`;

    return uploadToCatbox(buffer, filename);
}
