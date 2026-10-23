// Narrow declarations for existing JS ports; implementations stay in logic.js.
import type { SetValues } from '@nexlift/shared';
export function sanitizeSets(input: unknown): { error?: string; sets?: SetValues[] };
export function mexicoCityDateStr(date?: Date): string;
export function resolveIncomingWeekday(day: Record<string, unknown>): number | null | undefined;
export function validateRoutineDayWeekdays(days: {weekday: number | null | undefined}[]): {error?: string};
