# NexLift v4.0 — Fase 4.2

Fecha: 19 de octubre de 2026, America/Mexico_City.
Estado: **COMPLETADO en desarrollo**, con verificación por checkpoints:
**1,032 pruebas únicas aprobadas (1,019 anteriores + 13 nuevas)** y 48 smoke
repetidos adicionales. No se inicia 4.3.
Baseline Prisma y SQL de operaciones: **PROVISIONALES**.
Producción intacta; sin migraciones persistentes, commits o despliegues.

## 1. Contexto recibido e inspección

Se trabajó sobre el repositorio real `C:/Users/guerr/OneDrive/Escritorio/NexLift`,
no sobre la carpeta inicialmente vacía del chat. Git estaba en main con cambios
acumulados de fases anteriores, rastreados y sin rastrear. Se inspeccionaron
status/diff, PHASE-4.1, PHASE-3.5, arquitectura/API/modelo, manifests/locks, los
tres workspaces, Vite/Vitest/ESLint, imports de consumidores, arranque Express,
scripts PG/HTTP/browser y Docker. No se leyó el `.env` operativo.

El prompt describe un backend CommonJS, pero el estado real recibido es **ESM**
(`type: module`, imports y export startServer). Se mantiene ESM; se añade un
artefacto CJS interoperable, sin convertir el servidor. La referencia anterior
era 1,019 pruebas únicas más 48 smoke repetidos.

Se preservó antes de editar una copia y SHA-256 de **358 archivos**. Permanecen
**339 idénticos**; los otros 19 son cambios revisados de configuración, herramientas,
documentación y fachadas. Ningún archivo recibido fue eliminado. Los **486 registros**
de dependencias anteriores conservan versión, resolved e integrity. Los locks
independientes cliente/servidor no cambiaron. Ver [conservación](preservation-evidence.json).

Al reanudar, 66 entradas de la copia temporal ya no estaban presentes. Se
reconstruyó el estado recibido **fuera de Temp** usando únicamente bytes cuyo
SHA-256 coincide con los hashes capturados inicialmente: copia temporal restante,
archivos aún idénticos del workspace, fixtures legacy exactas y Git HEAD solo
cuando su contenido coincide exactamente con el hash recibido. Se verificaron
los **358 archivos completos**; no se restauró ni sobrescribió el workspace.
Ver [archivo recibido y procedencia de recuperación](received-archive.json).

## 2. Versiones y dependencias

| Componente | Versión comprobada |
| --- | --- |
| Node / npm de la matriz | 24.22.0 / 11.19.1 |
| TypeScript | **5.9.3**, conservado de 4.1 |
| React / React DOM | 19.2.3 |
| Vite | 7.3.6 |
| Express | 4.22.2 |
| Prisma CLI / Client | 6.19.3 / 6.19.3 |
| PostgreSQL desechable | 18.4 |
| Edge de los ensayos | 155.0.4283.62 |
| Tipos React / React DOM | 19.2.7 / 19.2.3, existentes |
| Parser/plugin ESLint TS | 8.72.0 / 8.72.0 |
| ESLint raíz | 9.39.2, misma versión que el cliente |

Solo se añaden herramientas de lint TS y su ESLint raíz. No se necesitan tipos
Node/Express en las funciones puras seleccionadas, ni nuevos tipos React o runners.
El bundler reutiliza Vite existente. Una exploración inicial instaló esbuild como
herramienta directa y resolvió ESLint peer 10; se retiró esa dependencia directa y
se fijó ESLint 9.39.2 antes de verificar. No se actualizó ningún paquete anterior.

npm recolocó inicialmente paquetes comunes. Se restauraron los registros nested
del lock anterior y se verificó después la instalación limpia/coherencia real;
no se modificó el checker para admitir divergencias. El lock raíz sigue siendo
la autoridad y se conserva la estrategia nested de 4.1.

## 3. Configuraciones y organización de tipos

Se reutilizan las tres bases strict de `configs/` sin sobrescribirlas. Se crean
`client/tsconfig.json`, `server/tsconfig.json`, `server/tsconfig.build.json` y
`packages/shared/tsconfig.build.json`; se amplía el tsconfig de shared.

Cliente: ESNext/Bundler, react-jsx y DOM/vite/client. Servidor/shared: NodeNext,
ES2022 sin DOM ni globals Node. `allowJs`/`checkJs: false` en los consumidores
permite convivencia sin imponer verificación estricta al JS anterior. Los
patrones incluyen todos los `.ts/.tsx/.cts` de fuente y sus fixtures de tipos;
las pruebas comprueban que los programas contienen sus fuentes TS.

Los typechecks usan noEmit y strict; builds de server/shared activan emisión,
noEmitOnError, declaraciones, mapas e inlineSources en directorios separados.
No se usan any, ts-ignore, casts as, aliases ficticios, interfaces de red no
validadas ni desactivación de strict. Los valores de excepciones son unknown.

Archivos nuevos principales, además de esos configs y las tres fuentes TS:
`scripts/build-typescript.mjs`, `scripts/lint-typescript.mjs`,
`scripts/test/typescript.test.mjs`, `scripts/fixtures/legacy-{cloudinary,errors}.js`,
`client/type-tests/cloudinary.ts`, `server/type-tests/errors.ts`,
`packages/shared/type-tests/exports.cts`, `packages/shared/test/imports.test.mjs`,
`server/test/run-typescript-dev.mjs`, `server/test/typescript-dev.integration.test.js`,
`server/test/fixtures/typescript-dev-{guard,process}.mjs`, los dos artefactos
`src/generated`, `docs/TYPESCRIPT.md` y este directorio de informe/evidencias.

## 4. Módulos de producción migrados

| Fuente TS | Consumidor real | Entrada compatible |
| --- | --- | --- |
| client/src/utils/cloudinary.ts | BodyTracking y Profile (React JS) | utils/cloudinary.js → generated/cloudinary.js |
| server/src/operations/errors.ts | Middleware JWT y rutas de operaciones | operations/errors.js → generated/errors.cjs |
| packages/shared/src/index.ts | Ambos módulos anteriores durante build | @nexlift/shared → dist/index.js |

Cloudinary conserva exactamente orden de transformaciones, valores por defecto,
URL externa/relativa, width/height/crop/quality, nulos y comportamiento de llamadas
JS fuera del contrato tipado. No cambia JSX ni solicita recursos de Cloudinary.
Las opciones y retornos tienen tipos públicos explícitos.

El clasificador conserva códigos Prisma/libpq/red, P2010/meta, profundidad de
causa, cortocircuitos, getters/herencia y coerciones de la implementación recibida.
`Reflect.get` devuelve unknown; no se afirma que cualquier excepción sea Error ni
se inspeccionan mensajes que podrían contener credenciales.

Shared exporta el predicado de ejecución isString, el tipo StringGuard y el probe
anterior. No importa React, Express, Prisma, APIs de plataforma o secretos. El
checker AST de límites continúa activo. No se trasladan fórmulas, modelos ni
contratos de API al paquete.

## 5. Emisión e interoperabilidad

Shared produce ESM y `.d.ts` reales en dist. Sus campos main/types/exports
apuntan allí. Node 24.22.0 prueba import ESM y require del mismo ESM síncrono;
no se promete ese require en Node 20 ni se introduce una distribución dual del
paquete sin necesidad.

El build raíz usa tsc y Vite sin cargar archivos env. Emite ESM/declaraciones
intermedias del backend en server/build y dos bundles autocontenidos:
`client/src/generated/cloudinary.js` (ESM) y `server/src/generated/errors.cjs`
(CJS). Ambos incorporan el export real de shared sin imports externos.

Estos dos artefactos generados se entregan intencionalmente con la fuente,
separados de las implementaciones TS. Las entradas JS anteriores son fachadas,
sin fallback ni implementación duplicada. Esto conserva Docker/snapshots e
instalaciones independientes que no llevan packages/ o herramientas de la raíz.
El runtime no depende de shared externo, tsc, Vite o ESLint. Los mapas son
relativos y contienen únicamente las fuentes puras de estos módulos.

`check:generated` reconstruye y exige igualdad de bytes: un artefacto obsoleto
falla. Las fixtures legacy son copias de las funciones recibidas exclusivamente
para caracterización, no código alternativo de producción. El coste transitorio
es mantener esos dos artefactos reproducibles hasta adoptar una cadena de
empaquetado productiva verificada. No editar generated manualmente.

## 6. Comandos

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
npm run test:typescript
npm run test:typescript:dev -w nexlift-server
npm run test:monorepo
npm run lint:typescript
npm run lint:tooling
npm run lint
npm run build
npm test
```

Typecheck raíz prepara las declaraciones shared y ejecuta tsc en los tres
workspaces. Los comandos por workspace se usan después de esa preparación.
No es una comprobación sustituida por Vite. Instalación mantiene ignore-scripts.
Builds raíz regeneran sus módulos; build cliente independiente conserva Vite
sobre los artefactos entregados. El build servidor del workspace compila TS y
comprueba JS. Dev raíz compila primero; después conserva los comandos dev previos.
Tras editar TS durante dev, ejecutar build:typed; todavía no hay watcher TS.
El script start servidor permanece literalmente intacto.

Una copia cliente totalmente separada del monorepo sigue compilando la SPA a
partir de los artefactos entregados (salida 0). Al no llevar el directorio padre
configs, esbuild advierte que no encuentra la base de tsconfig; ese modo **no
reconstruye ni certifica tipos TS**. El typecheck/rebuild estricto usa el monorepo
completo con configs/shared. También permanece el aviso histórico del chunk PDF.
No se oculta la advertencia ni se presenta ese build como un typecheck aislado.

El ensayo dev usa startServer real con NODE_ENV=development, mapas y bind loopback;
omite dotenv mediante la protección de ensayo existente y bloquea proveedores.
Comprueba Prisma nativo, JWT, corte/reinicio PG y 503/Retry-After/recuperación.
No se ensaya el supervisor interactivo node --watch ni se usa `.env` operativo.

## 7. Pruebas nuevas y tipos incorrectos

Doce casos unitarios/de compilador y uno PG/HTTP nuevo:

1. Importación ESM de shared y predicado real.
2. Require de shared en Node 24.
3. Equivalencia de imágenes en 1,152 combinaciones, más display/nulos.
4. Conservación de llamadas JS malformadas y opciones null.
5. Equivalencia de códigos de dependencia en sus ubicaciones reales.
6. Unknown/causas/ciclos/herencia/getters/coerciones y límites de profundidad.
7. Require del backend CJS sin compilador ni paquete shared en runtime.
8. Consumidores React reales y URL exacta.
9. Cliente rechaza seis usos inválidos.
10. Servidor rechaza cuatro usos inválidos.
11. Shared rechaza tres usos inválidos.
12. Artefactos sin dependencias externas y mapas reubicables.
13. Backend real en desarrollo con PostgreSQL/JWT/caída/recuperación.

Las tres pruebas de compilador retiran solo en memoria las expectativas y exigen
exactamente los diagnósticos previstos, todos dentro de las fixtures. Normalmente
esas mismas fixtures pasan con @ts-expect-error; si deja de existir el error,
tsc falla por expectativa no utilizada. Se verifican tipos incompatibles,
propiedades desconocidas, retorno, null, import inexistente, unknown y ausencia
de globals Node/DOM donde no corresponden. No se cuentan los 13 diagnósticos ni
las combinaciones internas como pruebas únicas adicionales.

La firma TypeScript protege consumidores tipados; no valida por sí sola JSON de
red/SQL. El predicado isString comprueba solo una cadena. Los módulos JS restantes
siguen sin la garantía estática de TypeScript. La validación API completa queda
para 4.3 y no se implementa aquí.

## 8. Matriz y conservación funcional

**Matriz final aprobada por checkpoints: 1,032 únicas = 1,019 previas + 13.**
La utilidad final de cierre terminó con **salida 0** el 19 de octubre de 2026,
20:32 CDMX. Los intentos originales de npm test con timeout/limpieza no se
presentan como comandos exitosos; su detalle está en la sección 11.

| Grupo | Pruebas únicas aprobadas |
| --- | ---: |
| Hasta 2.4 | 730 |
| Operaciones 3.1 | 70 |
| Sincronización 3.2 | 70 |
| Almacenamiento 3.3 | 47 |
| Conflictos 3.4 | 56 |
| SW privado 3.5 | 3 |
| Integración/carga 3.5 | 31 |
| Monorepo 4.1 | 12 |
| TypeScript 4.2 | 13 |
| **Total** | **1,032** |

Se conserva la convención de conteo de fases anteriores, incluidos sus
contenedores de subpruebas. Los 333 casos unitarios conjuntos, 104 unitarios del
servidor separado y 48 smoke son **485 repeticiones**, no pruebas únicas nuevas.
Tampoco se suman los intentos diagnósticos.

Resultados de los controles:

- Instalación raíz y dos instalaciones independientes: salida 0; lock raíz
  idéntico por bytes antes/después de tests, builds y poda.
- Typechecks estrictos de los tres workspaces: salida 0; trece usos incorrectos
  detectados dentro de las tres pruebas de compilador.
- Shared: emisión JS/declaraciones/maps, import ESM, require Node 24 y pruebas
  desde su workspace: correctos. Artefactos reproducibles verificados.
- Build raíz predeterminado, build con flags de ensayo y build cliente separado:
  salida 0. Backend: emisión TS, bundle CJS y sintaxis de 36 módulos JS correctos.
- Backend real en desarrollo: PostgreSQL nativo, JWT, 503 durante caída y
  recuperación: aprobado.
- Servidor aislado: npm ci, 104 unitarias y require CJS aprobados. Las pruebas
  históricas de paridad reciben una copia exacta de smartLoading.js y package.json
  cliente como fixture hermano; no se instalan dependencias frontend ni se
  introducen imports de cliente en runtime.
- Poda de dependencias dev y 48 smoke nativos posteriores: aprobados.
- Grafo web real: **2,663 módulos**, sin servidor, Prisma, builtins Node o privados.
- CSS idéntico al build verificado de 4.1: **107,239 caracteres**, mismo SHA-256.
  Once assets conservan bytes/nombre; otros 23 cambian o se renombran. No se
  promete identidad binaria de todos los chunks JS. [Comparación](build-comparison.json).
- **379 artefactos fuente** comprobados por hash al cierre, más los controles
  independientes de conservación del estado recibido.

Se registran **52 controles/comandos aprobados** y cinco intentos diagnósticos
retenidos de esta matriz; los 37 del prefijo se recuperaron de sus logs y de las
salidas 0 observadas, con duración null explícita. El intento previo de
almacenamiento está además en development-diagnostics.json. El cierre no
reconstruye tiempos ni atribuye salida 0 a un proceso que falló.
[Matriz, resultados y hashes](phase42-evidence.json),
[entorno exacto](environment-evidence.json),
[offline/SQL/Edge](offline-integration-evidence.json),
[checkpoint offline](offline-checkpoint.json).

Se utiliza el orquestador monorepo existente, ampliado con build/typechecks,
reproducibilidad de generated, las pruebas nuevas y builds/ejecución independientes.
Mantiene el mismo orden histórico 730 → 800 → 870 → 917 → 973 → 1,007 → 1,019.
Las migraciones provisionales se copian/aplican solo en los fixtures desechables
correspondientes, nunca sobre destinos persistentes. Se conservan las aserciones
de fases anteriores y el único reintento limitado de limpieza Windows de 4.1.

Los hashes protegen fórmulas, fecha CDMX, peso/reps/RIR/RPE/unilateral, PR, UUID,
sessionVersion, operationId, JSON, SW/Dexie, lógica offline y contratos HTTP. Los
tests originales verifican además su ejecución con Express/Prisma/PG/Edge real.
No se alteran representaciones históricas para simplificar tipos.

## 9. Lint

El lint global se ejecutó y devuelve el fallo histórico esperado: **27 errores
y 3 advertencias**. Sus hallazgos son idénticos a 4.1 por archivo, regla, línea y
mensaje: **0 regresiones / 0 correcciones históricas**. Ver [comparación](lint-summary.json)
y [resultado completo](lint-global.json). No se presenta el global como verde.

Lint TS recomendado/retornos explícitos: tres fuentes, cero errores/advertencias.
Tooling, fixtures y pruebas nuevas JS: 22 archivos, cero errores/advertencias.
Se ignora únicamente client/src/generated en el lint JS cliente; la fuente TS se
comprueba por separado y los artefactos se comparan con sus fuentes. No se
desactivan reglas anteriores para esconder deuda.

## 10. Docker y EasyPanel

Dockerfile operativo, Dockerfile.staging y Compose quedan idénticos. No se ejecuta
su CMD histórico db push. Dockerfile.rehearsal prepara configs/shared, compila
fuentes y copia el CJS generado desde server-build al runtime. Conserva usuario,
health, señales, Node 24/Prisma y separación del job/release gate. .dockerignore
admite los nuevos inputs necesarios y conserva sus exclusiones privadas.

**Docker/Podman CLI no disponibles**. El build/run Linux, engines/OpenSSL,
permisos, señales y EasyPanel no se certifican con esta matriz Windows. No hubo
despliegue ni acceso a producción.

## 11. Diagnósticos durante desarrollo

Se corrigió la prueba programática del compilador para pasar el nombre del
tsconfig al API TS (necesario para resolver vite/client como lo hace tsc CLI).
No se retiró la comprobación ni se excluyeron fuentes problemáticas.

Un primer ensayo dev no recuperaba PG porque el fixture omitía el puerto temporal
al reiniciar. Se interrumpieron únicamente sus procesos Node propios; su runner
cerró y retiró el clúster desechable. Se añadió el puerto/bind original y cancelación
acotada; el ensayo completo posterior aprobó. No fue un cambio a la aplicación.

El primer inicio de matriz se detuvo antes de instalar: faltaba npm-cli.js en la
distribución portátil antigua. Se conservó ese diagnóstico y se extrajo el ZIP
Node 24.22.0 existente en otra carpeta temporal tras comprobar su SHA-256 contra
SHASUMS256.txt. El runtime nuevo confirmó npm 11.19.1; no se cambió el global.
La matriz final usa esa distribución completa. No se ocultan esos intentos ni
se suman al total único.

El primer recorrido completo se detuvo después del prefijo aprobado de **870**:
el bloque de almacenamiento reportó 45 pass / 2 fail sobre 47 (incluye su
contenedor), por timeout en el caso de pestaña congelada/rechazo de escritor
antiguo. El orquestador falló; no aceptó ese resultado ni agregó reintentos de
aserciones. Se conservan log e intento en
`C:/Users/guerr/AppData/Local/Temp/nexlift-phase42-verification-7BubsF`.
Las fuentes del caso, coordinación, store y runtime siguen idénticas por hash.
Se inició otra matriz **completa**, con nueva instalación y clústeres/perfiles;
el resultado final de esa repetición se registra en la sección 8.
[Diagnósticos de desarrollo e intentos](development-diagnostics.json).

Esa segunda matriz aprobó almacenamiento 47/47, conflictos y SW (prefijo de
**976 casos**), y las **31/31** aserciones offline, pero salió 1 al retirar su
`postgres.private.log` con EBUSY. El guard existente verificó el clúster detenido
y repitió en otro clúster, conservando el anterior sin intentar borrarlo. El
reintento encontró un timeout distinto del fixture UI, `draft sides committed`,
en su primer caso (2 fail con contenedor). Se conservan ambos resultados: no se
presenta ninguno de esos comandos con salida 0.

La verificación continúa **por checkpoints**, como en 4.1. Antes de reanudar se
compararon **279 archivos de código/configuración**, todos idénticos entre fuente
y copia realmente ensayada. Se archivaron los logs del prefijo y fallos antes
de ejecutar el resto. Los tiempos del prefijo no se reconstruyen: el resumen
marca milliseconds null, el log y la evidencia de exit 0 emitida por el
orquestador original. Los diagnósticos se conservan como repeticiones y no suman
pruebas únicas. Se exige nuevamente el bloque offline completo con salida 0.
[Equivalencia de fuente y checkpoint](checkpoint-source-equivalence.json).
No se cambiaron fuentes ni aserciones offline para resolver estas incidencias;
la variabilidad observada del harness de navegador queda como riesgo conocido.

El primer checkpoint adicional volvió a detenerse por el mismo timeout de
borrador. En **la copia desechable** se añadió entonces un catch de diagnóstico
que solo leería formulario/borradores si volvía a fallar esa espera. No cambió
entradas, predicados, aserciones, límites de tiempo ni código de aplicación.
La siguiente ejecución aprobó **31/31, cero omitidos/cancelados y salida 0**;
el logger no llegó a ejecutarse. Se conservó su fuente instrumentada y se restauró
después el fixture de la copia a sus bytes originales. La salida capturada desde
el cuarto caso incluye el resumen nativo completo y salida 0; los primeros tres
casos también están en la traza de herramientas. Esa limitación de captura se
declara en offline-checkpoint.json, sin inventar un log completo.

La ejecución conjunta detectó una errata nueva de scripts.test en shared
(`.cjs` frente al `.mjs` existente). Las mismas dos pruebas ya habían pasado en
la suite TypeScript. Se corrigió únicamente la ruta del comando, se repitieron
check/typecheck/generated/lint y el comando del workspace: salida 0; luego las
333 unitarias conjuntas aprobaron. No cambió implementación ni dependencias.

La copia servidor independiente detectó después que la suite histórica de paridad
importa el helper cliente hermano. Se corrigió **solo el montaje de la copia de
ensayo** para suministrar el fixture exacto; no se eliminaron sus dos pruebas ni
se cambiaron fórmulas/aserciones. La instalación limpia, las 104 unitarias y el
require independiente aprobaron. Los logs de ambos errores de herramientas se
conservan como diagnósticos, fuera del total único. El cierre final volvió a
comparar fuente y copia, comprobó los hashes/locks y terminó con salida 0.

## 12. Riesgos restantes y Fase 4.3

El frontend/backend siguen mayoritariamente JavaScript; solo dos módulos de
producción y shared están migrados. Aún no hay migración de componentes TSX,
middleware Express completo, ORM o motor offline. No hay watcher TS automático.
Los artefactos versionables requieren regeneración/check; Linux sigue pendiente.
La reconstrucción TS requiere configs/shared del monorepo; el build cliente
legacy separado funciona con la advertencia descrita en la sección 6.

En 4.3 se podrá diseñar validación runtime de contratos sobre los módulos actuales
de API/operationProtocol/operationContract, sin asumir que interfaces prueban
datos externos. **Ningún archivo de esos contratos se modificó en 4.2**. No se
anticipan endpoints, esquemas o flags de esa fase.

Guía completa y referencias primarias: [docs/TYPESCRIPT.md](../../../docs/TYPESCRIPT.md).
Baseline **PROVISIONAL**, sincronización nueva deshabilitada en producción,
sin commits, despliegues ni modificaciones de bases persistentes.
