# Staging y procedimiento de release — Fase 2.4

**Infraestructura: PARCIAL (staging local funcional; Docker/Linux pendiente).**
**Baseline: PROVISIONAL.** El usuario confirmó que no dispone de un respaldo
íntegro ni réplica autorizada. Ningún resultado sintético equivale a contrastar
producción. Esta fase no activa migraciones ni despliega producción.

## Staging local creado automáticamente

Requiere Node **24.22.0**, Prisma CLI/Client **6.19.3**, PostgreSQL **18.4** y un
frontend construido. Se reutilizan los servicios de backup v4, gate de catálogo,
migración y arranque de 2.2/2.3. No hay dependencias nuevas ni cambios de esquema.

El directorio predeterminado es `%LOCALAPPDATA%/NexLift/staging-v4` en Windows y
`~/.local/share/NexLift/staging-v4` en Unix. Puede seleccionarse otro directorio
absoluto privado mediante `NEXLIFT_STAGE_HOME`; nunca una URL. Debe estar fuera
del repositorio. Una carpeta existente desconocida se rechaza: no se borra ni
recrea. Los comandos `create` posteriores reutilizan únicamente la identidad ya
registrada. No automatizan la reparación de una inicialización incompleta.

En Windows se elimina la herencia de ACL de la carpeta nueva y se concede acceso
al usuario actual y SYSTEM. En Unix se usan directorios 0700 y secretos 0600.
No colocar el staging en OneDrive ni en una carpeta publicada o sincronizada.

Desde `server/`, con Node 24 seleccionado:

```text
npm run staging:create
npm run staging:status
npm run staging:inspect
npm run staging:backup
node staging/validate-local.mjs
npm run staging:stop
npm run staging:up
```

La creación inicial requiere `client/dist`; construir previamente con `npm ci`
y `npm run build` en `client`. En esta sesión se construyó y se ejecutó todo el
flujo. El status imprime sólo URL loopback, códigos de probes y origen sintético.
El informe público registra el puerto asignado; no hay puerto de PostgreSQL
publicado fuera de loopback. API y frontend comparten origen y proceso HTTP.

El clúster es nuevo, independiente, con `scram-sha-256`, dos puertos dinámicos y
credenciales aleatorias. No toma DATABASE_URL, `.env`, PG*, proxies, NODE_OPTIONS,
tokens o claves de proveedores del entorno. El rol HTTP dispone de DML y lectura
del historial; no puede alterar tablas, escribir `_prisma_migrations` ni conectar
a la referencia. El rol administrador pertenece exclusivamente a este clúster.
Los archivos privados del operador conservan ambas credenciales; en local los
procesos comparten el usuario del sistema operativo. Esto no simula aislamiento
entre cuentas Unix independientes.

Las bases tienen nombres generados con identificador de staging y comentarios
de identidad. Antes de escribir/restaurar/migrar se verifican el archivo del
proceso, ruta real de PGDATA, puerto, dirección loopback, system_identifier,
usuario, propietario, nombre y marcador de la base. No existe entrada de URL
arbitraria. Una referencia rechaza escritura por el wrapper y por el valor
predeterminado `default_transaction_read_only=on`. El administrador del clúster
conserva capacidad administrativa; no se presenta como almacenamiento WORM.

- `seed`: datos sintéticos de los 17 modelos; origen del primer dump completo.
- `reference`: restauración independiente, protegida, sin tráfico HTTP.
- `runtime`: otra restauración para la API y sus pruebas.
- `verified_*`: clones adicionales de verificación; se conservan en staging.
- `control`: conexión de administración para verificar identidad y crear clones.

La aplicación arranca desde un snapshot privado de código, dependencias y build
del frontend. Las claves OpenAI, Cloudinary y Web Push están vacías. Un guard
independiente bloquea fetch, HTTP, HTTPS, TLS y sockets hacia destinos externos,
incluido el fallback de imágenes. Prisma usa únicamente la URL generada local.
Este guard no es un firewall contra código hostil que lance binarios nuevos;
Compose añade una red interna como límite de infraestructura.

El control de parada usa un pipe/socket local con nonce aleatorio, no una ruta
HTTP pública ni una búsqueda de procesos por nombre. Emite el evento SIGTERM,
drena HTTP y desconecta Prisma antes de detener exclusivamente el clúster
identificado. `stop` conserva bases, dump, snapshot y secretos; `up` los reutiliza.
El staging local no instala servicios de Windows ni arranque automático del host.

Los usuarios sintéticos son `a` y `b`. Su contraseña nueva compartida está sólo
en el archivo privado del operador (`syntheticPassword`); no aparece en informes,
Git ni salida de comandos. No se reutilizan contraseñas o JWT de producción.

## Backup, restauración y copia real

`staging:backup` genera un bundle completo nuevo usando el backup PostgreSQL
sensible de Fase 2.2: credenciales, campos operativos, push, datos, IDs y metadatos
de migración. No lo sube a Cloudinary. Cada respaldo tiene checksum y manifest
privado y nunca se sobrescribe. No contiene roles del clúster ni binarios de
medios externos; conservar esas dependencias por separado para un DR real.

`validate-local.mjs` hace un backup y lo restaura en un clon **nuevo**, compara
filas/checksums/historial durante la restauración, comprueba catálogo/readiness
y que el archivo original no cambió. Es la prueba operativa de recuperación;
no reemplaza `runtime` ni modifica `reference`. Las pruebas automatizadas además
interrumpen psql después de cargar SQL real del dump dentro de una transacción,
verifican rollback completo y repiten la recuperación. Los bundles JSON v4 siguen
siendo portables, con credenciales excluidas y dry-run probado por HTTP.

No existe copia real disponible. Una conexión remota encontrada en `.env` no es
una identidad independiente verificable ni prueba de rol de lectura; no se usó.
No se contactaron Cloudinary, OpenAI, proveedores push ni servidores remotos PG.

Para una futura fuente autorizada se preparó `staging/capture-source.mjs`. Acepta
un descriptor **privado fuera del repositorio**, con `kind` igual a
`AUTHORIZED_READ_ONLY_POSTGRES`, `authorized:true`, `connectionUrl` y
`expectedIdentity:{systemId,database,role,address,port}`. La identidad debe venir
del operador, no deducirse de una conexión exitosa. No pasar URLs en argumentos.
La herramienta rechaza roles con superusuario, creación de DB/roles, replicación,
DDL de esquema o escritura en tablas. Requiere SELECT de todas las tablas y
EXECUTE sobre `pg_control_system()` concedidos previamente por su administrador;
no concede permisos ni modifica el origen.

```text
node staging/capture-source.mjs RUTA_ABSOLUTA_DESCRIPTOR_PRIVADO DIRECTORIO_NUEVO_PRIVADO
```

Usa una transacción RepeatableRead READ ONLY, snapshot exportado compartido con
pg_dump, espera de conexión 3 s, lock timeout 2 s, statement timeout 30 s, límite
del proceso 90 s y transacción 120 s. Archiva toda la DB, verifica listado y
SHA-256 y mantiene fingerprints privados de las tablas públicas en el mismo
snapshot. Una captura grande puede necesitar otra ventana/límites revisados;
una lectura larga puede retener versiones MVCC. No elevar límites a ciegas.
No se inspeccionaron tablaspaces, extensiones o roles reales de producción.

`restore-captured.mjs` exporta la operación de restauración de esa captura: acepta
sólo una base vacía registrada en el clúster propio, usa pg_restore transaccional,
verifica todas las tablas públicas contra los fingerprints y conserva el original.
Una referencia se inicializa una sola vez con `initialize:true` y después debe
protegerse. Ante drift, conservar esa copia, omitir diagnósticos incompatibles y
usar otro clon para conciliar. Nunca llamar migrate resolve sobre la referencia.
El flujo captura/restauración se ejecutó con un lector sintético; no acredita una
fuente real. Dumps desconocidos requieren procedencia fiable antes de ejecutarlos.

## Docker Compose preparado, todavía sin ejecutar

Se conservó `Dockerfile.rehearsal`. `Dockerfile.staging` reutiliza sus dos salidas
y añade exclusivamente el bootstrap de Compose. `Dockerfile` operativo no cambió.

En un host con Docker y Node, crear una vez los secretos fuera de Git:

```text
node server/staging/prepare-compose.mjs
```

Configurar `NEXLIFT_STAGE_COMPOSE_SECRETS` con el directorio privado indicado.
La preparación falla si ya existe; no rota credenciales ni destruye volúmenes.
Construir desde la raíz, en este orden:

```text
docker build -f Dockerfile.rehearsal --target runtime -t nexlift:rehearsal-http .
docker build -f Dockerfile.rehearsal --target migration-job -t nexlift:rehearsal-migration .
docker compose -f compose.staging.yaml build
docker compose -f compose.staging.yaml up -d
docker compose -f compose.staging.yaml ps
docker compose -f compose.staging.yaml stop
```

Nunca usar `down -v` como rutina de reinicio. El proyecto y sus volúmenes son de
staging, sin volúmenes externos ni bind de PGDATA del host. La red `internal`
contiene DB/job/app; sólo HTTP se publica en `127.0.0.1:43001`. PostgreSQL no publica
puerto. Los secretos de job y app son distintos; HTTP no recibe contraseña DDL.
El job verifica marcador aleatorio y system_identifier persistido antes de
ejecutar migraciones; HTTP repite identidad y el gate de historial/catálogo.
Compose exige DB saludable y job con salida 0. Un reinicio de HTTP no migra.

Compose crea una DB vacía con baseline; no copia ni importa producción. La red,
volúmenes, init SQL, permisos, secretos, salud, imágenes y SIGTERM POSIX requieren
ensayo real en Docker. Sólo se analizaron YAML, archivos, contexto y módulos;
**no declarar Docker/Linux verificado**. El tag PostgreSQL no está fijado por
digest y los paquetes apt del ensayo previo no están fijados por snapshot. Fijar
artefactos probados por digest antes de una eventual liberación.

Para ensayar backups con Compose hacen falta pg_dump/pg_restore 18 y acceso
privado a la DB. La imagen de aplicación no contiene esas herramientas. Usar el
contenedor PG o un toolbox PG18 aislado y volver a verificar identidad; conservar
los dumps fuera de web y restaurarlos sólo en otra base vacía. Ese recorrido de
contenedores está pendiente; el equivalente PG18 local con backup v4 sí se ejecutó.

## EasyPanel: procedimiento listo para revisión, ejecución bloqueada por gates

1. Identificar versión PG, extensiones, roles, esquema y servidor autorizados sin
   imprimir secretos. Obtener backup íntegro en snapshot de lectura, verificar
   hash y restaurarlo en referencia nueva. Definir RPO/RTO y responsables.
2. Ejecutar auditorías de sólo lectura y comparar tablas, columnas, tipos, NULL,
   defaults, PK/únicos, FK/acciones, índices, extras e historial. Registrar drift
   y conteos. No modificar la copia fiel para hacer pasar la comparación.
3. Ensayar en clones una conciliación explícita. Para legado equivalente sin
   historial, comparar primero y probar resolve --applied 0_init. Para una DB
   nueva, deploy desde cero. No confundir ambos procedimientos ni ocultar fallos.
4. Construir y ejecutar la imagen de ensayo en Linux, probar Prisma nativo,
   OpenSSL, permisos no root, probes, señales, volúmenes y restauración. Registrar
   digest de las dos imágenes y un artefacto anterior realmente compatible.
5. Configurar secretos runtime y del job por separado. Bloquear salida de staging,
   mantener proveedores desactivados. Verificar identidad del destino del job.
6. Antes del release eventual, crear backup verificable y punto de recuperación.
   Ejecutar **un job separado** de migración; un error impide iniciar/promover HTTP.
   Comprobar el catálogo e historial después del job, incluso si salió con 0.
7. Arrancar una candidata sin tráfico público con el gate. Comprobar readiness,
   login, aislamiento, rutina/importación/edición, sesión/PR, backup y atajos. La
   liveness 200 por sí sola no autoriza tráfico. Verificar borradores y journal
   offline en clientes controlados; no reproducir operaciones bloqueadas a ciegas.
8. Habilitar tráfico sólo tras todos los gates y aprobación operativa. Probar las
   capacidades de orden/restart/health de la versión concreta de EasyPanel; Compose
   no demuestra cómo actuará el panel. No se ejecutó ninguna acción remota aquí.
9. Si falla la candidata y el esquema sigue compatible, volver al artefacto de
   aplicación anterior con comando directo Node y gate adecuado. **Nunca usar el
   CMD antiguo con db push**. Revertir imagen no revierte SQL.
10. Si cambió el esquema incompatible o hubo DDL parcial, detener promoción,
    conservar evidencia y elegir corrección hacia delante o recuperación del
    backup en una **base nueva** verificada. No resetear historia ni sobrescribir
    producción. Cambiar destino/tráfico sólo mediante un procedimiento aprobado.

Para cambios futuros: **expandir → copiar → verificar → cambiar lectores → retirar**.
La prueba de expansión conserva las columnas y datos originales, pero el gate
actual rechaza incluso columnas adicionales: requiere catálogo esperado y release
revisados expresamente. No desactivar el gate para aceptar drift. Las relaciones
CASCADE actuales siguen intactas; corregirlas corresponde a otra fase.

El rollback probado alterna el bootstrap de staging con el bootstrap compatible
de Fase 2.3 sobre datos recuperados y verifica su conservación. No había una imagen
histórica publicada disponible: no se reclama rollback real entre imágenes o
versiones históricas, proxy EasyPanel, ni recuperación de un VPS completo.

Fuentes operativas: [pg_dump 18](https://www.postgresql.org/docs/18/app-pgdump.html),
[secretos Compose](https://docs.docker.com/compose/how-tos/use-secrets/),
[orden de arranque](https://docs.docker.com/compose/how-tos/startup-order/),
[redes Compose](https://docs.docker.com/compose/how-tos/networking/) y
[App Service EasyPanel](https://easypanel.io/docs/services/app).
