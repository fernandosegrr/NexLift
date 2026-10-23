# NexLift v4.0 — Fase 4.4

Estado: **COMPLETADO en desarrollo, verificado por checkpoints**. **1,104 pruebas
únicas aprobadas: 1,091 anteriores + 13 nuevas**. La continuación y los controles
finales terminaron con salida0. Los intentos integrales con salida1 se conservan;
no se presenta el npm test original como un único recorrido completamente verde.

## Inspección y conservación

Repositorio efectivo: `C:/Users/guerr/OneDrive/Escritorio/NexLift`; la carpeta
Documents/Documentos/ChatGPT estaba vacía. Se inspeccionaron git status/diff,
CLAUDE.md, arquitectura/API/datos (documentos históricos contrastados con código),
PHASE-3.5/4.1/4.2/4.3, TYPESCRIPT, manifests/locks/configs de tres workspaces,
builder, contratos, consumidores y runners. No hay AGENTS.md aplicable encontrado.
Rama main con cambios acumulados sin staging; no se reinició el proyecto.

Antes de editar se copiaron y verificaron hashes de **442 archivos públicos**,
status y diff en un archivo externo. No se leyeron .env operativos ni credenciales.
[Conservación e inventario](phase44/preservation-evidence.json).

## Selección y producción JS/TS

| Módulo real | Responsabilidad y consumidores | Compatibilidad |
| --- | --- | --- |
| client/src/components/ui/WeekdayPicker.tsx | Selector controlado de siete días; Import.jsx y EditRoutine.jsx | Fachada JSX anterior conservada; Vite ejecuta TSX. Props Weekday/null/undefined, callback nullable, MouseEventHandler; no tiene estado propio. Mismos textos/clases/atributos y comportamiento de día ocupado. |
| client/src/utils/routinePayload.ts | Formularios y plantillas de Import/EditRoutine | Fachada JS reexporta artefacto ESM. Tipos de presentación basados en entradas shared; alias/ceros/strings numéricos/extensions siguen intactos hasta validar en backend. |
| client/src/services/routineResponse.ts | Decodificación del resultado HTTP usado por api.importRoutine | json():Promise<unknown> antes del validador compartido. No basta el tipo Response; misma instancia y extensiones tras validar. |
| client/src/services/operationLabels.ts | Presentación del estado local en panel y errores de sincronización | Diccionario exacto trasladado y export anterior de operationSync conservado; unión de claves tipada. No se modifican transiciones/reintentos/persistencia. |
| server/src/services/operationContract.ts | Error público, adaptación de validación y normalización de operaciones v1 | Fachada JS consumida por rutas, transacciones y sessionPatch; estricto unknown en frontera. Hashes extraídos literalmente a operationHash.js, fuera de esta migración de algoritmos. |
| server/src/services/routineImportContract.ts | Normalización de días/importación/edición parcial | Consumido por servidor ESM mediante fachada. Shared conserva normalización de ejercicios. IDs de procedencia unknown, omisión frente a []/null, weekday e inferencia antiguos. |

Los módulos TS anteriores siguen activos: cloudinary vía BodyTracking/Profile;
errors vía middleware/operaciones; contracts en ambos lados y validación previa
a confirmación local. No se usa un modelo Prisma como DTO HTTP ni se importan
Prisma/PostgreSQL/Node/React dentro de shared. Motor offline, autorización, SQL,
PR, matemáticas, fechas y Service Worker conservan implementación anterior.

## Compilación y declaraciones

Mismo TypeScript 5.9.3/tsc y Vite existentes, Node 24.22.0/npm 11.19.1 y Prisma
6.19.3. **Sin dependencias nuevas ni locks modificados**. Backend sigue ESM.
La implementación TS genera nueve artefactos JS/CJS y declaraciones/maps en
client/build, server/build y shared/dist. Tres declaraciones estrechas describen
puertos JS reales, sin inventar modelos completos ni globals. Se copian al árbol
de declaraciones correspondiente.

Los dos bundles backend nuevos externalizan únicamente contratos runtime locales,
logic.js y operationHash.js según corresponda. Esto conserva una sola clase
ContractValidationError/RoutineValidationError y el instanceof de consumidores JS.
Las fachadas importan del objeto CJS las funciones implementadas en TS y
reexportan los puertos de hashes/shared directamente desde ESM. Esto evita tanto
la deducción de nombres CJS de Node como la pérdida de getters externos en Vitest.
Node 24 ejecuta los puertos ESM
síncronos; no se convierte Express a CommonJS.

No se editan generated a mano. El builder compila antes de preparar todos los
bundles y publica por rename atómico de cada archivo tras completar todos. No
promete una transacción multiartefacto. Check:generated compara nueve salidas.
[Nueve mapas, declaraciones y referencias verificadas](phase44/artifact-evidence.json).
Vite compila TSX directamente; no se empaqueta React dentro de un artefacto de UI.

Watch opcional analizado y **no incorporado**: regenerar archivos mientras dev
continúa vivo no garantiza que ESM cargado deje de servir versiones anteriores,
especialmente tras un error TS. Añadir esa garantía requiere supervisor de ciclo
completo y pruebas de parada/reinicio. Se mantiene build:typed explícito y
reinicio dev, checks de obsolescencia y scripts/start actuales. No se inicia ningún
servicio externo ni migración por compilar. Limitación documentada en TYPESCRIPT.

## Harness: investigación y corrección limitada

El fallo 4.3 estaba en el segundo arranque de sync-browser, esperando un puerto
distinto después de Browser.close. El código exigía desigualdad de puerto, no
retiraba el archivo anterior, omitía disable-background-mode y después de cinco
segundos podía seguir aunque no hubiera cierre confirmado. Storage/conflict ya
mejoraban parte del ciclo; offline verificaba cierre HTTP, pero no identidad del
nuevo browser. Todos reutilizaban perfiles únicos dentro de sus propios roots;
el orquestador ejecuta bloques secuencialmente y limpia el entorno heredado.

Se comparte ahora un helper exclusivo de pruebas con propiedad por perfil:
realpath dentro del root, cierre del endpoint UUID/proceso anterior, retirada
solo del archivo DevToolsActivePort propio, arranque con puerto 0, validación de
UUID coincidente entre archivo y /json/version y cierre del UUID esperado. Se
admite reutilizar un puerto. Se conservan stderr de fallos de arranque y se
desactiva background mode. No se matan procesos por nombre ni perfiles ajenos.
Los timeouts de aplicación, entradas y **101 aserciones** de los cuatro fixtures
son idénticos al snapshot, contrastados por AST. No se añadieron sleeps arbitrarios.

Prueba determinista por HTTP reproduce archivo/UUID obsoleto y nuevo UUID en el
mismo puerto; este último era rechazado por el criterio anterior. Edge real
repite selección/limpieza/interacción TSX a través de tres arranques. Esto prueba
los defectos del criterio de readiness; no demuestra retrospectivamente que el
timeout 4.3 tuviera una causa única. No se reproducen a propósito fallos de aplicación
ni se declaran verdes ejecuciones fallidas.

EBUSY histórico de postgres.private.log: el runner ya verifica realpath/prefijo y
pg_ctl stop antes de limpiar. No se modifica su limpieza sobre una causa no
demostrada ni se reintenta borrado ajeno. El guard previo solo permite retener
clúster detenido y repetir TODO el bloque en otro root después de 31 aprobadas.
El timeout histórico UI `draft sides committed` se analiza separado: eventos
React/controlados y espera por estado durable; no se alteraron entradas,
predicados, tiempos ni expectativas. Los resultados finales se documentan abajo.

## Pruebas

Se conservan los 1,091 casos únicos anteriores y se añaden **13**, en
scripts/test/phase44.test.mjs, ejecutables con npm run test:phase44. Incluyen
equivalencia de normalización/importación/edición/hash/payload/labels, frontera
HTTP unknown, rechazo de diez usos de tipos, 18 combinaciones de markup idéntico,
Edge/TSX real, readiness con puerto reutilizado y rechazo de perfil ajeno.
Los diez diagnósticos de compilador son una prueba, no diez casos adicionales.
El fixture con @ts-expect-error compila normalmente con cero errores; retirarlos
en memoria debe causar exactamente diez errores, todos en ese fixture.

El primer intento integral aprobó un prefijo de 800 casos y terminó con **exit 1**
en sync-client: 31/51 aprobados y 20 fallos. El síntoma común `requestHash is not
a function` fue una incompatibilidad de consumo Vitest de getters CJS externos,
no el timeout Edge previo. Se corrigieron las dos fachadas públicas para mantener
reexports ESM de puertos ya existentes; no se cambiaron hashes, validadores,
aserciones ni expectativas. Las 51/51 pasaron en el rerun focalizado y las 13/13
nuevas volvieron a pasar. Este intento no certifica la versión corregida.
Se preservaron 30 logs originales, consola y código ensayado (480 hashes) fuera
de Temp. La matriz definitiva comienza otra vez desde instalación/copia limpias;
no reutiliza el prefijo del código anterior. [Diagnóstico original](phase44/first-matrix-diagnostic.json).

La matriz completa instala en una nueva copia y usa únicamente clústeres
PostgreSQL nativos desechables con identidad/marker comprobados y cuentas
sintéticas. No llama proveedores. Mantiene pruebas HTTP de Atajos, JWT, caída de
PostgreSQL, registro/edición/PR/conflictos, RIR/lados/CDMX y Edge/IndexedDB reales.
No representa ejecución de Atajos en un iPhone físico.

## Calidad, Docker y transición

La segunda matriz aprobó **las 1,104 únicas**, incluido offline31/31 en222,073ms,
y después terminó con **exit 1** en client-standalone-build: el primer TSX hizo
fatal la referencia al tsconfig padre ausente. Sus51 logs y código quedan
archivados aparte. No se cuenta como recorrido integral exitoso ni se reutiliza
su prefijo para certificar la configuración corregida.
[Segundo diagnóstico](phase44/second-matrix-diagnostic.json).

Vite incorpora opciones de emisión explícitas como tsconfigRaw JSON string;
TypeScript mantiene el proyecto estricto anterior. El test compara target, JSX,
verbatimModuleSyntax y useDefineForClassFields con el tsc efectivo. La lectura del
código instalado de Vite7 confirmó que la forma object aún carga/fusiona el
tsconfig por archivo, mientras la forma string proporciona la configuración de
transpilación completa. El primer ensayo con object también falló y se conserva;
el ensayo focalizado con string aprobó el build separado. No se silencia ningún
diagnóstico de tsc ni se cambia strict. Puede persistir el warning histórico al
empaquetar vite.config; el error TSX queda resuelto en el build real. La matriz
definitiva volvió a empezar desde una tercera copia e instalación limpias.

Los árboles client/build y server/build son intermedios de emisión/declaraciones;
las entradas runtime son el TSX de Vite y los artefactos generated mediante las
fachadas. No se presenta server/build como un paquete ejecutable independiente.

Lint TS/TSX actual: **22 archivos, cero errores/advertencias**. Tooling: **39
archivos, cero errores/advertencias**. Global sigue **27 errores y 3 advertencias**
con la misma firma archivo/regla/severidad/mensaje; las líneas de api se desplazan
por imports. No se presenta lint global como aprobado. El snapshot de rutina usa
la regla original cliente para nombres de bindings ignorados, sin editar la
referencia. client/build se excluye como emisión; todas las fuentes TSX migradas
siguen comprobadas. [Comparación](phase44/lint-summary.json).

Docker CLI/Podman no disponibles. Dockerfile operativo y ensayo/contextos no
requieren cambios: el ensayo ya instala compilador, copia client/shared/configs,
compila servidor y copia generated al runtime. Se comprueban por separado
instalaciones/builds/poda en Windows en el cierre; **Docker/Linux/
OpenSSL/señales/EasyPanel pendientes**, sin certificación de imagen.

Aplicación todavía mayoritariamente JS: pendientes páginas grandes, motor offline,
rutas/middlewares Express y modelos de dominio/persistencia. Las declaraciones JS
son estrechas y no equivalen a comprobar todo logic.js. Recompilar TS requiere el
monorepo; standalone web usa artefactos entregados y puede advertir del tsconfig
padre ausente. Watch supervisado, Safari/iOS físico y Linux siguen pendientes.

Inventario para evaluar después: [Smart Loading, PR, RIR/RPE, volumen,
estancamientos, mesociclos y fechas](../../../docs/TRAINING-ENGINE-INVENTORY.md).
Se identifican duplicados y diferencias conocidas y separan funciones candidatas
puras de lecturas autorizadas/transacciones. **No se inicia Fase 5**.

Producción intacta: sin acceso/credenciales productivas, cambios de schema/SQL,
migraciones persistentes, flags nuevos, borrado offline, commits ni despliegues.
Baseline **PROVISIONAL**; sincronización nueva deshabilitada en producción.

## Cierre comprobado

La tercera copia limpia aprobó hasta **1,007** con el código final. Offline dio
**31/31, salida0, 234,349ms**, sin EBUSY ni timeout de borrador; el recorrido previo
había dado31/31 en222,073ms. El harness de readiness es idéntico en ambos. No se
atribuye a este cambio la corrección del antiguo timeout UI, cuya causa no llegó
a reproducirse. Los tiempos son observados en esta máquina, sin promesa general.

La siguiente invocación falló antes de ejecutar monorepo-tests: desapareció
npm/bin/npm-cli.js del runtime anterior en Temp durante el bloque offline. Se
conservan el **exit1**, log original, listado/diagnóstico y actor **desconocido**.
Esto no fue una aserción fallida de la aplicación. Se descargó Node24.22.0 a una
carpeta propia fuera de Temp y se verificó el ZIP contra SHASUMS256 oficial. Su
binario Node tiene exactamente el mismo SHA-256 que el anterior; npm sigue11.19.1.
No se cambió el runtime global del usuario.

Antes de continuar se compararon **342 archivos de código/configuración** entre
fuente y copia: idénticos. Se archivaron sus bytes, hashes, consola y logs del
prefijo. La utilidad de continuación vive fuera de scripts en la copia desechable;
conserva todos los comandos, aserciones, conteos y límites restantes. Registra
logs nuevos con prefijo checkpoint- y conserva el fallo como diagnóstico. Los
resultados/tiempos del prefijo proceden de la consola original; no se inventaron.
[Equivalencia y recuperación](phase44/checkpoint-evidence.json).

La continuación aprobó monorepo12, TypeScript12, arranque real dev1, contratos56,
HTTP cliente3 y las nuevas13: **1,104 únicas**, cero omitidas/canceladas en bloques
aprobados. Pasaron después tooling, build de ensayo, todas las unitarias,
instalaciones separadas, build Vite independiente con TSX, ejecución servidor
separado, poda de dependencias dev y **48 smoke repetidos**. La utilidad salió0.

| Bloque único | Casos aprobados |
| --- | ---: |
| Hasta2.4, incluidos API real/Atajos/JWT/integridad | 730 |
| Operaciones3.1 | 70 |
| Sincronización3.2 | 70 |
| Almacenamiento3.3 | 47 |
| Conflictos3.4 | 56 |
| SW/offline3.5 | 34 |
| Monorepo4.1 | 12 |
| TypeScript4.2 | 13 |
| Contratos4.3 | 59 |
| Migración4.4 | 13 |
| Total único | **1,104** |

Shared34, unitarias conjuntas365, servidor separado104 y smoke48 suman **551
repeticiones exitosas dentro de la matriz cerrada**; ninguna incrementa el total
único. Los intentos y chequeos focalizados previos tampoco se suman.

[Matriz completa y433 hashes fuente](phase44/phase44-evidence.json),
[entorno](phase44/environment-evidence.json),
[controles y archivo durable de61 logs](phase44/final-checks.json).
El archivo final conserva además350 archivos de código/configuración con hashes.
Hay56 controles de la matriz con salida0 y un diagnóstico de runtime retenido.
Los dos intentos anteriores se registran aparte, sin certificar la versión final.

## Comprobaciones adicionales y conservación final

En la copia desechable, después de cerrar la matriz, se verificaron controles
negativos reales: alterar un generated provoca el rechazo esperado de
check:generated; introducir un error TS provoca TS2322 y salida1 en build:typed,
con los nueve artefactos de compatibilidad intactos. Ambos cambios deliberados
se restauraron en finally; el check normal volvió a salir0. Son controles de
rechazo esperado, no fallos ocultados ni nuevas pruebas únicas.

El servidor instalado fuera del monorepo ejecutó las dos fachadas/adaptadores,
hashes y clases compartidas también con **--no-experimental-strip-types**: salida0.
No depende de TypeScript, shared ni herramientas de build en runtime. La
recompilación de fuentes TS sigue requiriendo el monorepo. Se verificaron350
archivos de código/configuración idénticos entre fuente/copia al finalizar.

Una primera comprobación auxiliar estricta de bytes detectó que npm prune había
reindentado server/package-lock.json **solo en la copia de ensayo**. Se archivó
esa salida y se comprobó igualdad profunda de TODO el JSON, no solo versiones:
cero cambios del grafo/dependencias. Se restituyeron los bytes originales solo
en esa copia; el código instalado no cambió. Los tres locks del repositorio
permanecieron intactos durante toda la fase. [Datos y hashes](phase44/prune-lock-evidence.json).

De los442 archivos públicos recibidos, **422 siguen idénticos y20 se modificaron**;
**30 archivos nuevos** de código/pruebas/configuración/documentación, además del
informe/evidencia. Cero eliminados. Se conservan62 entradas protegidas, incluidos
los44 archivos de pruebas previos, cuatro entradas Prisma, tres locks y todos
los Dockerfiles/contextos. El motor offline es literalmente igual al descontar
el diccionario de presentación; los hashes conservan su implementación literal.
Las cuatro fixtures de referencia nuevas son copias exactas de las recibidas.
[Inventario completo y pruebas de conservación](phase44/preservation-evidence.json).

CSS idéntico a4.3: **107,239 bytes**, SHA-256
50cd2c0ab880c45a97a2dfd308f16dc6d05290e77aa9c9a545d85b11caf9461f.
Grafo navegador: **2,668 módulos**, sin servidor/Prisma/Node/privados. No se afirma
identidad de todos los chunks JS. [Comparación](phase44/build-comparison.json).

El ensayo offline terminó con717 sesiones,718 series,6,405 descansos y7,122
comprobantes; cero series huérfanas, reconstrucción PR coincidente y7,115 instantes
originales confirmados tras medianoche. [Evidencia SQL/Edge](phase44/offline-integration-evidence.json).
La inspección final no encontró procesos Edge con los perfiles desechables de
estos ensayos. No se cerró ningún navegador del usuario ni se limpió una carpeta
ajena al ensayo. Los procesos PG propios finalizaron por los runners verificados.

## Límites de cierre

Persisten27 errores/3 advertencias históricos de lint, cero hallazgos nuevos;
TS/TSX22 y tooling39 están limpios. La posible advertencia standalone de tsconfig
padre y el warning previo de chunk PDF grande se distinguen de errores de build.
Docker/Linux/OpenSSL/señales/EasyPanel y Safari/iPhone físico siguen pendientes.
No se certifica un despliegue ni una imagen por ejecutar Windows. Watch para los
artefactos empaquetados sigue manual; el TSX directo mantiene el HMR de Vite.

El timeout UI de borrador y el EBUSY históricos no se reprodujeron en los dos
recorridos offline completos de esta fase; eso no demuestra una cura universal.
Se corrigió y comprobó el criterio de readiness de Edge. La pérdida de npm en
Temp obliga a recomendar un runtime de ensayo propio fuera de Temp; su actor
no se determinó. Se documentan estas limitaciones sin desactivar casos ni elevar
sus límites. [Diagnósticos de desarrollo](phase44/development-diagnostics.json).

Fase4 cerrada en desarrollo. El inventario para Fase5 es documental: **no se
iniciaron sus algoritmos**. Sin producción/credenciales productivas, schema/SQL,
migraciones persistentes, activación de flags, borrado offline, commits ni
despliegues. Baseline **PROVISIONAL**, sincronización nueva deshabilitada en
producción. El estado del repositorio permanece sin staging y conserva el
trabajo acumulado.
