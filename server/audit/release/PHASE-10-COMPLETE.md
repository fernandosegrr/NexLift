# NexLift v4.0 — Fase 10: preparación de release

**Implementación de Fase 10: COMPLETADA en desarrollo.**
**Certificación local automatizada: CON LIMITACIONES.**
**Autorización de despliegue: NO AUTORIZADA.**

**npm test: salida 0; 1,464 pruebas únicas aprobadas = 1,441 anteriores + 23 nuevas.**
88 comandos con salida 0; 613 ejecuciones repetidas excluidas del total.
Cierre de matriz: 2026-10-23T04:51:39.438Z, Windows x64, Node 24.22.1/npm 11.19.1.
[Matriz final](matrix-evidence.json), [resultado exterior](npm-test-result.json) y
[conservación](final-checks.json). No equivale a certificación productiva.

## 1. Estado de 10.1–10.4

| Bloque | Implementación preparada |
| --- | --- |
| 10.1 | Auditoría, Dockerfile.release multistage, artefactos ESM/CJS, selección explícita, config/gates y propuesta EasyPanel. Docker/Linux no disponibles. |
| 10.2 | Preflight de sólo lectura actual/legacy; job separado exclusivamente desechable; cadena desde cero/upgrade; portable/dump integral, recuperación y fallos sintéticos. |
| 10.3 | Scripts de release, comparación de artefactos, benchmark SQL/HTTP/Edge, seguridad y workflow Linux manual sin publicación; matriz integral nueva aprobada, con gates externos explícitos. |
| 10.4 | Runbook, checklist, criterios de cancelación, recuperación diferenciada y Express compatible. No se ejecuta ninguna activación. |

## 2. Repositorio y protección recibida

El cwd inicial `C:/Users/guerr/OneDrive/Documents/Documentos/ChatGPT/NexLift` está
vacío. Git y los informes identifican el repositorio real en
`C:/Users/guerr/OneDrive/Escritorio/NexLift`. No había AGENTS.md aplicable.
Se inspeccionaron Git/status y cambios sin commit antes de editar. Se revisaron
CLAUDE, cierres de Fases 5–9, schema/SQL, infraestructura 2.3/2.4, Dockerfiles,
entrypoints, scripts y checklist. Las decisiones v4 prevalecen sobre db push v3.

Respaldo único antes de editar: **848 archivos públicos verificados por SHA-256**,
manifest, estado Git, HEAD y patch, fuera de Temp:
`C:/Users/guerr/.codex/artifacts/nexlift-phase10-received-4326dd32-6bbd-4128-8bb2-881502686d71`.
Se excluyeron env/secretos/credenciales/dumps. No se eliminan directorios protegidos
ni copias recibidas. Conservación final: **840/848 archivos idénticos, ocho cambios revisados y ninguno ausente**.
Los 626 hashes de fuente de la matriz coinciden; también los artefactos de
la última compilación productiva coinciden con el manifest reproducido. Sin staged,
HEAD intacto y git diff --check salida 0. Los ocho cambios recibidos son checklist,
CLAUDE, .dockerignore, pins Node, package.json, verificador e assert de entorno;
cliente/backend de negocio/shared/Prisma y los tres locks recibidos están intactos.

## 3. Auditoría de infraestructura y artefactos

El Dockerfile raíz v3 conserva Node20/Alpine, npm install y CMD con db push que
oculta el fallo y continúa HTTP. **Queda prohibido usarlo para v4**; no se ejecutó
ni se cambió el servicio que pudiera utilizarlo. Los Dockerfile.rehearsal,
.staging y .fastify-rehearsal son ensayos históricos, no certificados en Linux.

Entradas recibidas: server/src/index.js (Express operativo),
server/src/entrypoints/fastify.mjs (Fastify restringido a ensayo).
`npm start --workspace nexlift-server` conserva Express. La nueva entrada
`server/deploy/release-http.mjs` construye exactamente un transporte/runtime,
valida config/artefactos/conexión/catálogos/historial antes de escuchar y nunca
importa el job de migración. Tiene manejo de SIGTERM/SIGINT mediante el lifecycle
ya probado: pausa entrega, drena HTTP, detiene jobs y desconecta Prisma.

Builds: shared → TypeScript/backend generado → Vite; Prisma generate explícito
desde schema temporal, sin `.env` ni SQL. Vite produce client/dist con SPA,
assets, manifest, iconos y sw.js. Fachadas .cjs y Fastify ESM emitido se incluyen;
no se depende de strip-types/tsx/ts-node en runtime. @nexlift/shared queda integrado
en las fachadas de distribución. Dependencias HTTP/Prisma/proveedores de server
se conservan; TypeScript, Vite y Prisma CLI quedan fuera del target runtime.

Jobs: recordatorios persistidos al arranque, reactivación cada 30 min,
creatina 15 min, evaluación adaptativa 24 h y revisión de backup 30 min. Un comando
selecciona una sola responsabilidad; configuración exige una réplica y runbook
stop-first. No se afirma rate limiting distribuido ni entrega exactly-once.

## 4. Docker, Linux, OpenSSL y Node

**Docker/Linux/OpenSSL/CPU/EasyPanel: NO CERTIFICADOS.** No hay Docker/Podman CLI;
WSL no está instalado. No se instaló Docker ni se contactó un daemon remoto/CI.
No se construyó ni ejecutó una imagen. El workflow no se ejecutó en GitHub Actions.

Dockerfile.release: builder y runner separados, npm ci/locks nested, generación
nativa Prisma 6.19.3, build shared/backend/frontend, target migration-job separado,
prune --omit=dev, USER node, puerto 3001, HEALTHCHECK readiness y STOPSIGNAL SIGTERM.
Contexto deny-by-default, sin .env/archives/keys/tests. Los tests estáticos
comprueban las inclusiones nuevas, especialmente client/tsconfig y catálogo actual.

Base elegida: Debian Bookworm slim/glibc/OpenSSL3; builder/runner comparten digest
y arquitectura. Prisma usa binaryTarget native dentro del builder; schema recibido
no se cambia. amd64 esperado debian-openssl-3.0.x; arm64 necesita ensayo propio.
[Requisitos oficiales Prisma6](https://docs.prisma.io/docs/orm/v6/reference/system-requirements).
No se sustituye distribución para adelgazar la imagen. Apt no está congelado:
no se certifica filesystem bit a bit; conservar digest final y SBOM/escaneo.

Se identificó el [parche de seguridad Node 24.22.1 del 21 de octubre](https://nodejs.org/en/blog/release/v24.22.1)
y se fijó en la imagen nueva, .node-version/.nvmrc y CI. Runtime Windows aislado
descargado del sitio oficial y SHA-256 comparado con SHASUMS256; Node global intacto.
Prisma/paquetes npm no cambiaron. Un único assert histórico de **entorno** en infra
acepta 24.22.1 además de24.22.0; conserva todos los asserts de persistencia/negocio.

Digests públicos de manifiestos consultados en Docker Hub:

- Node 24.22.1-bookworm-slim: sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205.
- PostgreSQL18.4-bookworm del arnés: sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382.

Consultar metadatos no equivale a ejecutar sus capas. `test:release:docker` queda
preparado: red interna, PostgreSQL nuevo sin volumen/puerto externo, migración
separada, Express/Fastify secuenciales, SPA/SW/readiness, restart, ausencia de devDeps,
usuario no root y salida0 ante Docker stop/SIGTERM. No publica artefactos.

## 5. EasyPanel propuesto

[Configuración completa](../../../docs/RELEASE-V4-EASYPANEL.md), sin tocar el panel:
puerto3001, HTTPS/mismo origen, CIDR reales del proxy, secretos sólo runtime,
PostgreSQL privado y volumen persistente propio, roles app/migrador separados,
una réplica/stop-first, recursos iniciales propuestos, restart, rotación de logs,
gracia≥15s y probes. Retirada real de tráfico por healthchecks debe probarse.

Config obligatoria: NODE_ENV=production, modo release/rehearsal explícito,
NEXLIFT_HTTP_TRANSPORT, NEXLIFT_RELEASE_DATABASE_URL, JWT_SECRET≥32 y
NEXLIFT_REPLICAS=1. Valores inválidos fallan con nombre de campo y sin secretos.
No fallback a DATABASE_URL/.env. Flags nuevas offline/cookie/resolve/prune
rechazadas si intentan activarse; modo production las mantiene apagadas.
Proveedores opcionales ausentes conservan degradación sin detener entrenamientos.
Rehearsal bloquea proveedores externos y exige identidad desechable.

## 6. Baseline y migraciones

**Baseline PROVISIONAL; no validada contra producción.** 0_init, SQL3.1 y Fase6
conservan sus bytes. Guards de SQL3.1/6 bloquean deliberadamente bases persistentes;
esto es un gate real, no una configuración pendiente que se deba saltar.

release:preflight legacy/current usa transacciones read-only, timeout y lock_timeout,
compara tablas/columnas/tipos/nulabilidad/defaults/índices/FK/constraints/triggers,
historial/checksums y journal idempotente. Reporta conteos de los17 modelos,
propietarios históricos ambiguos, sugerencias/reminders ajenos, sets huérfanos,
colisiones setNumber y weekdays inválidos; no imprime filas/logs de migración.
El schema gate del runtime incluye también el catálogo de nexlift_operations.

Ensayo: migrate deploy real desde cero, repetición sin cambios y upgrade sintético
con17modelos, IDs, scalar legacy y conteos conservados. Esquemas inesperados,
checksum alterado, índice faltante y datos ambiguos rechazan preflight sin reparar.
Los ensayos históricos incluyen transacción de migración interrumpida con rollback
DDL/DML y journal fallido conservado. No se reescribe ni elimina migración alguna.

Futuro: copia real autorizada, comparación exhaustiva, backup/restore, revisión del
paquete de adopción de Prisma Migrate y aprobación posterior. `resolve --applied`
modifica historial; nunca es preflight ni está autorizado aquí. No hay comando
productivo seguro disponible con los guards actuales. No usar db push/migrate dev
ni marcar una base persistente como desechable. Runbook cancela en ese punto.

## 7. Backups y recuperación

Dos contratos separados, ensayados con datos sintéticos:

- **Portable por usuario**: checksum/validación de propietario, rutinas/ejercicios,
  sesiones/series/PR, medidas/configuración y relaciones declaradas por backupv5;
  restaura a otra cuenta sin robar datos ni credenciales. No contiene journal de
  servidor, PendingReminder, suscripciones, hashes de autenticación ni `_prisma_migrations`.
- **PostgreSQL integral**: dump custom de toda DB; schema/datos/índices/FK/constraints,
  credenciales, push, PendingReminder, migraciones y comprobantes idempotentes.
  SHA-256 de archivo, fingerprints y conteos por entidad, historial y journal;
  restore transaccional a base vacía con comprobaciones antes de COMMIT.

Prueba nueva: registrar operación, dump, cambiar deliberadamente un peso, restaurar
en otra base vacía y comparar todas las filas originales/PR/recibos/jobs. Replay
devuelve200 sin duplicado; otra cuenta conserva aislamiento. NexLift recuperado
arranca, lee estadísticas y acepta escritura real HTTP de Atajo con RIR compatible.

Fallos nuevos: archive corrupto, manifiesto de restore incompleto y schema
incompatible rechazan y dejan destino sin tablas parciales; fallo real ENOTDIR
impide certificar backup. ENOSPC se simula en el control de capacidad antes de
escribir, sin llenar el disco del usuario. PostgreSQL caído se cubre además con
stop/start real en los31offline históricos; nueva simulación P1001 rechaza preflight.
Simulador no equivale a corte eléctrico/disco físico lleno ni restore productivo.

release-recovery agrega precheck de espacio y requiere URL/directorio absoluto y
ack sensible. El operador debe medir también el disco remoto de PostgreSQL.
Dump con salida0 nunca se declara restaurable sin ensayo posterior.
No incluye roles de clúster, configuración VPS, medios Cloudinary/Catbox ni estado
local Dexie/localStorage/borradores. Medios externos y PITR/WAL tienen gates propios.

## 8. Recuperación y autorización

[Runbook ejecutable](../../../docs/RELEASE-V4-RUNBOOK.md): casos antes de migrar,
migración parcial, backend/Fastify/frontend/SW, offline pendiente, Push, caídaDB y
escrituras posteriores. Express se recupera desde **la misma imagen/revisión
compatible con el schema actual**, no desde cualquier v3. Un cambio de transporte
no cambia DB/contratos ni ejecuta dos procesos. Fastify exige selección explícita
y segunda confirmación de configuración, y sigue sin activación productiva.

Primero preservar nuevos registros y tomar snapshot del estado actual. Restore de
copia anterior después de escrituras reales puede perderlas: requiere reconciliar
y aprobación expresa de consecuencias; no es rollback automático sin pérdida.
RPO≤24h/RTO≤60min son **propuestas pendientes de aprobación** para dump diario;
RPO≤5min requiere PITR/WAL todavía no implementado. Tiempos sintéticos son sólo
mediciones de ensayo pequeño, no SLA ni RTO completo de operación.

## 9. PWA, matriz funcional y garantías

[Matriz de flujos y escenarios A–J](LAUNCH-MATRIX.md). Se reutiliza la cobertura
real de Fases 5–9 de auth, rutinas, ejercicios, series/unilaterales, RIR/RPE,
SmartLoading, historial/PR, mesociclos, PDF/cuerpo/hábitos/creatina, recordatorios,
Atajos, import/backup, Query, Dexie, conflictos y cuentas.

Los 31 offline históricos se vuelven a ejecutar en Express legacy, schema actual y
Fastify. Las repeticiones no cuentan como nuevas. Cubre COMMIT/respuesta perdida,
reinicio browser/backend/PostgreSQL, dos procesos, conflicto409, datos originales,
upgrade físico IDB20→30 y SW real con pendiente. Se conserva el protocolo y hash.
No borra operaciones/borradores para compatibilidad. Producción sigue con sync
nueva deshabilitada. No hay soporte universal de clientes arbitrariamente antiguos.

Un bundle productivo anterior exacto, retención de sus assets hash, teclas todavía
no persistidas y reinicio físico/Safari/iPhone requieren ensayo autorizado aparte.
El fixture antiguo de frontend cambia IDB/flags sobre fuentes controladas; no
representa cada PWA v3 desplegada. Los dispositivos físicos no se utilizaron.

La negociación HTTP real de producción devuelve enabled=false y no anuncia
resoluciones: [smoke suplementario](capabilities-supplement.json), ambos transportes,
puerto SQL inyectado, sin base real, sin sumar pruebas únicas. Las flags son de
cliente/capacidades; **no son un interruptor que elimina los POST autenticados
existentes**. El sondeo de la nueva suite a /api/operations es de ruta desconocida,
no demuestra cierre de /api/v1/workout-operations. Los contratos conservan esos
endpoints y la sincronización automática productiva no se activa.

## 10. Rendimiento y límites

Mediciones nuevas en [integración](integration-evidence.json), [HTTP comparable](phase7-evidence.json),
[historial extenso](phase6-evidence.json), [offline](offline-integration-evidence.json),
[artefactos](artifacts.json) y [Edge](browser-performance.json). Unidades ms salvo indicación.

| Muestra sintética | p50 / p95 Express | p50 / p95 Fastify |
| --- | ---: | ---: |
| Health, 100 muestras después de warmup | 1.336 / 2.317 | 1.208 / 1.912 |
| Auth/me con Prisma, 100 muestras | 3.975 / 5.630 | 3.811 / 4.991 |
| Overview, 40 solicitudes en lotes de 8 | 28.425 / 51.033 | 27.238 / 39.425 |

- Arranque del entrypoint de release dentro del proceso de ensayo ya cargado:
  145.309 ms Express / 149.017 ms Fastify, no cold boot del contenedor.
- Memoria en procesos independientes con DB fake y 200 health warmups:
  RSS 108,572,672 B Express / 120,819,712 B Fastify; no memoria de PostgreSQL.
- Commit de operación por servicio/Prisma: p50 9.997 / p95 13.021; replay de
  respuesta perdida: 2.469 / 3.728, 20 muestras cada uno, cero errores/duplicados.
- Dump integral pequeño 299.100 ms y restore verificado 560.019 ms.
  No son RTO productivo ni una prueba de tamaño real.
- 2,004 sesiones/12,005 series: devolver 2,000 sesiones en 3 consultas, 212.694 ms;
  reconstrucción PR 187.976 ms. Rutina grande conserva 2,104 logs/12,605 sets
  después de editar (394.165 ms) y eliminar planificación (9.880 ms).
- Sync Edge/SQL de 10/100/1,000/5,000 operaciones: 225.3/2,165.4/19,286.5/102,586.5 ms;
  respectivamente 21/201/2,001/10,001 solicitudes y cero POST redundantes.
  Recuperación IndexedDB de 5,000: 111.7 ms; estos lotes no son p95 por operación.
- Edge, tres documentos frescos, caché browser deshabilitada y compilador Vite
  calentándose: dashboard visible p50 546.9 ms, p95 empírico máximo 4,059.7 ms;
  recursos 70/68/68, una lectura home por documento. FCP null/496/420 ms; no
  inventar el valor ausente. No mide servidor productivo ni teléfono físico.
- Entrada productiva: 247,479 B raw / **79,128 B gzip**, presupuesto 110,000 B.
  Dos builds reproducen exactamente los bytes y coinciden con los archivos
  productivos servidos; 47 artefactos runtime comprobados, ESM/CJS y SW incluidos.
  HTML/JS/CSS generados no incluyen secretos o módulos de servidor en su grafo.
No hay Lighthouse inventado ni mediciones de iPhone. Edge mide DOM React visible,
con Vite de desarrollo y HTTP sintético; Las muestras de FCP no disponibles quedan null. HTTP/SQL
usa muestras comparables, warmup y concurrencia; memoria de procesos compartidos
no se atribuye exclusivamente a un framework. Historial extenso y sync masiva
mantienen sus mediciones sin introducir microoptimizaciones deportivas.

## 11. Seguridad, scripts y CI

Auditoría Fase9 reutilizada; matriz repite JWT/autorización/cuentas/revocación,
límites/CORS/CIDR/headers, logs redactados, push protegido, backups y errores.
No se repite pentest externo. Ninguna llamada a proveedores reales.

Npm audit nuevo: **salida1**,20 hallazgos (12altos/8moderados/0críticos);
omit=dev:13 (9altos/4moderados/0críticos), mismos totales Fase9. No se declaran
falsos positivos ni todos explotables; conservar revisión de alcance de Fase9.
Node recibe parche de seguridad aislado; sin npm audit fix --force ni cambio
de paquetes/locks. Bearer anual/pregunta legacy/CSP gradual/rate limiting local
siguen como riesgos conocidos.

Scripts nuevos reales: test:release, test:release:integration,
test:release:browser, test:release:docker, verify:release, lint:release,
release:preflight, release:start, release:migrate:disposable.
Workflow .github/workflows/release-verification.yml: trigger manual, permisos
contents:read, actions fijadas por SHA, build/tipos/contratos/artefactos/Docker
aislado, sin upload/push/deploy/secrets productivos. YAML parseado localmente;
**NO ejecutado por GitHub Actions**. No sustituye la matriz Windows/Edge.

## 12. Certificación final integral

**npm test: salida 0**, 88/88 comandos salida 0, **1,464 únicas**,
613 ejecuciones repetidas excluidas. Suma de tiempos de comandos 1,829,169 ms
(30 min 29.169 s), sin contar toda la copia/preparación. Referencia 1,441 +
23 nuevas: 9 config/imagen/capacidad, 13 PostgreSQL/HTTP/recovery y 1 Edge.
No se suman bucles, checkpoints, smokes suplementarios ni intentos fallidos.

| Verificación final | Resultado |
| --- | --- |
| Express/Fastify, JWT, permisos, SQL y jobs | Aprobados; 31 equivalencias HTTP, 34 nativas y 23 de seguridad SQL/procesos. |
| PostgreSQL desechable/migraciones/recovery | Cadena actual y anterior; 54 casos de persistencia y 13 nuevos de release, todos aprobados. |
| Offline/IndexedDB/Edge/PWA | 31/31 en esquema anterior, actual y Fastify; Query/React/SW y privacidad aprobados. Repeticiones fuera del total. |
| Entrenamiento/PR/Atajos/PDF/fechas | Todos los bloques históricos aprobados, sin retirar aserciones deportivas. |
| Shared/backend/frontend/ESM/CJS | Builds, strict, check:generated y check:bundle aprobados. |
| Instalaciones | npm ci raíz/client/server; standalone build, CommonJS/motor y smokes tras prune aprobados. |
| Artefactos productivos | Bytes reproducidos dos veces y comparados con disco; sin drift posterior. |
| Lint nuevo/TS/tooling/backend | Aprobado sin errores ni advertencias. Global con deuda, comparación sin regresión. |
| Docker/Linux/CI/Safari físico | No ejecutados; no certificados. |

[Intentos](development-checks.json): el primero terminó salida 1 en lint de
un arnés por un comentario añadido al ampliar la versión Node, que ocultó
accidentalmente el assert contiguo de Prisma. Se retiró el comentario y el assert
original quedó intacto. Segundo intento cancelado durante preparación pura, antes
de bases, para exigir build productivo/comparación de bytes de disco. Sus copias
y progreso se conservan en attempts/; ninguno es certificación. La tercera corrida
B201jV completa corresponde al código definitivo anterior y terminó salida 0.
No se eliminan directorios protegidos para obtener este resultado.
Lint global ejecutado: **salida1,19errores/2advertencias,0hallazgos nuevos** por
firma y multiplicidad frente a Fase9. Lint dirigido nuevo sin errores/advertencias.
No se presenta lint global como verde.

## 13. Gates y riesgos pendientes

| Severidad | Gate / riesgo |
| --- | --- |
| Bloqueante | Autorización humana de despliegue ausente; debe permanecer NO AUTORIZADA. |
| Alta | Baseline real sin validar y SQL provisional bloqueando persistentes; requiere adopción revisada. |
| Alta | Imagen Linux/CPU/OpenSSL/Prisma y SIGTERM de contenedor sin ejecutar; completar arnés en runtime autorizado. |
| Alta | Backup y recuperación de destino real no ensayados; PITR/WAL/retención externa pendientes. |
| Alta | Dependencias con avisos conocidos y políticas de sesión/recuperación heredadas; revisar alcanzabilidad/mitigación antes de lanzamiento. |
| Media/alta según uso | PWA anterior exacta/assets, Safari/iOS físico y entradas aún no persistidas sin ensayo; no autorizar actualización universal. |
| Media | EasyPanel/CIDR/TLS/roles/retirada de tráfico/recursos sin ensayo; una réplica/stop-first obligatorios. |
| Media | Lint histórico19/2, bundle PDF grande y restauración integral que usa RAM para archive/SQL; dimensionar con datos representativos. |
| Media | Push significa aceptación simulada, no entrega; caída después de aceptación antes del commit puede repetir aviso. |

## 14. Checklist, Fase11 y producción

Checklist ejecutable antes/durante/después y criterios de cancelar en el runbook.
Conservar revisión/imagen compatible, secret review, baseline, backup/restore,
schema/API/cliente anterior, mantenimiento, alertas y aprobación. Durante futuro
release: confirmar destino, migrar por separado, preflight, readiness/auth/historia,
jobs/SPA/SW; escrituras sintéticas sólo en ensayo aislado autorizado. Después:
integridad, logs sin secretos, duplicaciones, notificaciones, disponibilidad,
sync/incidencias y decisión de continuar o recuperar.

Fase11 **NO iniciada**, Coach **NO implementado**. Se entrega infraestructura y
evidencia para una decisión posterior; no altera algoritmos deportivos, RIR/RPE,
requestHash, protocolo, historial o pendientes. Producción/EasyPanel no accedidos;
sin credenciales operativas, DDL sobre bases existentes, commits, remotos,
publicaciones, despliegues ni activación Fastify/offline. Producción intacta.
