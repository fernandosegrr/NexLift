# NexLift Coach + disponibilidad — certificación del release

Fecha: 2026-10-23. Estado: integración local; publicación bloqueada por acceso a EasyPanel. Este informe sustituye el procedimiento de preparación anterior para este release, sin alterar sus evidencias históricas.

## Resultado verificable

- COACH: **no publicado**. El endpoint público devuelve 404 y producción mantiene solo tres migraciones.
- HOTFIX: **no publicado**. El Service Worker público no contiene `v4.0-availability-1`.
- BASE DE DATOS: comprobaciones de integridad de solo lectura aprobadas; respaldo completo restaurado y expansión ensayada. **Ninguna migración productiva ejecutada**.
- EASYPANEL: **incidencia pendiente de diagnóstico y acceso**. El navegador del host muestra Login; la sesión Safari del iPhone no se comparte. No se dispone de SSH ni de una sesión/API de despliegue autenticada.
- PRUEBAS: **1,578 únicas aprobadas mediante ejecución continuada verificada**, más 1 compatibilidad API v4. Lint global fallido por hallazgos heredados; ejecución limpia única de npm test pendiente. No hay certificación integral limpia.
- COMMIT EN PRODUCCIÓN: **no verificado**. `origin/main` es `5c8615ed7006353bf0e1e672eb9bf262b3393dc9`, confirmado mediante fetch; no es prueba del SHA del contenedor.

No se hizo push ni se disparó un despliegue automático. Publicar sin comprobar el servicio y disponer de recuperación operativa dejaría sin resolver una validación crítica exigida por este lanzamiento.

## Git y conservación del trabajo

Repositorio original: `C:/Users/guerr/OneDrive/Escritorio/NexLift`. Worktree del release: `C:/Users/guerr/.codex/artifacts/nexlift-coach-production-release`, rama `release/coach-production`.

| Cambio | Commit |
|---|---|
| Coach original, conservado | `cfbdbcc`, `12365e0369330293b1cb61f6cbf66076a0d15f17` |
| Hotfix original | `2025096d4161eb23e76382bfdbd8e29c7142f621` |
| Integración Coach desde main actualizado | `43c0fbb` |
| Integración infraestructura y matriz combinada | `18452e0b9fe2040a5ae01679bcd186e640398467` |
| SQL de auditoría omitido de los checkouts limpios | `9534d40` |
| Activación productiva y expansión incremental | `ffa8c08f029ac6c550d1c3d3241f9918f3477714` |
| Ensayo de activación diferida del SW conservando pendientes | `6db9756a19c8eea639b74ca86b76395867941941` |
| Preservación de 60 aserciones y dos nuevas | `80b2e888b30bdb4df9c3e04ed4d57477081edb56` |
| Push enfoca sin navegar entrenamiento | `7a3be4c2ad6099352dfe355482d656d1f4661258` |
| Build final con React productivo | `70d95e5fb8b1b60f7f39e38b8023e894018dc29e` |

No se reescribió el historial, no se tocaron los commits de Coach, no se usó force push, reset ni clean. Los worktrees originales permanecen disponibles.

## Disponibilidad: evidencia y límites

**La causa raíz del incidente original sigue sin confirmar.** El círculo gris, solicitudes 200 y recuperación después de Deploy no determinan por sí solos el estado del backend. La fotografía acredita una consola de una tarea seleccionada, no el desired/actual de todo el servicio.

Comprobaciones públicas GET, sin sesión, a las **19:08:22Z y 20:07:22Z**:

| Recurso | Estado | Caché |
|---|---:|---|
| `/login` | 200 HTML | no-cache |
| `/api/health` | 200 JSON | no-store |
| `/api/ready` | 200 JSON | no-store |
| `/api/coach/report` | 404 JSON | no-store |
| `/sw.js` | 200 JS | no-cache |
| `/manifest.json` | 200 JSON | public, max-age=31536000 |

Dominio: `https://postgres-nexlift.d6cr6o.easypanel.host`.
HTML SHA-256: `6adb45360a1825c90159485fdbcfe1ecdb03466e68f6bdb2e69556ea5f4d0f9a`.
SW SHA-256: `95e85a0a32d14c4af285822823f10196aec49dafbf7797b06a9ae8f71c433288`.
Estos resultados puntuales no demuestran disponibilidad continua.

El hotfix reproduce y corrige la sustitución del app shell por una respuesta 502/503, red cortada o HTML ajeno: navegación con timeout, validación del shell, fallback público seguro, sin caché de documentos de error. No cachea APIs privadas. Una página externa de error ya cargada fuera del control del SW no puede repararse desde React; prevenir indisponibilidad y servir el shell desde un controlador válido sigue siendo esencial.

La reanudación agrupa online/pageshow/focus/visibility, evita trabajo oculto y reintenta lecturas visibles con límites. No recarga páginas, no repite escrituras ambiguas, no borra IndexedDB, borradores ni operaciones. Un entrenamiento ya cargado conserva su estado. El SW nuevo respeta waiting; no fuerza controllerchange/reload. Los clics push enfocan la ventana existente.

Pendiente del VPS, con timestamps UTC del mismo intervalo del fallo: desired/running replicas, tareas antiguas, health probes, OOM/exit/restarts, límites y uso RAM/CPU, imagen/digest, update/restart policies, puerto/bind efectivos, red Traefik→contenedor, routers/services y errores correlacionados, arranque Node, jobs/push y SIGTERM. `server/deploy/collect-availability.sh` es de solo lectura y está preparado para ejecutarse en el manager con el nombre exacto confirmado del servicio. No se ejecutó Docker en este equipo.

## Coach y activación del release

Los seis módulos están integrados en el dominio compartido, UI `/coach`, contratos y endpoints autenticados:

1. Volumen muscular semanal y contribuciones directas/indirectas.
2. Recuperación/fatiga y check-ins privados editables.
3. Smart Loading 2.0 con configuración, evaluación y consentimiento para registrar sugerencias; v1 permanece disponible y visible como referencia.
4. Detección de estancamientos con comparabilidad de contexto.
5. Tendencias de hipertrofia, peso, perímetros y fotos voluntarias.
6. Asistente visual con vistas verificables y fallback determinista sin proveedor.

Se detectó y corrigió que el trabajo de desarrollo aún prohibía Coach en producción: gate de rutas, configuración del runtime, enlace de Progreso y página React. Se mantiene el apagado explícito mediante `NEXLIFT_COACH_ENABLED=false`. La IA externa es opcional; requiere proveedor configurado y `useProvider=true` en esa consulta. Solo selecciona identificadores de hechos permitidos, no recibe notas/fotos/check-ins privados ni ejecuta mutaciones. Sus fallos o timeout conservan el resultado local. El usuario confirma las escrituras explícitamente desde los formularios; preguntar al asistente no guarda un check-in ni aplica cargas.

No se activó la nueva sincronización offline: flags de operaciones/IndexedDB/conflictos siguen deshabilitados en producción. Se ensayó el módulo API v4 del worktree del hotfix contra el backend expandido: lecturas, sesión, entrenamiento nuevo, respuesta perdida, inspección repetida sin segunda mutación y aislamiento entre cuentas. No equivale a ejecutar toda la PWA antigua en un iPhone.

## Esquema, respaldo y datos reales

La producción real (`demo`, PostgreSQL **17.11**) tiene tres migraciones terminadas, sin filas fallidas:

| Migración | SHA-256 del SQL |
|---|---|
| `0_init` | `47c9542787e5cb64c36b2b8c079e05995ac5f98fe9c7b86b9b8c87747688ea2b` |
| `202610180001_phase31_operations` | `61b62984e5597c6d1e229e3d58e99a9e03df02bc92a6847527b1c9da3254631c` |
| `202610220001_phase6_history` | `fb546d17ab3c13f86ca3e0d773f6f056cdbef54faf233bb4b32a7cd3bf07b5fe` |
| Coach pendiente, SQL original inmutable | `068eba7493f7af5c365d9a892d99700e0a9fbfa6a7f3cf12e3c4983808bc2236` |

Preflight productivo de **solo lectura**, revalidado a las **20:07Z**: catálogo v4 exacto y journal compatibles; 3 usuarios, 5 rutinas, 128 ejercicios, 318 entrenamientos, 879 series, 47 récords. Sin entrenamientos sin propietario, sugerencias/recordatorios entre cuentas, series huérfanas, colisiones de número ni weekdays inválidos. Coach pendiente; no se han creado sus tablas en producción.

Respaldo completo consistente por snapshot exportado, **18:54:25Z**, custom pg_dump: **94,886 bytes**, **19 entradas TABLE DATA**, todas las tablas de aplicación, claves/push/temporizadores, historial Prisma y `nexlift_operations.IdempotencyRecord`. SHA-256 del archivo descifrado:

`595332ab7b382dea415674620549dafde392a216e23dc9afcb890f7349d10b2f`

Copia fuera del contenedor y del VPS:
`C:/Users/guerr/.codex/artifacts/nexlift-coach-production-1792780922400/production-full.dump.enc`.
AES-256-GCM, clave protegida por Windows CurrentUser DPAPI, directorio con ACL restringida. La clave está en el almacén DPAPI existente; debe conservarse junto con el acceso a esa identidad Windows. No hay datos personales ni credenciales en Git. El servidor PG no admite TLS en el acceso existente comprobado; no se afirma cifrado de transporte.

Se verificaron descifrado/hash, TOC y esquema, y se restauró el archivo en una base NUEVA local vacía. Las 19 tablas coinciden exactamente en conteos y huellas. Reensayo adicional **19:05:59Z**: restauración nueva, preflight v4, fallo deliberado después del DDL con rollback completo, expansión real mediante `expandCoach`, preflight Coach, idempotencia y preservación de todos los datos originales/journal. PostgreSQL local **18.4**, origen **17.11**: no se afirma ensayo del motor 17 en Docker.

Evidencias privadas junto al archivo: `backup-result.json`, `restore-result.json`, `real-data-upgrade-rehearsal.json`, `production-readonly-preflight-final.json`; se conservaron fuera del repositorio. El manifiesto público del release solo incluye agregados.

La nueva migración persistente separada `server/deploy/coach-upgrade.mjs` reutiliza el DDL con checksum exacto de Coach y deja intacto el guard desechable del SQL original. Usa identidad explícita de DB/major, advisory lock, transacción única, lock_timeout 2s, statement_timeout 10s, catálogos e historial exactos antes/después, huellas de tablas originales/journal e inserción del historial solo dentro de la misma transacción verificada. No borra ni transforma tablas antiguas. Rechaza drift, historial alterado y expansión parcial. El CLI exige evidencia de respaldo/restauración reciente y hash del archivo cifrado.

## Resultados de pruebas

- Build de producción y límites de bundle: aprobados; 2,737 módulos del grafo de navegador sin Prisma/servidor/secretos.
- TypeScript, generados y lint TypeScript: aprobados (64 archivos, cero advertencias/errores).
- Lint release: aprobado (14 archivos). Lint tooling: aprobado (79 archivos).
- `npm run lint` global: **fallido**, 19 errores y 2 advertencias. Comparación ejecutada contra el checkout original de Coach `12365e0`: mismos 21 hallazgos, cero nuevos (`frontend-lint-comparison.json`). Incluye Fast Refresh/exportaciones, variables sin usar y reglas React sobre efectos, pureza y autenticación. No se cambiaron las reglas ni se suprimieron errores. Su resolución permanece pendiente; no se declara certificación integral limpia.
- Integración Coach en PostgreSQL: **23/23** aprobadas, incluyendo cuatro casos nuevos de activación, bridge, rollback, drift, fallback e aislamiento.
- Compatibilidad del API v4 + hotfix contra Coach: **1/1** aprobada, sin duplicación tras respuesta perdida.
- Cobertura de la matriz: **1,578 únicas aprobadas** (1,467 históricas/upstream, 98 Coach y activación, 13 disponibilidad). El primer intento falló porque `diagnostics.sql` era ignorado por Git; se recuperó el SQL original de solo lectura y se añadió la excepción específica, sin alterar las aserciones. El segundo intento superó esa etapa y encontró que el antiguo ensayo de actualización esperaba una activación/recarga inmediata. Se corrigió el arnés para exigir waiting mientras la página sigue abierta, conservar el pendiente, cerrar/reabrir su documento desechable y comprobar el upgrade físico 20 → 30. No se reintrodujo skipWaiting ni se debilitó la aserción de conservación. El tercer intento superó offline, pero el control de preservación detectó las dos aserciones nuevas: ahora exige las 60 originales exactas y únicamente esas dos adiciones. También se actualizó la expectativa de push para exigir foco sin navegación. Finalmente se corrigió NODE_ENV=production en el build final del arnés; su variante test generaba React de desarrollo y fallaba antes de montar Workout. Con el artefacto productivo, la prueba de disponibilidad aprobó.
- La continuación retomó la MISMA copia desechable y verificó por SHA-256 cada fuente previa: solo admitió los cambios concretos de pruebas/herramienta registrados en matrix-continuation.json; no cambió código de aplicación entre bloques. Todos los bloques terminaron aprobados, con 1024 ejecuciones repetidas excluidas del conteo único. **No se afirma que una única invocación npm test haya terminado verde**: las invocaciones anteriores se detuvieron; la continuación verificable terminó exit 0. Antes de publicar sigue pendiente una invocación limpia completa con el arnés corregido.
- Fastify offline aprobó sus 31 pruebas; el primer cierre tuvo EBUSY únicamente al eliminar postgres.private.log, después de detener PostgreSQL. El arnés conservó el archivo y repitió en una DB nueva; el segundo cierre terminó 0. El diagnóstico está registrado como cleanupDiagnostic, nunca contado como aprobación única adicional.
- En Windows se conservaron los bytes originales de fixtures y declaraciones históricas idénticas en contenido Git, para mantener sus offsets/hashes de EOL recibidos. No se relajaron esas comparaciones; la reproducibilidad en un checkout limpio adicional sigue pendiente.
- No se ejecutaron Docker, iPhone físico, LTE/Wi-Fi físicos ni pruebas autenticadas en producción. Las simulaciones de red/suspensión automatizadas se identifican como tales.

Conteo histórico reconciliado: **1,464 + 3 tests upstream del parser de importación + 94 Coach = 1,561**. Los 97 de diferencia contienen 94 de Coach y 3 preexistentes incorporadas desde main. El candidato añade 13 pruebas de disponibilidad y 4 de activación: resultado **1,578 únicas** en la matriz completa, más 1 comprobación específica de compatibilidad fuera de esa matriz. No sumar reejecuciones.

## Procedimiento concreto pendiente

Ejecutar solo tras resolver el lint global, obtener una ejecución limpia completa de npm test y verificar acceso al servicio/recuperación. No hace falta una autorización adicional del usuario: ya autorizó este release.

1. En EasyPanel, confirmar servicio exacto, commit actual, repositorio/rama Dockerfile/target, puerto interno 3001, bind 0.0.0.0, Express, una réplica, healthcheck real, proxy y políticas de despliegue. Registrar imagen anterior/digest. No modificar secretos. Obtener la evidencia Docker pendiente y resolver cualquier incidencia activa antes del push.
2. Revalidar `origin/main`; si avanzó, integrar en release y repetir las regresiones afectadas. Mantener el worktree de Coach intacto. Publicar main desde otro worktree limpio:

```powershell
$repo='C:\Users\guerr\OneDrive\Escritorio\NexLift'
$release='C:\Users\guerr\.codex\artifacts\nexlift-coach-production-release'
git -C $release fetch origin
# Comprobar que origin/main sigue siendo el ancestro certificado.
git -C $release merge-base --is-ancestor origin/main release/coach-production
# Si no hay otro main abierto y la ruta aún no existe:
$publish='C:\Users\guerr\.codex\artifacts\nexlift-publish-main'
git -C $repo worktree add $publish main
git -C $publish merge --ff-only origin/main
git -C $publish merge --ff-only release/coach-production
git -C $publish push origin main
```

3. EasyPanel debe construir el SHA recién publicado con `Dockerfile.release`, target `runtime` (el Dockerfile raíz es equivalente), y arrancar `node deploy/release-http.mjs`. Si no hay autodeploy, usar Deploy del servicio existente. Mantener `NODE_ENV=production`, `NEXLIFT_RELEASE_MODE=release`, `NEXLIFT_HTTP_TRANSPORT=express`, `NEXLIFT_REPLICAS=1`, URL/JWT/VAPID y demás secretos existentes. Offline/conflictos permanecen false. No pasar nuevas claves IA para hacer funcionar Coach: el fallback no las requiere.
4. **Antes de migrar**, comprobar que la nueva imagen bridge está realmente saludable sobre el esquema v4: core funciona, `/api/ready` 200; Coach autenticado puede responder 503 de preparación. Comparar SHA del build, imagen/digest y recursos publicados. No migrar mientras siga ejecutándose el gate viejo v4, que rechaza el esquema expandido.
5. Hacer respaldo fresco y restaurarlo de nuevo si cambió el origen o se demoró el release; verificar archivo, identidad y huellas. Los scripts locales ya ensayados son `C:/Users/guerr/.codex/artifacts/nexlift-coach-fresh-backup.mjs`, `nexlift-coach-restore-rehearse.mjs` y `nexlift-coach-real-data-upgrade.mjs`; crean rutas/archivos exclusivos, por lo que el siguiente respaldo requiere un NUEVO directorio de evidencia y apuntador, sin sobrescribir el existente.
6. Para aplicar la expansión desde el checkout certificado, con Node 24.22.1, inyectar la conexión por el almacén existente, nunca en argumentos/logs/Git:

```powershell
$runtime=(Get-Content -Raw 'C:\Users\guerr\.codex\artifacts\nexlift-phase10-runtime-path.txt').Trim()
$env:PATH="$runtime;$env:PATH"
# NEXLIFT_RELEASE_DATABASE_URL procede del almacén de secretos existente.
$env:NODE_ENV='production'
$env:NEXLIFT_COACH_TARGET_DATABASE='demo'
$env:NEXLIFT_COACH_TARGET_PG_MAJOR='17'
$env:NEXLIFT_COACH_BACKUP_EVIDENCE='C:\Users\guerr\.codex\artifacts\nexlift-coach-production-1792780922400'
node server/deploy/coach-upgrade.mjs
node server/deploy/release-preflight.mjs coach
```

El directorio de backup del ejemplo solo es válido mientras la evidencia siga reciente y revalidada. **No ejecutar prisma migrate deploy contra la cadena desechable, migrate reset, db push, resolve ni quitar guards**.

7. Verificar cuatro migraciones, catálogo Coach exacto, los conteos originales y propiedad, autenticación/cuenta de prueba autorizada, reportes/dashboard/seis módulos, Smart Loading v1/v2, fallback, escritura voluntaria de check-in y separación de cuentas. No usar cuentas reales para crear entrenamientos de prueba sin necesidad. No se dispone todavía de credenciales de una cuenta productiva de prueba.
8. Verificar dominio público, recursos/chunks sin caché anterior, SW con `v4.0-availability-1`, probes internos/externos, réplicas reales, logs y ausencia observable de OOM/reinicios. Hacer reconexión controlada en navegador sin provocar caídas de producción. En iPhone instalado, comprobar suspensión/reanudación y cambio real de red sin entrenamiento activo en una cuenta de prueba. No forzar recarga ni borrar datos para activar el SW waiting.

Recuperación: si falla el build antes de la expansión, conservar/restablecer la imagen anterior comprobada. Si falla la expansión, su transacción revierte íntegramente y la imagen bridge sigue atendiendo v4. Después de expandir, **no volver ciegamente al backend anterior**, cuyo gate rechaza las tablas Coach; conservar una imagen bridge compatible o corregir hacia adelante. La imagen bridge puede operar con `NEXLIFT_COACH_ENABLED=false` para aislar Coach preservando esquema/datos y hotfix; en ese caso Coach no debe declararse disponible. No revertir migraciones ni restaurar un dump sobre registros posteriores. Si no se puede recuperar con ese procedimiento, detener operaciones de riesgo y conservar los datos.

## Archivos y evidencias del candidato

El inventario completo contra origin/main está en integrated-source-files.json (commit de aplicación ffa8c08f029ac6c550d1c3d3241f9918f3477714; candidato 70d95e5fb8b1b60f7f39e38b8023e894018dc29e). Desde el commit de aplicación solo cambiaron arneses de prueba, no lógica de producto.

| Área | Archivos principales modificados/agregados |
|---|---|
| Activación UI | client/src/pages/Coach.jsx, Progress.jsx; shared/domain/coach/engine.ts y puente generado |
| Runtime Coach | server/src/modules/coach/routes.js, service.js, provider.js, availability.js; server/src/app/runtime.js |
| Transición segura | server/deploy/release-config.js, release-preflight.mjs, coach-upgrade.mjs, coach-catalog.json, release-artifacts.mjs; .dockerignore |
| Backups durante transición | server/src/services/backupExport.js |
| Pruebas y reproducibilidad | server/test/coach.integration.test.js, run-coach-release-check.mjs, phase9-security.test.js, fixtures/stabilization-browser.mjs; scripts/verify-monorepo.mjs, lint-release.mjs, test/coach-release-check.mjs, test/training-performance.test.mjs; .gitignore y diagnostics.sql |
| Hotfix original | client/public/sw.js, client/index.html, client/src/main.jsx, services/api.js, services/availabilityResume.js, pages/Workout.jsx y sus regresiones; detalle en ../hotfix/PWA-AVAILABILITY-AND-COACH-RELEASE.md |

Evidencia nueva: matrix-evidence.json (todos los bloques, hashes y continuaciones), production-certification.json (lecturas productivas y respaldo), availability-browser-final.json, coach-production-v4-compatibility.json, frontend-lint-comparison.json y real-data-coach-contracts.json. Los logs privados, volcado y claves permanecen fuera de Git.

La copia restaurada real generó y validó contra los contratos frontend informes y respuestas sin proveedor para las **3 cuentas**, con default_transaction_read_only=on, sin crear registros Coach y con huellas originales intactas. Es una prueba local sobre backup real, no una sesión HTTP productiva.

El entrypoint de este release es **node deploy/release-http.mjs**. El entrypoint heredado src/index.js conserva su gate anterior de Coach; verificar que EasyPanel no lo esté imponiendo mediante un override.

## Riesgos y verificaciones abiertas

Lint global, ejecución limpia única y reproducibilidad en checkout adicional pendientes; acceso a EasyPanel/Docker y SHA real aún pendientes; causa original no resuelta; Docker/Linux/capacidad no ejecutados aquí; autenticación y Coach productivos sin verificar; iOS físico no probado; transporte PG existente sin TLS. La disponibilidad HTTP puntual de v4 está comprobada, pero no certifica todo el servicio ni el nuevo release. Este documento no declara éxito de publicación.
