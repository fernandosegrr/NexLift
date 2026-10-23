/** RoutineBlock policy: newest started block wins, duration is informational.
 * Goal plans are a separate policy. No automatic transition or clock. */
export interface TrainingBlock { readonly startedAt?: Date | null; readonly phase: string; readonly durationWeeks?: number }
export interface PeriodizedRoutine<B extends TrainingBlock> { readonly blocks?: readonly B[] | null; readonly adaptiveDeloadUntil?: Date | null }
export type RoutinePhaseStatus<B extends TrainingBlock> =
    { readonly isDeload: boolean; readonly source: 'block'; readonly phase: string; readonly block: B } |
    { readonly isDeload: true; readonly source: 'adaptive'; readonly phase: 'deload'; readonly until: Date } |
    { readonly isDeload: false; readonly source: null; readonly phase: null };
export function getActiveTrainingBlock<B extends TrainingBlock>(blocks?: readonly B[] | null): B | null {
    const started = (blocks || []).filter(b => b.startedAt != null);
    if (!started.length) return null;
    return started.reduce((latest, b) => (b.startedAt && latest.startedAt && b.startedAt.getTime() > latest.startedAt.getTime() ? b : latest), started[0]);
}
export function elapsedWeekInBlock(block: TrainingBlock | null | undefined, now: Date): number | null {
    if (!block?.startedAt) return null;
    const daysSince = Math.floor((now.getTime() - block.startedAt.getTime()) / 86400000);
    return Math.floor(daysSince / 7) + 1;
}
export function routinePhaseStatusAt<B extends TrainingBlock>(routine: PeriodizedRoutine<B>, now: Date): RoutinePhaseStatus<B> {
    const activeBlock = getActiveTrainingBlock(routine.blocks || []);
    if (activeBlock) return { isDeload: activeBlock.phase === 'deload', source: 'block', phase: activeBlock.phase, block: activeBlock };
    if (routine.adaptiveDeloadUntil && routine.adaptiveDeloadUntil.getTime() > now.getTime()) {
        return { isDeload: true, source: 'adaptive', phase: 'deload', until: routine.adaptiveDeloadUntil };
    }
    return { isDeload: false, source: null, phase: null };
}
