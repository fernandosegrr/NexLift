# Seguridad y operación compatible — Fase 9

El entrypoint sigue siendo Express. Fastify y la sincronización nueva siguen
limitados a ensayos. No se requiere una migración Prisma en esta fase.

## Sesiones

Los JWT existentes siguen siendo HS256, con 365 días y tokenVersion. No se
cambia bcrypt ni su coste. Las contraseñas nuevas admiten 8 caracteres como
mínimo y 72 bytes UTF-8 como máximo para impedir equivalencias por truncamiento
de bcrypt; login conserva la comparación de credenciales anteriores.
Cambiar contraseña, pregunta o recuperar una cuenta sigue revocando los tokens
anteriores. Un fallo PostgreSQL no equivale a credenciales inválidas.
Las escrituras de credenciales comparan el hash/versión que verificaron: una
modificación concurrente devuelve 409 y no revoca por segunda vez el token
ganador. Se preserva la comparación de contraseñas/respuestas legacy largas;
el límite efectivo de bcrypt se aplica a secretos nuevos, sin cambiar el hash.

El cliente vigente conserva Bearer en localStorage por compatibilidad con PWA,
offline y Atajos. Sigue expuesto ante XSS o extensiones con acceso al origen.
Logout elimina la sesión local y desuscribe el dispositivo con la credencial
capturada antes de borrarla; no revoca otros dispositivos automáticamente.
Cambiar ese comportamiento necesita una decisión explícita de producto.
Los borradores, conflictos y operaciones Dexie conservan su propietario y se
retienen al salir. Las respuestas tardías no se entregan al consumidor de otra
sesión. Los datos remotos Query sólo viven en RAM y se aíslan por cuenta.
También se protegen las llamadas con token explícito de perfil/contraseña/
pregunta. SESSION_CHANGED no se confunde con un fallo de red ni se encola.
Un cambio de token en otra pestaña invalida los logins/registros aún en vuelo.

Hay un puente **exclusivamente de desarrollo**, apagado por defecto:

- Express requiere `NEXLIFT_INFRA_REHEARSAL=true` y
  `NEXLIFT_WEB_SESSION_REHEARSAL=true`; Fastify ya exige su ensayo desechable.
- `NEXLIFT_WEB_ORIGIN` debe ser un origen HTTPS exacto. En producción el puente
  permanece desactivado aunque se inyecte la opción de ensayo.
- `POST /api/auth/web-session` requiere Bearer válido, Origin exacto y
  `X-NexLift-Web-Session: 1`. Emite una cookie opaca `__Host-`, HttpOnly, Secure,
  SameSite=Strict, sin Domain y Path=/; no devuelve el JWT. Expira como el token
  original y nunca lo renueva.
- `GET` permite recuperar el CSRF en memoria; las escrituras con cookie exigen
  Origin exacto y `X-NexLift-CSRF`. `DELETE` revoca inmediatamente esa sesión y
  borra la cookie. Bearer sigue disponible independientemente.
- El almacén está en RAM, con límites, barrido de expirados y consulta de
  tokenVersion en cada autenticación. Un reinicio requiere autenticar de nuevo.
  No se activa en el frontend ni se copian secretos a otro almacenamiento local.

Antes de adoptar cookies en producción faltan política de renovación/duración,
revocación por dispositivo durable, funcionamiento offline con identidad local
sin credencial de escritura, y un almacén compartido si hay varias réplicas.
No es una implementación productiva de refresh tokens.

La pregunta de seguridad legacy sigue disponible: eliminarla unilateralmente
bloquearía recuperaciones legítimas. Su consulta revela la pregunta configurada
y permite enumeración; no se presenta como un factor fuerte. La identidad vacía
ya no consulta una cuenta arbitraria; la verificación usa fallo genérico,
comparación ficticia para cuentas ausentes, límites por origen e identidad y
revocación posterior. Sustituirla requiere correo/factor verificado y un proveedor
real configurado; no se inventa ese proveedor en esta fase.

## HTTP, límites y privacidad

`NEXLIFT_TRUSTED_PROXY_CIDRS` admite direcciones/CIDR explícitos, separados por
comas. Vacío significa conexión directa; X-Forwarded-For no cambia la IP. Para
EasyPanel se deberá configurar la red exacta del proxy y restringir el acceso
directo al backend. No se confía automáticamente en todas las redes privadas ni
en un número de saltos. Ese gate no está certificado en esta máquina.

CORS conserva la lista de orígenes configurada, sin credenciales CORS. JSON está
limitado a 10 MiB y los transportes mantienen los contratos de parsing heredados.
Express y Fastify limitan recepción de solicitudes/cabeceras a 30 segundos.
Las respuestas API, incluso errores y probes, usan no-store y no reutilizan
ETags privados. Assets públicos conservan caché inmutable; HTML/SW se revalidan.

Login/registro/recuperación y operaciones costosas tienen límites explícitos;
los costosos se separan por cuenta y origen. Recuperación/login también agregan
identidades normalizadas para impedir rotar IP. Las variantes de mayúsculas o
parámetros no crean otra cuota de la misma ruta. No hay cuota global de series,
Atajos o sincronización. 429 conserva Retry-After. Los mapas son locales al
proceso y no se vacían al llenarse: **despliegue de una sola réplica o limitador
compartido previo en el proxy**. No se certifica protección distribuida de abuso.

CSP se envía Report-Only: script-src self, sin unsafe-inline/eval en scripts,
sin comodines globales, object-src none, base-uri/form-action self y
frame-ancestors none. style-src permite inline por los estilos dinámicos reales
de React/gráficas/PDF; imágenes permiten origen propio, data/blob y Cloudinary.
Puede ensayarse enforcement inyectando `cspEnforce: true` en la fábrica. HMR y
otros recursos de desarrollo pueden emitir avisos: no se impone enforcement
productivo sin verificar las rutas reales y las integraciones externas.

SW sólo guarda shell HTML y assets públicos explícitos, nunca API (incluidas
mayúsculas/escapes), Authorization ni URLs privadas desconocidas. La versión de
caché retira únicamente shells/assets estáticos antiguos. No borra IndexedDB.
Los destinos de clic push se normalizan al mismo origen y excluyen API y URLs
con credenciales. Se conserva el scope. React presenta texto de usuario/IA sin
dangerouslySetInnerHTML; las notificaciones usan texto, no HTML ejecutable.

## Push y recordatorios

Sólo se aceptan endpoints HTTPS de los proveedores conocidos de Chromium,
Firefox, Apple y Windows; direcciones internas, credenciales y otros hosts se
rechazan. La excepción synthetic.invalid existe sólo con nodeEnv=test. Se valida
la clave pública P-256 y el secreto de 16 bytes. Una suscripción ya perteneciente
a otra cuenta produce 409: nunca se reasigna por conocer su endpoint. Las
respuestas y logs no devuelven endpoints ni claves. Logout elimina sólo el
dispositivo de la cuenta capturada y no el de la siguiente sesión.

404/410 eliminan la suscripción exacta; 429/503 explícitos admiten un reintento
si Retry-After es de 0–2 segundos. No se reintentan inmediatamente errores de red
ambiguos. TTL 300 s, timeout por intento hasta 10 s y presupuesto total 24 s;
el adaptador real transmite esas opciones. El resultado cuenta aceptación del
proveedor, nunca entrega o lectura. Una gran cantidad de dispositivos/fallos
puede agotar ese presupuesto: no existe un recibo durable por dispositivo.

PendingReminder mantiene su fila al programar. Un UPDATE condicional de la
generación exacta, la llamada simulada/real al proveedor y la retirada se realizan
bajo una transacción de hasta 30 s. Dos procesos no envían el mismo evento al
mismo tiempo. Cancelación/sustitución previas impiden consumir la fila vieja.
Una caída antes del envío revierte y permite restaurar. Al cerrar, se pausa el
envío mientras se drena HTTP; las peticiones ya aceptadas aún pueden persistir
su recordatorio. Después se detienen timers/jobs y se cierra Prisma.

Programar devuelve un recibo `{id, fireAt}` sólo después de persistir. Cada
reprogramación genera un ID de aviso nuevo en la misma fila lógica usuario/
ejercicio; no cambia UUID/hash/versiones de entrenamientos ni necesita migración.
`DELETE /api/workouts/rest-reminder` exige autenticación y ese recibo exacto.
Cancelar es idempotente, no afecta otra cuenta ni una generación reemplazada.
El botón de detener espera incluso un POST en vuelo antes de cancelar; un fallo
de red informa que sólo se detuvo el cronómetro local. Cerrar/desmontar la PWA
no cancela un aviso válido. Una aceptación previa del proveedor no es retractable.

Restauración conserva la ventana legacy de 5 minutos para avisos atrasados;
descarta los obsoletos. Creatina/reactivación bloquean y actualizan sus marcas
durables condicionalmente dentro de la transacción. Se vuelve a comprobar cuenta,
suscripción, preferencia y dosis antes del envío/reintento. Se conserva CDMX y
las etapas de negocio existentes; el descanso muestra texto genérico en bloqueo.

Un fallo después de que el proveedor acepte y antes del commit es ambiguo:
puede repetirse al restaurar. El tag estable y eventId lógico suprimen renotify
del mismo evento; un descanso/etapa realmente nuevo sí puede alertar al reemplazar
el anterior. Los mensajes legacy conservan su comportamiento. Esto no prueba
exactly-once ni entrega física. Las marcas de creatina
y reactivación representan intento aceptado, no lectura. Los errores conocidos
de proveedor no revierten un entrenamiento confirmado. Sin Redis/BullMQ nuevos.

## Diagnósticos

Los logs JSON admiten eventos/categorías/módulos fijos, request ID generado en el
servidor, status, duración y contadores. No incluyen rutas, queries, cuerpos,
usuarios, errores crudos ni secretos. Fallos push, expiraciones, reintentos y
restauración tienen eventos específicos. Health indica proceso disponible;
readiness verifica PostgreSQL/esquema con timeout y responde 503 al cerrar.
Los respaldos por usuario excluyen credenciales, respuestas secretas, push y
tokens; errores persistidos usan una categoría fija.

Referencia: [OWASP sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[Express y proxies](https://expressjs.com/en/guide/behind-proxies/),
[atributos de cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
