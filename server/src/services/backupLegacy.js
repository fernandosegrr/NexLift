import { ENTITY_NAMES, fieldsFor, sealBackup, validateBackup, checksum, BackupError, jsonCopy, USER_FIELDS, HAS_HISTORY_FIELDS } from './backupFormat.js';

function upgradeVersion4(input) {
    const original = validateBackup(input); // Check ORIGINAL checksum before transformation.
    if (!HAS_HISTORY_FIELDS || original.backupSchemaVersion !== 4) return original;
    const data = original.data, owner = original.source.userId;
    const exercises = new Map(data.Exercise.map(e => [e.id, e]));
    const days = new Map(data.RoutineDay.map(d => [d.id, d]));
    const routines = new Map(data.Routine.map(r => [r.id, r]));
    for (const e of data.Exercise) Object.assign(e, { userId: owner,
        archivedAt: routines.get(days.get(e.routineDayId)?.routineId)?.name === 'ARCHIVED_HISTORY_DO_NOT_DELETE' ? original.generatedAt : null });
    for (const log of data.WorkoutLog) Object.assign(log, { userId: owner,
        exerciseNameSnapshot: exercises.get(log.exerciseId).name, muscleGroupSnapshot: null,
        isUnilateralSnapshot: null, snapshotSource: 'legacy-observed', contextCapturedAt: original.generatedAt, originRoutineId: null, originRoutineDayId: null });
    for (const pr of data.PersonalRecord) pr.sourceExerciseId = null;
    return validateBackup(sealBackup(data, { generatedAt: original.generatedAt, identifier: original.source.identifier,
        compatibility: { format: 4, historicalContext: 'Observed label only; original attributes and plan unknown.' } }));
}

// Only the two formats emitted by this repository are recognized. Never edit the input.
export function readBackup(input) {
    if (input?.backupSchemaVersion != null) return { backup: upgradeVersion4(input), warnings: [], incomplete: false, omitted: {} };
    const raw = jsonCopy(input);
    const daily = raw?.version === 1 && raw.user?.id && Array.isArray(raw.workoutLogs);
    const manual = typeof raw?.version === 'string' && /^2\./.test(raw.version) && Array.isArray(raw.workouts);
    if (!daily && !manual) throw new BackupError('Formato legacy desconocido. Se admite version:1 diario y exportación 2.x de Settings.');
    const generatedAt = raw.generatedAt || raw.exportDate;
    if (!Number.isFinite(Date.parse(generatedAt))) throw new BackupError('Legacy sin fecha de generación válida.');
    for (const name of ['routines', 'bodyLogs', 'personalRecords', daily ? 'workoutLogs' : 'workouts']) {
        if (!Array.isArray(raw[name])) throw new BackupError(`Legacy incompleto: falta ${name}.`);
    }
    const fingerprint = checksum(raw);
    const owner = raw.user?.id || `legacy-user-${fingerprint}`;
    const data = Object.fromEntries(ENTITY_NAMES.map(n => [n, []]));
    const omitted = {};
    const warnings = ['Legacy sin checksums ni manifiesto originales: no es posible demostrar que el archivo histórico estaba completo.'];
    if (manual) warnings.push('Exportación sin IDs: la repetición del mismo archivo es idempotente. Archivos diferentes no permiten identificar con certeza registros compartidos; pueden crear copias.');
    const add = (name, row, location) => {
        const out = {};
        const id = row.id || `legacy-${checksum([fingerprint, name, location])}`;
        const missing = [];
        for (const f of fieldsFor(name)) {
            if (f.name === 'id') { out.id = id; continue; }
            if (Object.hasOwn(row, f.name)) { out[f.name] = row[f.name]; continue; }
            missing.push(f.name);
            // Placeholders exist only in the internal validated representation. Omitted
            // fields are NEVER written or compared as recovered historical information.
            if (!f.isRequired) out[f.name] = null;
            else if (f.isList) out[f.name] = [];
            else if (f.type === 'DateTime' && (f.hasDefaultValue || f.isUpdatedAt)) out[f.name] = new Date(generatedAt).toISOString();
            else if (f.hasDefaultValue && typeof f.default !== 'object') out[f.name] = f.default;
            else if (name === 'User') out[f.name] = f.type === 'String' ? '' : false;
            else throw new BackupError(`Legacy insuficiente: falta ${name}.${f.name} (${location}).`);
        }
        if (missing.length) omitted[`${name}:${id}`] = missing;
        data[name].push(out);
        return out;
    };
    add('User', { ...(raw.user || {}), id: owner }, 'user');
    const exNames = new Map();
    raw.routines.forEach((r, ri) => {
        const routine = add('Routine', { ...r, userId: owner }, `routines[${ri}]`);
        if (!Array.isArray(r.days)) throw new BackupError(`Legacy: faltan días de rutina ${ri}.`);
        r.days.forEach((d, di) => {
            const day = add('RoutineDay', { ...d, routineId: routine.id }, `${ri}.days[${di}]`);
            if (!Array.isArray(d.exercises)) throw new BackupError(`Legacy: faltan ejercicios en día ${di}.`);
            d.exercises.forEach((e, ei) => {
                const ex = add('Exercise', { ...e, routineDayId: day.id, ...(HAS_HISTORY_FIELDS ? { userId: owner,
                    archivedAt: r.name === 'ARCHIVED_HISTORY_DO_NOT_DELETE' ? new Date(generatedAt).toISOString() : null } : {}) }, `${ri}.${di}.exercises[${ei}]`);
                const key = ex.name.trim().toLowerCase();
                exNames.set(key, [...(exNames.get(key) || []), ex.id]);
            });
        });
        if (r.blocks != null && !Array.isArray(r.blocks)) throw new BackupError(`Legacy: blocks no es una lista en rutina ${ri}.`);
        if (!Object.hasOwn(r, 'blocks')) warnings.push(`Rutina ${ri}: no contiene blocks; no se recuperan mesociclos ausentes.`);
        (r.blocks || []).forEach((b, bi) => add('RoutineBlock', { ...b, routineId: routine.id }, `${ri}.blocks[${bi}]`));
    });
    (daily ? raw.workoutLogs : raw.workouts).forEach((w, wi) => {
        let exerciseId = w.exerciseId;
        if (!data.Exercise.some(e => e.id === exerciseId)) {
            const matches = exNames.get(String(w.exerciseName || w.exercise?.name || '').trim().toLowerCase()) || [];
            if (matches.length !== 1) throw new BackupError(`Legacy: entrenamiento ${wi} sin exerciseId recuperable; nombre ausente, inexistente o ambiguo (${matches.length} coincidencias).`);
            [exerciseId] = matches;
        }
        if (!w.date || !Array.isArray(w.sets)) throw new BackupError(`Legacy: faltan fecha/series en entrenamiento ${wi}.`);
        const context = HAS_HISTORY_FIELDS ? { userId: owner,
            exerciseNameSnapshot: data.Exercise.find(e => e.id === exerciseId).name,
            muscleGroupSnapshot: null, isUnilateralSnapshot: null, snapshotSource: 'legacy-observed',
            contextCapturedAt: new Date(generatedAt).toISOString(),
            originRoutineId: null, originRoutineDayId: null } : {};
        const log = add('WorkoutLog', { ...w, exerciseId, ...context }, `workouts[${wi}]`);
        w.sets.forEach((s, si) => add('SetLog', { ...s, setNumber: s.setNumber ?? si + 1, workoutLogId: log.id }, `${wi}.sets[${si}]`));
    });
    const collections = { PersonalRecord: 'personalRecords', BodyLog: 'bodyLogs', Goal: 'goals', RestLog: 'restLogs', CardioSession: 'cardioSessions', TrainingProfile: 'trainingProfiles', SuggestionLog: 'suggestionLogs' };
    for (const [name, key] of Object.entries(collections)) {
        const rows = name === 'TrainingProfile' && raw.trainingProfile ? [raw.trainingProfile] : raw[key] || [];
        if (!Array.isArray(rows)) throw new BackupError(`Legacy: ${key} no es una lista.`);
        rows.forEach((row, i) => {
            if (name === 'BodyLog' && row.photoUrl == null && row.photo != null) row.photoUrl = row.photo;
            const saved = add(name, { ...row, userId: owner }, `${key}[${i}]`);
            if (name === 'CardioSession') (row.segments || []).forEach((s, si) => add('CardioSegment', { ...s, sessionId: saved.id }, `${i}.segments[${si}]`));
        });
        if (!Object.hasOwn(raw, key) && !(name === 'TrainingProfile' && raw.trainingProfile)) warnings.push(`El formato original no contiene ${name}; no se recuperará información ausente.`);
    }
    for (const [key, missing] of Object.entries(omitted)) warnings.push(`${key}: campos ausentes: ${missing.join(', ')}. Se conservan defaults del destino, no datos históricos.`);
    if (daily) {
        // Some historical exports have safe user fields added later. Missing profile
        // fields must never become an empty-string profile replacement.
        const missing = USER_FIELDS.filter(f => !Object.hasOwn(raw.user, f));
        if (missing.length) warnings.push(`Perfil legacy incompleto: ${missing.join(', ')}.`);
    }
    return { backup: validateBackup(sealBackup(data, { generatedAt: new Date(generatedAt).toISOString(), identifier: daily ? `nexlift:user:${owner}` : `legacy:file:${fingerprint}`, compatibility: { format: raw.version, incomplete: true } })), warnings, incomplete: true, omitted };
}
