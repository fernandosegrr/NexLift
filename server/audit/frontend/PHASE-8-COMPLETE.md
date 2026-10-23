# NexLift v4.0 — Fase 8: frontend y estado remoto

Trabajo local: 22/10/2026, Windows x64. Repositorio real:
`C:/Users/guerr/OneDrive/Escritorio/NexLift`; el cwd recibido estaba vacío.

**Fase 8.1–8.5 completada y certificada en desarrollo. `npm test`: salida 0.**
La evidencia histórica de Fase 7 permanece separada. [Diagnósticos y correcciones](development-checks.json): se conservaron fallos de comparadores históricos, un import JSX y la primera instalación SW, además de una instalación cancelada antes de arrancar bases. Ninguno de esos intentos se certifica. Sin producción, commits,
despliegues ni cambios de flags productivas. Baseline **PROVISIONAL**.

## 1. Estado de 8.1–8.5

| Bloque | Resultado |
| --- | --- |
| 8.1 Arquitectura | Inspección dirigida de páginas, Auth, API, formularios, persistencia y SW; extracciones funcionales, conservando los dominios deportivos y el motor offline. |
| 8.2 Estado remoto | Query v5 integrado en vistas reales y verificación de perfil. RAM por cuenta y generación; invalidación posterior a comprobantes; sin otra cola. |
| 8.3 TypeScript | Componentes de registro/edición/RIR/conflictos, temporizador, foco, conexión, estado remoto y decodificadores strict. JSX restante convive con TSX. |
| 8.4 Móvil/PWA | Objetivos táctiles, etiquetas del editor, teclado/foco en diálogos, conexión explícita y datos remotos con estado. Bundles medidos; primera instalación y actualización SW verificadas. |
| 8.5 Certificación | Matriz final nueva aprobada: 78 comandos, 1,381 pruebas únicas, sin fallos. |

## 2. Arquitectura y alcance

Antes, Workout concentraba 2,181 líneas físicas: JSX de series/RIR, descanso,
historial, recomendaciones, persistencia y coordinación del entrenamiento.
EditSession tenía 395 líneas, Dashboard 686 y Progress 1,355. Varias vistas
repetían efectos HTTP y estados loading/error sin caché remota compartida.
El Dashboard tenía además una caché en sessionStorage; ya no la consume.

Ahora Workout tiene 1,782 líneas, EditSession 294, Dashboard 599 y Progress 1,294.
No se presenta la reducción de líneas como una medición de velocidad.
Se conservan pages, services, storage, domain, context y componentes con una
responsabilidad clara. Las nuevas fronteras son:

```text
client/src/
  app/remote.ts                cliente Query, claves, scopes, guardas y perfil
  app/useRemoteRead.ts         consultas de las vistas autenticadas
  app/RemoteProvider.jsx      proveedor y observación de commits ya verificados
  features/remoteViews.ts     validación unknown de los bundles seleccionados
  features/workouts/          SetCard, SessionSetRow, RirDialog, useRestTimer
  features/offline/           ConflictComparison, ConnectionStatus
  features/progress/          preferencia de ejercicio aislada por cuenta
  app/serviceWorkerLifecycle.ts  primera instalación, assets y actualizaciones
  hooks/useDialogFocus.ts     foco inicial, Tab, Escape y devolución del foco
  components/ui/RemoteStatus  carga/error/antigüedad de lecturas confirmadas
```

Las páginas conservan navegación, formularios y coordinación; la presentación
extraída tiene props/callbacks/eventos explícitos. Persistencia y operaciones no
se movieron por estética. No hay Redux, microfrontends, segunda biblioteca UI
ni reestructuración adicional del backend.

## 3. Componentes migrados y comportamiento

TSX nuevos: **SetCard, SessionSetRow, RirDialog, ConflictComparison,
ConnectionStatus y RemoteStatus**. Hooks y módulos de frontera son TypeScript
strict; Portal.d.ts y AuthContext.d.ts describen los puertos JS reales.
No se usan any ni casts arbitrarios para aceptar respuestas externas.

SetCard conserva la edición bilateral/unilateral, RIR, estado completo, delta,
sugerencia y distintivo PR. La comparación manual anterior omitía callbacks;
ahora memo usa la comparación normal de React y reconoce acciones nuevas.
La puntuación anterior se calcula en el padre con el helper recibido.
SessionSetRow mantiene IDs y campos; el padre conserva la serialización
RIR→RPE, datos incompletos, borrador y escritura. El temporizador mantiene su
timestamp absoluto, reanudación/foco y limpieza. El historial distingue cada
solicitud con un Symbol para no aplicar resultados obsoletos del mismo ejercicio.

Smart Loading, PR, calendario, RIR/RPE, volumen y algoritmos shared no se
reescribieron. Las caracterizaciones numéricas y el recorrido Edge de entrenamiento
siguen activos. Los antiguos tests de igualdad de TODO Workout/EditSession se adaptaron a la
extracción autorizada: mantienen cuerpos deportivos/persistencia exactos, llamadas RIR/RPE originales en su orden, goldens,
pruebas de integración y el navegador real; no se retiraron casos ni fórmulas.

## 4. TanStack Query y aislamiento

Versión fijada **5.104.5**, peer React `^18 || ^19`, comprobada con el registro
npm y la [documentación oficial](https://tanstack.com/query/latest/docs/framework/react/installation).
Sólo se añadieron react-query y su query-core; los grafos de dependencias
anteriores se preservaron y se comprueban con check-project.

Dominios activos: perfil autenticado; Inicio; lista/detalle de rutinas y sus
bloques/mesociclos; Progreso y series temporales por ejercicio; objetivos y su
historial confirmado; registros corporales y fotos confirmadas. El catálogo de
Progreso viaja en su bundle. Los demás selectores y escrituras conservan su API.

Claves: `[nexlift, generación, ownerId, dominio, ...filtros]`. Incluyen IDs,
límites y fecha civil cuando afectan al servidor. No contienen JWT. La preferencia de ejercicio de Progreso también está aislada por cuenta; la clave legacy sin propietario permanece conservada y no se asigna automáticamente. Logout,
cambio de cuenta y rotación de token cancelan y limpian RAM. Cada lector comprueba
scope/token/abort antes y después de esperar, incluso si el transporte ignora
cancelación. Una llamada antigua al perfil no puede reiniciar el scope vigente.

staleTime 30 s, gcTime 5 min, revalidación al recuperar foco/conexión y un solo
reintento de red/502/503/504. Sin reintentos para 401/403/409/429, incompatibilidad
o cambio de sesión. Perfil usa staleTime 0, networkMode always y cero reintentos (la inicialización debe terminar offline para abrir los borradores): verificar la credencial sigue
requiriendo HTTP; una entrada cacheada no reanuda auth. GET conserva status y
Retry-After. 503 no cierra sesión. Las lecturas autenticadas y de perfil usan además cache: no-store en HTTP; la privacidad no depende de las heurísticas de caché del navegador. No hay persistencia Query ni optimistic writes.

## 5. Dexie, comprobantes y conflictos

El puente observa los estados confirmed/synced con comprobante, que sólo escriben
los verificadores existentes. Después invalida vistas; no declara operaciones
confirmadas, no crea UUIDs ni envía escrituras. Estado pending, 409, incompatible
o simple reconexión no constituye un commit. Las escrituras HTTP foreground
confirmadas invalidan lecturas; los formularios pendientes no se hidratan desde
estos refetches. Sin vistas remotas observadas ni datos por invalidar, el puente
evita volver a leer todo el journal en cada notificación.

Dexie sigue controlando borradores, journal, dependencias, conflictos, propuestas,
versiones y recibos. El código de Dexie, offlineSync, operationSync, hashes, esquema y
migraciones permanecen intactos. La tabla TSX sólo presenta diferencias: selección,
preview, confirmación y exportación siguen en el panel y motor anteriores.
Nueva sincronización y resolución continúan deshabilitadas en producción.

## 6. Interfaz móvil y PWA

Editor de sesión con nombres accesibles para pesos/reps/lados y eliminación;
controles RIR/sugerencia de al menos 44 px en SetCard. Diálogos RIR y eliminación
de rutina con foco inicial, ciclo Tab/Shift-Tab, Escape y devolución del foco;
RIR declara aria-modal y mantiene Portal. Avisos visibles de conexión y de
consulta/error/antigüedad remota. No se aplican sugerencias sin acción del usuario.

El registro en main.jsx usa serviceWorkerLifecycle.ts: la primera toma de control no recarga la página; las actualizaciones posteriores conservan una recarga única. Esto evita abandonar una lease durante el arranque, reproducido dos veces con Fastify y dos procesos Edge (pending, cero intentos, lease vigente sin Web Lock). La corrección pasó las 31 offline completas sobre Fastify sin cambiar el motor ni sus tiempos.

SW conserva scope y políticas API/navegación; su cambio es CACHE_PUBLIC_ASSETS, limitado a JS/CSS e iconos públicos del mismo origen, sin credenciales/query/hash. Omite cookies, rechaza HTML/redirecciones y conserva assets iniciales y peticiones iniciadas antes del claim que terminan después. No observa tráfico API posterior y desconecta el observador de recursos al salir de la página. La prueba de arranque en frío incluye el logo y bloquea TODO el origen, no sólo API.

Se conservan: API/Authorization sólo red, shell/assets separados,
sin borrar IndexedDB ni convertir reconexión en confirmación. El build conserva
lazy pages, gráficas y PDF separados. No hubo rediseño de identidad visual. Las comprobaciones móviles usan viewports de 320 y 390 px en Edge de escritorio; no representan un teléfono físico.

## 7. Rendimiento medido

[Comparación reproducible](performance.json): mismo Vite instalado, defaults de
producción, envFile=false, write=false y fuentes recibidas verificadas por SHA-256.

| Chunk | Antes raw / gzip | Después raw / gzip |
| --- | ---: | ---: |
| Entrada | 214,733 / 69,396 B | 244,904 / 78,462 B |
| Dashboard | 18,481 / 5,865 B | 17,336 / 5,619 B |
| Workout | 51,468 / 14,089 B | 51,445 / 14,215 B |
| Progress | 41,815 / 11,769 B | 41,709 / 11,793 B |

La entrada crece 9,066 B gzip por Query y las nuevas fronteras. No se afirma
mejora de carga inicial. Builds secuenciales locales: 8,735 / 7,690 ms;
no demuestran por sí solos una mejora estadística de tiempo de compilación.
Edge comprueba que Inicio→Rutinas→Inicio mantiene **una** consulta home durante
la frescura, y que invalidar sí genera otra. Los tests comprueban deduplicación
concurrente. No se afirma un porcentaje de mejora de latencia productiva ni de
renders; no se memoizan fórmulas con riesgo de quedar obsoletas.

## 8. Pruebas y certificación

Pruebas nuevas aprobadas: 23 unitarias Query/aislamiento/errores/validadores y
3 casos Node, dos de ellos Edge real con App/navegación/caché/cuentas/respuesta
tardía/editor/diálogo. Las aserciones dentro del caso no cuentan por separado.
Total certificado: **1,355 históricas + 26 nuevas = 1,381 únicas**.

Pruebas específicas ejecutadas: cliente 227/227, Query/PWA 23/23, navegador/guardas
3/3, Smart Loading 25/25 y análisis/Progress/PDF 30/30. Reruns no suman casos.
Typechecks strict de los tres workspaces, check:generated y lint TS/tooling pasan.
Lint global de desarrollo: **23 errores / 2 advertencias** frente a 27/3; comparación
por archivo/regla/primera línea y multiplicidad: cero hallazgos nuevos.
No se declara verde el lint global.

**Resultado exacto de `npm test`: salida 0; 1,381 únicas aprobadas.**
[Matriz final](matrix-evidence.json), cerrada el 22/10/2026 a las 19:34:30 UTC:
78 comandos con exit 0, Node 24.22.0 y npm 11.19.1. Las 613 ejecuciones repetidas
no incrementan el total. Suma de tiempos de comandos: 2,049,652 ms (34 min 10 s);
no incluye toda la preparación/copia. Fuentes congeladas: 587 hashes coincidentes.

| Verificación final | Resultado y evidencia |
| --- | --- |
| React/Edge/IndexedDB/PostgreSQL desechable | Formularios reales, reinicios, dos procesos Edge, RIR/unilaterales, borradores, comprobantes, conflictos, resolución, exportación y actualización SW; [31 offline sobre Express](offline-integration-evidence.json). |
| Modelo actual y Fastify de ensayo | Las mismas 31 offline pasan sobre el [modelo actual](offline-current-evidence.json) y sobre [Fastify](fastify-offline-evidence.json); se cuentan como repeticiones. Cargas 10/100/1,000/5,000 sin POST redundantes; PR reconstruido coincide, cero sets huérfanos. |
| HTTP Express/Fastify | [31 casos equivalentes](phase7-evidence.json), bases independientes; 34 casos nativos adicionales. Perfil/login/logout/revocación, historial/edición/eliminación, PR transaccional, mesociclos, objetivos, registro corporal, importación, Atajos y backups mantienen contratos. |
| Query y componentes | 23 unitarias + 3 Node; [App real móvil](browser-evidence.json): caché, invalidación, cambio de cuenta/respuesta tardía, borrador preservado, callback vigente, etiquetas unilaterales, teclado y conexión. Errores 401/403/409/429/503 y respuestas incompatibles cubiertos por los casos nuevos y contratos existentes. |
| Primera instalación PWA | [Edge compilado](pwa-first-install.json): sin recarga inicial, 6 assets públicos conservados, cierre/reinicio del navegador y origen completo inaccesible. Actualización posterior con pendientes cubierta por las 31 offline. |
| Compilación y distribución | Builds shared/server/client, strict en los tres workspaces, check:generated (12 artefactos), check:bundle, build de ensayo y producción aislada con flags apagadas; todos exit 0. |
| Instalaciones | npm ci raíz, cliente y servidor independientes; locks conservados, build cliente standalone, servidor CommonJS/motor y smoke Express/Fastify con dependencias de producción; todos exit 0. |
| Lint | TS: 56 archivos, 0 errores/advertencias; tooling: 64 archivos, 0/0. [Global](offline-lint-evidence.json): 23 errores/2 advertencias, frente a 27/3; cero nuevos por comparación individual. El lint global aún tiene deuda y su CLI no se declara verde. |

La evidencia se guarda en audit/frontend sin reemplazar la certificación histórica
de backend. Los escenarios móviles verifican los componentes y recorridos descritos;
no constituyen una auditoría de accesibilidad completa ni compatibilidad física iOS.

## 9. Riesgos y Fase 9

Permanecen páginas JSX grandes (especialmente Workout, Progress, Settings y
ExportReport), deuda global de lint y el chunk PDF histórico grande. La migración
seleccionada es funcional; no pretende completar todo JS ni toda accesibilidad
de la aplicación. Query sólo conserva lecturas en RAM; al cerrar la PWA, la
recuperación durable sigue dependiendo del sistema de borradores existente.

Docker CLI y WebKit automatizado no disponibles en este entorno. Windows/Edge
no certifica Linux/OpenSSL/EasyPanel, Safari ni iOS físico. Esos gates, baseline,
Fastify productivo y sincronización productiva permanecen bloqueados.
La Fase 9 puede partir de fronteras remotas/componentes tipados y matriz
reproducible; no se inició Coach ni se avanzó a dicha fase.

## 10. Recuperación y conservación

Punto previo verificado de **744 archivos**, manifest SHA-256, status y diff:
`C:/Users/guerr/.codex/artifacts/nexlift-phase8-received-9cc27aa2-7de6-4639-af7a-eb5ff7e85db7`.
Excluye env, credenciales, secretos y archivos privados. Se conservaron los
cambios sin commit de fases anteriores; no se usó reset/clean/checkout.
[Conservación final](final-checks.json): los 744 archivos recibidos siguen presentes;
716 permanecen idénticos y 28 recibieron cambios de esta fase. Los 197 archivos
protegidos seleccionados (backend runtime, Prisma/SQL, shared, storage, generated,
domain, utilidades deportivas y evidencia histórica backend) conservan sus hashes.
Los 587 hashes de fuentes de la matriz siguen coincidiendo al cierre. El cambio
intencional del SW está descrito arriba. `git diff --check`: salida 0; índice sin
cambios preparados. Se preservan los cambios sin commit previos.

Producción no accedida ni modificada. Sin credenciales operativas, migraciones
persistentes, commits, despliegues ni activaciones. Express continúa siendo el
entrypoint operativo; schema.prisma y SQL recibidos permanecen intactos.
