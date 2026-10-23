type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
function exerciseKey(ownerId: string): string { return `nexlift_lastExercise:${encodeURIComponent(ownerId)}`; }
export function readSelectedExercise(ownerId: string | null | undefined, storage?: PreferenceStorage): string {
    if (!ownerId) return '';
    try { return (storage ?? globalThis.localStorage).getItem(exerciseKey(ownerId)) ?? ''; }
    catch { return ''; }
}
export function writeSelectedExercise(ownerId: string | null | undefined, exercise: string, storage?: PreferenceStorage): void {
    if (!ownerId) return;
    try { (storage ?? globalThis.localStorage).setItem(exerciseKey(ownerId), exercise); }
    catch { /* A visual preference must not block training or chart navigation. */ }
}
