# NexLift v4 — Fase 3.2

Estado: **COMPLETADO en desarrollo y ensayo aislado**. **870 pruebas únicas aprobadas: 800 anteriores + 70 nuevas**, sin fallos ni omisiones. Baseline y migración 3.1 permanecen **PROVISIONALES**. Producción permanece deshabilitada.

## 1. Arquitectura del motor

El frontend incorpora un journal nuevo y separado para operaciones v1. `operationProtocol.js` valida y canoniza el contenido, calcula SHA-256 con Web Crypto y verifica los acuses. `operationStore.js` implementa almacenamiento sustituible; `operationTransport.js` captura la credencial actual y verifica su vigencia antes y después de cada respuesta/JSON. `operationSync.js` contiene la máquina de estados y la secuencia de reconciliación. `operationRuntime.js` integra las dependencias y la flag con la aplicación.

El recorrido es: identidad previamente verificada → UUID criptográfico → instantánea normalizada → hash → guardado local → lock de cuenta → capacidad autenticada → consulta por UUID → POST v1 si el comprobante no existe → verificación completa → evento local de confirmación. Un GET de historial jamás sustituye un comprobante.

Cada operación tiene una clave independiente con payload, propietario, instante, día CDMX, hash, orden local y dependencias. Los estados se almacenan como eventos independientes con secuencia, hora e intentos. El estado confirmado es absorbente: un error tardío de otra pestaña no puede devolverlo a pendiente. No se borran operaciones, eventos ni acuses por antigüedad o número de intentos.

## 2. Archivos de esta fase

Nuevos en el cliente:

- `client/src/services/operationProtocol.js`, `operationStore.js`, `operationTransport.js`, `operationSync.js`, `operationRuntime.js`.
- `client/src/components/layout/OperationStatus.jsx`.
- `client/src/services/operationSync.test.js`, `operationApi.test.js`.
- `client/.env.example` con activación deshabilitada.

Modificados:

- `client/src/services/api.js`: adapta creación, descanso, sustitución y eliminación; lectura versionada; conserva el camino protegido anterior cuando la flag está deshabilitada.
- `client/src/context/AuthContext.jsx`: notifica cambios de sesión al motor; conserva las reglas anteriores de logout y protección ante errores transitorios.
- `client/src/components/layout/SyncStatus.jsx`: integra el panel nuevo junto al panel legacy.
- `client/src/pages/Workout.jsx`: conserva la versión revisada en borradores y protege ediciones de sesiones parciales; incluye pendientes v1 en su indicador.
- `client/src/pages/EditSession.jsx`: usa la versión del borrador/sesión revisada y conserva `completed=false`.
- `client/src/pages/Settings.jsx`: lee la sesión antes de la confirmación de borrado y distingue solicitud local de eliminación confirmada.
- `server/src/routes/operations.js`, `server/src/services/workoutOperations.js`: consulta de capacidad y metadatos verificables en el acuse.
- `server/package.json`, `server/.env.example`, `README.md`: comandos, configuración y documentación.

Nuevos de verificación: `server/test/run-sync-integration.mjs`, `sync.integration.test.js`, `check-sync.mjs`, `verify-sync.mjs`, `fixtures/sync-http.mjs`, `fixtures/sync-browser.mjs` y los informes/evidencias de este directorio. No se añadieron dependencias ni se cambiaron lockfiles en esta fase. El worktree ya incluía numerosos cambios de fases anteriores.

## 3. Adaptación al contrato 3.1 y auditoría de escrituras

La aparente ambigüedad de 3.1 queda resuelta: el comprobante se gestiona mediante SQL explícito y parametrizado de Prisma en `nexlift_operations."IdempotencyRecord"`. La migración SQL y `schema.prisma` tienen responsabilidades distintas. No se añadió otro modelo, tabla, esquema ni migración. La creación del entrenamiento, series, PR y comprobante sigue en la misma transacción Serializable.

| Origen de escritura | Clasificación y tratamiento |
| --- | --- |
| Workout, guardar ejercicio nuevo | Compatible; `workout.create`, UUID antes del envío, todas las series, notas e instante originales |
| Workout, completar sesión parcial del Atajo | Adaptada; lectura de sesión/version antes de editar y `workout.replaceSets`; ningún PUT automático |
| EditSession | Adaptada; versión conservada en el borrador; un borrador anterior sin versión requiere revisión, nunca adquiere silenciosamente la versión actual |
| Settings, eliminación de sesión | Adaptada; sesión leída antes del diálogo, versión explícita y `workout.delete`; un resultado encolado no se anuncia como eliminado |
| Dashboard, descanso | Compatible; `rest.create`, conserva nota/instante; local pendiente no confirma la racha remota |
| Atajos iOS existentes | Mantienen su endpoint y semántica aditiva anteriores; no se modificó el Atajo ni se le impuso metadata nueva |
| `workout.appendSet` | Admitida por contrato/motor para sesión explícita y versión; no inventa una sesión a partir del día |
| Cola legacy, v2 y borradores previos | Protegidos; sin promoción automática, sin inventar propietario/fecha/comprobante |
| Rutinas/importación/IA, bloques/activación, músculo de ejercicio | No compatibles con este protocolo; siguen siendo acciones explícitas online; no se encolan/reproducen como entrenamientos |
| Metas y semanas, corrección masiva de pesos | No compatibles; acciones online existentes. La protección 3.1 ante corrección incondicional de sesiones gestionadas permanece |
| Medidas corporales, check-in/hábitos, restauración de backup | No compatibles; no se introdujo replay automático |
| Registro/login/perfil/avatar/contraseña/pregunta/recuperación | Contratos existentes, fuera del journal; credenciales nunca se incluyen en el payload durable |
| Recordatorios de descanso/creatina, suscripción/desuscripción push, prueba push, telemetría de sugerencias | Fuera del journal; no se reproducen como operaciones deportivas ni se contactaron proveedores reales en los ensayos |

Se inspeccionaron los métodos de escritura de `api.js`, sus componentes invocadores, borradores, autenticación y el Service Worker. El SW mantiene su código de 1.2: API y solicitudes autenticadas solo usan red, con `no-store`; no decide sincronizaciones en segundo plano.

Los acuses HTTP ahora incluyen además `ownerId` y `requestHash`, obtenidos de la cuenta autenticada y del hash persistido. Son una extensión aditiva: no se reescriben comprobantes previos ni se modifica su JSON almacenado. Se añade `GET /api/v1/workout-capabilities`, autenticado y `Cache-Control: no-store`, que comprueba la tabla SQL real, las columnas necesarias y los permisos SELECT/INSERT del rol HTTP. Devuelve versión, formato del acuse, cuenta y tipos admitidos.

## 4. Idempotencia y verificación del acuse

Los reintentos conservan exactamente el UUID y la instantánea normalizada inicial. No consultan los valores actuales del formulario. Se comprueba antes del envío que el hash del payload durable siga coincidiendo. El hash del navegador se contrasta directamente con `parseOperation`/`requestHash` del servidor en pruebas.

Se consulta el comprobante antes de cada envío, incluso después de una recarga o un fallo local al guardar una confirmación. Solo un 404 con código `OPERATION_NOT_FOUND`, tras negociación compatible, permite POST del mismo payload. Un 404 genérico o un almacén ausente no concede esa autorización.

Confirmar exige HTTP 200/201 y versión de protocolo, cuenta, hash, UUID, tipo, origen, estado confirmado, instante y día originales. También se comprueban ID de sesión/descanso, versión del resultado, series ordenadas, pesos/repeticiones, RPE, lados, `completed`, notas o tombstone según el tipo. Un 2xx genérico queda bloqueado. En creación y descanso también debe coincidir exactamente la fecha persistida.

No se solicita entrega exactamente una vez a HTTP. La garantía de un único efecto reside en la PK de PostgreSQL y en la transacción de 3.1, aunque dos motores lleguen a enviar el mismo UUID simultáneamente. UUID distintos representan operaciones distintas; no se fusionan por fecha o contenido parecido.

## 5. Conflictos, versiones y orden

Las ediciones conservan el `expectedVersion` observado antes de editar, también al recuperar borradores. Ningún 409 actualiza esa versión, modifica el payload o genera otro UUID. El usuario conserva/exporta los datos para revisión. La resolución avanzada corresponde a 3.4.

Dos operaciones locales pendientes sobre el mismo `logId` registran una dependencia. La segunda queda bloqueada: no se puede demostrar una nueva versión consecutiva únicamente con el formulario local. La primera puede confirmarse; la segunda conserva su versión y payload originales. Un orden local separado del UUID conserva la causalidad incluso con dos capturas en el mismo milisegundo.

El motor procesa FIFO de la cuenta. Un conflicto, bloqueo o pausa en la cabecera detiene también operaciones independientes posteriores. Es una decisión conservadora de esta fase, visible en el panel; no hay bypass automático ni mezcla de series. Los bloqueos v2 conocidos para el mismo recurso impiden un envío nuevo que pudiera duplicar una operación anterior incierta.

## 6. Reconexión y máquina de estados

| Estado | Comportamiento |
| --- | --- |
| `pending` | Guardada localmente, sin confirmación remota |
| `syncing` | Negociación/consulta/envío en curso; una recarga puede reconciliarla |
| `confirmed` | Acuse validado y guardado; estado absorbente |
| `retry_scheduled` | Error transitorio, plazo persistido y datos intactos |
| `paused_auth` | HTTP 401; reanuda tras verificación de sesión o acción manual, sin borrar la cola |
| `conflict` | HTTP 409; revisión, sin rebase ni sobrescritura |
| `blocked_validation` | HTTP 400/422 o recurso no encontrado; revisión |
| `blocked_forbidden` | HTTP 403; conserva la operación |
| `blocked_incompatible` | Respuesta/protocolo incompatible; no activa replay |
| `blocked_dependency` | Antecedente local pendiente/ambiguo; requiere reconciliación |

Timeout HTTP: 15 segundos. Red/timeout, 408, 429, 500/502/503/504 conservan y reprograman. Backoff exponencial desde cinco segundos, con techo de cinco minutos. `Retry-After` numérico o fecha HTTP prevalece, también sobre el botón manual. No hay límite de intentos que descarte datos ni temporizadores inmediatos infinitos. Los intentos cuentan pasadas de sincronización, incluidas negociaciones fallidas.

Arranque, `online`, `pageshow`, foco, visibilidad, cambios de sesión y eventos Storage despiertan un motor único por runtime. `navigator.onLine` solo evita intentos claramente offline; la negociación autenticada comprueba el backend y PostgreSQL. Un temporizador por motor respeta plazos persistidos y revisa cada minuto una cabecera pendiente/interrumpida que pudo quedar bajo un lock desaparecido.

Web Locks coordina por origen/cuenta. Sin esa API hay una lease asesorada en Storage de 60 segundos, renovada cada 20. Su adquisición no es atómica entre procesos: PostgreSQL conserva la garantía final. No se crea una tarea del SW capaz de usar credenciales o enviar operaciones con la PWA cerrada. Al volver a abrirla se reconcilia el journal.

## 7. Aislamiento por cuenta

El formulario pasa su propietario esperado. Para capturar offline se exige una verificación anterior del servidor vinculada a la credencial exacta mediante un digest; la credencial no se guarda en el journal ni en esa constancia. Sin verificación anterior, se conserva el formulario/borrador y se informa que aún no puede prometerse una operación protegida.

Antes de consultar comprobantes o enviar, la API autentica el JWT y confirma la cuenta en la capacidad. Un ID de perfil local o un JWT meramente decodificado no bastan. El servidor vuelve a verificar propiedad de ejercicios/sesiones dentro de su transacción.

Cada petición captura credencial, propietario y generación de sesión. Se comprueban antes/después del fetch y del JSON. Logout, rotación o cambio de cuenta detienen esa generación. Una respuesta tardía de A no confirma su journal ni actualiza el panel de B; A la recupera mediante comprobante al volver. Un 401 pausa; un 503 conserva autenticación. El logout existente puede retirar credenciales ante un 401 real, pero nunca elimina operaciones o borradores.

## 8. Datos legacy

`offlineQueue.js`, `offlineSync.js` y el formato de almacenamiento anterior permanecen intactos. Con la flag apagada se conserva el comportamiento protegido de 1.2. Con la flag encendida solo las operaciones recién creadas por el contrato v1 entran al motor nuevo. Las colas viejas no se reclasifican como v1 ni se envían automáticamente.

El panel anterior conserva la exportación de datos y borradores propios y del archivo legacy sin propietario. El panel nuevo exporta las operaciones y acuses de la cuenta actual, sin tokens. No se elimina ni modifica ningún registro pendiente antiguo. Las exportaciones requieren que el navegador permita leer Storage; una corrupción/cuota se presenta como error, sin reparar ni borrar silenciosamente.

## 9. Interfaz visual

`OperationStatus` se integra con el estilo existente dentro de `SyncStatus`, sin librerías nuevas. Muestra guardado local, número sincronizándose, confirmación, conflicto, pausas, errores y próximo intento. Incluye última confirmación verificada en CDMX, detalle del payload/dependencias y exportación. El botón manual solo procesa operaciones recuperables y respeta `Retry-After`.

Los formularios reciben `queued=true` mientras no exista un acuse verificado. Settings no retira la sesión del historial cuando solo se guardó una solicitud local de borrado. Workout/EditSession/Dashboard conservan sus mensajes de pendiente y borradores. Las ediciones preservan series incompletas. Los descansos entre series siguen siendo configuración del ejercicio/timer: el esquema/contrato no tienen un campo de descanso medido en SetLog, por lo que no se inventó otro ni se descartó un campo admitido.

## 10. Activación controlada

La flag del build es `VITE_WORKOUT_OPERATIONS_ENABLED=true`, por defecto false/ausente. La capacidad del backend exige `NEXLIFT_OFFLINE_SYNC_ENABLED=true` y `NODE_ENV` distinto de `production`. En producción se bloquea incluso una configuración accidental true. Las plantillas `.env.example` contienen false; no se modificó ninguna configuración operativa.

Solo en una aplicación dirigida a un backend de desarrollo/ensayo cuya base **nueva y desechable** haya sido verificada por los runners puede activarse este recorrido. La validación automatizada construye y ejecuta esa aplicación con las flags explícitas, usando HTTP/PG loopback y datos sintéticos. No hay instrucciones de `migrate deploy` para staging persistente ni producción: la barrera de la migración provisional sigue intacta.

Si falta el almacén, los permisos o el contrato, no se envía el POST y no hay fallback a `/workouts/log` o PUT legacy. Una capacidad deshabilitada/incompatible queda bloqueada para revisión; un almacén temporalmente ausente devuelve 503 y mantiene el backoff. Activar Dexie, sincronización avanzada o migraciones productivas requiere fases posteriores.

## 11. Evidencias PostgreSQL y navegador

Los ensayos usan clústeres PostgreSQL 18 nuevos, loopback, PGDATA/puerto/system identifier/comentario verificados, migración provisional con marcador aleatorio y rol HTTP limitado. El runner no acepta URLs externas ni lee `.env`. Se cierra Node/Edge/PostgreSQL y se valida la ruta de limpieza antes de eliminar únicamente su directorio temporal propio.

Se prueban el motor real del cliente y rutas Express/Prisma con JWT sintéticos: desconexión inmediatamente antes del commit mediante un error SQL después de insertar entrenamiento/PR/comprobante, y descarte del socket después del commit real. Se contrastan filas/PR/comprobantes, no solo HTTP. También hay reinicio real de Node, parada/arranque reales de PostgreSQL, versiones obsoletas, dos cuentas, dos POST simultáneos con los locks JavaScript deliberadamente deshabilitados, sesiones distintas, dependencias, descansos y Atajo legacy.

El ensayo Edge/Chromium ejecuta la aplicación React real mediante Vite con flags de ensayo, comprueba el panel local, cierra y reinicia el navegador con el mismo perfil sintético, reconecta automáticamente, coordina dos pestañas, recarga, emite eventos de reanudación y verifica un único efecto SQL. Registra el SW real y coloca una respuesta API falsa en caché: la consulta autenticada sigue obteniendo la respuesta real de red. Se evita acceso externo mediante endpoints locales, DNS del navegador restringido y guard de egreso del host HTTP. No se envían peticiones a IA, Cloudinary o push.

Evidencia pública sin credenciales: [integration-evidence.json](integration-evidence.json), [phase32-evidence.json](phase32-evidence.json) y [final-validation.json](final-validation.json). El fixture final usa explícitamente el lunes 19 de octubre de 2026 antes de medianoche CDMX y lo sincroniza el martes; el registro y su comprobante conservan el lunes.

## 12. Pruebas y reproducción

Desde `server`, con Node 24.22.0 y herramientas PostgreSQL locales:

```powershell
npm run test:sync:integration
npm run verify:sync
```

Desde `client`:

```powershell
npm test
npm run build
```

El verificador crea una copia privada limpia e instala mediante `npm ci`. Ejecuta las **800 pruebas anteriores sin editarlas ni omitirlas** con código actual: las primeras 730 usan su fixture histórico 0_init y las 70 de 3.1 usan después la migración provisional real en otro clúster nuevo. Luego ejecuta las suites nuevas de frontend/HTTP/PG/navegador, build de producción con flag ausente, build de ensayo con flag true, lint/sintaxis y smoke de dependencias productivas. Los 48 smoke repetidos se informan sin volver a sumarlos como pruebas únicas.

Resultado final: **870/870 pruebas únicas**, cero fallidas/omitidas. Los **30 comandos de la matriz** finalizaron con exit 0. Build de producción y build de ensayo correctos; se conserva el aviso histórico del chunk PDF grande. Lint global: **27 errores y 3 advertencias históricos, cero regresiones**; los ocho archivos de servidor examinados por el checker y todos los módulos nuevos del cliente no tienen hallazgos. Los componentes con deuda previa mantienen sus hallazgos históricos. El checker de 3.1 conserva también su comparación de los 12 errores históricos de `index.js`.

| Grupo | Pruebas únicas aprobadas |
| --- | ---: |
| Fases anteriores, sin modificar sus pruebas | 800 |
| Motor, contrato, almacenamiento y coordinación del cliente | 43 |
| Adaptación de la API del frontend | 8 |
| PostgreSQL/HTTP reales, incluida aplicación React en Edge | 19 |
| **Total** | **870** |

Se repitieron 48 smoke con dependencias productivas, sin contarlos dos veces. Después de la matriz se precisaron únicamente dos fixtures nuevos para probar literalmente lunes→martes y calcular dinámicamente el día de sus acuses sintéticos. Se repitieron las 51 pruebas nuevas del cliente, las 19 de PostgreSQL/navegador y el checker: todo aprobado. No cambió el código de aplicación; los 33 hashes finales y la relación con la matriz completa se conservan en `final-validation.json`. Esas 70 repeticiones tampoco incrementan el total único. La copia privada de verificación se cerró y eliminó correctamente.

## 13. Límites para 3.3 y 3.4

- La interfaz de almacenamiento es async y sustituible: `create`, `get`, `list`, `record`, `subscribe`, `withLock`. El motor recibe esa interfaz; no accede directamente a localStorage. Una prueba ejecuta el mismo motor con otro adapter en memoria.
- Storage no ofrece transacciones entre claves, durabilidad física garantizada, espacio ilimitado ni protección ante borrado del perfil o scripts comprometidos. La captura guarda el estado inicial dentro de la misma clave del payload; fallos posteriores conservan esa operación. Una confirmación local fallida se reconcilia con el comprobante remoto. Dexie/IndexedDB y cualquier migración masiva quedan para 3.3.
- La lease fallback es asesorada; los eventos no forman un log transaccional multiproceso. Confirmación absorbente y SQL idempotente reducen carreras, pero no se declara almacenamiento offline definitivo.
- No hay fusión de dispositivos, rebase automático, reparación de payloads bloqueados ni atribución de legacy. FIFO puede detener trabajo independiente tras un conflicto. La revisión y resolución avanzada quedan para 3.4.
- Los campos no representables por el contrato/esquema actual no se convierten en propiedades ficticias. Se conservan descansos del catálogo; no se prometen duraciones reales por serie que nunca se registraban.
- Los comprobantes requieren backup PostgreSQL completo. Los formatos JSON/PG sanitizados históricos no incluyen el journal privado y no constituyen prueba de una operación. La ausencia de ese almacén impide activar replay. Las implementaciones de respaldo/restauración y sus verificaciones permanecen intactas.
- Se verificó Edge/Chromium, no Safari/iOS físico, Linux/Docker ni un despliegue remoto. Atajos existentes conservan su contrato y sus pruebas reales de backend.

## 14. Producción y límites operativos

No se conectó a PostgreSQL de producción, ni a la base de staging persistente, ni a datos reales. No se ejecutaron migraciones sobre bases persistentes. `schema.prisma`, `0_init`, la migración 3.1, Dockerfiles, algoritmos y `personalRecords.js` permanecen intactos. No se modificaron implementaciones de backups ni se eliminaron historiales. No hubo commits ni despliegues. Los documentos/evidencias de 3.1 se conservan. No se avanzó a 3.3.

## 15. Estado y referencias

**COMPLETADO para la Fase 3.2 en desarrollo/ensayo aislado.** Sincronización automática demostrada bajo activación explícita, 870 pruebas únicas aprobadas y datos preservados. No se declara persistencia offline definitiva: continúan los límites locales de 3.3 y la reconciliación avanzada de 3.4. La infraestructura/baseline conserva su clasificación provisional y producción sigue bloqueada.

Referencias primarias de las APIs usadas: [Web Locks, W3C](https://www.w3.org/TR/web-locks/), [Web Storage, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API), [Retry-After, MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After). Las garantías SQL y limitaciones del formato provienen de la inspección/pruebas del repositorio, no de inferirlas de `navigator.onLine`.
