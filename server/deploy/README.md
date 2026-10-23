# Propuesta ejecutable de release — Fase 2.2

> Actualización Fase 2.3: el ensayo Docker, la readiness HTTP y la parada ordenada están en [INFRASTRUCTURE-2.3.md](INFRASTRUCTURE-2.3.md). Este documento conserva el resultado histórico de Fase 2.2. El Dockerfile raíz sigue sin cambiar; la baseline sigue PROVISIONAL.

**Preparación; no activada en Docker ni EasyPanel.** La baseline sigue siendo PROVISIONAL y no se autoriza usar estos pasos sobre producción. `Dockerfile` y `src/index.js` mantienen su arranque actual.

## Separación de responsabilidades

| Paso | Implementación propuesta | Condición de avance |
|---|---|---|
| Build | `npm ci` con lock, CLI/Client 6.19.3 y `prisma generate`; build del cliente | Imagen inmutable y pruebas aprobadas; sin conectar una DB de producción |
| Preflight | Comparación del catálogo real autorizado, respaldo verificable, revisión de historial/checksums | Sin drift sin explicar; copia y recuperación verificadas |
| Migración | Un job independiente ejecuta el CLI local `migrate deploy` | Exit code 0 y verificación posterior; nunca por réplica/reinicio |
| Arranque | `node deploy/start-checked.mjs` como **comando futuro alternativo** | Historial completo/checksums y catálogo compatibles antes de cargar index.js |
| Readiness | `node deploy/readiness-check.mjs` | Exit 0/`ready`; ante error devuelve exit 1 sin publicar conexión |
| Recuperación | Imagen compatible anterior o corrección hacia delante; restore ensayado en base nueva | Decisión operativa aprobada; sin reset ni sobrescribir automáticamente |

`releaseGate.js` proporciona `controlledRelease({ prisma, migrate, start })`: un resultado no cero del job impide ejecutar `start`. Si el job termina bien, compara catálogo e historial antes de iniciar. Los callbacks se probaron con comandos Prisma reales en bases desechables. El arranque alternativo también repite el control de lectura: evita depender sólo de que un job anterior haya terminado bien.

`assertSchemaReady` abre una transacción RepeatableRead de sólo lectura, comprueba `_prisma_migrations`, nombres/checksums/estado y compara las estructuras de negocio con el catálogo declarado. No consulta datos personales ni ejecuta DDL. No basta con que exista la tabla de migraciones o con que `$connect()` funcione. La referencia de catálogo depende de PostgreSQL 18.4 y debe conciliarse con el entorno real antes de adoptarla; diferencias entre versiones requieren revisión.

## Variables y comandos futuros

`start-checked.mjs` y `readiness-check.mjs` exigen **NEXLIFT_RELEASE_DATABASE_URL**, proporcionada explícitamente por el gestor de secretos. No infieren `DATABASE_URL` ni cargan `.env`. Sólo tras comprobar el esquema, el arranque alternativo pasa esa URL al proceso Node de la aplicación. La aplicación conservará su configuración normal cuando ese arranque se adopte en una tarea autorizada.

Comando del job futuro, con `DATABASE_URL` inyectada por el entorno del job, sin imprimirla:

```text
node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
```

No ejecutarlo ahora contra una base persistente. En una base existente sin historial, **deploy no sustituye el baselining**: primero hace falta demostrar equivalencia y aprobar `resolve --applied 0_init`. En una base nueva, deploy crea el esquema. Esta distinción se ensayó en A y B.

El job debe usar una imagen que incluya el CLI local, la carpeta completa `prisma/migrations`, `migration_lock.toml`, schema y artefactos de auditoría requeridos. Si se eliminan devDependencies del runtime, conservar el CLI en una imagen de migración separada con la misma versión. No depender de descargas de `npx` durante el arranque.

El rol del job necesita los permisos DDL apropiados. El rol de la aplicación debe tener sólo los permisos operativos necesarios, lectura de los metadatos de migración y acceso a catálogos; no DDL. La consulta de readiness incluye definición de objetos. Comprobar permisos/RLS y coste de esta comprobación antes de fijar frecuencia del healthcheck.

## EasyPanel: transición pendiente

1. Validar y aprobar la baseline con una copia íntegra autorizada, además de recuperación, versiones PostgreSQL y datos heredados. Definir ventana, responsables, reversión y RPO/RTO.
2. Construir una imagen por digest que incluya SQL revisado y los scripts. Excluir del contexto `.env`, dumps, archivos de servicio y respaldos; `.gitignore` no excluye archivos de Docker. El repositorio aún no incorpora una nueva configuración Docker activa.
3. Preparar una canalización o ejecución operativa que ejecute el job de migración **una vez** y bloquee la publicación si falla. Verificar las capacidades de la versión instalada de EasyPanel; un script guardado en el panel no garantiza ese orden por sí solo.
4. Después de aprobar y ensayar el cambio, reemplazar el CMD que contiene `db push` por el arranque alternativo. Configurar la URL explícita desde secretos y la readiness correspondiente. Esta fase no modifica ese CMD ni la configuración del panel.
5. Probar reinicio, escalado, cambio de tráfico y rollback. Ninguno debe volver a ejecutar `db push`. Si se revierte a una imagen antigua, aplicar un override que arranque únicamente Node con el gate compatible, y nunca su CMD original con DDL.

No se accedió a EasyPanel. No se cambió `/api/health`: sigue siendo el endpoint previo y no certifica por sí mismo la revisión de esquema. El ensayo usó un servidor HTTP sintético en loopback que entregó 200 con esquema correcto y 503 tras introducir drift. Integrar y medir la readiness real será parte de la adopción autorizada.

## Fallos y límites

Se forzó un fallo SQL real en una migración temporal posterior (`SELECT 1/0`). El CLI dejó una entrada fallida y la aplicación de ensayo **no arrancó**. Status y los controles propios la detectaron. No se ejecutó resolve para ocultarla. Los backups de recuperación verificada rechazan historiales fallidos, desconocidos, duplicados, con rollback o checksum incompatible; un volcado forense de un estado fallido exige un procedimiento independiente y explícito.

También se cambió un default sólo en una base desechable. Aunque deploy no encontró migraciones pendientes, el catálogo rechazó el arranque. Prisma documenta que deploy no detecta todo el drift; por eso el resultado del CLI no es el único gate.

No asumir que todo SQL de migración es atómico automáticamente. Usar transacciones donde proceda; operaciones como índices concurrentes necesitan procedimientos separados. Ante un fallo, conservar evidencias, determinar qué se aplicó y reparar de forma controlada antes de modificar el historial. La baseline inicial de esta fase no agrega ningún endurecimiento de Fase 2.1.

Docker CLI no está disponible en el entorno de trabajo: **no se construyó ni se ejecutó una imagen alternativa**. Se probaron los scripts Node, Prisma y PostgreSQL reales, el build de frontend y las comprobaciones estáticas. No se reclama validación de señales Docker, red, volúmenes, roles, readiness del balanceador ni rollback real de contenedores.

Referencias: [Prisma 6: despliegue](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production), [EasyPanel App Service](https://easypanel.io/docs/services/app).
