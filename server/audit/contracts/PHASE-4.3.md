# NexLift v4.0 — Fase 4.3

Fecha: 20 de octubre de 2026, America/Mexico_City.
Estado: **COMPLETADO en desarrollo, verificado por checkpoints**.
**1,091 pruebas únicas aprobadas = 1,032 anteriores + 59 nuevas**.
La utilidad final terminó con **salida 0** el 20 de octubre de 2026, 11:14 CDMX.
Referencia recibida: **1,032 pruebas únicas** y 48 smoke repetidos.
Baseline Prisma y migraciones: **PROVISIONALES**. Sin acceso a producción,
migraciones persistentes, commits, despliegues ni avance a 4.4.

## Estado recibido y conservación

Repositorio real: `C:/Users/guerr/OneDrive/Escritorio/NexLift`. El cwd de la app
continúa siendo una carpeta distinta. Se inspeccionaron status/diff sin reset,
arquitectura/API/modelo, PHASE-3.5/4.1/4.2, TYPESCRIPT, fuentes, manifests/locks,
configuraciones, generados y pruebas de caracterización. Backend **ESM**.
No existe AGENTS.md aplicable. Se respetan también las restricciones de CLAUDE.md.

Antes de editar se archivaron **399 archivos** y sus SHA-256, status y diff en
`C:/Users/guerr/.codex/artifacts/nexlift-phase43-received-1bb1c88b-a008-45aa-96b2-4d3fe7b20da1`.
No se leyó el .env operativo. Las 64 pruebas iniciales de caracterización/TS
aprobaron. Se conservan fixtures byte a byte de los cuatro módulos anteriores
en scripts/fixtures/phase43; los dos módulos de soporte reexportan las funciones
reales de lógica/fechas. Las fixtures no son implementaciones de producción.

Conservación actual: **381/399 archivos recibidos idénticos**, 18 cambios revisados,
cero eliminaciones. Los 41 archivos de pruebas recibidos, cuatro inputs Prisma,
tres locks, algoritmos, auth, SQL, Dexie, SW y Dockerfiles permanecen idénticos.
workoutOperations.js solo cambia import y uso del catálogo de kinds compartido;
se comprueba que al retirar esas dos sustituciones coincide con el anterior.
[Hashes y lista completa de cambios](preservation-evidence.json).

## Inventario contrastado con el código

| Frontera | Campos, defaults y compatibilidad | Autoridad contextual |
| --- | --- | --- |
| POST /api/v1/workout-operations | operationId UUID, kind de cinco variantes, source pwa/shortcut, performedAt ISO con offset/ms; request rechaza extras con valor definido | Auth obtiene propietario; TX Serializable/locks/PR/comprobante |
| workout.create | exerciseId no vacío/sin espacios; sets 1–50; notes ausente→null; al menos una serie con trabajo | Propiedad y existencia del ejercicio |
| appendSet / replaceSets | logId + expectedVersion sha256 minúsculo; append exige una serie; replace sets o changes, excluyentes | Versión y propiedad leídas bajo lock SQL |
| workout.delete | logId/version; resolution opcional; tombstone confirmado | Eliminación, PR y comprobante en misma TX |
| rest.create | note ausente→Día de descanso; null inválido; instante original | userId autenticado |
| GET comprobante/:operationId | UUID normalizado como antes; protocolo1/ownerId/requestHash/replayed/operation/result | Consulta limitada por cuenta; 404 OPERATION_NOT_FOUND permite POST |
| GET sesión/:logId | workoutLog + sessionVersion; sesión completa real; consumidores históricos admiten proyección con campos opcionales | Propiedad bajo TX, hash versión calculado en servidor |
| Conflictos | session notes/date; updates/additions/removals/order por IDs estables; máximo50 por colección; sin repetidos/solapamientos | IDs existentes, orden completo, CAS/versión y nueva decisión durable |
| resolution | conflictId=originalOperationId UUID minúsculo, decision local/manual; operación nueva | Original preservado; autoría y CAS en repositorio, versión en SQL |
| Series | weight/reps numéricos finitos; rpe histórico 10-RIR; rir0–4 alternativo coherente; completed ausente→true; lados ausentes→null | sanitizeSets existente exige esfuerzo/trabajo sin cambiar fórmulas |
| Importación | targetSets/sets→3, targetReps/reps→8-12, restSeconds/rest→null; cero descanso; muscleGroup/muscle; unilateral false, note null, order índice; alias normalizados iguales o error | Proyección persistible, deduplicación, ownership, edición e IDs en servidor |
| Días | dayName/name; weekday0=domingo, null explícito; ausente inferido como antes; descanso no admite ejercicios | Normalizador de días1.4 y lógica CDMX existentes |
| Errores | 400/401/403/404/409/422/429/500/503; error/code/retryable/outcome opcionales según endpoint histórico | Auth revocación/roles/DB siguen siendo funciones ejecutables, no interfaces |
| Atajos legacy | exerciseId/peso/reps y rpe/rir con interpretación histórica propia y fallback existente | No se sustituye sanitizeShortcutLogSet ni se exige UUID al endpoint viejo |

No se exportan modelos Prisma, User, credenciales, JWT, SQL ni filas Dexie. Los
tipos HTTP no son modelos de almacenamiento ni prueban existencia/propiedad.
API v3 es referencia histórica; fuentes y pruebas actuales prevalecen.

## Archivos entregados

18 archivos recibidos modificados, conservando sus cambios previos:

- Cliente: package.json, services/{api,operationProtocol,operationSync,sessionChanges}.js
  y generated/cloudinary.js (solo cambia su mapa al ampliar el index TS de shared).
- Shared: package.json y src/index.ts.
- Servidor: services/{operationContract,sessionPatch,routineImportContract,workoutOperations}.js
  y generated/errors.cjs (misma clasificación, mapa actualizado).
- Raíz: package.json, docs/TYPESCRIPT.md,
  scripts/{build-typescript,check-tooling,verify-monorepo}.mjs.

24 archivos fuente/ensayo nuevos: diez TS de contratos/adaptadores, dos artefactos
generados, dos archivos de pruebas shared, dos fixtures/tests raíz, seis fixtures
de caracterización/soporte y dos de ensayo HTTP cliente. Las evidencias e informe
se entregan por separado en este directorio. [Inventario exacto](files-evidence.json).

## Arquitectura y validadores

Shared agrega validation/{primitives,results}.ts y contracts/{workoutOperations,
workoutSessions,conflicts,receipts,routines,apiErrors}.ts. Reexports en index.ts.
Entrada unknown, strict y tipos discriminados OperationRequest/WorkoutOperation/
CanonicalOperation, SetValues/SetLog/SessionSetView/WorkoutLog/SessionResponse,
SessionChanges/Resolution, comprobante/capacidad, importación y errores seguros.

Primitivas: UUID, digest, ID estable, ISO con calendario/offset/ms, ISO canónico,
números finitos, null/undefined, claves permitidas. ContractValidationError entrega
ruta/código/mensaje sin copiar el dato rechazado. validate devuelve unión
success/data o issues. El parser conserva la normalización explícita previa,
incluidos UUID minúsculo/instante UTC/defaults, únicamente antes del hash servidor.

Compatibilidad de errores: se conservan status/código y los mensajes caracterizados
para cada campo inválido. Una solicitud con varios errores simultáneos no tiene
un orden de diagnóstico público garantizado; el parser compartido puede señalar
primero otro campo, con el mismo rechazo HTTP y sin escrituras. No se promete
igualdad de todos los mensajes de combinaciones inválidas arbitrarias.

El parser shared usa el sanitizer y helper CDMX de servidor mediante contexto
tipado: no copia reglas deportivas ni inventa otro calendario. El adaptador
OperationError preserva status422 y códigos anteriores. requestHash/sessionVersion
y el canonicalJSON cliente permanecen idénticos. Los patch validators se trasladan;
la aplicación SQL de los cambios y sus checks quedan en sessionPatch.js.
El catálogo de kinds es único en shared y lo consumen la captura cliente y la
respuesta de capacidades servidor, sin duplicar las comprobaciones de capacidad.

El normalizador de ejercicios y RoutineValidationError de1.4 se trasladan de forma
controlada, con paridad de valores y mensajes. Días/inferencia weekday/duplicados/
PUT parcial permanecen en el adaptador. No aparece otro normalizador de rutinas.

Respuestas: readOperationReceipt/readSessionResponse/readRoutineImportResponse,
capacidad y errores. Verifican tipos/números/enums/fechas y conservan la referencia
y extras, sin eliminar propiedades, normalizar ni añadir defaults. Una proyección
histórica no se presenta como fotografía completa. Los campos privados no se
añaden a tipos o respuestas; la sanitización de errores DB anterior permanece.

## Integración real

Backend: parseOperation/operationId consumidos por POST/GET v1, parseChanges y
parseResolution por conflictos; importación1.4 utiliza normalizeImportedExercise
compartido en createImportRoutineHandler. Auth sigue antes de validar; un payload
inválido se rechaza antes de consultar/escribir SQL. Autorización y versión dentro
de transacción, sin activar flags productivas.

Frontend: operationProtocol verifica estructura de capacidad/acuse antes del
binding completo contra la operación local; operationSync usa clasificación HTTP
compartida. api.getWorkoutSession y verifySnapshot comprueban la respuesta; el
segundo mantiene IDs/propietario/hash. api.importRoutine envía su JSON intacto y
valida la respuesta; alias incompatibles siguen llegando al servidor con su ruta
de error exacta. No se migra JSX ni se introduce TanStack.

Un 200/201 incompatible no confirma en Dexie. El mismo ID/payload/hash/fecha se
mantiene en blocked_incompatible para revisión/exportación. El fallo de validación
no produce fallback legacy, rebase, poda o reasignación de propietario. Un 200 por
reintento usa el comprobante persistente sin nuevas escrituras. La suite anterior
comprueba casos SQL/PR, cierre/reapertura, cuota/fencing y aislamiento.

## Dependencias, build e interoperabilidad

**Cero dependencias nuevas**: se evaluaron los validadores propios existentes;
su semántica precisa/compatibilidad se expresa directamente en TS. No se añade
otra biblioteca ni cambian versiones o locks.

Entradas TS de cliente/servidor importan @nexlift/shared real. El builder existente
emite dos nuevos artefactos autocontenidos ESM/CJS con mapas relativos; shared
sigue una sola distribución ESM con declaraciones. No se edita generated a mano.
El checker reproduce ahora cuatro artefactos. El CJS puntual no convierte el
backend. Docker operativo intacto; rehearsal ya copia el directorio generado
completo. Contexto existente admite los nuevos archivos.

## Pruebas y cobertura

59 nuevas: 32 shared +24 integración/adaptadores/tipos/cliente/Express y tres
de HTTP/importación en el cliente API real. Cubren
las cinco variantes, inválidos, UUID, reintentos/hashes, ISO/imposibles/CDMX,
versiones, RIR/RPE/lados, cero/null/undefined/defaults/extras, alias/rangos/domingo,
comprobantes incompatibles, HTTP401/409/429/503 y privacidad, estado local y cinco
errores de tipos intencionados. El bucle de5,000 recibos cuenta como un caso.

Las suites anteriores aportan los escenarios exigidos restantes: commit con
respuesta perdida real y deduplicación SQL; expectedVersion obsoleta y conflictos;
PR y aislamiento; Atajos; importación HTTP/frontend; Dexie legacy y desconexión;
colas10/100/1,000/5,000 y React visible. No se suman como pruebas nuevas.
[Correspondencia de los 35 escenarios solicitados](contract-coverage.md).

Matriz aprobada: **1,091 únicas =1,032 anteriores +59 nuevas**, más48 smoke
repetidos. npm test crea copia limpia, instala/genera/build/typechecks, conserva
orden histórico y aplica SQL provisional solo en cada clúster nuevo identificado.
Se invocó el verificador directamente con Node24, equivalente a npm test. Los
intentos fallidos originales mantienen su salida1; el cierre completo fue por
checkpoints con fuente/lock verificados, no un npm test inicial enteramente verde.

| Bloque | Casos únicos aprobados |
| --- | ---: |
| Hasta 2.4 | 730 |
| Operaciones 3.1 | 70 |
| Sincronización 3.2 | 70 |
| Almacenamiento 3.3 | 47 |
| Conflictos 3.4 | 56 |
| SW 3.5 | 3 |
| Offline/carga 3.5 | 31 |
| Monorepo 4.1 | 12 |
| TypeScript 4.2 | 13 |
| Shared/adaptadores/Express 4.3 | 56 |
| Importación cliente 4.3 | 3 |
| **Total** | **1,091** |

Resultados finales:

- Typecheck strict de los tres workspaces, emisión de declaraciones, import ESM
  y require Node24 correctos. Cinco diagnósticos negativos nuevos dentro de un
  caso y los trece diagnósticos anteriores dentro de sus tres casos, sin inflar
  el conteo. 13 fuentes TS: cero hallazgos de lint.
- Build frontend predeterminado y con flags de ensayo; backend tipado/CJS y
  sintaxis de37 módulos JS; cuatro artefactos reproducibles: aprobados.
- Instalación limpia raíz, cliente separado y servidor separado: salida0.
  Cliente separado compila con la advertencia ya conocida del tsconfig padre
  ausente; reconstruir/typecheck TS completo requiere el monorepo. CJS separado
  funciona sin shared/compilador en runtime. No se certifica Docker/Linux.
- Shared desde su workspace:34 repetidos aprobados. Unitarias conjuntas365,
  servidor separado104 y smoke con dependencias productivas48: **551 repeticiones
  exitosas**, incluidas esas48, separadas de las1,091 únicas.
- Grafo navegador: **2,664 módulos**, sin backend/Prisma/builtins/privados.
  CSS **idéntico** a4.2:107,239 bytes y mismo SHA-256. No se promete identidad de
  todos los chunks JS. [Comparación](build-comparison.json).
- Lint tooling:31 archivos/cero hallazgos. Global: **27 errores y3 advertencias
  históricos, cero diagnósticos nuevos**; dos líneas se desplazan +1 por un import.
- 403 hashes de artefactos fuente comprobados al cerrar; locks idénticos después
  de instalación, builds, tests y poda. 55 controles exitosos y dos diagnósticos
  de continuación retenidos en la matriz; el primer intento de código anterior
  está registrado aparte. Ningún fallo se cuenta como éxito ni suma casos únicos.

[Matriz, comandos y403 hashes](phase43-evidence.json),
[entorno](environment-evidence.json), [conservación](preservation-evidence.json),
[integración offline/SQL/Edge](offline-integration-evidence.json),
[diagnósticos de desarrollo](development-diagnostics.json),
[cierre y archivo durable de los 57 logs](final-checks.json).

## Rendimiento

No hay validación por render ni lectura nueva de todo el journal. Los acuses se
validan al llegar por HTTP; la comparación contextual posterior ya existía.
La prueba5,000 mide solo costo incremental de validación pura y no representa
latencia de red/disco/React. El ensayo Edge/IDB completo mide las colas reales.
Sin caché insegura de payloads ni bypass de aislamiento para optimizar.

## Problemas y limitaciones

Durante desarrollo se corrigieron: una referencia booleana de validación de días
que debía permanecer al trasladar ejercicios; la distinción entre proyecciones
históricas y bases completas; ruta del comando Vitest; y globals de TextEncoder
para lint de la fixture histórica exacta. No se cambiaron casos ni aserciones
antiguas. El primer chequeo TS detectó un estrechamiento de source y un acceso
unknown dentro de closure; se resolvieron con tipos explícitos/narrowing, sin any.

La revisión detectó además que una sustitución textual no había aplicado la
validación al retorno de api.importRoutine. Se corrigió la línea concreta y se
añadieron tres pruebas mediante el API cliente real/HTTP. El primer recorrido
limpio ya iniciado usa la copia anterior y queda como diagnóstico; su resultado
no certifica la versión corregida. La matriz definitiva parte de otra copia
limpia. No se cambian fuentes dentro de una copia en ejecución ni se interrumpen
sus runners PostgreSQL de manera que impida su limpieza verificada.

Ese primer recorrido aprobó 870 casos y terminó con **exit1** en sync-static por
28 errores/3 advertencias: el import sin usar mencionado. No se cuenta como verde
ni se usa para certificar el código final. Se archivaron 32 logs y el código
realmente ensayado fuera de Temp; la matriz definitiva repite desde instalación
limpia. [Diagnóstico y hashes del intento](first-matrix-diagnostic.json).

El chequeo de lint sobre el código corregido devuelve los 27 errores/3 warnings
anteriores, sin nuevos diagnósticos. Dos líneas de api.js se desplazan +1 por el
import nuevo. Una comparación inicial que exigía líneas idénticas falló por ese
motivo; la comparación por archivo/regla/severidad/mensaje coincide y documenta
por separado ambas ubicaciones. [Resultado](lint-summary.json), [salida](lint-global.json).

La segunda matriz, sobre código corregido, aprobó un prefijo de **851** y se
detuvo con **exit 1** en sincronización: 18/19 pass y un timeout al **reabrir**
Edge en sync-browser.mjs:91, esperando que DevToolsActivePort cambiara. La primera
captura offline/React ya había pasado. No hubo un rechazo del validador en ese
fallo. El motivo preciso del puerto no se determinó; es una limitación del
arranque de ensayo, no una ejecución aprobada ni prueba de un defecto de aplicación.

Antes de continuar se contrastaron **321 archivos de código/configuración** de
la copia con la fuente: todos idénticos. Se archivaron código y logs fuera de
Temp. El prefijo se recupera de logs y salidas observadas, con duraciones **null**
explícitas. La utilidad temporal de continuación conserva comandos, aserciones,
conteos, checks de hashes/locks y guard de limpieza; usa nombres nuevos de log.
No está incorporada como bypass al npm test del repositorio.
[Equivalencia, prefijo y fallo original](checkpoint-source-equivalence.json).

El bloque completo de sincronización se repitió en **otro clúster/perfil** con
las mismas fuentes y límites: **19/19, cero omitidos/cancelados, exit 0**. Su
estático aprobó. También aprobaron almacenamiento **47/47**, conflictos **56/56**
y SW **3/3**, hasta el prefijo de **976**.

Offline aprobó luego **31/31 y exit 0**, sin EBUSY ni modificación del harness:
221,200 ms del comando. Monorepo12, TypeScript12 y arranque dev1 completaron las
**1,032 anteriores**; contratos56 e importación cliente3 completaron las **1,091**.
No se omitieron/cancelaron casos. Shared ejecutado desde su workspace aprobó34
repetidos, separados del total único. PostgreSQL final:717 sesiones,718 series,
6,405 descansos y7,122 comprobantes, cero huérfanos y reconstrucción PR coincidente.

La continuación salió después con **exit 1** en lint: el auxiliar temporal
scripts/phase43-resume.mjs tenía un import sin usar. Se conservó su fuente/log y
se movió intacto fuera de scripts en la copia desechable, que es donde corresponde
una utilidad de sesión ajena al repositorio entregado. No se modificaron fuentes,
reglas o aserciones para ocultarlo. Los mismos321 archivos volvieron a coincidir.
La utilidad final está fuera del árbol de fuentes comprobadas; tooling pasó de
nuevo:31 archivos/cero hallazgos. [Checkpoint y procedencia](final-checkpoint.json).
El cierre continuó con build de ensayo, instalaciones separadas, poda/smoke y
comparaciones de hashes/locks, todos con salida0; la utilidad final salió0.
Los archivos/temporales diagnósticos permanecen conservados, sin limpieza manual.

Persisten gates Docker/Linux/OpenSSL/EasyPanel y Safari/iOS físico, baseline
provisional, watcher TS manual, JSON local sin importador automático y mayoría
de aplicación JS. Atajos se verifican por HTTP/caracterización, no desde iPhone.
Una validación estructural no autentica ni demuestra que una versión sea actual.

## Preparación de 4.4

Entradas públicas estables y declaraciones permiten migrar consumidores pequeños
por lotes en una fase posterior. Mantener tests de paridad y transacciones;
seleccionar alcance de 4.4 mediante su prompt. No se inicia esa fase, modifica
producción ni despliega este trabajo.
