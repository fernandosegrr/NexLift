// ExerciseAgentService — deduplicación semántica de ejercicios (Tarea 4).
//
// Al importar una rutina JSON (o añadir un ejercicio nuevo a una rutina existente),
// los nombres libres del usuario fragmentan el catálogo por variantes de escritura
// ("Press Banca", "press de banca", "Bench Press"). Este servicio hace UNA sola
// llamada al LLM por operación para clasificar cada ejercicio entrante contra el
// catálogo existente del usuario, evitando duplicados y protegiendo el historial
// de PRs. Nunca bloquea la operación: sin API key, con timeout, o con una
// respuesta inválida del LLM, cae al matching determinista ya usado en el resto
// del proyecto (canonicalExerciseKey).
import OpenAI from 'openai';
import { operationalLog } from '../operations/telemetry.js';
import { deterministicFallback } from '../modules/exercises/deduplicate.js';

const client = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15000 })
    : null;

const SYSTEM_PROMPT = `Eres un clasificador de ejercicios de gimnasio. Recibes una lista de ejercicios ENTRANTES y una lista de ejercicios EXISTENTES (con id, name, muscleGroup) del catálogo de un usuario.

Para cada ejercicio ENTRANTE, decide:
- Si es el MISMO movimiento físico que uno de los EXISTENTES (tolera abreviaturas, sinónimos, tildes, orden de palabras, plurales, sufijos de grupo muscular entre paréntesis, e idioma distinto como "Bench Press" = "Press de Banca"), responde con el "id" del existente en "matchedId".
- Si es un ejercicio genuinamente distinto o no hay ningún existente equivalente, responde "matchedId": null y da un "cleanedName" (nombre limpio, capitalizado de forma natural, sin prefijos de orden ni paréntesis de grupo muscular).

Sé CONSERVADOR: nunca fusiones variantes de equipamiento distintas (mancuerna vs máquina vs smith vs polea son ejercicios distintos aunque el movimiento se parezca), ni grupos musculares distintos con nombres parecidos.

Responde ÚNICAMENTE JSON con esta forma exacta, un elemento por cada ejercicio entrante, en el mismo orden que se te dio, usando su "index" (0-based):
{"verdicts": [{"index": 0, "matchedId": "abc123" | null, "cleanedName": "..." | null}]}`;

function buildPrompt(incomingExercises, canonicalExercises) {
    return JSON.stringify({
        incoming: incomingExercises.map((ex, index) => ({ index, name: ex.name })),
        existing: canonicalExercises.map(ex => ({ id: ex.id, name: ex.name, muscleGroup: ex.muscleGroup }))
    });
}

// Matching determinista por clave canónica — mismo criterio que usa el resto del
// proyecto (Goals, historial). Es el fallback si no hay LLM disponible o falla.


// Valida la forma de la respuesta del LLM. Si faltan índices o vienen mal
// tipados, rellena SOLO esos vía fallback determinista — un elemento malformado
// no debe tumbar toda la operación. Devuelve null si la respuesta es inutilizable
// a nivel estructural (dispara el fallback completo).
function validateVerdicts(raw, incomingExercises, canonicalExercises) {
    if (!raw || !Array.isArray(raw.verdicts)) return null;

    const byIndex = new Map();
    for (const v of raw.verdicts) {
        if (typeof v?.index !== 'number') continue;
        if (v.matchedId != null && typeof v.matchedId !== 'string') continue;
        if (v.cleanedName != null && typeof v.cleanedName !== 'string') continue;
        byIndex.set(v.index, { index: v.index, matchedId: v.matchedId ?? null, cleanedName: v.cleanedName ?? null });
    }

    const canonicalIds = new Set(canonicalExercises.map(ex => ex.id));
    const fallback = deterministicFallback(incomingExercises, canonicalExercises);

    return incomingExercises.map((_, index) => {
        const v = byIndex.get(index);
        if (!v) return fallback[index]; // índice ausente en la respuesta: fallback puntual
        if (v.matchedId && !canonicalIds.has(v.matchedId)) return fallback[index]; // id inventado
        if (!v.matchedId && !v.cleanedName) return fallback[index]; // ni match ni nombre limpio
        return v;
    });
}

// Clasifica una tanda de ejercicios entrantes contra el catálogo existente del
// usuario en UNA sola llamada al LLM (o el fallback determinista si no aplica).
// Devuelve [{ index, matchedId, cleanedName }] en el mismo orden que incomingExercises.
export async function deduplicateExercises(incomingExercises, canonicalExercises) {
    if (!incomingExercises || incomingExercises.length === 0) return [];
    if (!client) return deterministicFallback(incomingExercises, canonicalExercises);

    try {
        const completion = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: buildPrompt(incomingExercises, canonicalExercises) }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1
        });

        const raw = JSON.parse(completion.choices[0].message.content);
        const verdicts = validateVerdicts(raw, incomingExercises, canonicalExercises);
        if (!verdicts) throw new Error('Invalid LLM response shape');
        return verdicts;
    } catch {
        operationalLog({ event: 'exercise_provider_failed', category: 'external' });
        return deterministicFallback(incomingExercises, canonicalExercises);
    }
}
