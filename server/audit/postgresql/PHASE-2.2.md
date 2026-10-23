# NexLift V4.0 — Fase 2.2: baseline Prisma Migrate

Fecha: 2026-10-18. **Implementación y ensayo: COMPLETADO. Baseline: PROVISIONAL.**

Validada con el esquema declarado y datos sintéticos en PostgreSQL 18.4. **No VERIFICADA EN STAGING ni APTA PARA ACTIVACIÓN**: no existe una copia íntegra autorizada inspeccionada en esta sesión. Ninguna prueba sintética autoriza activar producción.

## 1. Versiones y preparación

| Componente | Antes | Utilizado finalmente |
|---|---|---|
| Prisma CLI resuelto/instalado | 6.19.3 | **6.19.3**, fijado exacto |
| @prisma/client resuelto/instalado | 6.19.1 | **6.19.3**, fijado exacto |
| Cliente generado | 6.19.3 | **6.19.3**, regenerado |
| PostgreSQL local | 18.4 | **18.4**, dos bases principales y bases auxiliares nuevas |
| Node local | 22.23.1 | 22.23.1 |

Se alineó sólo `@prisma/client` al parche del CLI y se fijaron ambas dependencias a 6.19.3; no se migró a Prisma 7 ni se tocaron otros paquetes. El lockfile cambió únicamente las dos declaraciones raíz y el registro de @prisma/client. La instalación usó `--ignore-scripts`; generate se ejecutó con schema copiado a un directorio temporal, output en node_modules y variables saneadas. No se cargó el `.env` de la aplicación ni se conectó una base para generar.

La alineación cambia el runtime del Client y exige regenerar el cliente y repetir pruebas, lo que se hizo. Para reproducir el entorno futuro: `npm ci` del lock y generate controlado durante build; no descargar otro CLI con npx al arrancar. Se regeneraron los artefactos declarativos de Fase 2.1 mediante su runner: mismo SQL y estructuras, versiones de referencia ahora alineadas. Su informe histórico se conserva.

## 2. SQL de baseline generado y revisado

Archivos versionables:

- [0_init/migration.sql](../../prisma/migrations/0_init/migration.sql): SQL generado offline y marcado PROVISIONAL.
- [migration_lock.toml](../../prisma/migrations/migration_lock.toml): proveedor postgresql.
- [baseline-manifest.json](baseline-manifest.json): clasificación, hash SHA-256 del SQL, hash LF del schema y versiones.

Se inspeccionó el directorio Prisma antes de crear archivos: sólo existía schema.prisma; no se eliminó, reemplazó ni archivó ninguna migración previa. Los nuevos archivos se crearon sin sobrescribir rutas existentes. `.gitattributes` fuerza LF en migraciones para estabilizar checksums Windows/Linux. La carpeta no está ignorada; no hubo commits.

El procedimiento sigue el concepto de [baselining oficial de Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/baselining). La ayuda del CLI 6.19.3 usa `--to-schema-datamodel`. Se generó desde empty hacia una copia del schema declarado. El SQL contiene creación de 17 tablas, sus 155 columnas, 17 PK, 31 índices adicionales (5 únicos y 26 ordinarios) y 18 FK. Todas conservan **ON DELETE CASCADE / ON UPDATE CASCADE**, sin añadir las restricciones recomendadas en Fase 2.1.

Se revisaron las definiciones de User; CardioSession/Segment; Routine/Block/Day/Exercise; WorkoutLog/SetLog; PersonalRecord, RestLog, BodyLog, Goal; PushSubscription/PendingReminder/SuggestionLog; TrainingProfile. Tipos, nulabilidad, defaults, índices y acciones se compararon con el inventario completo de Fase 2.1 y el catálogo real de las bases de ensayo, no sólo sus conteos.

El runner regenera el diff offline cada vez, verifica equivalencia del DDL y el checksum del manifiesto y rechaza instrucciones DML/destructivas inesperadas. Conserva las particularidades existentes: CUID/updatedAt son del cliente, arrays SQL nullable, floats double precision, timestamps sin zona y campos userId opcionales heredados. No hay CHECK nuevos, unicidad de PR, restricciones de activa/día IA ni cambios de eliminación.

En la reconstrucción no aparecieron objetos adicionales a los declarados. Eso no demuestra que producción carezca de triggers, vistas, extensiones, políticas, ACL, secuencias o SQL no representable por Prisma. Esos objetos necesitan inventario/DDL real e incorporación revisada antes de aprobar una baseline representativa de una base existente. No modificar el SQL ya adoptado para cambiar su etiqueta: actualizar el estado documental de aprobación conservando su checksum.

## 3. Procedimiento reproducible y equivalencia A/B

Desde server: `npm run test:baseline`.

El runner no admite argumentos o URLs externas. Sanea variables PostgreSQL/URLs/Prisma, crea su propio clúster temporal con initdb, escucha en loopback y usa puerto dinámico. El fixture verifica raíz temporal, data_directory/postmaster.pid, puerto y nombres reservados antes de crear clientes. Nunca toma DATABASE_URL heredada como destino. Copia schema y migraciones al directorio temporal para que los comandos CLI no carguen el entorno de la aplicación.

| Base | Construcción | Datos e historial |
|---|---|---|
| A: legado sintético | SQL de reconstrucción declarado de Fase 2.1, en una base nueva | Todos los 17 modelos, con rutina manual/IA/archivo, ambos lados de series, cardio, credenciales y push sintéticos; inicialmente sin `_prisma_migrations` |
| B: reconstrucción | Base vacía y `prisma migrate deploy` real | Mismos datos sintéticos, IDs y valores; historial inicial creado por Migrate |

Los catálogos de negocio coincidieron sin diferencias: tablas, tipos, NULL/defaults/collation, FK/acciones/validación/diferibilidad, índices, constraints y objetos adicionales inspeccionados. La tabla interna de Migrate se identificó y separó explícitamente en la comparación; no se ocultaron tablas desconocidas. Las 17 entidades de A y B coincidieron campo por campo y por ID, incluidas todas sus FK.

## 4. Evidencias del baselining de A

1. Se capturaron todas las filas ordenadas por ID, conteos y el catálogo; se guardaron OID y relfilenode de cada tabla de negocio.
2. Se comprobó que no había historial y que el esquema de A coincidía con la baseline aplicada a B. Sólo entonces se ejecutó `migrate resolve --applied 0_init` en **A desechable**.
3. `_prisma_migrations` tuvo una entrada terminada de 0_init, checksum exacto del archivo, sin rollback ni log de error. Se comprobó lo mismo en B, sin exigir que UUID/timestamps internos de dos aplicaciones distintas sean iguales.
4. OID/relfilenode de las tablas de negocio de A permanecieron idénticos: no se recrearon tablas. Todas las filas, IDs, fechas y relaciones permanecieron idénticas.
5. `migrate status` terminó con éxito en A y B. Se ejecutó deploy dos veces adicionales en cada una: filas, estructuras físicas e historial permanecieron idénticos; no se reaplicó 0_init.

Los comandos de escritura sólo se ejecutaron en el clúster nuevo. No se usaron migrate dev, db push o db pull. Ninguna discrepancia inesperada se corrigió marcando migraciones a ciegas. Los casos que introducen drift, checksum incorrecto o fallo SQL son pruebas negativas explícitas sobre bases desechables.

## 5. Respaldos y recuperación

Se conservó el JSON portable por usuario, sin secretos ni historial interno. Se amplió el bundle PostgreSQL sanitizado para clasificar `_prisma_migrations` y verificar su restauración, manteniendo soporte de manifiestos anteriores. Se añadió un modo completo y sensible separado, sin exposición por HTTP o Cloudinary. La [guía de recuperación](RECOVERY-2.2.md) detalla formatos, condiciones y límites.

Pruebas concretas:

- Backup de A antes de registrar baseline y después de registrarla, en ambos formatos PostgreSQL.
- Restore de cada archivo a una base nueva; comparación estructural, de todas las entidades e IDs. En el modo completo se conservaron también hashes de autenticación, estado operativo, claves push y recordatorios, todos sintéticos.
- Con historial: comparación exacta de todas sus columnas/filas contra el origen. Status y deploy posterior correctos en la recuperación completa.
- Sin historial: permaneció ausente. Un restore no inventa una activación de baseline.
- Bundle sanitizado anterior sin migrationHistory: recuperado conservando datos deportivos; credenciales y push continuaron excluidos.
- Checksum corrupto o conjunto de migraciones de otro código: rechazo antes de crear tablas.
- Digest de historial incorrecto: rollback de esquema, cuenta, datos y metadatos en ambos formatos.
- Destino ocupado o Prisma/libpq apuntando a bases diferentes: rechazo sin modificar datos.
- Historial desconocido, fallido o con checksum incompatible: bloqueo; no se exportó como recuperación verificada ni se ocultaron sus logs.
- CLI completa ejecutada de extremo a extremo con el destino desechable explícito, ignorando una DATABASE_URL de señuelo local; stdout/stderr no expusieron conexión, credenciales ni el manifiesto sensible.

El modo completo requiere confirmación explícita de sensibilidad, crea directorio nuevo privado, solicita archivo 0600 y evita imprimir su manifiesto. No cifra el archivo automáticamente; ACL Windows, cifrado, procedencia, permisos, roles globales, archivos externos y retención deben gestionarse operativamente. El dump incluye los datos completos de la aplicación; no equivale a respaldar toda la infraestructura PostgreSQL. No se tocó un respaldo del usuario.

## 6. Despliegue preparado, sin activar

[server/deploy/README.md](../../deploy/README.md) propone build → preflight → job único de migración → validación → arranque → readiness → recuperación. Incluye pasos concretos de adopción en EasyPanel y las precauciones del rollback con la imagen antigua, cuyo CMD aún ejecuta db push.

Se prepararon y probaron releaseGate.js, start-checked.mjs y readiness-check.mjs. La alternativa de arranque verifica catálogo e historial sin DDL antes de cargar la aplicación y exige una URL de release explícita. Readiness comunica éxito/fallo sin imprimir conexión. **No están conectados al CMD actual ni al health HTTP productivo.**

En el ensayo se forzó una migración temporal posterior con división por cero: falló el CLI, quedó historial fallido detectable y no se llamó al arranque de aplicación. También se cambió un default después de una migración correcta: aunque deploy no encontró pendientes, el catálogo bloqueó el arranque. El servidor HTTP sintético de readiness respondió 200 con esquema válido y 503 con drift. Se verificó que el arranque alternativo rechaza una base legada sin historial y no escribe datos.

No está disponible Docker CLI: **no se construyó una imagen ni se probaron contenedores**. Se validaron los scripts con Node y PostgreSQL reales; la integración EasyPanel/red/roles/volúmenes y health del balanceador queda pendiente. No se usó ni modificó ningún panel o despliegue.

## 7. Pruebas, build y comprobaciones

| Suite | Aprobadas | Duración final reportada |
|---|---:|---:|
| Server unitarias | 104 | 500.4802 ms |
| Autorización/rutinas PostgreSQL | 48 | 6809.9346 ms |
| Backup cloud simulado | 17 | 718.9179 ms |
| Backup integración PostgreSQL | 41 | 24828.075 ms |
| Contrato importación | 22 | 194.7676 ms |
| Importación PostgreSQL | 39 | 4487.2359 ms |
| Entrenamientos PostgreSQL | 84 | 12784.0424 ms |
| Cliente, 11 archivos | 173 | 1.52 s |
| Caracterización histórica anterior a Fase 1.5 | 13 | 1787.4239 ms |
| Auditoría de esquema Fase 2.1 | 54 | 13046.9039 ms |
| **595 anteriores** | **595** | — |
| **Baseline, recuperación y release Fase 2.2** | **46** | **46017.7078 ms** |
| **Total** | **641** | — |

Todos terminaron con exit code 0; fallos/canceladas/omitidas: 0. No sumar los 13 casos históricos como regresiones de la aplicación actual. Las duraciones no incluyen todo el aprovisionamiento de clústeres. Los tests cloud usan dobles de prueba; no se accedió a Cloudinary real.

ESLint recomendado y sintaxis sobre los 11 JS/MJS nuevos o modificados: aprobados, sin errores/advertencias. Cliente build: exit 0, 2637 módulos, 9.45 s; conserva el warning previo del chunk PDF de 779.10 kB. Generate del Client: aprobado, sin conexión a DB. No hay script build de servidor; su código se comprobó con lint, sintaxis e integración. Revisión final de espacios/UTF-8 en 19 archivos y los cinco enlaces locales de los documentos nuevos: aprobada. Hash SQL contra manifiesto y atributos LF: aprobados; migration.sql y migration_lock.toml no están ignorados. Diff de schema.prisma, Dockerfile y lockfile del cliente: vacío. Todos los clústeres de ensayo fueron detenidos y eliminados por sus runners.

Durante el desarrollo se corrigieron expectativas/herramientas del ensayo: la búsqueda de instrucciones destructivas debía distinguir ON DELETE; inet::text incluye máscara y se cambió a host(inet_server_addr()); resolve deja log vacío en lugar de NULL. El resultado final no omite ninguno de esos escenarios y no necesitó cambiar el schema.

## 8. Archivos creados y modificados

Nuevos:

- `.gitattributes`.
- `server/prisma/migrations/0_init/migration.sql`, `server/prisma/migrations/migration_lock.toml`.
- `server/audit/postgresql/baseline-manifest.json`, `PHASE-2.2.md`, `RECOVERY-2.2.md`.
- `server/src/services/migrationHistory.js`, `postgresTarget.js`, `postgresSystemBackup.js`.
- `server/deploy/README.md`, `releaseGate.js`, `start-checked.mjs`, `readiness-check.mjs`.
- `server/test/run-baseline-integration.mjs`, `server/test/fixtures/baseline-environment.js`, `server/test/baseline.integration.test.js`.

Modificados:

- `server/package.json` y `server/package-lock.json`: fijar/alinear Prisma; nuevo test:baseline.
- `server/src/services/postgresBackup.js`: clasificar/verificar historial, comprobar destino explícito y sanear variables libpq heredadas; mantener formato sanitizado.
- `server/postgres-recovery.mjs`: comandos completos sensibles adicionales; conservar comandos y salida sanitizados.
- `.gitignore`: excluir dumps/servicios con secretos, sin ignorar SQL de migraciones.
- `server/audit/postgresql/declared-catalog.json`, `INVENTORY.md`: regeneración de metadatos/versiones con las mismas estructuras.
- `README.md`, `server/audit/postgresql/README.md`, `BASELINING.md`: enlaces/nota de seguimiento, manteniendo el plan e informe anteriores.

No se modificaron schema.prisma, Dockerfile, entrenamiento, frontend, autorización/offline ni servicios portable JSON. Los cambios preexistentes permanecen en el worktree; no se hicieron commits.

## 9. Limitaciones y riesgos pendientes

La baseline sólo representa Prisma y su reconstrucción sintética. No se conocen las restricciones realmente instaladas, metadatos históricos, versión/locale/collation, objetos SQL propios, permisos, volumen ni estado de producción. Los 18 CASCADE se conservan por alcance; la protección SQL del historial y nuevas unicidades siguen siendo tareas posteriores separadas.

Los controles de catálogo requieren revisar diferencias de versiones/permisos/RLS. Una comparación de PostgreSQL 18.4 no certifica otro motor. El restore completo exige base nueva dedicada, código de contrato compatible, archivo confiable y aprovisionamiento de roles/ACL. Procesa archivos/secciones en memoria: medir con volumen real. Un historial fallido necesita diagnóstico/backup forense operativo independiente, no resolve automático. Readiness y gates se ensayaron, pero todavía no protegen el arranque productivo actual.

## 10. Confirmación y pasos concretos pendientes

**No hubo conexiones a producción, credenciales/variables de DB heredadas como destino, backups automáticos de producción, datos históricos modificados, restauración sobre bases ocupadas, Cloudinary real, cambios del CMD Docker, commits o despliegues.** Las escrituras/migraciones se limitaron a bases nuevas creadas por los runners y luego eliminadas.

Para pasar de PROVISIONAL a VERIFICADA EN STAGING: obtener autorización y un respaldo íntegro concreto; restaurarlo en staging nuevo y aislado de proveedores/jobs; comprobar versión/locale, catálogo completo, historial previo, permisos y datos heredados; conciliar cada diferencia y SQL no representable por Prisma. Ensayar la baseline fiel en otra base vacía y el baselining sobre otra copia desechable, junto con recuperación del archivo real, regresiones y RPO/RTO.

Para APTA PARA ACTIVACIÓN: aprobar esas evidencias, SQL/checksums inmutables, imagen/código correspondientes, backup recuperable y plan de rollback; ensayar y aprobar el job separado, readiness y arranque sin db push también al revertir/escalar; verificar configuración real de EasyPanel. La activación posterior en cada base existente requiere autorización específica y comprobación inmediata de equivalencia antes de resolve, sin recrear sus tablas. **No se avanzó a otra fase ni se activó producción.**
