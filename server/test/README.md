# Fase 1.1 — autorización de rutinas

Estado: **COMPLETADO**. Alcance: `PUT /api/routines/:id`.

## Causa y corrección

El handler comprobaba el propietario de la rutina fuera de la transacción y
actualizaba días y ejercicios usando solamente sus IDs. Un ID ajeno podía alcanzar
la edición, el archivado o la restauración sin comprobar la relación con la rutina.

La corrección comprueba nuevamente el propietario dentro de la transacción,
bloquea la rutina, sus días y sus ejercicios, y valida **todas** las referencias
antes de la primera escritura. Rechaza IDs ajenos, inexistentes, malformados y
duplicados, incluso duplicados entre días. Solamente un ID omitido o `null`
representa un recurso nuevo; su ID lo genera el servidor.

La interfaz (`EditRoutine.jsx`, consumidor único de `api.updateRoutine`) permite
reordenar días y ejercicios dentro de su día. No contiene un traslado de ejercicios
entre días. Se conservan estas operaciones y se rechaza enviar un ID de ejercicio
bajo un día distinto, aunque sea de la misma rutina.

Las escrituras incluyen condiciones de propietario y relación. La transacción
usa `Serializable`, con bloqueos PostgreSQL `FOR UPDATE` sobre la cadena de
propiedad; los parámetros SQL se interpolan mediante `$queryRaw` etiquetado.
Las restauraciones comprueban la pertenencia actual a la papelera del usuario:
el catálogo leído antes de la deduplicación no autoriza ninguna transferencia.
Se bloquea también la rutina/día de archivo y se impide archivar dentro de la
propia rutina editada, para evitar que un borrado posterior alcance ese historial.

La llamada externa de deduplicación permanece fuera de la transacción. Se
conservan sus reglas de nombres y las reglas anteriores de creación, renombrado,
archivado y restauración. Cambiar el nombre de un ejercicio con historial sigue
archivando su ID original y restaurando/creando otro movimiento; una edición
ordinaria o un reordenamiento conserva los IDs.

Referencia de transacciones de la versión utilizada:
[Prisma ORM v6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

## Respuestas HTTP

| Estado | Condición |
| --- | --- |
| 200 | Edición legítima confirmada |
| 400 | Estructura/referencias inválidas, repetidas o fuera del ámbito permitido |
| 404 | Rutina inexistente o no perteneciente al usuario, sin distinguir ambos casos |
| 409 | Conflicto concurrente; recargar y volver a intentar |
| 500 | Error inesperado, con rollback y respuesta genérica |

Los IDs inexistentes y los de otros usuarios reciben el mismo error genérico.
Los conflictos Prisma `P2034`/`P2025` y SQLSTATE `40001`/`40P01` se traducen a 409;
no se reintenta automáticamente una edición basada en una estructura obsoleta.

## Archivos de esta fase

- `server/src/index.js`: registra el handler extraído manteniendo `authMiddleware`.
  Los consumidores restantes del helper de papelera reciben explícitamente el
  mismo cliente Prisma que antes usaban por defecto; no cambia su comportamiento.
- `server/src/routes/updateRoutine.js`: handler verificable sin arrancar el servidor,
  validación de referencias, bloqueos, condiciones de escritura y errores HTTP.
  Incluye los helpers originales de normalización y papelera extraídos sin cambiar
  sus reglas de negocio.
- `server/package.json`: incorpora `npm run test:integration`; conserva `npm test`.
- `server/test/run-routine-integration.mjs`: inicia y apaga un clúster desechable local.
- `server/test/fixtures/routine-schema.sql`: subconjunto relacional mínimo de tablas
  de prueba, incluidos los FK con cascada de las relaciones históricas.
- `server/test/routine-update.integration.test.js`: regresiones HTTP con Prisma y
  PostgreSQL reales, comparación de filas y conexiones concurrentes.
- `server/test/README.md`: este informe e instrucciones reproducibles.

## Ejecución reproducible

Requiere dependencias instaladas según los lockfiles, cliente Prisma generado y
binarios PostgreSQL (`initdb`, `pg_ctl`, `createdb`). No requiere Docker ni una
base ya existente.

Desde `server/`:

```powershell
npm test
npm run test:integration
```

En Windows se busca PostgreSQL en `C:/Program Files/PostgreSQL/18/bin`.
Para otra instalación, establecer **solo** `NEXLIFT_TEST_PG_BIN` con la carpeta de
binarios; en otros sistemas se utiliza el PATH si esta variable no está definida.
No se proporciona ni se acepta una URL de base como configuración del runner.

Desde `client/` (comando utilizado para las 76 pruebas existentes):

```powershell
node node_modules/vitest/vitest.mjs run --no-cache --configLoader native
```

El runner crea un clúster nuevo en una carpeta temporal, con puerto dinámico y
escucha exclusivamente en `127.0.0.1`. Crea `nexlift_routine_test` y pasa su URL
explícita al proceso hijo; **no carga `.env`**. La suite valida host, puerto,
usuario y nombre de base antes de crear tablas o ejecutar fixtures. No debe
invocarse directamente ni adaptarse para apuntar a una base persistente.
El runner apaga el clúster antes de eliminar su directorio temporal, comprobando
su ruta absoluta. Los fixtures y TRUNCATE solo existen dentro de ese clúster nuevo.
No utiliza `db push`, migraciones, restauraciones ni scripts de corrección.

## Resultados y cobertura

Antes de corregir la autorización, se ejecutaron las primeras 20 regresiones:
**8 pasaron y 12 fallaron**. Se reprodujeron respuestas 200 para referencias
ajenas, duplicadas y archivadas; un ID inexistente devolvía 500.

Resultado final:

| Suite | Pasaron | Fallaron | Omitidas |
| --- | ---: | ---: | ---: |
| Backend original | 104 | 0 | 0 |
| Frontend original, 5 archivos | 76 | 0 | 0 |
| Integración nueva, PostgreSQL 18.4 | 48 | 0 | 0 |
| Total | **228** | **0** | **0** |

Las nuevas pruebas cubren usuarios A/B; referencias a otras rutinas del mismo
usuario; payloads mixtos; duplicados; IDs nuevos/malformados; manipulación de
archivado; conservación de nombre, descripción, días, orden, series objetivo,
repeticiones y descansos; creación; renombrado con/sin historial; eliminación
segura; restauración por nombre; catálogo obsoleto; cambios de pertenencia
durante la deduplicación; y campos padre/usuario manipulados.

Ante rechazos se comparan todas las filas y timestamps de `Routine`,
`RoutineDay`, `Exercise`, `WorkoutLog` y `SetLog`. Las ediciones legítimas comparan
los registros históricos completos, incluidos IDs, fechas, notas, RPE y datos
unilaterales. Una prueba comprueba que una referencia inválida no alcanza siquiera
la primera escritura. Otra provoca un error SQL después de las mutaciones y el
archivado para comprobar el rollback completo.

Las pruebas concurrentes usan conexiones PostgreSQL reales: intentan cambiar
propietario/padres y registrar historial bajo los bloqueos del endpoint. Otra
mantiene una edición concurrente abierta, observa la espera en `pg_stat_activity`
y verifica un 409 real sin escrituras parciales del request rechazado. También
se comprueba la traducción de SQLSTATE 40001 generado dentro de una transacción.

## Límites e incidencias

- La suite prueba el handler HTTP real con principales autenticados de fixture.
  No vuelve a probar JWT, sesiones, navegador ni el proveedor externo de IA.
- El SQL de prueba reproduce el subconjunto necesario, no una copia de la base
  productiva ni todas las tablas del sistema. No se verificó el esquema instalado
  ni la versión PostgreSQL de producción.
- Los bloqueos pueden aumentar la contención. Una edición concurrente puede
  recibir 409; el cliente ya muestra el mensaje del servidor. Se conserva el
  timeout transaccional de 20 segundos.
- Los demás endpoints de borrado, importación y rutinas IA conservan su alcance y
  comportamiento anteriores. Esta fase no certifica globalmente esas rutas ni
  resuelve los otros hallazgos de la auditoría.
- La primera ejecución encontró `mime-db` incompleto. Se restauraron dependencias
  con `npm ci --ignore-scripts --no-audit --no-fund` y se regeneró Prisma Client
  con una URL local inerte. Ningún lockfile cambió ni se conectó una base al generar.
- El primer arranque de `pg_ctl` en Windows retuvo pipes. Se detuvo ese clúster y
  se corrigió el runner usando salida no canalizada para el arranque. La revisión
  automática rechazó eliminar el directorio residual con «blocked by policy»;
  permanece detenido en `%TEMP%/nexlift-routine-tests-yHYDRm`. Las ejecuciones
  posteriores apagaron y eliminaron sus propios clústeres normalmente.

No se modificó `schema.prisma`, no se ejecutaron migraciones ni `db push`, y no
se realizaron conexiones/operaciones sobre producción. No hubo cambios visuales,
commits o despliegues. Se conservaron los cambios documentales preexistentes del
usuario. La siguiente fase no se ha iniciado.
