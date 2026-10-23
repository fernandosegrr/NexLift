# NexLift v4.0 — Fase 7: backend modular y Fastify

Trabajo: 22 de octubre de 2026, Windows/x64, America/Mexico_City.

**Fase 7 completada y certificada en desarrollo. `npm test`: salida 0.**
Matriz final nueva: 1,355 pruebas únicas, 76 comandos con salida 0 y 613
repeticiones excluidas del total. Evidencia final creada el 22/10/2026 a las
08:40:41 UTC; comprobación de conservación posterior sin diferencias inesperadas.
Producción no accedida. Baseline PROVISIONAL. Sin commits ni despliegues.

## 1. Estado de 7.1–7.5

| Bloque | Resultado de desarrollo |
| --- | --- |
| 7.1 Auditoría y arquitectura | Repositorio, cambios previos, CLAUDE, informes 5/6, rutas, seguridad, Prisma, jobs, consumidores, monorepo y Docker inspeccionados. Inventario ejecutable de 75 endpoints. |
| 7.2 Modularización | 13 dominios; servicios, controladores y transporte separados por responsabilidad; misma implementación de negocio en Express y Fastify. |
| 7.3 Fastify real | Fastify 5.12.7, plugins nativos, JSON/query compatibles, hooks explícitos, estáticos/PWA, entrypoint de ensayo y cierre ordenado. |
| 7.4 Integración | Comparación HTTP con bases independientes, operaciones/PR/backups, arranque real, Atajos y Edge/Dexie contra la API completa. |
| 7.5 Estabilización | Matriz integral nueva aprobada: 1,355 únicas; tipos/builds/artefactos/instalaciones aprobados, sin lint nuevo. Docker/Linux/EasyPanel pendientes de otro entorno; activación productiva expresamente bloqueada. |

## 2. Arquitectura anterior y nueva

Antes, `server/src/index.js` concentraba configuración, inicialización de Prisma,
middlewares, 71 registros directos de rutas, registro delegado de operaciones,
reglas HTTP, consultas, proveedores y temporizadores. Algunas escrituras críticas
ya estaban extraídas y protegidas por transacciones de Fases 1–6.

Ahora `index.js` conserva el entrypoint Express, con inicialización explícita.
`createExpressApp` y `createApp` construyen dos transportes sobre el mismo catálogo
y los mismos servicios. Ninguno conecta Prisma, lee .env ni arranca trabajos al
construir aplicaciones. Fastify atiende la API completa; no hay proxy a Express,
`@fastify/express`, `middie`, segunda base ni implementación deportiva paralela.

## 3. Estructura modular

```text
server/src/
  app/                  factories, catálogo, contratos HTTP, parser, límites
  modules/
    auth/               cuentas, perfil, recuperación y autenticador independiente
    routines/           importación, edición, archivo y consultas de planificación
    exercises/          catálogo, músculo y matching determinista
    mesocycles/         bloques y fases de rutina
    ai/                 planificación opcional y generación determinista
    workouts/           sesiones, series y servicios de escritura existentes
    operations/         protocolo idempotente y conflictos existentes
    shortcuts/          next-set, log-set y telemetría de sugerencias
    notifications/      suscripciones, push, persistencia y reprogramación
    training/           estadísticas, progreso y descarga adaptativa
    bodyTracking/       composición corporal, hábitos y fotos
    goals/              objetivos y semanas completadas
    backups/            exportación, restauración y coordinación de respaldo
  infrastructure/
    external/           fotos y configuración explícita de proveedores
    jobs/               ciclo de vida del proceso
  entrypoints/          Fastify opt-in de desarrollo/ensayo
  services/             servicios Prisma/transaccionales probados, conservados
  generated/            fachadas reproducibles para consumidores JS existentes
```

No se crearon carpetas vacías ni repositorios de persistencia genéricos. PR sigue
en `services/personalRecords.js`: es un servicio transaccional compartido, no un
dominio con rutas nuevas inventadas.

## 4. Endpoints y cobertura

**75/75 endpoints declarados**, igualdad de método/ruta comprobada contra la
fuente recibida y las cuatro operaciones delegadas. **69 protegidos y 6 públicos**:
cuatro de cuenta/recuperación y dos de salud. HEAD para GET y OPTIONS CORS son
implícitos y no se cuentan como rutas o pruebas nuevas.

| Dominio | Rutas |
| --- | ---: |
| Auth/perfil | 9 |
| Rutinas | 8 |
| Mesociclos | 5 |
| Ejercicios | 2 |
| IA opcional | 3 |
| Entrenamientos | 10 |
| Operaciones/conflictos | 4 |
| Atajos/sugerencias | 3 |
| Notificaciones | 5 |
| Estadísticas/progreso | 8 |
| Cuerpo/hábitos/fotos | 8 |
| Objetivos | 4 |
| Backups | 4 |
| Salud | 2 |

[Matriz por endpoint](API-MATRIX.md) y [contratos extraídos](api-inventory.json)
incluyen auth, filtros de propietario, validadores, parámetros/query/body,
expresiones de respuesta/error, cabeceras, límites, llamadas Prisma, servicios y
consumidores encontrados. El código enlazado conserva las restricciones runtime;
no se atribuyen tipos que los controladores legacy no garantizan.
No hay API administrativa ni endpoints de PDF/binarios en el alcance recibido.
Las fotos se envían como JSON/base64 o referencias; los PDF se generan en cliente.

## 5. Middleware, hooks y autenticación

Autenticación central independiente de framework: HS256, Bearer, forma de claims,
cuenta activa y tokenVersion. El middleware Express anterior delega en ese servicio;
Fastify lo llama mediante preHandler nativo. JWT inválido/caducado/revocado: 401;
prohibiciones de negocio: códigos existentes; dependencia PostgreSQL temporal: 503
con Retry-After. Errores internos no se convierten en credenciales inválidas.

Cada ruta lleva guards ordenados. El catálogo falla al construir si encuentra
una ruta sin auth fuera de la lista pública explícita. El parser se ejecuta antes
de auth, y los límites conservan su posición relativa a auth y validación.
El propietario procede del token; no se copia desde body, query ni parámetros.
Proxy de un salto y allowlist CORS conservados.

## 6. Equivalencia Express/Fastify

Solicitudes reales a dos servidores, estados iniciales y bases PostgreSQL
independientes. Se comparan códigos, JSON, tipos/null/opcionales, cabeceras y
estado final de los 17 modelos más el journal de recibos. No se ejecuta el segundo
transporte sobre una base ya alterada por el primero.

Normalizaciones limitadas a IDs generados, tiempos generados y salts bcrypt.
Las versiones derivadas de IDs distintos se verifican individualmente con
`sessionVersion`; los requestHash se comprueban contra las entradas canónicas,
y se comparan literalmente cuando las entradas son iguales. Los checksums de
backups se validan antes de normalizar su comparación estructural.

Sin esquemas AJV de respuesta, coerciones, defaults ni eliminación de propiedades.
Se conservan arrays/objetos JSON, parser extendido de query, parámetros y reglas
de cada validador. Gzip/deflate, UTF, errores de codificación, listas CORS y ETags
JSON/304 se verifican. El límite de 10 MiB evita confundir un 413 con pérdida de red.
Los charset equivalentes no se comparan por mayúsculas. Los ETags de archivos de
los plugins pueden diferir entre transportes; no se promete identidad binaria de
todas las cabeceras generadas por los frameworks.

## 7. Servicios compartidos y separación del framework

Los dominios reciben Prisma y servicios explícitos. Las escrituras conservan los
servicios existentes; los helpers deportivos continúan en `packages/shared`.
Los controladores legacy usan un pequeño puerto de entrada/salida propio:
datos simples y `ResponseOutput`, que recoge estado/cabeceras/JSON. No reciben
objetos Fastify/Express ni acceso a sockets. Sólo el adaptador escribe bytes.
El puerto conserva la sintaxis status/set/json para evitar reescribir reglas ya
probadas; no es un servidor Express oculto ni ejecuta middleware Express en Fastify.

La fuente recibida vive únicamente como fixture. Los arneses históricos reconstruyen
sus posiciones con las **102 sentencias vivas trasladadas**, conservando aserciones
de contenido; sólo revierten DI/logging y correcciones explícitamente documentadas.
Los tests no ejecutan una segunda versión monolítica de las reglas.

## 8. Persistencia y transacciones

Prisma **6.19.3**, modelo y tres migraciones recibidas intactos. Se conserva el
adaptador de historial Fase 6, propiedad directa, snapshots, retención y restricciones.
No se fragmentaron Serializable, locks, reintentos, recálculo de PR ni commits.
La comparación incluye rollback conjunto de sesión, series, PR y recibo ante un
fallo SQL tardío. La generación de Client usa un schema temporal sin .env ni SQL.
Los únicos cambios en handlers de persistencia preexistentes son inyección del
logger seguro de importación/edición; no se alteran sus consultas/transacciones.

## 9. Idempotencia y offline

operationId, requestHash, expectedVersion, performedAt, sessionVersion, comprobantes,
locks y semántica 409/503 conservados. Sin cambios en hashes, motor offline, Dexie,
resolución ni migraciones. Se comprueban commit único concurrente, hash distinto
con UUID repetido, consulta de recibo de otra cuenta, pérdida de respuesta y
eliminación de sesión conservando comprobante. El replay conserva el código real
200 y la marca replayed; la primera creación/append devuelve 201 según el protocolo.

Sync y resolución se fuerzan deshabilitados cuando el runtime es de producción.
La activación de la sincronización nueva continúa bloqueada.

## 10. Atajos y notificaciones

Atajos conservan Bearer, JSON, peso/reps, RIR/RPE legacy, fecha civil CDMX,
Smart Loading, series acumuladas y descanso. Verificación HTTP automatizada;
**no se utilizó un iPhone físico**.

Web Push y Cloudinary se inyectan; los ensayos usan fakes o fallos sintéticos.
Construir apps no configura SDKs ni consulta recordatorios. Los jobs sólo arrancan
explícitamente; una lease por cliente Prisma impide duplicarlos. Se conserva
reprogramación futura, disparo reciente y descarte de avisos antiguos.
El cierre espera persistencia/push en curso y cancela temporizadores sin borrar
su respaldo de reinicio. Fallos externos no revierten un entrenamiento confirmado.
El agendado se serializa únicamente por usuario/ejercicio: dos solicitudes
simultáneas no pueden instalar dos timers tras esperar el mismo upsert. Se
conserva el último aviso aceptado, incluso si el cierre empieza mientras espera.

## 11. SPA, estáticos y Service Worker

Fastify sirve `client/dist`, assets inmutables, HTML sin caché, manifest e iconos.
SW se sirve con no-cache y sin ampliar su scope. Cliente y `public/sw.js` no se
modificaron. El build Vite real y sus recursos se consultan desde Fastify.
API desconocida, incluidas variantes codificadas y métodos no implementados,
devuelve error JSON, nunca index.html. API privada no hereda caché de estáticos.

## 12. Errores encontrados y corregidos

- Typo recibido `vapidConfigured` inexistente en test-creatine: se usa la capacidad
  inyectada y se verifica el 400 sin configuración y el 200 con proveedor simulado.
- El mismo flujo pasaba un objeto al SDK Web Push; se serializa JSON en el servicio.
  El fallo anterior 500 no era una funcionalidad válida que hubiera que conservar.
- Carrera recibida en recordatorios: dos llamadas paralelas comprobaban el Map
  antes del await SQL y producían dos envíos. Se reprodujo con proveedor fake,
  se serializó por clave y se comprobaron concurrencia y drenado al cerrar.
- SPA recibida absorbía API desconocida; ambos transportes usan frontera API explícita.
- SW tenía caché anual de estáticos; se exige revalidación conservando bytes y scope.
- Headers de auth, límites transmitiendo, codificaciones y ETags se corrigieron en
  las nuevas fronteras tras comparar solicitudes reales.
- Instalación limpia necesita generar Client antes del primer build estricto.
  La primera matriz falló ahí; no se presentó como aprobada y se reinició completa.
- El árbol emitido omitía declaraciones manuales de los puertos nuevos. Se copian
  junto al JS y se compila un consumidor strict independiente del build. Las
  corridas anteriores se cancelaron en controles puros después de cerrar sus
  runners desechables; ninguna se presenta como certificación final.

[Intentos, causas y diagnósticos conservados](development-checks.json).
Los fixtures nuevos se ajustaron a contratos existentes, no al revés: envoltura
workoutLog, 200/201 de replay/append, campos de operaciones y fix-weights.

## 13–16. Pruebas nuevas, total, npm test y entornos

**Resultado exacto final de `npm test`: salida 0; 76/76 comandos con salida 0.**
**1,290 históricas + 65 nuevas = 1,355 pruebas únicas aprobadas.** Las nuevas son
26 de transporte/seguridad/artefactos, 8 de notificaciones/ciclo de vida y 31 de
PostgreSQL/HTTP/arranque/build/rendimiento. Las 613 repeticiones de la matriz,
incluidas las 31 offline originales sobre Fastify, no incrementan ese total.

| Verificación final | Resultado |
| --- | --- |
| HTTP nativo, seguridad, jobs y tipos emitidos | 34/34 |
| Equivalencia Express/Fastify con estados SQL independientes | 31/31 |
| Offline histórico, Edge/IndexedDB | 31/31 |
| Offline sobre modelo Fase 6 | 31/31, repetidas |
| Offline sobre Fastify completo | 31/31, repetidas |
| Pruebas históricas restantes | Aprobadas, sin retirar aserciones |
| Arranque emitido y SIGTERM/SIGINT | Aprobados |
| Runtime Fastify tras quitar dependencias de desarrollo | Aprobado |

Entorno final: Windows x64, Node 24.22.0, npm 11.19.1, Prisma 6.19.3,
PostgreSQL 18.4 desechable y Microsoft Edge real. El navegador prueba React
compilado, formularios, IndexedDB/Dexie, reinicios de navegador/backend/PostgreSQL,
dos procesos, actualización del SW y cargas de hasta 5,000 operaciones.

[Matriz final y hashes](matrix-evidence.json), [comparación SQL/HTTP](phase7-evidence.json),
[Fastify/Edge offline](fastify-offline-evidence.json) y [conservación final](final-checks.json).
La copia íntegra de ensayo y sus 76 logs permanece en
`C:/Users/guerr/.codex/artifacts/nexlift-verification/nexlift-phase7-verification-ydCXK4`.
El log exterior es `C:/Users/guerr/.codex/artifacts/nexlift-phase7-npm-test-final4-20261022.private.log`.
Los comandos acumulan 25.2 minutos; las corridas anteriores fallidas/canceladas
se conservan como diagnóstico y no se incluyen en la certificación.

La matriz ejecuta Express, Fastify, PostgreSQL desechable y sus migraciones,
Edge/IndexedDB, JWT, PR, operaciones/conflictos, backups/recovery, proveedores
simulados, SPA real, instalaciones limpias y runtime sin herramientas de desarrollo.
No se suman iteraciones concurrentes, benchmarks, rutas de una matriz ni reruns.

## 17. TypeScript, builds y lint

Fronteras nuevas TypeScript strict, tipos Node 24, ESM y artefactos con imports
resolubles. Build copia los servicios JS al árbol emitido y mantiene las fachadas
CommonJS de consumidores existentes. Fastify runtime usa JS emitido; no ts-node/tsx.
Los locks raíz/servidor conservan el mismo grafo nested y versiones/integridades.

Verificación integral: typechecks strict, builds shared/backend/frontend,
check:generated, check:bundle, lint TS/tooling/persistencia y módulos nuevos aprobados.
Instalaciones limpias raíz, cliente y servidor aprobadas, locks preservados;
frontend compilado también con las flags de producción deshabilitadas.
El lint global conserva su deuda histórica de **27 errores y 3 advertencias**;
la comparación final registra **0 errores y 0 advertencias nuevos**. El lint
global no se declara verde; su comprobador de regresiones sí aprueba.
[Comparación exacta](offline-lint-evidence.json).

## 18. Rendimiento comparativo

Se miden arranque de factories, 100 muestras tras warmup por endpoint, p50/p95,
50 solicitudes concurrentes y consultas de perfil con PostgreSQL. Procesos
independientes añaden RSS/heap y arranque/cierre tras 200 health requests con DB fake.
No confundir memoria compartida del ensayo SQL con memoria aislada por framework.
No se deshabilitan validación/auth ni integridad para medir.

| Medida local (ms salvo memoria) | Express | Fastify |
| --- | ---: | ---: |
| Health p50 / p95 | 1.067 / 1.791 | 0.971 / 1.273 |
| Perfil JWT + PostgreSQL p50 / p95 | 3.581 / 4.687 | 3.422 / 3.968 |
| Lote health 50 concurrentes | 99.756 | 107.349 |
| Lote perfil 50 concurrentes | 69.885 | 76.652 |
| Factory SQL, arranque | 14.727 | 221.657 |
| Proceso independiente, arranque | 326.962 | 613.164 |
| Proceso independiente, RSS MiB | 103.01 | 115.11 |
| Proceso independiente, heap usado MiB | 18.81 | 24.67 |
| Proceso independiente, cierre | 0.985 | 1.455 |

Son muestras sintéticas locales, sin significancia estadística ni equivalencia
con carga productiva. Fastify mejoró la latencia secuencial medida, pero tuvo
mayor arranque/memoria y tardó más en estos lotes concurrentes. El perfil SQL
cuesta más que health en ambos; no se instrumentó SQL por separado para atribuir
un cuello de botella. Validación y errores se prueban funcionalmente; no se
aisló su coste en un microbenchmark. No se promete mejora universal.

## 19. Docker y Linux

Docker CLI no está instalado; **imagen, Linux/OpenSSL y EasyPanel no certificados**.
`Dockerfile.fastify-rehearsal` extiende los targets Node 24 multistage de ensayo,
copia JS emitido/Prisma/runtime, usa usuario node, healthcheck y STOPSIGNAL SIGTERM.
Conserva el job de migraciones separado y no ejecuta DDL al arrancar HTTP.
Los Dockerfiles operativo, rehearsal y staging anteriores conservan sus bytes.

El nuevo entrypoint acepta sólo PostgreSQL loopback con nombre desechable y
comentario/marker verificados. Una imagen ensayada necesita compartir ese destino
local; no se presenta como lista para conectar a la base de EasyPanel.
El Dockerfile operativo antiguo mantiene sus riesgos previos, incluido db push;
no se ejecutó ni está autorizado como mecanismo de activación nuevo.

## 20. Arranque, recuperación y gates productivos

Con **Node 24.22.0 / npm 11.19.1**, desde la raíz:

```sh
npm ci
npm run db:generate
npm run build
npm run test:backend
npm run test:fastify:integration
npm run test:fastify:offline
npm test
```

`test:fastify:integration` crea un clúster nuevo, identifica el destino, aplica
sólo allí las migraciones, arranca ambos servidores y el entrypoint real,
y cierra sus procesos. No acepta URLs operativas ni lee .env.
Las pruebas de navegador también crean y verifican su propio clúster.

Para una instancia interactiva con **un clúster desechable ya verificado**:
`npm run dev:fastify` compila y ejecuta `npm run start:fastify --workspace nexlift-server`.
Exige `NEXLIFT_FASTIFY_REHEARSAL=true`, NODE_ENV distinto de production,
JWT_SECRET sintético, DATABASE_URL local `nexlift_ops_test_*` y
NEXLIFT_DISPOSABLE_MARKER igual al comentario de esa base. PORT/HOST opcionales.
La falta de build/configuración/identidad/esquema hace fallar el arranque; no se
intenta reparar ni migrar. No se imprimen claves o URLs de conexión.
`npm start --workspace nexlift-server` sigue ejecutando Express.

Gates futuros: baseline/copia objetivo autorizada; backup completo con journal;
ensayo de migración/recuperación representativo; imagen Linux; autorización de
activación y egress/proveedores reales; prueba canaria con RPO/RTO y PWA.
La activación exige otro entrypoint/gate explícitamente autorizado: el actual
bloquea NODE_ENV=production. No se cambió ningún despliegue ni default operativo.

Recuperación de transporte: drenar Fastify, conservar DB y journal, arrancar
Express de **esta misma revisión modular** y verificar ready/auth/recibos/historial.
No ejecutar migraciones inversas ni usar un lector previo a Fase 6 sin adaptador.
Conservar el build/client compatibles y reconciliar cualquier respuesta perdida.

## 21. Preparación para Fase 8

Quedan límites claros de aplicación/transporte, catálogo verificable, servicios
transaccionales compartidos, errores seguros y ensayo reproducible. Las decisiones
deportivas/modelo pendientes siguen en sus fases originales. **Fase 8 y Coach no
se iniciaron.** No se añadieron modelos, colas ni infraestructura distribuida.

## 22. Conservación y producción

El cwd de la conversación estaba vacío; el repositorio real está en
`C:/Users/guerr/OneDrive/Escritorio/NexLift`, como ya documentaba Fase 6.
Se ejecutó status y se revisó el diff acumulado antes de editar.
No había AGENTS.md adicional aplicable. Respaldo verificable previo de **672
archivos**, SHA-256, status y diffs, excluyendo env/secretos/archivos privados:
`C:/Users/guerr/.codex/artifacts/nexlift-phase7-received-7b8631e7-7078-4880-a44a-f2ddbff75041`.

Comprobación final: **24 recibidos modificados, ninguno eliminado;
403 protegidos idénticos**, incluidos cliente, shared, schema/migraciones,
informes anteriores y Dockerfiles operativos. Los nuevos resultados se escriben
en audit/backend, sin sustituir las evidencias históricas. Los **564 hashes de
fuente de la matriz coinciden** con el código final; git diff --check devuelve 0.
Sin cambios staged. Sin reset/clean/checkout, commits ni despliegues.

**Producción permaneció intacta. Baseline PROVISIONAL. Offline nuevo deshabilitado
en producción. No se usaron proveedores externos reales ni bases persistentes.**
