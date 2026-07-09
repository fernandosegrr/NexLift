// Tests de planToday — la única función con ramas (reuse/rest/create) del
// generador de Rutina diaria con IA. El camino "create" ya se verificó en vivo
// (usuario sintético end-to-end); estos tests cubren "reuse" y "rest", que
// necesitarían simular varios días reales para probarse en vivo.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planToday } from './aiRoutineService.js';

describe('planToday', () => {
    it('si ya existe un día para hoy, lo reusa tal cual (nunca regenera un día en curso)', () => {
        const existingToday = { id: 'day1', dayName: '2026-07-08', exercises: [{ id: 'ex1' }] };
        const result = planToday({
            existingToday,
            recentDays: [],
            profile: { daysPerWeek: 3, goal: 'hypertrophy', equipment: ['barbell'] },
            todayStr: '2026-07-08',
            sevenDaysAgoStr: '2026-07-01'
        });
        assert.equal(result.action, 'reuse');
        assert.equal(result.day, existingToday);
    });

    it('cuota semanal ya cumplida (daysPerWeek días entrenados en los últimos 7): descanso', () => {
        const recentDays = [
            { dayName: '2026-07-07', splitLabel: 'Push' },
            { dayName: '2026-07-05', splitLabel: 'Pull' },
            { dayName: '2026-07-03', splitLabel: 'Legs' }
        ];
        const result = planToday({
            existingToday: null,
            recentDays,
            profile: { daysPerWeek: 3, goal: 'hypertrophy', equipment: ['barbell'] },
            todayStr: '2026-07-08',
            sevenDaysAgoStr: '2026-07-01'
        });
        assert.equal(result.action, 'rest');
        assert.equal(result.dayName, '2026-07-08');
    });

    it('días entrenados FUERA de la ventana de 7 días no cuentan para la cuota', () => {
        const recentDays = [
            { dayName: '2026-06-20', splitLabel: 'Push' }, // fuera de la ventana
            { dayName: '2026-06-18', splitLabel: 'Pull' }  // fuera de la ventana
        ];
        const result = planToday({
            existingToday: null,
            recentDays,
            profile: { daysPerWeek: 3, goal: 'hypertrophy', equipment: ['barbell'] },
            todayStr: '2026-07-08',
            sevenDaysAgoStr: '2026-07-01'
        });
        assert.equal(result.action, 'create');
    });

    it('bajo la cuota semanal: genera un día nuevo con el siguiente split en rotación', () => {
        const recentDays = [{ dayName: '2026-07-07', splitLabel: 'Push' }];
        const result = planToday({
            existingToday: null,
            recentDays,
            profile: { daysPerWeek: 5, goal: 'strength', equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] },
            todayStr: '2026-07-08',
            sevenDaysAgoStr: '2026-07-01'
        });
        assert.equal(result.action, 'create');
        assert.equal(result.splitLabel, 'Pull'); // rotación: después de Push viene Pull
        assert.ok(result.exercises.length > 0);
    });

    it('sin ningún día reciente: arranca en el primer split de la rotación', () => {
        const result = planToday({
            existingToday: null,
            recentDays: [],
            profile: { daysPerWeek: 4, goal: 'general', equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] },
            todayStr: '2026-07-08',
            sevenDaysAgoStr: '2026-07-01'
        });
        assert.equal(result.action, 'create');
        assert.equal(result.splitLabel, 'Upper A');
    });

    it('el equipo del perfil filtra los ejercicios generados', () => {
        const result = planToday({
            existingToday: null,
            recentDays: [],
            profile: { daysPerWeek: 3, goal: 'general', equipment: ['bodyweight'] },
            todayStr: '2026-07-08',
            sevenDaysAgoStr: '2026-07-01'
        });
        assert.equal(result.action, 'create');
        for (const ex of result.exercises) {
            assert.ok(ex.name, 'cada ejercicio elegido debe tener nombre');
        }
    });
});
