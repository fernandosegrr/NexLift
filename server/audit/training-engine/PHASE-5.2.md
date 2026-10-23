# NexLift v4.0 — Fase 5.2

Implementación: **COMPLETADO**. Certificación integral: **APROBADA en el entorno local Windows/x64 verificado**.

La matriz final **npm test terminó con salida 0** sobre una copia nueva, con
**1,173 pruebas únicas: 1,141 recibidas + 32 nuevas**. No se reutilizaron resultados
de la 5.1 ni se sumaron reintentos como pruebas nuevas. Las repeticiones de workspaces,
standalone y smoke se contabilizan aparte: **551**.

Producción no accedida ni modificada. Sin bases persistentes, migraciones
persistentes, schema/SQL nuevos, commits, staging Git o despliegues. Baseline
Prisma/SQL **PROVISIONAL**; sincronización nueva deshabilitada en producción.
No se inicia 5.3 ni Coach.

## Estado recibido y conservación

Repositorio real: `C:/Users/guerr/OneDrive/Escritorio/NexLift`. Se inspeccionaron git status/diff y cambios sin
commit, arquitectura/API/modelo, fases 3.5/4.x/5.1, auditoría/casos/inventario,
contratos, builder, declaraciones, generated y consumidores. No había AGENTS.md
aplicable; se contrastó CLAUDE.md con el código. No se leyó el .env operativo.

Respaldo previo fuera de Temp: `C:/Users/guerr/.codex/artifacts/nexlift-phase52-received-b198d083-9395-458b-9acd-b0c841de47e3`, **530 archivos públicos**,
status/diff y SHA256. Se guardan siete snapshots de las implementaciones originales
como fixtures; sus bytes coinciden con ese respaldo. Se registran hashes de
funciones originales, no solo nombres o líneas.

Conservación final: 507/530 archivos recibidos idénticos,
**22 modificados de código/config/documentación**, **15 nuevos**,
**cero recibidos eliminados**. La evidencia offline de la raíz audit se actualizó
solo por el ensayo desechable y se cuenta separada del código. Informes de fases
anteriores intactos. Sin reset/clean/checkout destructivo.

[Prueba previa y hashes](phase52/source-before-matrix.json) conserva 160 entradas
protegidas; las funciones Smart/plateau/deload/fechas de logic.js permanecen exactas,
exceptuando únicamente las dos funciones de frontera de esfuerzo delegadas.
Locks, cuatro entradas Prisma, rutas/transacciones/hashes/offline/SW y pruebas
anteriores conservan bytes; el único fixture histórico editado es el harness
offline descrito abajo. Sus 60 aserciones y acciones se comprueban sin cambios.

## Dominio y consumidores reales

En `packages/shared/src/domain/training/effort.ts`:

- Tipos UserRir, StoredRpe e InferredRir con kind/value, unidades y origen claro.
- rirToStoredRpe / storedRpeToRir: 10-value, sin redondeo o clamp; números sin
  etiqueta rechazados por los tipos de dominio.
- formRirToStoredRpe / storedRpeToFormRir: adaptadores nullable de la frontera UI,
  usados realmente al leer, guardar y mostrar en Workout/EditSession.
- parseLegacyShortcutEffort y convertLegacyShortcutRir: usados por logic.js y el
  endpoint legacy, con coerciones, errores y prioridad recibidos.
- parseCanonicalWorkoutEffort: usado por readSetInput v1; preserva validación y
  prioridad de errores. La validación completa de trabajo/rango sigue en sanitizeSets.

En `personalRecords.ts`: personalRecordEpley1RM y
selectHistoricalPersonalRecord, junto con tipos readonly de series/sesiones y
PersonalRecordPerformance. Las cargas/e1RM son kg y las repeticiones conteos;
la fecha es genérica/opaca. No hay reloj, React, Express, Prisma, HTTP, SQL,
mutación de arrays ni dependencias circulares.

recalcPRForExercise conserva la consulta autorizada (nombre case-insensitive,
fecha ASC), deleteMany/create y el client de la transacción; delega exclusivamente
la selección pura. Crear/editar/eliminar, Atajos, idempotencia y resolución de
conflictos conservan Serializable, locks y atomicidad. No hay llamadas externas
dentro de las transacciones ni cálculo nuevo en transacciones IndexedDB.

No se crea metrics.ts vacío ni se inventan métricas UI. La métrica seleccionada
es mejor rendimiento histórico: carga, reps, e1RM y fecha. Volumen/completed/reps
totales/progreso no se recalculan con reglas nuevas.

## Decisiones matemáticas y compatibilidad

La [tabla normativa](../../../docs/TRAINING-PERFORMANCE.md) relaciona concepto,
regla anterior/actual, consumidores, casos y riesgos. Conserva estas distinciones:

| Concepto | Antes y después / evidencia |
| --- | --- |
| RIR/RPE UI | null sigue null; cero es significativo; 10-RIR al guardar y 10-RPE al leer; no reinterpretar antiguos fuera de botones0–3 |
| Atajo legacy | rir no vacío tiene prioridad y exige0–4; rpe 0–4 es RIR,6–10 almacenado; hueco(4,6) rechazado; ausencia RIR 0/RPE 10; conserva parseFloat |
| API v1 | rpe siempre almacenado, aun source=shortcut; rir 0–4 alternativo debe concordar exactamente; finitos/enteros, sin coerción legacy; hash/contrato intactos |
| Historial/metas | cappedEpley1RM de 5.1 conserva single/cap36/coerción sin redondeo; 80×37→176 |
| PR | Number\|\|0; omite trabajo no positivo; 1<r<37 usa w*(1+r/30), resto w; 80×37→80 |
| Comparación | 80×10=106.66666666666666 y100×2=106.66666666666667; gana100×2 con > exacto, sin epsilon/rounding |
| Empates | Primer candidato recorrido gana empate binario. Fecha ASC no establece orden total entre logs/sets de igual timestamp |
| Unilateral PR | Mejor lado; cada derecho nullish hereda izquierdo; derecho0×0 aporta candidato inválido, no sustituye cero; no filtra completed |
| Strength/pantallas/PDF | Mantienen fórmulas y redondeos propios; strength106.7, extrapolaciones singles/altas reps y fallback PDF con \|\| siguen distintos |
| Volumen | Sigue kg×rep bajo política de lados del consumidor; no equivale a series efectivas o hipertrofia medida |
| Historial/importación | rpe guardado no se reconvierte; fecha/performedAt, IDs/versiones y orden no se alteran |

Las rejillas contrastan resultados, null/undefined/cero, decimales, coerciones y
errores exactos. El dominio y el hash no usan tolerancias. En SQL se observó la
presentación Prisma 106.6666666666667; se compara exactamente con el adaptador
original a través de la misma frontera, sin cambiar selección ni redondear antes
de persistir. Los dos primeros assertions nuevos que suponían igualdad directa
con el double previo a esa serialización fallaron; se sustituyeron por esa
comparación original/nueva, no se relajaron pruebas históricas.

Límite heredado adicional: parseFloat legacy puede aceptar esfuerzo fraccional,
mientras SetLog.rpe sigue Int; esa aceptación del sanitizer no promete que un
valor fraccional sea persistible. No se amplía esquema ni se convierte el historial.

## Pruebas nuevas y equivalencia

28 casos planos en training-performance.test.mjs +4 casos HTTP/SQL nuevos. Cubren
RIR 0–4, RPE 6–10 y legacy 0–4/5, ausencias/contradicciones/source, importaciones,
1/10/36/37 reps, IEEE/ties/timestamps/lados/incompletas, edición/eliminación,
errores runtime, igualdad frontend/backend, compilación negativa, no mutación,
determinismo, rendimiento y reproducción del harness.

Tres rejillas de 29×29, 160 historias aleatorias, combinaciones v1 con hashes y ocho
diagnósticos negativos se cuentan dentro de sus casos. Los snapshots recibidos
son referencia independiente; los consumidores reales se comparan además con
las expresiones originales. Las 37 pruebas de 5.1 y todas las fases anteriores
se ejecutan de nuevo en la matriz final. PostgreSQL verifica conversiones por
HTTP, autorización, unilateralidad, edición/eliminación y rollback real al fallar PR.
Las suites anteriores cubren operación duplicada, respuesta perdida, conflictos,
hashes, resolución y fechas CDMX, con los módulos nuevos integrados.

## Harness offline: fallos conservados y corrección acotada

Antes de la matriz se verificaron Node/npm fuera de Temp, PGDATA/puerto/marcador/
system_identifier de clústeres propios, perfiles Edge independientes y fuentes.
El observador añadido registra en fallos solo DOM/estados de datos sintéticos y
requests sin headers. No cambia errores ni resultados; las acciones y 60 assertions
recibidos siguen iguales. Los timeouts originales 15 s/CDP 600 s se conservan;
solo las lecturas diagnósticas nuevas tienen un límite propio 2 s.

Se reprodujeron y conservaron tres intentos fallidos de desarrollo:

1. Click CDP retornó antes del commit de controles unilaterales: Missing input.
2. Una espera de controles permitió escribir, pero otra inicialización restableció
   la pantalla: timeout draft sides committed. Diagnóstico mostró modo persistido
   true y formulario bilateral vacío; no se borraron datos para obtener verde.
3. Fijar únicamente process.env.NODE_ENV en define mezcló runtime React producción
   con JSX de desarrollo: no arrancó SW. Ese intento tiene salida1.

[Reproducción de build](phase52/react-build-probe.json): el fixture heredaba
NODE_ENV=test, seleccionando react-dom-client.development.js mientras forzaba
import.meta.env.PROD/SW=true. La corrección compila ambos frontends del ensayo
con Vite/JSX/React coherentes en producción y restaura NODE_ENV también si falla.
Se espera el commit de controles antes de entrar valores. Dos nuevas pruebas
reproducen la elección real de runtime, restauración y conservación de assertions.

La ejecución controlada siguiente aprobó 31/31 (300.926 s, salida0), incluidos
borrador unilateral, conflicto entre procesos y sincronización tras upgrade SW.
La matriz final ejecuta esos 31 otra vez sobre la copia final y usa su resultado,
sin reutilizar la referencia anterior. Esto corrige la incoherencia identificada
del harness; no certifica ausencia universal de carreras en desarrollo StrictMode,
dispositivos físicos o navegadores no ejecutados. No se reescribe el motor offline.

[Fallos/preflights y rutas a logs](phase52/development-checks.json). Los comandos
fallidos conservan salida1 y no se cuentan como una matriz verde.

## Resultado integral y builds

Entorno: Node v24.22.0, npm 11.19.1, TypeScript 5.9.3, Prisma 6.19.3,
PostgreSQL 18.4, Edge real, Windows/x64. Node/npm SHA256 y locks en
[environment.json](phase52/environment.json). No se ejecutaron Docker/Linux,
EasyPanel/VPS, Safari/iPhone físico ni producción.

- Typechecks estrictos de tres workspaces y declaraciones: aprobados.
- Shared/frontend/backend tipado, check:generated, check:bundle, imports ESM/CJS,
  runtime sin stripping TS, standalone installs/builds y prune/smoke: aprobados.
- Además, [compilación frontend de producción](phase52/production-build.json)
  con NODE_ENV=production, envFile=false y write=false sobre la misma copia:
  aprobada, con React producción real y límites del navegador verificados;
  no arranca backend ni despliega.
- Siguen 11 generated. Seis cambian bytes: training de ambos lados y contratos
  del servidor cambian sus cuerpos; contratos cliente, cloudinary y errors
  cambian únicamente mapas. Los otros cinco conservan todos sus bytes.
- Lint TypeScript y tooling limpios. Global **27 errores/3 warnings**
  recibidos, sin regresiones; se comparan regla/severidad/texto normalizando solo
  números de línea incluidos en code frames. **Global no está verde**. El primer
  snapshot solo-src daba 23/3; el comando global 'eslint .' conserva 27/3.
- CSS idéntico a 5.1: 107,239 bytes, SHA256
  50cd2c0ab880c45a97a2dfd308f16dc6d05290e77aa9c9a545d85b11caf9461f.
- Se contrastan 463 hashes de fuentes finales. De los archivos de código/config
  que se copiaron al ensayo, 376 conservan bytes idénticos. La única excepción
  es el lock server reindentado por npm prune, con JSON/graph exactamente igual;
  el lock del repositorio conserva sus bytes recibidos.

Rendimiento sintético: 400 sesiones, 2400 series y 100 evaluaciones por muestra,
cinco muestras. Mediana anterior 21.332 ms;
compartida 16.766 ms. Mismo número de consultas
(tres puertos en el caso con PR); sin regresión observada en el cálculo. No es una
medición de latencia de guardado en el VPS ni una garantía fisiológica.

| Comando | Exit | Tests reportados | Conteo | Segundos |
| --- | --- | --- | --- | --- |
| root-ci | 0 | 0 | principal | 46.14 |
| root-workspaces | 0 | 0 | principal | 1.68 |
| root-project-check | 0 | 0 | principal | 1.06 |
| initial-typescript-build | 0 | 0 | principal | 5.71 |
| strict-typechecks-generated-and-lint | 0 | 0 | principal | 16.71 |
| shared-resolution | 0 | 0 | principal | 2.73 |
| prisma-generate | 0 | 0 | principal | 5.81 |
| server-test | 0 | 104 | principal | 1.33 |
| server-test-integration | 0 | 48 | principal | 10.04 |
| server-test-backup | 0 | 17 | principal | 0.91 |
| server-test-backup-integration | 0 | 41 | principal | 28.15 |
| server-test-import | 0 | 22 | principal | 0.94 |
| server-test-import-integration | 0 | 39 | principal | 11.44 |
| server-test-workout-integration | 0 | 84 | principal | 20.57 |
| server-test-workout-baseline | 0 | 13 | principal | 7.53 |
| server-test-schema-audit | 0 | 54 | principal | 32.24 |
| server-test-baseline | 0 | 46 | principal | 61.82 |
| server-test-infra | 0 | 37 | principal | 3.87 |
| server-test-infra-integration | 0 | 14 | principal | 25.09 |
| client-historical-tests | 0 | 176 | principal | 4.11 |
| default-workspace-build | 0 | 0 | principal | 28.30 |
| client-bundle-boundaries | 0 | 0 | principal | 9.77 |
| staging-unit | 0 | 12 | principal | 1.09 |
| staging-integration | 0 | 23 | principal | 114.63 |
| infra-static | 0 | 0 | principal | 2.50 |
| staging-static | 0 | 0 | principal | 2.15 |
| operations-unit | 0 | 30 | principal | 0.67 |
| operations-integration | 0 | 40 | principal | 25.43 |
| operations-static | 0 | 0 | principal | 2.13 |
| sync-client | 0 | 51 | principal | 2.94 |
| sync-postgres-browser | 0 | 19 | principal | 26.75 |
| sync-static | 0 | 0 | principal | 9.88 |
| storage-postgres-browser | 0 | 47 | principal | 23.64 |
| storage-static | 0 | 0 | principal | 3.27 |
| conflicts-postgres-browser | 0 | 56 | principal | 25.98 |
| conflicts-static | 0 | 0 | principal | 8.45 |
| offline-sw | 0 | 3 | principal | 0.60 |
| offline-postgres-browser | 0 | 31 | principal | 226.28 |
| offline-static | 0 | 0 | principal | 7.88 |
| monorepo-tests | 0 | 12 | principal | 1.73 |
| typescript-tests | 0 | 12 | principal | 3.42 |
| typescript-development-entry | 0 | 1 | principal | 7.64 |
| shared-contracts-and-http-consumers | 0 | 56 | principal | 3.42 |
| client-import-response-contracts | 0 | 3 | principal | 2.40 |
| phase44-real-typescript-consumers | 0 | 13 | principal | 9.12 |
| phase52-training-engine | 0 | 37 | principal | 5.06 |
| phase52-performance-domain | 0 | 28 | principal | 4.90 |
| phase52-performance-http-postgres | 0 | 4 | principal | 5.92 |
| shared-workspace-contracts | 0 | 34 | repetición | 0.71 |
| tooling-lint | 0 | 0 | principal | 1.55 |
| client-rehearsal-build | 0 | 0 | principal | 14.18 |
| all-workspace-unit-tests | 0 | 365 | repetición | 4.85 |
| client-standalone-ci | 0 | 0 | principal | 40.65 |
| client-standalone-build | 0 | 0 | principal | 10.27 |
| server-standalone-ci | 0 | 0 | principal | 12.83 |
| server-standalone-unit | 0 | 104 | repetición | 0.71 |
| server-standalone-commonjs | 0 | 0 | principal | 0.11 |
| server-standalone-training | 0 | 0 | principal | 0.12 |
| production-prune | 0 | 0 | principal | 1.33 |
| production-deps-smoke | 0 | 48 | repetición | 9.99 |

[Evidencia integral](phase52/phase52-evidence.json) ·
[Preservación, archivos y checks finales](phase52/final-checks.json).
Raw logs conservados dentro de audit/phase52/raw y fuera de Temp en
`C:/Users/guerr/.codex/artifacts/nexlift-phase52-final-1bf2fd89-8aff-4f2f-82fc-c7076187ab60`; copia final de fuentes, evidencia y preflights incluida.

## Archivos modificados y nuevos

Modificados de esta fase, respecto a lo recibido:

- `client/src/domain/training.ts`
- `client/src/generated/cloudinary.js`
- `client/src/generated/contracts.js`
- `client/src/generated/training.js`
- `client/src/pages/EditSession.jsx`
- `client/src/pages/Workout.jsx`
- `docs/TRAINING-ENGINE-AUDIT.md`
- `docs/TRAINING-ENGINE-CASES.md`
- `docs/TRAINING-ENGINE-INVENTORY.md`
- `docs/TYPESCRIPT.md`
- `package.json`
- `packages/shared/src/contracts/workoutSessions.ts`
- `packages/shared/src/index.ts`
- `scripts/check-tooling.mjs`
- `scripts/verify-monorepo.mjs`
- `server/src/domain/training.ts`
- `server/src/generated/contracts.cjs`
- `server/src/generated/errors.cjs`
- `server/src/generated/training.cjs`
- `server/src/logic.js`
- `server/src/services/personalRecords.js`
- `server/test/fixtures/stabilization-browser.mjs`

Nuevos de código/fixtures/documentación:

- `client/test/phase52-react-build.js`
- `docs/TRAINING-PERFORMANCE.md`
- `packages/shared/src/domain/training/effort.ts`
- `packages/shared/src/domain/training/personalRecords.ts`
- `packages/shared/test/fixtures/performance.ts`
- `scripts/fixtures/phase52/contracts.reference.txt`
- `scripts/fixtures/phase52/EditSession.reference.txt`
- `scripts/fixtures/phase52/logic.js`
- `scripts/fixtures/phase52/personalRecords.js`
- `scripts/fixtures/phase52/stabilization-browser.reference.txt`
- `scripts/fixtures/phase52/Workout.reference.txt`
- `scripts/fixtures/phase52/workoutSessions.reference.txt`
- `scripts/test/training-performance.test.mjs`
- `server/test/performance.integration.test.js`
- `server/test/run-performance-integration.mjs`

El presente informe y JSON/logs de auditoría se cuentan aparte. No se editaron
dependencias ni locks, schema/migraciones o Dockerfiles.

## Riesgos y preparación para 5.3

Siguen diferenciados e1RM de historial/PR/visualización/PDF, fuerte frente a débil,
completed y volumen, ceros PDF y fechas/DST. Añadir un desempate total por ID/setNumber
es estrategia futura: requiere fixtures de mismo timestamp y decisión explícita
de producto/migración; no se activó ni cambió el ganador histórico.

5.3 puede consumir esfuerzo contextual, tipos readonly y políticas nombradas;
debe caracterizar primero las fronteras particulares de Smart Loading. Esta fase
no modifica recomendaciones, umbrales de plateau/deload o agrupación temporal.
Volumen por músculo, recuperación, sueño/dolor/fatiga, nutrición y otras métricas
Coach mantienen los huecos identificados en 5.1; no se deducen certezas fisiológicas.

Producción intacta; baseline PROVISIONAL; sync nueva deshabilitada en producción.
Sin commits/despliegues. **Fase 5.3 no iniciada**.
