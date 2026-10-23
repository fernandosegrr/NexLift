# NexLift v4 — Fase 3.1

Estado: **COMPLETADO en desarrollo y bases desechables**. **800 pruebas únicas aprobadas: 730 anteriores + 30 de contrato + 40 de integración PostgreSQL/HTTP**. Baseline y migración nueva: **PROVISIONALES; activación en producción bloqueada**.

## 1. Auditoría y arquitectura

Se inspeccionaron `index.js`, los cinco endpoints solicitados, `routes/workouts.js`, `workoutTransaction.js`, `personalRecords.js`, `offlineQueue.js`, `offlineSync.js` y `api.js`, además de los requisitos/resultados conservados de 1.2 y 1.5.

| Escritura actual | Comportamiento confirmado | Integración nueva |
| --- | --- | --- |
| `POST /api/workouts/log` | Crea otra sesión en cada petición; fecha del servidor | `workout.create`, con ID estable e instante original |
| `PUT /api/workouts/:logId` | Sustituye todas las series; sin versión del cliente | `workout.replaceSets`, con versión obligatoria |
| `DELETE /api/workouts/:logId` | Borra sesión/series y recalcula PR | `workout.delete`, con versión y comprobante conservado |
| `POST /api/shortcuts/log-set` | Añade una serie por petición; selecciona la sesión diaria más antigua; admite `date` legacy | Crear sesión explícita o `workout.appendSet` sobre `logId` y versión explícitos |
| `POST /api/workouts/log-rest` | Crea otro descanso por petición; fecha del servidor | `rest.create`, con instante original |

La fase 1.5 ya agrupaba entrenamiento, series y recálculo de PR en una transacción Serializable y bloqueaba la cuenta y su cadena de propiedad. Se conserva ese mecanismo. El protocolo incorpora un comprobante en **esa misma transacción**. No abre otra transacción para los PR ni invoca proveedores dentro de ella.

La fase 1.2 conserva operaciones y acuses en almacenamiento local, bloquea elementos de propietario desconocido, inspecciona de forma automática mediante lecturas y evita convertir un GET de historial en un acuse. **Ningún archivo del cliente fue modificado en 3.1**. No hay replay nuevo ni conversión de operaciones antiguas.

La garantía es un único efecto por operación correctamente identificada y cuenta, mientras se conserve su comprobante. HTTP puede perder solicitudes y respuestas; no ofrece entrega exactamente una vez. Dos IDs diferentes representan operaciones diferentes, aunque los pesos coincidan. El servidor no inventa una fusión.

## 2. Archivos de esta fase

Modificados respecto al estado recibido:

- `server/src/index.js`: únicamente importación y montaje de las tres rutas nuevas.
- `server/src/routes/workouts.js`: protección de sesiones gestionadas por operaciones frente a PUT, DELETE y corrección masiva sin versión.
- `server/src/services/workoutTransaction.js`: presupuesto opcional de reintentos y tratamiento de la colisión de la PK del comprobante; comportamiento legacy de tres intentos conservado.
- `server/package.json`: tres comandos de pruebas/verificación.
- `README.md`: enlace a esta entrega.

Nuevos:

- `server/src/services/operationContract.js`.
- `server/src/services/workoutOperations.js`.
- `server/src/routes/operations.js`.
- `server/prisma/migrations/202610180001_phase31_operations/migration.sql`.
- `server/test/operation-contract.test.js`, `operation.integration.test.js`, `run-operation-integration.mjs`, `check-operations.mjs`, `verify-operations.mjs`.
- `server/test/fixtures/operation-http.mjs`.
- Este informe y las evidencias JSON de `server/audit/operations/`.

El repositorio ya contenía cambios de fases anteriores. El listado de `git diff` completo incluye esos cambios previos; no representa exclusivamente 3.1.

## 3. Modelo SQL y migración

`nexlift_operations."IdempotencyRecord"` es una entidad **gestionada mediante SQL versionado** y consultada mediante SQL parametrizado de Prisma. No se incorporó al DMMF de Prisma: los contratos históricos de backup derivan sus 17 modelos del DMMF y no se alteraron. `schema.prisma` sigue idéntico. La migración añade un esquema y una tabla, sin tocar tablas históricas ni convertir fechas antiguas.

Campos: `userId`, `operationId` UUID, `kind`, `requestHash` SHA-256, `performedAt` TIMESTAMPTZ(3), `performedDay` DATE, `createdAt` TIMESTAMPTZ(3), `state=confirmed`, `resourceId`, `responseStatus`, `response` JSONB.

Restricciones reales: PK `(userId, operationId)`, FK a `public."User"`, comprobaciones de hash, clase de operación, estado, código de respuesta, objeto JSON e instante/día finitos y coherentes con CDMX. Índice `(userId, resourceId)` para localizar sesiones gestionadas. El rol HTTP de las pruebas tiene SELECT/INSERT en los comprobantes; carece de UPDATE, DELETE y DDL y no puede escribir `_prisma_migrations`.

No hay TTL ni proceso de poda. La eliminación posterior de una sesión conserva el acuse original y el comprobante de eliminación. `resourceId` no tiene FK a la sesión: una FK con borrado en cascada permitiría repetir el efecto tras borrar el entrenamiento. La FK de cuenta se elimina en cascada únicamente al eliminar la propia cuenta, que ya no puede autenticarse.

La migración contiene una transacción SQL y una barrera que exige nombre de base de pruebas, comentario aleatorio y ajuste de sesión coincidente. El runner crea un clúster nuevo, verifica PGDATA, puerto, identificador del sistema y comentario de la base y configura ese ajuste exclusivamente allí. Un `migrate deploy` normal falla deliberadamente. Ni el staging persistente ni producción están habilitados.

`0_init` no se reescribió. SHA-256 conservado: `47c9542787e5cb64c36b2b8c079e05995ac5f98fe9c7b86b9b8c87747688ea2b`.

## 4. Contrato HTTP definitivo

Autenticación Bearer existente. La cuenta se obtiene de `req.userId`; `userId` en el cuerpo se rechaza. `source` describe el cliente, no concede permisos. No se aceptan campos desconocidos, coerciones numéricas parciales, NaN, Infinity, fechas imposibles o fechas sin zona.

### Enviar

`POST /api/v1/workout-operations`

```json
{
  "operationId": "430ecfd1-7ff6-41d4-9f1f-07c1d599645c",
  "kind": "workout.create",
  "source": "pwa",
  "performedAt": "2026-10-19T05:59:59.999Z",
  "exerciseId": "id-del-ejercicio-propio",
  "notes": null,
  "sets": [{ "weight": 80, "reps": 10, "rir": 2, "completed": true }]
}
```

Comunes obligatorios: UUID estable `operationId`, `kind`, `source` (`pwa` o `shortcut`), `performedAt` ISO con offset explícito y precisión máxima de milisegundos.

| kind | Campos específicos |
| --- | --- |
| `workout.create` | `exerciseId`, `sets`; `notes` opcional, por defecto null |
| `workout.appendSet` | `logId`, `expectedVersion`, `sets` con exactamente una serie |
| `workout.replaceSets` | `logId`, `expectedVersion`, `sets` |
| `workout.delete` | `logId`, `expectedVersion` |
| `rest.create` | `note` opcional; por ausencia, `Día de descanso` |

Cada serie admite `weight`, `reps`, `rpe` o `rir`, `completed`, `weightRight`, `repsRight`. Valores numéricos JSON reales; repeticiones y esfuerzo enteros. Se mantienen los límites existentes de series/peso/repeticiones y la convención `rpe = 10 - rir`; RIR nuevo explícito 0–4. Si se envían RIR y RPE, deben ser compatibles. `completed` ausente significa true; null se rechaza. Campos derechos ausentes/null permanecen null. Notas de hasta 2000 caracteres; no se truncan silenciosamente. `workout.create` requiere al menos una serie con trabajo real, como el contrato legacy.

Para la primera serie de un Atajo nuevo se utiliza `workout.create`, `source=shortcut` y un solo elemento en `sets`. El Atajo conserva el ID real de sesión y su versión para los anexos siguientes. No se emplea `operationId` como ID de sesión o de serie. El endpoint legacy de Atajos sigue disponible con su contrato anterior.

### Consultar

- `GET /api/v1/workout-operations/:operationId`: acuse confirmado de la cuenta autenticada.
- `GET /api/v1/workout-sessions/:logId`: sesión propia actual y `sessionVersion`, también para adoptar explícitamente una sesión legacy.

Las respuestas de operaciones llevan `protocolVersion`, `operation` con ID/tipo/origen/estado/instante/día, `result` y `replayed`. La primera creación o anexo devuelve 201; la primera sustitución/eliminación devuelve 200. Todo replay reconocido devuelve 200 y `replayed=true`. Los resultados contienen `workoutLog` y `sessionVersion`, `restLog`, o `{deleted:true, logId}` según el tipo. Los GET y respuestas del controlador de operaciones usan `Cache-Control: no-store`.

### Estados y errores

| HTTP | Uso |
| --- | --- |
| 200 | Consulta, replay confirmado, sustitución o eliminación confirmada |
| 201 | Primera creación de sesión/descanso o primer anexo |
| 400 | JSON mal formado, manejado por la protección HTTP existente |
| 401 | Credencial inválida/ausente o sesión revocada/inactiva, conservando el contrato de autenticación |
| 403 | No se utiliza para señalar propiedad de recursos; queda reservado para una futura política explícita que pueda revelarse sin filtrar existencia |
| 404 | Ejercicio/sesión/comprobante inexistente o ajeno, sin distinguir ambos casos |
| 409 | `OPERATION_CONTENT_CONFLICT`, `SESSION_VERSION_CONFLICT`, o `WORKOUT_VERSION_REQUIRED` en una escritura legacy peligrosa |
| 422 | `INVALID_OPERATION`: estructura, tipos, UUID, instante o versión inválidos |
| 503 | `OPERATIONS_NOT_READY`, `OPERATION_RETRY_REQUIRED`, dependencia caída o contención agotada; conservar el mismo ID y consultar/reintentar |
| 500 | Fallo interno no clasificado como recuperable; ningún detalle SQL/credencial se devuelve |

Errores del controlador incluyen `code`, `retryable`, `outcome` (`not_committed` o `unknown`); 503 añade Retry-After. El middleware de autenticación conserva su respuesta previa: una caída de su consulta devuelve 503, nunca 401. No se cambia esa respuesta para clientes existentes.

## 5. Repetición y conflictos

Se valida y normaliza antes de hashear. Fechas equivalentes con distintos offsets se convierten al mismo ISO UTC; claves de objeto no dependen del orden; RIR/RPE equivalentes y valores opcionales ausentes se canonizan. El orden de las series sí forma parte del contenido. El hash incorpora la versión del protocolo.

Misma cuenta + mismo ID + contenido canónico igual: se devuelve el JSON guardado, sin volver a escribir entrenamiento, series, PR ni comprobante. Con contenido distinto: 409. Dos cuentas pueden utilizar el mismo UUID en espacios independientes; ninguna puede consultar o reclamar el acuse de la otra ni apuntar a su ejercicio/sesión.

Un acuse es una fotografía del resultado **cuando se confirmó la operación**, no una consulta del estado actual. Incluso después de editar o borrar la sesión, repetir una creación confirmada devuelve su acuse y no la recrea. Para el estado actual se consulta la sesión. Un 404 de comprobante únicamente tiene sentido con el almacén disponible; si falta el almacén, se devuelve 503.

## 6. Concurrencia y versiones

Se conserva el bloqueo de cuenta `FOR NO KEY UPDATE`, la comprobación bloqueada de propiedad y Serializable de 1.5. La PK SQL aporta una protección independiente de memoria/proceso. La lectura del acuse, mutación, PR e INSERT del acuse se confirman conjuntamente.

Los abortos explícitos de serialización/deadlock y la colisión de la PK del comprobante se reintentan mediante una transacción completa y una instantánea nueva. El protocolo dispone de hasta doce intentos; los endpoints legacy conservan tres. El timeout de bloqueo y el timeout transaccional existentes permanecen. Contención agotada: 503 recuperable. Un COMMIT incierto no se repite ciegamente en ese intento: el cliente consulta o reenvía **el mismo ID**.

`sessionVersion` es SHA-256 del contenido persistido de sesión/series, incluyendo IDs, fecha, notas, orden y ambos lados. Se verifica dentro de la transacción antes de anexar, reemplazar o borrar. Un cambio legacy previo también cambia esa versión. Una vez gestionada la sesión, PUT/DELETE/corrección masiva legacy no pueden reemplazarla sin versión y devuelven 409. El anexo legacy de Atajos sigue siendo aditivo y serializado; no borra series y obliga a que una edición nueva detecte la versión cambiada. Las sesiones legacy no adoptadas conservan su edición anterior.

No hay fusión por fecha, nombre o similitud de series. Dos operaciones independientes de creación pueden producir dos sesiones propias del mismo ejercicio; esa distinción es intencional.

## 7. Instante original

El protocolo exige `performedAt`; nunca lo sustituye por la hora de sincronización. `WorkoutLog.date` y `RestLog.date` existentes reciben el instante original al crear. El comprobante conserva ese instante con zona y su día civil en `America/Mexico_City`, además de la fecha separada de creación del acuse.

Ejemplo verificado: `2026-10-19T05:59:59.999Z` corresponde a `2026-10-18` en CDMX; `2026-10-19T06:00:00.000Z` corresponde al día 19. Ediciones/anexos conservan su instante en su propio comprobante y no cambian la fecha original de la sesión explícitamente elegida.

No se impone una ventana retrospectiva arbitraria. Una fecha válida no concede propiedad ni selecciona automáticamente una sesión histórica: modificar exige `logId` propio y versión vigente. Los clientes legacy siguen con sus reglas anteriores, sin atribuirles idempotencia o fecha original que no ofrecen.

## 8. PostgreSQL y recuperación

Las pruebas se escribieron antes del código nuevo y se ejecutaron inicialmente en rojo por ausencia del protocolo. Después se verificaron con PostgreSQL real y Node 24.22.0 en clústeres nuevos, únicamente loopback y datos sintéticos. El rol HTTP tiene cuatro conexiones para ejercer contención real sin heredar el tamaño automático del pool de la máquina.

Casos cubiertos: dos/diez solicitudes simultáneas, contenido incompatible concurrente, dos cuentas, PWA/Atajos, anexos con versión, edición simultánea, carrera legacy/nueva, reinicio real de Node, respuesta HTTP descartada, parada/arranque reales de PostgreSQL, fallo SQL en el comprobante/PR, aborto SQLSTATE 40001 real, agotamiento de reintentos, unilateralidad/PR/Epley/fecha, restricciones/FK/privilegios, desaparición del almacén, reconstrucción, actualización sintética y deploy repetido.

La pérdida de confirmación de COMMIT se prueba además con un COMMIT real y una excepción inyectada únicamente después de ese COMMIT. Se distingue de la prueba de respuesta HTTP perdida, que descarta una respuesta de red real.

El respaldo completo existente usa `pg_dump` de toda la base e incluye el esquema nuevo sin modificar su implementación. Se restauró en otra base nueva y se compararon todos los comprobantes y el SHA original del archivo; un replay sobre esa restauración también fue reconocido. No se editó ningún backup previo.

Los formatos JSON portátil y PostgreSQL sanitizado siguen siendo contratos deportivos, **no un journal de operaciones**. El sanitizado limita el dump a `public`, como antes, y no contiene los comprobantes del esquema privado. Se verificó su restauración deportiva y el rechazo 503 del protocolo por ausencia del almacén; no se reconstruyen acuses a partir de sus sesiones ni se aceptan replays sobre ellos. Recuperar la garantía operativa requiere el respaldo completo que incluya los comprobantes. Un bundle antiguo conserva su compatibilidad con el artefacto exacto que lo creó; las verificaciones estrictas de historial no se relajaron.

Rollback de aplicación: deshabilitar el consumo del protocolo y conservar comprobantes/datos. No borrar tabla, esquema, migración aplicada ni historial para volver a una versión anterior. Una versión previa que permita PUT incondicional no constituye rollback seguro para sesiones ya gestionadas: requiere mantener estos controladores de protección o bloquear escrituras mientras se recupera. Recuperación de datos: restaurar un backup completo compatible en **otra base nueva**, comprobar filas/comprobantes/historial y dirigir únicamente el ensayo autorizado a esa base. Si una migración falla, conservar su evidencia, verificar rollback y rehacer el ensayo en otra base desechable; no ejecutar DDL correctivo en staging de referencia o producción.

## 9. Pruebas y verificaciones reproducibles

Desde `server`, utilizando Node 24.22.0:

```powershell
npm run test:operations
npm run test:operations:integration
npm run verify:operations
```

`verify:operations` crea una copia privada sin `.env` ni credenciales, instala dependencias mediante `npm ci`, genera Prisma Client y ejecuta **las 730 pruebas previas sin editarlas ni omitirlas**, con los archivos históricos de migración de su fixture `0_init` y el código actual de la aplicación. Esas suites comprueban deliberadamente 17 tablas y un historial de una migración. Luego incorpora la migración nueva real y ejecuta la suite de operaciones sobre otro clúster nuevo. No se eliminan migraciones del repositorio ni se simula una actualización persistente.

También ejecuta build del cliente, verificaciones de infraestructura/staging, lint/sintaxis/UTF-8 de los archivos nuevos/modificados y smoke con dependencias de producción. Los totales y hashes finales están en [phase31-evidence.json](phase31-evidence.json); el ensayo PostgreSQL se documenta en [integration-evidence.json](integration-evidence.json). Los smoke repetidos no se suman dos veces al total de pruebas únicas.

Los errores históricos de lint del cliente y de `index.js` se registran separadamente. El verificador exige cero hallazgos nuevos y compara los dos renglones nuevos de montaje con la versión previa de `index.js`; no silencia reglas globalmente ni corrige módulos ajenos a esta fase.

Resultado final: 800/800, cero pruebas fallidas u omitidas; 48 pruebas adicionales repetidas tras instalar únicamente dependencias de producción, sin contarlas de nuevo. `npm ci`, generación Prisma, build Vite, verificaciones de infraestructura/staging y lint/sintaxis de 3.1 aprobados. El cliente conserva sus **27 errores y 3 advertencias** anteriores de lint; `index.js` conserva **12 errores anteriores**, sin introducir otros. Los otros 11 archivos JS/MJS examinados de esta fase no presentan errores ni advertencias. El build conserva el aviso anterior de tamaño del chunk de PDF.

## 10. Compatibilidad PWA y Atajos

No hay cambios de frontend, almacenamiento, service worker, drafts ni cola. Operaciones antiguas de fecha/propietario inciertos permanecen conservadas y bloqueadas; no se les inventa UUID, dueño o instante. Los endpoints existentes conservan cuerpos/respuestas y no ofrecen la garantía nueva sin optar por v1. La única restricción adicional protege sesiones que hayan sido adoptadas explícitamente por v1 frente a reemplazos legacy sin versión. Los recordatorios y algoritmos existentes no se modificaron.

## 11. Pendientes 3.2–3.5

- Integración explícita del frontend y Atajos nuevos: guardar UUID/instante antes del primer envío, conservar exactamente esos valores en reintentos, consumir acuses y controlar versiones. No está activada en esta fase.
- Reconciliación humana de operaciones antiguas ambiguas; no inferir fechas/dueños ni tratar coincidencias de series como comprobantes.
- Políticas de conflictos y experiencia de revisión entre dispositivos; el backend ya rechaza versiones obsoletas, pero no implementa sincronización bidireccional ni fusión.
- Reconciliar baseline con una copia real autorizada y revisar la migración provisional/roles/recuperación antes de cualquier activación. No hay fuente real autorizada disponible.
- Validar Docker/Linux/proxy/EasyPanel cuando corresponda. Los ensayos de esta fase son locales Windows/PostgreSQL; no acreditan despliegue ni prueba en dispositivo iOS.

## 12. Entornos protegidos

No hubo conexión a producción, lectura de datos reales, llamadas a proveedores, commits ni despliegues. El staging persistente de 2.4 y su referencia no se migraron ni modificaron. Se preservaron Dockerfile operativo, schema Prisma, baseline, implementaciones de backup y recuperación, fórmulas y archivos offline. La infraestructura sintética persistente anterior continúa siendo un artefacto de 2.4; no se ha actualizado silenciosamente a 3.1.

## 13. Estado y fuentes técnicas

Fase 3.1 implementada para desarrollo; habilitación persistente/producción bloqueada deliberadamente mientras la baseline sea provisional. No se avanza a 3.2 ni se activa sincronización automática.

La estrategia sigue la recomendación de reintentar la transacción completa tras abortos de serialización de [PostgreSQL 18](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html) y las transacciones Serializable/reintentos P2034 documentados para [Prisma ORM 6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).
