> Cierre de Fase 5 (5.4–5.5): [políticas, correcciones e integración vigentes](TRAINING-ANALYSIS.md).
> El contenido de fases anteriores se conserva como referencia histórica.

> Fase 5.3: [Smart Loading compartido, reglas y consumidores actuales](TRAINING-SMART-LOADING.md).
> Las ubicaciones y limitaciones de fases anteriores se conservan debajo como referencia histórica.

# Inventario previo a Fase 5

> Actualización 5.2: [motor de esfuerzo y PR](TRAINING-PERFORMANCE.md).
> `effort.ts` y `personalRecords.ts` añaden lógica pura real al dominio compartido.
> Las consultas/autorización/escrituras y los demás algoritmos conservan su ubicación.

> Actualización 5.1: el inventario de lectura de 4.4 se conserva debajo como
> referencia histórica. La [auditoría contrastada](TRAINING-ENGINE-AUDIT.md)
> documenta las variantes y la primera extracción real de Epley con cap36.
> [Resultados y evidencia](../server/audit/training-engine/PHASE-5.1.md).

Inventario de lectura de 4.4; no implementa la siguiente fase. Algoritmos y pruebas
permanecen intactos. Caracterizar bordes, orden, nulos y series unilaterales antes
de decidir qué variantes pueden unificarse.

| Área | Código real y pruebas | Candidato puro / responsabilidad backend |
| --- | --- | --- |
| Smart Loading | `client/src/utils/smartLoading.js`; espejo en `server/src/logic.js`: parseRepRange, resolveWeightIncrement, effectiveWorkoutSet, roundWorkoutWeight, adjustRepRangeForPhase, pickWorkReference, computeWorkoutSuggestion, suggestNextSetFromToday. `smartLoading.parity.test.js`, `logic.test.js`. | Selección/redondeo/sugerencia con sesiones/fase explícitas pueden ser puras. Historial autorizado, elección de ventana y SuggestionLog corresponden al backend. |
| Personal Records | `server/src/services/personalRecords.js`; consumidores workoutTransaction/workoutOperations/rutas legacy; presentación `client/src/utils/strength.js`. Pruebas SQL de sesiones, operaciones, conflictos y offline. | Seleccionar candidato/desempate puede separarse después. Conservar orden ascendente y `>` estricto. PR aplica Epley solo con `1 < reps < 37`; difiere de Smart Loading en >=37. Queries por cuenta y reemplazo del PR dentro de la transacción siguen backend. |
| RIR/RPE y lados | `logic.js`: sanitizeSets, sanitizeShortcutLogSet, convertShortcutRir; Workout/EditSession; contratos shared/protocolo; pruebas legacy/Atajos y operaciones. | DB rpe=10-RIR; Atajo recibe RIR bajo rpe. Futuras conversiones puras deben distinguir las entradas. Conservar representación, null, cero, incompletas y fallback del lado derecho. Autorización y transacción siguen backend. |
| Volumen | Workout.jsx:sessionVolumeFromSets; index.js:overview/home/consistency y descarga adaptativa; dayPdf.js/sessionPdf.js. | Comparar antes las reglas sobre completadas, lados, redondeo y ventanas. Aritmética sobre series puede ser pura; consultas por propietario y bounds CDMX siguen backend. No asumir equivalencia entre variantes. |
| Estancamientos | logic.js:detectPlateauForExercise; `/api/stats/plateaus`; descarga adaptativa en index.js; Progress.jsx. | Detección con historial explícito es candidata pura. Consultar últimas sesiones por ejercicio/usuario, umbrales de descarga y escribir adaptiveDeloadUntil siguen backend hasta definir puertos. |
| Mesociclos | logic.js:getActiveBlock, currentWeekInBlock, getRoutinePhaseStatus, pickNextSplitDay; rutas de bloques en index.js; UI de rutina/Workout. | Calendario/fase con now explícito pueden ser puros. Lectura autorizada, inicio de bloques y persistencia siguen backend. Caracterizar bloque más reciente y fronteras semanales. |
| Fechas/calendarios | Helpers CDMX en logic.js y client/src/utils/dates.js; duplicados findRoutineDayForWeekday/scheduledRestWeekdays en routineDays.js; routineDays.parity.test.js/dates.test.js. | Inyectar instante y conservar Intl/CDMX, domingo=0, null y menor order. Bounds UTC/filtros de consulta en adaptadores. No sustituir por offset fijo o reloj global implícito. |
| Fuerza/objetivos | strength.js, goalPlanner.js, Workout/Progress y logic.js. | Revisar unidades, e1RM y estimaciones antes de decidir si son presentación o dominio. No equiparar funciones solo por nombre. |

Evaluar en Fase 5: dominio puro sin React/Prisma/Dexie, DTO HTTP validados por
shared, modelos de presentación separados, adaptadores de persistencia y reloj/
orden explícitos. Empezar por pruebas diferenciales. Mantener propietario,
versiones, PR y comprobante en la misma transacción. Separar cambios deportivos
de migración de tipos y resolver diferencias con decisiones documentadas.
