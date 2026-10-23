# NexLift v4.0 — Fase 4.1

Fecha: 19 de octubre de 2026 (America/Mexico_City).
Estado: **COMPLETADO en desarrollo**. Matriz verificada por checkpoints:
**1,019 pruebas únicas aprobadas (1,007 anteriores + 12 nuevas)**.
Baseline Prisma y SQL de operaciones: **PROVISIONALES**. Producción intacta.

## 1. Estado recibido y arquitectura anterior

El proyecto real se localizó en `C:/Users/guerr/OneDrive/Escritorio/NexLift`;
la carpeta inicialmente asociada al chat estaba vacía. Se inspeccionaron Git,
cambios rastreados y archivos sin commit antes de editar. Se conserva una copia
aislada del estado recibido y sus hashes. No se reinició desde v3 ni desde HEAD.

Había dos proyectos npm independientes, sin package raíz: `client` React 19,
Vite 7, Tailwind 4 y Dexie 4.4.6; `nexlift-server` Express y Prisma 6.19.3.
**Ambos ya eran ESM**. Los documentos v3 tenían descripciones obsoletas sobre
ausencia de migraciones, TTL legacy, caché API y replay PUT basado en today-log.
El código y PHASE-3.5 conservan journal, acuses, versiones, transacciones Dexie,
fencing, conflictos, borradores recuperables y Service Worker privado.

Se contrastaron arquitectura/API/modelo, informes 1.x, 2.x y 3.1–3.5, manifests,
locks, Vite/Vitest/ESLint, Dockerfiles/Compose, generación Prisma, rutas estáticas,
flags, scripts de PostgreSQL y snapshots de staging. No se leyó el `.env` real.

## 2. Nueva estructura

Se mantienen `client/` y `server/` sin mover sus fuentes. Se añaden:

```text
package.json, package-lock.json, .npmrc
packages/shared/{package.json,tsconfig.json,src/index.js}
configs/tsconfig.{base,node,vite}.json
scripts/{check-*,prisma-generate,verify-monorepo}.mjs
scripts/lib/boundaries.mjs
scripts/lib/cleanup-result.mjs
scripts/test/monorepo.test.mjs
scripts/fixtures/shared-browser.js
docs/MONOREPO.md
server/audit/monorepo/
```

## 3. Archivos modificados y conservación

Respecto al estado recibido, los diez archivos existentes modificados son:
`.agent/{architecture,api-reference,database-schema}.md`, `.dockerignore`,
`CLAUDE.md`, `README.md`, `Dockerfile.rehearsal`, `client/package.json`,
`client/package-lock.json`, `server/package.json`.

Los demás archivos del listado anterior son nuevos. Las evidencias se generan
en esta carpeta. **312 archivos originales permanecen idénticos por SHA-256**,
incluidos todas las fuentes/pruebas de aplicación, Vite, SW, IDB, flags de ejemplo,
schema, SQL, Dockerfile operativo, staging, backup y algoritmos. Los 486 registros
de dependencias anteriores conservan versión, resolved e integrity en el lock
raíz. [Estado inicial, cambios permitidos y hashes](preservation-evidence.json).

No se eliminaron archivos, no se descartaron cambios ni se alteraron pruebas
históricas. La comparación es contra el estado sin commit recibido, no solo Git.

## 4. Workspaces e instalación

`workspaces: ["client", "server", "packages/*"]`; nombres existentes conservados;
nuevo `@nexlift/shared` privado. Raíz privada, Node 24.22.0 y npm 11.19.1.
La distribución portátil previa se utilizó sin reemplazar el Node global 22.23.1.

Se adopta **install-strategy=nested**, explícitamente transitoria. Runners,
snapshots, generación y fixtures usan rutas workspace/node_modules; hoisting
global exigiría modificar decenas de rutas comprobadas. Conservar esas rutas
evita reescribir lógica o herramientas de fases previas. Persisten duplicaciones
anteriores; no se añaden React/Express/Prisma al root ni se afirma deduplicación
global. Se prueba resolución real, no solo package.json.

## 5. Dependencias y locks

El lock raíz consolida los grafos existentes sin actualizaciones masivas.
TypeScript **5.9.3** es la única nueva herramienta externa. Shared se declara
como dependencia de desarrollo de la raíz con versión normal `0.0.0`, enlazada
por npm; se probó sin `workspace:*`.

`ignore` **5.3.2** y `js-yaml` **4.3.0**, ya resueltos y utilizados por pruebas
de infraestructura desde cliente, ahora tienen declaraciones directas de
desarrollo. No cambia su versión ni se descargan versiones nuevas por esa decisión.
Prisma CLI y Client siguen **6.19.3**. El lock servidor permanece intacto.

Los locks independientes se conservan para Docker/verificadores anteriores y
copias sin padre; no son fuentes de versiones divergentes. `npm run check`
compara manifests y cada registro con el central. El procedimiento de cambios,
clasificación runtime/build/tests y modo aislado está en
[MONOREPO.md](../../../docs/MONOREPO.md).

`.npmrc` desactiva lifecycle de instalación. La generación explícita de Prisma
usa schema temporal, entorno saneado, URL vacía, Client local y autoinstalación
prohibida. No modifica schema ni conecta una base. Un ensayo inicial detectó la
autoinstalación implícita de Prisma; se detuvo y corrigió antes de la matriz final.
También se corrigió el manejo de la lista de resultados Vite del probe nuevo;
no se modificaron aplicación ni aserciones históricas.

"Offline" en esta generación significa sin conexión a PostgreSQL ni lectura de
configuración operativa; no se certifica una instalación sin red/caché. npm y,
si falta su caché, la distribución de engines Prisma fijados pueden necesitar
el registro/CDN correspondiente. La prueba nativa SQL se ejecuta realmente.

## 6. Comandos definitivos

Desde raíz, con Node/npm seleccionados:

```powershell
npm ci
npm run db:generate
npm run dev:client
npm run dev:server
npm run test:client
npm run test:server
npm run test:unit
npm run test:monorepo
npm test
npm run build
npm run check
npm run check:shared
npm run check:bundle
npm run typecheck
npm run lint:tooling
npm run lint
```

Dev/start conserva el sistema anterior y solo debe apuntar a un destino autorizado.
No se ejecutó contra el `.env` remoto. `npm test` equivale a `verify:monorepo` y
crea una copia nueva; no ejecutar suites SQL antiguas indiscriminadamente contra
un historial ampliado: deliberadamente esperan primero su fixture 0_init.

## 7. Shared y límites

Solo exporta una cadena de prueba, sin algoritmos, contratos HTTP, fechas ni
sincronización. Las aplicaciones todavía no lo importan en runtime. Los probes
son herramientas de la raíz, que declara su dependencia: verifican resolución
desde cliente y servidor con import ESM y require de Node 24. El probe Vite
comprueba el bundle navegador. Al introducir consumidores de negocio en otra
fase habrá que declarar dependencias directas y ampliar el empaquetado aislado.

El checker AST limita imports estáticos/dinámicos/re-exports/require al src propio,
rechaza escapes y globals Node/DOM/almacenamiento. Nueve pruebas ejercen esos
límites, incluidos comentarios/cadenas y el bundle real, sin duplicar lógica de
la aplicación. No se declara compatibilidad con require en Node antiguo.

## 8. Frontend y backend

React/Vite/Tailwind/Router/lazy loading/PDF/Dexie permanecen con los mismos
paquetes resueltos, fuentes, rutas y configuración. El grafo web real validado
contiene **2,662 módulos** y no incluye servidor, Prisma, builtins Node ni archivos
privados. La salida sigue en `client/dist`; no se cambian origen, scope, registro,
versión SW, nombre/esquemas IDB ni claves legacy.

Se compararon los 34 assets del build predeterminado con otra compilación del
estado anterior: **CSS idéntico, 107,239 caracteres**, y React/icons/Recharts/PDF
idénticos por bytes. Algunos nombres de chunks y alias minificados de módulos
cambian entre copias; no se afirma igualdad binaria de todo el JavaScript.
[Comparación](build-comparison.json). Las fuentes/configuración/paquetes de la
SPA permanecen iguales y se verifican además con la matriz de comportamiento.

Los dos verificadores manuales antiguos de la raíz se inspeccionaron y conservan;
no forman parte de npm test ni se ejecutaron, porque escriben sobre un localhost
fijo sin verificar identidad de una base desechable.

Servidor Express ESM conserva entrypoint, dotenv, JWT/tokenVersion, endpoints,
Atajos, transacciones/PR, push, backups y ruta estática. `build:server` valida
sintaxis de **35 módulos**; no inventa compilación TS. Arranque real, JWT y SQL se
comprueban con runners existentes en destinos desechables y dependencias nativas.

## 9. Docker / EasyPanel

**Dockerfile operativo intacto**: conserva su Node 20/CMD histórico con db push;
no se ejecutó ni se autoriza su uso para estas verificaciones. El de ensayo usa
lock raíz y nested, conserva stages y contrato de imágenes/job/HTTP, genera
Prisma offline y poda únicamente el servidor. Runtime recibe solo sus dependencias,
código/SQL/deploy y client/dist; shared y herramientas raíz son de desarrollo.
No se añaden migraciones al arranque ni se ejecuta el job aquí.

Dockerfile.staging, Compose, release gates y snapshots anteriores permanecen
intactos. `.dockerignore` incorpora solo entradas necesarias del monorepo y
conserva exclusiones de credenciales, .env, datos, dumps, tests y dependencias.
Los tests históricos verifican estáticamente el contexto y etapas.

**Docker CLI no está disponible**: no hay imagen construida/ejecutada, validación
de engine Linux/OpenSSL, permisos/señales/red/volúmenes o panel EasyPanel real.
Se deben ensayar antes de proponer reemplazar el mecanismo operativo.

## 10. Instalaciones limpias

La verificación anterior se inició en una copia del estado recibido, con sus
locks independientes y sin .env. La matriz nueva usa otra copia, lock raíz,
npm ci, Prisma offline, probes, builds y runners históricos. Se prueban además
instalaciones cliente/servidor fuera de cualquier padre workspace, con sus locks
retenidos, y smoke con dependencias productivas del servidor después de poda.
Las copias nuevas de código/logs quedan conservadas; no se reutiliza ni limpia
ninguna carpeta diagnóstica anterior o base persistente.

Resultado: instalación raíz y ambas independientes con salida 0; resolución de
tres workspaces, generación 6.19.3, builds, typecheck y checks aprobados. El lock
raíz permanece idéntico por bytes antes/después de instalación, pruebas y poda.
Tras podar devDependencies del servidor, **48 smoke aprobados**.

Copias de esta fase conservadas para inspección:

- Matriz: `C:/Users/guerr/AppData/Local/Temp/nexlift-phase41-verification-gHObzf`.
- Instalación cliente: `C:/Users/guerr/AppData/Local/Temp/nexlift-phase41-client-yegqpZ`.
- Instalación servidor: `C:/Users/guerr/AppData/Local/Temp/nexlift-phase41-server-WAibr0`.
- Estado recibido: `C:/Users/guerr/AppData/Local/Temp/nexlift-phase41-session-8ca600107ef24e97a64f3b6b38ecd5de/before`.

[Matriz final, comandos y hashes](phase41-evidence.json),
[entorno comprobado](environment-evidence.json),
[lint final](offline-lint-evidence.json),
[integración offline/SQL/Edge final](offline-integration-evidence.json).

## 11. Pruebas aprobadas y total

| Grupo histórico | Pruebas |
| --- | ---: |
| Hasta 2.4 | 730 |
| Operaciones 3.1 | 70 |
| Sincronización 3.2 | 70 |
| Almacenamiento 3.3 | 47 |
| Conflictos 3.4 | 56 |
| SW privado 3.5 | 3 |
| Integración/carga 3.5 | 31 |
| **Históricas** | **1,007** |
| **Nuevas de monorepo** | **12** |
| **Total aprobado de la matriz final** | **1,019** |

La matriz del estado anterior aprobó **1,007 + 48 smoke**, ambos builds y todos
los checks: [37 comandos](before-phase35-evidence.json). Su cierre de metadatos
se detuvo porque el filtro de mi snapshot había omitido también las plantillas
públicas `.env.example`. Se copiaron solo esas plantillas idénticas y se retomó
el checkpoint original de hashes/evidencias, que aprobó. No se cambiaron fuentes,
casos ni aserciones, ni se omitieron pruebas. El exit 1 original y la reanudación
están registrados en [diagnóstico](before-run-diagnostic.json); las duraciones
de proceso de ese resumen no se reconstruyen, y se conservan los logs originales.

El inventario detallado de las primeras 730 es 104 lógica/IA, 48 rutinas, 17
backup cloud simulado, 41 backup PostgreSQL, 22 contrato importación, 39 importación
PostgreSQL, 84 entrenamientos, 13 caracterizaciones históricas, 54 auditoría SQL,
46 baseline/recuperación, 37 infraestructura, 14 proceso/HTTP/PG, 176 cliente,
12 staging unitarias y 23 staging SQL/HTTP. Las 13 caracterizaciones verifican
fixtures antiguos deliberados; no reintroducen sus defectos en la aplicación.
Las 70 de sincronización son 51 cliente + 19 API/navegador; el resto conserva
la convención de conteo de 3.5, incluidos sus contenedores de subpruebas.

Las doce nuevas, typecheck, 35 validaciones JS, límites web, **ambos builds** y
lint de los **12 archivos de tooling/shared** finalizaron con salida 0. Los
45 comandos exitosos de la matriz están registrados junto al intento diagnóstico
EBUSY, que se conserva con su exit 1 y no incrementa el total único. Las 331
unitarias conjuntas y 48 smoke son repeticiones, separadas del total acumulado.

Los 48 smoke repetidos y las unitarias conjuntas no incrementan pruebas únicas.
Las bases de los runners son nuevas, loopback y verificadas mediante PGDATA,
puerto/system_identifier/marcador. No se aceptan URLs externas ni credenciales
heredadas. Los fallos/cierres/reinicios y la carga de 5,000 se preservan.

La primera matriz monorepo aprobó las 1,007 aserciones históricas, pero su último
runner salió 1 al retirar `postgres.private.log` con EBUSY. Se verificó `pg_ctl
status` = 3 y ausencia de PID en su raíz temporal propia, que se conserva sin
limpieza manual. El orquestador nuevo incorpora un único reintento para ese caso
exacto, nunca para aserciones fallidas, canceladas u omitidas. No cambia los
runners históricos. Tres de las doce pruebas nuevas verifican esa clasificación;
un ensayo adicional con stdout grabado y PGDATA detenido ejerció la rama real
de reintento, sin SQL y sin añadir casos al total único.
[Diagnóstico y reanudación](phase41-run-diagnostic.json),
[prueba del guard](retry-guard-evidence.json).

El bloque offline se repitió con un clúster nuevo: **31/31 y exit 0**, y se reanudó
el resto hasta el cierre; las 976
pruebas anteriores del prefijo no se repiten porque sus fuentes, dependencias y
aserciones no cambiaron. El cambio de código se limita al orquestador, su helper
y las pruebas nuevas. Los tiempos del prefijo no se reconstruyen; sus logs y
stdout originales se conservan. Este incidente no se presenta como fallo de
aplicación ni como un comando original con salida 0.

La utilidad temporal de reanudación omitió inicialmente su variable `lockedBytes`
y se detuvo después de los 1,019 casos/builds/lint aprobados. El orquestador del
repositorio ya la declara correctamente. Se retomaron solo instalaciones,
poda/smoke y metadatos, comprobando **260 archivos de código/configuración por
bytes contra la copia realmente ensayada** y el lock fuente intacto. El diagnóstico
externo se registra en el mismo JSON; no motivó cambios a aplicación ni pruebas.

## 12. Lint

| Alcance | Anteriores | Nuevos | Corregidos por 4.1 |
| --- | --- | --- | --- |
| Cliente global | 27 errores / 3 advertencias | 0/0 | 0/0 |
| index.js (check histórico) | 12 errores / 0 advertencias | 0/0 | 0/0 |
| Herramientas/shared nuevos | — | 0 errores / 0 advertencias | 1 error inicial del tooling corregido |

El lint global mantiene deuda histórica: `npm run lint` no se presenta como
aprobado. Los checkers anteriores y el lint de todos los archivos nuevos pasaron
sin relajar reglas. Se conserva el aviso histórico del chunk PDF de 779.10 kB.

## 13. Preparación TypeScript y límites de fase

Bases strict/noEmit con NodeNext para Node/ESM y Bundler/ESNext/react-jsx para
Vite. Solo el JS mínimo de shared activa allowJs/checkJs. Tipos React 19 siguen
en cliente, Prisma genera sus tipos sin cambiar schema. No se instalan aún tipos
Node/Express ni ESLint TS sobre todo el JS. No hay aliases ficticios, cambio de
runtime, emisión TS, cambio de source maps productivos ni conversiones masivas.

El plan gradual y estrategia de declaraciones/emisión/maps está en MONOREPO.md.
Se preservarán los invariantes tipados de 3.5; no se crean modelos/validadores
paralelos. **No se avanza a la Fase 4.2**.

## 14. Riesgos y pendientes

- Nested mantiene duplicaciones históricas y costo de instalación; futura
  deduplicación debe revisar rutas/snapshots/Prisma y no ocultar dependencias.
- Los locks compatibles deben mantenerse sincronizados mediante `npm run check`.
- Root shared solo prueba infraestructura; los consumidores futuros requieren
  integración explícita de dependencia y runtime aislado.
- Docker/Linux/EasyPanel, copia real autorizada/baseline y Safari/iOS físico
  continúan pendientes. La matriz Windows no demuestra esos entornos.
- Persisten límites de retención del navegador, FIFO, crecimiento de journals,
  exportación local sin importador y costo de PR documentados en 3.5.

## 15. Producción y cierre

No se accedió a producción ni al staging persistente, ni se usaron credenciales
de producción. No hubo migraciones persistentes, cambios de schema/SQL,
activación de flags, borrado de legacy/borradores/pendientes, commits o despliegues.
Los cambios previos permanecen conservados. Baseline **PROVISIONAL**.

**COMPLETADO en desarrollo**, con npm workspaces, instalaciones reproducibles,
shared mínimo y bases TypeScript verificadas. Los gates externos Docker/Linux,
EasyPanel, copia real/baseline y Safari/iOS continúan pendientes; el cierre no
autoriza despliegue ni activación. **No se avanza a Fase 4.2.**
