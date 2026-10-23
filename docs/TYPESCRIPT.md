> Cierre de Fase 5 (5.4–5.5): [políticas, correcciones e integración vigentes](TRAINING-ANALYSIS.md).
> El contenido de fases anteriores se conserva como referencia histórica.

> Fase 5.3: [Smart Loading compartido, reglas y consumidores actuales](TRAINING-SMART-LOADING.md).
> Las ubicaciones y limitaciones de fases anteriores se conservan debajo como referencia histórica.

# TypeScript incremental — Fase 4.2

> Fase 5.2: esfuerzo contextual y selección pura de PR en shared, entradas
> `domain/training.ts` y los mismos **11** artefactos reproducibles. Se añaden
> tipos readonly con unidades documentadas y ocho diagnósticos negativos en
> `packages/shared/test/fixtures/performance.ts`; strict y contratos conservados.
> [Semánticas y consumidores](TRAINING-PERFORMANCE.md).

> Fase 4.4: módulos funcionales adicionales, TSX, declaraciones cliente y
> estabilización de Edge se documentan al final. Las limitaciones históricas
> se conservan como contexto; consultar el informe 4.4 para su estado.

> Actualización Fase 4.3: contratos runtime compartidos descritos al final de esta
> guía y en [PHASE-4.3](../server/audit/contracts/PHASE-4.3.md). Las secciones 4.2
> siguientes documentan el punto de partida; shared ya valida fronteras HTTP.

El backend real es **ESM**, no CommonJS: se conserva `server/package.json` con
`type: module`, Express, sus imports y `start`. Node 24.22.0/npm 11.19.1,
TypeScript 5.9.3, React 19.2.3, Vite 7.3.6 y Prisma CLI/Client 6.19.3.
No se activan baseline, migraciones persistentes ni flags productivas.

## Código migrado

- `client/src/utils/cloudinary.ts`: URLs de miniatura/detalle, parámetros,
  opciones y retorno explícitos. Lo consumen BodyTracking y Profile mediante la
  entrada JS anterior, sin cambios de JSX ni representación visual.
- `server/src/operations/errors.ts`: clasificación pura de fallos transitorios,
  consumida por autenticación y operaciones. Recibe `unknown`; conserva códigos,
  causa hasta cuatro niveles, metadatos Prisma, accesos heredados y coerciones.
- `packages/shared/src/index.ts`: `isString`, su tipo público `StringGuard` y el
  probe anterior. El predicado se utiliza en ambos módulos migrados. No afirma
  validar respuestas HTTP, objetos Prisma ni contratos completos de API.

Los `.js` anteriores son fachadas, no implementaciones duplicadas. La lógica de
entrenamiento, fechas, RIR/RPE, PR, UUID/versiones/operationId, Dexie, journal,
sincronización y Service Worker permanece JavaScript y no se modifica.

## Configuración

Se reutilizan `configs/tsconfig.{base,node,vite}.json` de 4.1:

| Configuración | Resolución / emisión | Alcance |
| --- | --- | --- |
| Base | ES2022, strict, isolatedModules, noEmit | Solo módulos incorporados |
| Cliente | ESNext/Bundler, react-jsx, DOM, vite/client | `src/**/*.ts(x)` y pruebas de tipos |
| Servidor | NodeNext/NodeNext, ES2022 sin DOM ni globals Node | `src/**/*.ts/cts` y pruebas de tipos |
| Shared | NodeNext/NodeNext, ES2022 sin DOM/Node | Fuente TS y pruebas de tipos |
| Builds server/shared | noEmit false, noEmitOnError, declaraciones/maps | Solo fuente, excluye pruebas |

`allowJs: true, checkJs: false` permite convivir con JS; no comprueba de golpe
la aplicación antigua. Todos los `.ts/.tsx/.cts` incorporados entran por patrones,
no por una lista que pueda ocultarlos. Los tests inspeccionan que cada programa
contenga sus fuentes. No se usan aliases de editor ni declaraciones globales
ficticias. No se añaden tipos Node/Express porque estas funciones puras no usan
sus APIs; los tipos React 19 existentes siguen disponibles cuando llegue TSX.

## Shared y compatibilidad de ejecución

`tsc` emite **ESM** en `packages/shared/dist/`, con `.d.ts`, mapas y fuentes
embebidas. `main`, `types` y `exports` apuntan a esos archivos reales. La importación
ESM y `require` se ejecutan realmente en Node 24.22.0: este runtime admite require
de ESM síncrono. No se declara que ese require funcione en Node 20 ni se produce
una segunda distribución del paquete sin necesidad.

La raíz declara shared como dependencia de **build**. Las fuentes migradas
importan su paquete real durante compilación, no una copia de la función.
`scripts/build-typescript.mjs` usa tsc y el Vite ya instalado para emitir bundles
pequeños, autocontenidos y sin imports externos:

```text
shared/src/index.ts -> shared/dist/index.js + index.d.ts + maps
cloudinary.ts + shared -> client/src/generated/cloudinary.js (ESM)
errors.ts + shared -> server/src/generated/errors.cjs (CommonJS)
server/src/**/*.ts -> server/build/ (ESM + declaraciones + mapas intermedios)
```

Las fachadas JS conservan imports de los consumidores anteriores. El CJS generado
permite require estándar y su export nombrado es consumido por el servidor ESM.
Los artefactos `src/generated` se entregan junto al código intencionalmente:
Docker operativo, copias independientes y snapshots anteriores no necesitan
TypeScript ni paquetes fuera de client/server para ejecutarlos. Son salidas
generadas, separadas de las implementaciones TS; **no editarlas manualmente**.
`check:generated` recompila y compara bytes; una discrepancia falla. Dist/build
intermedios se ignoran en Git y en las copias limpias. Los mapas de los artefactos
son relativos y contienen únicamente estas fuentes puras.

El coste transitorio es conservar artefactos reproducibles junto a fuente.
Se evita introducir una dependencia runtime entre workspaces que rompería el
Dockerfile operativo y los snapshots existentes. Si después se adopta shared
como dependencia runtime externa, habrá que adaptar manifests, locks, runtime y
copias aisladas juntos; no basta con que el editor resuelva un import.

## Comandos

Con Node/npm fijados y desde raíz:

```powershell
npm ci
npm run build:typed
npm run db:generate
npm run typecheck
npm run typecheck -w client
npm run typecheck -w nexlift-server
npm run typecheck -w packages/shared
npm run check:generated
npm run check:shared
npm run check:bundle
npm run lint:typescript
npm run lint:tooling
npm run test:typescript
npm run test:typescript:dev -w nexlift-server
npm run build
npm test
```

Los typechecks son tsc/noEmit independientes de Vite. Shared debe compilarse
antes de sus consumidores; `typecheck` raíz prepara sus declaraciones. Un `npm ci`
no ejecuta builds automáticamente (`ignore-scripts=true`). Los typechecks de un
workspace se usan después de esa preparación, con las herramientas de la raíz.

`build:client` y `build:server` raíz regeneran el artefacto correspondiente.
`npm run build -w nexlift-server` compila y comprueba sintaxis JS;
`npm run build -w client` conserva Vite independiente sobre los artefactos
entregados. `dev:client` y `dev:server` raíz compilan primero y luego conservan los
comandos dev anteriores. Tras editar TS durante una sesión dev, ejecutar
`npm run build:typed`: no se añade todavía un segundo supervisor de procesos.
`start` servidor permanece intacto y no necesita un compilador en runtime.

No arrancar contra `.env` operativo para verificar. El test de desarrollo crea
un clúster nuevo con identidad comprobada, arranca el **startServer real** en
NODE_ENV=development/127.0.0.1 y con mapas, bloquea proveedores y omite dotenv
mediante el mecanismo de ensayo existente. Comprueba JWT, caída/recuperación
PostgreSQL y el 503 del clasificador migrado. No ensaya el watcher interactivo.

## Pruebas y lint

Se conservan las 1,019 anteriores; trece nuevas cubren equivalencia exacta,
coerciones y guardas, import ESM/require, artefactos, consumidores y el arranque
descrito. Las tres pruebas de compilador retiran en memoria `@ts-expect-error` de
fixtures controlados y exigen exactamente 6/4/3 errores de cliente/servidor/shared.
Los mismos fixtures deben pasar normalmente: una expectativa obsoleta también
falla por tsc. Los 13 diagnósticos son aserciones dentro de esas tres pruebas,
no trece pruebas únicas adicionales. Los bucles de caracterización tampoco
inflan el conteo. La matriz final prevista es **1,032 únicas**, con smoke/repeticiones
separados; consultar la evidencia de ejecución antes de declararla aprobada.

ESLint TypeScript 8.72.0 se aplica solo a las fuentes TS migradas, con recommended,
prohibición de any y retornos explícitos. ESLint 9.39.2 conserva la versión de la
herramienta cliente. El lint JS global mantiene su alcance y deuda; solo ignora
el nuevo directorio generado, cuya fuente TS se comprueba por separado. No se
relajan reglas antiguas. Los locks cliente/servidor mantienen sus grafos exactos;
el root incorpora las herramientas y conserva los registros nested anteriores.

## Docker y siguiente fase

Dockerfile operativo intacto. El de ensayo prepara shared/configs, compila módulos
y copia el CJS generado del build al runtime. La API podada no requiere shared,
Vite, tsc ni ESLint; Node 24/Prisma 6.19.3 y el release gate se conservan. No se
ejecuta el job de migración aquí. Sin Docker CLI no se certifican imágenes Linux,
OpenSSL, permisos, señales ni despliegue EasyPanel por una prueba Windows.

La Fase 4.3 podrá diseñar validaciones API reales y seleccionar otros módulos JS,
con sus pruebas y límites. No se han creado ni alterado esos contratos aquí.
Frontend/backend permanecen mayoritariamente JavaScript. Baseline PROVISIONAL,
sin producción, migraciones persistentes, commits o despliegues.

Referencias primarias: [resolución y formatos NodeNext](https://www.typescriptlang.org/docs/handbook/modules/reference),
[allowJs/checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html).

## Contratos compartidos — Fase 4.3

`packages/shared/src/contracts/` contiene operaciones discriminadas por los cinco
`kind` existentes, series, sesiones completas/proyectadas, cambios por SetLog.id,
resoluciones, comprobantes, capacidades, importación y errores HTTP. Las entradas
runtime reciben `unknown`. `validation/` contiene primitivas y errores con rutas,
sin copiar valores rechazados. No hay dependencias nuevas ni imports de React,
Prisma, Express, Dexie, Node o navegador en shared.

La normalización HTTP de operaciones pasa a `parseWorkoutOperation`. Recibe el
`sanitizeSets` y el helper CDMX existentes mediante un contexto explícito; no se
trasladan ni duplican las reglas deportivas de `logic.js`. El adaptador JS conserva
OperationError, status/código, canonicalJSON/requestHash/sessionVersion y las
transacciones. La conversión de UUID/instante/defaults se hace únicamente donde
ya ocurría. Los tipos separan `OperationRequest` de `CanonicalOperation` (con
performedDay interno). Nunca se valida reescribiendo un payload ya encolado.

`normalizeImportedExercise` y RoutineValidationError se trasladan de 1.4 a shared;
el adaptador servidor conserva normalización de días, inferencia weekday,
duplicados, edición parcial, autorización y persistencia. El cliente manda el
JSON original con sus alias y valida la respuesta normalizada. Sigue enviando
alias incompatibles para recibir el error exacto de campo del servidor. Los
extras de entrada de importación se conservan como procedencia; la proyección a
campos persistibles es explícita y mantiene exactamente la anterior de 1.4.

`client/src/services/contracts.ts` y `server/src/contracts.ts` consumen el paquete
real durante el build existente. Generan `client/src/generated/contracts.js` y
`server/src/generated/contracts.cjs`, sin dependencias externas, con mapas
relativos. El servidor sigue ESM; el CJS es un artefacto puntual. No existe una
segunda implementación CJS ni se editan a mano los generados. `check:generated`
comprueba ahora cuatro artefactos. Instalaciones separadas siguen usando esos
artefactos entregados. Docker operativo no cambia.

El cliente comprueba estructura antes de verificar dueño, UUID, hash, contenido,
instante, versión y decisión contra el sobre local. Solo entonces se confirma
en la transacción Dexie anterior. Una respuesta incompatible mantiene el sobre
en blocked_incompatible, disponible para revisión/exportación. No hay fallback.
`readSessionResponse` admite proyecciones históricas con campos opcionales;
`WorkoutLog`/`isWorkoutLog` describen la fotografía completa. `verifySnapshot`
mantiene además dueño, IDs únicos, relación de series y hash de versión. Un tipo
compartido no demuestra autorización ni que una versión siga vigente en SQL.

Los validadores de respuesta devuelven el objeto original y admiten extensiones;
no quitan campos, convierten números ni aplican defaults. Finite/enum/UUID/ISO,
null/undefined, cero y convenciones rpe=10-RIR se comprueban en el límite adecuado.
Los Atajos legacy conservan su normalizador y su interpretación distinta de rpe.
HTTP 401/403/409/400/404/422/429/5xx conserva su clasificación y estado local.

`npm run test:contracts` ejecuta 56 pruebas nuevas (32 shared y 24 de adaptación,
compatibilidad, cliente, tipos y Express). `npm run test:contracts -w client`
ejecuta tres adicionales sobre importación en el cliente API real, con HTTP local.
`npm test` conserva las 1,032 anteriores y añade esos 59 casos; los smoke y
ejecuciones repetidas no incrementan el total.
Consultar el informe/evidencia para el resultado real y cualquier diagnóstico.
No se revalida en render ni se recorre el journal completo: la validación nueva
ocurre al recibir HTTP. El ensayo de 5,000 recibos es informativo; la suite
Edge/IndexedDB anterior comprueba además colas grandes reales y su integridad.

Se mantiene strict, TypeScript 5.9.3 y el mismo lock. No se inicia 4.4, se activa
producción ni se ejecutan migraciones persistentes. Baseline **PROVISIONAL**.

## Migración funcional — Fase 4.4

Se migran implementaciones reales manteniendo las entradas anteriores:

- `WeekdayPicker.tsx`: props Weekday/null/undefined, callback nullable y evento
  MouseEventHandler explícitos. Es un componente controlado sin estado propio;
  JSX Import/EditRoutine conserva su estado, avisos y navegación. La fachada JSX
  reexporta TSX y Vite lo transforma directamente; no existe una segunda UI.
- `routinePayload.ts`: modelos de formulario/plantilla distintos del DTO
  normalizado. Reutiliza RoutineExerciseInput/RoutineDayInput como tipos;
  preserva strings numéricos, alias, extensiones y ceros sin validarlos en UI.
- `routineResponse.ts`: recibe json():Promise<unknown> y delega al validador
  compartido existente antes de devolver RoutineImportResponse. API real lo usa.
- `operationLabels.ts`: mismo diccionario de presentación, con unión de claves.
  operationSync conserva su export y máquina de estados; no se cambian decisiones.
- Backend ESM: `operationContract.ts` y `routineImportContract.ts` contienen las
  implementaciones estrictas y exportan a través de las fachadas JS anteriores.
  Los hashes siguen literalmente en `operationHash.js`; no se migran algoritmos.
  Los helpers de lógica/de fechas permanecen JS y tienen declaraciones estrechas.
  IDs de procedencia de edición siguen unknown hasta las verificaciones antiguas.

El builder existente tsc+Vite emite nueve artefactos de compatibilidad y dos
árboles de declaraciones en client/build y server/build, además de shared/dist.
Los dos adaptadores nuevos del servidor usan puertos locales explícitos:
contracts.cjs compartido, logic.js y operationHash.js. Esto mantiene identidad de
clases de error con sessionPatch/JS y evita incluir lógica deportiva en bundles.
Node 24 ejecuta estos puertos ESM síncronos; los consumidores Express siguen ESM.
Los otros artefactos continúan autocontenidos. El frontend nunca importa backend.

Los d.ts manuales solo describen funciones JS existentes; se copian junto a las
salidas d.ts para que sus referencias resuelvan. Maps relativos y fuentes
embebidas se comprueban. check:generated reconstruye los nueve artefactos y exige
igualdad de bytes. Ninguno se edita manualmente. Se comprueban los TSX con strict
y ESLint TS, sin excluirlos del patrón. client/build contiene emisión y se ignora
igual que dist/generated; src TS/TSX permanece comprobado.

Comandos adicionales: `npm run test:phase44`. El comando `npm test` ejecuta primero
las 1,091 únicas anteriores y luego los casos nuevos de 4.4, sin contar las
repeticiones. Las diez expresiones inválidas del fixture controlado prueban props,
callback, unknown HTTP, propiedad ausente, null, IDs, estado y parámetros backend;
constituyen una prueba de compilador, no diez pruebas únicas.

La generación prepara todos los bundles antes de publicar artefactos y reemplaza
cada archivo de manera atómica para evitar lecturas parciales. No ofrece una
transacción multiartefacto ni hot reload de todo el backend ESM. Se conserva el
flujo explícito `npm run build:typed` tras editar TS, seguido de reiniciar dev si
hay módulos backend cargados. No se añade watch en esta fase: un watcher que solo
regenere mantendría procesos sirviendo versiones previas ante errores; garantizar
lo contrario requiere supervisar/parar/reiniciar ambos procesos y probar su ciclo
completo. Se priorizan el check de obsolescencia y el arranque compilado actual.
Los comandos start/dev anteriores permanecen disponibles y start operativo no
incorpora TypeScript ni un supervisor nuevo.

El harness de Edge usa perfiles dentro de su raíz desechable y verifica cierre
por endpoint/proceso propios y arranque por UUID coincidente en archivo/HTTP.
Permite el mismo puerto numérico tras reiniciar, retira solo el archivo de
readiness propio, desactiva background mode y cierra únicamente el navegador con
el UUID esperado. No se aumentan timeouts generales ni se omiten aserciones.
El fallo UI de borrador y el EBUSY de limpieza históricos se investigan por
separado; no se atribuyen a esta carrera de puerto sin reproducción.

Los Dockerfiles/contextos permanecen iguales: el ensayo ya incluye compilador,
fuentes cliente/servidor y copia del directorio generated al runtime. El backend
podado usa JS/CJS local sin shared/compilador en runtime. Las instalaciones
separadas usan artefactos entregados; recompilar TS requiere el monorepo. El
build Vite separado puede advertir del tsconfig padre ausente. Docker/Linux y
Safari/iOS físico requieren verificación propia; no los certifica Windows.

Vite recibe tsconfigRaw como JSON string con las opciones de emisión
ES2022/react-jsx/useDefineForClassFields/verbatimModuleSyntax. El test controlado
compara esas opciones con el proyecto tsc estricto, que sigue sin cambios. Esto
solo describe transpilación: Vite nunca fue el typechecker. La forma string evita
que Vite 7 resuelva el tsconfig padre antes de transformar TSX en una instalación
cliente separada; la forma object todavía intentaba fusionarlo y fallaba. El
primer TSX reveló ese error que antes era solo una advertencia de configuración.
Puede quedar la advertencia histórica al empaquetar vite.config; el build TSX
independiente debe terminar con salida 0 y se prueba con instalación nueva.

Resultados y limitaciones: [PHASE-4.4](../server/audit/typescript/PHASE-4.4.md).
Inventario de lectura para la siguiente fase: [motor de entrenamiento](TRAINING-ENGINE-INVENTORY.md).
No se inicia Fase 5. Sin producción, migraciones persistentes, commits ni despliegues.

## Primera función de dominio — Fase 5.1

`packages/shared/src/domain/training/performance.ts` exporta cappedEpley1RM.
Conserva literalmente la aritmética/coerción del epley1RM de ambos exerciseName.js;
las entradas JS públicas siguen funcionando y comparten esa fuente. Unknown→number
es deliberado para preservar la coerción histórica, no sustituye los DTO validados.
PR, strength, PDF y Smart tienen políticas distintas y conservan sus algoritmos.

Las entradas client/server src/domain/training.ts importan el paquete real y se
empaquetan con el builder existente. Ahora hay **once artefactos reproducibles**;
los dos nuevos son ESM cliente/CJS backend autocontenidos, sin dependencia runtime
de shared. Backend ESM e instalaciones independientes se conservan. Declaraciones
en shared/dist y client/server build; el mapa del bundle apunta al ESM emitido y
su mapa tsc a la fuente TS original. Ambos saltos se verifican. No editar generated.

`npm run test:training` ejecuta29 caracterizaciones y8 pruebas de extracción,
propiedades/imports/tipos/React Edge. `npm test` conserva las1,104 anteriores y
añade37; exige runtime estable fuera de Temp antes de instalar. Las cuatro
expresiones inválidas de training.ts constituyen un solo test de compilador.
La fixture vive en `packages/shared/test/fixtures/training.ts` y se incluye
explícitamente en el typecheck estricto de shared. El test nuevo retira solo sus
cuatro expectativas. Se evita así interferir con la prueba histórica que retira
todas las expectativas bajo type-tests/ y exige sus tres errores originales;
esa prueba y su aserción se conservan intactas.
No se añaden dependencias, escrituras, variantes HTTP ni cambios de hashes.
Watch/backend y límites de despliegue anteriores siguen vigentes.

[Auditoría y arquitectura](TRAINING-ENGINE-AUDIT.md),
[informe de ejecución 5.1](../server/audit/training-engine/PHASE-5.1.md).
La frase «No se inicia Fase5» de la sección4.4 es histórica: este apartado inicia
únicamente5.1. No se avanza a5.2 ni se implementa Coach.

## Frontend — Fase 8

Las fuentes app/remote.ts, app/useRemoteRead.ts y features/remoteViews.ts definen las lecturas remotas de Query v5 (5.104.5, peer React 18/19), generaciones por cuenta, guardas de respuestas tardías y decodificación de las vistas seleccionadas. La caché vive sólo en RAM; las mutations no tienen reintentos ni persistencia. RemoteProvider observa comprobantes ya verificados sin escribir al journal. El protocolo y Dexie conservan la captura, UUID, versiones, hash y resolución.

Workout usa SetCard.tsx, RirDialog.tsx y useRestTimer.ts; EditSession usa SessionSetRow.tsx. ConflictComparison.tsx presenta diferencias sin resolverlas automáticamente. useDialogFocus.ts controla teclado y foco; ConnectionStatus.tsx y RemoteStatus.tsx explican conexión y datos remotos. Los tipos Portal.d.ts y AuthContext.d.ts describen puertos JS reales. No hay casts a any ni cambios del motor deportivo.

Inicio, Rutinas/detalle/bloques, Progreso/series históricas de objetivos, objetivos y cuerpo consumen las consultas. Los formularios de sesión conservan su carga y protección de borradores anteriores. El perfil autenticado usa fetchQuery con staleTime 0 para verificar el token; una respuesta cacheada no reanuda la cola. Los errores GET conservan status; 401 no se confunde con 503.

Comandos: npm run test:frontend, npm run check:typescript, npm run lint:tooling y npm test. La matriz añade las pruebas de Fase 8 después de las 1,355 históricas, sin contar repeticiones. La comprobación de conservación de Workout ahora exige los cuerpos deportivos y la persistencia exactos, pues esta fase autoriza extraer su UI; las caracterizaciones y la prueba Edge del recorrido siguen ejecutándose. El lint compara cada hallazgo contra la evidencia 27/3, permitiendo eliminar deuda sin admitir reglas/hallazgos nuevos. Resultado real y límites en server/audit/frontend/PHASE-8-COMPLETE.md.

El ciclo de vida del SW usa app/serviceWorkerLifecycle.ts: primera toma de control sin recarga; actualizaciones posteriores conservan una recarga única. Evita abandonar una lease durante el arranque inicial. La regresión se reprodujo con dos procesos Edge/Fastify y se verificó con las 31 pruebas offline, sin cambiar el motor ni su duración de lease.

La primera toma de control también conserva los assets iniciales ya cargados mediante CACHE_PUBLIC_ASSETS: sólo JS/CSS e iconos públicos del mismo origen, sin query/credenciales, omitiendo cookies y rechazando HTML/redirects. La prueba nueva cierra Edge y reabre el cliente compilado con TODO el origen inaccesible. La política API/Authorization, scope, Dexie y comprobantes permanece separada.
