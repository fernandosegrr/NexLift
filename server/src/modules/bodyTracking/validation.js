

export const BODY_METRIC_RANGES = {
    weight: [0, 500], bmi: [0, 100], bodyFat: [0, 100], muscleMass: [0, 300],
    bmr: [0, 10000], bodyWater: [0, 100], visceralFat: [0, 100], boneMass: [0, 50], protein: [0, 100]
};

export function sanitizeBodyMetrics(body) {
    const clean = {};
    for (const [key, [min, max]] of Object.entries(BODY_METRIC_RANGES)) {
        if (body[key] == null || body[key] === '') { clean[key] = null; continue; }
        const val = parseFloat(body[key]);
        if (!Number.isFinite(val) || val < min || val > max) {
            return { error: `${key} inválido (rango esperado ${min}-${max})` };
        }
        clean[key] = val;
    }
    return { clean };
}

