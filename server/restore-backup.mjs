// Restaura un backup generado por el job diario de P0 (ver runDailyBackup /
// POST /api/backup/run en server/src/index.js). Escenario: DB perdida/nueva VPS —
// ya existe (o acabas de crear) una cuenta con el mismo `username` que tenía el
// backup, y quieres reponer rutinas/logs/PRs/bodyLogs/goals/descansos.
//
// El backup NO incluye passwordHash/securityAnswerHash (se excluyen a propósito
// al generarlo — ver comentario en runDailyBackup) — este script nunca toca
// contraseñas: solo reconecta el historial de entrenamiento al usuario indicado.
//
// Dry-run por defecto (solo cuenta qué se crearía/actualizaría). `--apply` para
// escribir de verdad. Idempotente: usa upsert por id, así que correrlo 2 veces
// no duplica nada.
//
// Uso:
//   node restore-backup.mjs                          # restaura el backup más reciente al usuario del mismo username
//   node restore-backup.mjs --public-id=nexlift-backups/backup-fernando.segrr-2026-07-09T04-00-00-000Z
//   node restore-backup.mjs --file=./mi-backup.json   # restaurar desde un JSON ya descargado
//   node restore-backup.mjs --user=otro_username      # forzar a qué cuenta existente se reconecta
//   node restore-backup.mjs --apply                   # aplicar de verdad (todo lo anterior es dry-run)
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
dotenv.config();

const prisma = new PrismaClient();
const args = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const APPLY = !!args.apply;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function loadBackupData() {
    if (args.file) {
        const raw = await readFile(args.file, 'utf-8');
        return JSON.parse(raw);
    }

    const { listBackups, getBackupDownloadUrl } = await import('./src/services/backupService.js');
    let publicId = args['public-id'];
    if (!publicId) {
        const backups = await listBackups();
        if (backups.length === 0) throw new Error('No hay backups en Cloudinary (nexlift-backups/). Usa --file para restaurar desde un JSON local.');
        publicId = backups[0].public_id; // listBackups ya ordena más reciente primero
        console.log(`Sin --public-id: usando el más reciente -> ${publicId}`);
    }
    const url = getBackupDownloadUrl(publicId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar el backup (${res.status}). ¿public-id correcto?`);
    return res.json();
}

const data = await loadBackupData();
console.log(`Backup generado: ${data.generatedAt} (usuario original: ${data.user?.username})`);

const targetUsername = args.user || data.user?.username;
if (!targetUsername) throw new Error('No se pudo determinar a qué usuario restaurar. Usa --user=<username>.');

const targetUser = await prisma.user.findUnique({ where: { username: targetUsername.toLowerCase() } });
if (!targetUser) {
    throw new Error(`No existe ningún usuario "${targetUsername}" en esta DB. Regístralo primero (POST /api/auth/register) y vuelve a correr este script.`);
}
console.log(`Destino: usuario "${targetUser.username}" (id ${targetUser.id})`);
console.log(APPLY ? 'Modo: APLICANDO cambios.\n' : 'Modo: solo contar (dry-run) — corre con --apply para escribir.\n');

const counts = { routines: 0, days: 0, exercises: 0, blocks: 0, workoutLogs: 0, sets: 0, personalRecords: 0, bodyLogs: 0, goals: 0, restLogs: 0 };

for (const routine of data.routines || []) {
    counts.routines++;
    if (APPLY) {
        await prisma.routine.upsert({
            where: { id: routine.id },
            create: {
                id: routine.id, name: routine.name, description: routine.description,
                isActive: routine.isActive, userId: targetUser.id,
                adaptiveDeloadUntil: routine.adaptiveDeloadUntil ? new Date(routine.adaptiveDeloadUntil) : null,
                lastAdaptiveCheckAt: routine.lastAdaptiveCheckAt ? new Date(routine.lastAdaptiveCheckAt) : null,
                createdAt: new Date(routine.createdAt)
            },
            update: { name: routine.name, description: routine.description, isActive: routine.isActive }
        });
    }

    for (const day of routine.days || []) {
        counts.days++;
        if (APPLY) {
            await prisma.routineDay.upsert({
                where: { id: day.id },
                create: { id: day.id, dayName: day.dayName, isRestDay: day.isRestDay, weekday: day.weekday ?? null, order: day.order, routineId: routine.id },
                update: { dayName: day.dayName, isRestDay: day.isRestDay, weekday: day.weekday ?? null, order: day.order }
            });
        }
        for (const exercise of day.exercises || []) {
            counts.exercises++;
            if (APPLY) {
                await prisma.exercise.upsert({
                    where: { id: exercise.id },
                    create: {
                        id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup,
                        targetSets: exercise.targetSets, targetReps: exercise.targetReps,
                        restSeconds: exercise.restSeconds, note: exercise.note, order: exercise.order,
                        isUnilateral: exercise.isUnilateral, routineDayId: day.id
                    },
                    update: {
                        name: exercise.name, muscleGroup: exercise.muscleGroup, targetSets: exercise.targetSets,
                        targetReps: exercise.targetReps, restSeconds: exercise.restSeconds, note: exercise.note,
                        order: exercise.order, isUnilateral: exercise.isUnilateral
                    }
                });
            }
        }
    }

    for (const block of routine.blocks || []) {
        counts.blocks++;
        if (APPLY) {
            await prisma.routineBlock.upsert({
                where: { id: block.id },
                create: {
                    id: block.id, name: block.name, phase: block.phase, order: block.order,
                    durationWeeks: block.durationWeeks,
                    startedAt: block.startedAt ? new Date(block.startedAt) : null,
                    routineId: routine.id
                },
                update: { name: block.name, phase: block.phase, order: block.order, durationWeeks: block.durationWeeks }
            });
        }
    }
}

for (const log of data.workoutLogs || []) {
    counts.workoutLogs++;
    if (APPLY) {
        await prisma.workoutLog.upsert({
            where: { id: log.id },
            create: { id: log.id, date: new Date(log.date), exerciseId: log.exerciseId, notes: log.notes },
            update: { date: new Date(log.date), notes: log.notes }
        });
    }
    for (const set of log.sets || []) {
        counts.sets++;
        if (APPLY) {
            await prisma.setLog.upsert({
                where: { id: set.id },
                create: {
                    id: set.id, setNumber: set.setNumber, weight: set.weight, reps: set.reps,
                    rpe: set.rpe, completed: set.completed, weightRight: set.weightRight,
                    repsRight: set.repsRight, workoutLogId: log.id
                },
                update: {
                    setNumber: set.setNumber, weight: set.weight, reps: set.reps, rpe: set.rpe,
                    completed: set.completed, weightRight: set.weightRight, repsRight: set.repsRight
                }
            });
        }
    }
}

for (const pr of data.personalRecords || []) {
    counts.personalRecords++;
    if (APPLY) {
        await prisma.personalRecord.upsert({
            where: { id: pr.id },
            create: { id: pr.id, exerciseName: pr.exerciseName, weight: pr.weight, reps: pr.reps, estimated1RM: pr.estimated1RM, date: new Date(pr.date), userId: targetUser.id },
            update: { weight: pr.weight, reps: pr.reps, estimated1RM: pr.estimated1RM }
        });
    }
}

for (const b of data.bodyLogs || []) {
    counts.bodyLogs++;
    if (APPLY) {
        const creatineTaken = Boolean(b.creatineTaken ?? false);
        const dietCompliant = Boolean(b.dietCompliant ?? false);
        const zeroLiquidCalories = Boolean(b.zeroLiquidCalories ?? false);
        await prisma.bodyLog.upsert({
            where: { id: b.id },
            create: {
                id: b.id, date: new Date(b.date), weight: b.weight ?? null, photoUrl: b.photoUrl ?? b.photo ?? null, note: b.note ?? null,
                bmi: b.bmi ?? null, bodyFat: b.bodyFat ?? null, muscleMass: b.muscleMass ?? null, bmr: b.bmr ?? null, bodyWater: b.bodyWater ?? null,
                visceralFat: b.visceralFat ?? null, boneMass: b.boneMass ?? null, protein: b.protein ?? null,
                creatineTaken, dietCompliant, zeroLiquidCalories,
                userId: targetUser.id
            },
            update: {
                weight: b.weight ?? null,
                note: b.note ?? null,
                creatineTaken,
                dietCompliant,
                zeroLiquidCalories
            }
        });
    }
}

for (const g of data.goals || []) {
    counts.goals++;
    if (APPLY) {
        await prisma.goal.upsert({
            where: { id: g.id },
            create: {
                id: g.id, exerciseName: g.exerciseName, muscleGroup: g.muscleGroup, targetWeight: g.targetWeight,
                targetReps: g.targetReps, createdAt: new Date(g.createdAt), achievedAt: g.achievedAt ? new Date(g.achievedAt) : null,
                currentOneRepMax: g.currentOneRepMax, currentEightRepMax: g.currentEightRepMax,
                experienceLevel: g.experienceLevel, frequencyPerWeek: g.frequencyPerWeek,
                completedWeeks: g.completedWeeks || [], userId: targetUser.id
            },
            update: { achievedAt: g.achievedAt ? new Date(g.achievedAt) : null, completedWeeks: g.completedWeeks || [] }
        });
    }
}

for (const r of data.restLogs || []) {
    counts.restLogs++;
    if (APPLY) {
        await prisma.restLog.upsert({
            where: { id: r.id },
            create: { id: r.id, date: new Date(r.date), note: r.note, userId: targetUser.id },
            update: { note: r.note }
        });
    }
}

console.log('\nResumen:', counts);
console.log(APPLY ? '\nListo, restauración aplicada.' : '\nNada escrito (dry-run). Revisa el resumen y vuelve a correr con --apply.');
await prisma.$disconnect();
