import { describe, it, expect } from 'vitest';
import {
    canonicalExerciseKey, epley1RM, best1RMRecent, bestOneRepMaxForTarget,
    detectPlateau, groupHistoryByExercise
} from './exerciseName.js';

describe('canonicalExerciseKey', () => {
    it('ignora tildes, mayúsculas y prefijos de orden', () => {
        expect(canonicalExerciseKey('A1. Press Militar')).toBe(canonicalExerciseKey('press militar'));
        expect(canonicalExerciseKey('Sentadilla')).toBe(canonicalExerciseKey('sentadilla'));
    });

    it('unifica plurales/sinónimos declarados', () => {
        expect(canonicalExerciseKey('Elevaciones laterales')).toBe(canonicalExerciseKey('Elevacion lateral'));
        expect(canonicalExerciseKey('Curl mancuernas')).toBe(canonicalExerciseKey('Curl mancuerna'));
    });

    it('ignora paréntesis que solo aclaran grupo muscular', () => {
        expect(canonicalExerciseKey('Curl martillo (bíceps)')).toBe(canonicalExerciseKey('Curl martillo'));
    });

    it('quita el prefijo de orden "A1."', () => {
        expect(canonicalExerciseKey('A1. Press banca')).toBe(canonicalExerciseKey('Press banca'));
    });

    it('quita sufijos de grupo muscular entre paréntesis', () => {
        expect(canonicalExerciseKey('Press inclinado (pecho)')).toBe(canonicalExerciseKey('Press inclinado'));
    });

    it('NO fusiona variantes de equipamiento distintas', () => {
        expect(canonicalExerciseKey('Press inclinado (mancuernas)'))
            .not.toBe(canonicalExerciseKey('Press inclinado (smith)'));
    });

    it('NO fusiona ejercicios genuinamente distintos', () => {
        expect(canonicalExerciseKey('Press banca')).not.toBe(canonicalExerciseKey('Press militar'));
    });
});

describe('epley1RM', () => {
    it('1 rep devuelve el peso tal cual', () => {
        expect(epley1RM(100, 1)).toBe(100);
    });

    it('aplica la fórmula estándar para reps > 1', () => {
        expect(epley1RM(100, 10)).toBeCloseTo(100 * (1 + 10 / 30), 5);
    });

    it('acota reps absurdas (>36) para no inflar el estimado', () => {
        expect(epley1RM(100, 50)).toBe(epley1RM(100, 36));
    });

    it('peso o reps <= 0 devuelve 0', () => {
        expect(epley1RM(0, 10)).toBe(0);
        expect(epley1RM(100, 0)).toBe(0);
        expect(epley1RM(-5, 10)).toBe(0);
    });
});

describe('best1RMRecent', () => {
    it('sin sesiones devuelve 0', () => {
        expect(best1RMRecent([])).toBe(0);
        expect(best1RMRecent(null)).toBe(0);
    });

    it('toma el mejor de las últimas n sesiones', () => {
        const sessions = [{ best1RM: 50 }, { best1RM: 120 }, { best1RM: 90 }, { best1RM: 80 }];
        expect(best1RMRecent(sessions, 3)).toBe(120); // últimas 3: 120,90,80
    });
});

describe('bestOneRepMaxForTarget', () => {
    it('sin sesiones devuelve 0', () => {
        expect(bestOneRepMaxForTarget([], 5)).toBe(0);
    });

    it('solo cuenta series con reps <= target+1 (bug de v2.1.0)', () => {
        // Meta de 5 reps: una serie de 7 reps (target+1=6) NO es elegible, aunque su
        // Epley extrapolado sea mayor que un intento real cercano al máximo.
        const sessions = [
            { sets: [{ weight: 100, reps: 7 }] }, // no elegible (7 > 6)
            { sets: [{ weight: 115, reps: 1 }] }  // elegible (1 <= 6)
        ];
        const result = bestOneRepMaxForTarget(sessions, 5, 3);
        expect(result).toBe(epley1RM(115, 1));
    });

    it('sesiones sin serie elegible no cuentan ni a favor ni en contra', () => {
        const sessions = [
            { sets: [{ weight: 200, reps: 20 }] }, // no elegible, se ignora (no cuenta como 0)
            { sets: [{ weight: 110, reps: 3 }] }   // elegible
        ];
        const result = bestOneRepMaxForTarget(sessions, 2, 3);
        expect(result).toBe(epley1RM(110, 3));
    });
});

describe('detectPlateau', () => {
    it('menos de 4 sesiones: sin señal (isPlateaued=false)', () => {
        const sessions = [{ best1RM: 100 }, { best1RM: 90 }, { best1RM: 80 }];
        const result = detectPlateau(sessions);
        expect(result.isPlateaued).toBe(false);
        expect(result.sessionsConsidered).toBe(3);
    });

    it('empate entre mitad antigua y reciente cuenta como plateau', () => {
        const sessions = [{ best1RM: 100 }, { best1RM: 100 }, { best1RM: 100 }, { best1RM: 100 }];
        const result = detectPlateau(sessions);
        expect(result.isPlateaued).toBe(true);
    });

    it('mejora clara en la mitad reciente NO es plateau', () => {
        const sessions = [{ best1RM: 80 }, { best1RM: 85 }, { best1RM: 110 }, { best1RM: 120 }];
        const result = detectPlateau(sessions);
        expect(result.isPlateaued).toBe(false);
    });

    it('declive en la mitad reciente SÍ es plateau (no solo empate)', () => {
        const sessions = [{ best1RM: 90 }, { best1RM: 110 }, { best1RM: 100 }, { best1RM: 95 }];
        const result = detectPlateau(sessions);
        expect(result.isPlateaued).toBe(true);
    });
});

describe('groupHistoryByExercise', () => {
    it('agrupa variantes de nombre bajo la misma clave canónica', () => {
        const history = [
            { date: '2026-01-01T12:00:00Z', exercise: { name: 'Press banca' }, sets: [{ weight: 100, reps: 5 }] },
            { date: '2026-01-08T12:00:00Z', exercise: { name: 'A1. Press Banca' }, sets: [{ weight: 105, reps: 5 }] }
        ];
        const groups = groupHistoryByExercise(history);
        expect(groups.size).toBe(1);
        const g = [...groups.values()][0];
        expect(g.sessions.length).toBe(2);
        expect(g.names.size).toBe(2); // conserva ambos nombres originales
    });

    it('no fusiona una sesión nocturna en dos días', () => {
        const history = [
            { date: '2026-01-01T23:30:00Z', exercise: { name: 'Sentadilla' }, sets: [{ weight: 100, reps: 5 }] }
        ];
        const groups = groupHistoryByExercise(history);
        const g = [...groups.values()][0];
        expect(g.sessions.length).toBe(1);
    });

    it('en unilateral usa el lado más débil', () => {
        const history = [
            { date: '2026-01-01T12:00:00Z', exercise: { name: 'Curl unilateral' }, sets: [{ weight: 20, reps: 10, weightRight: 18, repsRight: 8 }] }
        ];
        const groups = groupHistoryByExercise(history);
        const g = [...groups.values()][0];
        // Lado débil: weight=min(20,18)=18, reps=min(10,8)=8
        expect(g.sessions[0].weight).toBe(18);
        expect(g.sessions[0].reps).toBe(8);
    });
});
