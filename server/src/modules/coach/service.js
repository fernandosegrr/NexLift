import { randomUUID, createHash } from 'node:crypto';
import { buildCoachReport, recommendCoachLoading } from '../../generated/coach.cjs';
import { trainingCivilDate, trainingCivilDayBounds, shiftTrainingCivilDate } from '../../generated/training.cjs';
import { CoachError, period, id, number, checkIn, civilDate, exerciseConfig, measurement, object } from './validation.js';
import { createCoachAssistant } from './assistant.js';
import { coachTablesAvailable } from './availability.js';
export const coachHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = date => date instanceof Date ? date.toISOString() : date;
const resultFingerprint = set => coachHash([set.id, set.workoutLogId, set.setNumber, set.weight, set.reps, set.rpe, set.completed, set.weightRight, set.repsRight]);
const referenceFingerprint = session => coachHash([iso(session.date), [...session.sets].sort((a, b) => a.id.localeCompare(b.id)).map(s => [s.id, s.weight, s.reps, s.rpe, s.completed, s.weightRight, s.repsRight])]);
export function createCoachService({ prisma, provider, now = () => new Date(), timeoutMs }) {
    const assistant = createCoachAssistant({ provider, timeoutMs });
    const ownsExercise = async (tx, userId, exerciseId) => { const e = await tx.exercise.findFirst({ where: { id: id(exerciseId), userId } }); if (!e) throw new CoachError('Ejercicio no disponible.', 404); return e; };
    const serial = work => prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 30000 });
    const snapshot = async (userId, daysValue) => {
        const time = now(), days = period(daysValue, time), today = trainingCivilDate(time);
        const since = trainingCivilDayBounds(shiftTrainingCivilDate(today, -Math.max(2 * days, 70)) + 'T12:00:00-06:00').start, until = trainingCivilDayBounds(time).end;
        return prisma.$transaction(async tx => {
            const [logs, exercises, configs, checkIns, body, measurements, blocks] = await Promise.all([
                tx.workoutLog.findMany({ where: { userId, date: { gte: since, lt: until } }, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: 5001,
                    select: { id: true, date: true, exerciseId: true, exerciseNameSnapshot: true, muscleGroupSnapshot: true, isUnilateralSnapshot: true, originRoutineId: true, sets: { orderBy: { setNumber: 'asc' }, select: { id: true, weight: true, reps: true, rpe: true, completed: true, weightRight: true, repsRight: true } } } }),
                tx.exercise.findMany({ where: { userId }, orderBy: { id: 'asc' }, take: 501, select: { id: true, name: true, muscleGroup: true, targetReps: true, isUnilateral: true } }),
                tx.coachExerciseConfig.findMany({ where: { userId } }),
                tx.coachCheckIn.findMany({ where: { userId, date: { gte: shiftTrainingCivilDate(today, -364), lte: today } }, orderBy: { date: 'asc' } }),
                tx.bodyLog.findMany({ where: { userId, date: { gte: since, lt: until } }, orderBy: { date: 'asc' }, take: 1501, select: { id: true, date: true, weight: true, muscleMass: true, photoUrl: true } }),
                tx.coachMeasurement.findMany({ where: { userId, date: { gte: shiftTrainingCivilDate(today, 1 - days), lte: today } }, orderBy: { date: 'asc' } }),
                tx.routineBlock.findMany({ where: { routine: { userId }, startedAt: { not: null, lt: until } }, select: { id: true, name: true, routineId: true, phase: true, startedAt: true }, orderBy: { startedAt: 'asc' } })
            ]);
            const mappedBlocks = blocks.map(b => ({ ...b, startedAt: iso(b.startedAt) }));
            return { now: time.toISOString(), days, exercises: exercises.slice(0, 500), configs: configs.map(c => ({ ...c, updatedAt: iso(c.updatedAt) })), checkIns, body: body.slice(0, 1500).map(b => ({ ...b, date: iso(b.date) })), measurements, blocks: mappedBlocks,
                sessions: logs.slice(0, 5000).map(s => { const date = iso(s.date), block = mappedBlocks.filter(b => b.routineId === s.originRoutineId && b.startedAt <= date).at(-1);
                    return { id: s.id, date, exerciseId: s.exerciseId, name: s.exerciseNameSnapshot, muscleGroup: s.muscleGroupSnapshot, unilateral: s.isUnilateralSnapshot, routineId: s.originRoutineId, blockId: block?.id || null, phase: block?.phase || null, sets: s.sets }; }),
                truncated: logs.length > 5000 || exercises.length > 500 || body.length > 1500 };
        }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    };
    return {
        snapshot, usage: assistant.usage, available: () => coachTablesAvailable(prisma),
        async purgeExpired() {
            if (!await coachTablesAvailable(prisma)) return { skipped: true };
            return serial(async tx => ({ checkIns: await tx.coachCheckIn.deleteMany({ where: { date: { lt: shiftTrainingCivilDate(trainingCivilDate(now()), -364) } } }), suggestions: await tx.coachSuggestion.deleteMany({ where: { createdAt: { lt: new Date(now().getTime() - 90 * 86400000) } } }) }));
        },
        async evaluate(userId, exerciseId, body) {
            object(body, ['currentSets']);
            if (!Array.isArray(body.currentSets) || !body.currentSets.length || body.currentSets.length > 30) throw new CoachError('Introduce de 1 a 30 series observadas.');
            const sets = body.currentSets.map(s => { object(s, ['weight', 'reps', 'rpe', 'completed', 'weightRight', 'repsRight']); if (s.completed !== true) throw new CoachError('Solo se evalúan series completadas.'); return { weight: number(s.weight, 0, 1000), reps: number(s.reps, 1, 100, true), rpe: number(s.rpe, 6, 10, true), completed: true, weightRight: s.weightRight == null ? null : number(s.weightRight, 0, 1000), repsRight: s.repsRight == null ? null : number(s.repsRight, 1, 100, true) }; });
            await ownsExercise(prisma, userId, exerciseId); const input = await snapshot(userId, 90), report = buildCoachReport(input);
            return recommendCoachLoading(exerciseId, input, report.recovery, sets);
        },
        async report(userId, days) { return buildCoachReport(await snapshot(userId, days)); },
        async ask(userId, body) {
            object(body, ['message', 'exerciseId', 'days', 'useProvider']);
            if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1200) throw new CoachError('Escribe una pregunta de 1 a 1200 caracteres.');
            const report = buildCoachReport(await snapshot(userId, /\beste mes\b/i.test(body.message) ? 'month' : body.days));
            const answer = await assistant.answer(userId, report, body);
            // Freeze presentation data from the SAME calculation. Never redraw an old
            // answer using a dashboard that subsequently changed its period or records.
            const analysis = { ...report, volume: { ...report.volume, unknown: [], weeks: report.volume.weeks.map(w => ({ ...w, contributions: [] })) },
                plateaus: report.plateaus.filter(p => p.exerciseId === answer.exerciseId), loading: report.loading.filter(p => p.exerciseId === answer.exerciseId),
                hypertrophy: { ...report.hypertrophy, photos: [], measurements: answer.views.includes('hypertrophy') ? report.hypertrophy.measurements : [], weight: answer.views.includes('hypertrophy') ? report.hypertrophy.weight : [] },
                facts: report.facts.filter(f => answer.factIds.includes(f.id)) };
            return { ...answer, analysis };
        },
        async readConfig(userId, exerciseId) { await ownsExercise(prisma, userId, exerciseId); return prisma.coachExerciseConfig.findFirst({ where: { userId, exerciseId } }); },
        async checkIns(userId) { return prisma.coachCheckIn.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 365 }); },
        async saveCheckIn(userId, date, body) {
            date = civilDate(date, now()); const data = checkIn(body), today = trainingCivilDate(now());
            if (date > today || date < shiftTrainingCivilDate(today, -364)) throw new CoachError('El check-in debe pertenecer a los últimos 365 días.');
            return serial(async tx => { await tx.coachCheckIn.deleteMany({ where: { userId, date: { lt: shiftTrainingCivilDate(today, -364) } } });
                return tx.coachCheckIn.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...data }, update: data }); });
        },
        async deleteCheckIn(userId, date) { await prisma.coachCheckIn.deleteMany({ where: { userId, date: civilDate(date, now()) } }); return { deleted: true }; },
        async config(userId, exerciseId, body) { const data = exerciseConfig(body); return serial(async tx => { await ownsExercise(tx, userId, exerciseId); return tx.coachExerciseConfig.upsert({ where: { exerciseId }, create: { userId, exerciseId, ...data }, update: data }); }); },
        async deleteConfig(userId, exerciseId) { await prisma.coachExerciseConfig.deleteMany({ where: { userId, exerciseId: id(exerciseId) } }); return { deleted: true }; },
        async measure(userId, body) { const data = measurement(body, now()); return prisma.coachMeasurement.upsert({ where: { userId_date_zone: { userId, date: data.date, zone: data.zone } }, create: { userId, ...data }, update: { cm: data.cm, quality: data.quality } }); },
        async deleteMeasure(userId, measureId) { await prisma.coachMeasurement.deleteMany({ where: { userId, id: id(measureId) } }); return { deleted: true }; },
        async present(userId, exerciseId, body) {
            const input = await snapshot(userId, 90), loading = buildCoachReport(input).loading.find(l => l.exerciseId === exerciseId);
            if (!loading?.recommendation) throw new CoachError('No hay una recomendación v2 verificable para registrar.', 409);
            if (body !== undefined) {
                object(body, ['weight', 'reps', 'referenceId', 'rule']);
                if (body.weight !== loading.recommendation.weight || body.reps !== loading.recommendation.reps || body.referenceId !== loading.reference.sessionId || body.rule !== loading.rule) throw new CoachError('La recomendación cambió. Actualiza los datos antes de registrarla.', 409);
            }
            const reference = input.sessions.find(s => s.id === loading.reference.sessionId);
            return serial(async tx => {
                const currentExercise = await ownsExercise(tx, userId, exerciseId);
                const current = await tx.workoutLog.findFirst({ where: { id: reference.id, userId, exerciseId }, include: { sets: true } });
                const currentConfig = await tx.coachExerciseConfig.findFirst({ where: { userId, exerciseId } });
                if (!current || referenceFingerprint(current) !== referenceFingerprint(reference) || iso(currentConfig?.updatedAt) !== input.configs.find(c => c.exerciseId === exerciseId)?.updatedAt || currentExercise.targetReps !== input.exercises.find(e => e.id === exerciseId)?.targetReps) throw new CoachError('Los datos cambiaron. Vuelve a consultar.', 409);
                await tx.coachSuggestion.deleteMany({ where: { userId, createdAt: { lt: new Date(now().getTime() - 90 * 86400000) } } });
                return tx.coachSuggestion.create({ data: { id: randomUUID(), userId, exerciseId, payload: { version: 'coach-1', ...loading, presentedAt: now().toISOString() }, referenceHash: referenceFingerprint(reference) } }); });
        },
        async suggestions(userId) {
            const list = await prisma.coachSuggestion.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { resultSet: true } });
            return list.map(({ resultSet, ...s }) => ({ ...s, actual: resultSet ? { id: resultSet.id, weight: resultSet.weight, reps: resultSet.reps, rpe: resultSet.rpe } : null, evaluation: s.outcome === 'ignored' ? 'ignored' : s.outcome === 'presented' ? 'pending' : !resultSet ? 'deleted' : resultFingerprint(resultSet) === s.resultHash ? 'linked' : 'edited' }));
        },
        async results(userId, exerciseId) { await ownsExercise(prisma, userId, exerciseId); return prisma.setLog.findMany({ where: { completed: true, workoutLog: { userId, exerciseId } }, orderBy: { workoutLog: { date: 'desc' } }, take: 40, select: { id: true, weight: true, reps: true, rpe: true, workoutLog: { select: { date: true } } } }); },
        async feedback(userId, suggestionId, body) {
            object(body, ['outcome', 'resultSetId', 'confirm']); if (body.confirm !== true || !['accepted', 'modified', 'ignored'].includes(body.outcome)) throw new CoachError('Confirma explícitamente cómo utilizaste la sugerencia.');
            return serial(async tx => {
                const s = await tx.coachSuggestion.findFirst({ where: { id: id(suggestionId), userId } }); if (!s) throw new CoachError('Sugerencia no disponible.', 404);
                if (s.outcome !== 'presented') throw new CoachError('Esta sugerencia ya fue evaluada.', 409);
                let resultSetId = null, resultHash = null;
                if (body.outcome !== 'ignored') {
                    const set = await tx.setLog.findFirst({ where: { id: id(body.resultSetId), completed: true, workoutLog: { userId, exerciseId: s.exerciseId } }, include: { workoutLog: { select: { date: true } } } });
                    if (!set || set.workoutLog.date < s.createdAt) throw new CoachError('Selecciona una serie real posterior a la sugerencia, de este ejercicio y cuenta.', 409);
                    const exact = set.weight === s.payload.recommendation.weight && set.reps === s.payload.recommendation.reps;
                    if (body.outcome === 'accepted' && !exact || body.outcome === 'modified' && exact) throw new CoachError('La clasificación no coincide con la carga y repeticiones reales.', 409);
                    resultSetId = set.id; resultHash = resultFingerprint(set);
                } else if (body.resultSetId != null) throw new CoachError('Una sugerencia ignorada no se vincula a una serie.');
                return tx.coachSuggestion.update({ where: { id: s.id }, data: { outcome: body.outcome, resultSetId, resultHash } });
            });
        }
    };
}
