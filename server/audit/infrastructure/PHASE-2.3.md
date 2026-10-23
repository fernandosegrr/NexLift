# NexLift V4.0 — Fase 2.3

**Estado: COMPLETADO dentro del alcance de preparación y ensayo autorizado.**
**Baseline: PROVISIONAL, sin autorización de producción.** No se sustituyó el
Dockerfile raíz ni se desplegó el procedimiento alternativo. Las pruebas de
Docker/Linux y del panel siguen pendientes explícitamente.

## 1. Problemas identificados y alcance de la auditoría

| Hallazgo | Evidencia y clasificación | Resultado |
| --- | --- | --- |
| Fallos al consultar sesión devuelven 401 | Confirmado en el `catch` único del middleware original. Dos pruebas fallaron: P1001 devolvía 401 en vez de 503; un error interno devolvía 401 en vez de 500. | Verificación de JWT separada de la consulta; errores clasificados por códigos. |
| Docker usa Node 20 | Confirmado en ambas etapas. La rama está fuera de soporte; no implica por sí sola explotación confirmada. | Node 24.22.0 seleccionado y probado; Docker alternativo. |
| Build usa `npm install` y copia el servidor completo | Confirmado. Instalación menos controlada y dependencias de desarrollo en runtime. | `npm ci`, etapas separadas y poda de devDependencies. |
| No había `.dockerignore` | Confirmado. `.env`, dependencias y archivos locales podían entrar al contexto; no demuestra que se publicaran secretos. | Contexto con lista de entradas admitidas y exclusiones finales. |
| `db push` automático con error ignorado | Confirmado en CMD. Riesgo de DDL en cada reinicio y arranque tras fallo. | CMD real conservado por restricción; ensayo con job independiente y gate obligatorio. |
| Usuario root y shell como padre | Confirmado por ausencia de USER y CMD con shell. Mejoras operativas pendientes de adopción. | Imagen de ensayo no root, comando directo Node y señales/cierre ordenado. |
| Health público consulta usuarios/backups y responde 200 incluso si DB falla | Confirmado. Expone agregados y añade coste; no contenía tokens ni usernames en la respuesta de Fase 2.2. | Liveness mínima, readiness separada y estado del respaldo propio autenticado. |
| Algunos logs de autenticación serializan Error completo | Confirmado en rutas de cuenta. Posible inclusión de detalles de consulta, no evidencia de fuga ya ocurrida. | Eventos estructurados sin Error, headers, payloads ni variables. |

Se revisaron scripts de build/inicio, package.json/locks, Prisma nativo,
OpenSSL, variables de ejemplo (sin leer `.env` real), temporizadores, backups,
probes y documentación EasyPanel. No se consultó su configuración remota. No se
ejecutó `npm audit` ni se presenta esta fase como un escaneo completo de CVE.

## 2. Archivos creados o modificados

Nuevos:

- Raíz: `.dockerignore`, `Dockerfile.rehearsal`, `.nvmrc`, `.node-version`.
- `server/src/middleware/auth.js`.
- `server/src/operations/{errors,telemetry,health,shutdown}.js`.
- `server/deploy/{rehearsal-config.js,rehearsal-http.mjs,rehearsal-migrate.mjs,http-healthcheck.mjs,INFRASTRUCTURE-2.3.md}`.
- `server/test/{infra-auth.test.js,infra-operations.test.js,infra.integration.test.js,run-infrastructure-integration.mjs,verify-node24.mjs,check-infrastructure.mjs}`.
- `server/test/fixtures/infra-process.mjs`.
- `client/src/context/AuthContext.infra.test.jsx`.
- Este informe, `node24-evidence.json` y `client-lint-baseline.json`.

Modificados conservando los cambios previos:

- `.gitignore`, `README.md`, `server/.env.example`, `server/deploy/README.md`.
- `server/package.json`, `client/package.json` y ambos locks: metadatos de engines;
  scripts de verificación sólo en el servidor. No se actualizó ninguna dependencia.
- `server/src/index.js`: usa middleware extraído, IDs, errores genéricos,
  health/readiness, consulta de estado de backup, inicio importable y parada.

El bloque histórico de Fase 2.2 permanece con una nota que remite al ensayo nuevo.
No se modificaron `schema.prisma`, SQL/manifest de baseline, algoritmos de
entrenamiento, herramientas de recuperación ni servicios/formatos de respaldo.
Se preservó el trabajo local de fases anteriores; no se restableció el worktree.

## 3. Node seleccionado y justificación

**Node 24.22.0 LTS**, npm **11.19.1**, OpenSSL del Node probado **3.5.8**,
Windows x64. La distribución oficial se descargó sin instalar/reemplazar el Node
global 22.23.1. El ZIP se contrastó con SHASUMS256 oficial:

```text
f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3
```

El [calendario oficial](https://github.com/nodejs/Release/blob/main/README.md)
y el [índice de distribuciones](https://nodejs.org/dist/index.json) respaldan la
selección de la rama 24 y del patch. Las pruebas reales determinaron la elección;
no apareció una incompatibilidad que justificara retroceder a Node 22. Las
fallas iniciales de las nuevas pruebas se debieron a fixtures y aserciones del
ensayo y fueron corregidas, no a incompatibilidad del runtime.

Los engines de ambos proyectos y los selectores locales fijan la rama 24, mínimo
24.22.0. No se cambió Node instalado globalmente ni configuración de EasyPanel.

## 4. Compatibilidad Prisma comprobada

CLI y Client permanecen **6.19.3**. Los paquetes de esa versión declaran
`engines.node >=18.18`, sin límite superior:
[CLI](https://github.com/prisma/prisma/blob/6.19.3/packages/cli/package.json),
[Client](https://github.com/prisma/prisma/blob/6.19.3/packages/client/package.json).
La [referencia de requisitos](https://www.prisma.io/docs/orm/v6/reference/system-requirements)
mezcla requisitos actuales y anteriores; no se tomó su tabla general como prueba
específica de 6.19.3 con Node 24.

Se probaron instalación limpia, generación offline, carga del engine nativo,
consultas, transacciones commit/rollback, importaciones, concurrencia,
restauraciones, catálogo, checksums y Prisma Migrate sobre PostgreSQL **18.4**
desechable. Después de `npm prune --omit=dev --ignore-scripts`, se repitieron
48 pruebas de integración con sólo dependencias de producción. No se subió Prisma
de major ni se cambió el generador o esquema.

Windows funciona de forma demostrada. El binario Linux/OpenSSL de la imagen
todavía requiere generación y ejecución dentro de Docker; se prepara con la
misma base Debian en build/runtime para evitar copiar engines entre plataformas.

## 5. Docker de ensayo

Ver [Dockerfile.rehearsal](../../../Dockerfile.rehearsal) y
[procedimiento operativo](../../deploy/INFRASTRUCTURE-2.3.md).

- Base `node:24.22.0-bookworm-slim`, digest OCI fijado:
  `sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`.
- Se consultó el registro oficial para comprobar que existe el manifiesto y sus
  variantes Linux amd64/arm64; no se descargaron ni ejecutaron sus capas.
- Etapas de frontend, dependencias/generación Prisma, job, poda y runtime.
- Runtime sin CLI/devDependencies, sin tests, sin secretos y con usuario `node`.
- Job separado con CLI local y sus archivos/imports necesarios.
- SQL/migration_lock incluidos. Código de backups y manifest PWA expresamente
  preservados por las reglas del contexto.
- Comando directo Node, puerto 3001, STOPSIGNAL SIGTERM y healthcheck de readiness.

Los paquetes apt no están fijados por snapshot; el digest de la base y los locks
no garantizan reproducibilidad bit a bit. La imagen liberada deberá conservarse
por digest tras validar paquetes, arquitectura y ejecución Linux.

## 6. Migración y arranque

Flujo alternativo: configuración → job independiente aprobado → conexión y
compatibilidad → HTTP → readiness → parada. El HTTP no migra, no resuelve baseline,
no ignora fallos ni infiere destinos desde `.env`/DATABASE_URL. El job sólo acepta
la URL explícita y opt-in de ensayo; copia schema/SQL a temporal propio antes del
CLI y devuelve fallo sin imprimir credenciales.

Se probaron arranque válido, configuración ausente, esquema sin historial,
default alterado, migración SQL fallida y repetición segura del job. Una migración
fallida conserva su evidencia y bloquea el arranque; no se usó resolve para ocultarla.

EasyPanel requiere configurar explícitamente Dockerfile/target o imagen, puerto,
variables runtime, secuencia del job, probes y gracia de parada. Estas capacidades
están descritas en [App Service](https://easypanel.io/docs/services/app), pero no
fueron comprobadas en un panel real. Mantener rol DDL separado del rol HTTP;
permisos mínimos, catálogo y versiones PG deben probarse en staging.

## 7. Autenticación y conservación offline

El JWT se valida antes de consultar PostgreSQL. Token ausente, inválido, expirado,
revocado, cuenta inexistente o inactiva: **401 genérico**, conservando el contrato
anterior y sin enumeración. No se pierde `tokenVersion`; los JWT históricos sin
esa propiedad sólo funcionan mientras la versión de la cuenta sea cero.

Conexión rechazada/cerrada, timeout, pool agotado o reinicio temporal de DB:
**503 + Retry-After: 5**. Errores inesperados/de consulta, esquema o credenciales
de la aplicación mal configuradas: **500**, nunca credenciales incorrectas del
usuario. Se clasifican códigos estables, incluidas causas y SQLSTATE de raw
queries, sin inspeccionar mensajes secretos.

El frontend ya distinguía 401 de errores temporales. No necesitó cambios de
comportamiento: tres pruebas nuevas ejecutan sus efectos reales de inicialización
y servicios con hooks controlados. 500/503 mantienen token, usuario, borradores y
journal bloqueado; no se envían POST/PUT automáticos. Un 401 real limpia sólo
autenticación, conservando el trabajo offline. No se reclama una prueba en
navegador; se complementa con HTTP real y PostgreSQL detenido en el servidor.

## 8. Resultados exactos

**695 pruebas únicas aprobadas = 641 anteriores + 54 nuevas**, sin fallos,
cancelaciones u omisiones en las suites finales. La evidencia de comandos,
versiones, tiempos y hashes está en [node24-evidence.json](node24-evidence.json).

| Suite | Aprobadas |
| --- | ---: |
| Servidor: lógica/IA | 104 |
| Rutinas: integración | 48 |
| Backups: proveedor simulado | 17 |
| Backups: PostgreSQL | 41 |
| Contrato de importación | 22 |
| Importación: PostgreSQL | 39 |
| Entrenamientos: PostgreSQL | 84 |
| Fixtures históricos previos a Fase 1.5 | 13 |
| Auditoría PostgreSQL | 54 |
| Baseline y recuperación Fase 2.2 | 46 |
| Infraestructura/autenticación nuevas | 37 |
| Infraestructura: proceso/API/PostgreSQL nuevos | 14 |
| Frontend: 173 anteriores + 3 nuevas | 176 |
| **Total único** | **695** |

Las 13 históricas comprueban los fixtures antiguos, no reintroducen defectos en
el código actual. Las 48 pruebas repetidas tras la poda no se cuentan otra vez.

También pasan ambos `npm ci`, generación Prisma, build frontend estándar
(`npm run build`, sin workaround de configLoader) y comprobaciones estáticas
sobre **18 archivos** del alcance: lint de 17 JS/MJS/JSX y sintaxis Node de 17
JS/MJS, incluido index.js. Se verificaron hashes, contexto estático,
enlaces locales y ausencia de cambios en schema/Dockerfile raíz. El build conserva
la advertencia previa por el chunk PDF de **779.10 kB**, superior a 600 kB.

El lint global del cliente se ejecutó adicionalmente: **27 errores y 3 advertencias
sobre 68 archivos examinados**; los hallazgos afectan 17 archivos previos, no modificados por esta
fase. La prueba nueva tiene cero errores/advertencias. Se registran por separado
en [client-lint-baseline.json](client-lint-baseline.json); no se declara que el lint
global haya pasado ni se amplía el alcance para cambiar esas pantallas/algoritmos.

## 9. Pruebas no ejecutadas

- Build/run/inspección de capas y contexto real Docker: CLI ausente; tampoco hay Podman.
- Engine Prisma Linux y bibliotecas del filesystem de imagen, usuario no root,
  permisos/volúmenes, red Docker y arquitectura del VPS.
- Entrega POSIX real de SIGTERM desde Docker/EasyPanel. En Windows, la prueba del
  proceso usa un wrapper **sólo de test** que emite el evento SIGTERM por IPC;
  ejecuta el cierre real y comprueba salida 0, socket libre y datos intactos.
- Healthcheck/proxy/restart/rollback efectivo del orquestador, reinicio del host y roles mínimos.
- Entrega a proveedores reales Web Push/Cloudinary/IA. Se probó cifrado Web Push
  real local; no se enviaron notificaciones ni peticiones a esos proveedores.
- Copia autorizada íntegra de producción y su recuperación en staging.

## 10. Riesgos restantes

La baseline sigue PROVISIONAL. El Dockerfile operativo conserva Node 20 y el
CMD con `db push` que ignora fallos; su reemplazo exige otra autorización tras
validar la copia, recuperación e imagen. Una reversión futura no debe ejecutar
ese CMD antiguo con DDL.

El gate depende del catálogo declarado en PostgreSQL 18.4 y sus permisos. Medir
coste de readiness, timeout del gate frente al probe y comportamiento del proxy.
Los jobs de fondo ya en curso no adquieren checkpoint nuevo al parar. Los logs
de operaciones históricas fuera de autenticación conservan superficies por
revisar; los nuevos logs seguros no representan una redacción universal.

`/api/health` conserva status/timestamp y no tiene consumidores frontend del
antiguo campo agregado backup. Integraciones externas que lo usaran deben pasar
a `/api/backup/status` autenticado. Ningún probe ofrece detalles del usuario.

## 11. Confirmación de aislamiento

No hubo conexiones a producción, escrituras en bases existentes, migraciones
persistentes, acceso a respaldos reales, cambios de schema, historial eliminado,
commits, despliegues ni activación de baseline. Los runners construyen y verifican
clusters nuevos en loopback, con datos sintéticos y URLs propias, y los detienen
antes de eliminar sus rutas temporales comprobadas. No se modificó el Node global.

El verificador final terminó con salida 0 y eliminó su copia temporal. Las dos
copias sintéticas conservadas durante el diagnóstico permanecen fuera del repo:
`%TEMP%/nexlift-node24-verification-E2X3cT` y
`%TEMP%/nexlift-node24-verification-8MDu4W`. La revisión automática rechazó su
eliminación posterior con el motivo «blocked by policy»; no se reintentó. Esto no
dejó clusters PostgreSQL activos. La distribución Node descargada permanece como
herramienta local temporal, sin modificar la instalación global.

Baseline SQL conserva SHA-256:
`47c9542787e5cb64c36b2b8c079e05995ac5f98fe9c7b86b9b8c87747688ea2b`.

## 12. Estado y siguiente autorización

**COMPLETADO** como preparación probada hasta los límites permitidos del entorno.
Esto no significa imagen Docker verificada ni despliegue apto para producción.
Falta validar Docker/Linux, copia autorizada, recuperación, roles y operación real
del panel antes de proponer una activación. No se avanzó a otra fase.
