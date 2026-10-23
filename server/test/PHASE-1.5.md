# NexLift V4.0 — Fase 1.5

Estado: **COMPLETADO**. Verificado el 18 de octubre de 2026.

La sesión, sus series y el PR derivado se confirman o revierten juntos. Las
notificaciones se inician después del commit y no convierten un guardado exitoso
en un error de persistencia. No se implementó idempotencia persistente.

## 1. Causa raíz y caracterización anterior

Se inspeccionaron las implementaciones reales antes de cambiarlas y se congelaron
sus handlers en fixtures exclusivos de pruebas. Se ejecutaron primero 12 casos
de caracterización; después se agregó el caso de borrado indirecto de una rutina.
Los 13 comprueban filas reales de PostgreSQL y reproducen el comportamiento previo.
Que estos casos pasen significa que documentan ese comportamiento, incluidos sus
defectos; los fixtures históricos nunca se registran en producción.

| Operación anterior | Atomicidad existente | Brecha confirmada |
| --- | --- | --- |
| `POST /api/workouts/log` | El create anidado ya hacía atómicos log y series | El PR se recalculaba después, con el cliente global |
| `PUT /api/workouts/:logId` | Borrar/insertar series ya tenía transacción | Autorización previa y PR posterior fuera de esa transacción; dos reemplazos podían mezclar series |
| `DELETE /api/workouts/:logId` | El borrado y sus cascadas eran una operación | El recálculo del PR era independiente |
| `POST /api/shortcuts/log-set` | Buscar/agregar/crear sesión tenía transacción | Aislamiento por defecto, ausencia sin bloqueo y PR posterior; no protegía el resultado de recordatorios |
| `PUT /api/workouts/fix-weights` | Ninguna unidad transaccional completa | Updates individuales; cambiaba el peso del PR sin recalcular su 1RM ni descubrir otro ganador |
| Borrado de rutina | Archivado y borrado ya estaban en una transacción | Contaba historial antes de bloquear el grafo; una creación intercalada podía desaparecer por cascada |
| Reorganización IA del día | Contaba, archivaba, borraba y creaba por separado | Podía competir con una serie nueva y quedar incompleta |
| Edición estructural de rutina, fase 1.1 | `Serializable`, bloqueo del grafo y archivado | Se conserva su implementación y contrato; se prueba la interacción con los nuevos escritores |
| Restauración, fase 1.3 | `Serializable`, bloqueo de la cuenta y verificación | Se conserva; su bloqueo de usuario coordina también con estos escritores |

Resultados anteriores reproducidos:

- Un trigger que impide insertar el PR produce 500 con log y series ya guardados.
- Editar con ese fallo deja las nuevas series y elimina el PR previo.
- Eliminar el ganador con ese fallo deja solo el historial menor y ningún PR.
- Un fallo en el create anidado de series o en su reemplazo ya hacía rollback;
  se caracteriza esa protección existente, sin atribuírsela a esta fase.
- Dos ediciones de una serie de 50 y otra de 80 terminan con **ambas series**,
  pese a que cada petición solicitaba reemplazar la colección completa.
- `fix-weights` cambia 50 a 80, pero conserva un 1RM de aproximadamente 66.6667.
- Un borrado de rutina intercalado después de su conteo vacío elimina el log y
  las series recién confirmados y deja un PR fantasma.
- Una excepción síncrona inyectada en la dependencia de recordatorios produce
  un falso 500 después del commit. El helper real de recordatorios es asíncrono;
  su invocación anterior tampoco capturaba una promesa rechazada. No se simula
  este caso como un fallo real de un proveedor externo.
- Autorización por cuenta, ambos lados unilaterales, eliminación del ganador
  y empate con la sesión más antigua se caracterizan también antes del cambio.

## 2. Diseño transaccional

`withWorkoutTransaction` abre una sola transacción `Serializable`. Primero bloquea
la fila del usuario con `FOR NO KEY UPDATE`. Esto coordina escrituras de la misma
cuenta aunque usen distintos IDs de ejercicio, variantes de mayúsculas o una
sesión/PR que todavía no existe. Las cuentas distintas pueden avanzar por separado.

La autorización se repite dentro de la transacción. Se bloquea con `FOR SHARE`
la cadena Routine → RoutineDay → Exercise para estabilizar la pertenencia. En
edición y eliminación se bloquea además WorkoutLog con `FOR UPDATE`. Los servicios
reciben explícitamente `tx`; no usan el cliente global ni abren transacciones
anidadas. El recálculo lee las escrituras de esa misma transacción.

`Serializable` permite coordinar también con el editor existente de la fase 1.1.
Una transacción que espera un bloqueo puede conservar un snapshot anterior;
los conflictos se abortan y se reintenta exclusivamente el cuerpo abortado. Una
prueba fuerza al editor sin modificar a esperar mientras se confirma una sesión
y comprueba que el historial no desaparezca por una lectura anterior al commit.

El PR sigue derivándose de todos los logs del usuario cuyo nombre coincida sin
distinguir mayúsculas. La sustitución del PR usa ahora esa misma identidad para
consolidar también filas históricas con nombres en mayúsculas. Guarda la clave
en minúsculas y no toca PR de otras cuentas ni registros sin propietario.

`fix-weights` conserva búsqueda parcial por nombre, tolerancia estricta `< 0.1`
y modificación del peso principal/izquierdo. Después deriva el PR completo a
partir del historial resultante. Conserva las claves HTTP `message`,
`setsUpdated`, `prsUpdated`; esta última cuenta los PR resultantes recalculados,
en lugar del antiguo parche de peso que dejaba 1RM incoherentes.

Los borrados indirectos de rutina y la reorganización IA usan la misma unidad
transaccional y bloquean rutina, días y ejercicios **antes** de contar historial.
Se conservan las reglas de archivado y de selección de reemplazos. Reorganizar
relee el día después del bloqueo. Borrar la propia papelera con historial devuelve
409 para impedir que se archive dentro del mismo destino que va a eliminarse.

No hay llamadas a OpenAI, Cloudinary, HTTP o notificaciones dentro de estas
transacciones. La reorganización usa el selector determinista existente; no se
modifican algoritmos, prescripciones ni normalización de importación.

## 3. Concurrencia y reintentos

- Máximo **3 intentos totales**, solo ante `P2034` o SQLSTATE `40001`/`40P01` que
  indican una transacción abortada. Esperas limitadas de 10 y 20 ms.
- Un lock timeout (`55P03`) devuelve 409 sin reintento automático.
- Espera de bloqueo PostgreSQL: 2 segundos; adquisición de transacción Prisma:
  hasta 5 segundos; duración máxima de cada intento: 15 segundos.
- Errores de validación y fallos de persistencia ordinarios no se reintentan.
- Si termina el cuerpo pero se pierde la confirmación del commit, la respuesta
  es 409 con `WORKOUT_OUTCOME_UNKNOWN` y `outcome: "unknown"`. No se vuelve a
  ejecutar la escritura. Un error SQL que confirma aborto sigue siendo fallo
  interno con rollback, aunque ocurra después del cuerpo.
- Dos ediciones completas se serializan; el último reemplazo exitoso determina
  el contenido final. No se agrega control de versiones del formulario.
- Atajos acumula en una sesión diaria sin duplicar su creación por la carrera
  buscar/crear. Si ya hay varias sesiones históricas del día, conserva todas y
  agrega a la más antigua, con desempate por ID.
- Una serie nueva toma `max(setNumber) + 1`, preservando numeraciones históricas
  discontinuas. El `POST` de la PWA conserva su semántica de crear una sesión.

Los bloqueos de filas, sus incompatibilidades y duración siguen la documentación
de [PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).
El cliente transaccional, el aislamiento y los conflictos `P2034` se contrastaron
con la [documentación de Prisma](https://www.prisma.io/docs/orm/fundamentals/transactions).

## 4. HTTP y efectos posteriores

| Resultado | Respuesta |
| --- | --- |
| Creación PWA o Atajos confirmada | 201 y estructura anterior, con datos persistidos |
| Edición o eliminación confirmada | 200 y mensajes/claves anteriores |
| Validación | 400, sin escrituras |
| Recurso inexistente o ajeno | 404 genérico |
| Conflicto agotado o bloqueo | 409, `WORKOUT_CONFLICT`, `outcome: "not_committed"` |
| Borrado de la papelera con historial | 409, `WORKOUT_HISTORY_CONFLICT`, sin escrituras |
| Confirmación incierta de commit | 409, `WORKOUT_OUTCOME_UNKNOWN`, `outcome: "unknown"` |
| Fallo interno de persistencia con aborto | 500 genérico y rollback |
| Recordatorio falla después del commit | Sigue siendo 201; se registra el error secundario |

Se capturan tanto excepciones síncronas como rechazos asíncronos del recordatorio,
sin esperar al proveedor. El logger tampoco puede convertir ese éxito en fallo.
La fase 1.2 mantiene los 409 para revisión, conserva el registro local y no los
reenvía automáticamente; no se modificó ningún archivo cliente en esta fase.

## 5. Comparación matemática

Se compara el recálculo nuevo con el helper anterior congelado, sobre las mismas
filas de PostgreSQL, en 15 casos. Se conservan los campos históricos, ambos lados,
el timestamp y el resultado numérico. Se prueba aparte la eliminación del ganador
y el empate entre sesiones en distinto orden de inserción.

| Caso | Antes | Después |
| --- | --- | --- |
| 50 kg × 10 | 1RM ≈ 66.6667 | Igual |
| 100 kg × 1 | 100 | Igual |
| Unilateral: 25 × 8 y 30 × 10 | Gana 30 × 10, 1RM 40 | Igual |
| Solo peso o reps del lado derecho | Fallback al dato izquierdo que falta | Igual |
| Cero derecho explícito | No se sustituye como si fuera ausente | Igual |
| Empate exacto entre fechas distintas | Gana la sesión más antigua | Igual |
| Se elimina el ganador | Mejor esfuerzo del historial restante | Igual, ahora atómico |
| Se corrige 50 a 80 kg × 10 | PR con peso 80 y 1RM obsoleto ≈ 66.6667 | 1RM ≈ 106.6667, misma fórmula aplicada al historial correcto |

Diferencias matemáticas existentes que se documentan y aplazan: el PR usa el mejor
esfuerzo de **una extremidad**, mientras Smart Loading usa el lado débil. El PR
aplica Epley solo con `1 < reps < 37`; desde 37 devuelve el peso, mientras el helper
Epley de progreso acota las reps a 36. Las series históricas incompletas siguen
participando en el PR como antes. No se cambian estas reglas ni se agrega otro
criterio para empates dentro de un mismo timestamp.

## 6. Pruebas y aislamiento

Todos los comandos terminaron con código 0. Cero fallos, cancelaciones u omisiones
en las ejecuciones finales completas.

| Comando | Aprobadas | Duración del runner de pruebas |
| --- | ---: | ---: |
| Servidor: `npm test` | 104 | 359.6752 ms |
| `npm run test:integration` | 48 | 5868.6267 ms |
| `npm run test:backup` | 17 | 608.1664 ms |
| `npm run test:backup:integration` | 41 | 20040.2339 ms |
| `npm run test:import` | 22 | 166.2452 ms |
| `npm run test:import:integration` | 39 | 3453.7904 ms |
| Cliente: `npm test -- --no-cache --configLoader native` | 173 | 1.34 s |
| **Subtotal anterior, íntegro** | **444** | |
| `npm run test:workout:integration` | 84 | 10392.1489 ms |
| **Versión actual** | **528** | |
| `npm run test:workout:baseline` — caracterización histórica separada | 13 | 2089.6085 ms |
| **Total ejecutado, incluidas caracterizaciones** | **541** | |

Se verifican 10 combinaciones de fallo de DELETE/INSERT del PR, fallos intermedios
de log y series, rollback del primer cambio cuando falla el segundo, rollback de
archivado/borrado/reorganización y conservación de IDs y fechas. Se usan triggers
SQL reales y divisiones por cero controladas. Las pruebas concurrentes usan
conexiones independientes, no una base simulada.

El caso `P2034` reproduce una actualización concurrente real con PostgreSQL.
Los casos adicionales `40001` y `40P01` fuerzan esos SQLSTATE en PostgreSQL para
comprobar el límite y el rollback; no se presentan como un deadlock espontáneo.
Los dos casos de confirmación incierta simulan el fallo de reconocimiento después
de usar transacciones reales: uno realmente confirma y otro realmente revierte.
Se comprueban ambos estados finales y la ausencia de replay automático.

El runner crea un clúster temporal nuevo en loopback, puerto dinámico, usuario y
base `nexlift_workout_test`. No carga `.env` ni acepta una URL externa. Los tests
rechazan cualquier URL que no corresponda a ese destino. Se crea solo el corte
relacional necesario de ocho modelos, con FK reales y datos sintéticos. Al final
se detiene el clúster y se verifica la ruta absoluta de su directorio temporal
antes de eliminarlo. Los runners anteriores conservan su aislamiento propio.

Las pruebas HTTP usan los handlers reales e identidades sintéticas. La
autenticación JWT de producción conserva `authMiddleware`; se verifica su
registro. Los dos handlers inline del grafo se montan desde su código real sin
importar el entrypoint, para no arrancar jobs ni cargar configuración externa.
No se afirma cobertura de navegador/iPhone físico ni de proveedores push reales.

Build del cliente: `npm run build -- --configLoader native`, exitoso, 2637 módulos,
7.42 s de Vite. Persiste el aviso previo del chunk PDF de 779.10 kB sobre 600 kB.
ESLint con reglas recomendadas y globals Node: diez archivos JavaScript/MJS nuevos,
cero errores y avisos. Comprobación sintáctica adicional de esos archivos y de
`server/src/index.js`. El servidor no define script de build ni lint global;
no se afirma que todo el repositorio pase un lint que no se ejecutó.

## 7. Archivos de esta fase

Modificados:

- `server/src/index.js`: registro de los cinco handlers; coordinación de borrado
  de rutina y reorganización, sin cambiar sus algoritmos de archivado/selección.
- `server/package.json`: comandos de caracterización y nueva integración.
- `README.md`: enlace a este informe.

Nuevos:

- `server/src/routes/workouts.js`: handlers comprobables y efectos después del commit.
- `server/src/services/workoutTransaction.js`: unidad transaccional, bloqueos, errores y reintentos.
- `server/src/services/personalRecords.js`: helper derivado con cliente explícito.
- `server/test/run-workout-integration.mjs`: clúster PostgreSQL desechable.
- `server/test/workout-write.integration.test.js`: 84 pruebas de la versión actual.
- `server/test/workout-before.integration.test.js`: 13 caracterizaciones previas.
- `server/test/fixtures/workout-test-db.js`: esquema sintético, snapshots, HTTP y triggers.
- `server/test/fixtures/workout-graph-routes.js`: montaje aislado de handlers inline reales.
- `server/test/fixtures/workout-before-1.5.js`: implementación de entrenamientos anterior congelada.
- `server/test/fixtures/routine-delete-before-1.5.js`: borrado indirecto anterior congelado.
- `server/test/PHASE-1.5.md`: este informe.

## 8. Límites y dependencias futuras

La coordinación protege estos escritores de aplicación y los flujos anteriores
comprobados. No es una restricción universal contra SQL arbitrario o herramientas
que omitan la coordinación. `PersonalRecord` no tiene restricción única por
usuario/nombre; garantizarlo también para escritores externos requeriría una
migración y revisión explícita de duplicados históricos y propietarios nulos.

No hay clave de idempotencia persistente. Perder una respuesta después de un
commit no demuestra que la operación fallara. Los POST repetidos pueden crear
sesiones distintas; no se promete ejecución exactamente una vez. La solución
definitiva necesita un protocolo y almacenamiento de claves/resultado, con sus
restricciones de unicidad, en una fase posterior.

Los efectos posteriores son de mejor esfuerzo: una caída del proceso después
del commit y antes de agendar el aviso no queda resuelta por esta fase. Una
entrega transaccional garantizada necesitaría un outbox duradero y su diseño.
Tampoco se agrega versionado de ediciones para rechazar un formulario obsoleto.

## 9. Confirmación de alcance

No se accedió ni modificó producción. No se ejecutaron migraciones ni `db push`.
No se modificaron `schema.prisma`, algoritmos de entrenamiento, cliente,
dependencias/lockfiles, servicio de restauración ni los módulos `updateRoutine.js`,
`importRoutine.js` y `routineImportContract.js` de las fases 1.1/1.4.
Se conservaron los cambios previos presentes en el árbol de trabajo.
No hubo commits, despliegues, solicitudes a proveedores externos ni avance a
otra fase.
