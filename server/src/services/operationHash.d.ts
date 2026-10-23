import type { CanonicalOperation } from '@nexlift/shared';
export interface SessionVersionInput { id: string; exerciseId: string; date: string | Date; notes?: string | null; sets: { id: string; setNumber: number; [field: string]: unknown }[] }
export function requestHash(operation: CanonicalOperation): string;
export function sessionVersion(log: SessionVersionInput): string;
