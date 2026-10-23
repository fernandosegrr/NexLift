import { normalizeRoutineDays, RoutineValidationError } from '../services/routineImportContract.js';
import { resolveImportedExerciseName } from './importRoutine.js';
import { hasHistoryPersistence, hasRetainedExerciseData } from '../services/historyPersistence.js';

export function normalizeExerciseName(name) {
    if (!name) return '';
    return name
        .replace(/^[a-z]\.?\d+\.?\s*/i, '') // Quita prefijos "a1.", "b.2", "A1 ", etc.
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' '); // Normaliza espacios múltiples
}

// Pasar un `tx` de prisma.$transaction cuando se llama desde
// dentro de una transacción (ver DELETE/PUT /api/routines/:id), para que el
// archivado de ejercicios sea parte de la misma transacción atómica.
export async function getRecycleBinDay(userId, client) {
    let routine = await client.routine.findFirst({
        where: { userId, name: "ARCHIVED_HISTORY_DO_NOT_DELETE", isActive: false }
    });

    if (!routine) {
        routine = await client.routine.create({
            data: {
                userId,
                name: "ARCHIVED_HISTORY_DO_NOT_DELETE",
                description: "System routine for preserving history of renamed/deleted exercises.",
                isActive: false
            }
        });
    }

    let day = await client.routineDay.findFirst({
        where: { routineId: routine.id }
    });

    if (!day) {
        day = await client.routineDay.create({
            data: {
                routineId: routine.id,
                dayName: "Bin",
                order: 0
            }
        });
    }
    return day.id;
}

class RoutineRequestError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const invalidReferences = () => new RoutineRequestError(400, 'Invalid routine references');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasId = value => value !== undefined && value !== null;

function validateStructure(days) {
    if (!Array.isArray(days)) throw new RoutineRequestError(400, 'Invalid routine structure');
    for (const day of days) {
        if (!isObject(day) || (day.exercises != null && !Array.isArray(day.exercises))) {
            throw new RoutineRequestError(400, 'Invalid routine structure');
        }
        for (const ex of day.exercises || []) {
            if (!isObject(ex)) throw new RoutineRequestError(400, 'Invalid routine structure');
        }
    }
}

// Validate the complete graph before any update, archive, create or delete.
// The editor only reorders exercises WITHIN their day; it never moves them to another day.
function validateReferences(days, existingDays, existingExercises) {
    const allowedDays = new Set(existingDays.map(day => day.id));
    const exerciseDay = new Map(existingExercises.map(ex => [ex.id, ex.routineDayId]));
    const seenDays = new Set();
    const seenExercises = new Set();
    for (const day of days) {
        if (hasId(day.id)) {
            if (typeof day.id !== 'string' || !allowedDays.has(day.id) || seenDays.has(day.id)) {
                throw invalidReferences();
            }
            seenDays.add(day.id);
        }
        for (const ex of day.exercises || []) {
            if (!hasId(ex.id)) continue; // Only absent/null IDs designate new resources.
            if (typeof ex.id !== 'string' || !hasId(day.id) || !exerciseDay.has(ex.id)
                || exerciseDay.get(ex.id) !== day.id || seenExercises.has(ex.id)) {
                throw invalidReferences();
            }
            seenExercises.add(ex.id);
        }
    }
}

// Dependency injection keeps HTTP tests independent of server startup and its jobs.
export function createUpdateRoutineHandler({ prisma, deduplicateExercises, logger = console }) {
    return async (req, res) => {
        try {
            const routineId = req.params.id;
            const { name, description, days: rawDays } = req.body || {};

            // Verify ownership
            const existingRoutine = await prisma.routine.findFirst({
                where: { id: routineId, userId: req.userId }
            });

            if (!existingRoutine) {
                return res.status(404).json({ error: 'Routine not found' });
            }

            validateStructure(rawDays);

            const days = normalizeRoutineDays(rawDays, { editing: true });

            // Deduplicación de ejercicios nuevos (Tarea 4): UNA sola llamada para todo
            // el PUT, no una por ejercicio. Solo aplica a exercises SIN `id` (genuinamente
            // nuevos) — el renombrado de un ejercicio existente (con id) ya tiene su
            // propio flujo de archivo/restauración más abajo y no pasa por aquí.
            const newExerciseEntries = [];
            days.forEach((day, dayIdx) => {
                (day.exercises || []).forEach((ex, exIdx) => {
                    if (!hasId(ex.id)) newExerciseEntries.push({ dayIdx, exIdx, name: ex.name });
                });
            });

            let canonicalExercisesForDedup = [];
            const dedupVerdictByEntry = new Map();
            if (newExerciseEntries.length > 0) {
                canonicalExercisesForDedup = await prisma.exercise.findMany({
                    where: { routineDay: { routine: { userId: req.userId } } },
                    select: { id: true, name: true, muscleGroup: true, routineDayId: true },
                    distinct: ['name']
                });
                const verdicts = await deduplicateExercises(newExerciseEntries, canonicalExercisesForDedup);
                verdicts.forEach(v => {
                    const entry = newExerciseEntries[v.index];
                    if (entry) dedupVerdictByEntry.set(`${entry.dayIdx}:${entry.exIdx}`, v);
                });
            }
            const canonicalByIdForDedup = new Map(canonicalExercisesForDedup.map(ex => [ex.id, ex]));
            const canonicalNamesForDedup = new Map(canonicalExercisesForDedup.map(ex => [ex.id, ex.name]));

            // Toda la escritura (info básica, días, ejercicios) va en UNA transacción:
            // antes eran ~decenas de prisma.X sueltos, y si algo fallaba a la mitad (p.ej.
            // la carrera de conteo-de-logs-luego-borrado, o un targetSets corrupto) la
            // rutina quedaba parcialmente actualizada con un 500 genérico. La búsqueda
            // de dedup (llamada externa, puede tardar) se queda FUERA a propósito para
            // no sostener la transacción abierta esperando una respuesta de red.
            const updatedRoutine = await prisma.$transaction(async (tx) => {
                // Recheck ownership inside the write transaction. Row locks protect the
                // ownership chain, including against writers outside this endpoint.
                const owned = await tx.$queryRaw`
                    SELECT id FROM "Routine" WHERE id = ${routineId} AND "userId" = ${req.userId} FOR UPDATE
                `;
                if (owned.length !== 1) throw new RoutineRequestError(404, 'Routine not found');
                const existingDaysList = await tx.$queryRaw`
                    SELECT id FROM "RoutineDay" WHERE "routineId" = ${routineId} ORDER BY id FOR UPDATE
                `;
                const existingExercisesList = await tx.$queryRaw`
                    SELECT e.id, e."routineDayId" FROM "Exercise" e
                    JOIN "RoutineDay" d ON d.id = e."routineDayId"
                    WHERE d."routineId" = ${routineId} ORDER BY e.id FOR UPDATE OF e
                `;
                validateReferences(days, existingDaysList, existingExercisesList);

                const ownedExerciseWhere = (id, routineDayId) => ({
                    id, routineDayId, routineDay: { routine: { userId: req.userId } }
                });
                const updateExercise = (id, routineDayId, data) => tx.exercise.update({
                    where: ownedExerciseWhere(id, routineDayId), data
                });
                const lockedBinDay = async () => {
                    const id = await getRecycleBinDay(req.userId, tx);
                    const bin = await tx.$queryRaw`
                        SELECT d.id FROM "RoutineDay" d JOIN "Routine" r ON r.id = d."routineId"
                        WHERE d.id = ${id} AND r."userId" = ${req.userId}
                            AND r.id <> ${routineId} FOR UPDATE OF r, d
                    `;
                    if (bin.length !== 1) throw invalidReferences();
                    return id;
                };

                // 1. Update basic info
                await tx.routine.update({
                    where: { id: routineId, userId: req.userId },
                    data: { name, description }
                });

                // 2. Handle Days
                const incomingDayIds = days.filter(d => d.id).map(d => d.id);
                const daysToDelete = existingDaysList.filter(d => !incomingDayIds.includes(d.id)).map(d => d.id);

                if (daysToDelete.length > 0) {
                    // SAFE DELETE DAYS: Archive exercises with logs first
                    const staleDays = await tx.routineDay.findMany({
                        where: { id: { in: daysToDelete }, routineId },
                        include: { exercises: { select: { id: true } } }
                    });

                    for (const d of staleDays) {
                        for (const ex of d.exercises) {
                            const logCount = await hasRetainedExerciseData(tx, ex.id);
                            if (logCount > 0) {
                                const binId = await lockedBinDay();
                                await updateExercise(ex.id, d.id, { routineDayId: binId });
                            }
                        }
                    }
                    await tx.routineDay.deleteMany({ where: { id: { in: daysToDelete }, routineId } });
                }

                for (let i = 0; i < days.length; i++) {
                    const day = days[i];
                    let dayId = day.id;

                    if (dayId) {
                        await tx.routineDay.update({
                            where: { id: dayId, routineId },
                            data: {
                                dayName: day.dayName,
                                isRestDay: day.isRestDay,
                                splitLabel: day.splitLabel,
                                weekday: day.weekday,
                                order: day.order
                            }
                        });
                    } else {
                        const newDay = await tx.routineDay.create({
                            data: {
                                routineId,
                                dayName: day.dayName,
                                isRestDay: day.isRestDay,
                                splitLabel: day.splitLabel,
                                weekday: day.weekday,
                                order: day.order
                            }
                        });
                        dayId = newDay.id;
                    }

                    // 3. Handle Exercises
                    if (day.exercises && Array.isArray(day.exercises)) {
                        const existingExercises = await tx.exercise.findMany({
                            where: { routineDayId: dayId },
                            select: { id: true }
                        });
                        const incomingExIds = day.exercises.filter(e => e.id).map(e => e.id);
                        const exToDelete = existingExercises.filter(e => !incomingExIds.includes(e.id)).map(e => e.id);

                        if (exToDelete.length > 0) {
                            for (const exId of exToDelete) {
                                const logCount = await hasRetainedExerciseData(tx, exId);
                                if (logCount > 0) {
                                    // Safe Delete: Has history, move to archive
                                    const binId = await lockedBinDay();
                                    await updateExercise(exId, dayId, { routineDayId: binId });
                                } else {
                                    // True Delete: No history
                                    await tx.exercise.delete({ where: ownedExerciseWhere(exId, dayId) });
                                }
                            }
                        }

                        for (let j = 0; j < day.exercises.length; j++) {
                            const ex = day.exercises[j];
                            const normalizedName = normalizeExerciseName(ex.name);
                            const cleanTargetSets = ex.targetSets;

                            if (ex.id) {
                                const currentExercise = await tx.exercise.findUnique({
                                    where: ownedExerciseWhere(ex.id, dayId),
                                    select: { name: true }
                                });

                                const currentName = currentExercise ? normalizeExerciseName(currentExercise.name) : '';

                                if (!hasHistoryPersistence && currentName !== normalizedName) {
                                    // Check for history
                                    const logCount = await tx.workoutLog.count({
                                        where: { exerciseId: ex.id }
                                    });

                                    if (logCount > 0) {
                                        // Has history: Move current to Recycle Bin
                                        const binId = await lockedBinDay();

                                        await updateExercise(ex.id, dayId, { routineDayId: binId });

                                        // Check if NEW name exists in Archive to RESTORE instead of Create
                                        const archivedEx = await tx.exercise.findFirst({
                                            where: {
                                                routineDayId: binId,
                                                name: normalizedName,
                                                routineDay: { routine: { userId: req.userId } }
                                            }
                                        });

                                        if (archivedEx) {
                                            await tx.exercise.update({
                                                where: ownedExerciseWhere(archivedEx.id, binId),
                                                data: {
                                                    routineDayId: dayId,
                                                    muscleGroup: ex.muscleGroup,
                                                    targetSets: cleanTargetSets,
                                                    targetReps: ex.targetReps,
                                                    restSeconds: ex.restSeconds,
                                                    note: ex.note,
                                                    isUnilateral: ex.isUnilateral,
                                                    order: ex.order
                                                }
                                            });
                                        } else {
                                            // Make new if not found in archive
                                            await tx.exercise.create({
                                                data: {
                                                    routineDayId: dayId,
                                                    name: normalizedName,
                                                    muscleGroup: ex.muscleGroup,
                                                    targetSets: cleanTargetSets,
                                                    targetReps: ex.targetReps,
                                                    restSeconds: ex.restSeconds,
                                                    note: ex.note,
                                                    isUnilateral: ex.isUnilateral,
                                                    order: ex.order
                                                }
                                            });
                                        }
                                        continue; // Skip the standard update
                                    }
                                }

                                // Update existing (No history or name didn't change)
                                await tx.exercise.update({
                                    where: ownedExerciseWhere(ex.id, dayId),
                                    data: {
                                        name: normalizedName,
                                        muscleGroup: ex.muscleGroup,
                                        targetSets: cleanTargetSets,
                                        targetReps: ex.targetReps,
                                        restSeconds: ex.restSeconds,
                                        note: ex.note,
                                        isUnilateral: ex.isUnilateral,
                                        order: ex.order
                                    }
                                });

                            } else {
                                if (hasHistoryPersistence) {
                                    // New plan entries always get new IDs. Similar names are
                                    // display suggestions, never evidence of shared identity.
                                    await tx.exercise.create({ data: { routineDayId: dayId, name: ex.name,
                                        muscleGroup: ex.muscleGroup, targetSets: cleanTargetSets,
                                        targetReps: ex.targetReps, restSeconds: ex.restSeconds,
                                        note: ex.note, isUnilateral: ex.isUnilateral, order: ex.order } });
                                    continue;
                                }
                                const binId = await lockedBinDay();
                                const verdict = dedupVerdictByEntry.get(`${i}:${j}`);
                                const resolvedName = resolveImportedExerciseName(ex, verdict, canonicalNamesForDedup);

                                // Si el veredicto (LLM o fallback) apunta a un ejercicio que HOY
                                // vive en la papelera, restaurarlo (preserva su historial) — igual
                                // que ya hacía el matching exacto. Si apunta a uno ACTIVO en otro
                                // día, NO reengancharlo solo (evita sacarlo de donde vive sin que
                                // el usuario lo pida): se crea uno nuevo con el nombre canónico, que
                                // igual comparte historial/PRs por nombre con el resto de la app.
                                let archivedEx = null;
                                if (verdict?.matchedId) {
                                    const matched = canonicalByIdForDedup.get(verdict.matchedId);
                                    if (matched) {
                                        // The dedup catalog was read before the transaction; never
                                        // use its cached membership as authorization to restore.
                                        archivedEx = await tx.exercise.findFirst({
                                            where: ownedExerciseWhere(matched.id, binId)
                                        });
                                    }
                                }
                                if (!archivedEx) {
                                    archivedEx = await tx.exercise.findFirst({
                                        where: {
                                            routineDayId: binId,
                                            name: { equals: resolvedName, mode: 'insensitive' },
                                            routineDay: { routine: { userId: req.userId } }
                                        }
                                    });
                                }

                                if (archivedEx) {
                                    await tx.exercise.update({
                                        where: ownedExerciseWhere(archivedEx.id, binId),
                                        data: {
                                            routineDayId: dayId,
                                            muscleGroup: ex.muscleGroup,
                                            targetSets: cleanTargetSets,
                                            targetReps: ex.targetReps,
                                            restSeconds: ex.restSeconds,
                                            note: ex.note,
                                            isUnilateral: ex.isUnilateral,
                                            order: ex.order
                                        }
                                    });
                                } else {
                                    await tx.exercise.create({
                                        data: {
                                            routineDayId: dayId,
                                            name: resolvedName,
                                            muscleGroup: ex.muscleGroup,
                                            targetSets: cleanTargetSets,
                                            targetReps: ex.targetReps,
                                            restSeconds: ex.restSeconds,
                                            note: ex.note,
                                            isUnilateral: ex.isUnilateral,
                                            order: ex.order
                                        }
                                    });
                                }
                            }
                        }
                    }
                }

                return tx.routine.findUnique({
                    where: { id: routineId },
                    include: { days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } }
                });
            }, { timeout: 20000, isolationLevel: 'Serializable' });

            res.json(updatedRoutine);
        } catch (error) {
            if (error instanceof RoutineValidationError) {
                return res.status(400).json({ error: error.message, details: error.details });
            }
            if (error instanceof RoutineRequestError) {
                return res.status(error.status).json({ error: error.message });
            }
            if (error.code === 'P2034' || error.code === 'P2025'
                || (error.code === 'P2010' && ['40001', '40P01'].includes(error.meta?.code))) {
                return res.status(409).json({ error: 'Routine changed concurrently. Reload and try again.' });
            }
            logger.error('Error updating routine:', error);
            res.status(500).json({ error: 'Failed to update routine' });
        }
    };
}
