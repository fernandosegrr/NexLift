# Checklist anti-regresión — NexLift (camino caliente)

Correr **antes de merge a `main`** si tocaste workouts, fechas, RIR, offline, smart loading, rutinas, creatina o Atajo.

## Automatizado (obligatorio — 180 tests)

```bash
cd client && npm test   # 76 tests en Vitest
cd server && npm test   # 104 tests en Node test runner
```

Ambos en verde (180/180). Si tocaste `smartLoading` o `logic`: la paridad cliente/servidor va en los tests cruzados (`smartLoading.parity.test.js` y `routineDays.parity.test.js`).

## Smoke manual gym (~5–10 min)

1. **Login** → Dashboard carga instantáneo con cache `sessionStorage` (sin pantalla blanca).
2. **Daily Check-in** → Marcar Creatina / Dieta / Cero calorías líquidas actualiza al instante con feedback optimista.
3. **Entrenar hoy** → Tarjetas de series visibles sin scroll eterno (series-first).
4. **Serie 1** → Completar con peso/reps → modal RIR → Serie 2 sugiere peso/reps (chip / auto-fill).
5. **Top Set al fallo** → Si Serie 1 se registra con RIR 0 → Serie 2 sugiere Back-off Set (-12.5% de peso).
6. **Guardar ejercicio** → Reabrir → series y RIR correctos, **sin** push fantasma de descanso.
7. **Última serie** → Notificación push de descanso menciona el **próximo ejercicio** en la rutina.
8. **Saltar ejercicio** → Terminar día parcial → resumen post-sesión con volumen coherente y PDF descargable.
9. **Offline** → Activar modo avión / apagar backend → guardar → badge amarillo "pendiente" → reactivar red → **un solo** log reconciliado.
10. **Atajo de iOS** (o POST `/api/shortcuts/log-set`): Enviar RIR crudo 0–4 → en la PWA se visualiza el RIR correcto (no invertido).
11. **Noche CDMX (18:00 - 23:59)**: "Hoy" en dashboard/workout coincide exactamente con el día civil de México.
12. **Rutinas Manuales**: `WeekdayPicker` permite asignar días; Domingo (valor 0) se reconoce como día activo y no como descanso.

## Invariantes Críticas (nunca romper)

| # | Invariante | Justificación |
|---|------------|---------------|
| 1 | **Fechas CDMX:** "Hoy", filtros y días de la semana pasan siempre por helpers de `America/Mexico_City` (`mexicoCityDateStr`, `mexicoCityDayBounds`, etc.). | El contenedor corre en UTC; de noche CDMX agrupar por UTC desfasa los días. |
| 2 | **RIR Invertido:** `SetLog.rpe` en PostgreSQL = **`10 − RIR`**. El Atajo convierte con `convertShortcutRir(rawRir)`. | La app maneja RIR (0-4); la columna DB se llama rpe por herencia histórica. |
| 3 | **Validación RIR:** Serie con peso y reps > 0 **exige RIR obligatorio** en API y UI. | La autorregulación intra-sesión no puede calcular fatiga sin RIR. |
| 4 | **Regla de Carga:** Intra-sesión (`suggestNextSetFromToday`) **sí** puede bajar peso; inter-sesión (`computeWorkoutSuggestion`) **no** baja peso entre días. | Entre días aplica sobrecarga progresiva; dentro del día se autorregula la fatiga real. |
| 5 | **Atajo no fragmenta:** Atajo acumula en el mismo `WorkoutLog` de hoy si ya existe uno. | Evita generar múltiples sesiones fragmentadas para un mismo ejercicio en un día. |
| 6 | **Offline Queue Silenciosa:** `getQueue()` **nunca** notifica suscriptores en lecturas simples; solo mutaciones (`enqueueWrite`, `removeFromQueue`) notifican. | Evita ciclos de re-render y `RangeError: Maximum call stack size exceeded`. |
| 7 | **Modales con Portal:** Todo overlay `fixed inset-0` va dentro de `<Portal>`. | Las animaciones de Tailwind con `transform` romperían el viewport del modal con scroll. |
| 8 | **Paridad Cliente/Servidor:** Smart Loading, plateau, phases y rotaciones deben actualizarse en **ambos** lados. | Paridad validada automáticamente en suites de pruebas cruzadas. |
| 9 | **Weekday 0 (Domingo):** Comprobar siempre `weekday != null`, nunca truthiness (`if (day.weekday)`). | En JS `0` es falsey; evaluarlo por verdad descarta el Domingo en silencio. |
| 10 | **Creatina en 3 Etapas:** `evaluateCreatineReminderStage` evalúa base, +3h y 23:00; si `creatineTaken === true`, se anula. | Garantiza adherencia diaria sin spammear una vez tomada la dosis. |
| 11 | **Endpoints Agrupados:** `stats/home` y `stats/progress-page` deben preservar todas sus propiedades en la respuesta. | El frontend depende de estos objetos para pintar en un solo roundtrip. |
| 12 | **v4: SQL versionado y baseline PROVISIONAL.** Prohibido db push/reset; preflight y ensayo desechable, migración separada del HTTP. | El procedimiento v3 está retirado; ninguna migración persistente está autorizada. Ver docs/RELEASE-V4-RUNBOOK.md. |

## Protocolo ante Fallas

1. **No mergear a `main` ni desplegar.**
2. Crear un test de regresión automatizado que reproduzca el fallo en rojo **antes** de implementar el arreglo.
3. Corregir y verificar que los 180 tests queden en verde.
4. Documentar la causa raíz y el fix en `.agent/changelog.md` y actualizar `.agent/context.md`.
