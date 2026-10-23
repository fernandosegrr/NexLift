# NexLift: monorepo y preparación TypeScript (Fase 4.1)

> La organización de workspaces/locks descrita aquí sigue vigente. La preparación
> TS de 4.1 ya fue ampliada por [Fase 4.2: TypeScript real](TYPESCRIPT.md), que
> sustituye los apartados de shared, compilación y plan TS de este documento.
> Los informes y evidencias 4.1 conservan su valor histórico.

La aplicación conserva React 19/Vite 7/Tailwind 4, Express ESM y Prisma CLI/Client
6.19.3. No se mueve código de negocio, no cambian endpoints, rutas, origen web,
IndexedDB, claves legacy ni Service Worker. La baseline y la migración SQL de
operaciones siguen **PROVISIONALES**; la sincronización nueva sigue bloqueada en
producción. Los informes 1–3.5 son históricos y no se reescriben.

## Paquetes y límites

```text
package.json / package-lock.json / .npmrc   instalación del monorepo
client/                                   SPA, persistencia y pruebas Vitest
server/                                   API, Prisma, runners PG/HTTP/Edge
packages/shared/src/                      paquete privado puro, sin dependencias
configs/                                  bases TypeScript de adopción gradual
scripts/                                  herramientas de desarrollo de la raíz
docs/                                     procedimientos actuales
server/audit/monorepo/                     informe y evidencias de Fase 4.1
```

Los nombres existentes `client` y `nexlift-server` se conservan. El tercero es
`@nexlift/shared`; `packages/*` permite añadir paquetes futuros explícitos.
`shared` no contiene modelos ni constantes del protocolo: exporta solamente una
cadena de prueba para las herramientas. No usa React, Express, Prisma, Node,
DOM, almacenamiento ni variables de entorno. El checker analiza sintaxis y limita
imports a su propio `src`. No hay algoritmos deportivos duplicados.

`@nexlift/shared: "0.0.0"` es dependencia de desarrollo de la **raíz**, dueña de
los probes. npm enlaza el workspace local; no se usa `workspace:*`. Los scripts
`check:shared` ejecutados desde cliente/servidor verifican resolución ESM y
CommonJS de Node 24; una prueba Vite genera un bundle web en memoria e inspecciona
sus módulos. Las aplicaciones no importan shared todavía. Cuando lo hagan, deberán
declararlo como dependencia directa del consumidor y extender el empaquetado
aislado de Docker/staging; no se permite depender accidentalmente de hoisting.

## Entorno e instalación

Usar **Node 24.22.0 + npm 11.19.1** (selectores `.node-version`, `.nvmrc` y
`packageManager`). La matriz histórica exige el patch exacto. El Node global 22
no se reemplaza. `engine-strict` rechaza un runtime incompatible. En Windows se
puede anteponer temporalmente una distribución ya instalada a `$env:PATH`; en
Linux usar el selector de versiones habitual. No hacen falta Bash ni un orquestador.

Desde una copia limpia, con ese runtime activo:

```powershell
npm ci
npm run db:generate
npm run check
npm run check:shared
npm run build
```

`.npmrc` fija `install-strategy=nested` e `ignore-scripts=true`. La instalación no
ejecuta postinstall de Prisma ni carga el `.env` operativo. `db:generate` utiliza
solo el CLI instalado y una copia temporal del schema, entorno saneado, URL vacía
y autoinstalación prohibida. Genera el cliente nativo en `server/node_modules` sin
conectar una base ni modificar `schema.prisma`. Los binarios opcionales de
esbuild/Tailwind se comprueban con el build real; no se habilitan scripts globales.

La estrategia nested es deliberadamente transitoria: runners históricos,
`staging/local.mjs` y sus snapshots dependen de rutas locales `node_modules`.
Se mantienen ambos árboles anteriores, incluidas duplicaciones ya existentes,
en lugar de reescribir decenas de rutas/fixtures o introducir enlaces manuales.
No se añaden copias de React/Express/Prisma en la raíz. Una deduplicación futura
exige adaptar/probar los resolvers, snapshots, generación y runtime Linux juntos.

## Lockfiles y dependencias

El lock raíz es la autoridad para **npm ci desde la raíz**. Se construyó con los
registros de los locks anteriores: se conservaron versión, URL e integrity de
cada paquete y subpaquete. Solo se añade TypeScript 5.9.3 como herramienta y el
enlace interno shared. `ignore` 5.3.2 y `js-yaml` 4.3.0, ya usados por los ensayos
de infraestructura, se declaran directamente en devDependencies del cliente;
sus versiones y registros resueltos siguen iguales.

Se conservan los dos locks de cliente/servidor como entradas **compatibles** para
los Dockerfiles antiguos y verificadores históricos que copian esos directorios
sin el padre. `npm run check` compara sus dependencias y todos sus registros con
el lock raíz. Un cambio futuro de dependencias debe actualizar los locks
afectados y repetir ese check; no mantener tres grafos independientes.

Para reproducir el modo aislado: copiar un workspace **fuera del monorepo**, con
su `package.json` y lock; ejecutar `npm ci --ignore-scripts --no-audit --no-fund`.
Prisma se genera explícitamente desde una copia de schema sin `.env`. Dentro del
monorepo, usar los comandos raíz o `--workspace`: npm detecta el padre y utiliza
su instalación. El modo aislado no incluye los probes raíz de shared ni tsc.

| Clase | Propietario actual |
| --- | --- |
| Runtime servidor | server: Express, JWT/bcrypt, Prisma Client, proveedores, HTTP/compresión/seguridad |
| CLI Prisma | server devDependency exacta 6.19.3; fuera del runtime podado |
| Runtime navegador | client: React/DOM/Router, Dexie, gráficos, iconos y PDF |
| Build cliente | client: Vite, plugin React, Tailwind/plugin, tipos React; clasificación histórica preservada |
| Pruebas/lint cliente e infraestructura | client: Vitest, ESLint/plugins, globals, ignore, js-yaml |
| Herramientas nuevas | raíz: TypeScript exacto y dependencia de desarrollo shared |
| Código compartido | shared: cero dependencias de runtime y cero proveedores/secretos |

## Comandos

| Tarea | Desde la raíz |
| --- | --- |
| Instalación reproducible | `npm ci` |
| Frontend dev | `npm run dev:client` |
| Backend dev | `npm run dev:server` |
| Unitarias cliente / servidor | `npm run test:client` / `npm run test:server` |
| Unitarias de workspaces | `npm run test:unit` |
| Pruebas nuevas | `npm run test:monorepo` |
| Matriz completa aislada | `npm test` o `npm run verify:monorepo` |
| Build frontend | `npm run build:client` |
| Validación backend JS | `npm run build:server` |
| Tipos shared | `npm run typecheck` o `npm run build:shared` |
| Todos los builds/checks | `npm run build` |
| Prisma Client offline | `npm run db:generate` |
| Estructura, versiones y locks | `npm run check` |
| Grafo real de la SPA sin código servidor/Prisma | `npm run check:bundle` |
| Resolución interna | `npm run check:shared` |
| Lint nuevo / lint global histórico | `npm run lint:tooling` / `npm run lint` |
| Suite específica existente | `npm run test:operations:integration --workspace nexlift-server` |

El desarrollo del servidor conserva dotenv/start/variables anteriores; elegir
exclusivamente un destino de desarrollo autorizado. No ejecutar dev/start contra
el `.env` remoto existente durante verificaciones. Los comandos de pruebas no lo
necesitan. No usar `db:push`, `migrate` ni comandos de staging persistente como
parte de esta fase.

## Pruebas y reproducibilidad

`npm test` crea otra copia sin `.env`, dependencias, dist, credenciales o datos
privados, instala con el lock raíz y genera Prisma offline. Ejecuta primero las
730 históricas sobre su fixture 0_init, después incorpora la migración provisional
original **solo a la copia de ensayo** y ejecuta 70+70+47+56+34: **1,007**.
Después añade doce pruebas de límites/resolución web y cierre de ensayos, para
**1,019 únicas**.
Los 48 smoke tras poda y la repetición unitaria conjunta se reportan separados.
Todos los SQL/HTTP/Edge usan los runners existentes, clústeres nuevos, marcador
aleatorio, identidad PG y loopback. PostgreSQL 18 y Edge Windows son necesarios
para la matriz completa; las unitarias, checks y builds pueden usarse aparte.

Los runners mantienen la eliminación segura de sus propios clústeres/perfiles;
si Windows devuelve EBUSY al retirar exclusivamente el log PostgreSQL después de
31/31 aserciones aprobadas, el orquestador admite un único reintento en otro
clúster nuevo. Antes verifica la raíz temporal propia, PGDATA sin PID y
`pg_ctl status` detenido (o que solo quede el log). No reintenta eliminaciones,
no modifica runners anteriores y nunca acepta aserciones fallidas/omitidas.
El remanente y el intento diagnóstico se conservan sin sumarlos al total único.
la copia de código/logs de esta fase se conserva para inspección. Las evidencias
nuevas van únicamente a `server/audit/monorepo`, nunca a informes históricos.
El backend no tiene una compilación TypeScript: su build es validación sintáctica,
complementada con generación nativa, arranque Express y pruebas HTTP/SQL reales.
Se verifica el grafo del probe web y se conservan las fuentes completas del cliente
y sus entradas/chunks: no se añaden dependencias del servidor a la SPA.

## Docker y EasyPanel

El `Dockerfile` operativo sigue intacto y conserva Node 20 y su CMD antiguo con
db push. No ejecutarlo para estas verificaciones ni adoptar su arranque como
procedimiento nuevo. La Fase 4.1 no despliega ni modifica el panel.

`Dockerfile.rehearsal` instala desde los manifests/lock raíz y `.npmrc`; conserva
stages `client-build`, `server-build`, `migration-job`, `production-deps`, `runtime`.
La etapa compartida incluye el paquete shared de desarrollo. La generación es
offline mediante el wrapper nuevo. Solo `server/node_modules` podado, fuentes de
API/Prisma/deploy y `client/dist` entran al runtime; el CLI queda en el job separado.
No se añade shared al runtime porque la API todavía no lo consume. El job no se
ejecuta en esta fase. `.dockerignore` admite únicamente manifests/lock/config raíz,
shared/src y el wrapper necesario; mantiene exclusiones de secretos/archives/tests.

`Dockerfile.staging`, Compose, nombres de imágenes, puerto, rutas dist y comandos
de HTTP/job conservan su interfaz. Los permisos y el gate SQL anteriores siguen
vigentes. Sin Docker CLI, las reglas del contexto y etapas se validan estáticamente;
el build/run real Linux, engines/OpenSSL, usuario, señales, red y EasyPanel quedan
pendientes. No se acredita una imagen por haber probado Windows.

## TypeScript: preparación, sin iniciar 4.2

`configs/tsconfig.base.json` define strict/noEmit/ES2022 sin aplicarlo al JavaScript
histórico. La base NodeNext conserva el ESM real del servidor y los imports `.js`;
la base Vite usa Bundler/ESNext/react-jsx y DOM. Shared comprueba únicamente su JS
mínimo con allowJs/checkJs, sin DOM ni tipos globales Node. No se añaden aliases
`paths` que Node no pueda resolver ni se cambia el runtime a CommonJS/Fastify.

Plan para 4.2, no ejecutado:

1. Activar módulos pequeños y puros con strict y pruebas de caracterización;
   conservar entradas JS mientras existan consumidores antiguos.
2. Publicar tipos/declaraciones de shared solo cuando haya contratos reales
   revisados; no duplicar las definiciones JS actuales en un archivo paralelo.
3. En Node, añadir tipos Node/Express/JWT exactos cuando se adopte cada módulo;
   consumir los tipos generados por Prisma sin extender schema/DDL.
4. En React, reutilizar los tipos React 19 existentes y migrar componentes a TSX
   por grupos; añadir ESLint TypeScript solo para esos archivos. Mantener la deuda
   histórica separada y no activar checkJs sobre toda la SPA.
5. Mantener noEmit para cliente y shared inicial. Para módulos servidor compilados,
   acordar `outDir`, declaraciones, sourceMap e inlineSources en un build separado;
   probar `node --enable-source-maps` en ensayo antes de cambiar el inicio. No
   publicar mapas del cliente con secretos ni cambiar source maps de producción aquí.
6. Tipar límites API como validación de datos desconocidos, no casts que omitan
   validadores. Preservar todos los invariantes de UUID/hash/acuses, propietario,
   FIFO/backoff, fechas CDMX, RIR/RPE, CAS, transacciones Dexie y SQL de 3.5.

Referencias de diseño: [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/),
[npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/),
[resolución TypeScript](https://www.typescriptlang.org/tsconfig/moduleResolution.html).
