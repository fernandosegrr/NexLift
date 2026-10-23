import type { CoachReport, CoachAnswer, CoachCheckIn } from '@nexlift/shared';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const array = (v: unknown): v is unknown[] => Array.isArray(v);
export function readCoachReport(value: unknown): CoachReport {
    if (!obj(value) || value.version !== 'coach-1' || !obj(value.volume) || !array(value.volume.weeks) || !array(value.volume.unknown) || !obj(value.recovery) || !array(value.recovery.recent) || !array(value.recovery.observations) || !array(value.plateaus) || !array(value.loading) || !obj(value.hypertrophy) || !array(value.hypertrophy.weight) || !array(value.hypertrophy.measurements) || !array(value.facts) || !array(value.blocks)) throw Error('Respuesta Coach incompatible.');
    for (const p of value.plateaus) if (!obj(p) || typeof p.exerciseId !== 'string' || !array(p.points) || !array(p.observations) || !array(p.missing)) throw Error('Diagnóstico incompatible.');
    for (const w of value.volume.weeks) if (!obj(w) || typeof w.direct !== 'number' || !Number.isFinite(w.direct) || typeof w.indirect !== 'number' || !Number.isFinite(w.indirect) || !array(w.contributions)) throw Error('Volumen incompatible.');
    return value as unknown as CoachReport;
}
export function readCoachAnswer(value: unknown): CoachAnswer {
    if (!obj(value) || !['provider', 'deterministic'].includes(String(value.mode)) || !array(value.text) || value.text.some(t => typeof t !== 'string') || !array(value.views) || value.views.some(v => !['volume', 'recovery', 'plateau', 'loading', 'hypertrophy', 'timeline'].includes(String(v))) || !array(value.factIds) || !array(value.limitations) || !array(value.followUps)) throw Error('Respuesta del asistente incompatible.');
    if (value.analysis !== undefined) readCoachReport(value.analysis);
    return value as unknown as CoachAnswer;
}
export function readCheckIns(value: unknown): CoachCheckIn[] {
    if (!array(value) || value.some(v => !obj(v) || typeof v.date !== 'string' || !obj(v.soreness))) throw Error('Check-ins incompatibles.');
    return value as CoachCheckIn[];
}
