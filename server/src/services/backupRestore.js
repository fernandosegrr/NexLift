import { ENTITY_NAMES, delegate, canonical, checksum, jsonCopy, PROFILE_FIELDS, MODELS, BackupError } from './backupFormat.js';
import { readBackup } from './backupLegacy.js';

export function mappedId(source, targetUserId, name, id) {
    return source.userId === targetUserId ? id : `nx4_${checksum(['nexlift:restore:v4', source.identifier, targetUserId, name, id])}`;
}
const comparable = row => jsonCopy(row);
const mapRow = (name, sourceRow, maps, omitted) => {
    const absent = omitted[`${name}:${sourceRow.id}`] || [];
    const row = Object.fromEntries(Object.entries(sourceRow).filter(([k]) => !absent.includes(k)));
    row.id = maps[name][sourceRow.id];
    for (const rel of MODELS[name].fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) {
        const field = rel.relationFromFields[0];
        row[field] = sourceRow[field] == null ? null : maps[rel.type][sourceRow[field]];
    }
    if (name === 'WorkoutLog') {
        if (row.originRoutineId != null && maps.Routine[row.originRoutineId]) row.originRoutineId = maps.Routine[row.originRoutineId];
        if (row.originRoutineDayId != null && maps.RoutineDay[row.originRoutineDayId]) row.originRoutineDayId = maps.RoutineDay[row.originRoutineDayId];
    }
    return row;
};
export async function restoreBackup(prisma, input, targetUserId, { dryRun = true, allowIncomplete = false, restoreProfile = false } = {}) {
    const { backup: b, warnings, incomplete, omitted } = readBackup(input);
    if (incomplete && !dryRun && !allowIncomplete) throw new BackupError('Respaldo legacy incompleto: revise dry-run y autorice allowIncomplete explícitamente.', 422, { warnings, incomplete: true });
    if (restoreProfile && incomplete) throw new BackupError('No se permite reemplazar el perfil con un archivo legacy incompleto.');
    const maps = Object.fromEntries(ENTITY_NAMES.map(name => [name, Object.fromEntries(b.data[name].map(r => [r.id, name === 'User' ? targetUserId : mappedId(b.source, targetUserId, name, r.id)]))]));
    const stats = Object.fromEntries(ENTITY_NAMES.map(name => [name, { expected: b.data[name].length, created: 0, updated: 0, unchanged: 0, omitted: 0, rejected: 0 }]));
    const plans = [];
    try {
        return await prisma.$transaction(async tx => {
            if (!dryRun) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${targetUserId} FOR UPDATE`;
            const target = await tx.user.findUnique({ where: { id: targetUserId } });
            if (!target) throw new BackupError('La cuenta destino debe existir; sus credenciales nunca se importan.', 404);
            stats.User.omitted = 1;
            if (restoreProfile) {
                const profile = Object.fromEntries(PROFILE_FIELDS.map(k => [k, b.data.User[0][k]]));
                stats.User.omitted = 0;
                stats.User.updated = canonical(PROFILE_FIELDS.map(k => comparable(target)[k])) === canonical(PROFILE_FIELDS.map(k => profile[k])) ? 0 : 1;
                stats.User.unchanged = 1 - stats.User.updated;
                if (stats.User.updated) plans.push({ name: 'User', row: { id: targetUserId, ...profile }, update: true });
            }
            // Preflight every row before the first write. Existing rows must match in
            // full; no upsert can re-parent another user's data or erase newer edits.
            for (const name of ENTITY_NAMES.filter(n => n !== 'User')) {
                for (const sourceRow of b.data[name]) {
                    const row = mapRow(name, sourceRow, maps, omitted);
                    const current = await tx[delegate(name)].findUnique({ where: { id: row.id } });
                    if (current) {
                        const actual = comparable(current);
                        if (Object.entries(row).some(([k, v]) => canonical(actual[k]) !== canonical(v))) {
                            stats[name].rejected++;
                            throw new BackupError(`Conflicto en ${name}: ID existente con contenido o propietario diferente. No se sobrescribió.`, 409);
                        }
                        stats[name].unchanged++;
                    } else {
                        if (name === 'TrainingProfile' && await tx.trainingProfile.findUnique({ where: { userId: targetUserId } })) {
                            stats[name].rejected++;
                            throw new BackupError('Ya existe otro TrainingProfile en la cuenta destino.', 409);
                        }
                        plans.push({ name, row });
                        stats[name].created++;
                    }
                }
            }
            if (!dryRun) {
                for (const p of plans) {
                    if (p.update) {
                        const { id, ...data } = p.row;
                        await tx.user.update({ where: { id }, data });
                    } else await tx[delegate(p.name)].create({ data: p.row });
                }
                // Verify persisted scalar values and all mapped foreign keys before commit.
                for (const name of ENTITY_NAMES.filter(n => n !== 'User')) {
                    for (const row of b.data[name]) {
                        const actual = comparable(await tx[delegate(name)].findUnique({ where: { id: maps[name][row.id] } }));
                        const expected = mapRow(name, row, maps, omitted);
                        if (!actual || Object.entries(expected).some(([k, v]) => canonical(actual[k]) !== canonical(v))) throw new BackupError(`Verificación de restauración falló: ${name}.`, 500);
                    }
                }
                if (restoreProfile) {
                    const actual = comparable(await tx.user.findUnique({ where: { id: targetUserId } }));
                    if (PROFILE_FIELDS.some(k => canonical(actual[k]) !== canonical(b.data.User[0][k]))) throw new BackupError('Verificación del perfil restaurado falló.', 500);
                }
            }
            const plannedCreates = Object.values(stats).reduce((s, v) => s + v.created, 0);
            const reportedStats = Object.fromEntries(Object.entries(stats).map(([name, s]) => [name, {
                ...s, wouldCreate: dryRun ? s.created : 0, wouldUpdate: dryRun ? s.updated : 0,
                created: dryRun ? 0 : s.created, updated: dryRun ? 0 : s.updated
            }]));
            return { ok: true, success: true, dryRun, complete: !incomplete, warnings,
                profile: restoreProfile ? `Perfil exportable ${dryRun ? 'por aplicar' : 'aplicado'}; identidad y credenciales del destino conservadas.` : 'Perfil e identidad del destino conservados (User omitido explícitamente).',
                stats: reportedStats, idMap: maps, plannedCreates,
                bodyLogsImported: reportedStats.BodyLog.created, importedBodyLogs: reportedStats.BodyLog.created,
                workoutsImported: reportedStats.WorkoutLog.created, routinesImported: reportedStats.Routine.created, prsImported: reportedStats.PersonalRecord.created };
        }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 });
    } catch (error) {
        const failure = ['P2034', 'P2002'].includes(error.code)
            ? new BackupError('Conflicto concurrente: ninguna modificación aplicada. Repita dry-run.', 409) : error;
        // "created" is a prediction in dry-run, never a claim about rolled-back writes.
        const rejectedStats = Object.fromEntries(Object.entries(stats).map(([name, s]) => [name, { ...s, planned: s.created, created: 0, updated: 0 }]));
        if (failure instanceof BackupError) { failure.details = { ...failure.details, stats: rejectedStats, rolledBack: !dryRun }; throw failure; }
        throw new BackupError('Falló la restauración; transacción revertida por completo.', 500, { stats: rejectedStats, rolledBack: !dryRun });
    }
}
