import bcrypt from 'bcryptjs';

const dummyHash = bcrypt.hashSync('synthetic-dummy-credential-only', 10);
export const passwordValid = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
export const textValid = (value, max = 254) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export const compareCredential = (value, hash) => bcrypt.compare(typeof value === 'string' ? value : '', hash || dummyHash);

export function authInputError(path, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return true;
    const fields = {
        '/api/auth/register': ['username', 'email', 'password', 'firstName', 'lastName'],
        '/api/auth/login': ['username', 'password'],
        '/api/auth/recover/question': ['username'],
        '/api/auth/recover/verify': ['username', 'answer', 'newPassword'],
        '/api/auth/password': ['currentPassword', 'newPassword'],
        '/api/auth/security-question': ['currentPassword', 'question', 'answer']
    }[path];
    if (!fields) return false;
    const legacyCredential = field => field === 'currentPassword' || (field === 'password' && path === '/api/auth/login')
        || (field === 'answer' && path === '/api/auth/recover/verify') || (field === 'username' && path !== '/api/auth/register');
    const legacyPassword = field => field === 'currentPassword' || (field === 'password' && path === '/api/auth/login');
    // Existing bcrypt credentials may historically exceed its effective input
    // size. Preserve comparison of those values; constrain only new secrets.
    return fields.some(field => legacyPassword(field)
        ? typeof body[field] !== 'string' || body[field].length === 0 || body[field].length > 10 * 1024 * 1024
        : !textValid(body[field], legacyCredential(field) ? 10 * 1024 * 1024 : /password/i.test(field) ? 4096 : 254))
        || (path === '/api/auth/register' && !passwordValid(body.password))
        || (body.newPassword !== undefined && !passwordValid(body.newPassword))
        || ['securityQuestion', 'securityAnswer'].some(field => body[field] != null && typeof body[field] !== 'string')
        || (path === '/api/auth/register' && typeof body.securityAnswer === 'string' && Buffer.byteLength(body.securityAnswer.toLowerCase().trim(), 'utf8') > 72)
        || (path === '/api/auth/security-question' && typeof body.answer === 'string' && Buffer.byteLength(body.answer.toLowerCase().trim(), 'utf8') > 72);
}
