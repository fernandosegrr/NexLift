# NexLift — disponibilidad PWA y preparación de Coach

Fecha: 2026-10-23. Investigación local, sin acceso al VPS ni a bases persistentes.

## Resultado y límites de la conclusión

**La causa del incidente productivo sigue sin confirmarse.** No se atribuye el círculo gris a un contenedor apagado. No se dispone de las réplicas, healthchecks, OOM, reinicios, routing ni logs del proxy del intervalo afectado. Los HTTP 200 y la recuperación tras Deploy/cierre son observaciones del usuario, sin timestamps correlacionables recibidos.

Se confirmaron y corrigieron problemas del cliente que agravan una indisponibilidad: el SW v4 entrega una página HTTP 502/503 como documento aunque tenga shell; una actualización forzada del worker puede recargar un entrenamiento; el reintento anterior dependía principalmente de online y no recuperaba un día cuyo GET inicial había fallado. La corrección fue probada en Edge y PostgreSQL desechable. **La disponibilidad remota no está certificada y no se desplegó nada.**

Hotfix local: **2025096d4161eb23e76382bfdbd8e29c7142f621**, rama **fix/pwa-availability**, basado en main **5c8615ed7006353bf0e1e672eb9bf262b3393dc9**.

Worktree: C:/Users/guerr/.codex/artifacts/nexlift-pwa-hotfix.
Coach original permanece en feat/nexlift-coach, commits cfbdbcc y 12365e0, sin reescritura ni cambios de fuentes. No se hizo push, cambio al panel, DDL persistente ni llamada a proveedores reales.

## Evidencia: distinguir backend, proxy y documento PWA

| Capa | Evidencia disponible | Qué no demuestra / qué falta |
| --- | --- | --- |
| Backend | Pruebas locales de HTTP, DB, readiness, reinicio y cierre; runtime Express operativo | Un 200 histórico no prueba disponibilidad durante el error del iPhone |
| Docker/Swarm | Dockerfile/release config inspeccionados; Docker no está disponible aquí | Desired vs running, tareas rechazadas, exit code, OOMKilled, límites y CPU/RSS reales |
| EasyPanel/Traefik | Documentación y configuración propuesta del repo | Estado real del proveedor, servicio/router/network/puerto, healthchecks efectivos y proxy→contenedor |
| SW v4 | Reproducción VM del código exacto de 5c8615e: 502 y 503 entregan el error con shell disponible | El 502/503 no se guardaba como shell: se entregaba directamente como documento |
| PWA | Edge real con React compilado, SW, borrador de entrenamiento e IndexedDB; suspensión y cambio de red simulados | No es iPhone físico, Safari/WebKit, evicción iOS ni radios LTE/Wi-Fi reales |

La página de error puede permanecer como documento sin React, aunque el backend se recupere después. En ese documento React no puede ejecutar reintentos, restaurar rutas ni escuchar visibilitychange. El shell seguro previene esa sustitución cuando existe un worker activo y un shell válido; no puede reparar retroactivamente cualquier documento externo ni garantizar el primer acceso sin red.

Evidencias adjuntas:

- baseline-reproduction.json: dos reproducciones con el worker original y respuestas sintéticas; hash del código y timestamps.
- browser-evidence.json: eventos y peticiones con timestamps UTC del ensayo real de React/SW, sin cuerpos, JWT ni credenciales.
- validation.json: ejecución final de la verificación específica, 325 pruebas aprobadas, salida 0 de todos sus pasos.
- v4-postgres-evidence.json: migraciones, restore, readiness, reinicio y latencias sintéticas; no métricas del VPS.
- frontend-regression.json y pwa-first-install.json: cuenta/caché privada y primer arranque offline tras cerrar y reabrir Edge.
- coach-recheck.json, coach-performance.json, coach-browser-recheck.json: reevaluación de Coach sin modificar sus fuentes.
- coach-compatibility.json: cliente API v4 real contra backend Coach y PostgreSQL nuevos, con respuesta perdida.
- lint-comparison.json: cero hallazgos nuevos en los archivos de cliente afectados; no equivale a lint global limpio.

## Auditoría de infraestructura y proceso

1. **Réplicas**: la configuración de release exige NEXLIFT_REPLICAS=1. Eso es un guard de configuración, no consulta Docker. Se requieren Spec.Mode, service ps y tareas por nodo. El gris no sustituye esa evidencia.
2. **Probes**: Dockerfile y Dockerfile.release son iguales; HEALTHCHECK invoca Node contra 127.0.0.1:PORT/api/ready cada 30s, timeout Docker 8s, plazo fetch 6s, inicio 30s, tres fallos. /api/health mide proceso; /api/ready comprueba PostgreSQL y esquema/journal. No se deshabilitó ni falseó ningún check.
3. **Presupuesto de readiness**: el catálogo completo permite transacciones de hasta 40s y otra de 10s, mientras el probe vence a los 6s. Una DB lenta/bloqueada podría producir falsos negativos respecto de otras rutas. Es un riesgo identificado por inspección; no se reprodujo como causa del incidente y no se relajaron gates para ocultarlo. Correlacionar latencia/locks/pool y fallos efectivos antes de cambiarlo.
4. **Puerto/host**: imagen 3001 y config por defecto 0.0.0.0; config permite loopback explícito. Confirmar que el servicio real escucha la interfaz de red y que el dominio apunta al mismo puerto y overlay. No se conoce su valor operativo.
5. **Reinicios/OOM/recursos**: faltan eventos, State.ExitCode, OOMKilled y RAM/CPU del VPS. Exit 137 aislado no basta para afirmar OOM; requiere OOMKilled/kernel/cgroup. Los RSS sintéticos no son límites productivos.
6. **Node**: Node 24.22.1, arranque directo node deploy/release-http.mjs, sin migración al arrancar. DB/esquema y restore de recordatorios preceden al listener; su lentitud puede prolongar arranque. No se observó caída local.
7. **Jobs/Push**: un runtime posee jobs por Prisma mediante WeakMap; startBackground es idempotente dentro del proceso, los intervalos evitan solaparse y capturan rechazos. No es exclusión distribuida entre dos contenedores. Recordatorios persistentes/dedup y proveedor simulado se probaron tras reinicio. No se midió comportamiento del proveedor real ni del VPS.
8. **SIGTERM**: marca closing, pausa delivery, cierra HTTP, espera jobs y desconecta Prisma; plazo interno 10s. Ensayo de callback instalado, drenaje y reinicio aprobado; el kill real de Docker/Linux queda pendiente. Gracia del orquestador propuesta ≥15s, por verificar.
9. **Rolling update**: una réplica stop-first puede tener un hueco entre instancias. No cambiar a start-first o dos réplicas sin resolver exclusión de jobs/rate limits y ensayar el solapamiento. No se afirma que esto causó el incidente en reposo.
10. **Proxy**: falta configuración y conectividad real Traefik→tarea. Una ruta SPA 200 desde SW/caché puede coexistir con API/proxy indisponible. Un router sin upstream sano también puede coexistir con un proceso que responde internamente. Verificar las tres rutas en el mismo segundo.

## Captura productiva pendiente, de solo lectura

No se encontró en esta sesión un destino SSH/panel verificado con acceso de lectura previamente autorizado. No se buscaron ni imprimieron secretos, no se usaron .env operativos y no se intentó conexión a un servidor inferido. Las comprobaciones siguientes **no fueron ejecutadas**.

En el manager Docker, con el nombre exacto de servicio y almacenamiento privado:

~~~sh
umask 077
sh server/deploy/collect-availability.sh EXACT_SERVICE > /private/availability-UTC.txt
# Repetir durante gris/error y después, sin hacer Deploy antes de capturar.
docker events --since UTC_START --until UTC_END --filter type=container \
  --format '{{.TimeNano}} {{.Type}} {{.Action}}' > /private/container-events.txt
docker service logs --timestamps --since UTC_START EXACT_SERVICE > /private/app.private.log 2>&1
journalctl -k --since UTC_START --until UTC_END > /private/kernel.private.log
~~~

collect-availability.sh no cambia servicios, no imprime Env, credenciales, cuerpos, salida de probes ni inspect completo. Muestra estado deseado/tareas, health status, reinicios, OOM, exit, recursos y stats. Su sintaxis fue validada con bash -n; no su ejecución Docker.

Capturar además, de forma privada y redactada, la regla de dominio, entrypoint/TLS, puerto interno, servicio y red del router, middlewares/cache, healthcheck efectivo y logs de acceso/error de Traefik. No compartir inspect completo ni labels que pudieran contener secretos.

En el mismo intervalo, medir código y tiempo de /, /api/health y /api/ready: (a) desde fuera por HTTPS, (b) desde un diagnóstico existente en la misma red del proxy hacia DNS_SERVICIO:3001, (c) loopback dentro de la app mediante el healthcheck Node existente. No instalar herramientas ni cambiar redes/replicas para hacer la captura. Anotar UTC, task/container ID, imagen/digest, Host/SNI y request ID; comparar con el timestamp del iPhone. Guardar salida sensible solo localmente.

Interpretación: fuera 503 + dentro ready 200 apunta a proxy/routing; dentro live 200 + ready 503 apunta a dependencia/readiness; sin listener y tarea terminada requiere exit/OOM/eventos; documento proxy persistente con endpoints recuperados indica además navegación retenida. Ninguno de esos resultados fue observado aquí en producción.

## Corrección aplicada

- SW: navegación de mismo origen con no-store y plazo 8s; 5xx, 408, fallo de red y HTML 200 ajeno a NexLift recuperan un shell validado. 401/403/404 y API nunca se convierten en shell.
- Shell: marcador explícito nexlift-shell=v4 y root; instalación rechazada si no obtiene HTML válido. Un error al escribir caché no oculta una respuesta de red sana. No se cachean respuestas API ni intersticiales como shell.
- Actualización: retirados reload y activación forzada. El worker nuevo ignora SKIP_WAITING automático del cliente v4, porque ese cliente recarga con controllerchange. Espera a que los documentos anteriores se cierren naturalmente. No exige cerrar para recuperarse de una caída con el hotfix ya activo.
- Cachés públicos antiguos se conservan para los chunks de documentos abiertos; no se borra IndexedDB, colas, borradores, fotos o sesión. Se deberá diseñar una recolección segura de cachés públicos en un release posterior para evitar crecimiento de cuota.
- Reanudación: online/pageshow/focus/visibilitychange y comprobación visible cada 30s; coalescencia, un trabajo activo, mínimo 5s entre disparos, sin trabajo oculto/offline. Se reintentan lecturas y la inspección segura de pendientes; no se reenvían mutaciones ambiguas.
- GET autenticados con plazo 15s para no dejar el bootstrap colgado indefinidamente. Un timeout conserva la sesión; solo un 401 real conserva el tratamiento existente de credencial inválida.
- Workout: solo se reintenta el día cuyo arranque falló por red/502/503/504 y todavía no tiene ejercicios cargados. Un entrenamiento abierto mantiene sus series y no se rehidrata al recuperar foco.
- Click de Push: enfoca una ventana de NexLift existente; evita navegarla a otro documento durante un entrenamiento. Si no hay ventana, se conserva apertura de destino validado.

Archivos funcionales: client/index.html, client/public/sw.js, client/src/main.jsx, client/src/app/serviceWorkerLifecycle.ts, client/src/services/api.js, client/src/services/availabilityResume.js y client/src/pages/Workout.jsx. No hay cambios funcionales del backend, schema, Dockerfile, v1 ni protocolo de sincronización. Los restantes archivos del commit son pruebas, comandos de verificación y captura de lectura; git show --stat 2025096 los enumera.

## Pruebas y disponibilidad

| Grupo final | Aprobadas | Alcance |
| --- | ---: | --- |
| Cliente | 230 | Colas, borradores, aislamiento, retry seguro y tres casos de resume/timeout nuevos |
| Frontend | 26 | 23 contratos + 3 ensayos Edge; caché por cuenta y PWA tras reinicio offline |
| HTTP/SW/jobs | 55 | Release config, lifecycle, notificaciones, 9 casos SW nuevos y privacidad |
| Release PostgreSQL | 13 | DB nueva marcada, migración repetible, backup/restore, checksums, ambos transportes, reinicio y jobs |
| Disponibilidad Edge | 1 | React compilado, SW real, 502/503/socket roto, frozen→active, red simulada, worker esperando y borrador restaurado sin reload |
| **Hotfix específico** | **325** | Runner final completo, salida 0 |
| Coach reevaluado | 94 | 74 dominio/proveedor simulado + 19 PostgreSQL + 1 Edge móvil |
| Compatibilidad adicional | 1 | API cliente v4 real vía Vite SSR contra Coach/PG nuevo; no es iPhone ni UI antigua completa |

Build, TypeScript estricto, artefactos generados, fronteras de bundle, tooling/release lint aprobados. Comparación de lint del cliente afectado: cero hallazgos nuevos; mantiene deuda anterior (Workout 1 y api 2 en esos archivos). No se presenta lint global como limpio.

Se conservaron diagnósticos de intentos intermedios: checkout Windows con finales de línea incompatibles con offsets históricos; fixture corregida usando bytes verificados sin cambios semánticos; un build de prueba con NODE_ENV=test no generaba la variante PWA productiva y el runner se corrigió; el primer arnés PG heredaba pipes y se ajustó a stdio aislado; las expectativas del ensayo adicional se corrigieron al contrato real (respuesta determinista y GET de otra cuenta devuelve 200 con colección vacía). No se modificó la lógica de Coach para satisfacer esas expectativas. Solo las ejecuciones finales aprobadas cuentan en la tabla.

No se volvió a ejecutar toda la matriz histórica npm test sobre este hotfix. El comando fue actualizado para registrar separadamente sus 13 casos nuevos y conservar las cifras históricas; el total esperado del hotfix solo es 1467+13=1480, pendiente de ejecución completa. La prueba de compatibilidad adicional es opt-in, fuera de ese total. No sumar reruns.

Disponibilidad: recuperación local certificada para los escenarios anteriores; uptime/remediación del VPS pendientes. Limitaciones: sin Docker Linux/Traefik/EasyPanel real, iPhone físico, WebKit, cambio de radios, suspensión larga/terminación iOS, cuota/evicción de caché o proveedor Push/IA real. No hay garantía de shell si nunca se instaló o el sistema lo eliminó. Los pendientes ambiguos quedan preservados para revisión y no se prometen como sincronizados.

## Revisión de Coach y conteo

Los seis módulos siguen integrados: volumen muscular, recuperación, Smart Loading 2, plateau avanzado, contexto de hipertrofia y asistente visual. La UI tiene seis paneles (incluido contexto de mesociclos) y conversación debajo; no confundir número de paneles con las seis capacidades. La prueba Edge revisó los seis paneles, CRUD, identidad de sugerencia y aislamiento.

Migración 202610230001_coach: cuatro tablas aditivas, FK/cascadas/índices/checks, trigger de dueño y vínculo a serie concreta. Las tres migraciones anteriores conservan bytes/checksums. Se probaron conservación de escalares históricos, reejecución, rechazo de DB no marcada, portable v6 y dump completo/restauración. Los backups v4/v5 se validan antes de actualizar su formato. Portable no incluye credenciales ni datos locales del teléfono; dump completo es sensible y exige protección privada.

El cliente API v4 real leyó perfil/rutinas/home/historial y guardó entrenamiento contra el backend Coach. Al perderse la respuesta hubo una sola mutación y una fila nueva; replay posterior fue solo lectura. La cuenta B recibió [] al consultar el historial ajeno, sin datos de A. Esto complementa el cliente Prisma antiguo sobre DB expandida; falta certificar la PWA v4 física completa contra la futura imagen Linux.

Check-ins/recuperación: dueño por JWT, scopes/trigger y acciones explícitas; sueño/estrés/fotos/medidas no salen al proveedor. La DB y los dumps contienen información privada; no se afirma cifrado a nivel de campo. Retención de check-ins 365 días y sugerencias 90, con job solo en desarrollo. Acciones del asistente seleccionan hechos/vistas permitidos y no tienen herramientas de escritura. Crear/configurar/calibrar requiere petición explícita autenticada; aceptar/modificar exige serie posterior y confirmación. Sin proveedor IA se responde determinísticamente. Smart Loading v1 continúa disponible. No se activó IndexedDB/operations/conflict resolution productivos.

Conteo anterior reconciliado: **1464 + 3 + 94 = 1561**. Los tres se incorporaron en af8b8c4 desde upstream, en server/src/logic.test.js, grupo parseImportedDays: nombres/orden/series/rangos; restSeconds explícito/ausente; defaults sets/reps. No son reruns ni tres casos nuevos de Coach. 94=74+19+1. La matriz retenida original consta en server/audit/release/matrix-evidence.json de la rama Coach; no se reemplaza con la verificación específica del hotfix.

**Coach no está listo para publicar automáticamente.** Continúa limitado a desarrollo: rutas ausentes en producción incluso con flag, UI de desarrollo y migración que exige DB local marcada. releaseConfig no habilita Coach y el preflight v4 rechaza la expansión; ese rechazo se reprodujo. Se necesita un paquete persistente de adopción/migración y un gate/catálogo/activación de producción revisados. No quitar guards, marcar producción desechable ni editar SQL ya versionado para eludirlos.

## Integración local y comandos de ensayo

Hotfix aislado ya certificado localmente: 2025096. No rebase, amend, force push ni cambios a main/Coach original.

~~~sh
# En otra ruta nueva, dentro de este repositorio, sin .env productivos:
git worktree add -b release/pwa-availability /ABS/NUEVO-HOTFIX main
git -C /ABS/NUEVO-HOTFIX cherry-pick 2025096d4161eb23e76382bfdbd8e29c7142f621
cd /ABS/NUEVO-HOTFIX
npm ci --no-audit --no-fund
node scripts/verify-availability.mjs
npm test  # matriz completa: ejecutar antes de certificar la imagen
~~~

Usar Node 24.22.1/npm 11.19.1 y PostgreSQL 18.4/Edge o Chromium disponibles. El runner crea clústeres nuevos y no acepta una DB real. No usar una URL operativa para estas pruebas.

Integración de Coach, sin tocar su rama original:

~~~sh
git worktree add -b release/coach-with-availability /ABS/NUEVO-COACH feat/nexlift-coach
git -C /ABS/NUEVO-COACH cherry-pick 2025096d4161eb23e76382bfdbd8e29c7142f621
# Conflicto conocido únicamente en scripts/verify-monorepo.mjs:
cp /ABS/HOTFIX/server/audit/hotfix/coach-integrated-verify-monorepo.mjs /ABS/NUEVO-COACH/scripts/verify-monorepo.mjs
# /ABS/HOTFIX es este worktree, que contiene el informe y el archivo de resolución.
git -C /ABS/NUEVO-COACH add scripts/verify-monorepo.mjs
git -C /ABS/NUEVO-COACH cherry-pick --continue
cd /ABS/NUEVO-COACH
npm ci --no-audit --no-fund
npm run db:generate
npm run build
npm run test:availability
npm run test:coach
npm run test:coach:integration
npm run test:coach:browser
# PowerShell, usando como fuente SOLO este checkout de desarrollo preparado:
# $env:NEXLIFT_COACH_SOURCE=(Get-Location).Path
# POSIX: export NEXLIFT_COACH_SOURCE="$PWD"
node server/test/run-coach-release-check.mjs
npm test
~~~

El archivo de resolución preserva los 94 casos Coach y agrega los 13 del hotfix: expectativa **1574**, aún sin certificar con una matriz completa integrada. Se verificó el conflicto con merge-tree, y se preparó la rama local rehearsal/coach-availability, commit adc6367, resolviendo ese único archivo; su ejecución integrada se registra en integrated-candidate.json: **108 pruebas aprobadas**, build y TypeScript aprobados. Son reejecuciones de las 94 de Coach, 13 del hotfix y 1 de compatibilidad, no 108 pruebas nuevas. No es un release productivo.

También se puede partir directamente de la integración local ya ensayada, sin repetir el conflicto:

~~~sh
git worktree add -b release/coach-candidate /ABS/NUEVO-CANDIDATO adc636772a64f6e3d3a0b45f6cf42ecc7969ccf0
~~~

Esto prepara código para revisión y pruebas; no habilita las rutas Coach en producción.

## Backup, migración, imagen y despliegue futuro

Los comandos siguientes describen la ventana futura y **no se ejecutaron contra producción**. Las pruebas desechables sí ejecutaron migraciones y backup/restore reales mediante test:release:integration, test:coach:integration y run-coach-release-check.mjs.

1. Capturar el incidente antes de redeploy. Verificar revisión/digest realmente instalados y datos/pendientes por usuario; no borrar el almacenamiento del teléfono.
2. En un checkout **v4 compatible con el origen**, inyectar NEXLIFT_RECOVERY_DATABASE_URL con el gestor de secretos (sin pegar su valor en comandos/logs). Directorio privado, nuevo y fuera de Git:

~~~sh
node server/deploy/release-recovery.mjs system-dump /private/nexlift-PRE-RELEASE --acknowledge-sensitive
# Cambiar el destino por el gestor de secretos a una DB NUEVA VACÍA autorizada.
node server/deploy/release-recovery.mjs system-restore /private/nexlift-PRE-RELEASE --acknowledge-sensitive
~~~

No restaurar sobre el origen. Retener la revisión de código correspondiente al manifiesto; un checksum de schema distinto puede rechazar un dump de otra versión. Proteger copia cifrada fuera del VPS y medios externos por separado. Restore anterior sobre datos que ya recibieron entrenamientos nuevos requiere reconciliación, nunca se aplica por defecto.

3. Para el hotfix v4, no hay migración: preflight de lectura actual debe pasar sobre el esquema real aprobado. Inyectar NEXLIFT_RELEASE_DATABASE_URL de manera segura:

~~~sh
npm run release:preflight -- current
# Solo en Docker Linux de ensayo y con recursos/arquitectura aprobados:
docker build -f Dockerfile.release --target runtime -t nexlift:pwa-availability-2025096 .
NEXLIFT_DOCKER_REHEARSAL=true npm run test:release:docker
~~~

4. Para Coach, el comando de migración disponible es SOLO de ensayo:

~~~sh
# El arnés crea/valida localmente la DB y sus settings; no fabricar esa identidad.
npm run test:coach:integration
# Dentro de una DB NUEVA local ya preparada por el arnés y su env explícito:
npm run release:migrate:disposable
~~~

**No existe todavía un comando productivo válido de migrate deploy para la cadena actual.** Antes de redactarlo/aplicarlo: copia autorizada de la DB real, inventario de _prisma_migrations/checksums/catálogo/dueños, plan persistente de adopción separado sin reescribir migraciones, ensayo del upgrade/rollback sin perder nuevas filas y preflight Coach que reconozca las cuatro tablas. No ejecutar db push, migrate dev, resolve ni flags desechables sobre una base persistente. Publicar Coach exige además activación de runtime/UI de producción expresamente revisada; COACH_ENABLED=true por sí solo no lo hace.

5. Una vez aprobada la imagen **del hotfix sin Coach**, seleccionar en EasyPanel el commit/digest ensayado, Dockerfile.release (o raíz idéntico), target runtime, inicio node deploy/release-http.mjs, puerto 3001, bind 0.0.0.0, Express, una réplica, flags offline/resolution false. Mantener secretos/VAPID existentes por el gestor. No cambiar healthcheck para forzar verde. Deploy manual desde el panel en ventana aprobada; no se ejecutó aquí ni se hizo push a main para disparar autodeploy.
6. Verificar por fuera y dentro /api/health y /api/ready, HTTPS/router/SW/HTML/chunks; observar tareas/probes/reinicios y pedir prueba del iPhone sin entrenamiento activo. El nuevo SW puede quedar waiting mientras existan documentos antiguos: es intencional. No forzar reload, unregister ni limpieza de IndexedDB para activarlo.
7. Recuperación: conservar imagen anterior y esquema compatible; ante error del hotfix, revertir imagen/UI compatible preservando DB y pendientes. No asumir que cualquier backend v4 antiguo pasará el preflight tras migrar Coach. Preferir corrección hacia adelante; no hay downgrade SQL automático aprobado.

Los gates abiertos para Coach son disponibilidad real del VPS, imagen Linux/Docker, adopción/migración persistente, gates de esquema y activación, matriz integrada completa e iPhone físico. El trabajo funcional y los commits originales de Coach están protegidos y disponibles para revisión.

## Referencias primarias consultadas

[Docker: estados de tareas](https://docs.docker.com/engine/swarm/how-swarm-mode-works/swarm-task-states/), [Docker: servicios y actualizaciones](https://docs.docker.com/engine/swarm/services/), [EasyPanel App Service](https://easypanel.io/docs/services/app), [MDN: caché PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching), [MDN: ciclo de Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). Las referencias describen mecanismos; no acreditan la configuración operativa de NexLift.
