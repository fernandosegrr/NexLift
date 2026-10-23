# NexLift v4 — runbook de release

> Publicación posterior: el propietario autorizó commits, push a main y su posible
> autodespliegue. El Dockerfile raíz ya replica Dockerfile.release, sin DDL.
> No se autorizaron migraciones persistentes, acceso al panel ni restauraciones
> destructivas. Las precondiciones de esquema/configuración siguen siendo obligatorias.
> El resto del documento conserva los gates y procedimientos de preparación.

**Publicación de main y posible autodespliegue autorizados por el propietario.**
La ejecución manual de migraciones persistentes y los cambios al panel siguen fuera
del alcance autorizado. Los gates siguientes describen el procedimiento operativo
pendiente y no impiden el push solicitado.
Repositorio real: `C:/Users/guerr/OneDrive/Escritorio/NexLift`.

## 1. Verificar una revisión candidata aislada

Precondiciones: copia completa de una revisión conocida, sin `.env`, datos reales
ni credenciales; Node **24.22.1**, npm **11.19.1**. Para la matriz completa:
PostgreSQL 18.4 (`initdb`, `pg_ctl`, `psql`, `pg_dump`, `pg_restore`) y Edge en
Windows o Chromium en Linux. Nunca apuntar estas pruebas a una base existente.
En Windows anteponer el runtime local a PATH en esa terminal; no cambiar Node global.

```sh
git status --short
git rev-parse HEAD
node --version
npm --version
npm ci --no-audit --no-fund
npm run db:generate
npm run build
npm run check:typescript
npm run check:bundle
npm run test:release
npm run test:release:integration
npm run test:release:browser
npm run verify:release
npm run lint:release
npm test
git diff --check
```

`npm test` crea una copia nueva, instala desde locks y crea clústeres propios;
conserva logs y evidencia en `server/audit/release`. No sumar reruns al total.
La matriz contiene fixtures de esquema anterior que sólo existen dentro de esa
copia. El lint global conserva deuda: ejecutar `npm run lint` y comparar firmas
con Fase 9, sin tratar su salida no cero como un resultado verde.

Con Docker Linux autorizado, sin credenciales y desde esta copia:

```sh
docker version
docker build -f Dockerfile.release --target runtime -t nexlift:v4-candidate .
docker build -f Dockerfile.release --target migration-job -t nexlift:v4-migration .
NEXLIFT_DOCKER_REHEARSAL=true npm run test:release:docker
```

La última asignación usa sintaxis POSIX; en PowerShell usar
`$env:NEXLIFT_DOCKER_REHEARSAL='true'` antes del mismo comando npm.
El arnés crea nombres aleatorios, red interna sin puertos publicados, PostgreSQL
nuevo y dos transportes secuenciales. Comprueba runtime sin devDependencies,
health/readiness/SPA/SW, reinicio y SIGTERM; retira sólo sus propios contenedores.
No usa volúmenes o bases existentes. Capturar el digest final, arquitectura,
OpenSSL y escaneo de capas/secretos/SBOM antes de aprobar una imagen. PostgreSQL del arnés también está fijado por digest; verificar arquitectura y capas en el ensayo real.

## 2. Gates que actualmente cancelan un despliegue

- [ ] Revisión Git reproducible y completa; hoy existe trabajo recibido sin commit.
- [ ] Aprobación posterior explícita de destino, ventana, responsable y recuperación.
- [ ] Baseline contra copia autorizada de la base real; actualmente PROVISIONAL.
- [ ] Adopción de migraciones revisada: **la cadena recibida impide producción**.
- [ ] Backup integral del destino y restore aislado verificados con esa revisión.
- [ ] Portable validado; medios externos protegidos por otro procedimiento.
- [ ] Imagen Linux/CPU/OpenSSL/Prisma ejecutada y seguridad del parche revisada.
- [ ] EasyPanel/topología/CIDR/HTTPS/retirada de tráfico comprobados en ensayo.
- [ ] Compatibilidad de PWA instalada, pendientes y actualización SW ensayada.
- [ ] Revisión compatible Express retenida junto al digest de frontend y schema.
- [ ] RPO/RTO, mantenimiento, alertas y umbrales aceptados por el usuario.

No existe actualmente un comando autorizado para migrar una base productiva.
**No ejecutar `db push`, `migrate dev`, `resolve`, reset ni reemplazar guards.**
Las migraciones 3.1/6 exigen nombre, comentario, settings y dirección de un
destino desechable; no marcar una base real como desechable para eludirlos.

## 3. Preflight de sólo lectura y ensayo de migración

Sólo con destino explícito previamente aprobado para la operación correspondiente;
inyectar la URL por el gestor de secretos, nunca pegarla en logs o historial.
No hay fallback a DATABASE_URL ni lectura de `.env`.

```sh
npm run release:preflight -- legacy
npm run release:preflight -- current
```

Ambos necesitan `NEXLIFT_RELEASE_DATABASE_URL`. `legacy` inspecciona el catálogo
anterior y datos incompatibles; no autoriza adoption. `current` exige catálogo,
checksums, historial completo y journal idempotente actual. Cualquier error cancela.

En una base **nueva, local, marcada por el arnés**, el paso que sí modifica SQL es:

```sh
npm run release:migrate:disposable
npm run release:preflight -- current
```

El runner `npm run test:release:integration` prepara esa identidad automáticamente.
Para futura base existente: obtener snapshot autorizado, comparar catálogo e
historial, revisar colisiones/propietarios/nulabilidad/conteos, ensayar recovery y
definir un paquete de adopción aprobado con Prisma Migrate. Registrar una baseline
equivalente mediante `migrate resolve --applied` **modifica metadatos**: no es un
check de lectura ni está habilitado por esta fase. No reescribir SQL ya aplicado.
El comando futuro definitivo y los guards persistentes requieren esa revisión;
no se inventa hoy una secuencia productiva que funcionaría eludiendo seguridad.

## 4. Respaldo y recuperación en un destino vacío

Host operativo aislado con esta revisión, Prisma generado y herramientas PostgreSQL
compatibles. `NEXLIFT_RECOVERY_DATABASE_URL` identifica explícitamente origen o
destino; cambiarla por el gestor seguro antes de cada operación. El directorio
debe ser absoluto, nuevo para dump, privado y con espacio suficiente. Sintaxis POSIX:

```sh
node server/deploy/release-recovery.mjs system-dump /private/nexlift-trial --acknowledge-sensitive
node server/deploy/release-recovery.mjs system-restore /private/nexlift-trial --acknowledge-sensitive
```

**No ejecutar restore sobre el origen.** Exige base vacía; verifica SHA-256 del
archivo, schema/migraciones, hashes/conteos de entidades y journal dentro de una
transacción. El dump incluye credenciales, Push, PendingReminder y migraciones:
cifrarlo con el mecanismo aprobado fuera de banda; no subir a Cloudinary ni Git.
`system-dump` con salida 0 sigue indicando `restoreRequired:true`.
Después comprobar `release:preflight`, login de usuarios sintéticos, historial,
PR, escrituras/Atajos, replay sin duplicado y jobs con proveedor simulado en ensayo.
Las pruebas repetibles que realizan esta secuencia son `test:release:integration`
y `test:database:integration`; una copia real requiere un ensayo autorizado aparte.
Medir disco en el host PostgreSQL, además del disco local del operador.

Portable: API autenticada `/api/backup/*` y `server/restore-backup.mjs` tienen otro
contrato; revisar su dry-run antes de aplicar. JSON de usuario no reemplaza dump
integral: excluye credenciales, suscripciones/jobs y journal servidor; no incluye
archivos Cloudinary/Catbox ni Dexie/localStorage/borradores del dispositivo.

## 5. Activación futura (no ejecutar ahora)

Con gates firmados, configurar según [EasyPanel](RELEASE-V4-EASYPANEL.md).
Detener el proceso anterior antes de iniciar el siguiente: una réplica, estrategia
stop-first, sin solapar jobs. Migraciones fuera del arranque HTTP.
Con el paquete de adopción aún pendiente: **cancelar aquí**.
Después de migraciones aprobadas, exigir `release:preflight -- current`.

Comando HTTP real, en la imagen preparada:

```sh
node deploy/release-http.mjs
node deploy/http-healthcheck.mjs
```

Desde raíz de copia preparada también existe `npm run release:start`.
Seleccionar explícitamente `NEXLIFT_HTTP_TRANSPORT=express`. Un cambio futuro a
Fastify requiere además `NEXLIFT_FASTIFY_ACTIVATION=reviewed-v4`; el valor no es una
autorización humana. No cambia schema, protocolo ni flags offline. Para recuperar
Express usar **la misma imagen compatible**, cambiar transporte a express y
retirar la variable de activación; detener primero el proceso Fastify.

Antes de tráfico: comprobar `/api/health`, `/api/ready`, auth, lectura de historial,
SPA/SW y jobs. Escrituras sintéticas sólo en un destino de prueba aislado autorizado.
Cancelar ante 503 readiness, cambios de conteo inexplicables, duplicados, caída de
auth/PR, incompatibilidad de clientes, migración fallida o evidencia incompleta.
Vigilar 5xx, p95, reinicios, saturación PostgreSQL, jobs, duplicados y sync, sin
datos personales en logs. Propuesta de alarma: readiness 3 fallos/90 s, errores
5xx >1% durante 5 min; calibrar en ensayo antes de adoptarla.

## 6. Recuperación preservando nuevas escrituras

| Incidente | Acción |
| --- | --- |
| Fallo previo a migrar | Cancelar; conservar imagen/datos anteriores. |
| Migración parcial | Mantener tráfico cerrado; snapshot del fallo, revisar journal y transacción. No resolve/reintento ciego. |
| Backend/Fastify falla | Misma imagen compatible en Express, stop-first, preflight y readiness. |
| Frontend/SW antiguo | Conservar API compatible y assets hash de ambas revisiones durante ventana aprobada; no borrar Dexie/caché indiscriminadamente. Probar rollback de SW en ensayo. |
| Pendientes offline/conflictos | Mantener IDs/hashes/recibos y borradores; reintentar con protocolo probado. Exportar pendientes con herramienta existente antes de intervención manual. |
| Push falla | Deshabilitar proveedor de forma controlada; preservar PendingReminder, límites y dedup. Temporizador local sigue disponible. |
| PostgreSQL cae | Retirar tráfico; conservar WAL/volumen, recuperar servicio y verificar integridad. No inicializar encima. |
| Escrituras posteriores al release | Snapshot actual primero; preferir arreglo hacia adelante o Express compatible. Restore anterior pierde escrituras recientes: requiere reconciliación y aprobación expresa de pérdida, nunca se aplica por defecto. |

RPO/RTO propuestos, pendientes de aprobación: RPO ≤24 h con dump diario, RTO ≤60 min;
para objetivo RPO ≤5 min se necesita PITR/WAL ensayado, todavía no implementado.
Los milisegundos de restores sintéticos no son RTO operativo. No hay downgrade SQL
automático; un backend antiguo arbitrario no puede leer la expansión de historial.
