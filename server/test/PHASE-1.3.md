# NexLift — Fase 1.3: respaldo, restauración e integridad

Fecha: 18 de octubre de 2026. Estado: **COMPLETADO**.

Se conservaron los cambios anteriores y los archivos documentales preexistentes.
No se inició la siguiente fase. No se conectó producción, no se llamó Cloudinary
real, no se eliminaron archivos históricos y no hubo commits ni despliegues.

## 1. Auditoría y cambios de arquitectura

Los ocho problemas conocidos seguían presentes:

| Hallazgo comprobado | Corrección |
| --- | --- |
| Settings pedía 9999, pero los endpoints limitaban el historial; eliminaba IDs y varios campos. | Un endpoint de exportación dedicado, paginado y sin truncamiento. |
| La exportación manual omitía información de IA y sus relaciones. | Rutinas de todos los `source`, días con `splitLabel`, perfil IA y sugerencias. |
| Ni el diario ni Settings incluían cardio, segmentos, perfil y sugerencias. | Cobertura explícita de los 17 modelos, con 15 incluidos y 2 excluidos justificadamente. |
| CLI omitía `source`, `splitLabel`, timestamps y otros campos en create/update; web omitía objetivos, mesociclos y descansos. | Campos escalares del modelo actual; relación completa y verificación después de escribir. |
| Web regeneraba IDs y relacionaba sesiones por nombres; podía saltarse ejercicios/series. | Mapa determinista de IDs y validación referencial antes de escribir. |
| Retención listaba globalmente y conservaba 14 entre todas las cuentas. | Namespace y consultas exclusivamente por usuario; legacy fuera de poda. |
| Ordenaba el ID con username para elegir el más reciente. | `created_at` real, paginación completa y selección por cuenta. |
| Los bucles podían fallar a mitad o responder éxito tras omisiones. | Transacción serializable, preflight, rollback y estadísticas explícitas. |

Se revisaron `backupService.js`, la CLI, ambos endpoints anteriores, Settings,
los 17 modelos y la documentación de auditoría disponible en `.agent/`.
Los formatos históricos analizados son los emitidos por el código del repositorio;
no se descargaron archivos privados ni respaldos reales para inspeccionarlos.

Flujo central:

```text
Settings → GET /api/backup/export ┐
Job y POST /api/backup/run ───────┴→ exportBackup → snapshot → formato v4
                                            → Cloudinary privado + readback

Web / CLI → readBackup → adaptador legacy o validación v4
                    → referencias y mapas → preflight del destino
                    → dry-run o transacción serializable
                    → comprobación de escalares/FK → commit o rollback
```

`exportBackup` usa `RepeatableRead`, conteo independiente por entidad y páginas
por ID (500 por defecto); todas las consultas pertenecen al mismo snapshot.
Si falla una página o un conteo, no se entrega un JSON parcial.
Las transacciones tienen timeout explícito de 120 segundos: excederlo produce un
fallo completo, no un respaldo truncado. La configuración sigue siendo JavaScript,
Express y Prisma 6.19.3, sin cambios de arquitectura general ni dependencias nuevas.
Prisma documenta las garantías y niveles en su [referencia de transacciones](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

## 2. Formato e integridad

El JSON contiene `backupSchemaVersion:4`, fecha ISO de generación, origen estable
`nexlift:user:<id>`, propietario, zona `America/Mexico_City`, manifiesto de 15
entidades, conteos, SHA-256 por entidad, datos planos con IDs/FK y SHA-256 global.
La serialización canónica ordena claves; conserva el orden de las listas.

La validación exige campos completos, tipos del modelo, fechas ISO canónicas,
IDs únicos, relaciones resolubles y un único propietario. No transforma el RIR:
`SetLog.rpe` conserva exactamente el entero almacenado, incluidos cero y null.
No se recalculan PRs ni se ejecuta Smart Loading durante una restauración.

Los checksums detectan corrupción o cambios accidentales. **No son una firma,
prueba de autoría ni cifrado**: quien puede modificar el archivo puede recalcularlos.
Solo se deben restaurar archivos de origen confiable.

Cada exportación declara `verification.restoreVerified:false`. La validación de
estructura y el readback de Cloudinary no prueban por sí mismos la recuperación.
El simulacro de un archivo concreto crea un clúster nuevo y solo emite un
comprobante externo tras restaurarlo, comparar todos los datos y repetir sin cambios:

```powershell
cd server
node test/run-backup-integration.mjs --verify-file=C:/respaldos/backup.json --receipt=C:/respaldos/backup.verificado.json
```

No carga `.env` ni consulta una base origen. El comprobante incluye SHA-256 de los
bytes exactos del archivo y del contenido v4, conteos originales/restaurados y
`restoreVerified:true`. No modifica el backup ni reemplaza un comprobante existente.
El runner apaga y elimina únicamente su clúster temporal, con la ruta comprobada.
La certificación completa no se ofrece para un archivo legacy con datos ausentes.

## 3. Clasificación de los 17 modelos

| Modelo | Contenido incluido / tratamiento |
| --- | --- |
| User | ID/origen, username/email, nombre, teléfono, nacimiento, URL avatar, fechas de cuenta y preferencias de creatina. Se excluyen credenciales, recuperación, revocación y estado operativo. |
| Routine | Manuales, IA y papelera histórica; `source`, estado, timestamps y descarga adaptativa. |
| RoutineBlock | Mesociclos, fase, orden, semanas y fecha de inicio. |
| RoutineDay | Nombre, orden, descanso, weekday, splitLabel y rutina padre. |
| Exercise | Todos los escalares, unilateralidad, objetivos, notas, descansos y día padre. |
| WorkoutLog | ID de ejercicio histórico, instante exacto y notas, incluso sesiones sin series. |
| SetLog | Número, carga/reps, RPE/RIR, ambos lados, completed y sesión padre. Incluye ceros y null. |
| PersonalRecord | Valores históricos completos y fecha; aunque algunos sean derivables, se conservan. |
| BodyLog | Todas las medidas, hábitos true/false/null, notas, fecha de registro y URL de imagen. |
| Goal | Objetivo, fechas, fuerza inicial, frecuencia, experiencia y semanas completadas. |
| RestLog | Instante original, nota y propietario. |
| CardioSession | Actividad, instante, calorías, notas y timestamps. |
| CardioSegment | Orden, minutos fraccionarios, inclinación, velocidad, notas y sesión padre. |
| TrainingProfile | Objetivo IA, equipo, frecuencia, experiencia y timestamps. |
| SuggestionLog | Historial de sugerencias mostrado, ejercicio, peso/reps, fase y origen. |
| PushSubscription | **Excluido:** endpoint y claves de autenticación; se vuelve a suscribir cada dispositivo. |
| PendingReminder | **Excluido:** temporizadores efímeros; se regeneran para no reenviar avisos vencidos. |

En User se excluyen `passwordHash`, `securityAnswerHash`, `securityQuestion`,
`tokenVersion`, `isActive`, `lastLogin`, estado de jobs/notificaciones,
`lastBackupAt`/`lastBackupError` y etapas/fechas del recordatorio de creatina.
Estos valores no son historial de entrenamiento ni preferencias recuperables.
Las preferencias del navegador y la cola/borradores offline no son modelos
PostgreSQL: mantienen su exportación local independiente de fase 1.2 y no se borran.
Las filas antiguas sin propietario no se asignan a una cuenta ni se exponen en
su JSON; el bundle PostgreSQL conserva esas filas si pertenecen a modelos incluidos.

Las URLs de `avatarUrl` y `photoUrl` son referencias. **No se incluyen los archivos
binarios originales ni se garantiza que Catbox/Cloudinary conserven esas fotos.**
No se descargaron imágenes reales para esta fase.

## 4. Restauración, aislamiento y estadísticas

- Misma cuenta/origen: conserva los IDs originales.
- Otra cuenta: genera IDs deterministas a partir de origen, destino, modelo e ID
  original. Remapea todas las FK; no relaciona sesiones por similitud de nombre.
- Un ID existente debe coincidir en todos los campos recuperables. Si su contenido
  o propietario difiere, responde 409 y no sobrescribe nada.
- TrainingProfile respeta su unicidad por cuenta: un perfil distinto causa conflicto.
- La API toma el destino exclusivamente del principal autenticado (`req.userId`).
  El archivo no puede elegirlo ni reasignar datos de otra cuenta.
- La cuenta destino debe existir. La restauración JSON no crea usuarios con
  credenciales del respaldo. Por defecto conserva también su perfil.
- `restoreProfile=true` o `--restore-profile` permite reemplazar únicamente nombre,
  datos del perfil y preferencias exportables, de forma explícita. Nunca cambia
  username, email, credenciales ni estado de acceso. No se permite con legacy incompleto.
- Se bloquea la cuenta destino dentro de la transacción serializable. Hay
  preflight de todos los registros antes de la primera escritura y comparación de
  escalares/FK antes del commit. No hay `upsert` que actualice historial existente.
- Repetir con el mismo perfil tampoco cambia `updatedAt`. Los conflictos
  concurrentes/unicidad son 409; un error inesperado devuelve 500 con rollback.

`stats` separa por entidad `expected`, `created`, `updated`, `unchanged`, `omitted`
y `rejected`. Dry-run deja `created/updated` en cero y muestra
`wouldCreate/wouldUpdate`; `plannedCreates` totaliza el plan. Los aliases anteriores
`bodyLogsImported`, `workoutsImported`, `routinesImported` y `prsImported` siguen
disponibles. Ante rollback, los conteos de creados/actualizados son cero.
Los archivos inválidos fallan antes de tocar la base; no se inventan estadísticas
de filas que no pudieron interpretarse. Un conflicto interrumpe el análisis, por
lo que los conteos del error reflejan lo inspeccionado hasta ese punto.

API:

```text
GET  /api/backup/export                                  # autenticado, no-store
POST /api/backup/import?dryRun=true                      # sin escrituras
POST /api/backup/import                                 # aplica v4
POST /api/backup/import?allowIncomplete=true             # acepta omisiones legacy
POST /api/backup/import?restoreProfile=true              # perfil explícito
POST /api/backup/run                                    # Cloudinary por usuario
```

Settings no modifica el archivo para normalizar hábitos antes de enviarlo (eso
invalidaba checksums y podía cambiar null por false). Muestra el análisis, conteos,
advertencias y botón explícito de aplicación. El checkbox de perfil repite el
análisis con esa opción. El servidor vuelve a validar el destino al aplicar.

## 5. Compatibilidad histórica

Se admiten el diario `version:1` con rutinas anidadas/IDs y el manual Settings
`version:'2.x'` con `workouts`, sin IDs. Son archivos sin manifiesto ni checksums
originales: nunca se presentan como recuperación completa demostrada.

Los IDs ausentes se derivan de la huella del archivo y la posición estructural.
Para entrenamientos sin exerciseId solo se acepta una única coincidencia exacta
del nombre normalizado dentro del archivo; cero o varias coincidencias fallan
indicando el entrenamiento y la relación ausente. No se crean ejercicios
inventados ni se tiran sesiones/series en silencio.

Los campos ausentes se enumeran por registro. Los placeholders internos de
normalización **no se escriben como hechos históricos**: se omiten esos campos
al crear y se dejan los defaults reales del destino, como timestamps nuevos.
No se pretende recuperar una fecha que el archivo nunca guardó.
`photo` se interpreta como la referencia histórica equivalente de `photoUrl`.

Legacy exige revisión y `allowIncomplete` al aplicar; devuelve `complete:false`
y advertencias explícitas. Campos/entidades ausentes siguen ausentes. La
repetición del mismo archivo no duplica. **Archivos legacy diferentes sin IDs
pueden compartir registros imposibles de identificar; no se promete deduplicar
entre archivos diferentes.** Versiones desconocidas o relaciones ambiguas fallan.
No se modifican archivos históricos originales.

## 6. Cloudinary, privacidad y retención

Los nuevos public IDs usan `nexlift-backups/users/<sha256-del-userId>/...uuid.json`.
No contienen username/email. Se suben con `raw`, `authenticated`, `overwrite:false`.
Se comprueba el resultado del proveedor y se descarga por URL privada de cinco
minutos para comparar estructura y checksum con el original. No se devuelve una
URL de descarga sensible en la respuesta de respaldo manual.

El listado requiere usuario, pagina hasta el final, descarta recursos fuera de su
namespace, deduplica y ordena por `created_at` real. Fechas inválidas/ciclos de
paginación abortan la poda. El límite sigue siendo 14 **por usuario**.

Para cumplir la prohibición de eliminar respaldos existentes, la poda está en
**dry-run por defecto**. `NEXLIFT_BACKUP_PRUNE_ENABLED=true` permite su activación
operativa posterior, exclusivamente en el namespace nuevo. No se activó aquí.
Los legacy nunca entran en esa poda: su acceso requiere public ID y consentimiento
administrativo explícitos en la CLI. No se adivina su dueño por un username en el
nombre ni se selecciona un legacy global como "último".

El código anterior ya subía `raw` + `authenticated`, no JSON público. Eso es
control de acceso del proveedor, **no cifrado propio del contenido**. Una URL
firmada filtrada permite acceso hasta su expiración; las credenciales del
proveedor y los operadores autorizados siguen teniendo acceso. HTTPS protege
el transporte; los archivos descargados son JSON en claro y contienen datos
personales. No se verificó la configuración efectiva ni assets antiguos reales.
Detalles de expiración y entrega en [Cloudinary: acceso a medios](https://cloudinary.com/documentation/control_access_to_media),
y paginación en [Admin API](https://cloudinary.com/documentation/admin_api#resources).

## 7. PostgreSQL y recuperación de emergencia

`postgres-recovery.mjs` ofrece un bundle de esquema y datos PostgreSQL de la
aplicación. **No es una copia de credenciales:** la restricción de no incluir
hashes impide usar un pg_dump directo sin filtrado como entrega de esta fase.

El bundle contiene `database.dump` custom de pg_dump, `users.safe.json` y
`manifest.json`. El dump excluye los datos de User, PushSubscription y
PendingReminder; conserva sus tablas. Los usuarios exportables van por separado.
Se comparte un snapshot PostgreSQL exportado entre Prisma y pg_dump. El esquema
público debe coincidir con los modelos/columnas clasificados; una tabla/columna
desconocida hace fallar el proceso para no exportar información sin revisar.
No incluye large objects externos a los modelos ni roles/globales del clúster.

El manifiesto registra SHA-256 de ambos archivos y conteos/huellas de las 15
entidades exportables. Las huellas relacionales internas usan MD5 sobre filas
PostgreSQL ordenadas para comparación, no para autenticación; los archivos se
protegen contra corrupción con SHA-256. La carpeta debe ser nueva: no reemplaza
respaldos existentes. Un fallo puede dejar un directorio incompleto sin manifiesto;
no es un respaldo válido y no se poda automáticamente.

Restauración: valida archivos y exige una base **nueva sin tablas/vistas/secuencias**.
pg_restore extrae `pre-data`, `data` y `post-data`; una sola transacción psql carga
esquema, usuarios seguros, datos y restricciones. Solo se omite el CREATE SCHEMA
public redundante del archivo, pues existe en una base recién creada. Una
comparación de conteos y huellas dentro de la misma transacción precede el commit;
si falla, también revierte todas las tablas creadas. No usa `--clean`, DROP ni TRUNCATE
contra destinos existentes. Los usuarios recuperados tienen `isActive:false`,
una marca de contraseña inutilizable y recuperación vacía: requieren un proceso
administrativo de restablecimiento y activación antes de entrar en servicio.

Procedimiento, a ejecutar en una estación/instancia autorizada; los comandos
de esta fase solo se probaron con bases locales sintéticas:

1. Conservar el original y su comprobante. Elegir un directorio nuevo fuera del
   repositorio para cada respaldo y una base nueva para recuperación. No arrancar
   la imagen actual de la aplicación para preparar esa base: su entrypoint
   preexistente ejecuta `db push`, fuera del alcance de esta fase.
2. Definir únicamente el destino/origen explícito de la herramienta. No carga `.env`:

   ```powershell
   cd server
   $env:NEXLIFT_TEST_PG_BIN='C:/Program Files/PostgreSQL/18/bin'
   $env:NEXLIFT_RECOVERY_DATABASE_URL='postgresql://operador@127.0.0.1:5432/nexlift_origen_local'
   node postgres-recovery.mjs dump C:/respaldos/nexlift-2026-10-18
   # Tras crear una base NUEVA mediante administración PostgreSQL local:
   $env:NEXLIFT_RECOVERY_DATABASE_URL='postgresql://operador@127.0.0.1:5432/nexlift_recuperacion_nueva'
   node postgres-recovery.mjs restore C:/respaldos/nexlift-2026-10-18
   ```

3. Confirmar el éxito transaccional, conteos por entidad y fechas, y realizar una
   exportación v4 de la base recuperada. Comparar su `data` con el respaldo lógico
   correspondiente. El restore del bundle verifica su propio manifiesto aun si
   no se dispone de un JSON separado.
4. Restablecer credenciales, revisar/activar las cuentas y registrar nuevamente
   Web Push mediante un procedimiento autorizado posterior. No se automatizó
   aquí la gestión de credenciales ni la conmutación de tráfico.
5. Solo después de validar una recuperación aislada se puede decidir un cambio
   operativo de destino. Esta fase no autorizó ni realizó ese cambio.

La CLI JSON también requiere destino explícito:

```powershell
$env:NEXLIFT_RESTORE_DATABASE_URL='postgresql://operador@127.0.0.1:5432/nexlift_recuperacion_nueva'
node restore-backup.mjs --file=C:/respaldos/backup.json --user=cuenta
node restore-backup.mjs --file=C:/respaldos/backup.json --user=cuenta --apply --restore-profile
```

Requisitos: binarios pg_dump/pg_restore/psql compatibles; pg_dump debe soportar
la versión del servidor origen. La prueba usó PostgreSQL 18.4. Restaurar entre
versiones mayores debe ensayarse; no se certifica un downgrade. `--no-owner` y
`--no-acl` evitan depender de roles originales; el operador necesita SELECT para
el origen y permisos de creación en el destino, sin asumir que se recuperan
roles, contraseñas del clúster, extensiones ajenas o privilegios originales.
Referencias: [pg_dump 18](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_restore 18](https://www.postgresql.org/docs/18/app-pgrestore.html).

Estrategia externa propuesta, sin configurarla en producción: segunda copia
fuera del VPS/proveedor principal, cifrada antes de enviarla a almacenamiento
privado con versionado/inmutabilidad y acceso limitado. Mantener 14 diarios por
cuenta en Cloudinary y, para bundles externos, 14 diarios, 8 semanales y 12
mensuales. No podar la última copia con recuperación comprobada. Conservar
comprobantes junto al archivo y ensayar mensualmente/tras cambios de formato.
La clave de cifrado debe guardarse fuera del respaldo y del proveedor. Ninguna
tarea programada, cifrado de archivos, almacenamiento externo ni retención del
bundle se activaron en esta fase. Sin ejecución diaria real no hay RPO garantizado;
con ejecución diaria verificada el objetivo es ≤24h. El RTO debe medirse con el
volumen real; no se deriva de un fixture pequeño. No se implementó PITR/WAL.

## 8. Comparación original/restaurado

Fixture sintético por cuenta (con relaciones reales y timestamps con milisegundos):

| Entidad | Exportados | Restaurados | Comparación |
| --- | ---: | ---: | --- |
| User | 1 | 1 cuenta destino / 1 usuario seguro en PG | Perfil opcional JSON; todos los campos exportables exactos en PG y simulacro del archivo. |
| Routine | 3 | 3 | IA, manual y papelera; escalares y relaciones exactos. |
| RoutineBlock | 1 | 1 | Incluye phase, startedAt, durationWeeks y orden. |
| RoutineDay | 1 | 1 | Incluye splitLabel, weekday null y orden. |
| Exercise | 1 | 1 | Unilateral, nota, descansos y objetivo. |
| WorkoutLog | 1 | 1 | Fecha `2026-10-18T05:59:59.123Z` exacta: 17/oct en CDMX. |
| SetLog | 1 | 1 | 17.5×11 izquierda, 15.25×9 derecha, rpe=3, completed=false. |
| PersonalRecord | 1 | 1 | Todos los valores y fecha sin recálculo. |
| BodyLog | 1 | 1 | Medidas completas, hábitos true/false/null y referencia de foto. |
| Goal | 1 | 1 | Progreso [1,2,4], achievedAt y fuerza inicial. |
| RestLog | 1 | 1 | Fecha original y nota. |
| CardioSession | 1 | 1 | Actividad, calorías y timestamps. |
| CardioSegment | 1 | 1 | 2.5 min, inclinación 11.75, velocidad 4.8. |
| TrainingProfile | 1 | 1 | Equipo, objetivo, frecuencia y experiencia. |
| SuggestionLog | 1 | 1 | Sugerencia original y FK al ejercicio remapeado. |

En otra cuenta, se comparan todos los escalares sustituyendo únicamente los IDs
y FK según el mapa. En misma cuenta y en la base vacía se conservan IDs originales.
Se comprueba que la cuenta origen y la otra cuenta preexistente permanecen
idénticas. La segunda restauración crea cero filas y no cambia timestamps.
Otra prueba exporta 1104 descansos en páginas de 97 sin perder registros.

La recuperación PostgreSQL incluye dos usuarios sintéticos; compara datos v4,
conteos globales por entidad e índices/objetos del catálogo. Push y temporizadores
quedan con cero filas, por exclusión explícita. Se inyecta una huella incorrecta:
psql falla antes del commit y el destino vuelve a tener cero tablas. El mismo
bundle correcto se restaura después con éxito. Ninguna de estas operaciones
alcanza una base existente del usuario.

## 9. Pruebas y verificación

Comandos reproducibles desde `server/`:

```powershell
npm test
npm run test:integration
npm run test:backup
npm run test:backup:integration
```

Desde `client/`:

```powershell
npm test -- --no-cache --configLoader native
npm run build
```

| Suite | Pasaron | Fallaron | Omitidas |
| --- | ---: | ---: | ---: |
| Backend anterior | 104 | 0 | 0 |
| Integración fase 1.1, PostgreSQL | 48 | 0 | 0 |
| Frontend, incluidas regresiones fase 1.2 | 159 | 0 | 0 |
| Cloudinary simulado, nuevas | 17 | 0 | 0 |
| Backups, HTTP/Prisma/PostgreSQL y simulacro, nuevas | 41 | 0 | 0 |
| **Total** | **369** | **0** | **0** |

Las 311 pruebas anteriores se ejecutaron de nuevo. Las 58 nuevas cubren las
19 categorías solicitadas: round-trip, conteos, FK/IDs, idempotencia, cuenta nueva,
base vacía, fallos/rollback, IA, unilateral, RIR, CDMX, objetivos/mesociclos,
cardio, corrupción, legacy, conflictos entre usuarios, retención/orden, ausencia
de credenciales y recuperación pg_dump/pg_restore real. Se incluyen concurrencia,
alteración silenciosa por trigger, snapshots frente a escrituras concurrentes,
descargas corruptas y comprobante de un archivo concreto.

El build frontend pasa. Persiste la advertencia previa del chunk PDF de 779.10 kB.
Los módulos backend/CLI pasan `node --check`. ESLint sobre Settings y api informa
4 errores de variables catch no utilizadas y 1 advertencia de dependencia de
useEffect, ya presentes en HEAD; no se declara el lint general limpio ni se
refactorizan esas funciones ajenas a respaldos.

Incidencias corregidas durante desarrollo: la primera normalización legacy no
consideraba el default de Prisma `@updatedAt`; el primer restore PostgreSQL
intentaba volver a crear el schema public de una base nueva. Ambas regresiones
quedaron corregidas y cubiertas. Los errores SQL inyectados son deliberados y
se comprueba el rollback; no son fallos de la suite final.

Los runners no aceptan URL de base externa: crean clústeres en directorios nuevos
del sistema, puertos dinámicos y escucha exclusiva en 127.0.0.1. Se crea el esquema
relacional de prueba desde los metadatos del modelo actual y sus índices declarados,
sin migraciones ni db push. El runner valida la ruta antes de su limpieza.
Los tests HTTP usan principales de fixture A/B; el middleware JWT de producción
permanece registrado en las rutas reales, pero estas pruebas no certifican JWT E2E
ni la interacción de Settings en un navegador real.

## 10. Archivos y límites operativos

Nuevos módulos: `src/services/backupFormat.js`, `backupExport.js`,
`backupLegacy.js`, `backupRestore.js`, `postgresBackup.js`; `src/routes/backup.js`;
CLI `postgres-recovery.mjs`; pruebas `test/backup-cloud.test.js`,
`backup.integration.test.js`, `fixtures/backup-fixture.js`,
`run-backup-integration.mjs`, `verify-backup-file.mjs` y este informe.

Modificados: `src/services/backupService.js`, `src/index.js`, `restore-backup.mjs`,
`package.json`, `.env.example`, `client/src/pages/Settings.jsx`,
`client/src/services/api.js` y la sección de respaldos del README raíz.

Límites restantes: fotos/binarios externos no cubiertos; no cifrado propio de
archivos; no autenticidad criptográfica; no backups productivos certificados en
esta fase; no prueba de Cloudinary real; poda deliberadamente inactiva hasta una
decisión operativa posterior; legacy no recupera datos nunca exportados; no
fusión automática de historias divergentes. Un respaldo v4 antiguo diferente del
contenido actual genera conflicto, no revierte silenciosamente ediciones nuevas.

La exportación reúne el resultado completo en memoria, aunque pagina las consultas.
Importaciones web siguen sujetas al límite HTTP existente de 10 MB y pueden fallar
con 413; la CLI permite analizar archivos mayores, sujeta a memoria/timeout.
Los bundles PostgreSQL requieren espacio para archivo y SQL de restauración en
memoria; no se han ensayado volúmenes productivos ni otros esquemas/extensiones.
Un archivo SQL/pg_dump de un origen no confiable puede ejecutar código: checksum
no elimina ese riesgo. Se debe restaurar bajo un rol acotado en una instancia aislada.

No se modificó `schema.prisma`, los lockfiles, los algoritmos de entrenamiento ni
el Dockerfile. No se ejecutaron migraciones, db push, scripts de reparación,
servidor productivo, restauraciones sobre bases existentes, llamadas a Cloudinary
real, commits o despliegues. La fase siguiente permanece sin iniciar.
