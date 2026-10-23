# NexLift v4.0 — Fase 5.1

Estado: **COMPLETADO en desarrollo, verificado por checkpoints**.
**1,141 pruebas únicas aprobadas: 1,104 anteriores + 37 nuevas**. La utilidad
de continuación terminó con **salida 0**. Los tres intentos integrales de
npm test terminaron con salida 1 y se conservan como tales; ninguno se declara
enteramente verde. No se avanza a Fase 5.2.

Baseline Prisma/SQL **PROVISIONAL**. Sin acceso a producción, cuentas reales,
bases persistentes, cambios de schema/SQL, commits ni despliegues. La nueva
sincronización continúa deshabilitada en producción. El DDL de ensayo se limita
a clústeres nuevos cuya identidad comprueban los runners anteriores.

## Contexto y conservación del trabajo

Se inspeccionaron git status/diff, archivos rastreados y sin rastrear, arquitectura,
API/modelo, informes 4.2/4.3/4.4/3.5, TYPESCRIPT, inventario, fuentes, consumidores,
nueve generados, builder y suites. El repositorio real está en
`C:/Users/guerr/OneDrive/Escritorio/NexLift`; el cwd inicial de la app era otra
carpeta. Backend recibido y conservado: Express ESM. No hay AGENTS.md aplicable.
Se contrastó CLAUDE.md con el estado actual; no se leyó el .env operativo.

Antes de modificar el motor se respaldaron **489 archivos públicos**, con SHA256,
status y diff, fuera de Temp:
`C:/Users/guerr/.codex/artifacts/nexlift-phase51-received-99878bb2-cc0f-476c-a6c7-edbce530624a`.
Los archivos env, incluidos los ejemplos, se excluyen de ese respaldo; no se
modificaron en esta fase. No se ejecutó reset, clean ni checkout destructivo.

Conservación final: **478/489 archivos idénticos**,
**11 modificados**, **15 nuevos** y **cero recibidos eliminados**.
Informes/evidencias se cuentan aparte. Los 109 inputs protegidos conservan sus
bytes, incluidos **44 archivos de pruebas anteriores**, cuatro entradas Prisma,
tres locks, lógica Smart/CDMX/PR, transacciones, hashes, offline, contratos, SW,
Dockerfiles/contextos y configuraciones base.

Los dos snapshots exerciseName.js coinciden con lo recibido. La reconstrucción
inversa de las fachadas prueba que el resto de esas fuentes permanece idéntico.
De los nueve generados anteriores, siete conservan todos sus bytes y dos solo
actualizan mapas por el nuevo export de shared; los nueve cuerpos ejecutables
son idénticos. [Hashes y lista exacta](phase51/preservation-evidence.json).

## Auditoría del motor

La [matriz de fuentes de verdad](../../../docs/TRAINING-ENGINE-AUDIT.md) especifica
entradas/salidas, fórmulas, unidades, ausencia, redondeos, dependencias, consumidores,
diferencias, pruebas, riesgo y destino. Clasifica cálculo puro, dominio con datos
consultados, transacción, presentación, compatibilidad, duplicación y aparente
desuso pendiente de confirmar.

El [índice verificable](phase51/source-inventory.json) reúne **39 archivos y 307
funciones/closures**, con líneas, parámetros, expresiones y hashes. No significa
que existan 307 algoritmos deportivos diferentes ni demuestra alcance completo
de consumidores externos mediante búsqueda estática.

Se auditaron Smart inter/intra, referencias e incrementos, e1RM/PR/lados/empates,
esfuerzo y fronteras legacy, volumen registrado y planificado, plateau y descarga,
mesociclos, calendario, metas/regresión/planes, fuerza relativa, plantillas IA
existentes, medidas corporales registradas y alcance actual de los modelos cardio.

Divergencias principales, conservadas para decisiones posteriores:

- 80×10 produce 106.66666666666666 kg en historial/PR y 106.7 en strength.
  A 37 reps el historial acota a 36 y devuelve 176 kg; PR/plateau devuelve 80 kg;
  PDF sesión sigue extrapolando. Workout estimate también extrapola un single.
- 80×10 y 100×2 difieren un paso IEEE-754. PR usa `>` exacto, sin epsilon.
  Empates binarios conservan primero; fecha ASC no garantiza orden entre sets
  o logs con exactamente la misma fecha.
- PR considera el mejor lado; Smart/historial combina mínimos. Derecha 0×0
  suma cero en Workout/report/backend, pero PDF la sustituye por la izquierda
  mediante `||`. Una derecha parcial también produce diferencias de volumen.
- Grouping de exerciseName depende del TZ del proceso/device. Helpers CDMX
  explícitos coinciden entre UTC/CDMX/Tokio, pero bounds históricos fallan en
  una transición DST de 2021 por usar offset del instante y duración fija 24h.
- Plateau puede contar incompletas o cuatro días sin trabajo. Las variantes
  divergen a reps altas y consultan muestras distintas: nombre/200 logs/10 por
  ejercicio frente a ID y toda su historia para descarga.
- Los bloques no avanzan automáticamente al terminar durationWeeks. El plan de
  Goals es otra periodización; r2 no mide certeza fisiológica. El fallback de
  evidencia frontend no equivale al criterio backend que persiste achievedAt.

También se documentan ventanas rolling frente a calendario, currentEightRepMax
capturado sin uso en goalPlanner y dayPdf.epley sin consumidores actuales.
No se elimina código por aparente desuso ni se declara una variante correcta
por compartir el nombre de otra.

## Esfuerzo, precisión y calendario

SetLog.rpe conserva 10-RIR. Workout/EditSession convierten al guardar/leer.
Atajo legacy prioriza rir 0–4; rpe 0–4 significa RIR, 6–10 significa esfuerzo
almacenado, ausencia significa RIR0/RPE10 y rpe5 se rechaza. El helper parseFloat
no es conversor universal. API idempotente exige la semántica almacenada y
concordancia si también llega rir; source=shortcut no cambia esa frontera.
Los backups no adivinan época ni convierten rpe retrospectivamente.

La política de cada fórmula está detallada en la auditoría. CappedEpley conserva
Number||0, single, cap36, orden `w*(1+r/30)` y ausencia de redondeo. Fracciones,
coerciones, Infinity y errores Number permanecen históricos. La extracción exige
igualdad exacta; no introduce tolerancias. Propiedades solo donde corresponden,
sin prometer asociatividad flotante del volumen ni precisión fisiológica.

Se caracterizan medianoche CDMX, domingo, cambio de semana/mes/año, bloques que
cruzan meses, instantes offline originales y DST. El nuevo núcleo no usa reloj
ni zona horaria. Los helpers y fechas anteriores permanecen intactos; corregir
grouping o bounds necesita una tarea específica con evaluación histórica.

## Primera extracción real

**cappedEpley1RM** vive en
`packages/shared/src/domain/training/performance.ts`. Su entrada unknown→number
describe la coerción legacy, sin fingir que ya recibe un DTO validado. No necesita
React, Express, Prisma, HTTP, autorización ni reloj.

Ambos `utils/exerciseName.js` conservan el export epley1RM y consumen esa fuente
mediante entradas TS y artefactos ESM/CJS. Sus pipelines reales de historial y
metas, incluido GET goals backend, usan la implementación compartida. Se retiran
los dos cuerpos duplicados de producción; snapshots solo para pruebas.
La variante PR y sus transacciones permanecen intactas, al igual que Smart,
strength y las variantes PDF.

El builder existente emite ahora **11 artefactos reproducibles**, declaraciones
y mapas bundle→ESM emitido→TS con contenido exacto verificado. Backend sigue ESM;
el puente CJS autocontenido no requiere shared/tsc en runtime. No hay dependencias
nuevas, ciclos o Prisma en navegador. No se editó generated manualmente.
La arquitectura futura separa inputs normalizados y políticas de adaptadores
que consultan/autorizan/ordenan, y conserva PR/versiones/comprobantes en sus TX.
Solo se crea performance, sin módulos vacíos. Watch sigue manual como en 4.4.

## Pruebas y resultados

[Matriz C01–C29/S01–S08](../../../docs/TRAINING-ENGINE-CASES.md). Antes de extraer
aprobaron 29 casos de caracterización; después se ampliaron aserciones de API,
mes y año sobre módulos no modificados. Ocho casos adicionales comprueban cuerpo
exacto, 784 pares adversos, 2,000 muestras deterministas, pipelines, imports sin
stripping nativo, mapas/declaraciones, cuatro errores TS y React en Edge real.
Smart comprueba 480 combinaciones de paridad/determinismo/no mutación. Esos bucles
y diagnósticos son aserciones internas, no pruebas únicas adicionales.

| Bloque | Casos únicos aprobados |
| --- | ---: |
| Hasta 2.4, API/Atajos/JWT/integridad |730|
| Operaciones 3.1 |70|
| Sincronización 3.2 |70|
| Almacenamiento 3.3 |47|
| Conflictos 3.4 |56|
| SW/offline 3.5 |34|
| Monorepo 4.1 |12|
| TypeScript 4.2 |13|
| Contratos 4.3 |59|
| Migración 4.4 |13|
| Caracterización 5.1 |29|
| Extracción 5.1 |8|
| **Total** |**1,141**|

La matriz cerrada añade **551 repeticiones**: shared34,
workspaces365, servidor independiente104 y smoke48. Esas 48 smoke, los preflights
y los intentos fallidos no incrementan el total único.

Offline final: **31/31, salida 0, 236746 ms**. Conserva aserciones
sobre fechas originales, pérdida de respuesta, idempotencia/conflictos, cuentas,
Dexie/borradores, lados, rebuildPR y ausencia de huérfanos. No se modifican asserts,
límites o algoritmos para aprobar. [Evidencia SQL/Edge](phase51/offline-integration-evidence.json).

## Builds, tipos y lint

| Control | Resultado |
| --- | --- |
| Node/npm/TS/Prisma |24.22.0 / 11.19.1 / 5.9.3 / 6.19.3|
| PostgreSQL / Edge |postgres (PostgreSQL) 18.4 / 155.0.4283.62|
| Tres typechecks strict y 11 generated |salida 0|
| Cliente, backend tipado y build con flags de ensayo |salida 0|
| Bundle web |2669 módulos; sin backend/Prisma/Node/privados|
| Instalación/build cliente independiente |salida 0|
| Servidor independiente/104 unitarias/import sin strip |salida 0|
| Poda de la copia de ensayo + 48 smoke |salida 0|
| Lint TS/TSX |25 archivos, cero errores/advertencias|
| Lint tooling |44 archivos, cero errores/advertencias|
| Lint global |27 errores/3 advertencias históricos; cero regresiones por firma|

[Entorno](phase51/environment-evidence.json), [lint](phase51/lint-summary.json),
[build/bundle/CSS](phase51/build-comparison.json). No se presenta lint global como
verde. Strict no se debilita. El fixture nuevo test/fixtures/training.ts sigue
incluido en el programa estricto normal; su prueba retira cuatro expectativas.
La prueba histórica conserva intacta su aserción de tres errores.

Runtime propio fuera de Temp, hashes Node/npm verificados, sin cambiar el global.
Entorno saneado, loopback, clústeres/perfiles con identidad comprobada, proveedores
bloqueados y datos sintéticos. Persisten warnings de config padre en build cliente
independiente y chunk PDF. Docker/Podman ausentes: Docker/Linux/OpenSSL/señales/
EasyPanel y Safari/iPhone físico pendientes. Ningún despliegue certificado.

## Ejecuciones fallidas y cierre por checkpoints

1. Primer intento: salida 1 en sync-static por el export faltante del fixture
   React nuevo. Exportarlo corrigió el hallazgo sin cambiar reglas. Se guardan
   32 logs y 485 archivos de esa versión. [Diagnóstico](phase51/first-matrix-diagnostic.json).
2. Segundo: prefijo de 1,019 aprobado y offline 31/31; salida 1 en la prueba antigua
   que retira todas las expectativas de type-tests. El fixture nuevo añadía
   cuatro diagnósticos a su aserción de tres. Solo se movió el fixture nuevo y
   se incluyó en strict; test antiguo intacto. Se guardan 41 logs/490 archivos.
   [Diagnóstico](phase51/second-matrix-diagnostic.json), [preflight](phase51/preflight-evidence.json).
3. Tercero, ya con código final: prefijo de 976 aprobado; salida 1 por el timeout
   histórico `draft sides committed` en el primer caso offline (2 fallos con
   contenedor). No se atribuye causalmente a la fórmula extraída ni se afirma
   haber corregido ese defecto intermitente.

Antes de continuar se comprobaron **348 archivos de código/configuración**,
tres locks y hashes del mismo Node/npm; npm ls confirmó workspaces instalados.
Se archivaron 38 logs, fuentes, hashes y consola fuera de Temp. La utilidad de
continuación vive fuera de scripts, conserva comandos, aserciones, conteos,
entorno y timeouts originales, usa logs checkpoint nuevos y retiene el fallo
como diagnóstico. Los puertos, UUIDs y relojes nuevos son propios del ensayo.
[Equivalencia y procedimiento](phase51/checkpoint-evidence.json).

Los reintentos completos offline fallaron después en otros escenarios:
29 aprobados/2 fallidos con contenedor por `sync after SW upgrade`, y 7/2 por
`version conflict`. Un diagnóstico de solo lectura se añadió únicamente en
la copia de ensayo, condicionado a los dos primeros timeouts; no llegó a
ejecutarse en el fallo del tercer escenario. Las 60 llamadas assert del fixture,
entradas y límites permanecieron iguales. El fixture se restauró byte por byte.
[Diagnóstico temporal](phase51/checkpoint2-evidence.json). No se afirma haber
corregido la intermitencia ni se atribuye una causa sin evidencia.

Se comprobó entonces la equivalencia específica del bloque offline aprobado
31/31 en el segundo intento: **361 entradas idénticas**, incluidos todos los
fuentes cliente/servidor, fixtures offline, herramientas, once generated y locks.
Las únicas tres diferencias de código/configuración son el nuevo fixture
negativo, su include de typecheck y su prueba dedicada. Ninguno entra al runtime
offline; el build de shared sobrescribe include a src y sus opciones efectivas
y fuentes de emisión también coinciden. [Prueba completa](phase51/offline-equivalence.json).

Parte de la copia antigua en Temp desapareció después, con actor desconocido.
La comparación usa sus bytes y hashes archivados fuera de Temp. No se pudo
releer el grafo instalado completo de esa copia: se conservan los npm ci, ls
y check originales con salida 0; los tres locks son idénticos, Node/npm coinciden
por hash y el grafo instalado actual se verificó con npm ls --all. Esta es la
base y el límite explícitos de la equivalencia de dependencias.

Solo se recupera de aquel intento el comando offline con salida 0; su matriz
global conserva salida 1 por el error del fixture del compilador. El prefijo de 976
proviene de la tercera copia y todo el sufijo se ejecutó con fuentes finales:
monorepo, TypeScript/dev, contratos, 4.4, 5.1, builds, instalaciones separadas y
poda/smoke. La utilidad de cierre terminó con salida 0. No se ocultan los tres
fallos de navegador ni se suman como éxitos o nuevas pruebas.

Otros diagnósticos preservados: el fixture inicial confundió empate matemático
con binario (se añadió una prueba IEEE-754); el test de mapas esperaba TS directo
cuando el paquete exporta ESM (ahora verifica ambos saltos); la meta visual era
100 y no 90, reproducido independientemente con el historial recibido y Goal sin
modificar. No se cambió lógica para cumplir expectativas inventadas.
[Datos y logs](phase51/development-diagnostics.json).

Cierre: **448 hashes fuente** conservados;
**348 archivos de código/configuración idénticos** a la copia ensayada.
Archivo durable de **61 logs de matriz**, consola, código y evidencias:
`C:/Users/guerr/.codex/artifacts/nexlift-phase51-final-24ecc668-87f5-42cd-9450-b51ab45435f2`.
[Resultados](phase51/final-checks.json), [matriz completa](phase51/phase51-evidence.json).

Si npm prune reindenta el lock de la copia, se archiva y se prueba igualdad
profunda de todo el JSON antes de restaurar solo sus bytes de ensayo. Los tres
locks del repositorio permanecen intactos. [Prueba](phase51/prune-lock-evidence.json).

## Archivos modificados y nuevos

Recibidos modificados:

- `client/src/generated/cloudinary.js`
- `docs/TRAINING-ENGINE-INVENTORY.md`
- `docs/TYPESCRIPT.md`
- `package.json`
- `packages/shared/src/index.ts`
- `packages/shared/tsconfig.json`
- `scripts/build-typescript.mjs`
- `scripts/verify-monorepo.mjs`
- `server/src/generated/errors.cjs`
- `client/src/utils/exerciseName.js`
- `server/src/utils/exerciseName.js`

Nuevos, aparte de este informe/evidencias:

- `client/src/domain/training.ts`
- `client/src/generated/training.js`
- `client/test/phase51-harness.html`
- `client/test/phase51-harness.jsx`
- `docs/TRAINING-ENGINE-AUDIT.md`
- `docs/TRAINING-ENGINE-CASES.md`
- `packages/shared/src/domain/training/performance.ts`
- `packages/shared/test/fixtures/training.ts`
- `scripts/fixtures/phase51/client/exerciseName.js`
- `scripts/fixtures/phase51/server/exerciseName.js`
- `scripts/lib/training-characterization.mjs`
- `scripts/test/training-characterization.test.mjs`
- `scripts/test/training-shared.test.mjs`
- `server/src/domain/training.ts`
- `server/src/generated/training.cjs`

## Preparación de las fases siguientes

Recomendación concreta para 5.2: tipos numéricos normalizados y políticas de
esfuerzo/e1RM nombradas por frontera. La siguiente extracción pequeña puede ser
RIR/RPE contextual, manteniendo el adaptador Atajo y golden HTTP. Corregir PDF
cero y calendar DST/TZ requiere una tarea separada, decisión explícita y
evaluación histórica; no imponer una fórmula universal ni migrar valores.

5.3 recibe el mapa Smart inter/intra; 5.4, las limitaciones de muestra/ventana/
ausencia/lados de plateau. 5.5 se delimitará con su prompt. Ninguna se implementa.

Coach queda preparado documentalmente: A datos almacenados, B métricas
derivables, C datos no recopilados y D estimaciones que necesitan validación.
No hay registro estructurado de sueño/dolor/fatiga/readiness/nutrición detallada,
ROM/velocidad de set o fracciones de series por músculo. e1RM/r2/plateau/kg×rep
no miden por sí solos hipertrofia o recuperación. Los modelos cardio y su backup
no prueban un flujo actual de captura o cálculo energético.

**Producción intacta; baseline PROVISIONAL; nueva sincronización deshabilitada
en producción. Sin migraciones persistentes, commits, despliegues o avance a 5.2.**
