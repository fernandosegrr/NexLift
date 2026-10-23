// aiRoutineAgent.js — capa de IA para elegir los ejercicios del día de HOY en la
// Rutina diaria con IA. Espejo exacto de exerciseAgent.js: gated en
// OPENAI_API_KEY (null client si no hay), UNA sola llamada JSON-mode, y
// fallback determinista en CUALQUIER falla (sin key, timeout, respuesta
// inválida) — la feature debe funcionar de punta a punta sin IA configurada.
//
// Diferencia deliberada respecto a exerciseAgent.js: aquí el LLM SIEMPRE elige
// de una lista CERRADA de candidatos (nunca texto libre / "cleanedName"). Los
// endpoints de historial (GET /api/workouts/exercise/:id/history,
// /api/shortcuts/next-set) resuelven continuidad por nombre EXACTO
// (insensible a mayúsculas), no por el matching difuso de canonicalExerciseKey
// — dejar que el LLM invente redacción nueva fragmentaría esa continuidad. Acá
// las apuestas son más altas (meses de historial de Smart Loading en juego),
// así que se cierra el problema en el origen en vez de limpiarlo después.
import OpenAI from 'openai';
import { operationalLog } from '../operations/telemetry.js';

const client = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15000 })
    : null;

const SYSTEM_PROMPT = `Eres un entrenador personal eligiendo los ejercicios de la sesión de HOY de un usuario, dentro de un split ya decidido (ej. "Push", "Upper A", "Full Body A"). Te doy el nombre de ese día del split, el objetivo/nivel del usuario, y una lista NUMERADA de candidatos válidos (cada uno con su grupo muscular, y si el usuario ya lo entrenó antes).

Elige entre 3 y 6 candidatos que en conjunto formen una buena sesión para ese día del split (cubre los grupos musculares que ese día implica, sin repetir un mismo grupo en exceso). Cuando dos candidatos serían una elección igualmente válida, PREFIERE el que el usuario "yaEntrenado" para darle continuidad a su progreso — pero nunca sacrifiques una sesión bien armada solo por eso.

Para cada elegido, define targetSets/targetReps/restSeconds según el objetivo:
- "strength": 4 series, reps "4-6", descanso 150s.
- "hypertrophy": 3 series, reps "8-12", descanso 90s.
- "general": 3 series, reps "10-15", descanso 60s.

Responde ÚNICAMENTE JSON con esta forma exacta (candidateIndex = el número de la lista que te doy, 0-based):
{"picks": [{"candidateIndex": 0, "targetSets": 3, "targetReps": "8-12", "restSeconds": 90}, ...]}`;

function buildPrompt({ splitLabel, profile, candidates }) {
    return JSON.stringify({
        splitLabel,
        goal: profile.goal,
        experienceLevel: profile.experienceLevel,
        candidates: candidates.map((c, index) => ({ index, name: c.name, muscleGroup: c.muscleGroup, yaEntrenado: c.yaEntrenado }))
    });
}

// Valida defensivamente la respuesta del LLM contra la lista de candidatos real
// — un candidateIndex fuera de rango o repetido se descarta puntualmente (no
// tumba toda la respuesta); solo se cae al fallback completo si NINGÚN pick
// sobrevive la validación.
function validatePicks(raw, candidates) {
    if (!raw || !Array.isArray(raw.picks)) return null;

    const seen = new Set();
    const picks = [];
    for (const p of raw.picks) {
        if (typeof p?.candidateIndex !== 'number') continue;
        const candidate = candidates[p.candidateIndex];
        if (!candidate || seen.has(p.candidateIndex)) continue;
        seen.add(p.candidateIndex);

        const targetSets = Number.isInteger(p.targetSets) && p.targetSets > 0 && p.targetSets <= 10 ? p.targetSets : 3;
        const targetReps = typeof p.targetReps === 'string' && p.targetReps.length <= 10 ? p.targetReps : '8-12';
        const restSeconds = Number.isInteger(p.restSeconds) && p.restSeconds > 0 && p.restSeconds <= 600 ? p.restSeconds : 90;

        picks.push({
            name: candidate.name,
            muscleGroup: candidate.muscleGroup,
            isUnilateral: !!candidate.isUnilateral,
            targetSets, targetReps, restSeconds
        });
    }
    return picks.length > 0 ? picks : null;
}

// Candidatos = catálogo (ya filtrado por equipo del perfil) UNIDO a los
// ejercicios que el usuario ya entrenó antes (con cualquier equipo — dan
// continuidad aunque hoy no coincidan con el filtro), deduplicado por nombre
// insensible a mayúsculas. Esto es lo único que el LLM puede elegir.
function buildCandidateList(equipmentCatalog, historicalExercises) {
    const byKey = new Map();
    for (const ex of equipmentCatalog) {
        byKey.set(ex.name.toLowerCase(), { name: ex.name, muscleGroup: ex.muscleGroup, isUnilateral: !!ex.isUnilateral, yaEntrenado: false });
    }
    for (const ex of historicalExercises || []) {
        const key = ex.name.toLowerCase();
        const existing = byKey.get(key);
        if (existing) existing.yaEntrenado = true;
        else byKey.set(key, { name: ex.name, muscleGroup: ex.muscleGroup, isUnilateral: !!ex.isUnilateral, yaEntrenado: true });
    }
    return [...byKey.values()];
}

// Elige los ejercicios de hoy para `splitLabel` (o el fallback determinista si
// no hay API key, la respuesta es inválida, o no hay ningún candidato disponible).
export async function chooseExercisesForDay({ splitLabel, profile, equipmentCatalog, historicalExercises, fallback }) {
    if (!client) return fallback();

    const candidates = buildCandidateList(equipmentCatalog, historicalExercises);
    if (candidates.length === 0) return fallback();

    try {
        const completion = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: buildPrompt({ splitLabel, profile, candidates }) }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4
        });

        const raw = JSON.parse(completion.choices[0].message.content);
        const picks = validatePicks(raw, candidates);
        if (!picks) throw new Error('Invalid LLM response shape');
        return picks;
    } catch {
        operationalLog({ event: 'routine_provider_failed', category: 'external' });
        return fallback();
    }
}
