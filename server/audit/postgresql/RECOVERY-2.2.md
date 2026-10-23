# Respaldos y recuperación con historial Prisma

La Fase 2.2 mantiene los mecanismos anteriores y distingue tres formatos. No se obtuvo ni restauró un respaldo real de producción. Todos los archivos de ensayo se crearon dentro del clúster temporal y se eliminaron al finalizar.

| Formato | Credenciales/push | `_prisma_migrations` | Finalidad |
|---|---|---|---|
| JSON portable por usuario, versión 4 | Excluidos | Excluido | Exportar/restaurar datos de una cuenta; conserva el contrato de Fase 1.3 |
| Bundle PostgreSQL sanitizado, versión 1 (`dump`/`restore`) | Excluidos; cuenta restaurada inactiva y requiere reset | Incluido si existe y es consistente | Recuperación de datos deportivos sin transportar autenticación |
| Bundle PostgreSQL completo (`system-dump`/`system-restore`) | **Incluidos**, con datos personales y estado operativo | Incluido y verificado | Recuperar los datos completos de la base de aplicación en una base nueva |

## Historial clasificado, sin ampliar permisos indiscriminadamente

Se conserva el control de las 17 tablas y 155 columnas de negocio. Se admite adicionalmente sólo la tabla `_prisma_migrations`, con sus ocho columnas conocidas. Las tablas/columnas desconocidas continúan rechazadas por el guard de recuperación; descubrirlas en una copia requiere clasificación y revisión, no ignorarlas.

El historial se contrasta con los archivos SQL locales: cada fila aplicada debe estar terminada, sin rollback, sin log de error, sin nombre duplicado y con checksum correcto. Prisma dejó `logs=''` al resolver la baseline y NULL al aplicar por deploy en los ensayos; ambos estados limpios se aceptan y se preservan exactamente. Los recibos fallidos, desconocidos o incompatibles detienen la recuperación verificada. No se limpian ni se marcan aplicados automáticamente.

El manifiesto agrega conteo/digest del historial y los nombres/checksums de archivos. No contiene los logs de migración. El archivo PostgreSQL sí conserva sus filas completas. Una tabla de historial vacía o migraciones pendientes se conserva como tal, sin convertirse en una activación exitosa: readiness exige que estén aplicadas todas las requeridas.

Los bundles sanitizados anteriores que no tenían `migrationHistory` siguen admitidos: se comprobó su restauración y ausencia de tabla de migraciones. El JSON portable no cambió de versión ni empezó a incluir metadatos internos.

## Bundle completo sensible

`postgresSystemBackup.js` usa `pg_dump` custom sin excluir datos: conserva User completo, hashes de autenticación, PushSubscription, PendingReminder, las demás entidades y el historial. Usa un snapshot exportado desde RepeatableRead para que el dump y las huellas correspondan al mismo estado.

Exige `acknowledgeSensitive=true` en la API interna y `--acknowledge-sensitive` en la CLI. Crea un directorio nuevo privado y solicita permisos 0600 para archivo y manifiesto. En Windows esos modos no sustituyen ACL: elegir un destino con permisos adecuados. El archivo **no se cifra automáticamente**; en uso operativo hace falta almacenamiento/transporte cifrado, control de acceso y política de retención. No enviarlo por el flujo portable ni subirlo a Cloudinary. `.gitignore` excluye dumps y archivos de servicio.

Una copia completa de una base no incluye roles globales del clúster, configuración del servidor, WAL/PITR ni archivos externos de fotos. `pg_dump` conserva las definiciones/grants del archivo; el restore portable aquí usa `--no-owner --no-acl`, por lo que roles/ownership/ACL requieren aprovisionamiento separado y revisión. No se afirma recuperación completa de toda la infraestructura. La clasificación de estructuras personalizadas y extensiones sigue pendiente en una copia real.

## Restauración y verificación

Se verifican SHA-256 del archivo, hash LF del schema declarado, conjunto exacto de archivos SQL y sus checksums. La versión de Client se registra como evidencia; la compatibilidad del contrato se comprueba con esquema/migraciones, no sólo con un número de paquete. Usar la versión de código correspondiente al respaldo, verificarla y después ensayar migraciones hacia delante. El manifiesto no identifica por sí mismo todo el código JavaScript o una imagen: registrar también su digest operativo.

El restore completo procesa los mismos bytes del archivo cuyo checksum se verificó, evitando volver a abrir otro contenido por ruta. Una sola transacción psql incluye esquema, datos, constraints y las comprobaciones de las 17 entidades y el historial antes del commit. El formato sanitizado mantiene su transacción previa y ahora comprueba también el historial. Un digest incorrecto revierte todas las tablas y datos, incluida `_prisma_migrations`; esto se forzó en ambos formatos.

No se restaura sobre una base ocupada. Se comprueba que el Prisma client y el destino libpq explícito correspondan a la misma base, usuario, dirección y puerto. URLs detrás de proxies/NAT que no coincidan con la identidad observada se rechazan: no se relajó ese control para adivinar destinos. El destino tiene que ser nuevo y dedicado; no iniciar escritores concurrentes durante la recuperación. No se usa `--clean`.

Los checksums detectan corrupción, no autentican al remitente. Los dumps ejecutan SQL al restaurarse: sólo aceptar archivos de procedencia confiable. El procesamiento actual conserva secciones SQL y datos en memoria; medir memoria y tiempos con una copia de volumen real antes de adoptarlo. No se ejecutaron ensayos de carga productiva.

## CLI: sólo preparar para uso autorizado futuro

La CLI no carga `.env` ni infiere `DATABASE_URL`. Requiere que el operador proporcione el destino mediante `NEXLIFT_RECOVERY_DATABASE_URL`, desde el gestor de secretos, sin mostrarlo en consola.

```text
node postgres-recovery.mjs dump <directorio-nuevo>
node postgres-recovery.mjs restore <directorio-existente>
node postgres-recovery.mjs system-dump <directorio-nuevo> --acknowledge-sensitive
node postgres-recovery.mjs system-restore <directorio-existente> --acknowledge-sensitive
```

No ejecutar esos comandos sobre destinos persistentes bajo la autorización de esta fase. En esta fase se llamaron sus funciones exclusivamente con URLs generadas por el runner desechable. Se mantuvo la salida de los comandos sanitizados; los comandos nuevos completos imprimen sólo un resumen y nunca el manifiesto sensible.

Se probaron backups antes y después de la baseline, restores en bases vacías, conservación exacta de IDs/valores/relaciones y filas del historial, status y deploy posterior. La verificación de un archivo sintético no certifica ningún archivo de producción.
