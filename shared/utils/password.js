import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash a password
 */
export async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Hash a security answer (lowercase, trimmed)
 */
export async function hashSecurityAnswer(answer) {
    const normalized = answer.toLowerCase().trim();
    return bcrypt.hash(normalized, SALT_ROUNDS);
}

/**
 * Verify a security answer
 */
export async function verifySecurityAnswer(answer, hash) {
    const normalized = answer.toLowerCase().trim();
    return bcrypt.compare(normalized, hash);
}
