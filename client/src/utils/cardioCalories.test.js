import { describe, it, expect } from 'vitest';
import { estimateCardioCalories, segmentMet } from './cardioCalories';

describe('segmentMet', () => {
    it('caminadora sube con inclinación', () => {
        const flat = segmentMet('caminadora', { speed: 5, incline: 0 });
        const steep = segmentMet('caminadora', { speed: 5, incline: 12 });
        expect(steep).toBeGreaterThan(flat);
        expect(flat).toBeGreaterThan(2);
    });

    it('bici y elíptica tienen base estable', () => {
        expect(segmentMet('bici', {})).toBeGreaterThan(5);
        expect(segmentMet('eliptica', {})).toBeGreaterThan(3);
    });
});

describe('estimateCardioCalories', () => {
    it('null sin tramos válidos', () => {
        expect(estimateCardioCalories({ activity: 'caminadora', segments: [] })).toBeNull();
        expect(estimateCardioCalories({
            activity: 'caminadora',
            segments: [{ durationMin: 0 }]
        })).toBeNull();
    });

    it('estima más kcal con más minutos o más peso', () => {
        const segs = [
            { durationMin: 10, incline: 12, speed: 5 },
            { durationMin: 5, incline: 3, speed: 5 },
            { durationMin: 10, incline: 12, speed: 5 }
        ];
        const a = estimateCardioCalories({ activity: 'caminadora', segments: segs, weightKg: 70 });
        const b = estimateCardioCalories({ activity: 'caminadora', segments: segs, weightKg: 90 });
        const short = estimateCardioCalories({
            activity: 'caminadora',
            segments: [{ durationMin: 10, incline: 12, speed: 5 }],
            weightKg: 70
        });
        expect(a).toBeGreaterThan(50);
        expect(b).toBeGreaterThan(a);
        expect(short).toBeLessThan(a);
    });

    it('usa 70kg por defecto si no hay peso', () => {
        const segs = [{ durationMin: 30, incline: 0, speed: 5 }];
        const withDefault = estimateCardioCalories({ activity: 'caminadora', segments: segs });
        const explicit = estimateCardioCalories({
            activity: 'caminadora',
            segments: segs,
            weightKg: 70
        });
        expect(withDefault).toBe(explicit);
    });
});
