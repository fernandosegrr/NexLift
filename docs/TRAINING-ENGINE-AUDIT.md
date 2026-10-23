> Cierre de Fase 5 (5.4–5.5): [políticas, correcciones e integración vigentes](TRAINING-ANALYSIS.md).
> El contenido de fases anteriores se conserva como referencia histórica.

> Fase 5.3: [Smart Loading compartido, reglas y consumidores actuales](TRAINING-SMART-LOADING.md).
> Las ubicaciones y limitaciones de fases anteriores se conservan debajo como referencia histórica.

# Motor de entrenamiento: auditoría matemática 5.1

> Continuación 5.2: [esfuerzo contextual, PR compartido y decisiones de rendimiento](TRAINING-PERFORMANCE.md).
> La auditoría recibida se conserva debajo; las variantes deportivas siguen diferenciadas.

Fecha de inspección: 20–21 octubre 2026, America/Mexico_City. Referencia: código
recibido tras 4.4, 1,104 pruebas únicas y baseline **PROVISIONAL**. Se usan solo
datos sintéticos. Esta auditoría describe comportamiento, no prescribe entrenamiento.
Los casos ejecutables están en `scripts/test/training-{characterization,shared}.test.mjs`.
La [matriz de entradas/resultados](TRAINING-ENGINE-CASES.md) permite localizar cada
caso y distingue las anomalías históricas de las propiedades del dominio válido.
El [informe de ejecución](../server/audit/training-engine/PHASE-5.1.md) distingue
hallazgos comprobados, riesgos, cobertura y verificaciones pendientes.

## Matriz de fuentes de verdad

Leyenda: A cálculo puro; B regla sobre datos previamente consultados; C operación
transaccional; D presentación; E adaptación histórica; F duplicación; G aparente
desuso pendiente de confirmar. Las clases pueden coexistir. `c/` y `s/` abrevian
client/src y server/src. Números de línea, parámetros y hashes verificables:
`server/audit/training-engine/phase51/source-inventory.json`. Los generados no son
otra implementación fuente.

Cada fila especifica entradas/salidas, unidades, ausencia/redondeo, dependencias,
consumidores/diferencias, pruebas y riesgo/destino. Ninguna consulta o transacción
se propone para shared.

| Algoritmo / ubicación fuente | Entradas reales → salida; fórmula / unidades / ausencia y redondeo | Consumidores, dependencia y diferencias | Clase; pruebas; riesgo y destino futuro |
| --- | --- | --- | --- |
| `parseRepRange`, c/utils/smartLoading.js y s/logic.js | texto libre → {lo,hi}; primeros dos grupos `\d+`, min/max; sin dígitos 8–12; `2.5`→2–5, signo ignorado; enteros reps | PWA/Atajo; String/regex; idénticos | A/E/F; logic + parity + 5.1; medio, loading con compatibilidad explícita |
| `resolveWeightIncrement`, mismos archivos | grupo/nombre → kg 5 si Piernas/legs o regex piernas con grupo ausente; resto 2.5; no redondeo | PWA/Atajo; grupo no vacío desconocido impide inferencia | A/E/F; logic/parity/5.1; medio, loading |
| `effectiveWorkoutSet`, mismos | SetLog/form → peso/reps mínimos independientes de lados, RIR; Number||0 izquierda, derecha ausente hereda izquierda; rpe presente manda `10-rpe`; rir alternativo; no filtra completed | Smart/plateau/Workout; mínimo de peso y reps puede ser pareja que ningún lado hizo | A/E/F; parity/5.1; alto semántico, effort/performance contextual |
| `roundWorkoutWeight`, mismos; alias Workout.roundWeight | w/increment/base → kg; si abs(base%increment)<.01 rejilla incremento, si no .5; Math.round(w/grid)*grid; incremento0 cae a .5 por NaN del módulo | Smart, descarga, calentamiento; tolerancia .01 solo selección de rejilla | A/F; parity/5.1; medio, loading |
| `adjustRepRangeForPhase`, mismos | lo/hi/fase→rango reps; intensificación mitad redondeada, suelo1; acumulación hi*1.5 redondeado; otras intactas | PWA/Atajo; fase no cambia peso directamente | A/F; logic/parity/5.1; medio, loading |
| `pickWorkReference`, mismos | series efectivas/lo→peso,max/min reps,min RIR,series; sin series null; excluye reps<3 si lo>3 y hay alternativas, conserva pesos>=75% máximo, tope RIR<=1 tiene prioridad; pesos iguales abs(delta)<.01 | Smart; no e1RM pese a comentario de fallback antiguo; no altera orden/arrays | A/B/F; parity/5.1; alto, loading después de fixtures completos |
| `computeWorkoutSuggestion`, mismos | sesiones DESC/rango/incremento/fase string u objeto→{weight,reps,rationale,basedOn,phase} o null; solo sessions[0].sets | PWA deriveHistoryDerived y Atajo; no consulta ni reloj; basedOn=N no prueba análisis de N sesiones | A/B/F; logic/parity/5.1; alto, Fase5.3 |
| `suggestNextSetFromToday`, mismos | series ordenadas con rir crudo/opciones u overload histórico→siguiente kg/reps/motivo/source; faltan RIR finitos→null; reglas detalladas abajo | PWA pasa completadas previas, Atajo valores positivos de log; predicado completed no está dentro del cálculo | A/B/E/F; parity/5.1; alto, Fase5.3 |
| `deriveHistoryDerived`, `estimate1RM`, símiles Workout.jsx | historial DESC→mejor previo, sugerencia, goalSessions ASC; estimate=w*(1+r/30) sin excepción single/cap; lados débiles; arrays vacíos tratados; descarga final .9 y rejilla | useExerciseHistory, previousBest, WarmupCalculator; depende hoy CDMX implícito; fórmula distinta al historial canónico | B/D/E; 5.1 + suites UI/offline; alto, adaptador React con reloj explícito futuro |
| `cappedEpley1RM`, shared/domain/training/performance.ts; antes dos `utils/exerciseName.js:epley1RM` | unknown coercible→kg number; Number||0, <=0→0, r=1→w, r>36→36, w*(1+r/30); sin redondeo | Dos fachadas JS alimentan agrupación, goals frontend y reconciliación goals backend. **Única fórmula extraída en 5.1**, ninguna política PR cambiada | A/E, F eliminado; 5.1 diferencial/propiedades/imports/Edge; bajo extracción, política futura requiere decisión |
| `strength.js:epley1RM` | kg/reps→kg; coerción Number||0, <=0→0, single w, resto Math.round(Epley*10)/10; sin cap | Progress clasificación; no intercambiable con variante sin redondear | A/D/E; 5.1; medio, performance contextual |
| dayPdf.js y sessionPdf.js `epley` | kg/reps→kg; <=0→0, single w, resto Epley sin cap/redondeo; display posterior formatea | PDF sesión sí lo usa; dayPdf lo declara pero no lo llama (también aparece como unused en lint histórico), no borrar aún | A/D/F/G para dayPdf; 5.1 función real; medio, presentation/performance |
| ExportReport.jsx `calculate1RM` y progreso | kg/reps→kg w*(1+r/30), single incluido; elige mejor set izquierda sin esfuerzo; después usa reps+RIR para estimación de tendencia; deltas toFixed2/display1 | PDF largo; entrada NO equivale a PR; RIR null→0 al ajustar; ignora lado derecho en selección | D/B/E; 5.1 inventario + suites existentes; alto, no unificar con PR |
| s/services/personalRecords.js `recalcPRForExercise` | tx/nombre/userId→PR persistido o null; cada lado candidato, lado ausente hereda; Number||0, ignora <=0; Epley solo 1<r<37, resto w; `>` exacto; sin redondeo | Writes/edits/deletes/rutinas/restore/operaciones; consulta nombre insensitive/owner fechaASC; deleteMany/create mismo tx; no filtro completed | C/B/E; SQL1.5/3.1/3.4/3.5 y 5.1 puerto sintético; crítico, selección pura futura separada de TX |
| s/index.js stats/progress `progressData` | logs→fecha/maxWeight/e1RM/volume; PR range1<r<37, solo izquierda, e1RM redondeado1decimal, volumen izquierda sin redondear | Progress chart; contains nombre, fechaASC take50 (puede ser ventana más antigua); maxWeight vacío=-Infinity interno antes de JSON | B/D/E; suite API previa + inventario; alto, adaptar consultas fuera del core |
| `exerciseName.js:effectiveSet` (privado), ambos | set→lado débil o null; parseFloat peso/parseInt reps; falsy izquierda rechazada; incompletas no excluidas | Agrupación canónica; difiere de effectiveWorkoutSet por coerción y RIR | A/E/F; exerciseName/5.1; medio, adaptador histórico |
| canonicalExerciseKey/normalizeExerciseName/isSameExercise, ambos | nombre→clave/texto/boolean; stopwords/sinónimos/acento/paréntesis musculares; no reordena tokens; ausente '' | historial/goals/importación; PR solo lower/insensitive no comparte esta identidad | A/E/F; exerciseName.test + SQL; alto, identidad de dominio separada de fórmula |
| groupHistoryByExercise, ambos | historial→Map nombres/músculo/sesiones ASC por día; máximo capped Epley `>`; guarda sets; sin input→Map vacío | Goals/Progress histórico; `toLocaleDateString` SIN timeZone usa zona proceso/device, no helper CDMX | B/E/F; exerciseName + 5.1 tres TZ; alto, calendar antes de extraer agrupación |
| best1RMRecent / bestOneRepMaxForTarget, ambos | sesiones ASC→kg max; últimas3 por defecto; para target solo sets reps<=target+1; últimos3 días elegibles, no últimos3 absolutos; sin evidencia0; sin redondear | goals frontend/backend; targets bajos no se prueban con extrapolaciones lejanas | A/B/F; exerciseName/5.1; alto por historial, performance explícito |
| `convertShortcutRir`, s/logic.js | raw string/number/null→10-parseFloat(raw) o null; helper no limita rango, acepta '2junk'; no redondea | sanitizeShortcutLogSet; NO conversor genérico de toda columna rpe | A/E; logic/5.1; medio, effort nombrado por frontera |
| sanitizeSets / sanitizeWorkoutLogBody, s/logic.js | unknown→sets/error; 1–50; kg0–2000, reps0–1000 parseInt, rpe0–10; trabajo positivo exige rpe aunque incompleta; completada exige peso/reps>0; lados opcionales null | Legacy HTTP y validador operación inyectado; no reclasifica series efectivas | E/B; logic + HTTP/operaciones/5.1; alto, frontera backend/contrato shared |
| sanitizeShortcutLogSet, s/logic.js | body→set/rawRir/error; rir explícito0–4 manda; rpe0–4 es RIR,6–10 almacenado; hueco(4,6) inválido; ausente RIR0/RPE10 | Atajo log-set antes de TX; mismos lados; no cambiar importaciones rpe ya guardadas | E/B; logic/Atajos/5.1; alto, adaptador legacy |
| parseWorkoutOperation / operationProtocol sanitización | request unknown→sobre/canonical; v1 rpe almacenado, rir0–4 alternativo debe concordar; números finitos estrictos, no parseFloat permisivo | API idempotente/PWA; Atajo v1 NO infiere raw RIR por campo rpe; wrappers source=shortcut tampoco cambian semántica | E/B; contratos4.3/operaciones/5.1 vía matriz; crítico, contratos actuales intactos |
| backupLegacy.readBackup / backupRestore | formato histórico→grafo validado; copia SetLog.rpe suministrado, sin deducir época/convertir esfuerzo; omisión/defaults advertidos | Backup/restore aislado; no normalizar esfuerzo retroactivamente | E/C; backup suites previas; crítico, fuera de extracción |
| Workout/EditSession, PDF rirFromRpe | UI rir crudo ↔ rpe10-rir al guardar/leer; null permanece ausente; UI0–3, Atajo admite4; PDFs comprueban finite Number | Formularios, borradores, PDF; cero requiere !=null; transformación ocurre antes de sellar payload | D/E/F; UI/offline/5.1 RIR0–4; alto, effort contextual |
| Workout.sessionVolumeFromSets | sets/form→kg×rep suma lados solo si peso/reps propios finitos>0; aliases weightR/repsR; sin array/null0; no filtro completed | Resumen de sesión; no hereda reps de izquierda a derecha parcial | A/D/E; 5.1; medio, volume policy explícita |
| dayPdf.sessionVolume | session→kg×rep, Number||0, right presente usa `|| izquierda` para cada campo; cero derecho hereda; no filtro completed | PDF día; redondeo solo al mostrar | A/D/E; 5.1; medio/alto por diferencia cero, pendiente decisión |
| sessionPdf downloadSessionPdf volumen inline | sets→kg×rep; suma izquierda y fallback derecho como PDF día | PDF ejercicio; cantidades/display, sin TX | D/E/F; inventario + suites UI; medio, presentación |
| ExportReport.calculateVolume | sesiones→{volume,sets}; peso*reps izquierda; derecha presente fallback `??`, respeta0; sets++ por fila | Comparación día con hace7d; no completed, no negativos filtrados; formato al mostrar | A/D/E; 5.1; medio, volume contextual |
| s/index overview/home/progress weeklyVolume | sets por cuenta últimos7×24h desde medianocheCDMX→kg×rep; izquierda + derecha `(x||0)*(y||0)`, sin heredar; Math.round al final | Dashboard/Progress; RIGHT parcial aporta0, como Workout para ese caso, distintoPDF; no semanaISO | B/D/F; API/5.1 inventario; alto consulta, volume puro separable |
| s/index stats/routine y progress volumen | sets→suma izquierda únicamente; rutina Math.round final; progress no; sin completed | Estadísticas rutina/progreso; no equivale volumen bilateral completo | B/D/E/F; suitesAPI/inventario; medio, aclarar nombre/unidad |
| maybeEvaluateAdaptiveDeload, s/index.js | rutina/owner/now/consultas→lastAdaptiveCheckAt y posible until; cooldown7d, volumenactual<.85previo con previo>0 y>=3 plateau; ventana7d | Job diario, Prisma y reloj; volumen IZQUIERDA de todas rutinas del owner, plateau IDs rutinaactual sin take; no ejecutar standalone | B/C/E; logic para señales, inventario de orquestador, suites startup; crítico, conservar backend |
| detectPlateauForExercise, s/logic.js | logs→bool; díaCDMX mejor e1RM usando débil y PR guard1<r<37; >=4 días, últimas min6, mitades floor/ceil, maxreciente<=maxantiguo | Trigger descarga y endpoints; días vacíos/incompletas cuentan, cuatro días sin trabajo→true | A/B/E; logic/5.1; alto falsas alertas, Fase5.4 |
| c/exerciseName.detectPlateau | sesiones ASC con best1RM→objeto métricas; min4/window6 configurable, <= marca empate; no agrupa ni conoce unidad de entrada | Export público y test histórico; UI actual usa servidor. No retirar sin confirmar todos consumidores externos | A/B/G; exerciseName/5.1; alto, Fase5.4 |
| s/index stats/plateaus/home/progress consulta | últimos200 logs owner DESC→agrupa nombre lowercase, recorta10 logs/ejercicio, solo nombres con PR→lista plateau | Progress badge por nombre; NO canonicalExerciseKey ni ID como trigger; 200 global puede dejar ejercicio sin muestra | B/D/E/F; API/offline + inventario; alto, consulta/semántica fuera shared |
| getActiveBlock/currentWeekInBlock, s/logic.js | blocks→más reciente startedAt no null, empateprimero; block/now→floor(floor(elapsed/86400000)/7)+1; null si no started | Rutinas/Atajos/Workout; semana0/futura posible, durationWeeks no corta; no calendarioISO | A/B/E; logic/5.1; medio, mesocycles con now explícito |
| getRoutinePhaseStatus, s/logic.js | rutina/reloj implícito→fase/source/isDeload; bloque manda, incluso vencido según duración; si no, until>ahora | Todas recomendaciones; fechaigualahora no activa; no autoavanza bloques | B/E; logic/5.1; alto si mover reloj, mantener adaptador |
| Bloques POST/PUT/start, s/index.js | owner/IDs/body→fila persistida; duration truthy parseInt else4/anterior; phases acumulación/intensificación/deload/custom; start=new Date | Routines/RoutineDetail; order no manda bloqueactivo; no incrementa/reset progreso por editarfase | C/E; suites integridad/inventario; alto, backend |
| goalPlanner.linearRegression | {x,y}[]→slope/r2; mínimos2; denominador0→0/0; ssTotal0→r2=0; sin redondeo | predicción de objetivos; x es índice sesión, no tiempo real | A/B; 5.1; medio, separado de medición fisiológica |
| goalPlanner.computeGoalPrediction/progress/filter/getCurrentGoalTarget | goal/historiaASC→plan/progreso; histórico>=2, inicio eligible||recent; pendiente por sesión×frecuencia, mezcla r2/potencial1.25/.6/.25, mínimo .1kg/sem; manual default confidence.5; progreso redondeado | GoalCard/Workout; achievedAt persistido o cálculo; fallback recent puede usar reps lejanas aunque backend exige evidencia elegible para persistir meta | B/D/E; 5.1/Edge; alto, documentar divergencia antes de compartir |
| goalPlanner.generatePeriodizedPlan | e1RMactual/target/kgPorSemana/reps/frecuencia→semanas; ritmo máx max(1,start*.025), máx100 semanas; fases desde8 semanas, reparto por reps>5; kg rejilla5; tope target±.1; frecuencia argumento no usado aquí | Plan visual, no RoutineBlock; no consultas, reglas deportivas distintas Smart; posible totalWeeks+1 filas | A/B/D/E; 5.1; alto si cambiar criterios, mantener presentación |
| reconcile goals, s/index.js GET goals | goals+historialautorizado→achievedAt persistido; solo elegibles<=targetReps+1 últimas3, target cappedEpley excepto single | Cambia estado histórico dentro del camino ya existente; 5.1 cambia SOLO origen fórmula idéntica | B/C/E; exerciseName/5.1 + matrizAPI; alto, no trasladar escritura a shared |
| strength.classifyLift + data/strengthStandards | nombre/e1RM/kgcorporales→nivel/ratio/pct; ratio exacto compara >=umbrales, ratio display2dec y pct entero0–100; sin estándar/datos positivos→null | Progress; match primer substring; estándares no distinguen sexo/edad/equipo | D/B; inventario + fórmula5.1; alto validación deportiva, mantener presentación |
| CDMX helpers s/logic.js; c/utils/dates.js | Date/instante→civil/weekday/hora/bounds; Intl America/Mexico_City, domingo0; bounds offset del instante y +24h; lastNDays resta24h | Query bounds, Atajos, UI, offline; frontend admite string, helper backend Date; DST histórico no garantiza bounds correctos | A/E/F; dates/logic/parity + 5.1TZ/DST; crítico, calendar con política explícita |
| parseCdmxDateRangeQuery/resolveTargetDate | yyyy-mm-dd→ancla12Z y boundsCDMX; ISO fallback si válido; now implícito para sinfecha | History/Atajos; no usar UTC slice como día civil | E/B; logic/5.1 y HTTPprevio; alto histórico |
| findRoutineDayForWeekday/scheduledRestWeekdays, ambos; weekday helpers | días/weekday→día menororder oSet descansos; null omite, domingo0 válido; resolve weekday inferencia solo escritura | Dashboard/Atajos/racha; labels decorativos | A/B/E/F; routineDays.parity/logic; alto, calendar/compatibilidad |
| stats streak/consistency y Progress compliance/weeklyData | logs/rest/programación→conteos; racha máx365, descanso programado cuenta; fallbacklocal solo workout; cumplimiento /30 redondeado; gráfica52 semanas desde1enero de7d, no ISO | Dashboard/Progress; sesiones cuenta WorkoutLog por ejercicio, no visita gym; ventanas/mensual filtrocivil | B/D/E/F; API/dates/5.1bordes; medio/alto, nombres/periodos explícitos |
| pickNextSplitDay/aiRoutineService.planToday y splitTemplates | perfil/díasgenerados→reuse/rest/create; primero reusar hoy, cuota daysPerWeek en últimos7d, rotación label; ejercicios deterministas según equipo/perfil | RutinaIA existente, no Coach nuevo; cuenta RoutineDay generado como entrenado, no fuerza WorkoutLog; providers aparte | A/B/E; aiRoutineService.test/logic; alto si reinterpretar adherencia |
| BodyTracking/getBMIRange y delta temporal | registros medidos→categorías BMI por18.5/25/30, delta absoluto/porcentaje, díaselapsed; BMR/grasa/músculo son campos registrados | Presentación; no hay cálculo fisiológico nuevo de gasto/hipertrofia/fatiga | D; inventario; medio validación clínica, fuera motor extraído |
| Descanso useRestTimer/recordatorios y modelos cardio | deadline absoluto→segundos Math.ceil/max0; schema contempla durationMin/speed/incline/calories, con preservación backup | Timer/push activo; no se localizaron consumidores UI/endpoints de cardio en src actual, aunque schema diga que cuenta en racha; no inferir implementación desde comentario | D/B/C y G para funcionalidad cardio; suitesprevias/inventario; bajo para fórmula de fuerza, confirmar alcance cardio después |

No se encontró un clasificador común de «series efectivas», un volumen por
mesociclo o un reparto de series por músculos primarios/secundarios. Los targetSets
y targetReps son planificación; SetLog es registro. Progress agrupa EJERCICIOS
por músculo para presentar la biblioteca/PR; eso no equivale a series semanales
por músculo. Frecuencia puede significar cuota de días IA, configuración de Goal,
conteo WorkoutLog o días civiles distintos: no son la misma métrica.

## Smart Loading: mapa verificable para Fase 5.3

Los dos módulos de cálculo se conservan literalmente. El Atajo consulta rutina
activa por propietario, díaCDMX (o date explícito), ejercicios ordenados, logs del
día y hasta10 sesiones históricas del ejercicio; resuelve fase por bloque/descarga.
PWA recibe historial por ejercicio (o batch del día), excluye hoy para anclar la
primera sugerencia; si solo hay hoy, admite fallback. No hay modelo entrenado,
calibración individual ni tendencia multisesión dentro de computeWorkoutSuggestion.

Entre sesiones: referencia de trabajo de última sesión suministrada, no máximo
global. Se ignoran singles/doubles si hay >=3reps y lo>3; se eliminan drops por
debajo del75% del máximo. A peso máximo, RIR<=1 puede anclar incluso si no llega
al suelo del rango. Si top set llega a hi con RIR<=1, o TODOS los sets de ese peso
llegan a hi, sube un incremento y reinicia lo. Si solo la mejor llega, mismo peso
y minReps+1 hasta hi. Resto +2reps con RIR>=3 o +1, techo hi; no baja peso.
Emparejar minReps puede recomendar menos que la mejor serie anterior.

Intra: orden primera→última importa; Number||0, solo trabajo positivo; RIR ausente
en cualquier serie válida impide sugerencia. Primera única con RIR<=0: 87.5% de
peso, rejilla, floor por incremento/.5 y fallback decremental, reps hasta hi o
first+1 si ya está en hi. Después: último RIR<=0 o reps<lo baja un incremento;
RIR1/dropRIR>=2/dropReps>=2 con últimoRIR<=2 mantiene peso/reps; mediaRIR>=2.5 y
mínimo>=2 permite+1 o+2reps; resto neutro. No presupone incremento de carga por
una mejora aislada. `completed` lo filtra el consumidor cuando lo hace: no la pura.

Fase intensificación/acumulación cambia rango; descarga no modifica estas
funciones. El adaptador final inter aplica90% y rejilla; intra ya usa pesos de hoy
y NO recibe otra reducción. Las cadenas rationale se conservan, inclusive el
texto «en alguna serie» cuando la rama de fallo mira la última. Incrementos no
modelan máquinas particulares; regex/grupo decide5/2.5. Rejilla.5 para pesos raros.

Casos: 80×10 RIR2→80×11; 80×12 RIR1 +80×8→82.5×8; mismos sets RIR3→80×9;
110×1/100×4/100×3 con rango8–12→referencia100; primera80×8 RIR0→70×10;
80×10 RIR3 luego80×8 RIR1→80×8. Nuevos ejercicios/sin series→null, consumidor
indica sin historial. No se cambia sugerencia ni se añade personalización.

## Divergencias y riesgo matemático

1. **Epley:** 80×10→106.66666666666666 en historial/PR,106.7 en strength;
   80×1→80 salvo estimate/ExportReport sin excepción→82.66666666666667;
   80×37→176 capped,80 PR/plateau,178.7 strength,178.66666666666669 PDF.
   Algunas diferencias responden a propósitos distintos; no hay evidencia para
   imponer una variante a todas. Alcance afectado: badges, gráficos, goals y PDFs.
2. **Empates:** 80×10 y100×2 son matemáticamente iguales, pero JS produce
   106.66666666666666 y106.66666666666667. PR elige100×2 con `>` exacto. Empates
   binarios exactos mantienen primero; fechaASC no garantiza orden entre logs
   con misma fecha ni entre sets sin orderBy. No añadir tolerancia/desempate nuevo.
3. **Unilateral:** PR elige mejor lado; Smart/historial usa mínimos de peso/reps
   por separado; volumen suma lados según distinta política de ausencia/cero.
   Comparar PR y referencia Smart como si fueran misma observación es incorrecto.
4. **Volumen:** izquierda80×10/derecha0×0→800 Workout/report/backend,1600 PDF
   día por `||`; derecha solo60kg→800 Workout/backend,1400 PDF/report por fallback.
   Cero derecho es válido; el fallback PDF es una discrepancia confirmada que
   merece corrección separada con autorización y fixtures del PDF completo.
5. **Fechas:** helpers explícitos CDMX son estables entre UTC/CDMX/Tokio; ambas
   agrupaciones exerciseName usan TZ local. `2026-10-19T05:30Z` agrupa19oct en
   proceso UTC/Tokio y18oct en CDMX. Puede alterar días/evidencia de metas. No se
   cambian silenciosamente fechas históricas ni se migra grouping ahora.
6. **DST histórico:** Intl da-5h en verano2021 y-6h en invierno. Bounds usa offset
   del instante, no de medianoche, y suma24h. El4abril2021 a12Z devuelve inicio05Z,
   que CDMX aún considera3abril; inicio real ese día es06Z. Confirmado por helpers
   reales. Requiere tarea calendar dedicada con días23/25h; fechas2026 no prueban
   corrección general de DST. Ninguna sustitución por offset fijo.
7. **Plateau:** backend usa PR guardado por rango; frontend helper usa best1RM
   usualmente capped. Dos100×1 seguidos de dos80×37→plateau backend true y
   frontend false. Incompletas y cuatro días vacíos pueden activar señal. Endpoint
   solo evalúa nombres con PR,10logs por nombre dentro de200 globales; trigger
   usa todos los logs por ID y puede mezclar distintos nombres/rutinas de otro modo.
   Una alerta no mide fatiga; cambios de rutina/ID y ventana global sesgan muestra.
8. **Goals:** x de regresión es número de sesión; multiplicar frecuencia configurada
   supone regularidad, no mide pendiente por días. `confidence=r2` no es certeza
   fisiológica. Front usa fallback best1RMRecent si falta evidencia elegible;
   backend no persiste achievedAt así. El argumento frequency de generatePlan
   no interviene (sí en su llamador); aparente redundancia, no borrar API aún.
9. **Mesociclos:** durationWeeks informativa, bloque más reciente puede ser futuro,
   semanas0/negativas posibles; no autoavanza al terminar duración. No equivale
   plan visual de Goals, que usa otra periodización y otra rejilla de carga.

Las anomalías observadas tienen tests de caracterización para detectar cambios,
no se declaran contratos deportivos deseables. Los hallazgos pendientes requieren
decisiones explícitas y una tarea que evalúe impacto histórico antes de corregir.

## Política de precisión

Todas las variantes usan number IEEE-754, kg y reps; endpoints restringen cargas
y reps, mientras utilidades legacy aceptan coerciones más amplias. Se conserva
orden `w*(1+r/30)`, sin reordenar algebraicamente. **Igualdad exacta** se exige
en extracción/diferenciales; ninguna tolerancia numérica oculta regresiones.
El aproximadamente106.6667 del enunciado es formato de lectura, no cambio de valor.

CappedEpley: salida decimal sin redondear,0 para Number(x)||0 no positivo, cap36,
single exacto; acepta reps fraccionarias por compatibilidad JS aunque API persista
enteros; Infinity de peso sigue Infinity, repsInfinity se acota36, Symbol arroja
TypeError. No se fuerza validación nueva a consumidores JS. Para datos numéricos
válidos de API (0–2000kg/0–1000reps), resultados finitos/deterministas; propiedades
de monotonía solo se prueban para reps enteras>=1. Entre0 y1 la excepción single
impide prometer monotonía universal. Coerción de objetos puede ejecutar valueOf;
el dominio matemático puro usa primitivos normalizados, no objetos con efectos.

PR/plateau: sin redondeo ni epsilon, `>`/`<=` exactos; selección sensible al orden
solo en empates. Strength redondea una décima antes de clasificación llamadora;
PDF/Workout muestran formatos después. Smart: rejillas incremento/.5, comparación
peso<.01 ya histórica, reps Math.round por fase y Math.min/max por ramas. Volumen:
suma number ordenada, no redondear cada set; Math.round final solo en endpoints
que ya lo hacen. No prometer invariancia binaria de suma ante permutación arbitraria.
Metas: flotantes internos, round5kg por semana, e1RM display1decimal, rate2dec,
progresoentero, umbral.1 ya existente; pendiente puede ser negativa, luego piso.1.
Calendario: instantesDate en ms; días stringCDMX; semana bloque7×86400000ms;
resto periodos depende consumidor. No intercambiar duraciones y días civiles.

Otros adaptadores auditados: NewGoal guarda currentOneRepMax con una décima
cuando lo deriva del historial y permite currentEightRepMax manual; este último
se captura/persiste pero no se usa en el cálculo actual de goalPlanner. Split
templates rota FullBody para<4días, Upper/Lower para4 y PPL para>=5; el fallback
elige primeros ejercicios disponibles del catálogo por grupo/equipo/exclusiones,
sin score de rendimiento. Sus prescripciones actuales son fuerza4×4–6/150s,
hipertrofia3×8–12/90s y general3×10–15/60s; reemplazos conservan conteo por músculo.
No se cambian ni se presentan como nuevas recomendaciones.

«Mensual» en ExportReport significa30días civiles inclusivos (hoy+29anteriores),
no un mes calendario. El weeklyVolume del backend usa `gte` medianocheCDMX de
hace7×24h, sin límite superior explícito: puede abarcar ocho fechas civiles con
el día actual parcial y admitir filas futuras. BodyTracking.calculateChange
busca el registro previo más cercano al corte de30días, reporta diferencia con
toFixed1 y días civiles transcurridos; no estima composición corporal desde fuerza.

## Arquitectura incremental

Solo se crea `packages/shared/src/domain/training/performance.ts`, porque contiene
una implementación justificada. Export público cappedEpley1RM con unknown→number
describe la frontera de coerción histórica, no promete DTO de SQL. DTO HTTP de4.3
siguen siendo otra responsabilidad. Se podrían agregar futuros modelos numéricos
normalizados, con unidades documentadas, sin reinterpretar entrada legacy.

Ruta runtime: import package real→tsc ESM/declaraciones→builder Vite existente→
client generated/training.js ESM y server generated/training.cjs autocontenidos→
las entradas utils/exerciseName.js existentes. Backend permanece ESM. Las dos
funciones originales se eliminan de producción; snapshots exactos quedan solo
para tests. No hay import de Prisma/React/Express/reloj/HTTP/DOM dentro del dominio.
Tree shaking no incorpora contratos ni backend al artefacto de cálculo. Mapas
generados enlazan al ESM emitido y su mapa tsc enlaza a TS original, ambos comprobados.

Futuro: performance/effort/volume con políticas nombradas e inputs explícitos;
loading/plateaus con historias ya consultadas y orden documentado; mesocycles/
calendar con now/zone explícitos. Adaptadores consultan/autorizan, ordenan y validan;
PR/receipts/hash/versiones/escrituras quedan en sus transacciones originales.
No se crea aún ese árbol de directorios, interfaces especulativas ni motores vacíos.

## Referencias de caracterización y pruebas

29 casos de caracterización del código recibido: 1RM/PR/lados/ties/IEEE-754,
RIR0–4/Atajos/ausencias, límites50/2000/1000, Smart inter/intra/rango/rejilla/
fases/orden, volumen, plateau, TZ/DST, mesociclos y goals. Se ejecutan antes
y después de extraer. Ocho casos adicionales prueban cuerpo idéntico tras borrar
solo tipos, matriz28×28 de entradas adversas,2,000 casos deterministas de propiedades,
pipelines reales de historial/metas, imports ESM/CJS con stripping deshabilitado,
mapas/declaraciones, cuatro erroresTS controlados y React en Edge real.
Bucles/diagnósticos no suman casos individuales. Matriz de paridad Smart usa
4fases×4pesos×6reps×5RIR=480 combinaciones sin mutar entradas.

Los anteriores 1,104 casos incluyen las transacciones PostgreSQL reales sobre
clusters nuevos: editar/borrar mejor serie, PR/rebuild/rollback/aislamiento,
idempotencia/respuesta perdida, conflictos, Dexie, imports de rutinas y APIs
legacy/Atajos. No se sustituyen por mocks: las nuevas pruebas de puerto PR aíslan
selección/consulta y complementan esas integraciones. Los snapshots recibidos
permiten diferenciales independientes; no son otra fuente productiva.

## Preparación de 5.2–5.5 y Coach (sin implementarlos)

5.2: acordar políticas explícitas de e1RM/esfuerzo/unilateral y modelos de entrada
normalizada; siguiente extracción pequeña sugerida es conversión esfuerzo por
frontera, manteniendo el adaptador Atajo, siempre con golden HTTP y ningún cambio
de datos. Antes de unificar otras fórmulas, decidir si se busca misma semántica
o variantes intencionales. Separar tarea de corrección PDF cero y calendar DST/TZ.
5.3: reconstruir Smart con estos casos como referencia; inputs historial/fase/
incremento/orden, sin variar recomendaciones en la migración estructural.
5.4: revisar señal plateau/muestra/ausencia/IDs/empates contra casos reproducibles,
sin confundir datos insuficientes con prueba de estancamiento. 5.5: integrar esas
decisiones y verificar consumidores/persistencia según su prompt futuro; aquí
no se asigna alcance ni se ejecuta una fase no solicitada.

| Categoría Coach | Disponible / pendiente y límites |
| --- | --- |
| A datos almacenados | WorkoutLog.date/notes/Exercise y SetLog peso/reps/lados/rpe/completed/setNumber; rutinas/targets/descansos planificados; bloques/fase/start/duración; PR; Goals/frecuencia/experiencia/completedWeeks; RestLog; medidas corporales/hábitos; TrainingProfile; SuggestionLog peso/reps/fase/source. Operaciones guardan performedAt/createdAt, no duración de cada set. |
| B derivable existente | e1RM con política identificada; volumen kg×rep por variante; series registradas/completadas; días civiles/frecuencia observada; trayectoria/pendiente sesión; respuesta a sugerencias aproximada por día; diferencias bilaterales; ventana plateau; estado de bloque. No todas están hoy expuestas como endpoint agregado. |
| C no recopilado de forma estructurada | sueño/calidad, dolor/lesión, estrés/fatiga subjetiva, readiness, nutrición detallada/proteína/energía, duración/velocidad/ROM del set, tiempos reales de descanso por set, sensores, medidas de recuperación, asignación de fracciones de series por músculo, adherencia exacta a una sugerencia con ID set. Notas libres no equivalen a esos campos. |
| D estimaciones no mediciones | e1RM, r2/confidence de metas, estándar relativo poblacional, plateau, descarga por volumen y proyección de hipertrofia/fatiga futura. Peso corporal/grasa/músculo son registros del usuario/dispositivo sin validación clínica. El registro de kg×rep no mide por sí solo estímulo, recuperación o crecimiento muscular. |

CardioSession/CardioSegment/calories existen en schema y backups, pero no prueban
un flujo actual de captura ni una fórmula de gasto energético en este código.

No se añaden recomendaciones, registros, endpoints, escrituras o UI de Coach.
Baseline PROVISIONAL y sync nueva deshabilitada en producción siguen vigentes.
