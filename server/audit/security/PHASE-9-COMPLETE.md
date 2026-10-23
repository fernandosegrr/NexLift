# NexLift v4.0 — Fase 9: seguridad, sesiones y notificaciones

22/10/2026, America/Mexico_City. Repositorio real:
`C:/Users/guerr/OneDrive/Escritorio/NexLift`.

**Fase 9.1–9.4 completada en desarrollo. `npm test` aprobado: salida 0,
1,441 pruebas únicas (1,381 anteriores + 60 nuevas).** Producción intacta, sin commits ni
despliegue. Baseline PostgreSQL PROVISIONAL.

## Alcance y hallazgos

| Bloque | Resultado implementado |
| --- | --- |
| 9.1 | JWT/recuperación auditados; validación, antiabuso y errores de dependencia; puente HttpOnly/CSRF optativo sólo en desarrollo; sesiones antiguas y Atajos conservados. |
| 9.2 | Proxies por CIDR explícito, límites por ruta/cuenta/origen, no-store API, CSP Report-Only, destinos push y cachés SW restringidos, parches compatibles revisados. |
| 9.3 | Suscripciones aisladas, claves/endpoints validados, 404/410, aceptación real del simulador, reintento acotado, consumo transaccional y restauración entre procesos. |
| 9.4 | Logs JSON sin secretos, duración/ID/status, pausa durante cierre y persistencia de solicitudes aceptadas; nuevas pruebas y matriz aislada completa. |

[Reproducciones sobre el código recibido](reproduction-evidence.json), sólo con
memoria/proveedor/datos sintéticos:

| Hallazgo | Severidad / corrección verificada |
| --- | --- |
| Recuperación sin username consultaba OR con valores undefined y devolvía una pregunta arbitraria | Alta: 400 antes de SQL; tipos inválidos y contraseñas nuevas que exceden bcrypt se rechazan. |
| Conocer un endpoint push permitía sobrescribir su propietario | Alta: 409 sin modificar fila ajena, incluso con solicitudes concurrentes; respuesta sin capacidad/claves. |
| Dos runtimes podían enviar el mismo recordatorio persistido | Alta: fila/generación bloqueada transaccionalmente; dos procesos reales, reinicio y caída antes del proveedor comprobados. |
| trust proxy=1 permitía variar el origen con X-Forwarded-For directo | Alta: no se confía en forwarding salvo CIDR explícito; se verifican acceso directo y proxy permitido. |
| SW guardaba cualquier GET del origen y aceptaba destinos push externos | Defensa de privacidad, media: caché sólo pública y navegación HTML; mismo origen/URL segura en clics; variantes API mayúsculas/escapadas excluidas. No se afirma una filtración productiva observada. |
| JWT anual accesible a JavaScript; pregunta legacy revela existencia/pregunta | Riesgos residuales: transición controlada y políticas pendientes; no se declaran eliminados. |

## Sesiones, endpoints y frontend

HS256 y JWT de **365 días** conservados, incluidos legacy tokenVersion=0.
Firma/expiración/revocación y cuenta activa siguen verificadas. Bcrypt/coste no
cambian; nuevas contraseñas y respuestas tienen límite 72 bytes para impedir truncamiento.
Login, contraseña actual y respuesta de recuperación conservan credenciales
legacy largas dentro del body existente. Cambios de contraseña/pregunta y
recuperación usan CAS: una carrera produce un ganador y un 409, sin revocar
por segunda vez el token ganador.
Login y recuperación usan comparación ficticia para ausencia de cuenta y fallo
genérico; ausencia de PostgreSQL retorna 503/Retry-After, no 401.

El puente `/api/auth/web-session` añade POST/GET/DELETE desactivados por defecto
y bloqueados en producción. Cookie opaca __Host-, HttpOnly, Secure, Strict,
Path=/; escrituras requieren Origin exacto + CSRF. No renueva el JWT ni lo
devuelve. Logout revoca la cookie en RAM; tokenVersion también la invalida.
Reinicio requiere nueva autenticación. No hay refresh tokens en localStorage,
migración automática ni expulsión de dispositivos legítimos. La sesión Bearer
actual sigue guardada localmente; logout local no revoca todos los dispositivos.

[Inventario ejecutable](api-inventory.json) y [matriz de rutas](API-MATRIX.md):
**75 endpoints recibidos preservados + 3 de ensayo + cancelación compatible = 79**. Todos los guards
privados se prueban sin credenciales; las rutas con parámetros se atacan desde
otra cuenta y se comparan tablas. Las pruebas anteriores también recorren todas
las lecturas reales, mutaciones, Atajos, backups y operaciones idempotentes.
El dueño procede de identidad verificada, no de userId del cuerpo/query.

API rechaza respuestas tardías de otra sesión, también en cambio de contraseña/pregunta y fuera de Query; login
tardío no reemplaza una sesión posterior. Query conserva aislamiento/cancelación
y Dexie conserva borradores, colas, conflictos y recibos por cuenta. Push captura
la credencial de salida y no desuscribe un dispositivo de una cuenta posterior.
No se modifica el motor offline, UUID/hash/versiones, historial ni fórmulas.

HTTP: no-store en toda API y errores; sin ETags privados/304 reutilizables;
CORS sin credenciales permisivas; JSON 10 MiB; recepción HTTP 30 s; CSP gradual
sin inline/eval en scripts ni comodines globales. Inline en estilos está acotado
a React/gráficas. SW conserva scope, actualiza su caché estática y nunca borra
IndexedDB. No se encontró dangerouslySetInnerHTML en el cliente vigente.

## Push, tiempo y observabilidad

Endpoints HTTPS de proveedores conocidos, P-256 válida y secreto de 16 bytes;
synthetic.invalid permitido sólo en tests. Propietario inmutable por endpoint;
404/410 eliminan sólo la suscripción exacta. 429/503 explícitos tienen un
reintento limitado por Retry-After; fallos de red ambiguos no se reintentan de
inmediato. TTL/timeout llegan al adaptador real. `sentTo` cuenta aceptación del
proveedor y `attempted` dispositivos intentados; no se afirma entrega/lectura.

PendingReminder mantiene filas durables y la ventana legacy de cinco minutos.
UPDATE condicional, intento y retirada comparten transacción: cancelación,
sustitución, dos procesos y caída previa al envío no consumen indebidamente el
evento. La cancelación HTTP usa un recibo de generación, espera el POST pendiente
y confirma sólo esa cuenta/aviso; cerrar la PWA no cancela. Un fallo offline se
informa al usuario, sin fingir cancelación remota. Creatina/reactivación usan marcas durables condicionales y se comprueban
preferencia/dosis/cuenta antes de enviar/reintentar. CDMX conserva medianoche,
domingo, semana, mes y año. El cierre pausa entregas mientras drena HTTP, permite
persistir recordatorios de peticiones ya aceptadas y después detiene jobs/Prisma.

El descanso muestra texto genérico en pantalla bloqueada. No se solicita permiso
en render; se comprueban permiso denegado y ausencia de soporte. No se realizaron
llamadas a proveedores reales ni se certifica iOS/Safari físico.

Logs JSON admiten sólo eventos/categorías/módulos fijos, request ID propio,
status, duración y contadores. Push/expiración/reintento/restauración son
diagnosticables sin endpoints, JWT, cookies, respuestas secretas, cuerpos,
fotografías o errores crudos. Los errores de backup persistidos son categorías
fijas. Health/readiness y apagado mantienen sus pruebas de proceso/SQL.

## Pruebas y dependencias

Pruebas nuevas: **21 Node HTTP/CSRF/SW/logs/límites + 23 PostgreSQL/HTTP/procesos,
15 de cliente y 1 Edge/React/HTTP = 60 únicas**. Antes de la matriz: 55/55 backend (34 anteriores
incluidas), 23/23 SQL, 15/15 cliente y 1/1 Edge/HTTP; repeticiones no incrementan el total.

**npm test integral: APROBADO, salida 0.** [Matriz final](matrix-evidence.json),
Node 24.22.0 / npm 11.19.1, terminada el 22/10/2026 a las 18:46 CDMX.
**1,441 únicas = 1,381 anteriores + 60 nuevas**; 613 ejecuciones adicionales
excluidas del total. Los 82 comandos terminaron en 0, sin diagnóstico
EBUSY ni repetición extraordinaria en este intento final.

| Verificación final | Resultado |
| --- | --- |
| Express/Fastify y PostgreSQL real desechable | Equivalencia HTTP 31/31; seguridad SQL/procesos 23/23; bloques históricos aprobados. |
| Edge/React, Dexie/IndexedDB, SW y offline | 31/31 offline en Express legacy, esquema actual y Fastify; 23 Query + 3 React/móvil + 1 cancelación HTTP aprobados. |
| Seguridad nueva | 21 Node + 15 cliente + 1 Edge + 23 SQL/procesos aprobados; dos usuarios y dos procesos reales. |
| Atajos, PR/Smart Loading, idempotencia, conflictos, backup/restauración | Bloques históricos aprobados sobre clústeres sintéticos. |
| TypeScript strict y archivos generados | Aprobados; lint TS 59 archivos sin errores/advertencias. |
| Builds y bundle | Workspaces, ensayo y build productivo en copia aislada; check:generated y check:bundle aprobados. |
| Instalaciones y dependencias runtime | npm ci raíz/client/server independientes, CommonJS y smokes Express/Fastify con prune aprobados. |
| Lint TS/tooling/backend | Aprobado; lint global conserva deuda histórica sin regresiones. |

Tres intentos previos se conservan como diagnóstico: fallo de mock histórico,
interrupción para corregir rotación reproducida y EBUSY de limpieza Windows
después de 31 assertions Fastify aprobadas. No se presentan como aprobados.
El intento final completo usa una copia nueva y termina sin ese incidente.

[Lint](lint-comparison.json): **19 errores y 2 advertencias** frente a 23/2;
cero hallazgos nuevos por archivo/regla/mensaje/multiplicidad. El lint global
sigue fallando por deuda histórica; TS/tooling/backend dirigidos pasan.

[Revisión de dependencias](dependency-review.json): compression 1.8.1→1.8.2,
proxy-addr 2.0.7→2.0.8, qs directo 6.14.2→6.16.1 y DOMPurify transitivo
3.4.11→3.4.17; sólo estos cuatro paquetes y la declaración de qs cambian de
versión. Locks raíz/standalone coherentes. Sin audit fix --force ni retirada de
herramientas. Los avisos de [compression](https://github.com/advisories/GHSA-vc2v-76pw-4v95)
y [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) respaldan esos parches.

`npm audit` **sale 1**: 20 hallazgos (12 altos/8 moderados/0 críticos);
omit=dev: 13 (9 altos/4 moderados/0 críticos). No significa 13 ataques runtime
alcanzables: Prisma config, Vite y herramientas transitivas también se declaran
como dependencies; React Router requiere RSC ausente; fflate requiere
descompresión no expuesta; qs/body-parser requieren opciones/límites vulnerables
no usados. Se conserva cada aviso y condición; no se declaran falsos positivos
ni ausencia universal de vulnerabilidades. Actualizaciones mayores quedan fuera.

## Riesgos, recuperación y Fase 10

Pendientes explícitos: recuperación mediante factor verificado/proveedor real;
política de sesiones durables/renovación/dispositivos; adopción frontend de
cookies; enforcement CSP con todas las integraciones; CIDR/topología EasyPanel;
limitación distribuida (hoy una réplica o control compartido previo en proxy).
Bearer anual y preguntas de seguridad siguen siendo riesgos conocidos.

No hay recibo durable por dispositivo ni prueba de entrega. Si el proveedor
acepta y el proceso cae antes del commit, puede repetirse al restaurar; tag
estable + eventId lógico suprimen alertas duplicadas del mismo evento, sin prometer exactly-once. Un
fanout lento puede agotar el presupuesto de envío; las marcas no equivalen a
lectura. Se conservan estas limitaciones sin incorporar infraestructura nueva.

Docker/Linux/EasyPanel, Safari/iOS físico, baseline provisional y arranque
productivo sin DDL siguen sin certificar. No se activa Fastify, sincronización
nueva ni Coach; no se inicia Fase 10. Las políticas y mecanismo de ensayo están
en [SECURITY.md](../../../docs/SECURITY.md).

Respaldo previo: **791 archivos con SHA-256 verificado**, fuera de Temp:
`C:/Users/guerr/.codex/artifacts/nexlift-phase9-received-bc23e547-332a-4b78-82a9-85c707dea3dd`.
La caracterización histórica mantiene igualdad para los demás statements; 20
statements de seguridad cambiados tienen hashes explícitos y regresiones
HTTP/SQL/procesos. De los 110 archivos especialmente protegidos, 108 conservan
SHA-256 idéntico; los otros dos sólo conectan el botón de detener descanso con
la cancelación remota, preservando el resto de su código.
Se conservan fixtures, fórmulas y evidencia anterior; no se
eliminan tests para obtener verde. **No se modifican schema/migraciones Prisma,
bases persistentes, credenciales reales, commits ni producción.**

Verificación final de preservación: 791 archivos recibidos, 751 idénticos,
40 cambios revisados y ninguno ausente. Los 608 hashes de fuente de la matriz
coinciden al cierre. Sin cambios staged. La revisión automática bloqueó una
limpieza opcional de node_modules de copias descartadas con «blocked by policy»;
se conservaron esos directorios, sin intentar eludir el bloqueo.
