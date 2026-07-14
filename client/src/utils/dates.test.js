import { describe, it, expect } from 'vitest';
import {
    mexicoCityDateStr,
    mexicoCityDayOfWeek,
    mexicoCityTodayName,
    mexicoCityLastNDays
} from './dates.js';

describe('dates.js CDMX (paridad con server)', () => {
    it('23:30 CDMX no cruza al día siguiente en UTC', () => {
        const instant = new Date('2026-01-16T05:30:00Z'); // 15 ene 23:30 CDMX
        expect(mexicoCityDateStr(instant)).toBe('2026-01-15');
        expect(mexicoCityDayOfWeek(instant)).toBe(4); // jueves
        expect(mexicoCityTodayName(instant)).toBe('Jueves');
    });

    it('ventana de gym 20:00 CDMX', () => {
        const gym = new Date('2026-01-16T02:00:00Z'); // 15 ene 20:00 CDMX
        expect(mexicoCityDateStr(gym)).toBe('2026-01-15');
        expect(mexicoCityTodayName(gym)).toBe('Jueves');
    });

    it('mexicoCityLastNDays incluye hoy como último', () => {
        const anchor = new Date('2026-01-16T05:30:00Z'); // aún 15 ene CDMX
        const days = mexicoCityLastNDays(3, anchor);
        expect(days).toHaveLength(3);
        expect(days[days.length - 1]).toBe('2026-01-15');
    });
});
