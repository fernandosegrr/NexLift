# NexLift Coach + hotfix de disponibilidad — release

Actualizado: 2026-10-23. El usuario pidió detener nuevas suites y publicar los cambios actuales mediante commit y push a main. La última matriz completa fue interrumpida expresamente por esa instrucción. Este informe sustituye el estado anterior de acceso bloqueado: EasyPanel ya está autenticado y se obtuvo acceso real al manager Docker.

## Estado al generar este commit

Coach y hotfix están integrados y listos para enviar a main. Publicación efectiva, migración y SHA nuevo del contenedor pendientes de verificar después del push; no se afirma éxito anticipado. El estado productivo anterior fue verificado por contenido, no inferido del remoto: 5c8615ed7006353bf0e1e672eb9bf262b3393dc9, con 820 archivos de checkout y 121 archivos de runtime coincidentes.

## Historial y cambios

Se conservó intacta feat/nexlift-coach (cfbdbcc y 12365e0369330293b1cb61f6cbf66076a0d15f17), en su checkout original. Release independiente basado en main, sin reescritura ni force push.

| Cambio | Commit |
|---|---|
| Integración Coach | 43c0fbb |
| Hotfix original | 2025096d4161eb23e76382bfdbd8e29c7142f621 |
| Integración hotfix | 18452e0b9fe2040a5ae01679bcd186e640398467 |
| SQL original de diagnóstico incluido en checkout | 9534d40 |
| Activación Coach y expansión incremental segura | ffa8c08f029ac6c550d1c3d3241f9918f3477714 |
| Pruebas de SW diferido, aserciones conservadas y push sin navegación | 6db9756, 80b2e88, 7a3be4c |
| Build React productivo | 70d95e5 |
| Resolución de lint frontend | 9a9fa9dd4890e3f452a333d4e03c983f148df005 |
| Runtime sin peers opcionales de desarrollo | f59a0da |
| Enlace explícitamente online en pruebas de errores HTTP/DB | bb90a5a9e344469a0c6eaf41dd07af6df8e8d2c1 |
| Logs stderr incluidos en certificación de cierre Docker | e68844b190d6c4859adfc60ad79945d28642b3a7 |

Se integraron los seis módulos: volumen semanal, recuperación/fatiga, Smart Loading 2.0, estancamientos, tendencias y Coach IA visual. Smart Loading v1 permanece disponible. IA funciona sin proveedor y exige consentimiento explícito para consultas externas; no escribe check-ins ni aplica cargas mediante una pregunta. Se conservan permisos y almacenamiento por usuario. Las nuevas funciones de sincronización offline siguen desactivadas en producción.

Áreas principales: client/public/sw.js, services/api.js y availabilityResume.js, Workout/Coach/Progress, runtime y rutas Coach, Dockerfile y Dockerfile.release, server/deploy/release-preflight.mjs, coach-upgrade.mjs y catálogos. Inventario anterior: integrated-source-files.json. Lint frontend usa excepciones locales explicadas para compatibilidad histórica, sin desactivar globalmente las reglas.

## Disponibilidad: evidencia real

Causa raíz del incidente original: **no confirmada**. No existen timestamps correlacionados del fallo original del iPhone. El indicador gris no demuestra por sí solo un contenedor apagado.

Manager Docker observado entre 22:50 y 23:24Z: postgres_nexlift desired/running 1/1, contenedor 98139c0aff82 saludable, sin reinicios, OOM false, exit 0; inicio 17:39:22Z. Imagen anterior sha256:96563e48fae0fb244f8737046f52abbe0ef025c0db7b605ba8c791135e20faeb. Node 24.22.1 como PID1 con deploy/release-http.mjs, puerto3001 y bind0.0.0.0. Healthcheck real cada30s, timeout8s, startPeriod30s, retries3; no se deshabilitó. Start-first, una réplica, sin límites configurados, ~71MiB de uso, host con ~8GiB disponibles. Cgroup OOM0 y kernel sin entradas OOM consultadas. Logs: 714 entradas, un arranque y 713 HTTP completos, ninguno >=500. Traefik pudo consultar directamente la readiness por la red Docker. Etiquetas antiguas de tareas unhealthy con probes retenidas exit0 no se consideran prueba concluyente del incidente.

Hotfix: navegación SW con no-store, timeout y validación del shell; fallback seguro ante 502/503, fallo de red y HTML ajeno. No cachea errores ni APIs privadas. Recuperación por online/focus/pageshow/visibilidad, acotada y sin recargas automáticas. Conserva IndexedDB, borradores y escrituras pendientes; no repite mutaciones ambiguas. Actualización SW respeta waiting, entrenamiento activo y chunks antiguos. Push enfoca sin navegar. Una página externa del proxy ya cargada no puede ser controlada por React.

## Base productiva, respaldo y recuperación

Origen real: demo, PostgreSQL17.11, tres migraciones completas: 0_init, 202610180001_phase31_operations y 202610220001_phase6_history. Coach pendiente: 202610230001_coach, checksum 068eba7493f7af5c365d9a892d99700e0a9fbfa6a7f3cf12e3c4983808bc2236. No se modificó el SQL original.

Respaldo completo consistente mediante snapshot exportado a las22:53:11.998Z, 94,923bytes,19 entradas TABLE DATA. SHA256 descifrado: a07cff7f0cf6e19b43c1bb4bb5cb307935fb13bde6e7647b5ebdc1124016e098. Archivo fuera del contenedor y del VPS: C:/Users/guerr/.codex/artifacts/nexlift-coach-release-live-20261023-2255/production-full.dump.enc. AES256GCM, clave Windows CurrentUser DPAPI y ACL restringida; conservar identidad y clave. No se incluyen secretos ni dumps en Git. La conexión PostgreSQL existente no admite TLS; no se afirma cifrado de transporte.

Descifrado, hash, TOC y restauración en base nueva verificados:19 tablas, conteos y huellas exactos. Expansión sobre restauración real ensayada: rollback deliberado posterior al DDL, éxito, repetición idempotente y preservación de tablas antiguas/journal. Local PG18.4. Además se ejecutó ensayo Linux Docker REAL con PostgreSQL17.11: bridge en esquema3, expansión4, rollback, Express/Fastify, fallback IA, reinicio y SIGTERM exit0. Resultado final passed=true,23:24:34Z. Evidencia pública: docker-linux-certified.png. Recursos desechables aislados eliminados por propiedad, sin intervenir producción.

En VPS se conservaron imágenes antigua y compatible fuera de contenedores, /var/backups/nexlift-coach-release-20261023-9a9fa9d, archivos pre-coach.tar.gz y coach-compatible.tar.gz, gzip verificado; el segundo se cargó de nuevo con docker image load. Tag compatible certificado: nexlift-coach-certified:optional. No restaurar un dump sobre registros nuevos ni volver al backend5c después de expandir: su gate rechaza esquema4.

Preflight23:25Z: catálogo3 exacto, diagnósticos0,318 entrenamientos,879 series,47 PRs,5 rutinas,128 ejercicios. Cuatro usuarios incluyen una cuenta sintética autorizada creada23:02Z; el respaldo anterior contiene los tres originales. La cuenta de prueba no creó entrenamientos/check-ins. Sus credenciales y sesión se guardan cifradas. Tres cuentas restauradas validaron contratos Coach y fallback en modo read-only, sin proveedor ni cambios de datos.

La expansión aprobada usa coach-upgrade.mjs, identidad DB/major explícita, advisory lock, transacción única, lock_timeout2s y statement_timeout10s. Solo agrega cuatro tablas, seis índices, una función y dos triggers; registra la migración dentro de la misma transacción y verifica huellas intactas. Rechaza drift, historial alterado o expansión parcial. No se ejecutarán reset, force-reset, SQL destructivo ni migraciones ciegas.

## Pruebas y límites

- npm run lint global: aprobado tras las correcciones; release lint14 archivos sin errores ni advertencias.
- TypeScript, generados, builds productivos y límites de bundle: aprobados en las ejecuciones registradas. Grafo de cliente sin Prisma/servidor/secretos.
- Matriz previa:1,578 pruebas únicas aprobadas mediante continuaciones verificadas, excluyendo1,024 repeticiones; no equivale a una sola invocación limpia.
- Reconciliación:1,464 +3 upstream del parser +94 Coach =1,561. Release añade13 disponibilidad y4 activación, total1,578; compatibilidad v4 adicional1/1.
- Último intento completo detenido por instrucción expresa del usuario antes de terminar; sus bloques completados hasta offline-sw terminaron exit0. No se relanzará otra suite completa.
- Un intento anterior encontró navigator.onLine=false en un caso que requería enlace online con HTTP/DB fallidos; se fijó explícitamente esa precondición sin quitar aserciones. Rerun Fastify offline31/31 y exit0.
- Linux Docker y PostgreSQL17.11: aprobado, incluyendo runtime UID1000, sin Prisma CLI ni TypeScript, readiness, reinicio y cierre ordenado.
- Compatibilidad v4, aislamiento, idempotencia, borradores, fallos502/503, suspensión automatizada, SW diferido y entrenamiento activo constan en las evidencias previas. No se simularon resultados productivos.
- iPhone físico y cambios reales LTE/WiFi: no ejecutados. Portabilidad de fixtures históricos con EOL Windows en otro checkout limpio: pendiente.

## Procedimiento real del lanzamiento

1. Fetch origin, verificar ancestro, commit del informe/evidencias y avanzar main mediante merge --ff-only desde worktree separado C:/Users/guerr/.codex/artifacts/nexlift-publish-main. git push origin main sin force.
2. EasyPanel construye main con Dockerfile raíz (equivalente a release), target runtime y arranque node deploy/release-http.mjs. Auto deploy estaba habilitado. Verificar SHA por checkout/runtime, imagen, réplicas1/1, salud y SW exacto.
3. **Bridge antes de migración**: nueva imagen debe atender core con esquema3 y Coach503preparando. No expandir mientras esté el backend antiguo.
4. Revalidar respaldo/restauración reciente y ejecutar el wrapper privado C:/Users/guerr/.codex/artifacts/nexlift-production-expand-coach.mjs, que llama expandCoach y preflight estricto. La instrucción reciente del usuario permite publicar sin nueva suite completa, sin quitar ninguna guarda de DB/backup/bridge.
5. Verificar cuatro migraciones, Coach listo, datos antiguos intactos, sesión sintética, endpoints y UI, SW y logs. No provocar caída de producción ni crear entrenamientos ficticios.
6. Si falla expansión, rollback transaccional conserva esquema3. Tras4, recuperar con imagen compatible certificada o corrección hacia adelante; nunca revertir esquema a ciegas ni sobrescribir datos posteriores.

Los comandos y rutas exactos ejecutados se registrarán en el cierre posterior al despliegue. Estado al momento de este commit: COACH no publicado; HOTFIX no publicado; BASE íntegra en preflight, migración pendiente; EASYPANEL saludable en observación; PRUEBAS parciales aprobadas, suite final interrumpida por usuario; COMMIT PRODUCTIVO anterior verificado5c8615ed7006353bf0e1e672eb9bf262b3393dc9.