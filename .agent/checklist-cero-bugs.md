# Checklist anti-regresión — NexLift (camino caliente)

Correr **antes de merge a `main`** si tocaste workouts, fechas, RIR, offline, smart loading o Atajo.

## Automatizado (obligatorio)

```bash
cd client && npm test
cd server && npm test
```

Ambos en verde. Si tocaste `smartLoading`/`logic`: la paridad cliente/servidor va en el test del client.

## Smoke manual gym (~5–10 min)

1. **Login** → home carga (rutina / “sin rutina”).
2. **Entrenar hoy** → series visibles sin scrollear eterno (series-first).
3. Completar **serie 1** con peso/reps → modal RIR → S2 sugiere (chip / auto-fill).
4. RIR 0 en S1 → S2 **baja peso** (si aplica incremento).
5. Guardar ejercicio → reabrir → series y RIR correctos, **sin** push fantasma de descanso.
6. **Saltar** un ejercicio → terminar día parcial → resumen con volumen sensato.
7. (Si se puede) **Offline**: apagar server o mode offline → guardar → badge pendiente → online → **un solo** log.
8. **Atajo** (o POST `log-set`): RIR crudo 0–4 → en PWA se ve RIR correcto (no invertido).
9. **Noche CDMX** (o forzar reloj mental): “hoy” en dashboard/workout coincide con el día real de gym.

## Invariantes (nunca romper)

| # | Invariante |
|---|------------|
| 1 | “Hoy” y día de semana = calendario **América/Ciudad_de_México** (`mexicoCityDateStr` / `getTodayName` CDMX). |
| 2 | `SetLog.rpe` en DB = **10 − RIR**. Atajo convierte con `convertShortcutRir`. |
| 3 | Serie con peso y reps > 0 **exige RIR** (API + UI). |
| 4 | Intra-sesión puede bajar peso; inter-sesión (`computeWorkoutSuggestion`) **no**. |
| 5 | Un ejercicio / día: Atajo acumula en el mismo `WorkoutLog` (transacción). |
| 6 | Offline queue: `getQueue` **no** notifica listeners (solo mutaciones). |
| 7 | Modales `fixed` → siempre `<Portal>`. |
| 8 | Smart Loading / plateau / phase: tocar **cliente y server** (paridad). |

## Si falla algo

1. No mergear.
2. Test de regresión que falle en rojo **antes** del fix (si es lógica pura).
3. Documentar en `.agent/changelog.md` con causa raíz (como bugs históricos).
