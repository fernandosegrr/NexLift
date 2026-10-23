import { Prisma } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { ENTITY_NAMES, MODELS, delegate, HAS_HISTORY_FIELDS } from '../../src/services/backupFormat.js';

// Full relational schema for the fresh test cluster only. No migrations/db push.
export async function createTestSchema(prisma) {
    const models = Prisma.dmmf.datamodel.models;
    for (const m of models) {
        const columns = m.fields.filter(f => f.kind !== 'object').map(f => {
            const type = { String: 'TEXT', Int: 'INTEGER', Float: 'DOUBLE PRECISION', DateTime: 'TIMESTAMP(3)', Boolean: 'BOOLEAN' }[f.type];
            let sql = `"${f.name}" ${type}${f.isList ? '[]' : ''}${f.isRequired ? ' NOT NULL' : ''}${f.isId ? ' PRIMARY KEY' : ''}${f.isUnique ? ' UNIQUE' : ''}`;
            if (f.hasDefaultValue && !f.isId) {
                if (f.type === 'DateTime' && f.default?.name === 'now') sql += ' DEFAULT CURRENT_TIMESTAMP';
                else if (typeof f.default === 'boolean' || typeof f.default === 'number') sql += ` DEFAULT ${f.default}`;
                else if (typeof f.default === 'string') sql += ` DEFAULT '${f.default.replaceAll("'", "''")}'`;
            }
            return sql;
        });
        await prisma.$executeRawUnsafe(`CREATE TABLE "${m.name}" (${columns.join(',')})`);
    }
    for (const m of models) {
        for (const r of m.fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) {
            await prisma.$executeRawUnsafe(`ALTER TABLE "${m.name}" ADD FOREIGN KEY (${r.relationFromFields.map(f => `"${f}"`).join(',')}) REFERENCES "${r.type}" (${r.relationToFields.map(f => `"${f}"`).join(',')}) ON DELETE CASCADE`);
        }
        for (const fields of m.uniqueFields) await prisma.$executeRawUnsafe(`ALTER TABLE "${m.name}" ADD UNIQUE (${fields.map(f => `"${f}"`).join(',')})`);
    }
    const source = await readFile(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    for (const [, name, body] of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        for (const [, list] of body.matchAll(/@@index\(\[([^\]]+)\]\)/g)) {
            const fields = list.split(',').map(f => f.trim());
            await prisma.$executeRawUnsafe(`CREATE INDEX "${name}_${fields.join('_')}_idx" ON "${name}" (${fields.map(f => `"${f}"`).join(',')})`);
        }
    }
}

const instant = new Date('2026-10-18T05:59:59.123Z'); // CDMX 17th, immediately before midnight
export function syntheticRow(name, id, extra = {}) {
    const row = {};
    for (const f of MODELS[name].fields.filter(f => f.kind !== 'object')) {
        row[f.name] = f.isList ? (f.type === 'Int' ? [1, 3, 4] : ['barbell', 'dumbbell'])
            : f.type === 'String' ? `${id}-${f.name}`
            : f.type === 'Boolean' ? false
            : f.type === 'DateTime' ? instant
            : f.type === 'Float' ? 37.125
            : 2;
        if (!f.isRequired) row[f.name] = null;
    }
    return { ...row, id, ...extra };
}
export async function seedBackupFixture(prisma, owner = 'A') {
    const ids = Object.fromEntries(ENTITY_NAMES.map(n => [n, `${owner}-${n}`]));
    ids.User = owner;
    for (const name of ENTITY_NAMES) {
        const extra = {};
        for (const rel of MODELS[name].fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) extra[rel.relationFromFields[0]] = ids[rel.type];
        if (name === 'User') Object.assign(extra, { username: owner.toLowerCase(), email: `${owner}@synthetic.invalid`, passwordHash: 'SYNTHETIC_PASSWORD_HASH_MUST_NOT_EXPORT', securityAnswerHash: 'SYNTHETIC_SECURITY_HASH_MUST_NOT_EXPORT', securityQuestion: 'SYNTHETIC_SECURITY_QUESTION', tokenVersion: 888, isActive: true, avatarUrl: 'https://example.invalid/avatar.jpg', creatineReminderEnabled: true, creatineReminderTime: '16:20' });
        if (name === 'Routine') Object.assign(extra, { source: 'ai', adaptiveDeloadUntil: new Date('2026-10-25T06:00:00.000Z'), lastAdaptiveCheckAt: instant, isActive: true });
        if (name === 'RoutineDay') Object.assign(extra, { weekday: null, splitLabel: 'Push', order: 3 });
        if (name === 'RoutineBlock') Object.assign(extra, { phase: 'deload', startedAt: instant, durationWeeks: 5 });
        if (name === 'Exercise') Object.assign(extra, { name: 'Press unilateral', isUnilateral: true, restSeconds: 113, note: 'Se conserva la nota', muscleGroup: 'pecho' });
        if (name === 'WorkoutLog' && HAS_HISTORY_FIELDS) Object.assign(extra, { exerciseNameSnapshot: 'Press unilateral', muscleGroupSnapshot: 'pecho',
            isUnilateralSnapshot: true, snapshotSource: 'recorded', originRoutineId: ids.Routine, originRoutineDayId: ids.RoutineDay });
        if (name === 'SetLog') Object.assign(extra, { weight: 17.5, reps: 11, weightRight: 15.25, repsRight: 9, rpe: 3, completed: false });
        if (name === 'BodyLog') Object.assign(extra, { photoUrl: 'https://example.invalid/body.jpg', creatineTaken: true, dietCompliant: false, zeroLiquidCalories: null, bmi: 23.25, bmr: 1650, bodyWater: 60.5, visceralFat: 4, boneMass: 3.1, protein: 18.2 });
        if (name === 'Goal') Object.assign(extra, { achievedAt: instant, currentOneRepMax: 63.75, completedWeeks: [1, 2, 4] });
        if (name === 'CardioSession') Object.assign(extra, { activity: 'caminadora', note: 'Intervalos', calories: 241 });
        if (name === 'CardioSegment') Object.assign(extra, { durationMin: 2.5, incline: 11.75, speed: 4.8, note: 'Tramo exacto' });
        if (name === 'TrainingProfile') Object.assign(extra, { goal: 'hypertrophy', daysPerWeek: 4, experienceLevel: 'intermediate' });
        await prisma[delegate(name)].create({ data: syntheticRow(name, ids[name], extra) });
    }
    await prisma.routine.create({ data: syntheticRow('Routine', `${owner}-manual`, { userId: owner, source: 'manual' }) });
    await prisma.routine.create({ data: syntheticRow('Routine', `${owner}-archive`, { userId: owner, source: 'manual', name: 'ARCHIVED_HISTORY_DO_NOT_DELETE' }) });
    await prisma.pushSubscription.create({ data: syntheticRow('PushSubscription', `${owner}-push`, { userId: owner, auth: 'PUSH_AUTH_SECRET', p256dh: 'PUSH_KEY_SECRET', endpoint: `https://example.invalid/push/${owner}` }) });
    await prisma.pendingReminder.create({ data: syntheticRow('PendingReminder', `${owner}-reminder`, { userId: owner, exerciseId: ids.Exercise }) });
    return ids;
}
