import { createServer } from 'node:http';
import { once } from 'node:events';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { normalizeRoutineImport } from '../../server/src/services/routineImportContract.js';

let server, requests, api, answer;
const input = () => ({ name: 'R', description: null, provenance: 'legacy', days: [{ dayName: 'Domingo', weekday: 0,
    exercises: [{ name: 'Remo', sets: '4', reps: '4-6', rest: 0, muscle: 'back', isUnilateral: false, note: null }] }] });
beforeEach(async () => {
    vi.resetModules(); requests = [];
    vi.stubGlobal('localStorage', { getItem: key => key === 'nexlift_token' ? 'synthetic-contract-token' : null });
    server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); requests.push(body);
        res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(answer(body)));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    vi.stubEnv('VITE_API_URL', `http://127.0.0.1:${server.address().port}/api`);
    ({ api } = await import('../src/services/api.js'));
});
afterEach(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
it('actual import consumer rejects an incompatible success and retains the original JSON', async () => {
    answer = () => ({ ok: true }); const payload = input(), before = JSON.stringify(payload);
    await expect(api.importRoutine(payload)).rejects.toMatchObject({ code: 'INCOMPATIBLE_API_RESPONSE' });
    expect(requests).toEqual([payload]); expect(JSON.stringify(payload)).toBe(before);
});
it('actual import consumer preserves legacy aliases in HTTP and zero/Sunday in a validated extensible response', async () => {
    answer = body => ({ message: 'ok', extension: 'retained', routine: normalizeRoutineImport(body) });
    const payload = input(), result = await api.importRoutine(payload);
    expect(requests).toEqual([payload]); expect(result.extension).toBe('retained');
    expect(result.routine.days[0].weekday).toBe(0);
    expect(result.routine.days[0].exercises[0]).toMatchObject({ targetSets: 4, targetReps: '4-6', restSeconds: 0, note: null });
});
it('actual import consumer rejects wrong response types without silently coercing or issuing another write', async () => {
    for (const patch of [{ targetSets: '4' }, { restSeconds: false }, { isUnilateral: null }]) {
        answer = body => { const routine = normalizeRoutineImport(body); Object.assign(routine.days[0].exercises[0], patch); return { routine }; };
        await expect(api.importRoutine(input())).rejects.toMatchObject({ code: 'INCOMPATIBLE_API_RESPONSE' });
    }
    expect(requests).toHaveLength(3);
});
