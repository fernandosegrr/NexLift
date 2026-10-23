import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

// Refuse inherited .env / production URLs, including a different local database.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(process.env.NEXLIFT_WORKOUT_TEST_PORT);
assert.equal(url.port, process.env.NEXLIFT_WORKOUT_TEST_PORT);
assert.equal(url.pathname, '/nexlift_workout_test');
assert.equal(url.username, 'nexlift_workout_test');
assert.equal(process.env.OPENAI_API_KEY, '');
export const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
export const set = (weight = 50, reps = 10, extra = {}) => ({ weight, reps, rpe: 8, completed: true, ...extra });

export async function schema() {
    const sql = await readFile(new URL('./routine-schema.sql', import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
    await prisma.$executeRawUnsafe(`CREATE TABLE "PersonalRecord" (
        id TEXT PRIMARY KEY, "exerciseName" TEXT NOT NULL, weight DOUBLE PRECISION NOT NULL,
        reps INTEGER NOT NULL, "estimated1RM" DOUBLE PRECISION, date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "userId" TEXT REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "TrainingProfile" (
        id TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
        goal TEXT NOT NULL, "daysPerWeek" INTEGER NOT NULL, equipment TEXT[] NOT NULL, "experienceLevel" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
    )`);
}

export async function seed() {
    await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');
    await prisma.$executeRaw`INSERT INTO "User" (id) VALUES ('A'), ('B')`;
    for (const user of ['A', 'B']) {
        const p = user.toLowerCase();
        await prisma.routine.create({ data: { id: `${p}-routine`, name: 'Synthetic', userId: user, days: { create: {
            id: `${p}-day`, dayName: 'Lunes', exercises: { create: [
                { id: `${p}-ex`, name: 'Press', targetSets: 2, targetReps: '8-12', order: 0 },
                { id: `${p}-ex2`, name: 'PRESS', targetSets: 2, targetReps: '8-12', order: 1 },
                { id: `${p}-uni`, name: 'Remo unilateral', isUnilateral: true, targetSets: 2, targetReps: '8-12', order: 2 }
            ] }
        } } } });
    }
}

export const snapshot = async () => ({
    logs: await prisma.workoutLog.findMany({ orderBy: { id: 'asc' } }),
    sets: await prisma.setLog.findMany({ orderBy: { id: 'asc' } }),
    prs: await prisma.personalRecord.findMany({ orderBy: { id: 'asc' } })
});
export const addLog = (id, exerciseId = 'a-ex', sets = [set()], date = '2026-01-01T12:00:00.123Z') =>
    prisma.workoutLog.create({ data: { id, exerciseId, date: new Date(date), sets: {
        create: sets.map((s, i) => ({ ...s, setNumber: i + 1 }))
    } }, include: { sets: true, exercise: true } });

// A real SQL trigger, not a mocked Prisma rejection. Always remove in finally.
export async function withFailure(table, operation, action) {
    assert.ok(['SetLog', 'WorkoutLog', 'PersonalRecord'].includes(table));
    assert.ok(['INSERT', 'UPDATE', 'DELETE'].includes(operation));
    await prisma.$executeRawUnsafe(`CREATE FUNCTION workout_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic database failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER workout_test_fail BEFORE ${operation} ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION workout_test_fail()`);
    try { return await action(); }
    finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER workout_test_fail ON "${table}"`);
        await prisma.$executeRawUnsafe('DROP FUNCTION workout_test_fail()');
    }
}

export async function listen(app) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    return { server, request: async (route, body, method = 'POST', user = 'A') => {
        const response = await fetch(base + route, { method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user}` },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, body: await response.json() };
    } };
}
