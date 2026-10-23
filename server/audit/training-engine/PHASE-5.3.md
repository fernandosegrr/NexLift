# NexLift v4.0 — Fase 5.3

Implementación: **COMPLETADO**. Certificación integral: **APROBADA en desarrollo Windows/x64**.

**npm test terminó con salida 0**, ejecución integral nueva sobre el código final,
62 comandos y **1,202 pruebas únicas: 1,173 recibidas +29 nuevas**.
Las **551 repeticiones** de workspaces/standalone/smoke se contabilizan aparte.
No se presenta una suma de checkpoints como corrida integral.

Producción no accedida ni modificada; sin credenciales operativas, bases persistentes,
migraciones persistentes, schema/SQL modificados, flags activadas, staging Git,
commits o despliegues. Prisma/SQL **PROVISIONAL**. Sincronización nueva deshabilitada
en producción. **Fase 5.4 y Smart Loading 2.0/Coach no iniciados**.

## Estado recibido, inspección y protección

Repositorio real: C:/Users/guerr/OneDrive/Escritorio/NexLift, distinto del cwd inicial
de la app. Se inspeccionaron git status/diff y trabajo sin commit, CLAUDE.md,
arquitectura/API/modelo, PHASE-5.1/5.2, 3.5 y documentos del motor/TypeScript,
builder y consumidores. No había AGENTS.md aplicable. Se conserva Express ESM,
React19/Vite7, TypeScript5.9.3 y Prisma6.19.3.

Respaldo previo estable fuera de Temp: C:/Users/guerr/.codex/artifacts/nexlift-phase53-received-a71e438b-42f4-4649-9c81-21948407a842.
**561 archivos públicos** con SHA256/status/diffs; archivos env excluidos, sin leer
el operativo. Node24.22.0/npm11.19.1 fuera de Temp, hashes de binarios y tres locks
en [entorno](phase53/environment.json). PostgreSQL18.4 desechable y Edge real con
perfiles propios, secuencialmente. No reset/clean/checkout destructivo.

Conservación: **544/561 archivos recibidos idénticos**,
**17 modificados**, **13 nuevos de código/fixtures/documentación**, **cero recibidos
eliminados**. Informes/evidencia se cuentan aparte. **218 archivos protegidos**,
incluidos locks, Prisma/SQL, contratos/esfuerzo/PR5.2, rutas/transacciones/hash,
offline/SW, pantallas, pruebas y todos los informes PHASE recibidos, conservan bytes.
Todas las funciones de logic.js ajenas a las ocho extracciones conservan cuerpo
exacto, incluidas plateau, fechas y sanitizers. No se cambia su política.

Las cuatro copias originales de smartLoading, logic, Workout e index coinciden con
el respaldo; goldens se capturan desde esa implementación independiente y además
verifican números esperados explícitos. [Hashes y funciones](phase53/source-before-matrix.json).

## Inventario y arquitectura integrada

La [política completa y mapa de llamadas](../../../docs/TRAINING-SMART-LOADING.md)
documenta las rutas intra/inter, cada variable y ausencia, redondeos, contexto de
rutina, unilateralidad, aplicación manual, fallback, estados y diferencias reales.
[Inventario de funciones y llamadas reales](phase53/smart-loading-inventory.json).

Se extraen a **packages/shared/src/domain/training/smartLoading.ts**:
parseRepRange, resolveWeightIncrement, effectiveWorkoutSet, roundWorkoutWeight,
adjustRepRangeForPhase, pickWorkReference, computeWorkoutSuggestion y
suggestNextSetFromToday. Se añaden evaluadores internos evaluateWorkoutSuggestion
y evaluateNextSetFromToday con recomendaciones y explicaciones tipadas.

Entradas legacy explícitas/readonly, kg y reps documentados; sesiones, fases,
opciones, referencias, resultados y motivos de abstención con tipos. Sin any,
casts, supresiones de producción, reloj, React, Prisma, SQL, fetch, Dexie,
localStorage, estado global mutable, dependencias circulares o mutación de historia.
Los seis ts-expect-error viven solo en la fixture negativa controlada.

Consumidores integrados efectivamente mediante las API anteriores:

- Workout: useExerciseHistory/deriveHistoryDerived → inter; suggestionByIndex →
  intra, referencias/filas, aplicar global/fila, autorrelleno, calentamiento.
- GET /api/shortcuts/next-set: mismo callback, consultas autorizadas, ventana10,
  selección de ejercicio, intento intra y fallback inter, respuesta y telemetría.
- Plateau y otros consumidores del helper efectivo/redondeo/rango reciben la
  misma función equivalente mediante logic.js; sus reglas no se modifican.

Las pantallas Workout/EditSession e index.js conservan **todos sus bytes recibidos**.
Cliente smartLoading.js es fachada ESM, logic.js reexporta el bundle CJS existente.
No quedan cuerpos fuente activos duplicados de esas ocho reglas; los snapshots
solo son referencias de tests. No existe motor alternativo sin consumidores.
Los servicios continúan preparando/consultando el contexto.

## Reglas y resultados históricos

Inter usa únicamente la primera sesión suministrada, con filtros positivos y
sin filtrar completed. Protección de singles/doubles cuando lo>3 y hay alternativas;
pool>=75% del máximo; tope pesado con RIR<=1 preferido, después elegibilidad por
suelo/máximas reps/peso. Al mismo peso por abs(delta)<.01: max/min reps, min RIR.
Top-set al techo con RIR<=1 o todas al techo → un incremento y reinicio en lo.
Mejor al techo sin progresión → igualar desde minReps+1. Resto → mismo peso,
+1rep/+2siRIR>=3. basedOn cuenta sesiones suministradas, sin análisis de tendencia.

Intra usa el orden de las series de hoy preparadas por caller; exige RIR finito
en cada fila positiva. Primera al fallo → peso*.875 y +2reps acotadas o +1sobre
el techo; última al fallo/debajo del suelo → un paso de reducción; caída RIR/reps
o últimaRIR1 → mantener; comodidad → +1/+2reps sin subir peso; resto mantener.
El mínimo por incremento y fallback para cargas pequeñas se conservan.

Rejilla: abs(base%increment)<.01 ? increment : .5; Math.round(w/grid)*grid.
Sin epsilon nuevo, conversiones globales a enteros o reordenación aritmética.
Intensificación reduce rango a mitad redondeada con suelo1; acumulación eleva
techo50%. Descarga conserva el ajuste externo ~10% solo inter, sin doble reducción.
No se cambian activación, cooldown, plateau o temporalidad CDMX.

Resultados protegidos:80×10RIR2→80×11;80×12RIR1+80×8→82.5×8;
80×12RIR2+80×8→80×9;6.8×12→9.5×8;110×1/100×4/100×3→100×5;
primera80×8RIR0→70×10; posterior80×8RIR0→77.5×8.
Historial vacío o primera sesión sin trabajo → null; no se inventa carga para
ejercicio nuevo. Meses sin entrenamiento no introducen otra política de reducción.

RIR/RPE reutiliza storedRpeToRir de5.2, preservando prioridad de rpe almacenado y
raw rir alternativo. Adaptador aritmético explícito conserva coerción y TypeError,
incluidos Symbol/BigInt/boxed/ToPrimitive. Intra no adivina RIR desde campo rpe.
Fronteras legacy Atajo y v1, formularios y backups permanecen diferenciadas.
Smart usa mínimos independientes de peso/reps entre lados; nullish hereda cada
campo izquierdo, cero no se sustituye. PR conserva mejor lado y recálculo TX5.2.
Smart no usa Epley PR ni cappedEpley para decidir carga; estimate1RM visual de
Workout tiene otra responsabilidad y se conserva.

## Divergencias y límites conservados

- PWA inter excluye todos los logs del día CDMX; Atajo excluye un ID de hoy y
  tiene fallback distinto. PWA intra filtra completed; Atajo trabajo positivo.
- TodayLogs de Atajo no ordena sets en SQL; el motor respeta el array recibido.
  basedOn no significa confianza ni tendencia. El núcleo no consulta fechas.
- **Formulario bilateral recibido:** weightR/repsR vacíos se pasan como derecha
  presente y Number('')=0; mínimos efectivos pueden provocar abstención intra.
  Se reproduce con referencia/Edge y se preserva. Activar esas recomendaciones
  sería un cambio funcional, no una migración de tipos.
- El modo unilateral no se reestablece automáticamente en borrador legacy sin
  IndexedDB; sus valores sí se preservan. Edge vuelve a seleccionar el modo antes
  de guardar. No se rediseña la persistencia.
- El comentario viejo sobre fallback e1RM en pickWorkReference era inexacto;
  la implementación elige por reps/peso. Los números se conservan.
- Cargas pequeñas pueden contradecir el texto de reducción por su mínimo de
  incremento; faltantes/no finitos/decimales legacy conservan sus resultados o
  errores. Los validadores HTTP siguen aplicando su frontera. Spread mantiene
  un límite de tamaño histórico para entradas patológicamente grandes.

No hay discrepancia numérica pendiente entre la referencia y los cuatro puertos
en el dominio caracterizado. Esto no certifica predicción de hipertrofia,
recuperación o adaptación ni corrige toda inconsistencia histórica.

## Explicabilidad y protección de integridad

Evaluadores internos separan recommendation y explanation: regla/abstención,
referencia, rendimiento RIR/reps, rango, cantidad, incremento, primer rawWeight,
rejilla, resultado/delta, fallbackStep y limitaciones. Los wrappers devuelven
exactamente la forma pública recibida; no agregan explicaciones a HTTP,
SuggestionLog, datos almacenados, operaciones, comprobantes o hashes.

Recomendación, entrada manual, borrador local y confirmación remota siguen siendo
estados diferentes. Calcular no confirma ni crea operación. UUID, performedAt,
expectedVersion, requestHash, sessionVersion, conflictos, payloads, colas y orden
de dependientes permanecen intactos. No se añade trabajo en TX IndexedDB ni
llamadas externas dentro de TX SQL. Se conserva aislamiento entre cuentas.

## Pruebas nuevas y flujos reales

**25 casos planos** en smart-loading.test.mjs y **4 HTTP/SQL**. Los28 goldens,
rejillas29×29,480 combinaciones y500 historias con semilla se cuentan dentro
de esos casos; no inflan el total. Seis diagnósticos negativos constituyen1test.
Se comparan números, texto, null/undefined/NaN/errores, claves, orden e inputs.
Inmutabilidad con arrays congelados, tipos y ESM/CJS son verificaciones reales.

Edge monta **Workout real** con Auth/Toast/Router y adaptadores sintéticos,
sin clonar handlers de UI: ignora/aplica badge, modifica peso/reps, registraRIR,
confirma serie, caracteriza abstención bilateral, pasa a unilateral, recibe70×10,
preserva ambos lados tras recarga, guarda con10-RIR y sin explicación en payload.
No hay escritura confirmada antes de guardar. El reinicio de proceso, SW, Dexie,
conflictos, sesiones parciales, edición/historial/borrado y sincronización diferida
también pasan en las suites recibidas sobre Edge/PG de esta misma matriz.

SQL nuevo ejecuta por HTTP Express el callback actual exacto de next-set, extraído
sin importar index/dotenv/jobs. Es PostgreSQL desechable, usuarios sintéticos y
fase inyectada; no afirma probar proveedor IA nuevo o JWT dentro de esos4casos.
Verifica owner/nohistoria/inter/telemetría, AtajoRIR→intra/fallback, unilateral,
edición/borrado/PR y ajuste de fase. La matriz recibida vuelve a comprobar JWT,
idempotencia, respuesta perdida, conflictos/rollback, TXPR y calendarioCDMX.

## Rendimiento

O(n) en series seleccionadas, memoria local O(n); sin sort/mutaciones de arrays
históricos, consultas adicionales o caché persistente. No se modifica memoización
ni dependencias de React. Evaluadores incorporan asignaciones locales explicativas.
Muestras finales:5 por variante,100 iteraciones por muestra, cálculo inter+intra.
Preparación corresponde a100 maps efectivos; son datos sintéticos, no latencia VPS.

| Series | Original mediana ms/100 | Compartido mediana ms/100 | Preparación ms/100 |
| --- | --- | --- | --- |
| 0 | 0.0678 | 0.0733 | 0.0213 |
| 10 | 0.6560 | 0.9646 | 0.3379 |
| 100 | 3.7474 | 3.0383 | 1.1645 |
| 1000 | 26.0571 | 29.2984 | 6.7420 |

Reconstrucción de100ejercicios×10series: 0.4379ms.
Las diferencias de microbenchmark no se presentan como mejora de render o garantía
de tiempo. Mediciones completas en [checks](phase53/final-checks.json) y raw log.
En 1,000 series, el compartido tarda29.2984ms frente a26.0571ms por100iteraciones
en esta corrida: sobrecoste medido0.032413ms por par inter+intra. En10series el
sobrecoste es0.003086ms por par. Se conserva O(n) y cero consultas adicionales;
no se oculta este coste local de compatibilidad/explicaciones como una mejora.

## Resultado integral y herramientas

Copia nueva: C:\Users\guerr\AppData\Local\Temp\nexlift-phase53-verification-CTKwRQ.
Comando exterior npm test: **salida0**, 892.236s.
62 comandos finales con salida0;1,202pruebas únicas y551repeticiones aparte.
Las1,173 anteriores se ejecutaron de nuevo, no se reutilizó la certificación5.2.

Build shared/client/server, strict de los workspaces, declaraciones/source maps,
11generated reproducibles, bundle boundaries, NodeESM/CJS sin native TS stripping,
instalaciones limpias, standalone, desarrollo realPG y prune/smoke aprobados.
Builder sin cambios; **11artefactos**,4cambianbytes y solo2cuerpos ejecutables
(trainingESM/CJS). Cloudinary/errors cambian únicamente mapas; otros7idénticos.
La fixture de paridad standalone copia además el generated cliente que ahora
necesita la fachada; no añade dependencia runtime entre servidor y aplicación web.

TypeScript lint:28archivos,0errores/0advertencias. Tooling:54archivos,0/0.
Lint global **27errores y3advertencias**, no verde; firmas idénticas al recibido,
99→100archivos analizados. No se cambian reglas/ignores para ocultar deuda.
[Comparación](phase53/lint-comparison.json).

Compilación adicional frontend con NODE_ENV=production, envFile=false/write=false,
misma copia final: salida0,React producción,2669módulos;
sin servidor/Prisma/Node/archivos privados en bundle. CSS107239bytes,
SHA256 50cd2c0ab880c45a97a2dfd308f16dc6d05290e77aa9c9a545d85b11caf9461f,igual recibido. Es build local, no despliegue.
No se ejecuta ni certifica Docker/Linux/VPS/EasyPanel o Safari/iPhone físico.

| Comando | Exit | Tests | Conteo | Segundos |
| --- | --- | --- | --- | --- |
| root-ci | 0 | 0 | principal | 29.40 |
| root-workspaces | 0 | 0 | principal | 1.95 |
| root-project-check | 0 | 0 | principal | 2.27 |
| initial-typescript-build | 0 | 0 | principal | 8.95 |
| strict-typechecks-generated-and-lint | 0 | 0 | principal | 16.59 |
| shared-resolution | 0 | 0 | principal | 2.36 |
| prisma-generate | 0 | 0 | principal | 6.98 |
| server-test | 0 | 104 | principal | 1.22 |
| server-test-integration | 0 | 48 | principal | 9.61 |
| server-test-backup | 0 | 17 | principal | 1.51 |
| server-test-backup-integration | 0 | 41 | principal | 27.75 |
| server-test-import | 0 | 22 | principal | 0.65 |
| server-test-import-integration | 0 | 39 | principal | 8.22 |
| server-test-workout-integration | 0 | 84 | principal | 15.44 |
| server-test-workout-baseline | 0 | 13 | principal | 6.54 |
| server-test-schema-audit | 0 | 54 | principal | 23.18 |
| server-test-baseline | 0 | 46 | principal | 50.38 |
| server-test-infra | 0 | 37 | principal | 3.79 |
| server-test-infra-integration | 0 | 14 | principal | 21.67 |
| client-historical-tests | 0 | 176 | principal | 3.75 |
| default-workspace-build | 0 | 0 | principal | 25.19 |
| client-bundle-boundaries | 0 | 0 | principal | 9.27 |
| staging-unit | 0 | 12 | principal | 0.92 |
| staging-integration | 0 | 23 | principal | 113.39 |
| infra-static | 0 | 0 | principal | 2.96 |
| staging-static | 0 | 0 | principal | 2.21 |
| operations-unit | 0 | 30 | principal | 0.65 |
| operations-integration | 0 | 40 | principal | 30.05 |
| operations-static | 0 | 0 | principal | 2.19 |
| sync-client | 0 | 51 | principal | 2.67 |
| sync-postgres-browser | 0 | 19 | principal | 25.52 |
| sync-static | 0 | 0 | principal | 9.83 |
| storage-postgres-browser | 0 | 47 | principal | 22.66 |
| storage-static | 0 | 0 | principal | 2.85 |
| conflicts-postgres-browser | 0 | 56 | principal | 24.23 |
| conflicts-static | 0 | 0 | principal | 7.68 |
| offline-sw | 0 | 3 | principal | 0.65 |
| offline-postgres-browser | 0 | 31 | principal | 222.25 |
| offline-static | 0 | 0 | principal | 7.57 |
| monorepo-tests | 0 | 12 | principal | 2.00 |
| typescript-tests | 0 | 12 | principal | 3.49 |
| typescript-development-entry | 0 | 1 | principal | 7.22 |
| shared-contracts-and-http-consumers | 0 | 56 | principal | 3.56 |
| client-import-response-contracts | 0 | 3 | principal | 2.29 |
| phase44-real-typescript-consumers | 0 | 13 | principal | 9.13 |
| phase52-training-engine | 0 | 37 | principal | 5.52 |
| phase52-performance-domain | 0 | 28 | principal | 5.01 |
| phase52-performance-http-postgres | 0 | 4 | principal | 5.93 |
| phase53-smart-domain-and-react | 0 | 25 | principal | 7.43 |
| phase53-smart-http-postgres | 0 | 4 | principal | 6.06 |
| shared-workspace-contracts | 0 | 34 | repetición | 0.69 |
| tooling-lint | 0 | 0 | principal | 1.50 |
| client-rehearsal-build | 0 | 0 | principal | 14.32 |
| all-workspace-unit-tests | 0 | 365 | repetición | 4.91 |
| client-standalone-ci | 0 | 0 | principal | 17.79 |
| client-standalone-build | 0 | 0 | principal | 12.85 |
| server-standalone-ci | 0 | 0 | principal | 12.69 |
| server-standalone-unit | 0 | 104 | repetición | 0.66 |
| server-standalone-commonjs | 0 | 0 | principal | 0.10 |
| server-standalone-training | 0 | 0 | principal | 0.10 |
| production-prune | 0 | 0 | principal | 1.10 |
| production-deps-smoke | 0 | 48 | repetición | 9.41 |

## Diagnósticos previos y harness

Se retienen **4 comandos preflight con salida1**.
Compilación inicial: una variable candidata readonly no admitía el fallback pool;
se corrigió su tipo explícito, sin cast. Primeros2ensayos Edge asumían autofill
bilateral; la referencia y diagnóstico mostraron la abstención descrita y el token
sintético inicial no permitía asociar propietario al borrador. Se completa esa
fixture y se verifica el camino unilateral real, sin cambiar aserciones históricas.
Otro ensayo CDP retornaba un nodo DOM como JSON: falló serialización; el predicado
ahora retorna boolean. Export explícito del componente nuevo corrige su error
de FastRefresh, sin silenciar lint.

El primer helper de edición falló al importar una ruta C: sin file URL. Se continuó
solo la parte aún no ejecutada para evitar duplicar cambios. Los comandos/manual
diagnostics y logs se conservan en [desarrollo](phase53/development-checks.json).
La primera auditoría de archivo final también terminó con salida1 porque comparó
evidencia de integración regenerada (IDs/puertos/fechas de otro ensayo) como si fuera
código. Se corrigió el alcance de esa comparación:388archivos de código/config
idénticos, más el lock aislado con mismoJSON; los476hashes de fuentes originales
se verifican por separado. No cambió código ni aserciones de tests. El archivo
parcial se conserva fuera de Temp como diagnóstico, y el final se identifica abajo.
El helper del informe falló inicialmente por delimitadores Markdown sin escapar;
la comprobación documental siguiente encontró que todavía no existía el informe.
Se corrigió el helper y se repitió la comprobación con salida0. Estos diagnósticos
también están registrados; no cambiaron fuentes ni el resultado de npm test.
Ninguna de esas corridas se declara matriz integral verde. La corrida integral
final es independiente y tiene salida0. No se amplían timeouts ni se toca el harness
offline recibido de5.2;31/31offline pasan otra vez en esta matriz.

## Archivos modificados y nuevos

Modificados respecto al estado recibido:

- `client/src/domain/training.ts`
- `client/src/generated/cloudinary.js`
- `client/src/generated/training.js`
- `client/src/utils/smartLoading.js`
- `docs/TRAINING-ENGINE-AUDIT.md`
- `docs/TRAINING-ENGINE-CASES.md`
- `docs/TRAINING-ENGINE-INVENTORY.md`
- `docs/TRAINING-PERFORMANCE.md`
- `docs/TYPESCRIPT.md`
- `package.json`
- `packages/shared/src/index.ts`
- `scripts/check-tooling.mjs`
- `scripts/verify-monorepo.mjs`
- `server/src/domain/training.ts`
- `server/src/generated/errors.cjs`
- `server/src/generated/training.cjs`
- `server/src/logic.js`

Nuevos de código/fixtures/documentación:

- `client/test/phase53-harness.html`
- `client/test/phase53-harness.jsx`
- `docs/TRAINING-SMART-LOADING.md`
- `packages/shared/src/domain/training/smartLoading.ts`
- `packages/shared/test/fixtures/smartLoading.ts`
- `scripts/fixtures/phase53/golden.json`
- `scripts/fixtures/phase53/index.reference.txt`
- `scripts/fixtures/phase53/logic.reference.txt`
- `scripts/fixtures/phase53/smartLoading.js`
- `scripts/fixtures/phase53/Workout.reference.txt`
- `scripts/test/smart-loading.test.mjs`
- `server/test/run-smart-loading-integration.mjs`
- `server/test/smart-loading.integration.test.js`

Informe y JSON/raw de auditoría se contabilizan aparte. Se verifican
**476 hashes fuente** tras la matriz;
**388 archivos copiados** coinciden byte a byte. Una excepción
aislada es server/package-lock.json reindentado por npm prune, con JSON/grafo de
dependencias exactamente igual. Los3locks del repositorio permanecen idénticos.
Sin archivos recibidos borrados y sin cambios staged.

[Evidencia integral](phase53/phase53-evidence.json) ·
[Checks/archivos/mediciones](phase53/final-checks.json).
Archivo durable fuera de Temp: C:/Users/guerr/.codex/artifacts/nexlift-phase53-final-44fd5c04-5769-432b-8a06-acc6c093e5ed, con fuentes finales,
logs completos, evidencia y ensayos fallidos. El respaldo recibido permanece.

## Preparación siguiente

Para5.4 quedan fixtures y políticas tipadas; los asuntos de contexto PWA/Atajo,
orden, vacíos bilaterales, cargas pequeñas, fechas/volumen/PDF/e1RM requieren
decisiones explícitas antes de cambiar resultados. No se inicia esa fase.

La [clasificación documental para Coach](../../../docs/TRAINING-SMART-LOADING.md)
distingue A datos existentes (historia/esfuerzo/fase),B derivables (respuesta a
incrementos/calidad/adherencia),C datos nuevos (sueño/dolor/recuperación/equipo)
yD hipótesis deportivas que necesitan evaluación. Sin reglas de carga nuevas,
personalización o predicción fisiológica implementadas.

Producción intacta, baseline **PROVISIONAL**, nueva sync deshabilitada en producción.
Sin migraciones persistentes, commits ni despliegues.
