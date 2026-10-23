# NexLift V4.0 — Fase 1.2

Fecha: 18 de octubre de 2026, America/Mexico_City.

**Estado: COMPLETADO para la protección conservadora solicitada.**

La fase evita descartar datos y ejecutar reconciliaciones peligrosas. No implementa
el protocolo offline definitivo: **el replay automático consulta, pero no envía
POST ni PUT**. Las escrituras pendientes sin una confirmación segura quedan
conservadas para revisión y exportación. Los envíos originales iniciados por el
usuario mantienen POST/PUT, precedidos por almacenamiento durable local.

## 1. Auditoría y reproducción antes de corregir

Se revisaron `offlineQueue.js`, `api.js`, `AuthContext.jsx`, `sw.js`, la persistencia
de `Workout.jsx`/`EditSession.jsx`, el registro de descansos en `Dashboard.jsx` y
los endpoints de workouts de `server/src/index.js`.

Se escribieron y ejecutaron primero 20 regresiones contra el flujo original:
**17 fallaron y 3 pasaron**, salida 1. Se reprodujeron:

- Eliminación ante 500/502/503/429/400/403/422/409.
- Falta de respeto a `Retry-After` y ausencia de estado retenido de validación.
- Pérdida después de 48 horas y al recuperar la cola tras una recarga.
- Uso de today-log seguido de POST después de medianoche CDMX.
- PUT que sustituía series remotas diferentes.
- Reproducción de operaciones de A con la sesión de B.
- Pérdida de varios elementos en una misma pasada de replay.
- Borrado de operaciones legacy y aceptación de un 2xx sin contrato de persistencia.

Las comprobaciones básicas de conservación ante 401, fallo de red y excepción
al fallar localStorage ya pasaban. Se amplió su cobertura después.

Hallazgos adicionales de la inspección:

- `Workout` eliminaba borradores con más de 24 horas y al finalizar. La clave
  `workout_${dayId}` no tenía propietario ni día calendario de origen.
- `EditSession` no persistía el formulario y borraba todas las claves `workout_*`
  después de guardar, incluso cuando el resultado solo estaba encolado.
- El service worker entregaba respuestas API antiguas por URL, sin separar
  cuentas; today-log y auth/me podían recibir un respaldo de otra sesión.
- Las peticiones de replay tomaban el token global para cada llamada. La sesión
  podía cambiar entre el GET y el PUT/POST.
- El bloqueo de replay original solo existía dentro de una instancia del módulo.
- POST workout crea el registro y luego recalcula PRs; PUT confirma su transacción
  y luego recalcula PRs. Un 500 puede ocurrir después de que los datos se hayan
  persistido. Repetir la escritura no es una recuperación segura.
- POST workout/rest asigna la fecha en el servidor; PUT de sesión reemplaza todas
  las series y carece de precondición de versión. No hay clave idempotente
  persistente ni consulta de comprobantes por operación.

## 2. Archivos y comportamiento implementado

| Archivo | Cambio |
| --- | --- |
| `client/src/services/offlineQueue.js` | Lectura sin caducidad ni efectos, journal por operación, propietario y metadatos, conservación de recibos y detección de errores locales. |
| `client/src/services/offlineSync.js` | Nuevo módulo con clasificación, backoff, confirmación estricta, credencial capturada y replay de solo consulta. |
| `client/src/services/api.js` | Los tres métodos de registro utilizan el journal antes del envío original; elimina replay destructivo y protege un 401 tardío de otra sesión. |
| `client/src/services/workoutDrafts.js` | Borradores por propietario, recurso, día original e instancia de editor; conservación sin TTL ni borrado. |
| `client/src/context/AuthContext.jsx` | Evita que una respuesta de perfil antigua reemplace la nueva sesión, observa cambios entre pestañas y reanuda pausas después de verificar autenticación. |
| `client/src/App.jsx` | Reinicia el árbol protegido al cambiar el propietario para evitar formularios residuales de otra cuenta. |
| `client/src/pages/Workout.jsx` | Usa borradores seguros, impide registrar un borrador abierto el día anterior, conserva el cierre y comunica errores locales/pendientes. |
| `client/src/pages/EditSession.jsx` | Recupera y persiste ediciones, conserva borradores ajenos y diferencia resultado local de confirmado. |
| `client/src/pages/Dashboard.jsx` | Un descanso solo local no incrementa la constancia ni la racha como si estuviera confirmado. |
| `client/src/components/layout/SyncStatus.jsx` | Panel mínimo con estados, motivos, versiones locales/remotas, próximas consultas y exportación local. |
| `client/src/components/layout/Layout.jsx` | Incluye el panel común para entrenamientos, sesiones y descansos. |
| `client/public/sw.js` | API y solicitudes con Authorization solo por red y sin caché HTTP; conserva cachés de datos antiguos sin utilizarlos. |
| `client/src/services/offlineQueue.test.js` | Mantiene ocho casos y cambia la expectativa destructiva de caducidad por la retención requerida; adapta el fake de Storage. |
| `client/src/services/offlineSync.regression.test.js` | 66 pruebas de preservación, contratos, errores, fecha, propiedad, reinicio, FIFO, almacenamiento y concurrencia. |
| `client/src/services/offlineSync.http.test.js` | Cuatro integraciones con HTTP real y API sintética en 127.0.0.1. |
| `client/src/services/workoutDrafts.test.js` | Nueve pruebas de borradores, propietarios, reinicio, antigüedad y fechas. |
| `client/src/services/serviceWorker.test.js` | Cuatro pruebas que ejecutan el SW en VM y verifican que API no use respuestas cacheadas. |
| `client/test/PHASE-1.2.md` | Este informe. |

No se cambiaron archivos del servidor en esta fase. Los cambios existentes de
la fase 1.1, las modificaciones documentales previas y los archivos sin seguimiento
del usuario permanecen conservados.

## 3. Almacenamiento y compatibilidad legacy

- `nexlift_offline_queue` se lee donde existe: no se migra, sustituye, vacía,
  modifica ni poda al leer, encolar o reproducir.
- Los elementos legacy permanecen **sin propietario atribuido** y bloqueados.
  Esto incluye IDs repetidos, timestamps ausentes y operaciones desconocidas.
  La lectura normalizada no reescribe el contenido original.
- Las operaciones nuevas utilizan claves independientes
  `nexlift_offline_op_v2:<uuid>` dentro del mismo localStorage. Evitan que dos
  appends sustituyan la misma instantánea de un array compartido. No se introdujo
  IndexedDB ni otra base.
- Se persisten propietario, instante original, día CDMX, payload, estado,
  intentos, próximo plazo, si pudo salir una mutación, error, versión remota y
  recibo cuando existe. El token no se copia al journal.
- El propietario nuevo procede del perfil y del `userId` de la credencial que
  se enviará; deben coincidir. La firma se verifica en el servidor. Decodificar
  el token en el cliente no reemplaza la autenticación del servidor.
- Los borradores nuevos utilizan `nexlift_draft_v2:<uuid>` por instancia de editor.
  Recuperar un borrador copia su estado a una instancia nueva y conserva el
  anterior. Los borradores antiguos `workout_*` no se cargan automáticamente ni
  se asignan al usuario actual.
- Las lecturas no escriben ni notifican. Las notificaciones ocurren después de
  mutaciones; un listener defectuoso no invalida una escritura durable. Se
  verificaron lectores desde listeners y 100 lecturas consecutivas sin recursión.
- Un JSON corrupto o un fallo de Storage produce un error visible, sin vaciar
  ni sustituir la información. Si falla el journal, no sale la escritura ni se
  devuelve un falso `queued`. Si falla guardar el recibo, queda el payload incierto.
- El replay no llama a `removeFromQueue`. El helper explícito sigue exportado
  por compatibilidad, sin consumidores de producción. Los registros confirmados
  conservan payload y recibo; `getQueue()` excluye confirmados por defecto y
  `getQueue({ includeSynced: true })` los incluye.

El panel permite exportar operaciones y borradores del propietario actual.
La exportación legacy es una acción local explícita y separada, sin asignación
de cuenta ni envío al servidor. Los archivos pueden contener información del
propietario original; no constituyen una importación ni resolución automática.

## 4. Política final de errores y reintentos

| Resultado | Política |
| --- | --- |
| Red, timeout, HTTP 408 | Conservar; `temporary_error` y backoff para consulta segura. |
| HTTP 429 y 5xx | Conservar; backoff y respeto de `Retry-After` en segundos o fecha HTTP. |
| HTTP 401 | Conservar y pausar; eventos online no la reintentan hasta recuperar autenticación del propietario. |
| HTTP 400/403/422 y otros rechazos no transitorios | Conservar como `blocked`, sin reintentos automáticos. |
| HTTP 409 | Conservar como `conflict`, incluyendo la respuesta remota cuando existe. |
| Respuesta 2xx sin contrato válido | Conservar y bloquear; no interpretar `{ok:true}` como persistencia. |
| Confirmación válida del envío original | `synced`, con recibo y hora de confirmación locales. |

Backoff: 5, 10, 20 y 40 segundos para los primeros cuatro fallos; el quinto fallo
transitorio bloquea para revisión. La fórmula tiene techo de cinco minutos;
un `Retry-After` mayor prevalece. El plazo y los intentos sobreviven a una recarga.
Un timeout de 15 segundos limita las peticiones de sincronización. Los temporizadores
solo inspeccionan la cabecera elegible del propietario; un conflicto anterior
detiene FIFO y no produce un bucle de temporizadores con retraso cero.

**Un reintento aquí no significa repetir una mutación.** Después de una escritura
incierta se consulta si existe información remota. Una versión encontrada,
incluso con series idénticas, queda para revisión: no demuestra que esta operación
específica se haya persistido. Sin versión remota se bloquea la creación ambigua.
Para descansos no hay un contrato de consulta de comprobante: se conserva y bloquea.

Para confirmar un envío original se requiere 201 en creación o 200 en edición,
ID, fecha válida y coincidencia de ejercicio/sesión, series, valores L/R, RPE,
completed y notas según corresponda. En descansos se comprueban usuario y nota.
Las creaciones deben coincidir con el día CDMX original. La instantánea enviada
es exactamente la que se persistió antes de acceder a la red.

## 5. Conflictos, fecha y cambio de cuenta

- Se retiró por completo el camino automático `GET today-log → PUT/POST`.
  Los GET de revisión tienen `cache: no-store`; el SW tampoco ofrece un respaldo.
- Una versión remota queda junto al payload local, con estado `conflict`; no se
  modifican series remotas, no se mezclan versiones y no se borra el original.
- Las operaciones de creación pendientes que pertenecen a otro día CDMX se
  bloquean antes de consultar today-log o enviar nada. Se usan las funciones
  canónicas de `client/src/utils/dates.js` con America/Mexico_City.
- Un formulario Workout abierto antes de medianoche conserva el borrador y
  rechaza registrarlo como si correspondiera al día siguiente. Los borradores
  Workout de otros días quedan disponibles para exportación, sin hidratar el
  entrenamiento actual. Una edición histórica sí puede recuperarse otros días
  porque referencia un log estable, sin alterar la fecha de esa sesión.
- La credencial se captura para toda la operación y se comprueba antes/después
  de la petición y del cuerpo JSON. Cambiar de cuenta detiene el trabajo: nunca
  se reemplaza esa credencial por el token de la nueva sesión.
- Los formularios pasan su propietario esperado: una pantalla residual de A no
  puede crear un journal ni enviar datos usando la sesión B.
- La cola de otra cuenta se omite sin modificarla. Un bloqueo de B no detiene la
  cola de A. La sesión cerrada no elimina operaciones ni borradores.
- Cada operación nueva ocupa su propia clave. Web Locks coordina envío original
  e inspección entre pestañas donde está disponible; un guard local evita replay
  simultáneo. Sin Web Locks el replay continúa siendo de solo consulta.
- Reenviar manualmente el mismo objetivo con una operación local no resuelta
  conserva las dos versiones como conflicto, en lugar de enviar otro POST/PUT.

La interfaz distingue pendiente, sincronizando, confirmado, error temporal,
pausado y bloqueado/conflicto. Conserva el mensaje de guardado local y elimina la
promesa de que volver a tener conexión basta para confirmar cualquier operación.

## 6. Verificación exacta

| Grupo final | Total | Correctas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: | ---: |
| Backend original | 104 | 104 | 0 | 0 |
| Integración PostgreSQL de fase 1.1 | 48 | 48 | 0 | 0 |
| Frontend original, con expectativa de retención actualizada | 76 | 76 | 0 | 0 |
| Regresiones nuevas de sincronización | 66 | 66 | 0 | 0 |
| Borradores nuevos | 9 | 9 | 0 | 0 |
| Service worker | 4 | 4 | 0 | 0 |
| Transporte HTTP real, API sintética | 4 | 4 | 0 | 0 |
| **Total** | **311** | **311** | **0** | **0** |

Se ejecutaron los 228 casos existentes y 83 nuevos. El cliente terminó con
**159/159 en nueve archivos**. El único cambio intencional de expectativa original
es que un elemento de más de 48 horas ahora debe permanecer, tal como exige esta fase.

Comandos desde sus respectivos directorios:

```powershell
# server/
npm test
npm run test:integration

# client/
npm test -- --no-cache --configLoader native
npm run build
```

Las integraciones PostgreSQL utilizan el runner aislado existente: clúster
temporal, puerto dinámico, credenciales sintéticas y apagado/limpieza al terminar.
Las nuevas integraciones HTTP usan node:http en 127.0.0.1 con puerto dinámico,
sin base de datos ni arranque de index.js. Se verificó un POST persistido con
socket destruido, reinicio, GET de revisión y ausencia de un segundo POST.

También se verificaron 500/502/503/429/401/400/403/422/409, Retry-After numérico
y HTTP-date, timeout, cinco fallos consecutivos, reinicio con backoff, límites de
fecha CDMX, cambio de usuario antes/durante/después del cuerpo HTTP, múltiples
elementos FIFO, legacy heterogéneo y corrupto, cuota local en tres puntos del
envío, mutación posterior del formulario, listeners fallidos y coordinación de
dos instancias mediante Web Locks.

Build: **correcto**, Vite 7.3.6, 2636 módulos; mantiene un aviso por un chunk PDF
de 779,10 kB, fuera del alcance de sincronización. `node --check` de los módulos
de servicios/SW y `git diff --check -- client` fueron correctos.

ESLint de los nuevos módulos de producción (`offlineQueue`, `offlineSync`,
`workoutDrafts`, `SyncStatus`) fue correcto. La comprobación ampliada de archivos
tocados reporta ocho errores y un warning ya presentes en sus versiones HEAD
(variables sin uso, reglas de hooks/Fast Refresh). Se contrastaron esas versiones
usando ESLint por stdin; no se amplió la fase para corregirlos.

El primer build detectó `jiti/dist/jiti.cjs` ausente en node_modules. Se reparó
la instalación local con `npm ci --ignore-scripts --no-audit --no-fund`, desde el
lockfile existente. No se añadieron dependencias ni cambió ningún lockfile.

## 7. Límites para el protocolo futuro

1. El replay no sincroniza automáticamente mutaciones pendientes: preserva y
   bloquea las que no pueden confirmarse sin riesgo. La resolución/merge y la
   importación de archivos exportados no forman parte de esta fase.
2. Hacen falta claves idempotentes persistentes, comprobantes consultables por
   operación, fechas originales aceptadas explícitamente y una precondición de
   versión/CAS para volver a habilitar replay de escrituras.
3. El PUT original por acción explícita del usuario sigue usando el contrato
   actual del servidor. No se promete protección global ante ediciones manuales
   concurrentes desde otros dispositivos. Tampoco se promete exactamente una vez.
4. El servidor sigue asignando la fecha de un envío original en primer plano.
   Una petición iniciada alrededor de medianoche puede completarse otro día: se
   detecta el recibo incompatible y conserva para revisión, pero el cliente no
   puede revertir ni garantizar la fecha de una escritura ya recibida por esa API.
   El replay no crea ese riesgo porque nunca envía mutaciones.
5. localStorage no ofrece transacciones entre varias claves, durabilidad física
   garantizada, capacidad ilimitada ni protección frente a borrado manual del
   navegador, fallo del dispositivo o scripts antiguos aún abiertos. Se conservan
   los datos y se detectan fallos reportados por Storage. No hay poda automática;
   el crecimiento futuro necesita una política explícita de archivo/limpieza.
6. Las pestañas que aún ejecuten el bundle anterior mantienen su código antiguo;
   deberán recargarse al distribuir el cambio. No se realizó ningún despliegue.
7. No se hizo una prueba manual en Safari/iOS ni un E2E con navegador real/JWT
   real/producción. Las pruebas usan almacenamiento y sesión sintéticos, SW en VM,
   transporte HTTP real local y el clúster aislado de la fase 1.1.

Referencias técnicas consultadas para los contratos del navegador:
[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) y
[Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After).
La política de conservación y las limitaciones de la API proceden de la inspección
del repositorio, no de una suposición de idempotencia.

## 8. Límites operativos respetados

**No se accedió ni escribió a producción.** No se cambiaron el esquema de
PostgreSQL, schema.prisma, endpoints del servidor ni lockfiles. No hubo migraciones,
`prisma db push`, TypeScript, Fastify, IndexedDB, commits o despliegues. Los datos
de pruebas son sintéticos; los clusters temporales pertenecen al runner aislado.

Los documentos preexistentes del usuario y toda la implementación de fase 1.1 se
conservaron. No se inició ninguna fase posterior.
