# Configuración propuesta EasyPanel — no aplicada

> Publicación posterior: el propietario autorizó commits, push a main y su posible
> autodespliegue. El Dockerfile raíz ya replica Dockerfile.release, sin DDL.
> No se autorizaron migraciones persistentes, acceso al panel ni restauraciones
> destructivas. Las precondiciones de esquema/configuración siguen siendo obligatorias.
> El resto del documento conserva los gates y procedimientos de preparación.

Sin acceso al panel ni credenciales. [Referencia oficial de App Service](https://easypanel.io/docs/services/app).
La UI y el comportamiento real del proxy/orquestador deben verificarse en ensayo.

| Campo | Propuesta verificable |
| --- | --- |
| Builder | Dockerfile.release, contexto raíz, target runtime; el Dockerfile raíz es ahora idéntico al de release |
| Imagen | Digest de imagen ensayada, CPU del VPS explícita; Debian Bookworm/glibc/OpenSSL 3 y Prisma 6.19.3 |
| Node | 24.22.1, parche de seguridad; base OCI fijada por digest |
| Inicio | `node deploy/release-http.mjs`, WORKDIR /app/server; sin npm/npx/shell ni migraciones |
| Puerto/bind | 3001 / 0.0.0.0; puerto del dominio dirigido al mismo servicio |
| HTTPS | Dominio propio, certificado válido, redirección HTTPS; /sw.js en raíz y mismo origen API |
| Proxy | Configurar sólo CIDR reales del proxy; nunca true, número de saltos o 0.0.0.0/0 por comodidad |
| Réplicas | Una; stop-first sin solapamiento de procesos/jobs; rate limiting actual en memoria |
| Probes | /api/health liveness; /api/ready PostgreSQL+catálogo/checksums+journal; HEALTHCHECK 30s/8s/30s/3 |
| Retirada de tráfico | Verificar explícitamente en ensayo; Docker HEALTHCHECK por sí solo no demuestra retirada por EasyPanel |
| Parada | SIGTERM; plazo interno 10 s, gracia del orquestador ≥15 s; comprobar drenaje y cierre Prisma |
| Reinicio | unless-stopped/on-failure según panel; no repetir migraciones al reiniciar; alarma ante bucle |
| Recursos iniciales | Propuesta 1 CPU/512–1024 MiB RAM app; PostgreSQL 1 CPU/1 GiB y almacenamiento según datos; medir antes de aprobar |
| Persistencia app | Imagen inmutable, sin volumen para fuentes/dependencias; tmpfs /tmp si se usa filesystem read-only |
| PostgreSQL | Servicio privado con versión probada, volumen persistente propio, sin puerto público; no reutilizar el PGDATA de ensayo |
| Roles DB | Rol app sin CREATE/ALTER/DROP y permisos precisos sobre public y nexlift_operations; rol migrador separado, no credenciales de superusuario en HTTP |
| Logs | stdout/stderr JSON redactado; rotación/tamaño/retención del host, sin bodies, JWT, URLs con password ni manifiestos sensibles |
| Backups | Dump integral privado cifrado fuera del volumen del servidor + restore periódico; medios externos por separado |
| Migraciones | Job independiente; las actuales son provisionales y bloquean persistentes. No habilitar deploy scripts de DDL |
| Auto deploy | Desactivado hasta aprobación posterior; no publicar esta revisión ahora |

Variables obligatorias, **sin valores secretos**:

```dotenv
NODE_ENV=production
PORT=3001
NEXLIFT_BIND_HOST=0.0.0.0
NEXLIFT_RELEASE_MODE=release
NEXLIFT_HTTP_TRANSPORT=express
NEXLIFT_REPLICAS=1
NEXLIFT_RELEASE_DATABASE_URL=
JWT_SECRET=
NEXLIFT_OFFLINE_SYNC_ENABLED=false
NEXLIFT_CONFLICT_RESOLUTION_ENABLED=false
NEXLIFT_WEB_SESSION_REHEARSAL=false
NEXLIFT_BACKUP_PRUNE_ENABLED=false
```

JWT aleatorio ≥32 caracteres, sin valor de desarrollo. URL explícita e inyectada
sólo en runtime. No depender de DATABASE_URL/.env; no declarar secretos como build
args, VITE_* o capas de imagen. CORS_ORIGIN puede quedar ausente para mismo origen;
si existe, lista de orígenes HTTPS exactos. NEXLIFT_TRUSTED_PROXY_CIDRS vacío no
confía en forwarding; definirlo tras comprobar la topología real. Limitar acceso
directo al contenedor en el proxy/red. TLS PostgreSQL con verificación según host;
los permisos/red/CA deben probarse con el rol real en un ensayo aprobado.

Opcionales, nunca necesarias para registrar entrenamientos:

- Web Push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT; conservar el par
  durante una actualización, usar subject válido del operador. Ausencia → no-op;
  verificar claves y entrega con dispositivos aprobados antes de habilitarlo.
- Cloudinary: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET;
  backups raw authenticated y fotos tienen contratos diferentes. Mantener archivos
  externos y política de retención; poda sigue apagada. Fallback de fotos Catbox
  conserva sus límites heredados y no asegura SLA/recuperación.
- IA: OPENAI_API_KEY sólo si la función opcional se aprueba; ausencia usa matching
  determinista. No se inicia Coach.
- Fastify: únicamente futuro cambio explícito del transporte y
  NEXLIFT_FASTIFY_ACTIVATION=reviewed-v4 tras gates; nunca dos procesos por accidente.

Para ensayo, RELEASE_MODE=rehearsal exige URL localhost, nombre desechable y
NEXLIFT_DISPOSABLE_MARKER generado por el arnés. Proveedores externos bloqueados
en ese modo; no introducir credenciales reales. Actualización y recuperación:
[runbook ejecutable](RELEASE-V4-RUNBOOK.md). El runtime falla ante artefactos,
configuración o schema incompatibles, sin reparaciones automáticas.

Compatibilidad técnica documentada: [Prisma v6 requisitos Linux](https://docs.prisma.io/docs/orm/v6/reference/system-requirements)
y [Node 24.22.1 seguridad](https://nodejs.org/en/blog/release/v24.22.1).
La generación Prisma usa `native` dentro del builder de la misma CPU/distribución
del runner; nunca copiar el engine Windows al contenedor. No se cambia schema ni
binaryTargets recibidos. amd64 esperado: debian-openssl-3.0.x; arm64 requiere su
propio build y ensayo. Los repositorios apt no están congelados: locks + base OCI
fijada no prometen filesystem bit a bit; retener digest final y SBOM aprobados.
