# NexLift V4.0 — Fase 2.1: auditoría y preparación PostgreSQL

Estado: **COMPLETADO — preparación; activación pendiente**. Fecha: 2026-10-18.

No se conectó a producción ni a bases existentes del usuario. No se leyeron `.env`, credenciales o respaldos reales. No se modificó `schema.prisma`, el Dockerfile, la aplicación, datos históricos ni implementaciones de fases anteriores. No se ejecutaron `migrate resolve`, `migrate deploy`, `migrate dev`, `db push` o migraciones activas; tampoco commits o despliegues. La única operación Prisma de esta fase fue `migrate diff --from-empty --to-schema-datamodel ... --script`, offline, con una copia temporal del esquema y sin URL utilizable.

## 1. Entorno y evidencia comprobada

Se crearon dos bases nuevas, `nexlift_schema_audit` y `nexlift_schema_rebuild`, en un clúster temporal propio, loopback y puerto dinámico. Motor comprobado: **PostgreSQL 18.4**, UTF-8, `--no-locale`. Se detuvo y eliminó exclusivamente ese clúster al terminar. Los demás ensayos conservaron sus runners aislados previos.

| Concepto | Declarado / comprobado en reconstrucción desechable | Producción |
|---|---|---|
| Entidades / columnas | 17 / 155 | Sin inspeccionar |
| FK | 18, todas DELETE CASCADE y UPDATE CASCADE, validadas y no diferibles | Sin inspeccionar |
| Índices | 48: 17 PK, 5 únicos adicionales, 26 ordinarios | Sin inspeccionar |
| Restricciones `pg_constraint` p/u/f/c/x | 35: 17 PK + 18 FK; los otros 5 únicos son índices únicos | Sin inspeccionar |
| CHECK de dominio | Ninguno en la reconstrucción | Sin inspeccionar |
| RLS y objetos propios adicionales | No declarados ni encontrados en reconstrucción | Sin inspeccionar |
| Historial Prisma Migrate | No activado; no carpeta ni tabla de migraciones creada por esta fase | Desconocido |
| CLI / paquete Client del lock e instalación | 6.19.3 / 6.19.1; cliente generado informa 6.19.3 | Imagen instalada no inspeccionada |

No hubo diferencias entre los catálogos reconstruidos y la referencia declarada, tanto en la primera base como en la segunda. Esto demuestra reproducibilidad **del esquema declarado**, no equivalencia con producción. Las alteraciones de prueba se revirtieron y el catálogo final quedó igual al inicial.

## 2. Inventario completo

El [inventario por columna](INVENTORY.md) contiene los 155 campos, tipos SQL reales, NULL/defaults, declaraciones Prisma, los 48 índices completos y las 18 FK. [declared-catalog.json](declared-catalog.json) es la referencia comparable y [declared-schema.sql](declared-schema.sql) el DDL de reconstrucción, marcado expresamente como evidencia y no baseline aprobada.

Todos los modelos tienen PK `id text`. Prisma genera el CUID: **no hay default SQL para id**. `String → text`, `Int → integer`, `Float → double precision`, `Boolean → boolean`, `DateTime → timestamp(3) without time zone`; no se cambió semántica UTC/CDMX. `@updatedAt` depende del cliente, sin default ni trigger SQL. Las listas `Goal.completedWeeks integer[]` y `TrainingProfile.equipment text[]` son requeridas por Prisma pero las columnas SQL permiten NULL y carecen de default. Esa diferencia debe contemplarse en SQL directo y restauraciones; no se corrigió ahora.

| Modelo | Columnas | Propiedad / dependencia | Índices ordinarios / únicos extra | Uso principal |
|---|---:|---|---:|---|
| User | 23 | Raíz | 2 / 2 | Identidad, perfil, estado y recordatorios |
| Routine | 10 | `userId` opcional → User | 2 / 0 | Manual, IA, archivo; activa es una bandera |
| RoutineBlock | 7 | Routine obligatorio | 1 / 0 | Bloques de periodización |
| RoutineDay | 7 | Routine obligatorio | 1 / 0 | Día manual/IA/Bin; weekday opcional |
| Exercise | 10 | RoutineDay obligatorio | 3 / 0 | Nombre, músculo opcional, prescripción, descanso opcional, nota y unilateralidad |
| WorkoutLog | 4 | Exercise obligatorio | 3 / 0 | Fecha, notas opcionales y sesión |
| SetLog | 9 | WorkoutLog obligatorio | 1 / 0 | Número, lado izquierdo/derecho, rpe opcional y completed |
| PersonalRecord | 7 | `userId` opcional → User | 2 / 0 | Nombre, peso, reps, 1RM opcional y fecha |
| RestLog | 4 | `userId` opcional → User | 1 / 0 | Descanso histórico |
| BodyLog | 18 | `userId` opcional → User | 2 / 0 | Mediciones/hábitos opcionales y referencia de foto |
| Goal | 13 | User obligatorio | 1 / 0 | Objetivo, progreso y completedWeeks |
| PushSubscription | 6 | User obligatorio | 1 / 1 | Endpoint único, claves; datos sensibles |
| PendingReminder | 6 | User y Exercise obligatorios | 0 / 1 | Único `(userId, exerciseId)` |
| SuggestionLog | 8 | User y Exercise obligatorios | 3 / 0 | Instrumentación del entrenador |
| TrainingProfile | 8 | User obligatorio, 1:1 | 0 / 1 | `userId` único, equipo y preferencias IA |
| CardioSession | 8 | User obligatorio | 2 / 0 | Cardio independiente de los pesos/PR |
| CardioSegment | 7 | CardioSession obligatorio | 1 / 0 | Tramos de duración, inclinación y velocidad |

Los únicos extra son `User.username`, `User.email`, `PushSubscription.endpoint`, `TrainingProfile.userId` y `(PendingReminder.userId, exerciseId)`. No hay unicidad de PR, rutina activa, rutina IA, día IA, número de serie o sesión diaria. La unicidad de correo/username usa la collation/tipo SQL existentes; no se añadió equivalencia por minúsculas.

Orden topológico de inserción/restauración: User → Routine / entidades propias / CardioSession → RoutineBlock y RoutineDay / CardioSegment → Exercise → WorkoutLog / PendingReminder / SuggestionLog → SetLog. PersonalRecord depende del User, **no** de Exercise o WorkoutLog; no existe FK que lo mantenga sincronizado con el historial.

## 3. Relaciones peligrosas y cascadas intencionales

Todas las filas siguientes tienen `ON UPDATE CASCADE`. Acciones DELETE reales verificadas sólo en la reconstrucción:

| FK (hija → padre) | DELETE actual | Evaluación y transición propuesta |
|---|---|---|
| WorkoutLog.exerciseId → Exercise | CASCADE | **P0, pérdida de historial**. Candidata a RESTRICT inmediata; exige adaptación de errores y borrado de cuenta. |
| Exercise.routineDayId → RoutineDay | CASCADE | Propaga un borrado de día hasta las sesiones. Puede conservarse si el enlace WorkoutLog queda protegido y se archiva antes. |
| RoutineDay.routineId → Routine | CASCADE | Propaga un borrado de rutina. Misma protección indirecta y archivado previo. |
| Routine.userId → User | CASCADE | Borrado de cuenta potencialmente intencional; requiere flujo explícito si se protege WorkoutLog. |
| SetLog.workoutLogId → WorkoutLog | CASCADE | Composición intencional: borrar una sesión explícitamente elimina sus series. No cambiar sin rediseñar ese contrato. |
| RoutineBlock.routineId → Routine | CASCADE | Composición del plan; no contiene sesiones. Mantener. |
| SuggestionLog.exerciseId → Exercise | CASCADE | Se pierde calibración histórica. Decidir política de retención; archivar Exercise ya la conserva cuando tiene sesiones. |
| PendingReminder.exerciseId → Exercise | CASCADE | Temporizador efímero; limpieza intencional. |
| PendingReminder.userId → User | CASCADE | Limpieza al borrar cuenta. |
| SuggestionLog.userId → User | CASCADE | Retención/eliminación explícita de datos de cuenta. |
| PersonalRecord.userId → User | CASCADE | Limpieza de derivado propio al borrar cuenta; no protege frente al borrado de Exercise. |
| RestLog.userId → User | CASCADE | Historial de cuenta; conservar para borrado explícito, revisar autorización operativa. |
| BodyLog.userId → User | CASCADE | Igual; contiene mediciones personales. |
| Goal.userId → User | CASCADE | Estado propio de cuenta. |
| PushSubscription.userId → User | CASCADE | Limpieza intencional de credenciales push. |
| TrainingProfile.userId → User | CASCADE | Composición 1:1 de cuenta. |
| CardioSession.userId → User | CASCADE | Elimina cardio histórico al borrar cuenta; intencional sólo como operación explícita de cuenta. |
| CardioSegment.sessionId → CardioSession | CASCADE | Composición intencional del cardio. |

Se confirmó con datos sintéticos que borrar Exercise, RoutineDay o Routine directamente borra WorkoutLog y SetLog y deja PersonalRecord. La cascada no sabe que el servicio desea preservar entrenamiento. No se afirma que ese borrado ya haya ocurrido en producción.

### Protecciones actuales de Fases 1.1 y 1.5

El editor de rutina revalida pertenencia, bloquea rutina/días/ejercicios dentro de Serializable, archiva ejercicios con logs y conserva sus IDs. DELETE de rutina y reshuffle IA usan la transacción de Fase 1.5: User `FOR NO KEY UPDATE`, bloqueo del grafo **antes de contar** historial y traslado al Bin antes de eliminar. DELETE rechaza archivar en la misma rutina que se elimina. Las escrituras de entrenamientos/series/PR son atómicas; el PR usa el mismo cliente transaccional y los recordatorios se ejecutan después del commit. Se reejecutaron sus pruebas, incluidas carreras y rollback.

Estas protecciones cubren los servicios participantes. Una sentencia SQL directa, otro escritor, una tarea administrativa o un futuro endpoint puede ejecutar la cascada tras adquirir los locks. Los locks no constituyen una política permanente de retención; sólo coordinan la transacción en curso. El esquema también permite mover un Exercise a un día de otro usuario, o cambiar el propietario de una Routine: el historial adquiere el nuevo propietario por el join, sin infringir ninguna FK.

### Restrict frente a NoAction

Se recomienda evaluar primero **RESTRICT en WorkoutLog → Exercise**, conservando el ejercicio como ancla de la sesión. Bloquea también el borrado indirecto de rutina/día si todavía quedan ejercicios con logs. Se probó que mover el mismo Exercise a un Bin del mismo usuario y después borrar la rutina sigue funcionando; no se recrean sesiones o series.

`NO ACTION` no diferible también impide que quede una referencia inválida al comprobar la sentencia. Con `DEFERRABLE` permite reordenar operaciones dentro de una transacción y exige integridad al commit; RESTRICT no difiere esa comprobación. En el ensayo, un commit inválido con NO ACTION diferido falló y el reparentado dentro de una transacción válida conservó las series. Esa flexibilidad exige justificación; diferibilidad se mantendría en SQL versionado, porque Prisma no expresa por sí solo todos esos detalles. Véase [PostgreSQL: constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

**Compatibilidad de errores comprobada:** en PostgreSQL 18.4 RESTRICT produjo SQLSTATE `23001`, expuesto por el cliente generado 6.19.3 como `PrismaClientUnknownRequestError`; no se puede asumir exclusivamente P2003/23503. Antes de activar, manejar el conflicto como respuesta de negocio, sin reintentar un borrado prohibido ni ocultarlo como éxito. Verificar además el motor/cliente reales del despliegue.

Consecuencias operativas:

- Rutinas manuales/plantillas: continuar el archivado antes de borrar; ejercicios sin historial pueden eliminarse.
- Papelera: tratarla como recurso del sistema; impedir su borrado físico mientras tenga historial. El nombre marcador actual no es una identidad estructural ni una restricción SQL.
- IA: generación no debe borrar días ya entrenados; reshuffle conserva/archiva lo histórico. Probar los flujos con la FK nueva antes del cambio.
- Respaldo: el restore por cuenta inserta padres antes que hijos y no borra para reconciliar; ensayarlo con el nuevo constraint y sus validaciones de legados. El restore completo en base vacía debe reconstruir esa FK y validar al cargar.
- Cuenta: hoy el borrado directo en SQL cascada toda la cuenta; no se encontró endpoint de eliminación física de User en los módulos inspeccionados. Con RESTRICT, ese borrado queda bloqueado. Definir y autorizar un servicio explícito que bloquee la cuenta, elimine sus WorkoutLog y derivados y luego User en una transacción; ofrecer desactivación si se desea conservar historial. Nunca tratar este bloqueo como motivo para deshabilitar triggers.
- Legados: medir huérfanos y propietarios NULL en una copia. No asignar cuentas ni regenerar IDs por inferencia. La nueva FK no recupera historial perdido con anterioridad y no impide por sí sola un DELETE explícito de WorkoutLog.

## 4. Hallazgos clasificados

### Problemas confirmados en código y entorno sintético

| Hallazgo | Evidencia / efecto |
|---|---|
| Cascada deportiva y PR independiente | DELETE directo borró sesiones/series; PR permaneció. |
| Falta de unicidad DB de PR | Dos filas de la misma cuenta, `press`/`PRESS`, fueron aceptadas. La serialización actual protege escritores participantes, no SQL ajeno. |
| Propiedad no expresada en FK | Recordatorio/sugerencia de B apuntando a Exercise de A fueron aceptados; los diagnósticos los detectaron. |
| Nulabilidad heredada de propietarios | Routine/PersonalRecord/BodyLog/RestLog admiten NULL; los descendientes de Routine quedan sin cuenta. NULL no es huérfano de FK. |
| Ausencia de CHECK de dominio | SQL aceptó weekday=9 y pesos NaN/Infinity. La validación HTTP actual permanece vigente, pero no es una garantía DB. |
| Divergencia ORM/SQL | Arrays NULL, CUID y updatedAt dependen de semántica del cliente. |
| Arranque tras fallo de db push | Dockerfile usa `... db push ... || echo ...; npm start`: el resultado del push no bloquea el servidor. |
| Migraciones ignoradas | `.gitignore` excluía `server/prisma/migrations/`; se retiró sólo esa exclusión. No había historial local que activar. |
| Backup completo incompatible con metadatos futuros | `createPostgresRecoveryBundle` exige exactamente las 17 tablas/columnas DMMF; `_prisma_migrations` provocará rechazo. Evidencia del guard en código; no se creó ni activó esa tabla para probarlo. |

### Riesgos potenciales, sin afirmar incidencia productiva

`activate` desactiva y activa mediante dos escrituras separadas; la preparación IA hace upsert de perfil, desactivación y selección/creación de Routine por separado. La generación del día consulta y después crea, sin unicidad. Dos solicitudes pueden dejar varias rutinas activas, varias rutinas IA o días IA duplicados; se comprobó que PostgreSQL acepta dichos estados, pero no se ejecutó una carrera HTTP contra producción.

Otros riesgos: papelera duplicada por nombre; números de serie repetidos históricos; pushes y jobs duplicados si hay varias réplicas; índices de expresión/collation incompatibles; índices inválidos tras DDL fallido; SQL directo que evade propiedad; transición de esquema que rompe restauraciones y convivencia de versiones. No hay recibos idempotentes persistentes: un `operationId` de la cola local no es una restricción ni un acuse persistido por el backend.

### Decisiones de arquitectura que deben aprobarse

Retención frente a eliminación explícita de cuentas; RESTRICT o NO ACTION y diferibilidad; identidad de ejercicio para PR; propiedad inmutable y movimientos sólo dentro de una cuenta; recurso estructural de papelera; fecha de generación IA separada de dayName decorativo; protocolo de idempotencia, retención de recibos y comportamiento al restaurar. No cambiar fórmulas de entrenamiento para resolver problemas de persistencia.

### Pendiente de comprobar en una copia PostgreSQL autorizada

Esquema efectivamente instalado, versión/locale/collation, historial Migrate previo, todas las FK y triggers/validación, tablas ajenas, tipos/defaults reales, ACL/RLS/extensiones/objetos propios, volumen y antigüedad, duplicados y NULL reales, referencias huérfanas, índices/uso/planes, locks/tiempos y recuperación de un respaldo concreto. No hay evidencia para declarar producción íntegra o libre de duplicados.

## 5. Restricciones candidatas: prioridad y compatibilidad

P0 = protección/precondición; P1 = integridad de escritura; P2 = endurecimiento sujeto a semántica. **Ninguna se instaló en el esquema de aplicación.** Los prototipos se limitaron a bases desechables.

| Candidata | Prioridad | Compatibilidad / riesgo de migración |
|---|---|---|
| RESTRICT WorkoutLog.exerciseId | P0 | Conserva archivos con mismo ID. Cambia borrado de cuenta, errores y cascadas; revisar clientes y legados. |
| FK faltantes/no validadas, si se descubren | P0 | Preflight de huérfanos, `NOT VALID`/`VALIDATE` cuando proceda; no borrar filas para validar. |
| Propiedad coherente y sin transferencias entre cuentas | P0/P1 | No se resuelve con CHECK que haga joins. Elegir triggers transaccionales con locks o propagación de userId y FK compuestas. Requiere backfill validado y tratar NULL heredados; conservar movimientos al Bin de la misma cuenta. Evaluar RLS como defensa adicional, no sustituto de FK. |
| Único PR por usuario y nombre con equivalencia vigente | P1 | Prototipo `UNIQUE(userId, lower(exerciseName)) WHERE userId IS NOT NULL`. Falló sobre duplicados y protegió dos escritores concurrentes al estar limpio. Verificar collation y equivalencia con consultas actuales; no fusionar acentos/espacios por suposición. Sólo resolver derivados con historia verificable y respaldo; PR legacy sin historia no se elimina automáticamente. |
| A lo sumo una Routine activa por userId no NULL | P1 | Índice único parcial `WHERE isActive AND userId IS NOT NULL`. Antes, hacer activación y setup atómicos y manejar conflicto; no elegir una activa arbitrariamente si ya existen varias. |
| Identidad persistente de operación `(userId, operationId)` | P1, requiere diseño | Nuevo recibo con hash de payload, tipo/versión y resultado, commit junto al workout/PR. No equivale a unicidad de sesión diaria. Misma clave/payload reutiliza resultado; distinto payload da conflicto. Diseñar TTL mayor que ventana real de reintento y política de restore antes de implementar. |
| Día IA único por rutina y fecha de generación | P1 | No imponer `UNIQUE(routineId,dayName)` general: las etiquetas manuales pueden repetirse. Un índice parcial no puede hacer JOIN a Routine.source. Preferir campo de fecha generado/identidad explícita, sólo IA, con backfill y unicidad acotada; o trigger validado. No inferir IA sólo de splitLabel, que la importación manual también admite. |
| Una Routine IA por usuario / una papelera por usuario | P2 | El código busca una, pero podrían existir rutinas IA históricas o colisiones del nombre reservado. Auditar y definir recurso estructural; preservar sus ejercicios/historial antes de consolidar. |
| Único `(workoutLogId,setNumber)` | P1/P2 | Hoy se permiten duplicados. Revisar números heredados/edición/restore y preservar series completas; no renumerar ni eliminar silenciosamente. No exigir secuencia contigua: ya se admiten huecos. |
| weekday NULL o 0..6 | P1/P2 | Incluye domingo 0. Prototipo CHECK NOT VALID protegió nuevas escrituras y rechazó validar históricos inválidos hasta corregir el dato sintético. Remediación real requiere decisión. |
| Finitud y dominios mínimos de pesos/reps/descanso/series | P2 | No prohibir ceros/incompletos/right parcial legítimos ni máximos arbitrarios. Extraer el contrato existente; no congelar catálogo muscular o strings evolutivos en un ENUM sin estudiar legados. |
| NOT NULL en propietarios heredados o arrays | P2 | Sólo tras inventario y mapeo fiable. No convertir NULL en datos inventados. Cada tabla/contrato requiere compatibilidad con backups anteriores. |
| Único ejercicio + día de entrenamiento | **Descartada** | Se comprobaron varias sesiones legítimas el mismo día. No usar para idempotencia ni para unir registros. |
| Único weekday/order/nombre manual global | **No automática** | Requiere estudiar datos/importaciones; nombres de ejercicio repetidos son legítimos. Los diagnósticos de órdenes son informativos. |

Los CHECK que comparan con otras tablas no sustituyen una FK o un trigger correcto. El protocolo de idempotencia necesita persistencia real; serializable y el lock de cuenta evitan carreras participantes, pero no aseguran exactamente una ejecución cuando se pierde el acuse de commit.

Índices: `PendingReminder.exerciseId` no tiene índice propio con esa columna como prefijo; el único compuesto comienza por userId. Una eliminación de Exercise podría escanear recordatorios. Existen candidatos redundantes (`User.email`/`username` además de únicos; índices simples que son prefijos de compuestos). Medir planes, tamaño y uso en la copia antes de añadir/eliminar: no se cambiaron índices.

## 6. SQL de lectura y comparación

Se prepararon y ejecutaron [catalog.sql](catalog.sql), [counts-and-orphans.sql](counts-and-orphans.sql), [declared-orphans.sql](declared-orphans.sql) y [diagnostics.sql](diagnostics.sql). La [guía de uso](README.md) explica sus transacciones READ ONLY, timeouts, protección de conexiones, permisos/RLS y limitaciones. Incluyen tablas/columnas, FK y acciones, índices/restricciones, conteos, huérfanos instalados y declarados, propietarios ausentes, duplicados y distribución anual histórica; no devuelven filas personales.

La comparación detectó cambios sintéticos de acción FK, defaults, nulabilidad e índices, una FK faltante y triggers FK deshabilitados. Se comprobó que las inspecciones dejan filas iguales y que los defaults sensibles no se imprimen. El wrapper rechaza conexiones implícitas/URLs y sólo admite servicio explícito de una copia confirmada; la ruta feliz se verificó exclusivamente con el servicio temporal sintético creado por el runner.

Cada archivo tiene snapshot propio. La comparación definitiva exige una copia inmovilizada y revisión del DDL completo para lo que el catálogo resumido/Prisma no representan. No se ejecutó este wrapper sobre una copia real ni se inspeccionó producción.

## 7. Plan SQL de las próximas fases

La [estrategia de baselining](BASELINING.md) desarrolla restauración, conciliación, generación, reconstrucción, Git, aprobación de `resolve`, release separado, readiness y recuperación.

Orden propuesto:

1. **Fase 2.2: baseline sin endurecer relaciones.** Copia autorizada, respaldo completo verificado, catálogo real conciliado, toolchain reproducible, soporte de `_prisma_migrations` en recuperación, baseline fiel, pruebas de reconstrucción y ensayo de marcado en staging. No mezclar limpieza de datos o constraints nuevos en el SQL que se marcará como ya aplicado.
2. **Después de aprobar la transición:** eliminar DDL del arranque en la nueva imagen y en el rollback, release job controlado y checks de compatibilidad. La activación en una base existente requiere autorización y gates; no ocurre por crear archivos de migración.
3. **Migración posterior de historial:** adaptar servicios/errores/borrado de cuenta; ensayo de backups, papelera y toda la IA; cambiar sólo la FK protegida en una transacción corta. Sustituir la FK CASCADE por la nueva con `NOT VALID` si el procedimiento lo justifica y luego `VALIDATE CONSTRAINT`. No dejar una ventana sin protección ni confiar en que añadir RESTRICT junto a una CASCADE todavía activa neutraliza la cascada. Revisar locks y `lock_timeout` en staging.
4. **Migraciones posteriores de unicidad:** resolver duplicados con política aprobada, estabilizar escritores, crear índices únicos/expresión/parciales y verificar. Si se usa `CREATE UNIQUE INDEX CONCURRENTLY`, separarlo de transacciones normales, verificar índices inválidos tras fallos y no asumir que resuelve datos duplicados. No aplicar restricciones generales de días IA/manuales.
5. **Migraciones de pertenencia/idempotencia y CHECK:** expandir primero, backfill revisado, doble compatibilidad y validación antes de hacer campos obligatorios. Revisar exportación/restauración y versiones de contratos en cada cambio.

Para grandes tablas, medir los locks de ADD/DROP FK y validación; `NOT VALID` reduce trabajo inicial pero no significa que la restricción ya esté validada. Los únicos no tienen el mismo flujo NOT VALID que CHECK/FK. Véase [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html). No se dejó un script de ALTER para ejecutarse automáticamente en esta fase.

## 8. Riesgos del despliegue actual

| Componente | Hallazgo y plan |
|---|---|
| Dockerfile | `db push --skip-generate || echo ...; npm start` ejecuta Node aun si falla push. Cada restart/réplica puede reconciliar el esquema. Se conserva por restricción expresa; reemplazar sólo tras ensayar el release futuro. |
| npm | Existen `db:push`, `db:generate`, `db:studio`; no hay scripts de deploy/resolve activos. Se agregó únicamente `test:schema:audit`. `npm install` en la imagen, rangos `^6.0.0`, CLI/Client con parches distintos y base `node:20-alpine` mutable dificultan reproducibilidad; fijar versiones/lock y npm ci en tarea posterior. |
| Prisma CLI | Es devDependency; la imagen actual copia node_modules completo. Si se podan devDependencies posteriormente, un job basado en esa imagen necesita conservar/proveer el CLI exacto. No depender de una descarga npx en arranque. |
| `.gitignore` | Se retiró la exclusión de migraciones. No se creó el directorio ni se registró historial. |
| Build context | No hay `.dockerignore` raíz; `.gitignore` no excluye archivos del contexto Docker. `COPY server/` podría incluir `.env`, backups u otros archivos locales si están presentes en el contexto. Se identificó el riesgo por código; no se abrieron esos archivos. Añadir exclusiones y revisar imágenes en otra tarea. |
| Arranque / health | `$connect()` no prueba revisión de esquema. `/api/health` mantiene `ok` aunque falle la consulta de backup. Nueva app contra esquema antiguo podría recibir tráfico y fallar endpoints/jobs. Hace falta gate de esquema y readiness. |
| EasyPanel | Compatibilidad propuesta con Docker, scripts y comando de override según documentación. No se inspeccionó panel, servicio, versión, réplicas, redes ni configuración real; no asumir un hook que bloquee publicación sin comprobarlo. |
| Rollback | Revertir imagen no revierte DB. La imagen antigua aún ejecuta db push al arrancar; preparar override sólo Node y compatibilidad antes de cualquier transición. No recuperar con reset ni restaurar automáticamente encima de datos nuevos. |
| Varias réplicas | Los jobs basados en timers y recordatorios requieren coordinación aparte. No ejecutar migraciones por réplica; usar una unidad de release y verificar su resultado. |

## 9. Pruebas y comprobaciones

Todos los resultados finales se registran después de los ajustes de los ensayos; hubo una expectativa inicial corregida al observar SQLSTATE 23001, sin cambiar producción. Los 13 casos históricos continúan caracterizando fixtures anteriores a Fase 1.5: no se cuentan como regresiones de la aplicación actual.

| Comando / directorio | Aprobadas | Duración reportada |
|---|---:|---:|
| `npm test` — server | 104 | 427.0673 ms |
| `npm run test:integration` — server | 48 | 7178.2847 ms |
| `npm run test:backup` — server | 17 | 729.7384 ms |
| `npm run test:backup:integration` — server | 41 | 22679.5608 ms |
| `npm run test:import` — server | 22 | 191.1558 ms |
| `npm run test:import:integration` — server | 39 | 4829.3866 ms |
| `npm run test:workout:integration` — server | 84 | 13269.4962 ms |
| `npm test -- --no-cache --configLoader native` — client | 173 | 1.61 s |
| Regresiones anteriores de aplicación actual | **528** | — |
| `npm run test:workout:baseline` — fixtures históricos | **13** | 1922.7945 ms |
| `npm run test:schema:audit` — esquema completo aislado | **54** | 13655.582 ms |
| **Total final ejecutado** | **595** | — |

Todos esos comandos terminaron con exit code 0; fallos, cancelaciones y omitidas: 0. Las duraciones corresponden al proceso de pruebas, no a todo el aprovisionamiento temporal.

Los 54 ensayos nuevos comprueban: reconstrucción idéntica en dos bases nuevas; las 18 FK reales rechazando huérfanos; cascadas y PR residual; borrado de cuenta/legados; ON UPDATE; rollback; RESTRICT y NO ACTION diferido; archivado conservando IDs; pertenencias incompatibles permitidas actualmente; unicidad PR concurrente y su incompatibilidad con duplicados; activa/IA duplicadas; múltiples sesiones permitidas; duplicados de series; NULL heredados; NaN/Infinity; CHECK NOT VALID/validación; drift real y FK faltante; consultas read-only, privacidad, rechazo de conexión implícita y wrapper positivo sintético; CUID/updatedAt/arrays; los cinco únicos existentes; triggers deshabilitados y defaults sensibles.

ESLint recomendado sobre los cuatro JS/MJS nuevos: **0 errores, 0 advertencias**. `node --check`: **4/4**. `git diff --check` sobre `.gitignore`, README y package: aprobado. Revisión UTF-8/espacios de los 14 archivos nuevos: aprobada; los enlaces relativos de los documentos nuevos resuelven. `schema.prisma`, Dockerfile y ambos lockfiles conservan su contenido versionado. La ruta futura de migraciones ya no está ignorada; no se creó historial de migraciones. No se requiere rebuild de frontend: no se modificó su código ni el código de aplicación.

## 10. Archivos de esta fase

Modificados: `.gitignore` (permitir migraciones futuras), `server/package.json` (un script aislado), `README.md` (enlace de auditoría). No se modificó lógica previa.

Creados en `server/audit/postgresql/`: `README.md`, `PHASE-2.1.md`, `BASELINING.md`, `INVENTORY.md`, `catalog.sql`, `counts-and-orphans.sql`, `declared-orphans.sql`, `diagnostics.sql`, `declared-schema.sql`, `declared-catalog.json`, `audit-tools.mjs`, `inspect-authorized-copy.mjs`.

Creados en `server/test/`: `run-schema-audit.mjs`, `schema-audit.integration.test.js`.

## 11. Acción exacta para Fase 2.2

**Comenzar por autorizar y restaurar un respaldo completo en staging aislado; ejecutar allí el inventario y conciliarlo con Prisma. Antes de marcar ninguna baseline, adaptar y probar el respaldo PostgreSQL para `_prisma_migrations`, fijar CLI/Client y preparar el arranque sin DDL. Generar la baseline desde el estado real conciliado, reconstruir otra base nueva y verificar recuperación y regresiones. Sólo entonces aprobar el marcado como aplicada en staging y el release controlado; producción necesita autorización y verificación separadas.** No endurecer relaciones ni resolver duplicados en la migración inicial que se marcará como ya aplicada.

Fase 2.1 completada. Fase 2.2 no iniciada. La comparación definitiva con producción queda expresamente pendiente.
