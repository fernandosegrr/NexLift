# Plan de mejoras de NexLift — para ejecutar con una IA

> **Estado (17 Octubre 2026):** P0–P5 **completadas** (v2.5.0 → v2.6.2). Mejoras de producto y estabilidad v2.7.x–v2.9.x completadas. **v3.0.0 completada** (recordatorios escalonados de creatina, Daily Check-in de hábitos, endpoints agrupados de 1 solo round-trip `stats/home` y `stats/progress-page`, importación web de backups y 180 tests automatizados — ver `.agent/changelog.md`).
>
> Este archivo queda como referencia histórica y metodológica de la evolución de las fases de ingeniería del proyecto.


---

## Reglas globales (leer ANTES de tocar código)

1. **Lee primero** `CLAUDE.md` y `.agent/context.md` completos. Los gotchas ahí no son sugerencias — cada uno costó un bug real en producción.
2. **Prisma: SOLO `npx prisma db push`**, nunca `migrate` (no hay historial de migraciones; `migrate dev` ofrece resetear TODO el schema = pérdida total de datos). Si el server corre en Windows, `npx prisma generate` aparte.
3. **Fechas en el backend:** cualquier cálculo de "qué día es" pasa por los helpers CDMX de `server/src/index.js` (`mexicoCityDateStr`, `mexicoCityDayBounds`, `mexicoCityHour`, `dayOfWeekFromDateStr`). Nunca `new Date()` / `.toISOString()` / `.getDay()` directo para agrupar por día.
4. **Lógica duplicada cliente/servidor a propósito** (no hay `shared/`): plateau, Epley, `adjustRepRangeForPhase`, Smart Loading. Si tocas una copia, toca la otra.
5. **Modales:** todo overlay `fixed inset-0` va envuelto en `<Portal>` (`client/src/components/ui/Portal.jsx`).
6. **Tailwind:** clases completas y literales en el código, nunca construidas con interpolación de strings.
7. **No toques datos de producción** sin confirmación explícita del usuario. Los datos de prueba se borran inmediatamente después de verificar.
8. **Verificación manual obligatoria** al final de cada fase: levantar `server` + `client` y probar el flujo afectado en el navegador.

---

## P0 — Respaldo automático de la base de datos 🔴 (riesgo real #1)

**Por qué primero:** un solo VPS, sin migraciones, sin réplicas — los datos (265+ sesiones reales) son irreemplazables. Hoy el único backup es el botón manual de Settings, que depende de que el usuario se acuerde.

**Qué construir:**
1. Job diario dentro del server (mismo patrón `setInterval` que `checkReengagementReminders` en `server/src/index.js`), que corre a las ~04:00 CDMX (usar `mexicoCityHour`).
2. El job genera un export JSON completo por usuario — **reutiliza las mismas queries del endpoint de backup existente** (el que alimenta "Exportar Backup JSON" en Settings), no reinventes el formato.
3. Sube el JSON a Cloudinary como `resource_type: 'raw'` en una carpeta `nexlift-backups/` (Cloudinary ya está configurado para fotos — reutiliza el cliente/credenciales de `uploadPhoto()`).
4. Retención: conserva los últimos 14 backups, borra los más viejos vía la API de Cloudinary.
5. No-op limpio si faltan credenciales de Cloudinary (mismo criterio que `uploadPhoto()` y VAPID).
6. Registrar en un campo o log la fecha del último backup exitoso, y exponerla en `GET /api/health` para poder vigilarla.
7. Documentar en `README`/`context.md` el procedimiento de **restauración** (cómo re-importar el JSON) — un backup sin procedimiento de restore probado no es un backup.

**Complemento (documentar, no codear):** dejar en el README el cron recomendado a nivel VPS con `pg_dump` (EasyPanel permite agregar servicios/cron), como segunda capa.

**Criterios de aceptación:**
- Forzar una corrida manual (flag temporal o llamada directa a la función) → aparece el archivo en Cloudinary y el JSON parsea y contiene rutinas + logs + PRs + body logs.
- Con >14 backups simulados, los viejos se borran.
- Sin credenciales Cloudinary, el server arranca y no truena.

---

## P1 — Tests de las funciones puras 🔴 (la red de seguridad que no existe)

**Por qué:** el historial del proyecto es la evidencia — el bug de zona horaria se "arregló" 3 veces, el RIR quedó invertido, las sugerencias llegaron a proponer bajar peso. Todo eso es lógica pura, testeable sin DB ni navegador.

**Qué construir:**
1. **Cliente:** agregar `vitest` a `client/` (devDependency, script `npm test`). Tests para `client/src/utils/exerciseName.js`:
   - `canonicalExerciseKey`: acentos, plurales, prefijos "A1.", sufijos "(bíceps)"; y que NO fusiona variantes de equipamiento ("press inclinado (mancuernas)" ≠ "(smith)").
   - `epley1RM`, `best1RMRecent`, `bestOneRepMaxForTarget` (solo cuentan series con reps ≤ target+1 — el bug de v2.1.0).
   - `detectPlateau`: <4 sesiones = sin señal; empate = plateau; mejora clara = no plateau.
   - `groupHistoryByExercise`.
2. **Servidor:** extraer las funciones puras de `server/src/index.js` a un módulo nuevo `server/src/logic.js` — **extracción literal (cortar/pegar + import), cero reescrituras** — al menos: helpers CDMX, `adjustRepRangeForPhase`, `detectPlateauForExercise`, la conversión RIR del endpoint de shortcuts, y `computeWorkoutSuggestion` si no arrastra dependencias de Prisma. Tests con `node --test` o vitest:
   - Helpers CDMX: casos alrededor de medianoche UTC (18:00-23:59 CDMX = día siguiente en UTC) — el bug histórico exacto.
   - Conversión RIR: ida y vuelta `10 - x`.
   - `adjustRepRangeForPhase`: intensification 8-12→4-6, accumulation 8-12→8-18, deload multiplicador ~0.9, custom sin cambios.
3. **Tests de paridad cliente/servidor:** exportar la copia cliente de `adjustRepRangeForPhase` (hoy dentro de `Workout.jsx`) a `client/src/utils/` (re-import en Workout.jsx, sin cambiar comportamiento) y un test que corra los mismos fixtures por ambas copias exigiendo resultados idénticos. Para plateau, mismos fixtures por ambas implementaciones documentando la diferencia deliberada (agrupación por id vs nombre canónico).
4. Documentar `npm test` en la sección Comandos de `context.md` y quitar/matizar el gotcha "sin tests automatizados".

**Criterios de aceptación:**
- ≥30 tests en verde, `npm test` funciona en `client/` y `server/`.
- Cero cambios de comportamiento: smoke test manual del Workout (sugerencia visible e igual que antes de la extracción).

---

## P2 — Recordatorios de descanso que sobrevivan un deploy 🟡

**Por qué:** `scheduleRestReminder` y `pendingRestReminders` viven en memoria (`setTimeout` + `Map`). Cada deploy o reinicio del contenedor a mitad de un descanso pierde el push en silencio. Con deploys frecuentes en EasyPanel, pasa en la práctica.

**Qué construir:**
1. Modelo nuevo `PendingReminder` (`userId`, `exerciseId`, `fireAt DateTime`, `nextExerciseName String?`) con `@@unique([userId, exerciseId])`. `db push`.
2. `scheduleRestReminder` hace `upsert` de la fila (el unique reemplaza al pendiente anterior = conserva el dedup actual) además del `setTimeout` en memoria. Al disparar o cancelar, borra la fila.
3. Al arrancar el server: leer filas pendientes — `fireAt` en el futuro → re-agendar; `fireAt` pasado hace <5 min → disparar de inmediato; más viejo → borrar sin disparar (un aviso de descanso de hace 20 min ya no sirve).
4. Mantener el no-op sin VAPID (pero la fila sí se puede escribir/limpiar igual, o no escribirse — decide y documenta).

**Criterios de aceptación:**
- Completar una serie con `restSeconds` largo (ej. 120s) → reiniciar el server a mitad → el push llega de todos modos a la hora correcta.
- Completar 2 series seguidas → sigue llegando UN solo push (dedup intacto).
- Reiniciar con un recordatorio ya vencido hace >5 min → no llega nada y la fila se limpia.

---

## P3 — Registro offline con cola de sincronización 🟡 (el salto de calidad del caso de uso real)

**Por qué:** la PWA cachea assets pero registrar series sin señal falla — y los gyms (sótanos) son exactamente donde hay mala cobertura. `useWorkoutPersistence` ya guarda cada keystroke en localStorage; falta que el *guardado al backend* también tolere estar offline.

**Alcance: SOLO el registro de entrenamiento** (`POST /api/workouts/log`, `PUT /api/workouts/:logId`, `POST /api/workouts/log-rest`). No fotos, no goals, no rutinas.

**Qué construir:**
1. En `client/src/services/api.js` (`safeFetch` ya centraliza los fallos de red): si una de esas escrituras falla por red (no por 4xx/5xx del server), encolar `{ op, payload, exerciseId, fecha, timestamp }` en localStorage.
2. UI: badge/toast "Guardado local — pendiente de sincronizar" en el ejercicio afectado (nunca fingir que se guardó en el server).
3. Replay: en el evento `online` y al abrir la app, drenar la cola en orden. **Regla anti-duplicados:** antes de reintentar un `POST /api/workouts/log`, consultar si ya existe un log de hoy para ese ejercicio — si existe, convertir a `PUT /api/workouts/:logId` (la misma reconciliación que ya usa el flujo de sesiones parciales del Atajo). Esto cubre el caso "el POST sí llegó pero la respuesta se perdió".
4. Si el replay recibe un 4xx real (ej. validación), sacar el item de la cola y avisar — no reintentar infinito.
5. Los datos encolados caducan a las 48h (un log de hace 2 días encolado probablemente ya se registró por otra vía).

**Criterios de aceptación (probar en navegador con DevTools → offline):**
- Offline → registrar un ejercicio completo → UI muestra pendiente → volver online → aparece exactamente UN `WorkoutLog` correcto en el server.
- Offline → guardar → recargar la página → volver online → sigue sincronizando (la cola sobrevive recargas).
- Simular respuesta perdida (POST exitoso + replay) → no se duplica el log.

---

## P4 — Auditoría de rendimiento 🟢

**Qué revisar (medir primero, optimizar después — reportar números antes/después):**
1. `getWorkoutHistory(500)` en Dashboard y Progress: tamaño real del payload y tiempo. Si pesa (>500KB o >1s), evaluar: endpoint de agregación server-side para plateau/1RM, o reducir el `include` a los campos que el cliente usa.
2. Revisar los `include` anidados de Prisma en los endpoints calientes (`/api/routines`, `/api/workouts/history`, `/api/stats/*`) buscando N+1 o over-fetching.
3. `npm run build` en client: confirmar que el code-splitting sigue efectivo (bundle inicial ~272KB era la marca de v2.0.0) y que nada pesado se coló al chunk inicial.
4. Lighthouse (PWA + performance) en móvil como línea base documentada.

**Criterio de aceptación:** informe corto en el commit/changelog con mediciones, y aplicados solo los fixes de bajo riesgo (los estructurales se proponen, no se ejecutan sin aprobación).

---

## P5 — Calibración del entrenador inteligente 🟢 (opcional, requiere semanas de datos)

**Por qué:** los umbrales (declive <85%, ≥3 plateaus, ±50% de rango, -10% deload) están marcados en la doc como "primera aproximación, sin validar contra uso real".

**Qué construir:**
1. Instrumentación mínima: modelo `SuggestionLog` (`exerciseId`, `date`, `suggestedWeight`, `suggestedReps`, `phase`, `source: 'client'|'shortcut'`) escrito cuando se genera una sugerencia (servidor: en `/api/shortcuts/next-set`; cliente: un POST fire-and-forget al aplicar la sugerencia).
2. Script de análisis `server/analyze-suggestions.mjs` (solo lectura): compara sugerido vs realizado (¿el usuario siguió la sugerencia? ¿le quedó corta/larga según el RIR registrado?) y imprime un resumen por ejercicio/fase.
3. **No cambiar ninguna constante todavía** — solo recolectar. Ajustar constantes es una decisión del usuario con el reporte en la mano, semanas después.

**Criterio de aceptación:** cada sugerencia mostrada/aplicada genera exactamente una fila; el script corre contra la DB y produce el resumen sin escribir nada.

---

## Orden y dependencias

```
P0 (backup)        → independiente, primero SIEMPRE
P1 (tests)         → independiente; hazla antes de P2/P3 (te protege al tocar lógica)
P2 (reminders)     → independiente
P3 (offline)       → después de P1 idealmente; es la fase más delicada
P4 (perf)          → cuando sea; no bloquea nada
P5 (calibración)   → al final; necesita uso real acumulado
```

Versionado sugerido: P0+P1 = v2.5.0, P2 = v2.5.1, P3 = v2.6.0, P4/P5 = v2.6.x.
