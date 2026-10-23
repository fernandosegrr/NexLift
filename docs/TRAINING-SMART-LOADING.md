> Cierre de Fase 5 (5.4–5.5): [políticas, correcciones e integración vigentes](TRAINING-ANALYSIS.md).
> El contenido de fases anteriores se conserva como referencia histórica.

# Smart Loading actual — Fase 5.3

Fuente canónica: `packages/shared/src/domain/training/smartLoading.ts`. Las ocho
API históricas siguen disponibles en `client/src/utils/smartLoading.js` y
`server/src/logic.js`, mediante las entradas ESM/CJS de entrenamiento existentes.
No hay otra implementación activa de las reglas extraídas. Los snapshots bajo
`scripts/fixtures/phase53/` son referencias de pruebas, sin consumidores productivos.
No se implementa Smart Loading 2.0 ni se inicia 5.4.

## Mapa de consumidores reales

| Camino | Preparación y cálculo | Presentación, aplicación y persistencia |
| --- | --- | --- |
| Abrir rutina e iniciar Workout | `fetchDay` consulta rutinas y precarga historia de cada ejercicio; `useExerciseHistory` usa ese mapa o una consulta individual tras invalidación. `deriveHistoryDerived` descarta sesiones sin arrays/sets, obtiene mejor anterior y separa días CDMX | `suggestionByIndex` muestra la inter en filas no completadas; no autorrellena inter. Hook mantiene loading y descarta respuestas de otro ejercicio. Dependencias incluyen ID, rango, grupo, fase, nombre e historial precargado |
| Siguiente sesión PWA | Prefiere sesiones de días anteriores a hoy; si no hay ninguna utiliza las de hoy. Conserva orden recibido DESC, sin ordenamiento nuevo. `computeWorkoutSuggestion` usa únicamente la primera | Badge por fila permite aplicar a esa fila. Coach aplica a filas con ambos campos vacíos; respeta un campo ya escrito. Telemetría existente al aplicar global; no equivale a guardar sesión |
| Siguiente serie PWA | Recoge todas las filas completed con peso/reps truthy en orden del array; transforma lados por `effectiveWorkoutSet`; pasa RIR declarado de la fila. Primera fila incompleta recibe `suggestNextSetFromToday` | Intra puede autorrellenar únicamente fila totalmente vacía, una vez por clave ejercicio/índice/kg/reps; no pisa entradas manuales. Badge permite aplicar explícitamente. Unilateral copia sugerencia a ambos lados. Guardar exige esfuerzo y sigue su handler original |
| Atajo `GET /api/shortcuts/next-set` | Rutina activa del propietario, día manual/IA existente, primer ejercicio con menos series guardadas que targetSets. Historial por nombre case-insensitive y propietario, DESC, ventana10; sets de historia ASC setNumber. TodayLogs consultados separadamente | Primero intenta intra con primer log de hoy del ID, sin comprobar completed; si no puede, inter excluye solo ese log por ID y cae al historial completo si no quedan otros. Devuelve el contrato existente. SuggestionLog inter es fire-and-forget al mostrar; intra retorna antes de ese write |
| Registrar/editar/eliminar y volver | Mutaciones existentes cambian historial y recálculo PR en TX. Workout actualiza/limpia su caché después de guardar; nueva apertura/refetch recibe la historia modificada | No recalcula recomendaciones guardadas masivamente. EditSession no genera nuevas sugerencias. Historial no transforma rpe antiguo. Confirmación remota continúa separada de borrador y recomendación |
| Rutinas, bloques y descarga | `Exercise.targetReps`, nombre y grupo; `routine.phase` en PWA y `getRoutinePhaseStatus` en Atajo. Custom no modifica rango. IA solo decide ejercicios/día; no tiene fórmula Smart alternativa | Inter aplica el ajuste de peso deload existente fuera del núcleo: `round(raw.weight*0.9,increment,raw.weight)`. PWA comprueba phase==='deload', Atajo isDeload. Intra no aplica otro10%. No cambian activación, cooldown, plateau o calendario de descarga |
| Otros consumidores compartidos | `effectiveWorkoutSet` en plateau/volumen/estimación Workout; `roundWorkoutWeight` en calentamiento y descarga; `adjustRepRangeForPhase` en planificación existente backend | Cuerpo de plateau, fórmulas propias de e1RM, volumen, calentamiento y planes permanecen. No se sustituye la política PR por la del lado débil |

La PWA y Atajos pueden elegir contextos diferentes aun utilizando exactamente el
mismo motor. PWA excluye todos los logs del día CDMX para inter; Atajo excluye un
ID. PWA filtra completed antes de intra; Atajo filtra solo trabajo positivo. No
se unifican estas fronteras como corrección implícita. TodayLogs de Atajo no
establece orden SQL de sets; el núcleo respeta el que recibe. Un orden total
nuevo cambiaría recomendaciones y requiere una decisión futura.

Se reprodujo además una inconsistencia de la pantalla recibida: al preparar intra,
Workout pasa weightR/repsR vacíos aun en bilateral. `''` es no nullish y Number→0,
por lo que effectiveWorkoutSet puede devolver trabajo cero y el motor abstenerse.
La prueba Edge conserva esa abstención y luego registra ambos lados en unilateral
para verificar el backoff aplicado. No se cambia el JSX recibido para activar
sugerencias que antes no se generaban. El modo unilateral en un borrador legacy
sin IndexedDB tampoco se recupera automáticamente; los valores de lados sí se
conservan, y el test vuelve a seleccionar el modo antes de guardar.

## Reglas intersesión y orden exacto

1. Sin sesiones → null. Fase admite string o sobre `{phase}` legacy.
2. `String(targetReps || '').match(/\d+/g)`: primeros dos grupos; uno se repite;
   sin dígitos8–12. `12-8`→8–12, `2.5`→2–5, `-4`→4–4. No es parser decimal.
3. Intensificación: `max(1,round(lo*.5))`, techo `max(newLo,round(hi*.5))`.
   Acumulación: mismo suelo, `round(hi*1.5)`. Otras fases sin cambio.
4. Solo `sessions[0].sets || []`; map efectivo, después peso>0 y reps>0.
   No busca otra sesión válida si esta está vacía; no filtra completed.
5. Si lo>3 y existen series con reps>=3, excluye singles/doubles; si no, fallback
   a todas. Conserva peso>=75% del máximo de ese pool, con fallback original.
6. Si al máximo (`abs(delta)<.01`) hay RIR conocido<=1, ancla ese peso. Si no,
   elige mayor peso entre series con reps>=lo; si ninguna, mayor número de reps
   y después mayor peso. El comentario antiguo sobre fallback e1RM era inexacto:
   **esta selección no usa e1RM**.
7. Al peso de referencia (`abs(delta)<.01`), max reps, min reps y min RIR conocido.
   El top-set es el primer elemento con reps>=hi y RIR<=1. Todas al techo o ese
   top-set → round(refWeight+increment), reps=lo. Otra mejor al techo sin cumplir
   progreso → mismo peso, `min(hi,minReps+1)`. Resto → mismo peso,
   `min(hi,refReps+(RIR>=3?2:1))`, incluso debajo del suelo.
8. Peso<=0 o reps<=0 → null; resto conserva números y rationale literal.
   `basedOn=sessions.length` informa cantidad suministrada, no tendencia analizada.

No se añade tendencia reciente, edad del historial, frecuencia, porcentaje PR,
mejor rendimiento de toda la vida, sexo, experiencia, sueño o recuperación.
Puede abstenerse para un ejercicio nuevo; la fila vacía con placeholder0 no es
recomendación de peso cero. Intervalos largos sin entrenar no reducen peso solos.

## Reglas intrasesión y orden exacto

Entrada: series que el caller seleccionó, en su orden, y opciones lo/hi/increment/
phase o sobrecarga `(series,targetReps,increment,phase)`. Valores por defecto8/12/
2.5/null. Normaliza peso/reps con Number||0; RIR nullish o '' → null, otros Number.
Elimina trabajo no positivo; si cualquier serie restante carece RIR finito,
devuelve null. Stored rpe no reemplaza rir en esta función: debe prepararlo el
caller con la frontera contextual correcta.

Tras ajustar rango por fase, calcula primera/última, min/avg RIR, caída de RIR y
reps desde primera a última. Evalúa secuencialmente:

| Regla | Condición y resultado |
| --- | --- |
| first-failure-backoff | Una serie, RIR<=0: raw peso*.875; redondea; si baja usa max(increment positivo o.5,rounded). Si no baja usa fallback round(max(.5,peso-max(increment,.5))). Reps bajo techo → min(hi,max(lo,first.reps+2)); en techo o encima → first.reps+1, incluso fuera de rango |
| last-failure-step / below-range-step | Última RIR<=0 o reps<lo: raw max(0,last.weight-increment), round; mismo mínimo/fallback anterior. Reps=min(hi,max(lo,last.reps)) |
| fatigue-hold | Última RIR===1, caída RIR>=2 o caída reps>=2 con última RIR<=2: mismo peso y reps acotadas |
| comfortable-reps | avgRir>=2.5, minRir>=2 y última reps>=lo: mismo peso, min(hi,last.reps+(avg>=3?2:1)). Techo conserva peso; la subida es inter |
| neutral-hold | Resto: mismo peso, min(hi,max(lo,last.reps)) |

Mantiene el guard final peso/reps<=0. El texto «en alguna serie» de una rama
comprueba realmente la última; el nombre fatigue-hold expresa una regla de RIR
declarado, no medición fisiológica. Para cargas diminutas el mínimo por incremento
puede contradecir la descripción de «bajar». Se caracteriza y se conserva.

## Variables, unilateralidad y valores históricos

| Entrada | Ausencia/null/cero/invalidación y prioridad |
| --- | --- |
| Peso y reps izquierdos | `Number(value)||0`; vacíos/null/NaN→0; positivos conservan decimales legacy. Cero/no positivo se filtra en motores. Infinity puede sobrevivir históricamente y producir NaN/Infinity: no se finge validación nueva. API conserva su validación finita/entera propia |
| Derecho | Cada campo nullish hereda izquierdo; si existe cualquiera se usan mínimos de peso y reps independientes. Derecho0 permanece0; solo derecho con izquierdo ausente no genera trabajo. Vacío no nullish se convierte a0. Lado incompleto puede mezclar valores de ambos, sin promedio |
| Esfuerzo efectivo inter | rpe no nullish manda, convertido mediante storedRpeToRir de5.2, después raw rir no nullish o null. No rango/clamp nuevos. Raw rir se conserva como recibido hasta comparaciones/Math.min; coerción aritmética legacy explícita preserva TypeError Symbol/BigInt, incluso boxed/ToPrimitive |
| RIR intra | Raw declarado; ''/null/ausente abstiene si trabajo positivo. Cero es fallo; blanco Number→0 histórico; no finito abstiene. No reinterpretar rpe como RIR legacy dentro del núcleo |
| Reps objetivo | No inventar valor guardado; parser tiene fallback8–12 y peculiaridades descritas. Rango0 puede terminar en null. Fase solo cambia este rango local |
| Incremento | Caller actual decide5kg si grupo exacto Piernas/legs o regex de pierna con grupo falsy;2.5 resto. Nombre desconocido/grupo no vacío desactiva inferencia. No existe preferencia persistida personal de incremento. API pura conserva argumento; incremento0 usa rejilla.5 por módulo NaN |
| Orden y metadatos | Array ordenado explícitamente por caller; setNumber/date no son leídos por motor. completed no filtra en núcleo. Rutina/mesociclo/posición eligen contexto en adaptador; solo fase llega al cálculo |
| Offline/Atajo/importación | Mismos campos históricos conservados; el origen no cambia reglas matemáticas. Esfuerzo de log-set se normaliza antes por parser legacy5.2. v1 usa almacenado aun source=shortcut. performedAt/versión/hash siguen fuera del motor |

PR elige mejor lado, Smart mínimos independientes; cappedEpley de5.1 y PR Epley
de5.2 **no intervienen** en estas recomendaciones. estimate1RM de Workout solo
selecciona mejor anterior/goal/warmup; conserva su fórmula anterior.

## Precisión y explicaciones

Rejilla: `abs(base%increment)<.01 ? increment : .5`; resultado
`Math.round(weight/grid)*grid`. Se conserva .01 existente para selección de rejilla
y agrupación de cargas. Sin epsilon nuevo, redondeo decimal global o cambio en el
orden aritmético. 6.8+2.5→9.5;80×12 inter→82.5×8;80×8 RIR0 intra→70×10.

`evaluateWorkoutSuggestion` y `evaluateNextSetFromToday` retornan internamente
recommendation + explanation tipada: regla/abstención, referencia, rango, número
de series, RIR observado, incremento, rawWeight, rejilla, delta y limitaciones.
Intra indica fallbackStep cuando interviene el segundo ajuste. resultWeight
incluye mínimo/fallback; rawWeight es el primer candidato antes de esos ajustes.
Los wrappers públicos proyectan exactamente la recomendación histórica. No se
adjuntan explicaciones a DTO HTTP, journal, SuggestionLog, comprobantes o hashes;
no hay logging del historial real ni nuevo estado global/reloj/caché.

## Verificación y coste

28 goldens con expectativas numéricas explícitas, salidas/textos de snapshot
independiente y comparación de las cuatro entradas (shared, PWA, backend, CJS).
Se reejecutan las480 combinaciones5.1 y500 historias con semilla; rejillas adversas,
errores, lados, ceros, umbrales, single/1000reps, orden y fechas fuera del núcleo.
Seis errores TypeScript controlados constituyen un caso del compilador.

25 pruebas nuevas de dominio/tooling/Edge y4 HTTP/SQL: **29 nuevas**, sin sumar
combinaciones interiores como casos. Edge monta el Workout real con adaptadores
sintéticos; suites offline recibidas certifican journal/Dexie/SW/conflictos/
reinicio sobre PostgreSQL real desechable. El test SQL ejecuta el callback real de
next-set extraído sin arrancar index/dotenv/jobs; conserva su cuerpo byte a byte.

Inter e intra O(n) sobre las series seleccionadas, arrays locales O(n), sin ordenar
historia ni mutarla. Inter no recorre sesiones antiguas. Las explicaciones tienen
coste local acotado; no añaden queries. Microbenchmark reproducible0/10/100/1000
series y100 ejercicios,100 iteraciones y5 muestras, logs del comando final. No
equivale a latencia VPS o tiempos de render reales. Edge verifica render funcional;
no se modifica memoización ni su lista de dependencias, ni se añaden cachés
persistentes. Queda el límite histórico de spreads para arrays patológicamente
grandes; no se cambia por una reordenación numérica global.

## Preparación documental para Fase11

| Clase | Posible trabajo futuro; no implementado |
| --- | --- |
| A: datos existentes | Historial por propietario, sets, lados, fechas, esfuerzo declarado, rango, fase y sugerencia aplicada/mostrada. Analizar calidad y cobertura antes de personalizar |
| B: derivables | Respuesta individual a incrementos, frecuencia civil, adherencia sugerido/realizado y dispersión por ejercicio. Requieren ventanas, empates y políticas de contexto explícitas |
| C: datos nuevos | Sueño, dolor, recuperación subjetiva, equipo/discos disponibles y esfuerzo por lado si el producto los necesita; consentimiento, validación y modelo propios |
| D: hipótesis deportivas | Vincular señales a fatiga/recuperación, progresión individual o hipertrofia necesitaría evaluación. No se deduce causalidad de RIR ni una confianza fisiológica de basedOn |

Para5.4: mantener fixtures, entradas y políticas nombradas; decidir explícitamente
si se corrigen contextos PWA/Atajo, cargas pequeñas, orden de todayLogs, estados
incompletos y datos no finitos. No modificar plateau/deload/fechas como parte de
una extracción posterior. Esta fase no activa ninguna regla nueva de carga.

Producción no accedida/modificada. Sin credenciales operativas, migraciones
persistentes, schema/SQL, commits o despliegues. Baseline **PROVISIONAL**;
sincronización nueva deshabilitada en producción. Resultados integrales en
[PHASE-5.3](../server/audit/training-engine/PHASE-5.3.md).
