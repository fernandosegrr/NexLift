import { ENTITY_NAMES, COACH_ENTITIES, USER_FIELDS, fieldsFor, delegate, sealBackup, validateBackup, jsonCopy, BackupError, HAS_HISTORY_FIELDS } from './backupFormat.js';

export function ownerWhere(name, userId) {
    if (COACH_ENTITIES.includes(name)) return { userId };
    if (HAS_HISTORY_FIELDS) {
        if (['Exercise', 'WorkoutLog'].includes(name)) return { userId };
        if (name === 'SetLog') return { workoutLog: { userId } };
    }
    if (name === 'User') return { id: userId };
    if (['Routine', 'PersonalRecord', 'BodyLog', 'Goal', 'RestLog', 'CardioSession', 'TrainingProfile', 'SuggestionLog'].includes(name)) return { userId };
    if (['RoutineDay', 'RoutineBlock'].includes(name)) return { routine: { userId } };
    if (name === 'Exercise') return { routineDay: { routine: { userId } } };
    if (name === 'WorkoutLog') return { exercise: { routineDay: { routine: { userId } } } };
    if (name === 'SetLog') return { workoutLog: { exercise: { routineDay: { routine: { userId } } } } };
    if (name === 'CardioSegment') return { session: { userId } };
    throw new BackupError('Entidad no clasificada.');
}

export async function exportBackup(prisma, userId, { pageSize = 500 } = {}) {
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new BackupError('Paginación inválida.');
    return prisma.$transaction(async tx => {
        const data = {};
        for (const name of ENTITY_NAMES) {
            const where = ownerWhere(name, userId);
            const select = Object.fromEntries((name === 'User' ? USER_FIELDS : fieldsFor(name).map(f => f.name)).map(f => [f, true]));
            const expected = await tx[delegate(name)].count({ where });
            data[name] = [];
            let cursor;
            while (true) {
                const page = await tx[delegate(name)].findMany({ where, select, orderBy: { id: 'asc' }, take: pageSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
                data[name].push(...page);
                if (page.length < pageSize) break;
                cursor = page.at(-1).id;
            }
            if (data[name].length !== expected) throw new BackupError(`Exportación parcial: ${name}.`, 500);
        }
        if (!data.User.length) throw new BackupError('Usuario no disponible.', 404);
        return validateBackup(sealBackup(jsonCopy(data)));
    }, { isolationLevel: 'RepeatableRead', timeout: 120000, maxWait: 10000 });
}
