import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    mexicoCityDateStr, mexicoCityDayBounds, mexicoCityHour, dayOfWeekFromDateStr,
    resolveTargetDate, getTodayName, normalizeDay,
    getActiveBlock, currentWeekInBlock, getRoutinePhaseStatus, adjustRepRangeForPhase,
    parseRepRange, roundWorkoutWeight, computeWorkoutSuggestion, detectPlateauForExercise,
    convertShortcutRir, pickNextSplitDay, resolveWeightIncrement
} from './logic.js';

describe('helpers CDMX (zona horaria)', () => {
    it('mexicoCityDateStr: 23:30 CDMX cae de madrugada en UTC del día SIGUIENTE — el bug histórico exacto', () => {
        // 15 enero 2026, 23:30 hora CDMX (UTC-6) = 16 enero 2026, 05:30 UTC.
        // Un `.toISOString().split("T")[0]` ingenuo sobre este instante da "2026-01-16"
        // (incorrecto); el día calendario CDMX real es "2026-01-15".
        const instant = new Date('2026-01-16T05:30:00Z');
        assert.equal(mexicoCityDateStr(instant), '2026-01-15');
    });

    it('mexicoCityDateStr: mañana temprano en CDMX es el mismo día en UTC', () => {
        // 15 enero 2026, 08:00 CDMX = 15 enero 2026, 14:00 UTC — sin cruce de día.
        const instant = new Date('2026-01-15T14:00:00Z');
        assert.equal(mexicoCityDateStr(instant), '2026-01-15');
    });

    it('mexicoCityDayBounds: el instante original cae dentro de [start, end)', () => {
        const instant = new Date('2026-01-16T05:30:00Z'); // 15 ene 23:30 CDMX
        const { start, end, dateStr } = mexicoCityDayBounds(instant);
        assert.equal(dateStr, '2026-01-15');
        assert.ok(start <= instant && instant < end, 'el instante debe caer dentro de su propio día CDMX');
        assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
    });

    it('mexicoCityHour: 05:30 UTC es 23:30 (hora 23) en CDMX', () => {
        assert.equal(mexicoCityHour(new Date('2026-01-16T05:30:00Z')), 23);
    });

    it('mexicoCityHour: mediodía UTC es madrugada en CDMX', () => {
        // 12:00 UTC = 06:00 CDMX (UTC-6)
        assert.equal(mexicoCityHour(new Date('2026-01-15T12:00:00Z')), 6);
    });

    it('dayOfWeekFromDateStr: coincide con getUTCDay anclado a mediodía UTC (sin ambigüedad de zona horaria)', () => {
        const dateStr = '2026-03-15';
        const expected = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
        assert.equal(dayOfWeekFromDateStr(dateStr), expected);
    });

    it('resolveTargetDate: sin parámetro usa el día CDMX actual', () => {
        const result = resolveTargetDate(undefined);
        const expected = mexicoCityDayBounds(new Date()).start;
        assert.equal(result.getTime(), expected.getTime());
    });

    it('resolveTargetDate: con fecha explícita nunca se cruza al día anterior/siguiente', () => {
        const result = resolveTargetDate('2026-01-15');
        assert.equal(mexicoCityDateStr(result), '2026-01-15');
    });

    it('getTodayName/normalizeDay: consistentes entre sí', () => {
        const monday = new Date('2026-01-05T12:00:00Z'); // lunes (ancla a mediodía UTC)
        const name = getTodayName(monday);
        assert.equal(normalizeDay(name), normalizeDay(name)); // idempotente
        assert.equal(normalizeDay('Lunes'), normalizeDay('lunes'));
    });
});

describe('convertShortcutRir (RIR crudo del Atajo <-> 10-RIR guardado)', () => {
    it('ida y vuelta: aplicar dos veces devuelve el valor original', () => {
        for (const rir of [0, 1, 2, 3, 4]) {
            assert.equal(convertShortcutRir(convertShortcutRir(rir)), rir);
        }
    });

    it('RIR 3 crudo se guarda como rpe 7', () => {
        assert.equal(convertShortcutRir(3), 7);
    });

    it('null/undefined pasan igual (sin RIR reportado)', () => {
        assert.equal(convertShortcutRir(null), null);
        assert.equal(convertShortcutRir(undefined), null);
    });
});

describe('adjustRepRangeForPhase', () => {
    it('intensification: 8-12 -> 4-6 (rango a la mitad)', () => {
        assert.deepEqual(adjustRepRangeForPhase(8, 12, 'intensification'), { lo: 4, hi: 6 });
    });

    it('accumulation: 8-12 -> 8-18 (techo +50%)', () => {
        assert.deepEqual(adjustRepRangeForPhase(8, 12, 'accumulation'), { lo: 8, hi: 18 });
    });

    it('deload: sin cambio de rango (el ajuste de descarga es al peso final, no al rango)', () => {
        assert.deepEqual(adjustRepRangeForPhase(8, 12, 'deload'), { lo: 8, hi: 12 });
    });

    it('custom / sin fase: sin cambios', () => {
        assert.deepEqual(adjustRepRangeForPhase(8, 12, 'custom'), { lo: 8, hi: 12 });
        assert.deepEqual(adjustRepRangeForPhase(8, 12, null), { lo: 8, hi: 12 });
    });

    it('intensification nunca baja el mínimo de 1', () => {
        assert.deepEqual(adjustRepRangeForPhase(1, 2, 'intensification'), { lo: 1, hi: 1 });
    });
});

describe('parseRepRange', () => {
    it('rango normal "8-12"', () => {
        assert.deepEqual(parseRepRange('8-12'), { lo: 8, hi: 12 });
    });
    it('un solo número "5"', () => {
        assert.deepEqual(parseRepRange('5'), { lo: 5, hi: 5 });
    });
    it('sin números (ej. "AMRAP") cae al default 8-12', () => {
        assert.deepEqual(parseRepRange('AMRAP'), { lo: 8, hi: 12 });
    });
});

describe('resolveWeightIncrement', () => {
    it('Piernas -> 5kg', () => {
        assert.equal(resolveWeightIncrement('Piernas'), 5);
    });
    it('otro grupo -> 2.5kg', () => {
        assert.equal(resolveWeightIncrement('Pecho'), 2.5);
    });
    it('sin grupo: infiere piernas por nombre', () => {
        assert.equal(resolveWeightIncrement(null, 'sentadilla hack'), 5);
        assert.equal(resolveWeightIncrement('', 'prensa'), 5);
        assert.equal(resolveWeightIncrement(null, 'press de banca plano'), 2.5);
    });
    it('legs (inglés del catálogo cliente) también es 5kg', () => {
        assert.equal(resolveWeightIncrement('legs'), 5);
    });
});

describe('roundWorkoutWeight', () => {
    it('usa la rejilla del incremento si el peso base ya cae en ella', () => {
        assert.equal(roundWorkoutWeight(102.5, 2.5, 100), 102.5);
    });
    it('usa rejilla de medio kilo si el peso base no cae en la rejilla del incremento', () => {
        assert.equal(roundWorkoutWeight(7.1, 2.5, 6.8), 7);
    });
});

describe('computeWorkoutSuggestion', () => {
    it('tope del rango alcanzado (una sola serie): sube peso y reinicia en el mínimo', () => {
        // 100kg x 12 (tope de 8-12) con RIR 2 (rpe guardado = 10-2 = 8)
        const sessions = [{ sets: [{ weight: 100, reps: 12, rpe: 8 }] }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, null);
        assert.equal(result.weight, 102.5);
        assert.equal(result.reps, 8);
    });

    it('dentro del rango con RIR alto (>=3): bump de 2 reps', () => {
        // RIR 3 crudo -> rpe guardado = 10-3 = 7
        const sessions = [{ sets: [{ weight: 100, reps: 9, rpe: 7 }] }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, null);
        assert.equal(result.weight, 100);
        assert.equal(result.reps, 11); // 9 + 2
    });

    it('dentro del rango con RIR bajo (<3): bump de solo 1 rep', () => {
        // RIR 1 crudo -> rpe guardado = 10-1 = 9
        const sessions = [{ sets: [{ weight: 100, reps: 9, rpe: 9 }] }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, null);
        assert.equal(result.weight, 100);
        assert.equal(result.reps, 10); // 9 + 1
    });

    it('el bump nunca supera el techo del rango', () => {
        const sessions = [{ sets: [{ weight: 100, reps: 11, rpe: 7 }] }]; // RIR 3, bump 2 -> 13, tope 12
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, null);
        assert.equal(result.reps, 12);
    });

    it('fase intensification reduce el rango efectivo usado por la sugerencia', () => {
        // Rango real 8-12 -> con intensification pasa a 4-6. 100kgx6 alcanza el tope 6.
        const sessions = [{ sets: [{ weight: 100, reps: 6, rpe: 8 }] }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, 'intensification');
        assert.equal(result.weight, 102.5); // sube de carga
        assert.equal(result.reps, 4);       // reinicia en el lo ajustado
    });

    it('sin sesiones devuelve null', () => {
        assert.equal(computeWorkoutSuggestion([], '8-12', 2.5, null), null);
    });

    it('unilateral: usa el lado más débil para decidir la sugerencia', () => {
        const sessions = [{ sets: [{ weight: 20, reps: 12, weightRight: 18, repsRight: 10, rpe: 8 }] }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, null);
        // Lado débil: weight=18, reps=10 -> no llega al tope (12), suma reps
        assert.equal(result.weight, 18);
        assert.equal(result.reps, 11);
    });

    it('top-set + backoffs: ancla en el trabajo real, no en el single de tope', () => {
        // Caso real del usuario (banca): 110×1 top + 100×4/3 backoffs.
        // En intensificación (rango 4-6) debe sugerir progresar 100kg, no 110×2.
        const sessions = [{
            sets: [
                { weight: 110, reps: 1, rpe: 10 },
                { weight: 100, reps: 4, rpe: 10 },
                { weight: 100, reps: 3, rpe: 10 }
            ]
        }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, 'intensification');
        assert.equal(result.weight, 100);
        assert.equal(result.reps, 5); // mejor al peso de trabajo = 4, +1
    });

    it('drop set ligero no se convierte en la referencia de trabajo', () => {
        // Top 167×2, segundo 147×3, drop 87×8 — el drop queda fuera (<75% del max)
        // y al no tocar el suelo del rango (4), se elige el de más reps entre los main: 147×3.
        const sessions = [{
            sets: [
                { weight: 167.6, reps: 2, rpe: 10 },
                { weight: 147.6, reps: 3, rpe: 10 },
                { weight: 87.6, reps: 8, rpe: 9 }
            ]
        }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 5, 'intensification');
        assert.equal(result.weight, 147.6);
        assert.equal(result.reps, 4);
    });

    it('sube de peso solo si TODAS las series al peso de trabajo tocan el techo', () => {
        // Mejor 12, otra 10 — no subir todavía; emparejar a 11
        const sessions = [{
            sets: [
                { weight: 100, reps: 12, rpe: 8 },
                { weight: 100, reps: 10, rpe: 9 }
            ]
        }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, null);
        assert.equal(result.weight, 100);
        assert.equal(result.reps, 11);
    });

    it('todas las series al techo: sí sube de peso', () => {
        const sessions = [{
            sets: [
                { weight: 100, reps: 12, rpe: 8 },
                { weight: 100, reps: 12, rpe: 8 }
            ]
        }];
        const result = computeWorkoutSuggestion(sessions, '8-12', 2.5, null);
        assert.equal(result.weight, 102.5);
        assert.equal(result.reps, 8);
    });
});

describe('detectPlateauForExercise', () => {
    it('menos de 4 sesiones: sin señal (false)', () => {
        const logs = [
            { date: new Date('2026-01-01T12:00:00Z'), sets: [{ weight: 100, reps: 8 }] },
            { date: new Date('2026-01-08T12:00:00Z'), sets: [{ weight: 90, reps: 8 }] },
            { date: new Date('2026-01-15T12:00:00Z'), sets: [{ weight: 80, reps: 8 }] }
        ];
        assert.equal(detectPlateauForExercise(logs), false);
    });

    it('empate entre mitad antigua y reciente cuenta como plateau', () => {
        const logs = [1, 2, 3, 4].map(i => ({
            date: new Date(`2026-01-${String(i).padStart(2, '0')}T12:00:00Z`),
            sets: [{ weight: 100, reps: 8 }]
        }));
        assert.equal(detectPlateauForExercise(logs), true);
    });

    it('mejora clara en la mitad reciente NO es plateau', () => {
        const weights = [80, 85, 100, 110];
        const logs = weights.map((w, i) => ({
            date: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
            sets: [{ weight: w, reps: 8 }]
        }));
        assert.equal(detectPlateauForExercise(logs), false);
    });
});

describe('getActiveBlock / currentWeekInBlock', () => {
    it('sin bloques arrancados: no hay activo', () => {
        assert.equal(getActiveBlock([{ id: '1', startedAt: null }]), null);
        assert.equal(getActiveBlock([]), null);
    });

    it('el bloque activo es el de startedAt más reciente', () => {
        const blocks = [
            { id: 'old', startedAt: new Date('2026-01-01T00:00:00Z') },
            { id: 'new', startedAt: new Date('2026-02-01T00:00:00Z') },
            { id: 'never-started', startedAt: null }
        ];
        assert.equal(getActiveBlock(blocks).id, 'new');
    });

    it('currentWeekInBlock: semana 1 el día que arranca, semana 2 a los 7 días', () => {
        const start = new Date('2026-01-01T00:00:00Z');
        const block = { startedAt: start };
        assert.equal(currentWeekInBlock(block, start), 1);
        assert.equal(currentWeekInBlock(block, new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)), 2);
    });

    it('currentWeekInBlock: sin bloque arrancado devuelve null', () => {
        assert.equal(currentWeekInBlock({ startedAt: null }), null);
    });
});

describe('getRoutinePhaseStatus', () => {
    it('un bloque activo manda siempre, incluso sobre una ventana adaptativa vigente', () => {
        const routine = {
            blocks: [{ phase: 'accumulation', startedAt: new Date('2026-01-01T00:00:00Z') }],
            adaptiveDeloadUntil: new Date(Date.now() + 100000)
        };
        const status = getRoutinePhaseStatus(routine);
        assert.equal(status.source, 'block');
        assert.equal(status.phase, 'accumulation');
        assert.equal(status.isDeload, false);
    });

    it('sin bloque activo, cae a la ventana adaptativa si está vigente', () => {
        const routine = { blocks: [], adaptiveDeloadUntil: new Date(Date.now() + 100000) };
        const status = getRoutinePhaseStatus(routine);
        assert.equal(status.source, 'adaptive');
        assert.equal(status.isDeload, true);
        assert.equal(status.phase, 'deload');
    });

    it('sin bloque ni ventana vigente: sin fase', () => {
        const routine = { blocks: [], adaptiveDeloadUntil: null };
        const status = getRoutinePhaseStatus(routine);
        assert.equal(status.isDeload, false);
        assert.equal(status.phase, null);
    });

    it('ventana adaptativa YA VENCIDA no cuenta como descarga', () => {
        const routine = { blocks: [], adaptiveDeloadUntil: new Date(Date.now() - 100000) };
        const status = getRoutinePhaseStatus(routine);
        assert.equal(status.isDeload, false);
    });
});

describe('pickNextSplitDay (rotación de la Rutina diaria con IA)', () => {
    it('sin historial reciente: el primer label de la lista', () => {
        assert.equal(pickNextSplitDay(['Push', 'Pull', 'Legs'], []), 'Push');
    });

    it('rota al siguiente label después del último entrenado', () => {
        assert.equal(pickNextSplitDay(['Push', 'Pull', 'Legs'], ['Push']), 'Pull');
        assert.equal(pickNextSplitDay(['Push', 'Pull', 'Legs'], ['Pull']), 'Legs');
    });

    it('da la vuelta al llegar al final de la lista', () => {
        assert.equal(pickNextSplitDay(['Push', 'Pull', 'Legs'], ['Legs']), 'Push');
    });

    it('solo importa el ÚLTIMO label reciente, no todo el historial', () => {
        assert.equal(pickNextSplitDay(['Push', 'Pull', 'Legs'], ['Legs', 'Push', 'Pull']), 'Legs');
    });

    it('un label reciente que ya no existe en splitLabels (perfil reconfigurado) cae al primero', () => {
        assert.equal(pickNextSplitDay(['Upper A', 'Lower A'], ['Push']), 'Upper A');
    });

    it('lista de splits vacía devuelve null', () => {
        assert.equal(pickNextSplitDay([], ['Push']), null);
    });
});
