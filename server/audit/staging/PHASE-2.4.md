# NexLift V4.0 — Fase 2.4

**Infraestructura: PARCIAL.** Staging local creado y funcional; Docker/Linux y
operación remota de EasyPanel pendientes. **Baseline: PROVISIONAL.** No se comparó
con una copia real: el usuario confirmó expresamente que no hay un respaldo
íntegro ni réplica autorizada disponible. No se avanzó a Fase 3.

## 1. Infraestructura encontrada y creada

Existían PostgreSQL **18.4** en Windows, Node **24.22.0** descargado y verificado
en Fase 2.3, Prisma CLI/Client **6.19.3**, servicios v4 de backup y recuperación,
SQL de auditoría, baseline provisional, gate de catálogo y Dockerfile alternativo.
No existía staging persistente, Docker CLI o Podman. El Node global 22.23.1 no se
reemplazó; se seleccionó Node 24 solamente para los procesos de esta tarea.

Se creó automáticamente `%LOCALAPPDATA%/NexLift/staging-v4`, fuera de OneDrive y
del repositorio, con ACL privada, clúster nuevo, SCRAM, credenciales propias y
puertos dinámicos loopback. Se mantienen cinco clases de bases: control, seed,
referencia protegida, runtime de la aplicación y clones adicionales verificados.
No hay volumen o base compartida con producción. El rol HTTP tiene DML, sin DDL,
sin escritura de metadatos Prisma y sin acceso a la referencia. Se verificó esa
separación con operaciones reales que PostgreSQL rechazó.

La aplicación sirve API y frontend en **http://127.0.0.1:49704**. Liveness,
readiness, HTML y asset JS devuelven 200. Los procesos quedan disponibles para
pruebas; no se instaló arranque automático del host. `staging:stop` conserva datos
y backups; `staging:up` vuelve a iniciar la misma identidad. Se ejecutó ese ciclo.

Se prepararon además Compose, sus credenciales nuevas fuera de Git, Dockerfile
de staging y bootstrap con red interna y job separado. No se ejecutaron contenedores.

## 2. Archivos modificados

Modificados exclusivamente para esta fase, preservando los cambios previos:

- `.gitignore`: archivos privados y directorios de datos locales excluidos.
- `.dockerignore`: admite los dos módulos de contenedor y Dockerfile de staging;
  excluye también sufijos privados en todos los directorios admitidos.
- `server/package.json`: comandos de staging y verificación; sin dependencias nuevas.
- `README.md`: enlaces a este informe y al procedimiento.

Nuevos:

- `compose.staging.yaml`, `Dockerfile.staging`.
- `server/staging/environment.mjs`, `identity.mjs`, `egress.mjs`, `local.mjs`,
  `runtime.mjs`, `capture-source.mjs`, `restore-captured.mjs`, `container.mjs`,
  `prepare-compose.mjs`, `validate-local.mjs`, `history.sql`.
- `server/test/staging.test.js`, `staging.integration.test.js`,
  `run-staging-integration.mjs`, `check-staging.mjs`, `verify-staging.mjs`.
- `server/deploy/STAGING-2.4.md`.
- Esta carpeta: informe, README, evidencia local, regresión limpia, validación
  final, integración y lint preexistente.

No se modificaron `schema.prisma`, SQL de migraciones, manifest de baseline,
Dockerfile operativo, Dockerfile de ensayo 2.3, código de la aplicación,
algoritmos, backups v4, AuthContext, journal offline o datos históricos reales.
Los hashes de index.js y auth.js siguen coincidiendo con la evidencia de Fase 2.3.
No se realizaron commits, despliegues ni acciones sobre el panel.

## 3. Construcción y comprobaciones de identidad

`staging/local.mjs create` inicializa un PGDATA nuevo, genera las contraseñas,
crea roles y bases, aplica la baseline sólo al seed propio, carga dos usuarios
sintéticos y obtiene un dump completo. Restaura por separado referencia y runtime,
protege la referencia y concede DML al rol HTTP. Copia código/dependencias/build
a un snapshot privado y arranca Node desacoplado de la consola.

Antes de cada migración/restauración/escritura administrada se verifican ruta
real de PGDATA y archivo del proceso, puerto, dirección loopback,
system_identifier, usuario, propietario, nombre y comentario de la base. Los
destinos son registros generados, nunca DATABASE_URL heredada ni URLs de argumentos.
Una base existente desconocida se rechaza. Resolver baseline exige equivalencia
de catálogo; no acepta flags alternativos ni permite marcar migraciones fallidas
como aplicadas. La referencia rechaza escrituras por wrapper y por PG read-only.

No se cargó `.env` en staging ni se heredaron claves de proveedores, proxies o
preloads Node. OpenAI/Cloudinary/Web Push están desactivados. Se probó el bloqueo
de fetch, HTTP, HTTPS y sockets externos antes de que alcancen la red, incluido
el fallback de imágenes. No se efectuaron llamadas a esos servicios.

El operador local conserva credenciales administrativas en archivos privados;
los procesos locales comparten usuario OS. El rol SQL separado limita DML/DDL,
sin atribuirle aislamiento de cuentas Unix que no se configuró.

## 4. Origen de PostgreSQL y copia real

**Origen utilizado: exclusivamente datos sintéticos.** Se cubren los 17 modelos,
campos opcionales, unilateralidad, fechas, listas, hábitos, cardio, push y recordatorios.
La referencia contiene 38 filas de negocio: dos por modelo salvo seis rutinas,
más una fila de historial Prisma. La API opera sobre una restauración distinta.

Se inspeccionaron nombres y presencia de variables y archivos de backup, sin
imprimir valores. Había una URL remota en el `.env` local; no había una identidad
de servidor esperada ni prueba de permisos de lectura. No se utilizó. El usuario
respondió «no» a la disponibilidad de backup/réplica autorizada. No se buscaron
credenciales por otros medios ni se consultaron servicios de backup externos.

Se preparó una captura futura explícita: descriptor privado con autorización e
identidad independiente, verificación de rol de lectura, snapshot compartido con
pg_dump, límites de conexión/bloqueo/consulta/proceso, archivo original inmutable,
checksum y fingerprints privados. Su restauración sólo acepta clones propios
vacíos. El recorrido completo fue probado con una fuente **sintética** de lectura;
no se reclasificó como copia de producción.

Falta: un backup íntegro verificable de procedencia autorizada, o un descriptor
privado de fuente con identidad PG independiente y rol de lectura adecuado.
No hace falta ni se solicita pegar secretos en la conversación.

## 5. Confirmación de producción intacta

No hubo conexión a PostgreSQL de producción, dump remoto, DDL, DML, restauración,
migración, `db push`, `resolve` o `deploy` en producción. Los comandos modificadores
se ejecutaron exclusivamente sobre clústeres nuevos identificados y sus clones.
No se alteraron rutinas, sesiones, PR o credenciales de personas reales.

Los archivos sensibles están fuera de Git y del contexto Docker; las evidencias
versionables contienen versiones, hashes y recuentos sintéticos. El proceso de
pruebas elimina únicamente sus propios clústeres temporales tras detenerlos. El
staging persistente se conserva porque forma parte del resultado solicitado.

## 6. Comparación estructural

| Elemento de negocio | Referencia sintética restaurada | Baseline reconstruida | Diferencias |
| --- | ---: | ---: | ---: |
| Tablas | 17 | 17 | 0 |
| Columnas | 155 | 155 | 0 |
| Claves foráneas | 18 | 18 | 0 |
| Índices, incluidas PK y únicos | 48 | 48 | 0 |
| PK / índices únicos extra / índices ordinarios | 17 / 5 / 26 | 17 / 5 / 26 | 0 |

La comparación incluye tipos, defaults, NULL, acciones DELETE/UPDATE, restricciones,
definición/validez de índices y objetos adicionales; se excluye sólo la tabla
de control Prisma de la comparación de negocio. El historial tiene 0_init
completada, checksum coincidente y sin migraciones pendientes o fallidas. Client
6.19.3 consulta, escribe y ejecuta transacciones sobre el runtime y los clones.

Todas las FK actuales conservan CASCADE/CASCADE. No se incorporaron restricciones
futuras ni se modificaron relaciones para hacer pasar la comparación. Un clon
con columna renombrada o extra es rechazado; la referencia permanece intacta.

## 7. Resultado de baseline

**PROVISIONAL.** Equivalencia comprobada sólo contra el esquema sintético declarado
y su dump restaurado. No se declara VERIFICADA EN STAGING ni APTA PARA ACTIVACIÓN.

SQL inicial mantiene SHA-256:
`47c9542787e5cb64c36b2b8c079e05995ac5f98fe9c7b86b9b8c87747688ea2b`.
Una copia real puede contener drift, extensiones, versiones, collations, permisos
o historial diferentes. Conservarla sin modificar y conciliar en un segundo clon.

## 8. Auditoría histórica

Se ejecutaron las consultas previas de catálogo/conteos/huérfanos/diagnósticos más
13 comprobaciones de mediciones, hábitos, identidades por case, arrays y PR.
Todas son READ ONLY y devuelven agregados, sin nombres, correos, notas o IDs reales.

- 18 relaciones declaradas: **0 huérfanos** en cada una; sesiones/ejercicios/series
  y propiedad quedan vinculados. Los chequeos declarados también funcionan si
  faltara una FK instalada.
- **0** propietarios nulos, rutinas activas duplicadas, rutinas IA duplicadas,
  días IA duplicados, series duplicadas, propietarios cruzados o weekdays inválidos.
- **0** pesos no finitos/negativos, mediciones negativas o porcentajes fuera de
  0–100, arrays nulos/semana inválida, emails/usernames duplicados por case.
- **2 PR sintéticos sin historial con nombre coincidente**: los fixtures de backup
  generan nombres independientes. Son un hallazgo informativo del fixture; no se
  corrigieron ni se interpretaron como corrupción de datos reales.
- **2 filas con hábitos opcionales nulos**, permitidos por el esquema; se conservaron.

La referencia se verifica antes/después con todos los campos de los 17 modelos e
historial. No hay conclusiones extrapolables a usuarios reales. Las futuras FK
RESTRICT, unicidades de rutinas/PR/días y políticas de propiedad requieren la
auditoría real y adaptación de aplicación ya descritas en Fase 2.1.

## 9. Migraciones ensayadas

Se aplicó deploy desde cero, se registró 0_init mediante resolve en un legado
desechable equivalente, se repitió deploy y se conservaron IDs, filas, relaciones,
almacenamiento físico de tablas existentes e historial. Resolver sobre un esquema
incompatible queda bloqueado antes del CLI. HTTP no ejecuta DDL ni migraciones.

Una migración de ensayo con DDL intermedio y división por cero conserva la fila
fallida, revierte su transacción SQL, falla de nuevo al repetir deploy y bloquea
readiness y arranque real. No se usó resolve para ocultarla. La recuperación crea
otro clon desde backup y recupera exactamente `_prisma_migrations`.

Se ensayó expandir/copiar/verificar sin quitar columnas originales. El Client
anterior todavía lee los datos, pero el gate estricto bloquea esa expansión hasta
actualizar el catálogo de la candidata mediante revisión explícita. No se debilitó
el control para aceptar cambios nuevos silenciosamente.

## 10. Backup, recuperación y rollback

Se verificaron backup v4 portable con dry-run HTTP y recuperación íntegra sensible
con pg_dump/pg_restore 18: credenciales sintéticas, estado operativo, los 17 modelos,
relaciones, IDs e historial de migraciones. La restauración rechaza destinos con
datos, referencia protegida y archivos alterados. Originales sin cambios.

Se interrumpió psql tras cargar el SQL real de un dump dentro de BEGIN y antes
de COMMIT; no quedaron tablas visibles/persistidas y se restauró después con éxito
en esa misma base vacía. También se recuperó desde una migración fallida y desde
un esquema incompatible usando clones nuevos, conservando la referencia.

El reinicio de Node y PostgreSQL conserva todos los commits. El bootstrap previo
compatible de Fase 2.3 arranca con el esquema recuperado y mantiene datos/historial.
Esto valida reversión del bootstrap con las mismas fuentes de aplicación. No
había una imagen histórica disponible: no se afirma rollback entre imágenes o
versiones antiguas publicadas. Volver al código no revierte SQL; el CMD antiguo
con db push nunca se utilizó como mecanismo de rollback.

## 11. Docker/Linux

**No verificados: Docker/Podman CLI ausentes.** No se construyó ni ejecutó imagen,
Prisma Linux, red, init SQL, volumen, usuario no root efectivo, secretos de
contenedor, proxy o entrega POSIX de señales. No se instaló Docker ni se cambiaron
servicios del equipo para simular esa disponibilidad.

Compose y Dockerfile nuevos reutilizan las etapas previas, con red interna,
volúmenes exclusivos, HTTP loopback, roles y secretos diferentes, identidad PG,
dependencia de job exitoso y filesystem HTTP de lectura. Se creó el material
privado de Compose y se comprobó estáticamente YAML/contexto/estructura. Esa
comprobación no equivale a `docker compose config`, build o ejecución Linux.

## 12. Pruebas exactas

**730 pruebas únicas aprobadas = 695 anteriores + 35 nuevas**, sin fallos,
cancelaciones ni omisiones en las ejecuciones finales. La instalación limpia
de ambos proyectos, Prisma generate, suites y build se realizaron en copia
temporal privada sin `.env` ni credenciales heredadas. Node **24.22.0**, OpenSSL
**3.5.8**, Prisma CLI/Client **6.19.3**, Windows x64 y PostgreSQL **18.4**.

| Suite | Aprobadas |
| --- | ---: |
| Lógica servidor/IA | 104 |
| Rutinas: integración | 48 |
| Backup proveedor simulado / PostgreSQL | 17 / 41 |
| Importación: contrato / PostgreSQL | 22 / 39 |
| Entrenamientos / fixtures históricos anteriores | 84 / 13 |
| Auditoría PostgreSQL / baseline | 54 / 46 |
| Infraestructura 2.3: unitarias / PostgreSQL-HTTP | 37 / 14 |
| Frontend, incluidas operaciones offline | 176 |
| Staging 2.4: unitarias / PostgreSQL-HTTP | 12 / 23 |
| **Total único** | **730** |

La regresión limpia está en [phase24-evidence.json](phase24-evidence.json).
Tras fortalecer comprobaciones de resolve, parada, exclusión de secretos e
interrupción de dump, se repitieron las **35 nuevas y 37 de infraestructura**:
72 comprobaciones repetidas, registradas con hashes finales en
[final-validation.json](final-validation.json). No se suman de nuevo al total.
Las 48 de smoke tras podar devDependencies tampoco se cuentan por duplicado.
El validador de staging persistente ejecuta otra restauración real y no infla
el número de tests. Evidencias: [local-evidence.json](local-evidence.json) y
[integration-evidence.json](integration-evidence.json).

Build estándar aprobado. Lint estricto, sintaxis y UTF-8 de los **15 archivos
JS/MJS nuevos** aprobados; verificaciones previas de infraestructura aprobadas.
Lint global del cliente conserva **27 errores y 3 advertencias preexistentes**,
sin cambios de cliente en esta fase; detalle en [client-lint.json](client-lint.json).
El build mantiene el aviso previo del chunk PDF de **779.10 kB** (>600 kB).
No se declara lint global limpio. Las pruebas de iOS cubren el contrato HTTP y
la lógica; no se ejecutó un dispositivo iOS o navegador real.

## 13. Limitaciones restantes

Faltan copia real autorizada, comparación y diagnóstico históricos reales,
compatibilidad con versión/collation/extensiones reales, imagen Linux y Docker,
operación EasyPanel/proxy/tráfico, artefacto histórico de rollback, permisos en
el host remoto, RPO/RTO con volumen real y recuperación completa de roles/medios.
No se ha hecho ninguna de esas verificaciones pasar mediante datos sintéticos.

El Dockerfile operativo conserva Node 20 y db push con error ignorado por la
restricción de no sustituirlo antes de verificar la alternativa. El estado
PARCIAL corresponde a esas verificaciones externas pendientes; no a falta de
haber creado el staging local solicitado. La baseline no puede elevarse de estado.

## 14. Procedimiento EasyPanel

El [procedimiento operativo reproducible](../../deploy/STAGING-2.4.md) incluye
comandos de staging y Compose, backup/restauración y diez gates: origen verificado,
backup recuperable, auditoría y compatibilidad, ensayo en clones, imagen Linux,
secretos y roles, job separado, arranque sin tráfico/readiness, endpoints críticos,
habilitación de tráfico y recuperación. Se distinguen rollback de aplicación,
corrección SQL hacia delante y restauración en otra base nueva.

La estrategia para cambios futuros es expandir → copiar → verificar → cambiar
lectores → retirar. No se autoriza ni ejecuta despliegue real con esta entrega.
