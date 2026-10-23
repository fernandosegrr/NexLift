import { exact, fail, identifier, instant, isSessionVersion, operationId, record, text } from '../validation/primitives.js';
import { parseChanges, parseResolution } from './conflicts.js';
import type { Resolution, SessionChanges } from './conflicts.js';
import { readSetInput } from './workoutSessions.js';
import type { SetValues } from './workoutSessions.js';

export const operationKinds = ['workout.create', 'workout.appendSet', 'workout.replaceSets', 'workout.delete', 'rest.create'] as const;
export type OperationKind = typeof operationKinds[number];
export function isOperationKind(value: unknown): value is OperationKind {
    return operationKinds.some(kind => kind === value);
}
export type OperationSource = 'pwa' | 'shortcut';
export interface OperationIdentity { operationId: string; source: OperationSource; performedAt: string }
export interface OperationSetInput {
    weight: number; reps: number; rpe?: number | null; rir?: number; completed?: boolean;
    weightRight?: number | null; repsRight?: number | null;
}
/** HTTP input before the historical explicit normalization boundary. */
export type OperationRequest = OperationIdentity & (
    { kind: 'workout.create'; exerciseId: string; sets: OperationSetInput[]; notes?: string | null }
    | { kind: 'rest.create'; note?: string }
    | { kind: 'workout.appendSet'; logId: string; expectedVersion: string; sets: OperationSetInput[] }
    | { kind: 'workout.replaceSets'; logId: string; expectedVersion: string; sets: OperationSetInput[]; changes?: never; resolution?: never }
    | { kind: 'workout.replaceSets'; logId: string; expectedVersion: string; changes: SessionChanges; resolution?: Resolution; sets?: never }
    | { kind: 'workout.delete'; logId: string; expectedVersion: string; resolution?: Resolution });
export type WorkoutOperation = OperationIdentity & (
    { kind: 'workout.create'; exerciseId: string; sets: SetValues[]; notes: string | null }
    | { kind: 'rest.create'; note: string }
    | { kind: 'workout.appendSet'; logId: string; expectedVersion: string; sets: SetValues[] }
    | { kind: 'workout.replaceSets'; logId: string; expectedVersion: string; sets: SetValues[]; changes?: never; resolution?: never }
    | { kind: 'workout.replaceSets'; logId: string; expectedVersion: string; changes: SessionChanges; resolution?: Resolution; sets?: never }
    | { kind: 'workout.delete'; logId: string; expectedVersion: string; resolution?: Resolution });
/** Internal canonical hash input, not a Prisma row or an additional HTTP field. */
export type CanonicalOperation = WorkoutOperation & { performedDay: string };
export interface OperationNormalization {
    sanitizeSets: (sets: Record<string, unknown>[]) => { error?: string; sets?: SetValues[] };
    mexicoCityDateStr: (date: Date) => string;
}
export function parseWorkoutOperation(value: unknown, context: OperationNormalization): CanonicalOperation {
    const input = record(value, 'Operation');
    const common = ['operationId', 'kind', 'source', 'performedAt'];
    const kind = input.kind;
    if (!isOperationKind(kind)) fail('kind', 'Unsupported operation kind');
    const fields = { 'workout.create': ['exerciseId', 'sets', 'notes'], 'workout.appendSet': ['logId', 'expectedVersion', 'sets'],
        'workout.replaceSets': ['logId', 'expectedVersion', 'sets', 'changes', 'resolution'], 'workout.delete': ['logId', 'expectedVersion', 'resolution'], 'rest.create': ['note'] };
    exact(input, [...common, ...fields[kind]], 'operation');
    const id = operationId(input.operationId), performedAt = instant(input.performedAt);
    if (input.source !== 'pwa' && input.source !== 'shortcut') fail('source', 'source must be pwa or shortcut');
    const identity: OperationIdentity & { performedDay: string } = { operationId: id, source: input.source, performedAt, performedDay: context.mexicoCityDateStr(new Date(performedAt)) };
    if (kind === 'rest.create') return { ...identity, kind, note: text(input.note, 'Día de descanso', 'note') };
    const resourceId = identifier(kind === 'workout.create' ? input.exerciseId : input.logId, kind === 'workout.create' ? 'exerciseId' : 'logId');
    const version = input.expectedVersion;
    if (kind !== 'workout.create' && !isSessionVersion(version)) fail('expectedVersion', 'expectedVersion must be the current sessionVersion');
    const resolution = input.resolution === undefined ? undefined : parseResolution(input.resolution);
    if (resolution?.originalOperationId === id) fail('resolution', 'A resolution requires a new operationId');
    // This second branch narrows the version without asserting unchecked data.
    if (kind === 'workout.delete' && isSessionVersion(version)) return { ...identity, kind, logId: resourceId, expectedVersion: version, ...(resolution ? { resolution } : {}) };
    if (kind === 'workout.replaceSets' && input.changes !== undefined && isSessionVersion(version)) {
        if (input.sets !== undefined) fail('sets', 'Use changes or sets, never both');
        return { ...identity, kind, logId: resourceId, expectedVersion: version, changes: parseChanges(input.changes), ...(resolution ? { resolution } : {}) };
    }
    if (input.resolution !== undefined) fail('resolution', 'Resolution requires a partial patch');
    const parsed = context.sanitizeSets(readSetInput(input.sets));
    if (parsed.error) fail('sets', parsed.error);
    if (!parsed.sets) fail('sets', 'sets must be an array');
    const sets = parsed.sets;
    if (kind === 'workout.appendSet' && sets.length !== 1) fail('sets', 'appendSet requires exactly one set');
    if (kind === 'workout.create') {
        if (!sets.some(set => set.weight > 0 && set.reps > 0)) fail('sets', 'At least one set with work is required');
        return { ...identity, kind, exerciseId: resourceId, notes: text(input.notes, null, 'notes'), sets };
    }
    if ((kind === 'workout.appendSet' || kind === 'workout.replaceSets') && isSessionVersion(version)) return { ...identity, kind, logId: resourceId, expectedVersion: version, sets };
    return fail('kind', 'Unsupported operation kind');
}
