import { createServer } from 'node:http';
import { once } from 'node:events';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { normalizeRoutineImport } from '../../../server/src/services/routineImportContract.js';
import { buildRoutineFormPayload, buildTemplateRoutinePayload } from '../utils/routinePayload.js';
import { ROUTINE_TEMPLATES } from '../data/routineTemplates.js';
import { EXERCISES } from '../data/exercises.js';

let server, requests, api;
beforeEach(async () => {
    vi.resetModules(); requests = [];
    vi.stubGlobal('localStorage', { getItem: key => key === 'nexlift_token' ? 'synthetic-token' : null });
    server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        requests.push({ body, path: req.url, auth: req.headers.authorization });
        try {
            const routine = normalizeRoutineImport(body);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Routine imported successfully!', routine }));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message, details: error.details }));
        }
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    vi.stubEnv('VITE_API_URL', `http://127.0.0.1:${server.address().port}/api`);
    ({ api } = await import('./api.js'));
});
afterEach(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
const routine = ex => ({ name: 'R', days: [{ dayName: 'Domingo', weekday: 0, exercises: [{ name: 'Remo', ...ex }] }] });

it('real API transport sends raw legacy JSON including conflicting aliases and surfaces the exact field error', async () => {
    const input = routine({ targetSets: 4, sets: 3, restSeconds: 0, rest: null, muscleGroup: 'Espalda' });
    await expect(api.importRoutine(input)).rejects.toThrow('days[0].exercises[0].targetSets: conflicto');
    expect(requests[0]).toEqual({ body: input, path: '/api/routines/import', auth: 'Bearer synthetic-token' });
});
it('manual builder and actual API transport keep zero, null and false through JSON serialization', async () => {
    const input = buildRoutineFormPayload(routine({ targetSets: '4', targetReps: '4-6', restSeconds: 0, isUnilateral: false, note: null }));
    const result = await api.importRoutine(input);
    expect(requests[0].body).toEqual(input);
    expect(result.routine.days[0].exercises[0]).toMatchObject({ targetSets: 4, targetReps: '4-6', restSeconds: 0, isUnilateral: false, note: null });
});
it('real template builder and actual API transport agree with the backend catalog and Sunday semantics', async () => {
    const input = buildTemplateRoutinePayload(ROUTINE_TEMPLATES[0], EXERCISES);
    const result = await api.importRoutine(input);
    expect(requests[0].body).toEqual(input);
    expect(result.routine.days.find(day => day.weekday === 0).isRestDay).toBe(true);
    expect(result.routine.days[0].exercises[0]).toMatchObject({ targetSets: 3, restSeconds: 90, muscleGroup: 'Pecho' });
});
it('edit transport retains configuration and resource IDs without applying any frontend defaults', async () => {
    const input = buildRoutineFormPayload({ ...routine({ id: 'e', restSeconds: null, targetSets: 4, targetReps: '4-6', muscleGroup: 'Espalda' }), id: 'r' });
    await api.updateRoutine('r', input);
    expect(requests[0].path).toBe('/api/routines/r'); expect(requests[0].body).toEqual(input);
    expect(requests[0].body.days[0].exercises[0].restSeconds).toBeNull();
});
it('invalid JSON shapes reach central validation without client-side crashes or invented exercise names', async () => {
    for (const input of [null, [], { name: 'R', days: [{ dayName: 'D', exercises: {} }] }]) {
        await expect(api.importRoutine(input)).rejects.toThrow();
        expect(requests.at(-1).body).toEqual(input);
    }
});
