// Corrige el RIR mal guardado por el Atajo de iOS: antes del fix en
// POST /api/shortcuts/log-set, el Atajo preguntaba "RIR?" y mandaba ese número
// crudo (0-4) bajo el nombre `rpe`, que se guardaba tal cual en SetLog.rpe. Pero
// el resto de la app (guardado manual en Workout.jsx) guarda ahí el valor
// invertido `10 - RIR`, no el RIR crudo, y lo revierte igual al leer.
//
// Cualquier SetLog.rpe <= 6 en la base solo pudo llegar por esa vía: el flujo
// manual únicamente produce 7-10 (botones de RIR 0-3 -> 10 - RIR), y
// EditSession.jsx (edición de sesiones pasadas) solo hace passthrough de lo ya
// guardado, sin exponer un input editable de RIR — nunca introduce valores
// nuevos. Por eso es seguro reinterpretar cualquier rpe <= 6 como RIR crudo y
// aplicar la conversión correcta ahora.
//
// Dry-run por defecto (solo imprime qué cambiaría, no escribe nada). Correr con
// --apply para aplicar de verdad: `node fix-shortcut-rir.mjs --apply`.
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const AMBIGUOUS_MAX = 6; // rpe > 6 solo lo produce el flujo manual (RIR 0-3 -> rpe 7-10)

const rows = await prisma.setLog.findMany({
    where: { rpe: { lte: AMBIGUOUS_MAX, gte: 0 } },
    include: { workoutLog: { include: { exercise: true } } },
    orderBy: { workoutLog: { date: 'asc' } }
});

console.log(`${rows.length} serie(s) con RIR probablemente sin convertir (rpe <= ${AMBIGUOUS_MAX}).`);
console.log(APPLY ? 'Modo: APLICANDO cambios.\n' : 'Modo: solo mostrar (dry-run) — corre con --apply para escribir.\n');

for (const row of rows) {
    const corrected = 10 - row.rpe;
    const exName = row.workoutLog?.exercise?.name ?? '(ejercicio desconocido)';
    const date = row.workoutLog?.date?.toISOString().slice(0, 10) ?? '?';
    console.log(`  ${date}  ${exName}  set ${row.setNumber}  rpe ${row.rpe} -> ${corrected}`);
    if (APPLY) {
        await prisma.setLog.update({ where: { id: row.id }, data: { rpe: corrected } });
    }
}

await prisma.$disconnect();
console.log(APPLY ? '\nListo, cambios aplicados.' : '\nNada escrito (dry-run). Revisa la lista y vuelve a correr con --apply.');
