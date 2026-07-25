// Backfill de RoutineDay.weekday para rutinas MANUALES existentes, creadas
// antes de que el día de la semana fuera un campo explícito. Antes de este
// campo, "qué toca hoy" se adivinaba parseando `dayName` contra el nombre del
// día de la semana (normalizeDay + slice(0,3)) — fallaba en silencio para
// cualquier día llamado "Día 1", "Push", "Full Body A", etc. (ver
// findRoutineDayForWeekday/inferWeekdayFromName en src/logic.js).
//
// Reglas por día, en orden:
//   1. inferWeekdayFromName(dayName) si el resultado no choca con un weekday
//      ya asignado en la misma rutina (ej. "Lunes - Torso" -> Lunes).
//   2. Si no, POSICIONAL por `order`: weekday = (order + 1) % 7, es decir
//      order 0 -> Lunes, ..., order 5 -> Sábado, order 6 -> Domingo. Es el
//      anclaje correcto para el caso real que motivó esta migración: rutinas
//      "Día 1..Día 5" (entreno) + "Día 6"/"Día 7" (isRestDay) quedan
//      Lun-Vie entreno, Sáb+Dom descanso.
//   3. Si el destino posicional ya está tomado, camina Lun->Dom hasta el
//      primer weekday libre.
//   4. Si los 7 ya están tomados, se deja `null` (sin asignar) con un aviso.
//
// Rutinas `source: 'ai'` y la papelera del sistema (ARCHIVED_HISTORY_DO_NOT_DELETE)
// se saltan ENTERAS: sus RoutineDay no representan días de la semana (fecha
// ISO / "Bin") y asignarles weekday inflaría la racha en falso.
//
// Idempotente: un día que ya tiene weekday asignado se salta siempre.
// Dry-run por defecto (solo imprime qué cambiaría). Correr con --apply para
// escribir de verdad: `node backfill-routine-weekday.mjs --apply`.
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { inferWeekdayFromName } from './src/logic.js';

dotenv.config();

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const routines = await prisma.routine.findMany({
    where: {
        source: 'manual',
        name: { not: 'ARCHIVED_HISTORY_DO_NOT_DELETE' }
    },
    include: { days: { orderBy: { order: 'asc' } } }
});

console.log(`${routines.length} rutina(s) manual(es) a revisar.`);
console.log(APPLY ? 'Modo: APLICANDO cambios.\n' : 'Modo: solo mostrar (dry-run) — corre con --apply para escribir.\n');

let totalAssigned = 0;
let totalUnassignable = 0;

for (const routine of routines) {
    const days = routine.days;
    const pending = days.filter(d => d.weekday == null);
    if (pending.length === 0) continue;

    console.log(`Rutina: "${routine.name}" (${routine.id})${routine.isActive ? ' [ACTIVA]' : ''}`);
    if (days.length > 7) {
        console.log(`  aviso: ${days.length} días — un ciclo de más de 7 días no es expresable con día de la semana; las que sobren quedan sin asignar.`);
    }

    const taken = new Set(days.filter(d => d.weekday != null).map(d => d.weekday));
    const assignedByOrder = [];

    for (const day of pending) {
        const inferred = inferWeekdayFromName(day.dayName);
        let assigned = null;
        let reason = null;

        if (inferred != null && !taken.has(inferred)) {
            assigned = inferred;
            reason = 'inferido del nombre';
        } else {
            const desired = (day.order + 1) % 7;
            for (let step = 0; step < 7; step++) {
                const candidate = (desired + step) % 7;
                if (!taken.has(candidate)) {
                    assigned = candidate;
                    reason = 'por orden';
                    break;
                }
            }
        }

        if (assigned == null) {
            console.log(`  order=${day.order} "${day.dayName}" -> SIN ASIGNAR (los 7 días de la semana ya están tomados)`);
            totalUnassignable++;
            continue;
        }

        taken.add(assigned);
        if (reason === 'por orden') assignedByOrder.push(WEEKDAY_LABELS[assigned]);
        console.log(`  order=${day.order} "${day.dayName}" -> ${WEEKDAY_LABELS[assigned]} (${reason})`);
        totalAssigned++;
        if (APPLY) {
            await prisma.routineDay.update({ where: { id: day.id }, data: { weekday: assigned } });
        }
    }

    if (assignedByOrder.length > 0) {
        console.log(`  pista: asignado por orden -> ${assignedByOrder.join(', ')}. Si en realidad entrenas otros días, ajústalo en el editor.`);
    }
    console.log('');
}

console.log(`${totalAssigned} día(s) asignado(s), ${totalUnassignable} sin poder asignar.`);

await prisma.$disconnect();
console.log(APPLY ? '\nListo, cambios aplicados.' : '\nNada escrito (dry-run). Revisa la lista y vuelve a correr con --apply.');
