# Herramientas de auditoría PostgreSQL — Fase 2.1

Seguimiento: [Fase 2.2](PHASE-2.2.md) agrega una baseline PROVISIONAL en `server/prisma/migrations`, [recuperación con metadatos](RECOVERY-2.2.md) y ensayos `npm run test:baseline`. No se activó ninguna base persistente. Las herramientas de lectura de esta carpeta mantienen su alcance de auditoría.

Estas herramientas preparan una transición futura. No inicializan Prisma Migrate, no cargan `.env` y no admiten `DATABASE_URL` como conexión de inspección. No se ejecutaron contra bases existentes.

## Repetir el ensayo aislado

Desde `server`:

```powershell
npm run test:schema:audit
```

Requiere los paquetes ya instalados y PostgreSQL local (`initdb`, `pg_ctl`, `createdb`, `psql`). En Windows usa `C:/Program Files/PostgreSQL/18/bin`; `NEXLIFT_TEST_PG_BIN` permite indicar otro directorio. Crea un clúster nuevo en un directorio temporal, escucha exclusivamente en loopback y construye dos bases vacías con SQL generado offline del esquema sin modificar. Ejecuta los ensayos y detiene y elimina exclusivamente su propio clúster, verificando primero su ruta absoluta. No acepta una URL externa. Borra del entorno heredado las opciones de libpq y las URLs de bases antes de ejecutar herramientas.

Los scripts previos de integración mantienen sus implementaciones y aislamientos originales.

Para regenerar los artefactos declarativos tras una revisión explícita de cambios en esquema/toolchain:

```powershell
node test/run-schema-audit.mjs --refresh-declared-artifacts
```

Este modo también usa exclusivamente bases nuevas. Actualiza cuatro archivos de esta carpeta: `declared-schema.sql`, `declared-catalog.json`, `declared-orphans.sql` e `INVENTORY.md`. La regeneración no convierte esos archivos en una baseline aprobada.

## Archivos y alcance

| Archivo | Contenido |
|---|---|
| `catalog.sql` | Tablas públicas, columnas, tipos, nulabilidad, defaults, collation, identidad, generación, FK y acciones, validación/diferibilidad, estado de triggers FK, índices y restricciones. Incluye hashes de vistas, funciones y triggers propios; presencia de RLS y políticas, extensiones adicionales. |
| `counts-and-orphans.sql` | Conteos por las 17 entidades, huérfanos respecto a las FK realmente instaladas, propietarios NULL y resumen agregado del historial de migraciones si existe. |
| `declared-orphans.sql` | Las 18 relaciones esperadas, incluso si una FK desapareció de PostgreSQL. Requiere las tablas y columnas actuales. |
| `diagnostics.sql` | Duplicados de PR, rutinas activas/IA, días IA, papelera, series; pertenencias incompatibles; sesiones múltiples informativas; propietarios heredados de entrenamientos y series; valores sospechosos y distribución histórica agregada. |
| `declared-schema.sql` | DDL de reconstrucción del esquema declarado. **Contiene CREATE TABLE: no ejecutarlo en una base existente.** No representa una inspección de producción. |
| `declared-catalog.json` | Referencia comparable obtenida de PostgreSQL desechable, con hash normalizado LF del esquema y versiones de paquetes. |
| `INVENTORY.md` | Las 155 columnas, 48 índices y 18 FK, agrupados por cada uno de los 17 modelos. |
| `inspect-authorized-copy.mjs` | Entrada futura de inspección de una copia explícitamente autorizada, sin conexión implícita. |
| `audit-tools.mjs` | Ejecución acotada de los cuatro SQL de lectura y comparación de catálogos. |
| `BASELINING.md` | Procedimiento para la fase siguiente, con condiciones de aprobación y recuperación. |
| `PHASE-2.1.md` | Hallazgos, decisiones propuestas, limitaciones, validación y entrega. |

Los cuatro scripts de inspección abren `REPEATABLE READ READ ONLY`, fijan límites de tiempo y no alteran datos ni objetos. `\gexec` ejecuta únicamente sentencias SELECT generadas desde catálogos con identificadores escapados. No hay funciones temporales, tablas temporales ni instrucciones DDL/DML en esos scripts.

## Uso futuro sobre una copia autorizada

**No es una instrucción para conectarse ahora.** Primero se debe autorizar y verificar una copia restaurada y aislada. Preparar fuera del repositorio un archivo de servicio libpq, con host/puerto/base/usuario explícitos de esa copia y credenciales protegidas. Usar un rol de lectura sin permisos de escritura. No introducir URLs ni contraseñas en argumentos, consola, historial de shell, Git o informes.

Ejemplo de invocación, solamente después de esa autorización:

```powershell
node audit/postgresql/inspect-authorized-copy.mjs --confirm-authorized-copy --service-file=C:/secure/staging-audit.pg_service.conf --service=nexlift_staging_copy
```

La marca confirma una decisión del operador; no verifica por sí sola que el servidor sea staging. Verificar DNS/red, servicio y destino mediante el inventario autorizado del entorno antes de invocar. El proceso elimina las variables libpq heredadas, impide prompts, no imprime errores de conexión originales y añade `default_transaction_read_only=on`. Los scripts reiteran READ ONLY dentro de cada transacción. No se ejecuta SQL proporcionado por argumentos.

La salida es JSON con metadatos, diferencias y conteos. No contiene filas de usuarios, IDs, correos, notas, contraseñas, endpoints ni claves push. Los defaults de columnas personales/sensibles conocidas se representan con una huella de expresión, sin revelar su contenido. Las definiciones de otros índices/restricciones son metadatos: tratar cualquier reporte de una copia real como información interna y guardarlo fuera de Git. Las huellas no reemplazan una copia segura del DDL real para revisar objetos personalizados.

Cada archivo obtiene su propio snapshot. Para comparar conteos entre archivos hay que inmovilizar escrituras de la copia. Se omiten diagnósticos dependientes del modelo si faltan columnas o cambian tipos/nulabilidad; el catálogo y los conteos de objetos disponibles siguen siendo útiles. Una inspección fallida no genera un informe exitoso. Comparar también versión mayor de PostgreSQL, encoding, locale y collation: diferencias textuales entre versiones necesitan revisión, no DDL automático.

Los huérfanos declarados y los instalados se comprueban por separado. Una FK ausente aparecerá en las diferencias y sus referencias aún se revisarán mediante `declared-orphans.sql` si las columnas son compatibles. Si hay RLS, permisos parciales o esquemas distintos de `public`, los conteos pueden ser parciales: completar la inspección con un rol autorizado para ver todo el ámbito, sin conceder permisos automáticamente.

El catálogo no es un `pg_dump`: no reproduce roles, ACL, tablespaces, particionado, secuencias personalizadas, todos los detalles de políticas ni objetos fuera de `public`. Una baseline real exige además un volcado de esquema completo y revisión de extensiones y permisos. No declarar ausencia de objetos sólo porque Prisma no los representa.
