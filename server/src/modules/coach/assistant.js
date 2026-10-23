import { answerCoach } from '../../generated/coach.cjs';
import { object, CoachError } from './validation.js';
export function validateCoachSelection(raw, facts, allowedViews) {
    object(raw, ['factIds', 'views']);
    if (!Array.isArray(raw.factIds) || !raw.factIds.length || raw.factIds.length > 9 || new Set(raw.factIds).size !== raw.factIds.length || raw.factIds.some(id => typeof id !== 'string' || !facts.some(f => f.id === id)) || !Array.isArray(raw.views) || !raw.views.length || raw.views.length > 3 || new Set(raw.views).size !== raw.views.length || raw.views.some(v => !allowedViews.includes(v))) throw new CoachError('Selección del proveedor inválida.');
    return raw;
}
/** LLM selects IDs only: no arbitrary text, numbers, queries, user IDs or mutations. */
export function createCoachAssistant({ provider, timeoutMs = 8000, now = () => Date.now() } = {}) {
    const daily = new Map(), aggregate = { calls: 0, fallbacks: 0, inputTokens: 0, outputTokens: 0 }, active = new Set();
    return { usage: () => ({ ...aggregate }), async answer(owner, report, body) {
        object(body, ['message', 'exerciseId', 'useProvider', 'days']);
        if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1200 || typeof (body.useProvider ?? false) !== 'boolean') throw new CoachError('Escribe una pregunta de 1 a 1200 caracteres.');
        if (body.exerciseId != null && !report.plateaus.some(p => p.exerciseId === body.exerciseId)) throw new CoachError('Ejercicio no disponible.', 404);
        const fallback = answerCoach(report, body.message, body.exerciseId || null);
        if (!provider || body.useProvider !== true || !fallback.factIds.length) return fallback;
        const facts = report.facts.filter(f => f.externalSafe && fallback.factIds.includes(f.id));
        if (!facts.length) return { ...fallback, limitations: [...fallback.limitations, 'Esta consulta contiene contexto privado: se responde localmente.'] };
        const time = now(), key = owner;
        for (const [k, v] of daily) if (v.until <= time) daily.delete(k);
        const entry = daily.get(key) || { until: time + 86400000, calls: 0 };
        if (entry.calls >= 20 || active.has(owner) || active.size >= 4 || daily.size >= 10000 && !daily.has(key)) return { ...fallback, limitations: [...fallback.limitations, 'Límite del proveedor alcanzado; análisis local disponible.'] };
        entry.calls++; daily.set(key, entry); active.add(owner); aggregate.calls++;
        const controller = new AbortController(); let timer;
        try {
            const result = await Promise.race([Promise.resolve().then(() => provider({ intent: fallback.intent, facts, allowedViews: [fallback.intent] }, controller.signal)), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('timeout')); }, timeoutMs); })]);
            const selected = validateCoachSelection(result.selection, facts, [fallback.intent]);
            aggregate.inputTokens += Math.min(10000, Math.max(0, Number(result.inputTokens) || 0)); aggregate.outputTokens += Math.min(1000, Math.max(0, Number(result.outputTokens) || 0));
            return { ...fallback, mode: 'provider', factIds: selected.factIds, text: selected.factIds.map(id => facts.find(f => f.id === id).text), views: selected.views };
        } catch { aggregate.fallbacks++; return { ...fallback, limitations: [...fallback.limitations, 'Proveedor no disponible o respuesta inválida; se conservó el análisis verificable.'] }; }
        finally { clearTimeout(timer); active.delete(owner); }
    } };
}
