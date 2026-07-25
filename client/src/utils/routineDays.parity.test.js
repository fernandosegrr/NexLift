// Tests de paridad cliente/servidor para la resolución de "qué día de rutina
// toca hoy" (ver routineDays.js). El proyecto NO comparte código
// cliente/servidor a propósito (ver "Backend único" en CLAUDE.md) — importa
// AMBAS copias directamente (módulos ES planos, sin DOM ni Prisma) para
// detectar si un día se corrige un bug en un lado y se olvida el otro. Mismo
// patrón que smartLoading.parity.test.js.
import { describe, it, expect } from 'vitest';
import {
    findRoutineDayForWeekday as clientFind,
    scheduledRestWeekdays as clientRest,
    weekdayLabel, firstFreeWeekday, duplicateWeekdays, WEEKDAY_OPTIONS
} from './routineDays.js';
import {
    findRoutineDayForWeekday as serverFind,
    scheduledRestWeekdays as serverRest
} from '../../../server/src/logic.js';

describe('findRoutineDayForWeekday: paridad cliente/servidor', () => {
    const days = [
        { id: 'a', order: 0, weekday: 1 },
        { id: 'b', order: 1, weekday: 3 },
        { id: 'c', order: 2, weekday: null }
    ];

    it.each([1, 3, 5, null])('weekday=%s coincide en ambos lados', (weekday) => {
        expect(clientFind(days, weekday)?.id).toEqual(serverFind(days, weekday)?.id);
    });

    it('weekday 0 (Domingo) calza en ambos lados — no se trata como falsy', () => {
        const withSunday = [{ id: 's', order: 0, weekday: 0 }];
        expect(clientFind(withSunday, 0).id).toBe('s');
        expect(serverFind(withSunday, 0).id).toBe('s');
    });

    it('duplicado: ambos lados eligen el de menor order', () => {
        const dup = [
            { id: 'segundo', order: 5, weekday: 2 },
            { id: 'primero', order: 1, weekday: 2 }
        ];
        expect(clientFind(dup, 2).id).toBe('primero');
        expect(serverFind(dup, 2).id).toBe('primero');
    });
});

describe('scheduledRestWeekdays: paridad cliente/servidor', () => {
    const days = [
        { isRestDay: true, weekday: 6 },
        { isRestDay: true, weekday: 0 }, // Domingo
        { isRestDay: false, weekday: 1 },
        { isRestDay: true, weekday: null }
    ];

    it('mismo Set en ambos lados', () => {
        expect([...clientRest(days)].sort()).toEqual([...serverRest(days)].sort());
        expect([...clientRest(days)].sort()).toEqual([0, 6]);
    });
});

describe('routineDays.js — utilidades exclusivas de cliente', () => {
    it('weekdayLabel mapea el índice correcto, Domingo incluido', () => {
        expect(weekdayLabel(0)).toBe('Domingo');
        expect(weekdayLabel(1)).toBe('Lunes');
        expect(weekdayLabel(6)).toBe('Sábado');
        expect(weekdayLabel(null)).toBe(null);
    });

    it('firstFreeWeekday: vacío devuelve Lunes (primero en orden ES)', () => {
        expect(firstFreeWeekday([])).toBe(1);
        expect(WEEKDAY_OPTIONS[0]).toEqual({ value: 1, label: 'Lunes' });
    });

    it('firstFreeWeekday: salta los ya ocupados', () => {
        expect(firstFreeWeekday([{ weekday: 1 }, { weekday: 2 }])).toBe(3);
    });

    it('firstFreeWeekday: null cuando las 7 están tomadas', () => {
        const full = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday }));
        expect(firstFreeWeekday(full)).toBe(null);
    });

    it('duplicateWeekdays: detecta repetidos, ignora los null', () => {
        expect(duplicateWeekdays([{ weekday: 1 }, { weekday: 1 }, { weekday: null }, { weekday: null }])).toEqual([1]);
        expect(duplicateWeekdays([{ weekday: 1 }, { weekday: 2 }])).toEqual([]);
    });
});
