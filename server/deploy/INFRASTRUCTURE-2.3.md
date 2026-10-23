# Infraestructura de ensayo — Fase 2.3

**No activada. Baseline PROVISIONAL. Sólo destinos desechables.** El Dockerfile
raíz y su CMD conservan el procedimiento anterior. Esta guía no autoriza aplicar
migraciones sobre bases existentes.

## Construcción pendiente

Desde el contexto raíz, las dos salidas de `Dockerfile.rehearsal` son:

```sh
docker build -f Dockerfile.rehearsal --target runtime -t nexlift:rehearsal-http .
docker build -f Dockerfile.rehearsal --target migration-job -t nexlift:rehearsal-migration .
```

No se ejecutaron: Docker CLI no está disponible. La base es Node **24.22.0**,
Debian Bookworm slim, fijada por digest del manifiesto OCI. Runtime y job comparten
base, OpenSSL, schema, SQL y Prisma **6.19.3**. `npm ci` usa los lockfiles. El build
del frontend queda fuera del runtime. Éste elimina devDependencies y no incluye
Prisma CLI; el job conserva su CLI local. No usa `npx`, secretos de build ni
instalaciones de paquetes al arrancar.

El contexto admite entradas explícitas y excluye `.env*`, Git, dependencias
locales, pruebas, dumps, respaldos y claves. Incluye el código que implementa
respaldos y los SQL versionados. La prueba estática usa `ignore`, ya instalado por
ESLint; todavía se debe comprobar el contexto efectivo con Docker. No equivale
a inspeccionar las capas de una imagen construida.

El runtime ejecuta `node` como usuario `node`, puerto **3001** por defecto, sin
shell ni npm como padre. Configurar el proxy al mismo `PORT`, no privilegiado.
El digest fija la base; apt instala `openssl` y `ca-certificates` desde el
repositorio Debian vigente. Esto no promete filesystem idéntico bit a bit entre
builds. Guardar la imagen final por digest y revisar sus paquetes al liberarla.

## Configuración y secuencia de ensayo

HTTP exige variables inyectadas **en ejecución**:

- `NEXLIFT_INFRA_REHEARSAL=true`: opt-in explícito, no autorización de producción.
- `NEXLIFT_RELEASE_DATABASE_URL`: destino desechable explícito, sin fallback a `DATABASE_URL` o `.env`.
- `NODE_ENV=production`.
- `JWT_SECRET`: aleatorio, al menos 32 caracteres, distinto del valor de desarrollo.
- `PORT`: opcional, entero 1–65535; por defecto 3001.

El job sólo necesita opt-in y URL. IA, Cloudinary y Web Push conservan sus
variables opcionales. En ensayos sin proveedores, dejarlas ausentes. No activar
poda ni utilizar archivos reales. Las pruebas emplean datos sintéticos.

1. Validar configuración antes de importar el servidor o crear timers.
2. Ejecutar una vez el job independiente, `node deploy/rehearsal-migrate.mjs`,
   sobre una base nueva del ensayo. Si falla, detener la publicación.
3. Arrancar `node deploy/rehearsal-http.mjs`. Comprueba conexión, historial,
   checksums y catálogo antes de escuchar. No llama al job ni ejecuta DDL.
4. Readiness repite conexión y compatibilidad; detecta drift e historial fallido,
   desconocido o pendiente. Reiniciar HTTP no modifica el esquema.
5. Entregar tráfico sólo con readiness sana; usar los mismos artefactos en ambas imágenes.

El job copia schema/migraciones a un temporal propio para evitar el descubrimiento
de `.env`. No imprime la salida del CLI, potencialmente sensible. Su código de
salida y eventos estructurados indican éxito/fallo. El diagnóstico detallado
requiere herramientas autorizadas y no debe volcar credenciales en logs.

Una base existente sin historial se rechaza. `deploy` no hace su baselining.
La copia autorizada, equivalencia, recuperación y aprobación pendientes de Fase
2.2 siguen siendo requisitos. No hay bypass ni `resolve` automático.

## Probes y parada

`GET /api/health` conserva `{status,timestamp}`; no consulta datos de usuarios.
Indica vida del HTTP. `GET /api/ready` devuelve sólo `{status:"ready"}` con 200 o
`{status:"unavailable"}` con 503. En el inicio habitual comprueba PostgreSQL;
en el ensayo comprueba también catálogo e historial. Ningún probe enumera cuentas
o respaldos. `GET /api/backup/status`, autenticado, informa únicamente del estado
del respaldo propio, sin errores internos. No cambian los formatos, archivos,
retención, exportación o restauración existentes.

El healthcheck de imagen llama readiness con límite de seis segundos y sin
imprimir detalles. Intervalo 30 segundos, timeout Docker ocho, gracia inicial 30,
tres fallos. El gate de catálogo conserva los límites de Fase 2.2: su transacción
puede continuar hasta ese límite aunque el cliente del probe expire. Medir coste,
latencia y permisos en staging antes de fijar umbrales definitivos. Confirmar cómo
el orquestador retira tráfico; `HEALTHCHECK` por sí solo no acredita esa garantía.

SIGTERM/SIGINT marcan cierre, cancelan intervalos y timers locales, dejan intactos
recordatorios persistidos, cierran el listener, drenan requests, desconectan
Prisma y salen con cero. A diez segundos se fuerza salida con error. Configurar
una gracia de parada **de al menos 15 segundos**. Los trabajos de fondo ya
iniciados no adquieren un protocolo nuevo de checkpoint; ensayar su ventana
operativa antes de adoptar el contenedor.

JWT inválido/expirado/revocado devuelve 401; conexión/pool/timeout temporal,
503 + Retry-After; errores inesperados, esquema o credenciales de DB mal
configuradas, 500. Una cuenta ausente o inactiva conserva el 401 genérico anterior.
`tokenVersion` sigue revocando sesiones. El frontend conserva credenciales en
500/503; se prueban sus efectos de inicialización, borradores y journal, sin
reenviar escrituras bloqueadas.

Los nuevos logs usan eventos/categorías fijos e identificadores generados por el
servidor. No serializan Error, SQL, headers, JWT, payloads o variables. El manejador
final responde JSON genérico ante solicitudes mal formadas y fallos no manejados.
Los logs históricos de otras operaciones requieren revisión independiente antes
de habilitar registros verbosos; no se presenta esto como redacción universal.

## EasyPanel y reversión pendientes

No se accedió al panel. Compatible como preparación con
[App Service](https://easypanel.io/docs/services/app): contexto raíz, Dockerfile
alternativo/target explícitos o imagen final por digest, variables en runtime,
proxy a 3001 y parada con gracia suficiente. Confirmar en la versión instalada
jobs únicos, readiness, reinicios, límites y orden de despliegue. No poner el job
en cada reinicio ni ignorar su salida. Usar rol DDL para el job y rol de aplicación
con permisos mínimos, lectura del historial y catálogos; esos roles están pendientes
de validación.

Ensayar DB caída, drift, restart, stop, reinicio del host y reversión en staging.
Una imagen antigua conserva `db push`: una reversión futura debe impedir que su
CMD haga DDL. No existe rollback automático del esquema. Recuperación y
compatibilidad siguen [RECOVERY-2.2](../audit/postgresql/RECOVERY-2.2.md), cuyas
herramientas se conservan.

## Repetir pruebas

Con Node 24.22.0 y herramientas PostgreSQL instaladas:

```sh
cd server
node test/verify-node24.mjs
```

Crea copia temporal, excluye `.env` y node_modules, sanea variables, ejecuta dos
`npm ci`, genera Prisma y corre suites/builds. Cada integración crea y verifica
su cluster nuevo en loopback. Escribe un resumen sin secretos en
`server/audit/infrastructure/node24-evidence.json`. No acepta argumentos de DB.
En fallo conserva la copia sintética para diagnóstico; en éxito la elimina tras
verificar su ruta absoluta. No sustituye las pruebas reales de Docker/Linux.
