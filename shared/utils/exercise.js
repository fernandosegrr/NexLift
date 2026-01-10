/**
 * Normaliza nombre de ejercicio para consistencia en PRs
 * - Quita prefijos de numeración (a1., b.2, etc.)
 * - Convierte a minúsculas
 * - Limpia espacios extras
 */
export function normalizeExerciseName(name) {
    if (!name) return '';

    return name
        .toLowerCase()
        .replace(/^[a-z]?\d+\.?\s*/i, '') // Remove prefixes like "a1.", "b.2", "1."
        .replace(/\s+/g, ' ')              // Normalize spaces
        .trim();
}
