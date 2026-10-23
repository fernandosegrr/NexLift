# Preparación de baseline y despliegue — pendiente de Fase 2.2

**Seguimiento de 2026-10-18:** la [Fase 2.2](PHASE-2.2.md) ejecutó el ensayo autorizado únicamente en bases desechables y creó una baseline PROVISIONAL. El guard de backups ya contempla el historial mediante clasificación explícita. El plan original de Fase 2.1 se conserva a continuación; la verificación de una copia real y la activación persistente siguen pendientes.

Estado de este documento: procedimiento propuesto; **ninguna activación ejecutada**. El ensayo de Fase 2.1 reconstruye exclusivamente el esquema declarado en dos bases nuevas. No hay copia de producción autorizada inspeccionada.

## 1. Condiciones de entrada

Obtener autorización nueva para restaurar una copia aislada y especificar su destino, versión PostgreSQL, almacenamiento, responsables, ventana y plan de recuperación. La autorización de Fase 2.1 no autoriza operar bases existentes. Desactivar en la copia los workers y salidas a IA, push y almacenamiento externo. No iniciar `src/index.js` para inspeccionar: registra temporizadores y trabajos.

Conservar los cambios anteriores. No resetear bases, mover o eliminar un historial encontrado, ni aceptar propuestas de pérdida de datos. Confirmar si existe `_prisma_migrations`; si existe, revisar su historial/checksums antes de diseñar una baseline nueva. `.gitignore` ya permite versionar migraciones, pero esta fase no crea `prisma/migrations`.

Fijar en una tarea posterior una versión idéntica y comprobada de Prisma CLI/Client y generar el cliente en el build; adoptar `npm ci` con lockfiles y una imagen identificable. Aquí se encontraron CLI/lock **6.19.3**, paquete Client/lock **6.19.1**, cliente generado **6.19.3**. No se actualizaron paquetes.

## 2. Respaldo y restauración inicial

Obtener un respaldo completo, consistente, cifrado y verificable mediante el procedimiento operativo autorizado; comprobar checksums, versión y lectura del archivo y restaurarlo **en una base nueva**, nunca encima de una existente. Probar el archivo concreto, no sólo el mecanismo. Registrar RPO/RTO y probar acceso a la copia sin publicar credenciales.

El respaldo por cuenta de Fase 1.3 y el bundle de `postgresBackup.js` son deliberadamente sanitizados: excluyen credenciales y datos push. **No equivalen a una copia operacional completa de producción**. Un bundle permite ensayar datos deportivos y recuperación con restablecimiento de credenciales, pero no verificar identidad/autenticación original, permisos ni todos los objetos operativos. Gestionar por separado los respaldos operacionales y sus secretos, sin volcarlos en consola ni Git. PostgreSQL requiere atender roles, extensiones, locale/encoding, ownership y ACL además de los datos.

Hay un bloqueo técnico previo a activar Migrate: `createPostgresRecoveryBundle` exige exactamente las 17 tablas clasificadas por DMMF y sus columnas. Al añadirse `_prisma_migrations`, rechazará el esquema. En Fase 2.2 se debe adaptar **explícitamente** esa clasificación y la política de exportación/restauración de metadatos, manteniendo los controles contra secretos y tablas desconocidas. Añadir pruebas reales con historial de migraciones y repetir recuperación antes de aprobar la activación. No ampliar el allowlist indiscriminadamente.

## 3. Inventario real y conciliación

Ejecutar el wrapper de lectura sólo con servicio de la copia verificado y aprobación explícita. Conservar fuera de Git el reporte agregado, un volcado completo de esquema y los metadatos operativos. Revisar huérfanos, NULL heredados, duplicados, FK sin validar o triggers deshabilitados, índices inválidos y objetos no representados por Prisma. Asegurar que permisos/RLS no oculten filas.

Comparar la copia con `declared-catalog.json`, `INVENTORY.md` y un esquema Prisma introspectado en un archivo de trabajo **nuevo**, nunca sobrescribiendo `server/prisma/schema.prisma`. Investigar cada diferencia. `migrate diff` es diagnóstico, no garantiza detectar triggers, vistas, políticas o toda característica SQL no soportada. No encadenar su salida a una ejecución SQL.

Resolver diferencias sólo en tareas aprobadas y con SQL revisado y reversible cuando sea posible. Conservar evidencia antes/después, conteos, IDs y referencias históricas. No asignar automáticamente propietarios NULL al primer usuario ni eliminar duplicados con un criterio arbitrario.

La baseline debe representar **el estado existente conciliado**, incluidas sus cascadas actuales si todavía existen. Endurecer relaciones, añadir índices únicos o un protocolo idempotente serán migraciones posteriores separadas. Marcar una baseline que contiene cambios aún no instalados falsearía el historial.

## 4. Generar una baseline representativa

Las fuentes oficiales de [baselining de Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/baselining) describen una migración inicial y su marcado como aplicada. La ayuda del CLI local 6.19.3 confirmó el flag `--to-schema-datamodel`; no copiar ciegamente ejemplos de otra versión que usan `--to-schema`.

En Fase 2.2, una vez conciliado el esquema real y revisados los objetos SQL personalizados, preparar una carpeta nueva `prisma/migrations/0_init`, junto con `migration_lock.toml` (`provider = "postgresql"`). Comando de **generación futura offline**, sobre el archivo conciliado aislado:

```text
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema-datamodel <verified-staging-schema.prisma> --script --output <review/0_init/migration.sql>
```

Revisar el SQL completo, nombres, FK/actions/defaults e índices. Incorporar de manera explícita SQL no representable por Prisma. No usar directamente `declared-schema.sql`: es evidencia del modelo del repositorio y no de una base existente. No incluir datos ni secretos. Calcular checksums y mantener el archivo aprobado inmutable después de aplicarlo.

## 5. Ensayar reconstrucción y aplicación

En otra base nueva, ejecutar el futuro conjunto versionado mediante `migrate deploy`, después de autorizar ese ensayo de Fase 2.2. Verificar catálogo contra la copia conciliada, probar restricciones y workflows, cargar datos sintéticos y repetir las regresiones y recuperación PostgreSQL con `_prisma_migrations` presente. Confirmar qué objetos de roles/ACL requieren aprovisionamiento separado.

Ensayar además la transición en una segunda restauración de staging con datos y conteos comprobados. Debe reconstruir el mismo esquema sin hacer DDL de creación sobre las tablas existentes. Versionar en Git los archivos SQL y `migration_lock.toml` en la tarea autorizada; esta fase no hace commits.

## 6. Marcar el estado existente: sólo después de aprobación

Una vez aprobados el SQL, la equivalencia y los ensayos, el paso futuro para una base ya existente es:

```text
node node_modules/prisma/build/index.js migrate resolve --applied 0_init
```

Este comando **escribe** el historial de migraciones. No aplica el SQL inicial ni demuestra por sí solo que el esquema coincida. Primero se ensaya y autoriza en staging. Producción necesita autorización, respaldo verificado y gates independientes; no está autorizada en esta fase. Inyectar las credenciales mediante el gestor del entorno, sin URL en argumentos o logs.

Verificar luego historial, checksums y `migrate status`, más comparación real de catálogo. No ejecutar `migrate dev`, `migrate reset` o `db push` para arreglar conflictos en bases con datos. No utilizar `resolve --applied` ni `--rolled-back` para ocultar una ejecución parcial sin analizar y reparar su efecto real.

## 7. Sustituir el arranque y controlar la publicación

Preparar y probar en Fase 2.2 una imagen de aplicación cuyo comando sólo arranque Node. Conservar el Dockerfile actual en Fase 2.1, como se pidió. La migración se ejecutará como **job de release independiente**, una sola vez por publicación, con CLI local fijado, credencial DDL separada y resultado verificable. La aplicación usará un rol de ejecución sin DDL.

Orden propuesto: construir/generar cliente → probar → verificar respaldo/catálogo → aprobar release → job de migración → verificar esquema/historial → iniciar/cambiar tráfico a la nueva versión. Si el job falla, no publicar la aplicación nueva. `migrate deploy` no detecta todo el drift ni genera el cliente; los gates deben cubrir ambos aspectos. No hay migraciones en cada reinicio o réplica.

EasyPanel admite imagen Docker, scripts y override de comando; coordinar el job desde la canalización o ejecución operativa controlada. Un script guardado no demuestra por sí mismo que bloquee o preceda cada deployment. Verificar la versión instalada, permisos y configuración real antes de automatizar. No se accedió a ningún panel en esta fase.

El arranque debe comprobar de forma **sólo lectura** la revisión/capacidades del esquema requeridas antes de servir tráfico; readiness debe responder fallo si faltan. `$connect()` sólo prueba conectividad. El health actual puede responder `ok` aunque su consulta falle; no sirve para certificar compatibilidad. Aplicar expand/contract para permitir convivencia de versiones durante el cambio.

## 8. Recuperación y criterios de no avance

Mantener imagen anterior por digest y compatibilidad documentada. Si la migración falla, detener la publicación y determinar si revirtió realmente; Prisma no convierte automáticamente cualquier SQL PostgreSQL en una unidad transaccional. Usar `BEGIN/COMMIT` donde sea compatible, y separar operaciones como `CREATE INDEX CONCURRENTLY`, que no se ejecutan en una transacción normal. Si quedan efectos parciales o índices inválidos, revisar y reparar antes de tocar el historial.

Preferir corrección hacia delante compatible; no eliminar tablas ni restaurar automáticamente una copia encima de datos nuevos. Una recuperación completa se ensaya en otra base, con verificación y cambio de destino aprobado. Una reversión de código tampoco revierte el esquema.

El contenedor anterior aún incorpora `db push` en su CMD. **No reiniciarlo con ese CMD después de adoptar migraciones o endurecer restricciones**, porque podría volver a reconciliar el modelo viejo. Preparar también un comando de rollback que arranque sólo Node y verificar compatibilidad. Rotaciones, reinicios y escalado deben quedar libres de DDL automático.

No avanzar si falta copia autorizada, respaldo verificable, equivalencia de esquema, tratamiento de metadatos del backup, pruebas de recuperación, política de duplicados/NULL, comando de arranque seguro o control de readiness. Que la preparación esté completa no equivale a que esos requisitos de activación ya estén satisfechos.

Referencias: [Prisma 6, despliegues](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production), [características SQL no soportadas](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/unsupported-database-features), [EasyPanel App Service](https://easypanel.io/docs/services/app).
