import { describe, it, expect } from 'vitest';
import { buildRoutineFormPayload, buildTemplateRoutinePayload } from './routinePayload.js';
import { normalizeRoutineImport } from '../../../server/src/services/routineImportContract.js';
import { ROUTINE_TEMPLATES } from '../data/routineTemplates.js';
import { EXERCISES } from '../data/exercises.js';

describe('routine inputs before transport', () => {
    it.each(ROUTINE_TEMPLATES.map(template => [template.id, template]))('every real template %s produces a valid complete contract', (_, template) => {
        const output = normalizeRoutineImport(buildTemplateRoutinePayload(template, EXERCISES));
        expect(output.days).toHaveLength(template.days.length);
        expect(output.days.some(day => day.weekday === 0)).toBe(true);
        output.days.forEach((day, i) => {
            expect(day.exercises).toHaveLength(template.days[i].exercises.length);
            day.exercises.forEach(ex => {
                expect(ex.targetSets).toBe(3); expect(ex.targetReps).toBe('8-12'); expect(ex.restSeconds).toBe(90);
                expect(ex.muscleGroup).toBeTruthy();
            });
        });
    });
    it('manual and editor preserve zero/null, numeric strings, booleans, notes and IDs before validation', () => {
        const routine = { id: 'r', name: ' R ', days: [{ id: 'd', dayName: ' Domingo ', weekday: 0, exercises: [
            { id: 'e1', name: ' Remo ', targetSets: '4', targetReps: '4-6', restSeconds: 0, muscleGroup: 'Espalda', isUnilateral: false, note: '' },
            { name: 'Jalón', targetSets: 5, targetReps: '6', restSeconds: null, isUnilateral: true, note: null }
        ] }] };
        const previous = structuredClone(routine);
        const output = buildRoutineFormPayload(routine);
        expect(output.days[0].exercises[0]).toMatchObject({ id: 'e1', targetSets: '4', restSeconds: 0, note: '', isUnilateral: false });
        expect(output.days[0].exercises[1].restSeconds).toBeNull();
        expect(output.days[0].weekday).toBe(0);
        expect(normalizeRoutineImport(output).days[0].exercises[0].targetSets).toBe(4);
        expect(routine).toEqual(previous);
    });
    it('form input errors are not converted to valid defaults; an empty optional rest explicitly clears it', () => {
        const form = values => buildRoutineFormPayload({ name: 'R', days: [{ dayName: 'D', exercises: [{ name: 'E', ...values }] }] });
        for (const values of [{ targetSets: '0' }, { targetSets: '3.8' }, { targetSets: '' }, { restSeconds: '90abc' }, { targetReps: '' }]) {
            expect(() => normalizeRoutineImport(form(values))).toThrow();
        }
        expect(form({ restSeconds: '' }).days[0].exercises[0].restSeconds).toBeNull();
    });
    it('explicitly marking a form day as rest clears its hidden exercises', () => {
        const output = buildRoutineFormPayload({ name: 'R', days: [{ dayName: 'D', isRestDay: true, exercises: [{ name: 'E' }] }] });
        expect(output.days[0].exercises).toEqual([]);
    });
    it('templates preserve overrides and historical aliases without replacing them with catalog defaults', () => {
        const template = { name: 'R', days: [{ dayName: 'D', exercises: [
            { exerciseId: EXERCISES[0].id, sets: 4, reps: '4-6', rest: 0, muscleGroup: 'Espalda', isUnilateral: true, note: 'custom', order: 9 }
        ] }] };
        const output = buildTemplateRoutinePayload(template, EXERCISES);
        expect(output.days[0].exercises[0].targetSets).toBeUndefined();
        expect(normalizeRoutineImport(output).days[0].exercises[0]).toMatchObject({
            targetSets: 4, targetReps: '4-6', restSeconds: 0, muscleGroup: 'Espalda', isUnilateral: true, note: 'custom', order: 9
        });
        template.days[0].exercises[0].targetSets = 3;
        expect(() => normalizeRoutineImport(buildTemplateRoutinePayload(template, EXERCISES))).toThrow(/conflicto/);
        delete template.days[0].exercises[0].targetSets;
        delete template.days[0].exercises[0].muscleGroup;
        template.days[0].exercises[0].muscle = 'back';
        expect(normalizeRoutineImport(buildTemplateRoutinePayload(template, EXERCISES)).days[0].exercises[0].muscleGroup).toBe('Espalda');
    });
    it('missing template catalog entries fail explicitly rather than inventing exercise names', () => {
        expect(() => buildTemplateRoutinePayload({ name: 'R', days: [{ exercises: [{ exerciseId: 'unknown' }] }] }, EXERCISES)).toThrow(/desconocido/);
    });
});
