import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const HAS_HISTORY_FIELDS = Prisma.dmmf.datamodel.models.find(m => m.name === 'WorkoutLog').fields.some(f => f.name === 'exerciseNameSnapshot');
export const BACKUP_VERSION = HAS_HISTORY_FIELDS ? 5 : 4;
export const HISTORY_FIELDS = {
    Exercise: ['userId', 'archivedAt'],
    WorkoutLog: ['userId', 'exerciseNameSnapshot', 'muscleGroupSnapshot', 'isUnilateralSnapshot', 'snapshotSource', 'contextCapturedAt', 'originRoutineId', 'originRoutineDayId'],
    PersonalRecord: ['sourceExerciseId']
};
export const ENTITY_NAMES = ['User', 'Routine', 'RoutineBlock', 'RoutineDay', 'Exercise', 'WorkoutLog', 'SetLog', 'PersonalRecord', 'BodyLog', 'Goal', 'RestLog', 'CardioSession', 'CardioSegment', 'TrainingProfile', 'SuggestionLog'];
export const EXCLUDED_MODELS = { PushSubscription: 'Claves y endpoints de autenticación push: volver a suscribirse.', PendingReminder: 'Temporizadores efímeros: regenerar al entrenar; no reenviar avisos antiguos.' };
export const USER_FIELDS = ['id', 'username', 'email', 'firstName', 'lastName', 'phone', 'birthDate', 'avatarUrl', 'createdAt', 'updatedAt', 'creatineReminderEnabled', 'creatineReminderTime'];
export const PROFILE_FIELDS = ['firstName', 'lastName', 'phone', 'birthDate', 'avatarUrl', 'creatineReminderEnabled', 'creatineReminderTime'];
export const MODELS = Object.fromEntries(Prisma.dmmf.datamodel.models.map(m => [m.name, m]));
export const fieldsFor = name => MODELS[name].fields.filter(f => f.kind !== 'object' && (name !== 'User' || USER_FIELDS.includes(f.name)));
export const delegate = name => name[0].toLowerCase() + name.slice(1);
export const canonical = value => JSON.stringify(value, function (key, val) {
    return val && !Array.isArray(val) && typeof val === 'object'
        ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]])) : val;
});
export const checksum = value => createHash('sha256').update(canonical(value)).digest('hex');
export class BackupError extends Error {
    constructor(message, status = 422, details = {}) { super(message); this.status = status; this.details = details; }
}
const fail = message => { throw new BackupError(message); };
export const jsonCopy = value => JSON.parse(JSON.stringify(value));

export function sealBackup(data, { generatedAt = new Date().toISOString(), identifier = `nexlift:user:${data.User[0]?.id}`, compatibility = null } = {}) {
    const backup = {
        backupSchemaVersion: BACKUP_VERSION, generatedAt,
        source: { application: 'NexLift', identifier, userId: data.User[0]?.id, timezone: 'America/Mexico_City' },
        manifest: Object.fromEntries(ENTITY_NAMES.map(name => [name, { count: data[name].length, sha256: checksum(data[name]) }])),
        exclusions: EXCLUDED_MODELS,
        media: { mode: 'references-only', binaryFilesIncluded: false },
        verification: { restoreVerified: false, requirement: 'Restore this specific file in an isolated database before declaring it recovery-verified.' },
        compatibility, data
    };
    backup.integrity = { algorithm: 'sha256', sha256: checksum(backup) };
    return backup;
}

export function validateBackup(input) {
    const b = jsonCopy(input);
    if (![4, BACKUP_VERSION].includes(b?.backupSchemaVersion)) fail('Versión de respaldo no soportada.');
    if (!b.integrity || b.integrity.algorithm !== 'sha256') fail('Falta el checksum del respaldo.');
    const { integrity, ...content } = b;
    if (checksum(content) !== integrity.sha256) fail('Checksum global incorrecto: archivo modificado o incompleto.');
    if (typeof b.generatedAt !== 'string' || !Number.isFinite(Date.parse(b.generatedAt)) || new Date(b.generatedAt).toISOString() !== b.generatedAt) fail('Fecha de generación inválida.');
    if (typeof b.source?.identifier !== 'string' || !b.source.identifier || b.source.application !== 'NexLift' || b.source.timezone !== 'America/Mexico_City') fail('Origen/zona horaria inválidos.');
    if (!b.data || Object.keys(b.data).sort().join() !== [...ENTITY_NAMES].sort().join()) fail('Manifiesto de entidades incompleto o desconocido.');
    if (Object.keys(b.manifest || {}).sort().join() !== [...ENTITY_NAMES].sort().join()) fail('Manifiesto incompleto.');
    const ids = {};
    for (const name of ENTITY_NAMES) {
        const rows = b.data[name];
        if (!Array.isArray(rows) || b.manifest[name]?.count !== rows.length || b.manifest[name]?.sha256 !== checksum(rows)) fail(`Conteo/checksum incorrecto: ${name}.`);
        ids[name] = new Set();
        const fields = fieldsFor(name).filter(f => b.backupSchemaVersion !== 4 || !HISTORY_FIELDS[name]?.includes(f.name));
        for (const row of rows) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`Registro inválido: ${name}.`);
            if (Object.keys(row).sort().join() !== fields.map(f => f.name).sort().join()) fail(`Campos incompletos/desconocidos: ${name} ${row.id || ''}.`);
            for (const f of fields) {
                const v = row[f.name];
                const required = f.isRequired || (b.backupSchemaVersion === 4 && name === 'Exercise' && f.name === 'routineDayId');
                if (v === null && !required) continue;
                const values = f.isList ? v : [v];
                if (!Array.isArray(values)) fail(`Lista inválida: ${name}.${f.name}.`);
                for (const val of values) {
                    const ok = f.type === 'String' ? typeof val === 'string'
                        : f.type === 'Boolean' ? typeof val === 'boolean'
                        : f.type === 'Int' ? Number.isInteger(val) && val >= -2147483648 && val <= 2147483647
                        : f.type === 'Float' ? typeof val === 'number' && Number.isFinite(val)
                        : f.type === 'DateTime' ? typeof val === 'string' && /^\d{4}-\d\d-\d\dT/.test(val) && Number.isFinite(Date.parse(val)) && new Date(val).toISOString() === val
                        : false;
                    if (!ok) fail(`Tipo/valor inválido: ${name}.${f.name}.`);
                }
            }
            if (!row.id || ids[name].has(row.id)) fail(`ID vacío o duplicado: ${name}.`);
            ids[name].add(row.id);
        }
    }
    if (b.data.User.length !== 1 || b.source.userId !== b.data.User[0].id) fail('El respaldo debe pertenecer a un único usuario.');
    for (const name of ENTITY_NAMES) {
        for (const relation of MODELS[name].fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) {
            for (const row of b.data[name]) {
                const field = relation.relationFromFields[0], value = row[field];
                if (b.backupSchemaVersion === 4 && !Object.hasOwn(row, field) && HISTORY_FIELDS[name]?.includes(field)) continue;
                // Only optional planning/provenance may be absent. Exported
                // records must still belong to the single declared account.
                if (value === null && !relation.isRequired && relation.type !== 'User') continue;
                if (!ids[relation.type]?.has(value)) fail(`Referencia ausente/ajena: ${name}.${relation.relationFromFields[0]} (${row.id}).`);
            }
        }
    }
    if (b.data.TrainingProfile.length > 1) fail('TrainingProfile duplicado.');
    for (const row of b.data.SuggestionLog) {
        if (row.userId !== b.source.userId) fail('Sugerencia de otra cuenta.');
    }
    if (b.backupSchemaVersion === 5) {
        const owner = b.source.userId;
        const exercises = new Map(b.data.Exercise.map(e => [e.id, e]));
        for (const row of b.data.Exercise) if (row.userId !== owner) fail('Ejercicio de otra cuenta.');
        for (const row of b.data.WorkoutLog) {
            if (row.userId !== owner || exercises.get(row.exerciseId)?.userId !== owner) fail('Historial de otra cuenta.');
            if (!['recorded', 'legacy-observed'].includes(row.snapshotSource)) fail('Procedencia histórica inválida.');
        }
        for (const row of b.data.PersonalRecord) if (row.sourceExerciseId != null && exercises.get(row.sourceExerciseId)?.userId !== owner) fail('PR de otra cuenta.');
    }
    return b;
}
