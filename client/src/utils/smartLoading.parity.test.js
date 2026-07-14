// Tests de paridad cliente/servidor (P1 del plan de mejoras). El proyecto NO
// comparte código cliente/servidor a propósito (ver "Backend único" en CLAUDE.md)
// — Smart Loading y plateau están duplicados deliberadamente en los dos lados.
// Estos tests importan AMBAS copias directamente (sí, cruzando de client/ a
// server/ — son módulos ES planos sin dependencias de DOM ni Prisma) para
// detectar si algún día se corrige un bug en un lado y se olvida el otro.
import { describe, it, expect } from 'vitest';
import {
    adjustRepRangeForPhase as clientAdjust,
    computeWorkoutSuggestion as clientSuggest,
    pickWorkReference as clientPick
} from './smartLoading.js';
import {
    adjustRepRangeForPhase as serverAdjust,
    computeWorkoutSuggestion as serverSuggest,
    pickWorkReference as serverPick,
    detectPlateauForExercise,
    effectiveWorkoutSet
} from '../../../server/src/logic.js';
import { detectPlateau, epley1RM } from './exerciseName.js';

describe('adjustRepRangeForPhase: paridad cliente/servidor', () => {
    const fixtures = [
        { lo: 8, hi: 12, phase: 'intensification' }, // 8-12 -> 4-6
        { lo: 8, hi: 12, phase: 'accumulation' },     // 8-12 -> 8-18
        { lo: 8, hi: 12, phase: 'deload' },           // sin cambio de rango (solo afecta peso)
        { lo: 8, hi: 12, phase: 'custom' },
        { lo: 8, hi: 12, phase: null },
        { lo: 5, hi: 5, phase: 'intensification' },   // rango de una sola rep
        { lo: 1, hi: 3, phase: 'intensification' }    // lo ya pequeño: no debe bajar de 1
    ];

    it.each(fixtures)('coincide para lo=$lo hi=$hi phase=$phase', ({ lo, hi, phase }) => {
        expect(clientAdjust(lo, hi, phase)).toEqual(serverAdjust(lo, hi, phase));
    });

    it('intensification: 8-12 -> 4-6 en ambos lados', () => {
        expect(clientAdjust(8, 12, 'intensification')).toEqual({ lo: 4, hi: 6 });
        expect(serverAdjust(8, 12, 'intensification')).toEqual({ lo: 4, hi: 6 });
    });

    it('accumulation: 8-12 -> 8-18 en ambos lados', () => {
        expect(clientAdjust(8, 12, 'accumulation')).toEqual({ lo: 8, hi: 18 });
        expect(serverAdjust(8, 12, 'accumulation')).toEqual({ lo: 8, hi: 18 });
    });
});

describe('computeWorkoutSuggestion: paridad cliente/servidor', () => {
    const fixtures = [
        {
            name: 'single set al tope',
            sessions: [{ sets: [{ weight: 100, reps: 12, rpe: 8 }] }],
            targetReps: '8-12', increment: 2.5, phase: null
        },
        {
            name: 'top-set + backoffs (banca real)',
            sessions: [{
                sets: [
                    { weight: 110, reps: 1, rpe: 10 },
                    { weight: 100, reps: 4, rpe: 10 },
                    { weight: 100, reps: 3, rpe: 10 }
                ]
            }],
            targetReps: '8-12', increment: 2.5, phase: 'intensification'
        },
        {
            name: 'drop set no contamina',
            sessions: [{
                sets: [
                    { weight: 167.6, reps: 2, rpe: 10 },
                    { weight: 147.6, reps: 3, rpe: 10 },
                    { weight: 87.6, reps: 8, rpe: 9 }
                ]
            }],
            targetReps: '8-12', increment: 5, phase: 'intensification'
        },
        {
            name: 'no todas al techo: no sube peso',
            sessions: [{
                sets: [
                    { weight: 100, reps: 12, rpe: 8 },
                    { weight: 100, reps: 10, rpe: 9 }
                ]
            }],
            targetReps: '8-12', increment: 2.5, phase: null
        },
        {
            name: 'RIR alto bump 2',
            sessions: [{ sets: [{ weight: 100, reps: 9, rpe: 7 }] }],
            targetReps: '8-12', increment: 2.5, phase: null
        },
        {
            name: 'unilateral lado débil',
            sessions: [{ sets: [{ weight: 20, reps: 12, weightRight: 18, repsRight: 10, rpe: 8 }] }],
            targetReps: '8-12', increment: 2.5, phase: null
        }
    ];

    it.each(fixtures)('$name — mismo peso/reps/rationale', ({ sessions, targetReps, increment, phase }) => {
        const c = clientSuggest(sessions, targetReps, increment, phase);
        const s = serverSuggest(sessions, targetReps, increment, phase);
        // El cliente añade `phase` al objeto; el servidor no. Comparar lo numérico + rationale.
        expect(c?.weight).toEqual(s?.weight);
        expect(c?.reps).toEqual(s?.reps);
        expect(c?.rationale).toEqual(s?.rationale);
        expect(c?.basedOn).toEqual(s?.basedOn);
    });

    it('pickWorkReference coincide en el caso top+backoff', () => {
        const sets = [
            { weight: 110, reps: 1, rpe: 10 },
            { weight: 100, reps: 4, rpe: 10 },
            { weight: 100, reps: 3, rpe: 10 }
        ].map(effectiveWorkoutSet);
        const c = clientPick(sets, 4);
        const s = serverPick(sets, 4);
        expect(c.weight).toEqual(s.weight);
        expect(c.reps).toEqual(s.reps);
        expect(c.minReps).toEqual(s.minReps);
        expect(c.rir).toEqual(s.rir);
    });
});

describe('plateau: mismos fixtures, implementaciones deliberadamente distintas', () => {
    // Diferencia intencional (documentada en CLAUDE.md/context.md): el cliente
    // (detectPlateau) agrupa por NOMBRE CANÓNICO de ejercicio (consolida variantes
    // de nombre entre rutinas); el servidor (detectPlateauForExercise) agrupa por
    // el id exacto de un WorkoutLog dentro de la rutina activa, sin normalizar
    // nombres. Este test NO prueba que compartan agrupación — prueba que, dado el
    // MISMO conjunto de mejores-1RM por sesión ya agrupado, ambas aplican la misma
    // regla de "mitad reciente no supera a la mitad antigua" y llegan al mismo
    // veredicto booleano.
    const buildClientSessions = (best1RMs) => best1RMs.map((rm, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, best1RM: rm }));
    const buildServerLogs = (weightsReps) => weightsReps.map(([weight, reps], i) => ({
        date: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
        sets: [{ weight, reps, weightRight: null, repsRight: null }]
    }));

    it('mejora clara: ninguno marca plateau', () => {
        const weightsReps = [[80, 8], [85, 8], [100, 8], [110, 8]];
        const best1RMs = weightsReps.map(([w, r]) => epley1RM(w, r));
        expect(detectPlateau(buildClientSessions(best1RMs)).isPlateaued).toBe(false);
        expect(detectPlateauForExercise(buildServerLogs(weightsReps))).toBe(false);
    });

    it('estancamiento (empate): ambos marcan plateau', () => {
        const weightsReps = [[100, 8], [100, 8], [100, 8], [100, 8]];
        const best1RMs = weightsReps.map(([w, r]) => epley1RM(w, r));
        expect(detectPlateau(buildClientSessions(best1RMs)).isPlateaued).toBe(true);
        expect(detectPlateauForExercise(buildServerLogs(weightsReps))).toBe(true);
    });

    it('menos de 4 sesiones: ambos dicen que NO hay plateau (sin señal)', () => {
        const weightsReps = [[100, 8], [90, 8], [80, 8]];
        const best1RMs = weightsReps.map(([w, r]) => epley1RM(w, r));
        expect(detectPlateau(buildClientSessions(best1RMs)).isPlateaued).toBe(false);
        expect(detectPlateauForExercise(buildServerLogs(weightsReps))).toBe(false);
    });
});
