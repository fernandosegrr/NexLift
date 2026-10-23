# NexLift — Arquitectura del Sistema

Actualización Fase 6: [persistencia e historial independiente](../server/audit/database/PHASE-6-COMPLETE.md).
Un adaptador Prisma mantiene las lecturas HTTP anteriores con propiedad directa y
contexto histórico; Express ESM, algoritmos compartidos y protocolo offline siguen
vigentes. La migración incremental solo admite ensayos desechables identificados.

> Documento técnico de referencia sobre el diseño de software, topología de infraestructura, flujos de datos y garantías de resiliencia de NexLift.
> **Estado de desarrollo:** v4, Fase 4.1 | **Fecha:** Octubre 2026
> Procedimiento actual: [monorepo](../docs/MONOREPO.md) y [Fase 3.5](../server/audit/offline/PHASE-3.5.md).
> Producción no se modifica; baseline y SQL de operaciones PROVISIONALES.

## Organización del código en desarrollo

npm workspaces conserva `client/` (React/Vite) y `server/` (Express ESM/Prisma),
añade `packages/shared/` puro y privado, `configs/` para adopción TypeScript y
`scripts/` para instalación/verificación aislada. El lock raíz mantiene los grafos
anteriores con estrategia nested; locks independientes compatibles sostienen
Docker/verificadores históricos. Shared solo tiene un probe para herramientas;
no duplica modelos, contratos ni algoritmos. [Comandos y límites](../docs/MONOREPO.md).

---

## 1. Topología de Infraestructura y Despliegue

NexLift utiliza una arquitectura monolítica simplificada y autocontenida diseñada para minimizar el mantenimiento de infraestructura y los puntos únicos de falla:

```
┌──────────────────────────────────────────────────────────────┐
│                    VPS Linux (EasyPanel / Docker)            │
│                                                              │
│  ┌───────────────────────────────┐   ┌────────────────────┐  │
│  │ Contenedor Docker NexLift     │   │ Contenedor Postgres│  │
│  │                               │   │                    │  │
│  │  ┌─────────────────────────┐  │   │  Base de datos     │  │
│  │  │ Express.js (Puerto 80)  │  │   │  nexlift_db        │  │
│  │  │                         │  │   │                    │  │
│  │  │  - API REST (/api/*)    ├──┼───┼─► Puerto 5432      │  │
│  │  │  - SPA Static (/dist/*) │  │   │                    │  │
│  │  │  - Cron Jobs Background │  │   └────────────────────┘  │
│  │  └─────────────────────────┘  │                           │
│  └───────────────────────────────┘                           │
└──────────────────────────────────────────────────────────────┘
        ▲                                    ▲
        │ HTTPS                              │ SDK / API
        ▼                                    ▼
┌─────────────────┐               ┌────────────────────────┐
│ PWA Client      │               │ Servicios Externos     │
│ (Móvil / Web)   │               │                        │
│ - Service Worker│               │ - Cloudinary (Fotos/BK)│
│ - LocalStorage  │               │ - Web Push (VAPID)     │
│ - Cache API     │               │ - OpenAI GPT-4o-mini   │
└─────────────────┘               └────────────────────────┘
```

### Características de Despliegue
- **Build Multi-stage (`Dockerfile`):**
  - **Stage 1 (Builder):** Compila el frontend React con Vite generando `client/dist`, instala dependencias del servidor y genera el cliente Prisma (`npx prisma generate`).
  - **Stage 2 (Runner):** Imagen ligera `node:20-alpine`, copia los artefactos compilados y arranca ejecutando `npx prisma db push --skip-generate` seguido de `node src/index.js`.
- **Servidor Único:** Un solo proceso Node.js sirve tanto la API REST bajo el prefijo `/api/` como los archivos estáticos de la Single Page Application (SPA), resolviendo cualquier ruta no encontrada mediante fallback a `index.html`.
- **Migraciones provisionales:** existen `0_init` y SQL de operaciones 3.1, ensayados solo en bases desechables identificadas. No hay equivalencia aprobada con producción ni permiso de db push/migrate sobre bases persistentes. El Dockerfile operativo descrito arriba es el mecanismo histórico, no el nuevo procedimiento recomendado. El Dockerfile de ensayo usa Node 24.22.0, workspaces, generación offline, job separado y HTTP sin DDL; falta validación Docker/Linux/EasyPanel.

---

## 2. Arquitectura del Frontend (Client SPA)

El frontend está construido sobre **React 19** con empaquetador **Vite 7** y estilos utilitarios de **Tailwind CSS 4**.

### 2.1 Enrutamiento y Code-Splitting
- **Enrutamiento Declarativo:** `react-router-dom` v7 gestiona 17 rutas divididas entre públicas (`/login`, `/register`, `/forgot-password`) y protegidas envueltas en `Layout`.
- **Lazy Loading Agresivo:** Solo la pantalla de Login se carga en el bundle principal. Dashboard, Workout, Progreso, Reportes y demás vistas se cargan bajo demanda con `React.lazy()` y `Suspense`:
  - Los módulos pesados como `recharts`, `jsPDF`, `html2canvas` y `GoalSection` quedan aislados en chunks secundarios que nunca penalizan el tiempo de carga inicial.
- **Prefetch Inteligente:** En el Dashboard, cuando el navegador entra en reposo (`idle`), una función invoca `import('./pages/Workout')` para precargar el código del entrenamiento activo, logrando que el botón "Entrenar Hoy" responda instantáneamente sin retardo de red.

### 2.2 Sistema de Diseño Mobile-First OLED
- **Fondo Negro Puro (`#0a0a0a`):** Reduce a cero el consumo energético de los píxeles apagados en pantallas AMOLED de smartphones.
- **Superficies Elevadas (`#141414`):** Cards y modales con bordes sutiles en `#27272a`.
- **Color de Acento:** Violeta vívido (`#8b5cf6`, variable `--primary`) para acciones principales, verde (`#22c55e`) para éxitos y récords, ámbar (`#eab308`) para alertas de descarga y rojo (`#ef4444`) para errores.
- **Touch Targets Ergonómicos:** Botones, chips de RIR y selectores con altura mínima de 44px a 52px aptos para uso con dedos sudorosos en el gimnasio.
- **Regla Estricta de Tailwind:** Las clases condicionales se escriben de manera literal y completa en el código fuente (ej. `'bg-[var(--primary)]/10'`), evitando interpolaciones en tiempo de ejecución que el compilador estático de Tailwind omitiría.

### 2.3 Solución de Viewport para Modales (`Portal.jsx`)
- En React SPA con animaciones CSS (fade-in, scale-in), cualquier elemento padre que aplique propiedades `transform` se convierte automáticamente en el *containing block* de cualquier descendiente con `position: fixed`.
- Para evitar que modales, comparadores de fotos o confirmaciones aparezcan desfasados cientos de píxeles al hacer scroll, el componente `Portal.jsx` utiliza `ReactDOM.createPortal(children, document.body)`, montando los overlays directamente en la raíz del DOM.

---

## 3. Resiliencia y funcionamiento offline actual (3.1–3.5)

Con las flags de desarrollo/ensayo, el formulario conserva borrador y contexto
por cuenta en Dexie. Antes de enviar, el motor crea un UUID, instante, payload y
hash inmutables y confirma su guardado local. Web Lock y lease con fencing
coordinan las pestañas; BroadcastChannel solo señala cambios.

La capacidad autenticada autoriza consultar un comprobante por UUID. Solo un
404 OPERATION_NOT_FOUND permite POST con el mismo contenido. PostgreSQL confirma
sesión, series, PR y comprobante en una transacción Serializable. El cliente
valida dueño/hash/contenido y guarda estado+acuse+conflicto en una TX Dexie.
Guardado local no equivale a confirmación remota.

Un 401 pausa, fallos de red/429/5xx conservan datos y respetan backoff; 409 exige
revisión. FIFO y dependencias se mantienen. La resolución compara base/local/remoto
por SetLog.id y guarda una decisión con otro UUID antes del envío, mediante el
mismo motor. No hay fusión automática ni rebase de versiones obsoletas.

Dexie conserva esquemas v1/v2/v3, claves por propietario, operaciones, eventos,
comprobantes, borradores/revisiones, fuentes legacy y conflictos/historial. No hay
TTL ni poda. La copia de localStorage conserva originales y finalCutover=false;
los elementos ambiguos no reciben dueño, fecha ni acuse por conjetura. Sin las
flags, el camino legacy protegido de 1.2 conserva pendientes y hace consultas,
no replay automático de POST/PUT ni sustituciones basadas en today-log.

El Service Worker mantiene shell/assets, rutas, VERSION y política de activación.
API (incluido /api exacto) y Authorization se excluyen antes de navegación y solo
usan red/no-store. No cachea API privada, no guarda JWT en IDB y no crea un motor
background. Se requiere abrir/reabrir la app. La exportación local lleva checksum
verificable, sin importador automático ni garantía ante borrado físico del perfil.

Las flags siguen apagadas en los ejemplos y bloqueadas en producción. Baseline,
SQL provisional, Docker/Linux y Safari/iOS físico mantienen sus gates. Detalles,
pruebas y límites: [PHASE-3.5.md](../server/audit/offline/PHASE-3.5.md). La Fase 4.1
no modifica estas implementaciones ni migra almacenamiento del navegador.

---

## 4. Pipeline de Notificaciones Web Push (VAPID)

NexLift aprovecha el estándar Web Push de W3C para alertar al usuario incluso con la aplicación en segundo plano o el teléfono bloqueado:

1. **Suscripción del Navegador:** El cliente solicita la clave pública mediante `GET /api/push/vapid-public-key` y se suscribe al servicio push del sistema operativo (Apple APNs en iOS 16.4+, Google FCM en Android).
2. **Persistencia del Endpoint:** El objeto de suscripción se almacena en el modelo `PushSubscription` asociado al usuario.
3. **Despacho Asíncrono (`web-push`):**
   - **Descansos entre Series:** Disparado por `scheduleRestReminder()`. Agenda un `setTimeout` en memoria y respalda una alarma en `PendingReminder`. Al vencer, despacha el payload push y elimina el registro de base de datos. Si el servidor se reinicia, `restorePendingReminders()` re-agenda las alarmas pendientes.
   - **Creatina Escalonada:** Un temporizador evalúa cada 10 minutos las horas configuradas en horario de Ciudad de México (`America/Mexico_City`), despachando recordatorios en Etapa 1 (hora base), Etapa 2 (+3h) o Etapa 3 (23:00) si el usuario no ha registrado su dosis diaria.
   - **Re-enganche:** Revisa si el usuario lleva $\ge 3$ días inactivo y despacha un recordatorio motivacional a su hora habitual estimada de entrenamiento.
4. **Manejo en Service Worker:** Muestra la notificación con `tag` único (evita acumulación) y abre la app enfocando la vista relevante al hacer click.

---

## 5. Integración con Atajos de iOS (Apple Shortcuts)

La API cuenta con endpoints diseñados específicamente para su consumo desde la app Atajos de Apple, permitiendo registrar entrenamientos mediante comandos rápidos o dictado por voz:

- **Autenticación Directa:** Utiliza el mismo token JWT de 365 días enviado en la cabecera `Authorization: Bearer <token>`.
- **Consulta de Siguiente Serie (`GET /api/shortcuts/next-set`):**
  - Resuelve la rutina activa del usuario.
  - Identifica el día que corresponde hoy (según el día civil en Ciudad de México).
  - Determina el primer ejercicio que aún no ha completado sus series objetivo.
  - Ejecuta el algoritmo de Smart Loading y retorna un payload JSON plano (sin anidamientos complejos) con: nombre del ejercicio, peso sugerido, repeticiones sugeridas, serie actual y descanso en segundos.
- **Registro Rápido de Serie (`POST /api/shortcuts/log-set`):**
  - Recibe `{ exerciseId, weight, reps, rpe }`.
  - Si no existe log para hoy, crea el `WorkoutLog`. Si ya existe uno, agrega la nueva serie al registro existente.
  - Aplica la conversión canónica de RIR: guarda `10 - rpe` en la base de datos.
  - Agenda el recordatorio Web Push para el descanso.

---

## 6. Motor de IA y Estrategia Fallback

La integración con modelos de lenguaje está diseñada bajo el principio de **cero dependencia crítica**: la app es 100% funcional sin conexión a OpenAI y sin clave de API configurada.

```
Petición (Importar / Rutina IA)
            │
            ├──► ¿Existe OPENAI_API_KEY? ──NO──► Algoritmo Determinista (100% Funcional)
            │                                             │
            ▼ SÍ                                          ▼
[Llamada a GPT-4o-mini]                      - Matching canónico (canonicalExerciseKey)
            │                                - Plantillas de Split fijas
            ├──► ¿Falla / Timeout? ──SÍ──────► - Rotación Round-Robin matemática
            │
            ▼ Éxito (JSON Validado)
[Lista Cerrada de Ejercicios]
```

- **Deduplicación Semántica (`exerciseAgent.js`):** Al importar rutinas, el LLM clasifica nombres similares contra el catálogo existente en una sola llamada JSON mode (`gpt-4o-mini`). Si falla, recurre a `canonicalExerciseKey`.
- **Asistente de Rutina Diaria (`aiRoutineAgent.js`):** El modelo selecciona entre 3 y 6 ejercicios para la sesión de hoy basándose en el objetivo y el equipamiento.
  - **Restricción de Lista Cerrada:** El LLM **únicamente** puede elegir índices de una lista estructurada proporcionada en el prompt. No tiene permitido inventar nombres en texto libre, protegiendo la continuidad del historial en Smart Loading.

---

## 7. Estrategia de Respaldo y Recuperación ante Desastres (Disaster Recovery)

NexLift resguarda los datos de entrenamiento a través de dos mecanismos complementarios:

1. **Backups Diarios Cifrados en Cloudinary (`backupService.js`):**
   - Cada madrugada a las ~04:00 CDMX, una tarea programada exporta la totalidad de los datos estructurados del usuario (rutinas, mesociclos, entrenamientos, series, PRs, composición corporal y metas).
   - El archivo JSON se sube a Cloudinary en la carpeta `nexlift-backups/` como recurso de tipo `raw` y modo `authenticated` (acceso restringido, no público).
   - **Privacidad:** Se omiten deliberadamente los hashes de contraseña y respuestas de seguridad.
   - **Retención:** Se mantienen los 14 backups más recientes; los anteriores se eliminan automáticamente.
2. **Restauración Automatizada (`server/restore-backup.mjs` y `/api/backup/import`):**
   - Permite restaurar de forma idempotente (mediante `upsert` por CUID) todo el historial a una base de datos nueva o existente, re-vinculando los datos al usuario correspondiente.
   - Disponible mediante CLI para administradores o vía web desde el panel de Configuración.
