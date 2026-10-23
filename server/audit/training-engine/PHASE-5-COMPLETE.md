# NexLift v4.0 — cierre de Fase 5

**5.4 COMPLETADO · 5.5 COMPLETADO. Certificación: APROBADA en desarrollo Windows/x64.**

**`npm test`: salida 0**, corrida integral nueva sobre una copia aislada del código
final, en almacenamiento estable fuera de Temp. **1,236 pruebas únicas = 1,202 recibidas +34 nuevas**. **64 comandos** finales
con salida0; **551 repeticiones** de workspace/standalone/smoke contabilizadas aparte.
Duración del comando exterior: **1130.154 s**. No se suman checkpoints
para presentar una corrida integral ni se cuentan bucles/goldens como pruebas únicas.

Producción no accedida ni modificada. Sin credenciales operativas, datos reales,
bases persistentes, migraciones persistentes, cambios de schema/SQL, flags
productivas, staging Git, commits o despliegues. Baseline **PROVISIONAL**;
sincronización nueva deshabilitada en producción. **Fase6, Coach y Smart Loading2.0
no iniciados**. Las decisiones deportivas no definidas permanecen aisladas,
sin impedir el cierre del alcance seguro de5.4/5.5.

## Estado recibido y recuperación

Se verificaron status/diffs y trabajo sin commit en
`C:/Users/guerr/OneDrive/Escritorio/NexLift` (distinto del cwd inicial de la app),
CLAUDE.md, arquitectura/API/modelo y selectivamente PHASE-5.1/5.2/5.3,
TRAINING-ENGINE-AUDIT/PERFORMANCE/SMART-LOADING, consumidores y runners reales.
No había AGENTS.md aplicable. El código prevaleció sobre referencias v3.

Recuperación previa única, fuera de Temp, con593 archivos públicos, hashes,
status y diffs; env excluidos:
`C:/Users/guerr/.codex/artifacts/nexlift-phase5-complete-received-b113f146-be95-4ca2-b143-48ce4ec138cb`.

**27 archivos recibidos modificados, 25 nuevos de código/fixtures/documentación,
0 recibidos eliminados; 566/593 conservan bytes.** Informes/evidencia nuevos se
cuentan aparte. **218 archivos protegidos** idénticos, incluidos tres locks,
Prisma/SQL, kernel Smart/esfuerzo/PR, operaciones/hash/versiones/transacciones,
offline/IndexedDB/SW, Workout/EditSession/importación y todos los PHASE previos.
Git diff --check0 y nada staged. [Conservación y archivos](phase5complete/final-checks.json).

501 hashes verifican el código certificado; 412 archivos de
código/config copiados son idénticos. La única excepción del ensayo es el lock
del servidor reindentado por npm prune: JSON completo/grafo idéntico; locks del
repositorio intactos. Archivo durable final:
`C:/Users/guerr/.codex/artifacts/nexlift-phase5-complete-final-5c9aa50c-c64e-4662-9278-b43dba399e72`.

## 5.4 — algoritmos y consumidores integrados

Cinco módulos nuevos de TypeScript strict bajo `packages/shared/src/domain/training/`,
**22 funciones exportadas y4 auxiliares internas**, con entradas/salidas readonly,
unidades y políticas explícitas. Sin HTTP, Prisma, React, reloj implícito,
mutación, consultas nuevas ni dependencia circular. Se reutilizan Epley5.1,
esfuerzo/PR5.2 y Smart5.3; no se migra masivamente JSX/rutas/tablas.

| Módulo | Extracción y consumidor efectivo |
| --- | --- |
| exerciseIdentity.ts | normalizeExerciseName/canonicalExerciseKey/isSameExercise; las dos fachadas exerciseName usan la misma fuente. Identidad PR distinta preservada. |
| progress.ts | groupTrainingHistory, best1RMRecent, bestOneRepMaxForTarget, detectPlateau, detectPlateauForExercise y linearRegression; historial/metas cliente/servidor, goalPlanner, estadísticas y trigger adaptativo reales. |
| volume.ts | trainingLoadVolume y trainingSessionLoadSummary, fold común sin cambiar orden IEEE-754; cinco reducers backend, ExportReport y PDFs día/sesión. |
| mesocycles.ts | getActiveTrainingBlock/elapsedWeekInBlock/routinePhaseStatusAt; wrappers logic alimentan rutinas, fases y Atajos. Reloj inyectado, prioridad y duración conservadas. |
| calendar.ts | Fecha/offset/día CDMX comunes, desplazamiento y enumeración civiles, bounds legacy explícitos y solución23/25h, semana lunes–domingo. Adaptadores dates/logic y comparación ExportReport. |

[Políticas, unidades y mapa detallado](../../../docs/TRAINING-ANALYSIS.md).
Las ocho API servidor migradas son wrappers compatibles; las demás funciones de
logic conservan sus cuerpos. Los reducers de index pueden revertirse exactamente
a la fuente recibida; no se cambian autorización, consultas o escrituras.

## Correcciones y divergencias controladas

**Activas, solo cálculos de lectura/presentación:**

- PDF día/sesión: izquierda80×10/derecha0×0 pasa1600→800kg×rep. Ausencia nullish
  sigue heredando por campo; derecha parcial60kg sigue1400 en PDF/reporte,
 800 en estadísticas recorded-sides. No se reescriben estadísticas persistidas.
- ÚltimosN días CDMX recorre fechas civiles: alrededor de2021-04-05 ya no omite
  el4abril al restar24h. ExportReport compara fecha civil menos7d. Timestamps,
  performedAt, identificadores, payloads y borradores intactos.
- Desaparecen copias activas accidentales de identidad/historial/métricas
  seleccionadas, regresión y agregadores de volumen; los snapshots son solo tests.

**Conservadas por compatibilidad o propósito deportivo:**

- Plateau: mínimo4 días, últimas6, división floor/ceil, reciente<=antiguo.
  Backend regla PR1<reps<37 y lado débil; frontend best1RM normalmente cap36.
  RIR no pondera; incompletas y días vacíos cuentan. Cuatro días vacíos pueden
  señalar plateau: defecto de calidad de evidencia documentado, sin activar
  filtrado que cambie descargas históricas. Comparación por nombre/ID y ventanas
 200global/10por nombre frente a todos porID siguen diferenciadas.
- Descarga:7d cooldown/ventana, actual<.85previo con previo>0 y>=3plateaus.
  Volumen izquierdo y alcance por propietario/rutina preservados. No se cambian
  umbrales; inter reduce90% fuera del core, intra no recibe otra reducción.
- Bloques: el más recientemente iniciado manda aun vencido/futuro; empate primero,
  semana7×24h, sin clamp. durationWeeks informativa. El código no define transición
  automática, sucesor o reinicio tras ausencia: **esa decisión de producto queda
  pendiente**. GoalPlanner visual mantiene otra periodización y rejilla5kg.
- Historial/metas: día dispositivo/proceso es ahora una política explícita;
  CDMX es seleccionable. Cambiar el default afectaría evidencia/achievedAt.
  **No se activa esa reinterpretación histórica** sin política aprobada.
- Bounds DST: solución compartida probada4abril2021 [06Z,05Z siguiente),23h y
 31octubre2021 [05Z,06Z siguiente),25h. **No se cambia globalmente el wrapper de
  escritura legacy offset-del-instante+24h**, que conserva su defecto conocido.
  Su activación sobre selección histórica/operaciones/descarga queda pendiente.
- Volumen de carga, filas registradas/completadas, frecuencia, grupos musculares
  y esfuerzo son conceptos separados. Workout conserva parseFloat/aliases/lados
  positivos; ventanas rolling7d y cubetas desde1enero no se renombran ISO. No hay
  coeficientes musculares nuevos ni equivalencia kg×rep=hipertrofia.
- PR más fuerte frente a Smart más débil, RIR/RPE contextual, selección exacta de
  empates, política de e1RM por consumidor y abstención bilateral de Workout por
  campos derechos vacíos siguen como5.1–5.3. No hay conversión masiva del historial.

## 5.5 — pruebas, integración y certificación final

**34 casos nuevos planos:30 análisis/tooling/Edge +4 HTTP/PostgreSQL.** Cubren26
goldens capturados antes de editar, límites/ausencias/cero/lados/orden, variantes
porID/nombre, ventanas y muestras, fases, fechas/UTC y cuatro zonas horarias,
comparación sembrada160historias, estructuras congeladas,8 erroresTS controlados,
ciclos/fronteras y rendimiento. Goldens y bucles no aumentan el total.

Dos suites históricas se adaptan a extracciones intencionales, conservando todos
sus casos: defecto PDF contra snapshot original y resultado corregido nuevo;
regresión/volumen delegados con bindings reales; guard de index reversible y
wrappers migrados cubiertos por diferenciales. No se ignora compilador/ESLint,
no se cambian timeouts para ocultar fallos y no se omiten casos.

| Verificación final | Resultado real |
| --- | --- |
| npm test integral | salida0;1,236 únicas;64 comandos0;551 repetidas aparte |
| PostgreSQL desechable | cuatro casos nuevos: overview/lados/propietario; plateau nombrevsID/PR; editar/borrar/PR; orquestador deload real/cooldown/prioridad. Suites heredadas de PR transaccional, imports, Atajos, idempotencia/comprobantes/conflictos vuelven a pasar. |
| Edge/React/IndexedDB | suite heredada real; Workout5.3 y nuevo Progreso real. Botón Descargar→getWorkoutHistory por día→jsPDF/autoTable; ambos PDF contienen800, no1600. Perfiles propios y datos sintéticos. |
| Offline |31/31, más SW y estáticas heredadas; sin cambios al motor offline |
| Instalaciones/builds | npmci limpio nested; shared/cliente/servidor; cliente y servidor standalone; prune/smoke sin inflar únicas |
| Typecheck y runtime | strict todos; declaraciones/mapas, ESM/CJS sin native TS stripping; check:generated y check:bundle0 |
| Artefactos |11 reproducibles;4 cambian bytes, solo2 código ejecutable;2 restantes solo mapas. Builder intacto. |
| Lint TS/tooling |33 archivosTS y57 tooling,0errores/0advertencias |
| Lint global |27errores/3advertencias, mismas firmas,100→101archivos. **No está verde**; sin regresiones. |
| Compilación frontend de producción aislada | salida0, React production real,2669 módulos,CSS107239bytes/hash idéntico. Sin arrancar servidor ni desplegar. |

[Matriz completa y hashes](phase5complete/phase5complete-evidence.json) ·
[Logs por comando](phase5complete/matrix-progress.json) ·
[Edge/PDF](phase5complete/edge-pdf-evidence.json) ·
[Lint](phase5complete/lint-comparison.json) ·
[Build de producción aislado](phase5complete/production-build.json).

Intentos anteriores: **5 comandos/intentos de desarrollo fallaron** y
se conservan como tales. Incluyen dos diagnósticosTS, guard AST para const/local
window y namespace CJS sintético; corregidos y revalidados. También se registran
captura inicial con strings en lugar deDate, matchingCRLF del helper y readiness
de fixture en render (movido a efecto). El primer intento integral alcanzó1,236 únicas/56 comandos terminados0, pero no
pudo cerrar standalone: ENOSPC al guardar salida y la copia Temp dejó de estar
disponible. Se conserva como **intento incompleto, sin salida npmtest certificada**.
Se cambió únicamente el almacenamiento del verificador, fuera de Temp, y se
repitió la matriz completa. Los resultados finales anteriores corresponden solo
al segundo intento completo, no a la suma de checkpoints. No se eliminaron fuentes,
respaldos ni archivos recibidos para resolverlo.
[Diagnósticos y logs](phase5complete/development-checks.json).

## Rendimiento y escalabilidad

Datos sintéticos discontinuos, lados y sets incompletos;3 iteraciones por muestra,
3 muestras. Medianas de plateau original frente a compartido (ms):

| Sesiones / series | Original,3 llamadas | Shared,3 llamadas | Lectura combinada nueva,1 llamada |
| --- | ---: | ---: | ---: |
| 0/0 | 0.0011 | 0.0025 | 0.0626 |
| 10/100 | 2.6830 | 0.1206 | 0.4104 |
| 100/1000 | 18.4301 | 1.0815 | 1.0160 |
| 500/5000 | 106.5666 | 3.6251 | 4.4259 |

200 bloques y100 reconstrucciones: 4.1366ms. Reutilizar Intl con TZ fija elimina construcción repetida
del formateador, **sin cachear datos o recomendaciones**. Igualdad exacta contra
original, sin mutar entradas. Volumen/regresión O(series), bloque O(bloques);
agrupación/plateau incluyen ordenar días O(dlogd). Las consultas existentes y N+1
del trigger se conservan. No se atribuyen estos tiempos a red/VPS, render o
validación fisiológica; no se añade memoización persistente.

## Riesgos, Fase6 y preparación Coach

Pendientes explícitos: decisiones de bloques/evidencia/cambio de calendario ya
descritas; sesgo por ventanas globales y ausencia/cambio de rutina; orden SQL no
total entre empates; limitaciones de e1RM y diferencias de presentación heredadas.
Docker/Linux/VPS/EasyPanel, Safari/iPhone físico y baseline de producción **no
certificados**. Estos límites no se presentan como validación productiva.

Para Fase6 queda inventariado el significado actual de fechas, lados, completed,
identidad porID/nombre, RoutineBlock y PR/operaciones. No se modifica ningún
modelo/SQL ni se inicia rediseño. Antes de cualquier activación persistente se
necesitan revisión de baseline, ensayo/restauración y política de compatibilidad.

| Reutilización Fase11 | Disponible/derivable | Falta e incertidumbre |
| --- | --- | --- |
| Volumen semanal por músculo | SetLog, ejercicio/muscleGroup, fecha civil, carga y conteo de filas; puede agregarse por etiqueta registrada | Mapeo muscular primario/secundario completo y coeficientes aprobados; frecuencia≠series≠carga |
| Recuperación/fatiga individual | esfuerzo contextual, evolución/ausencias, RestLog y medidas declaradas | Sueño, estrés, dolor, readiness, nutrición, velocidad/ROM y descanso real por set; ninguna estimación es diagnóstico |
| Smart Loading2.0 | núcleo5.3, contexto de fases/plateau/volumen y SuggestionLog | Vinculación exacta sugerencia→serie, política/calibración individual y evidencia longitudinal |
| Plateau avanzado | identidad, ventanas y regresión puras, lados/muestras/fechas explícitos | Definir cero-trabajo/completed, ventanas por rutina/meso, respuesta a ausencias y validación de umbrales |
| Tendencias de hipertrofia | carga/series/frecuencia derivables y registros corporales existentes | kg×rep/e1RM/R² no miden hipertrofia ni recuperación; mediciones longitudinales y confusores no están resueltos |
| Asistente IA/visuales | funciones puras, contratos y procedencia/políticas documentadas | Experiencia de producto, permisos, validación de explicaciones y datos faltantes; no hay Coach implementado |

Se completan5.4 y5.5 dentro del alcance seguro y se entrega un solo informe.
**Producción intacta; baseline PROVISIONAL; sincronización nueva deshabilitada.
Sin commits, despliegues ni inicio de Fase6.**
