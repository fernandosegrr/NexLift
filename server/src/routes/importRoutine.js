import { normalizeRoutineImport, RoutineValidationError } from '../services/routineImportContract.js';
import { normalizeExerciseName } from '../utils/exerciseName.js';

export const importedRoutineInclude = {
    days: { include: { exercises: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } }
};

export function resolveImportedExerciseName(exercise, verdict, names) {
    const name = names.get(verdict?.matchedId) ?? verdict?.cleanedName;
    return typeof name === 'string' && name.trim() ? name.trim() : normalizeExerciseName(exercise.name) || exercise.name;
}

export function createImportRoutineHandler({ prisma, deduplicateExercises, logger = console }) {
    return async (req, res) => {
        try {
            const input = normalizeRoutineImport(req.body);
            const incoming = input.days.flatMap(day => day.exercises.map(ex => ({ name: ex.name })));
            const canonical = incoming.length ? await prisma.exercise.findMany({
                where: { routineDay: { routine: { userId: req.userId } } },
                select: { id: true, name: true, muscleGroup: true }, distinct: ['name']
            }) : [];
            // External name resolution runs before the write transaction. It cannot supply configuration or IDs.
            const verdicts = await deduplicateExercises(incoming, canonical);
            const names = new Map(canonical.map(ex => [ex.id, ex.name]));
            const byIndex = new Map(verdicts.map(v => [v.index, v]));
            let index = 0;
            const days = input.days.map(day => ({ ...day, exercises: {
                create: day.exercises.map(ex => {
                    const verdict = byIndex.get(index++);
                    return { ...ex, name: resolveImportedExerciseName(ex, verdict, names) };
                })
            } }));
            // A nested Prisma create is itself atomic; keep its response inside the same explicit transaction.
            const routine = await prisma.$transaction(tx => tx.routine.create({
                data: { userId: req.userId, name: input.name, description: input.description, days: { create: days } },
                include: importedRoutineInclude
            }));
            res.status(201).json({ message: 'Routine imported successfully!', routine });
        } catch (error) {
            if (error instanceof RoutineValidationError) return res.status(400).json({ error: error.message, details: error.details });
            if (['P2034', 'P2002'].includes(error.code)) return res.status(409).json({ error: 'Conflicto al importar la rutina; vuelve a intentarlo' });
            logger.error('Import routine error:', error);
            res.status(500).json({ error: 'Failed to import routine' });
        }
    };
}
