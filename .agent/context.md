# NexLift - Documentación Completa del Proyecto

> **Documentación exhaustiva para IAs y desarrolladores que trabajen en este proyecto.**
> **Versión:** 2.6.0 | **Última actualización:** 9 Julio 2026
> **Historial de versiones:** [`changelog.md`](changelog.md) (movido ahí para que este archivo quepa en una sola lectura de una IA) | **Schema:** `server/prisma/schema.prisma` (única copia, no se duplica aquí)

---

## 🎯 ¿Qué es NexLift?

**NexLift** es una Progressive Web App (PWA) completa de tracking de gimnasio. Está diseñada mobile-first con tema OLED oscuro para ahorro de batería en móviles con pantalla AMOLED. Se diferencia por su enfoque en la **periodización matemática** y el análisis de datos.

### Funcionalidades Principales

| Característica | Descripción |
|----------------|-------------|
| 🏋️ **Registro de Entrenamientos** | Log de ejercicios con series, repeticiones, peso, RIR y notas |
| 🎯 **Objetivos & Periodización** | **[NUEVO]** Generación automática de planes de fuerza basados en 1RM (Fórmula Epley) |
| 📈 **Progreso Visual** | Gráficas de evolución, heatmaps de consistencia, PRs |
| 📊 **Composición Corporal** | **[NUEVO]** Soporte para básculas inteligentes (Grasa, Agua, Músculo, Hueso, etc.) |
| 📋 **Gestión de Rutinas** | Crear, editar, importar rutinas de entrenamiento (JSON/Plantillas) |
| 📄 **Reportes PDF** | Exportar informes profesionales con estadísticas detalladas |
| 👤 **Sistema Multi-Usuario** | Cuentas individuales con autenticación JWT |
| 📱 **PWA Instalable** | Funciona offline, instalable como app nativa |

### Stack Tecnológico

```
Frontend:  React 18 + Vite + Tailwind CSS 4 + Recharts
Backend:   Express.js + Prisma ORM + PostgreSQL
Fotos:     Cloudinary (si está configurado) con fallback a Catbox.moe (uploadPhoto())
Deploy:    VPS (Ubuntu + EasyPanel + Docker) | Local
Formatos:  PDF (jsPDF + html2canvas) | JSON (Backup/Restore)
```

---

## 📱 Páginas y Componentes

### 1. Dashboard (`Dashboard.jsx`)
**Ruta:** `/` (Home)

La página principal muestra un resumen del progreso del usuario:

- **Header personalizado:** Saludo con nombre y hora del día
- **KPIs Rápidos:**
  - Racha actual de entrenamientos (streak)
  - Total de workouts del mes
  - Personal Records del mes
  - Días restantes en el mes
- **Heatmap de actividad:** Calendario visual estilo GitHub mostrando días de entrenamiento
- **Última sesión:** Resumen del último workout con ejercicios y PRs logrados/medallas.
- **Acceso rápido:** Botón para ir al workout activo o iniciar una rutina.
- **Logros:** tocar una medalla en `AchievementsStrip` abre un modal de detalle (ícono, descripción, progreso real, estado de desbloqueo) — v2.2.0, antes no hacía nada pese a invitar a tocarla.

**API usada:**
- `GET /api/stats/overview` - Estadísticas generales
- `GET /api/stats/consistency` - Datos del heatmap
- `GET /api/workouts/history?limit=1` - Última sesión

### 2. Workout (`Workout.jsx`)
**Ruta:** `/workout/:dayId`

Página crítica para registrar el entrenamiento del día. Ha recibido actualizaciones masivas en v1.9.

- **Carga Inteligente:**
  - Detecta ejercicios ya completados hoy (persistencia).
  - Determina si es un día de descanso.
- **Algoritmo de Sugerencia (Smart Loading) — 100% local, sin IA:**
  - Analiza la última sesión completa (peso, reps, series y RIR).
  - Doble progresión con autorregulación por RIR: sube peso y reinicia reps al llegar al tope del rango; suma reps si sobró fuerza; descarga si hubo fallo bajo el rango.
  - Sugiere **peso Y reps** (no solo peso). En unilateral usa el lado débil.
  - Incremento de carga: 5kg en piernas, 2.5kg en el resto.
- **Cards de Ejercicio (`SetCard.jsx`):**
  - Componente optimizado (React.memo).
  - Inputs para Peso (kg), Reps y **RIR** (Reps in Reserve).
  - Feedback visual inmediato al completar (verde/check).
  - Badge de "PR" animado si se rompe un récord.
- **Acciones:**
  - Tocar la insignia "SUGERIDO" (o "DESCARGA" durante una semana de descarga, v2.4.0 — ver Roadmap/Lógica de Negocio) rellena la primera serie vacía con el peso/reps sugeridos (v2.2.0 — antes no hacía nada pese a parecer tappable).
  - "Copiar peso a todo": Facilita el llenado rápido.
  - "Ver historial": Modal con sesiones pasadas.
  - Guardado por ejercicio (granularidad) y finalización global.
  - Persistencia local: `useWorkoutPersistence` guarda en `localStorage` cada keystroke para evitar pérdida de datos si se cierra la app.
  - **Temporizador de descanso visual** (`useRestTimer`, v2.2.0, corregido a fondo en v2.3.0): cuenta regresiva en pantalla al marcar CADA serie individual como completada (no solo al terminar el ejercicio) — respaldo del push de `scheduleRestReminder` (poco fiable en iOS Safari/PWA), que ahora también se dispara por serie vía `POST /api/workouts/rest-reminder`. Basado en timestamp absoluto (no un contador de ticks), así que se recalcula correctamente al volver de segundo plano en vez de quedarse congelado. Persiste a través del auto-avance de ejercicio — solo se detiene al terminar, al tocar la X, o al salir del entreno.
  - **Aviso de descanso correcto al cambiar de ejercicio** (v2.4.1): si la serie recién completada era la última del ejercicio actual, `triggerSetCompleted` resuelve el ejercicio SIGUIENTE en la lista del día y manda su nombre (`nextExerciseName`) al backend, que lo usa para componer el texto del push en vez de repetir el nombre del ejercicio que ya se terminó.
  - **Sesiones parciales del Atajo de iOS** (v2.4.1): si el Atajo ya registró algunas series de un ejercicio hoy (menos que `targetSets`), `Workout.jsx` las muestra pre-llenadas + filas vacías para las restantes, todo editable — ya no bloquea el ejercicio como "completo" solo por tener algún log de hoy. Al guardar, actualiza (`PUT`) ese mismo `WorkoutLog` en vez de crear uno nuevo, para no fragmentar el día.

**API usada:**
- `GET /api/routines` - Obtener estructura del día
- `POST /api/workouts/log` - Registrar ejercicio
- `GET /api/workouts/exercise/:id/history` - Historial específico para algoritmos

### 3. Routines (`Routines.jsx`)
**Ruta:** `/routines`

Gestión de rutinas de entrenamiento:

- **Lista de rutinas:** Muestra todas las rutinas del usuario con sus días.
- **Indicador de rutina activa:** Badge visual en la rutina en uso.
- **Acciones por rutina:**
  - Ver detalle
  - Editar
  - Activar/Desactivar
  - Eliminar con confirmación
- **Botón Importar:** Permite importar rutinas desde archivo JSON o Texto.

**API usada:**
- `GET /api/routines`
- `PUT /api/routines/:id/activate`
- `DELETE /api/routines/:id`

### 4. Routine Detail (`RoutineDetail.jsx`)
**Ruta:** `/routines/:id`

Vista de solo lectura de una rutina específica:
- Desglose completo de días y ejercicios.
- Muestra series objetivo, rangos de reps y notas.

### 5. Edit Routine (`EditRoutine.jsx`)
**Ruta:** `/routines/:id/edit`

Editor completo y complejo de rutinas:

- **Información básica:** Nombre y descripción editable.
- **Gestión de días:** Agregar/eliminar días, marcar como descanso, reordenar (drag & drop implícito).
- **Gestión de ejercicios:**
  - Agregar ejercicios desde `exercises.js` o personalizados.
  - Editar meta de series, reps, descanso, notas.
  - Clasificación rápida de grupo muscular.
- **Lógica de PRs:** Si se renombra un ejercicio, el backend actualiza inteligentemente los PRs históricos asociados.

### 5.1 Create Routine / Import (`Import.jsx`)
**Ruta:** `/routines/new`

Página unificada para crear rutinas con 3 métodos:
1.  **Plantillas:** Selección de rutinas probadas (PPL, Arnold, Full Body).
2.  **Manual:** Constructor visual paso a paso.
3.  **JSON:** Importación directa de texto estructurado.

### 6. Body Tracking (`BodyTracking.jsx`)
**Ruta:** `/body`

Seguimiento de composición corporal completo (Actualizado v1.9.2):

- **Formulario Dinámico:**
  - *Básico:* Peso, Foto.
  - *Avanzado (Expandible):* Grasa %, Agua %, Músculo kg, Hueso, Visceral, Proteína, BMR, BMI.
- **Galería de Fotos:**
  - Sube a Cloudinary si está configurado (v2.3.0), si no cae a Catbox.moe (`uploadPhoto()` en el backend).
  - Grid de fotos ordenadas cronológicamente.
  - Comparador visual (Modal, envuelto en `Portal` desde v2.3.0 — ver Gotcha #3).
- **Gráficos:** Tabs para alternar entre Peso, Grasa Corporal y Masa Muscular a lo largo del tiempo.

**API usada:**
- `GET /api/body/logs`
- `POST /api/body/log`
- `GET /api/body/photos`

### 7. Progress (`Progress.jsx`)
**Ruta:** `/progress`

Dashboard de análisis profundo. Se divide en pestañas:

- **General:**
  - KPIs de consistencia.
  - Heatmap Anual interactivo.
  - Gráfico de "Compliance" (Cumplimiento de meta semanal).
- **Objetivos (Goals) [NUEVO]:**
  - Muestra las tarjetas `GoalCard` activas.
  - Visualización de la barra de progreso hacia la meta de fuerza.
- **Músculos (Analítica):**
  - Distribución de volumen por grupo muscular (Pie chart / Barras).
- **PRs:**
  - Lista de Récords Personales con medallas (🥇, 🥈, 🥉) según ranking histórico.
  - Gráfico de evolución de 1RM estimado por ejercicio.

**Componente Clave: `GoalCard.jsx`**
Este componente encapsula la lógica de periodización.
- Muestra el 1RM actual vs Meta.
- Despliega el plan de entrenamiento (Semanas, % Intensidad, Series/Reps).
- Permite marcar semanas como completadas.

### 8. Export Report (`ExportReport.jsx`)
**Ruta:** `/export`

Generador de reportes PDF de alta calidad:

- **Motor:** `jsPDF` + `html2canvas`.
- **Selector de rango:** 7, 30, 90 días.
- **Contenido del Reporte:**
  1.  Resumen Ejecutivo (Stats clave).
  2.  Tabla de Récords (PRs).
  3.  **[NUEVO]** Sección Diaria Detallada: Comparativa de volumen vs semana anterior.
  4.  Gráficos de Composición Corporal.
  5.  Galería de Fotos de Progreso.
- **Notas Técnicas:** Sanitización de Emojis (jsPDF no soporta UTF-8 complejo, se reemplazan por iconos SVG o texto).

### 9. Profile (`Profile.jsx`)
**Ruta:** `/profile`

Hub del usuario:
- Avatar (click para subir/cambiar).
- Resumen de antigüedad y stats "lifetime".
- Navegación a Settings.

### 10. Settings (`Settings.jsx`)
**Ruta:** `/settings`

Panel de control rediseñado (v1.9.3):

- **Tabs:**
  1.  **Perfil:** Editar nombre, email, bio.
  2.  **Seguridad:** Cambio de contraseña, Pregunta de Seguridad (Recuperación).
  3.  **Músculos:** Interfaz visual para clasificar ejercicios "Sin Grupo" en categorías (Pecho, Espalda, etc.).
  4.  **Historial:** Tabla de todas las sesiones pasadas con opción de **Editar** (`EditSession.jsx`) o **Eliminar**.
  5.  **Data:** Botón para **Exportar Backup JSON** completo.

### 11. Autenticación (`Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`)
**Rutas:** `/login`, `/register`, `/forgot-password`

- **Login:** usuario/email + contraseña → `POST /api/auth/login` devuelve JWT de **365 días** (persistido por `AuthContext` en localStorage; la revocación real es vía `tokenVersion`, no la expiración). Rate limited por IP. Inputs con trim (v2.2.0).
- **Register:** `POST /api/auth/register`. Contraseña mínima de 8 caracteres validada **server-side** (no solo en el form). Rate limited.
- **ForgotPassword:** recuperación **sin email**, vía pregunta de seguridad (`POST /api/auth/recover/question` → `POST /api/auth/recover/verify`). Doble rate limit (por IP y por cuenta objetivo, 5 intentos/30 min — v2.2.0). Restablecer la contraseña incrementa `tokenVersion` (invalida todos los JWT emitidos antes).

### 12. New Goal (`NewGoal.jsx`)
**Ruta:** `/goals/new`

Creación de objetivos de fuerza (ejercicio + peso × reps meta):
- Lista de ejercicios **consolidada** desde rutinas + catálogo `/exercises` (incluye archivados) + historial, agrupando por `canonicalExerciseKey` y resolviendo el grupo muscular con el primer valor no-nulo de cualquier copia (v2.0.1).
- Filtro por músculo case-insensitive + buscador global + orden por número de sesiones.
- Al crear un objetivo con historial se persiste un snapshot de `currentOneRepMax` (mejor 1RM de las últimas 3 sesiones) como respaldo para la tarjeta.
- `POST /api/goals` rechaza con 409 un objetivo duplicado exacto no cumplido (v2.2.0).

### 13. Edit Session (`EditSession.jsx`)
**Ruta:** `/session/:logId/edit` (se llega desde Settings → Historial)

Editor de una sesión pasada:
- Edita todas las series de un `WorkoutLog` (peso/reps/RIR, ambos lados en unilateral).
- Guarda vía `PUT /api/workouts/:logId` (**reemplaza TODAS las series del log** — el mismo endpoint que usa `Workout.jsx` para completar sesiones parciales del Atajo de iOS).
- El backend recalcula los PRs desde los logs reales tras la edición, y el caché local de `Workout.jsx` se invalida para que el día activo refleje el cambio (v2.2.0).

---

## 🧠 Lógica de Negocio Avanzada

### Algoritmos de Fuerza
NexLift utiliza matemáticas estándar de powerlifting:

1.  **Fórmula de Epley (1RM):**
    $$ 1RM = Peso \times (1 + \frac{Reps}{30}) $$
    Se utiliza para normalizar comparaciones entre series de diferentes repeticiones.

2.  **Generador de Periodización (Goals):**
    Ubicación: `src/components/goals/GoalCard.jsx`
    - **Fase Acumulación:** Alto volumen, intensidad media (~65-75% 1RM).
    - **Fase Fuerza:** Rampa lineal de intensidad (0.75 → 0.85 1RM), bajando reps.
    - **Fase Peaking:** Intensidad específica (0.86 → 1.0 1RM) para preparar el sistema nervioso.
    - **Validación:** Si el usuario tiene un 1RM histórico real > input manual, el sistema usa el real.

3.  **Smart Loading (Workout) — cálculo local, sin IA:**
    Doble progresión con autorregulación por RIR sobre la última sesión completa. Sugiere peso y reps.
    *Ejemplo: si hiciste 100kg x 12 (tope del rango 8-12) con RIR 2, sugerirá 102.5kg x 8 (sube carga, reinicia reps). Si hiciste 100kg x 9 con RIR 3, sugerirá 100kg x 10 (suma una rep).*

### 4. Entrenador inteligente (v2.4.0) — plateau, mesociclos, descarga adaptativa
Las 3 fases del roadmap original se construyeron juntas en una sola pasada (no de forma incremental como se planteó originalmente), en orden de menor a mayor riesgo: primero la función pura de plateau (sin schema), luego el modelo de bloques (schema + CRUD, sin conectar comportamiento), y al final el mecanismo de descarga conectado a los dos algoritmos de sugerencia.

1.  **Detección de plateau** — `detectPlateau(sessions)` en `client/src/utils/exerciseName.js`: toma las últimas min(6, N) sesiones, las divide en mitad antigua/reciente, y marca plateau si el mejor 1RM de la mitad reciente no supera al de la antigua (empate cuenta como estancamiento). Requiere >=4 sesiones para tener señal. 100% cliente — `Progress.jsx` (`useProgressData`) y `Dashboard.jsx` agregaron `api.getWorkoutHistory(500)` a sus fetches existentes y corren `groupHistoryByExercise` una vez; no hay endpoint de servidor dedicado. Badge "Estancado" en `PRCard` (tab General y Músculos de Progress) y tarjeta agregada en Dashboard ("N ejercicios sin mejora reciente") si el conteo > 0.
    - **Gotcha:** `PersonalRecord.exerciseName` se guarda solo con `.toLowerCase()` (no la normalización canónica completa) — cualquier cruce entre un PR y el historial agrupado debe pasar por `canonicalExerciseKey(pr.exerciseName)`, nunca comparar el string crudo, o el match falla en silencio ante acentos/plurales/paréntesis.
2.  **Mesociclos (`RoutineBlock`)** — modelo nuevo, opcional por rutina (cero bloques = comportamiento idéntico a antes). `startedAt` (no un `isActive` separado) determina el bloque activo: el de `startedAt` no-nulo más reciente, calculado en lectura vía `getActiveBlock()` — evita mantener a mano la invariante "a lo más un activo". `phase` es un string libre (`accumulation`/`intensification`/`deload`/`custom`), no un enum de Prisma (el proyecto no tenía ninguno, y con solo `db push` un string es más fácil de extender). `durationWeeks` es informativo (para "Semana N de M"), nunca un corte duro. CRUD completo: `GET/POST/PUT/DELETE /api/routines/:id/blocks` + `POST .../blocks/:blockId/start`. UI: sección de bloques en `EditRoutine.jsx` (cada bloque se guarda al instante con su propio botón, no con el "Guardar" general de la rutina) y tira de bloques + "Iniciar siguiente bloque" en `RoutineDetail.jsx`.
3.  **Descarga adaptativa + fases que ajustan la sugerencia** — `getRoutinePhaseStatus(routine)` en `server/src/index.js` es la ÚNICA función que decide "¿en qué fase está esta rutina ahora mismo?", devolviendo `{ isDeload, source, phase }` con prioridad fija: (a) si hay un bloque activo (cualquier fase), manda su `.phase` tal cual; (b) si no, cae a `Routine.adaptiveDeloadUntil` (ventana de 7 días, SOLO conoce `'deload'` — no hay forma de "acumular/intensificar automáticamente" sin un bloque configurado, decidido explícitamente así con el usuario: no existe una señal de datos limpia para saber cuándo pasar de acumulación a intensificación, a diferencia de la fatiga/plateau que sí es medible). El trigger adaptativo (`maybeEvaluateAdaptiveDeload`, corre 1x/día vía `setInterval`, mismo patrón que `checkReengagementReminders`) combina dos señales — volumen semanal actual <85% del anterior, Y >=3 ejercicios de la rutina en plateau simultáneo (nunca una señal sola) — con cooldown de 7 días entre evaluaciones (`Routine.lastAdaptiveCheckAt`).
    - **`phase` ajusta el rango de reps usado para la sugerencia** (no el `Exercise.targetReps` guardado) vía `adjustRepRangeForPhase(lo, hi, phase)`, duplicada en `computeSuggestion` (cliente, `Workout.jsx`) y `computeWorkoutSuggestion` (servidor, `/api/shortcuts/next-set`) — **hay que tocar los dos siempre**: `intensification` reduce el rango a la mitad (ej. 8-12 → 4-6: más peso, menos reps), `accumulation` sube el techo 50% (ej. 8-12 → 8-18: más reps antes de subir peso), `deload` además reduce el peso final ~10% tras la doble progresión normal (constante fija, sin tocar el string `rationale` — lo consume un Atajo de iOS externo), `custom`/sin fase activa deja el rango sin cambios (idéntico al comportamiento antes de esta feature).
    - Aviso visible en `Workout.jsx` vía el objeto `PHASE_BANNER`: banner + badge recoloreado por fase ("Descarga" ámbar, "Intensificación"/"Acumulación" violeta `--primary`) — nunca un ajuste silencioso. Las clases de Tailwind ahí están escritas completas y literales a propósito (`'bg-[var(--primary)]/10'`), NUNCA construidas interpolando el nombre de color en un template string — el compilador de Tailwind solo genera clases que puede ver como texto literal en el código fuente, así que una clase armada en runtime simplemente no se genera y el estilo se pierde en silencio.
    - **Riesgo conocido, aceptado:** los umbrales del trigger adaptativo (15% de declive, 3 plateaus, 7 días) y los multiplicadores de fase (±50%, -10%) son de primera aproximación, sin validar contra datos reales de uso — ajustar las constantes en `server/src/index.js` (`ADAPTIVE_DELOAD_*`, `adjustRepRangeForPhase`) si en la práctica se sienten mal calibrados.
    - **Gotcha de duplicación:** `detectPlateauForExercise` (servidor) es una segunda implementación de la regla de plateau, deliberadamente distinta a la del cliente — agrupa por `exerciseId` directo (no por nombre canónico), porque dentro de una sola rutina activa no hace falta consolidar variantes de nombre. Si se corrige un bug en la regla de plateau, corregir en los dos lados.
    - Verificado en vivo con overrides temporales (nunca datos de prueba permanentes) y también contra un bloque de "Intensificación" real ya activo en la cuenta de producción: multiplicador de peso y ajuste de reps confirmados en ambos algoritmos de sugerencia, y el flujo end-to-end (DB → `getRoutinePhaseStatus` → API → UI) confirmado tanto con escritura directa de `adaptiveDeloadUntil` (revertida después) como con datos reales de un bloque activo.

---

## 📊 Modelo de Datos

**La fuente de verdad es `server/prisma/schema.prisma`** (única copia; sincronizar con `npx prisma db push`, NUNCA `migrate` — no hay historial de migraciones y `migrate dev` ofrece resetear todo el schema). Antes había aquí una copia pegada del schema completo; se eliminó porque vivió desincronizada del archivo real durante meses (hasta v2.2.0) — leer siempre el `.prisma` directamente.

Resumen de los 12 modelos:

| Modelo | Qué es | Detalle no obvio |
|--------|--------|------------------|
| `User` | Cuenta | `tokenVersion` revoca JWTs viejos; `lastReengagementNotifiedAt` limita el push de re-enganche a 1/día; `lastBackupAt`/`lastBackupError` (v2.5.0) reflejan el backup automático diario |
| `Routine` | Rutina | `adaptiveDeloadUntil`/`lastAdaptiveCheckAt` = descarga adaptativa (v2.4.0) |
| `RoutineBlock` | Mesociclo (opcional) | `phase` es string libre, no enum; activo = `startedAt` no-nulo más reciente |
| `RoutineDay` | Día de rutina | `isRestDay`, `order` |
| `Exercise` | Ejercicio de un día | `targetReps` es string `"8-12"`; `isUnilateral`; `restSeconds` |
| `WorkoutLog` | Sesión de UN ejercicio en una fecha | `onDelete: Restrict` hacia `Exercise` — nunca borrar ejercicios con historial (archivar) |
| `SetLog` | Serie individual | **`rpe` guarda `10 - RIR`, no el RIR crudo** (ver Gotcha #5); `weightRight`/`repsRight` en unilateral |
| `PersonalRecord` | PR por ejercicio | `exerciseName` guardado solo en `.toLowerCase()` — cruzar siempre vía `canonicalExerciseKey` |
| `Goal` | Objetivo de fuerza | `achievedAt` lo decide el backend (puerta de un solo sentido); snapshot `currentOneRepMax` |
| `RestLog` | Día de descanso registrado | Cuenta para la racha |
| `BodyLog` | Composición corporal | `photoUrl` (Cloudinary/Catbox), métricas de bioimpedancia |
| `PushSubscription` | Web Push por dispositivo | `endpoint` único; se revoca en logout |
| `PendingReminder` | Recordatorio de descanso pendiente (v2.5.1) | Espejo en DB del `setTimeout` en memoria; `@@unique([userId, exerciseId])`; recuperado al arrancar por `restorePendingReminders()` |

---

## 🔌 Endpoints de la API (`server/src/index.js`)

Todos bajo auth JWT (`authMiddleware`) salvo registro/login/recuperación/vapid-public-key/health.

**Auth**
| Método/Ruta | Qué hace |
|---|---|
| `POST /api/auth/register` | Crear cuenta (rate limited, contraseña ≥8 server-side) |
| `POST /api/auth/login` | Login → JWT 365 días (rate limited) |
| `GET /api/auth/me` | Usuario actual |
| `PUT /api/auth/profile` | Editar perfil |
| `PUT /api/auth/password` | Cambiar contraseña — incrementa `tokenVersion` y **devuelve token nuevo** (el frontend debe persistirlo) |
| `POST /api/auth/recover/question` / `POST /api/auth/recover/verify` | Recuperación por pregunta de seguridad (rate limit por IP **y** por cuenta) |
| `PUT /api/auth/security-question` | Cambiar pregunta (exige contraseña actual; incrementa `tokenVersion`, devuelve token nuevo) |
| `POST /api/auth/avatar` | Subir avatar (`uploadPhoto()`) |

**Rutinas y ejercicios**
| Método/Ruta | Qué hace |
|---|---|
| `GET /api/routines` | Listar (excluye la rutina-papelera) |
| `GET /api/routines/trash` | Papelera de historial (ejercicios archivados) |
| `GET /api/routines/active` | Rutina activa |
| `POST /api/routines/import` | Importar rutina JSON/plantilla (dedup vía LLM si hay `OPENAI_API_KEY`, si no `canonicalExerciseKey`) |
| `GET/PUT/DELETE /api/routines/:id` | Detalle / editar / borrar — PUT y DELETE en `$transaction`; borrar archiva ejercicios con historial |
| `PUT /api/routines/:id/activate` | Activar rutina |
| `GET/POST /api/routines/:id/blocks`, `PUT/DELETE .../blocks/:blockId`, `POST .../blocks/:blockId/start` | CRUD de mesociclos (v2.4.0) |
| `GET /api/exercises` | Catálogo del usuario (incluye archivados) |
| `PUT /api/exercises/:id/muscle` | Clasificar grupo muscular |
| `GET /api/stats/routine/:id` | Stats por rutina |

**Workouts**
| Método/Ruta | Qué hace |
|---|---|
| `GET /api/workouts/today-log?exerciseId=X` | (v2.6.0) ¿Ya existe log de HOY (día CDMX) para este ejercicio? Usado por la reconciliación anti-duplicados de la cola offline — ver Gotcha #9 |
| `POST /api/workouts/log` | Registrar TODAS las series de un ejercicio — **siempre crea un log nuevo** |
| `GET/PUT/DELETE /api/workouts/:logId` | Detalle / **reemplazar todas las series** (EditSession + sesiones parciales del Atajo) / borrar — PUT y DELETE recalculan PRs |
| `GET /api/workouts/history` | Historial (con `limit`, filtros) |
| `GET /api/workouts/exercise/:exerciseId/history` | Historial de un ejercicio (insumo del Smart Loading) |
| `POST /api/workouts/rest-reminder` | Agendar push de descanso por serie (no toca `WorkoutLog`/`SetLog`) |
| `POST /api/workouts/log-rest` | Registrar día de descanso |
| `PUT /api/workouts/fix-weights` | Corrección masiva de pesos |
| `POST /api/backup/run` | (v2.5.0) Forzar backup a Cloudinary para el usuario del token — ver Gotcha #6 |

**Atajos de iOS**
| Método/Ruta | Qué hace |
|---|---|
| `GET /api/shortcuts/next-set` | Rutina activa → día de hoy → próximo ejercicio → sugerencia Smart Loading (JSON plano) |
| `POST /api/shortcuts/log-set` | Registrar UNA serie (acumula en el log de hoy; convierte RIR crudo → `10 - RIR`) |

**Stats, cuerpo, goals, push, otros**
| Método/Ruta | Qué hace |
|---|---|
| `GET /api/stats/overview` / `GET /api/stats/consistency` | KPIs del Dashboard / heatmap (usan helpers CDMX) |
| `GET /api/stats/progress/:exerciseName` / `GET /api/stats/prs` | Evolución 1RM / récords |
| `GET /api/body/logs`, `POST /api/body/log`, `GET/POST /api/body`, `GET /api/body/photos`, `GET /api/body/latest` | Composición corporal y fotos (conviven rutas nuevas y legacy) |
| `GET /api/goals` | Lista objetivos — calcula y **persiste** `achievedAt` de forma autoritativa |
| `POST /api/goals` | Crear (409 si duplicado exacto no cumplido) |
| `PUT /api/goals/:id/weeks` / `DELETE /api/goals/:id` | Checklist de semanas / borrar |
| `GET /api/push/vapid-public-key`, `POST/DELETE /api/push/subscribe` | Web Push |
| `GET /api/health` | Healthcheck |
| `GET *` | Sirve `client/dist` en producción (SPA fallback) |

---

## 🎨 Sistema de Diseño & UI

### Variables Globales CSS (`index.css`)
```css
:root {
  --bg-dark: #0a0a0a;       /* OLED Black puro */
  --bg-card: #141414;       /* Cards ligeramente elevadas */
  --primary: #8b5cf6;       /* Violeta Vivid */
  --success: #22c55e;       /* Verde Éxito */
  --warning: #eab308;       /* Amarillo Warning */
  --error: #ef4444;         /* Rojo Error */
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --border: #27272a;
}
```

### Código de Colores Muscular
Definido en `MuscleIcon.jsx` y `Settings.jsx`.
*   🔴 **Pecho:** Rojo/Azul (Configurable, default Blue)
*   🟢 **Espalda:** Verde
*   🟠 **Hombros:** Naranja
*   🟣 **Bíceps:** Púrpura
*   🩷 **Tríceps:** Rosa
*   🔴 **Piernas:** Rojo
*   🔵 **Core:** Cian

---

## ⚠️ Gotchas y Consideraciones Técnicas

### 1. Manejo de Fechas
PostgreSQL guarda en UTC. El frontend debe siempre castear a local para visualización y a `YYYY-MM-DD` (ISO) para comparaciones de strings.
*   **Correcto:** `new Date(utcDate).toLocaleDateString()`
*   **API:** Usa formato `sv` (Sweden/ISO) `date.toLocaleDateString('sv')` para enviar al backend.
*   **Backend (v2.2.0) — regla obligatoria:** el contenedor corre en UTC, la app es de un solo usuario siempre en CDMX. Este desfase (hasta 6h) causó el mismo bug 3 veces en distintos endpoints antes de centralizarse. Cualquier código que agrupe/filtre por "día" (streak, heatmap, ventanas de "hoy", día de la semana) DEBE usar los helpers de `server/src/index.js` — `mexicoCityDateStr(date)`, `mexicoCityDayBounds(date)`, `mexicoCityHour(date)`, `dayOfWeekFromDateStr(dateStr)` — nunca `new Date()`/`.getDay()`/`.toISOString()` directo para esto.

### 2. Backend único
Desde v1.9.9 hay **un solo backend**: `server/src/index.js`. Existe una sola copia del schema (`server/prisma/schema.prisma`). Se eliminaron `api/` (serverless de Vercel) y `shared/` al migrar el deploy a Docker en VPS. Ya no hay regla de sincronización de schema ni lógica duplicada.

### 3. Imágenes
No almacenamos binarios.
1.  Frontend recibe archivo -> Convierte a Base64.
2.  Backend recibe Base64 -> `uploadPhoto()` -> Recibe URL.
3.  `uploadPhoto()` (v2.3.0) usa Cloudinary si `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` están configuradas (servicio con SLA real); si no, cae a la API de Catbox.moe (host anónimo gratuito, sin garantías) con 3 reintentos antes de darlo por fallido.
4.  DB guarda la URL resultante (`https://res.cloudinary.com/...` o `https://files.catbox.moe/...`).
5.  Backend valida que el contenido decodificado sea realmente una imagen (firma de bytes) antes de subirlo a Catbox, y que la URL de respuesta tenga el formato esperado antes de guardarla.
6.  Si la foto falla y era el único dato del registro (v2.3.0), no se crea un registro vacío — se responde error para reintentar. Si había más datos (peso, métricas), se guardan igual y se marca `photoFailed: true` en la respuesta para que el frontend avise sin perder lo demás.
7.  Migración de fotos ya alojadas en Catbox hacia Cloudinary: `server/migrate-catbox-to-cloudinary.mjs` (correr una vez con las credenciales de Cloudinary en `.env`; seguro de re-correr, solo toca lo que siga en Catbox).

### 3.1. Modales y `position: fixed`
Cualquier overlay `fixed inset-0` (modal, visor de foto) DEBE ir envuelto en `client/src/components/ui/Portal.jsx` (`createPortal` a `document.body`). Causa raíz (v2.3.0): las animaciones de entrada (`animate-fade-in`/`slide-up`/`scale-in` en `index.css`) usan `transform` con `animation-fill-mode: forwards`, que dejan el elemento "transformado" para siempre a ojos del navegador (aunque visualmente sea un no-op) — y cualquier ancestro con un `transform` computado distinto de `none` se convierte en el *containing block* de sus descendientes `position: fixed`, sacándolos de "fijo al viewport" y dejándolos posicionados como si fueran parte del contenido con scroll (aparecen centenares de píxeles fuera de pantalla en cuanto la página tiene scroll real). Confirmado en vivo midiendo el `getBoundingClientRect()` de un modal roto antes del fix. `Portal` es agnóstico a la causa exacta: saca el modal del árbol afectado por completo.

### 4. Tests automatizados (desde v2.5.0) — cubren solo lógica pura
Antes de v2.5.0 no existía ninguna suite de tests; el bug de zona horaria de v2.2.0 es el ejemplo directo de lo que pasa sin esto: se "arregló" 3 veces en sitios distintos antes de resolverse por completo. Ahora hay dos suites:
- **Cliente:** `client/src/utils/exerciseName.test.js` (vitest) — `canonicalExerciseKey`, `epley1RM`, `best1RMRecent`, `bestOneRepMaxForTarget`, `detectPlateau`, `groupHistoryByExercise`. Correr con `cd client && npm test`.
- **Servidor:** `server/src/logic.test.js` (`node --test`, sin dependencias nuevas) — helpers CDMX (con el caso exacto de medianoche UTC del bug histórico), `convertShortcutRir`, `adjustRepRangeForPhase`, `computeWorkoutSuggestion`, `detectPlateauForExercise`, `getActiveBlock`/`currentWeekInBlock`, `getRoutinePhaseStatus`. Correr con `cd server && npm test`.
- **Paridad cliente/servidor:** `client/src/utils/smartLoading.parity.test.js` importa AMBAS copias de `adjustRepRangeForPhase` (cruzando de `client/` a `server/src/logic.js` — son módulos ES planos sin DOM ni Prisma) y corre los mismos fixtures de plateau por `detectPlateau` (cliente) y `detectPlateauForExercise` (servidor), documentando que la diferencia de agrupación (nombre canónico vs id) es deliberada.

**Lo que SIGUE sin cobertura:** rutinas, auth, cualquier cosa que toque Prisma/DB o el DOM. Cualquier cambio ahí debe seguir probándose a mano (levantar `server`+`client`, probar en navegador contra datos reales) antes de darlo por bueno.

### 5. Atajo de iOS: sesiones parciales y convención de RIR (v2.4.1)
`POST /api/shortcuts/log-set` registra UNA serie a la vez, acumulando en el `WorkoutLog` de hoy si ya existe uno — un ejercicio puede entonces tener un log de hoy con MENOS series que `Exercise.targetSets`. `Workout.jsx` (`checkCompletedExercises`/`loadExerciseData`) debe comparar `sets.length` contra `targetSets`, no solo "¿existe un log hoy?", para decidir si el ejercicio está de verdad completo o solo parcialmente registrado (en cuyo caso se muestra editable, con las series ya guardadas + filas vacías para el resto). Al terminar de llenarlo a mano, se usa `PUT /api/workouts/:logId` (reemplaza todas las series, mismo endpoint que `EditSession.jsx`) sobre ESE log — nunca `POST /api/workouts/log`, que siempre crea uno nuevo y fragmentaría el día en 2.

`SetLog.rpe` no guarda el RIR crudo pese al comentario del schema (`// RIR`) — guarda `10 - RIR` (ida y vuelta en `Workout.jsx`: `rpe: 10 - rir` al guardar, `rir: 10 - rpe` al leer). El Atajo pregunta "RIR?" directo (0-4, confirmado con capturas reales del Atajo del usuario) y lo manda bajo el nombre `rpe` — el endpoint debe aplicarle la misma conversión antes de guardar, o el valor queda invertido y no calza con ningún botón de RIR (0-3) en la UI. Datos ya guardados mal antes de este fix: `server/fix-shortcut-rir.mjs` (dry-run por defecto, `--apply` para escribir), identifica candidatos por rango (`rpe <= 6` solo puede venir del Atajo sin convertir, nunca del flujo manual).

**Gotcha encontrado verificando este fix (no reportado, pero mismo sistema):** `loadExerciseData` compara `sets` contra `prevSetsSnapshotRef` para detectar "una serie se acaba de completar" y disparar el aviso de descanso. Si `setSets(...)` carga series YA completadas (del historial de hoy o del caché de `localStorage`) sin sincronizar `prevSetsSnapshotRef` en la misma pasada, el efecto las interpreta como transiciones recién ocurridas y dispara un aviso fantasma (timer reiniciado + push real) solo por abrir o revisitar la página — confirmado en vivo antes del fix (petición a `/api/workouts/rest-reminder` disparándose sin ninguna interacción del usuario). Cualquier rama que precargue `sets` con datos preexistentes debe actualizar el ref a juego.

### 6. Backup automático a Cloudinary (v2.5.0)
Job diario (~04:00 CDMX, mismo patrón `setInterval` que `checkReengagementReminders`) — `runDailyBackup()`/`maybeRunDailyBackup()` en `server/src/index.js` — exporta por usuario TODO su historial de entrenamiento (rutinas+días+ejercicios+bloques, workoutLogs+sets, bodyLogs, personalRecords, goals, restLogs) y lo sube a Cloudinary vía `server/src/services/backupService.js` como recurso `raw`+`type: 'authenticated'` (deliberadamente NO público, a diferencia de las fotos — el JSON contiene datos personales de composición corporal) en la carpeta `nexlift-backups/`, reteniendo los 14 más recientes (`pruneOldBackups`, borra los más viejos por `public_id` ordenado — el nombre incluye el timestamp ISO, así que el orden lexicográfico ya es cronológico).

- **No-op sin credenciales:** mismo criterio que `uploadPhoto()`/VAPID — sin `CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`, `runDailyBackup()` retorna de inmediato y el server arranca igual.
- **Deliberadamente excluye `passwordHash`/`securityAnswerHash`:** el JSON queda en un CDN de terceros (aunque no público); esos campos no hacen falta para recuperar el historial de entrenamiento, que es el activo irreemplazable que este backup protege. El restore, por tanto, NUNCA toca contraseñas — solo reconecta datos a un usuario que ya debe existir.
- **`POST /api/backup/run`** (autenticado): fuerza una corrida solo para el usuario del token — útil como botón futuro en Settings y como forma de probar la integración sin esperar a las 4am.
- **`GET /api/health`** expone `backup.users[].lastBackupAt`/`lastBackupError` (persistidos en `User`, no solo en memoria, para sobrevivir un redeploy).
- **Restauración:** `server/restore-backup.mjs` (dry-run por defecto, `--apply` para escribir — mismo patrón que `fix-shortcut-rir.mjs`). Idempotente vía `upsert` por `id` (los ids del backup son los cuids originales; se recrean tal cual, remapeando solo `userId` al usuario destino). El usuario destino debe existir ya en la DB con el mismo `username` que tenía el backup (o pasar `--user=` para forzar otro) — regístralo primero si es una DB nueva. Probado end-to-end con datos sintéticos: backup → borrado total de las tablas del usuario → restore dry-run (conteos correctos) → restore `--apply` (ids originales recuperados) → segundo `--apply` (idempotente, sin errores) → limpieza.
- Documentación de uso completa en la sección "Backup y restauración" de `README.md`.

### 7. Tests automatizados: qué NO está cubierto (v2.5.0)
Ver Gotcha #4 arriba (sección "Sin tests automatizados", renombrada). Solo lógica pura tiene tests — `server/src/logic.js` y `client/src/utils/{exerciseName,smartLoading}.js`. Si extraes una función pura nueva de `index.js`/`Workout.jsx`, considera moverla a `logic.js`/`smartLoading.js` y agregarle un test ahí en vez de dejarla inline sin cobertura.

### 8. Recordatorios de descanso persistentes (v2.5.1)
Antes de v2.5.1, `scheduleRestReminder` vivía SOLO en memoria (`setTimeout` + `Map` en `server/src/index.js`) — cualquier redeploy o reinicio del contenedor a mitad de un descanso perdía el push en silencio. Con deploys frecuentes en EasyPanel esto pasaba en la práctica.

- **Modelo `PendingReminder`** (`userId`, `exerciseId`, `fireAt`, `nextExerciseName`, `@@unique([userId, exerciseId])`): `scheduleRestReminder` ahora hace `upsert` de esta fila ADEMÁS de agendar el `setTimeout` — mismo unique que ya usaba el `Map` en memoria para el dedup, así que agendar un recordatorio nuevo reemplaza al pendiente anterior en ambos lados a la vez (memoria y DB).
- **`firePendingReminder(userId, exerciseId, exerciseName, nextExerciseName)`** centraliza el disparo real (enviar el push + borrar la fila de `PendingReminder` + limpiar el `Map`) — compartido por el `setTimeout` normal Y por `restorePendingReminders()`, para no duplicar esa lógica en dos sitios.
- **`restorePendingReminders()`**, llamado una vez desde `startServer()` (después de `prisma.$connect()`, antes de `app.listen()`): lee TODAS las filas de `PendingReminder` al arrancar. `fireAt` en el futuro → reagenda un `setTimeout` con el tiempo restante EXACTO (no un valor fijo). `fireAt` pasado hace menos de 5 minutos → dispara de inmediato (el aviso todavía sirve). Más viejo que eso → borra la fila sin disparar (un aviso de "descanso terminado" de hace 20 minutos ya no es útil, y podría confundir).
- No-op completo si `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no están configuradas (mismo criterio que antes) — en ese caso ni siquiera se escribe la fila en `PendingReminder`.
- Verificado en vivo (usuario y ejercicios 100% sintéticos, borrados después): recordatorio con `restSeconds` largo → reinicio real del proceso a mitad del descanso → log `"1 reagendado(s)"` al arrancar → dispara a la hora correcta y limpia la fila. Ráfaga de 2 llamadas casi seguidas → una sola fila en DB (mismo `id`, `fireAt`/`nextExerciseName` de la más reciente) — dedup intacto. Fila insertada a mano con `fireAt` de hace 10 minutos → reinicio → log `"1 descartado(s) por viejos"`, fila borrada, nada disparado.

### 9. Registro offline con cola de sincronización (v2.6.0) — 2 bugs reales encontrados verificándolo en el navegador
Alcance deliberadamente acotado: SOLO `logWorkout`/`updateWorkoutSession`/`logRestDay` (el registro de entrenamiento). Nada de fotos, goals ni rutinas.

- **`client/src/services/offlineQueue.js`** (storage puro, sin red — a propósito, para no formar un import circular con `api.js`, que sí necesita esta cola Y las llamadas de red reales): `enqueueWrite`/`getQueue`/`removeFromQueue` sobre un array en `localStorage` (`nexlift_offline_queue`), con expiración de 48h y `subscribeQueueChange` para que la UI reaccione sin poll.
- **`client/src/services/api.js`**: `safeFetch` marca `err.isNetworkError = true` cuando `fetch()` mismo revienta (offline/DNS/timeout) — la señal que distingue "sin red" de un 4xx/5xx real (que llega como `Response`, no como excepción). `logWorkout`/`updateWorkoutSession`/`logRestDay` capturan SOLO ese caso, encolan, y devuelven `{ queued: true }` en vez de fingir éxito — los 3 callers (`Workout.jsx`, `Dashboard.jsx`, `EditSession.jsx`) chequean ese flag para mostrar "Guardado local — pendiente de sincronizar" en vez del toast de éxito normal, sin bloquear el flujo (Workout.jsx avanza al siguiente ejercicio igual). `replayOfflineQueue()` corre al abrir la app (código de nivel de módulo en `api.js`) y en el evento `online` de `window`.
- **Bug real #1 (stack overflow confirmado en vivo, no teórico):** `getQueue()` llamaba a `writeQueue()` (que notifica `subscribeQueueChange`) en CADA lectura, para persistir la poda de expirados. El badge de `Workout.jsx` se suscribe con un callback que llama `hasPendingWrite()` → `getQueue()` de vuelta — cualquier lectura disparaba una notificación que disparaba otra lectura, ad infinitum, hasta `RangeError: Maximum call stack size exceeded` (reproducido con el DOM real, no en un test). Fix: la poda se persiste con `writeQueueSilent` (sin notificar); solo las mutaciones reales (`enqueueWrite`/`removeFromQueue`) notifican. Test de regresión en `offlineQueue.test.js`.
- **Bug real #2 (mismo patrón de zona horaria que este proyecto ya resolvió 3 veces):** la reconciliación anti-duplicados (antes de reintentar un `logWorkout` encolado, ¿ya existe un log de hoy? si sí, `PUT` en vez de `POST` — cubre "el POST sí llegó pero se perdió la respuesta") originalmente mandaba una `fecha` calculada en el navegador (`new Date().toLocaleDateString('sv')`) contra `GET /api/workouts/history?dateFrom=X&dateTo=X` — ese endpoint filtra con `new Date(dateFrom)` (UTC ingenuo, sin pasar por los helpers CDMX). Reproducido en vivo: un log real creado a las 20:49 CDMX (02:49 UTC del día siguiente) no lo encontraba la query con `fecha` del día CDMX correcto, y el replay creaba un WorkoutLog **duplicado**. Fix: nuevo endpoint dedicado `GET /api/workouts/today-log?exerciseId=X` que calcula "hoy" con `mexicoCityDayBounds()` server-side — el cliente ya no manda ninguna fecha, elimina la clase entera de bug.
- **Verificado en vivo end-to-end** (usuario y ejercicios sintéticos, borrados después): offline real (servidor detenido/fetch interceptado por endpoint) → guardar → badge visible → recargar la página → sigue pendiente → volver "online" (`window.dispatchEvent(new Event('online'))`) → sincroniza solo, exactamente 1 `WorkoutLog` correcto. Escenario de respuesta perdida (log ya existente + item encolado apuntando al mismo ejercicio) → replay hace `PUT`, NO duplica. Item con peso inválido (rechazado por `sanitizeSets`, 400) → se descarta de la cola sin reintentar infinito y sin crear datos corruptos.

---

## 📝 Guía para Modificar Documentación

Para mantener esta documentación al día:

1.  **Integridad:** Este archivo es la fuente de verdad narrativa. Si el código cambia, actualiza esto primero.
2.  **Detalle:** Mantén la descripción detallada de "Páginas y Componentes" — una sección por página de `client/src/pages/`. No resumas excesivamente.
3.  **Schema:** NO copiar el schema aquí — la única copia es `server/prisma/schema.prisma` (se sincroniza con `db push`; el proyecto no usa migraciones). Aquí solo se mantiene la tabla-resumen de modelos; si agregas un modelo o campo con comportamiento no obvio, agrega su fila/nota.
4.  **Changelog:** Registra cada cambio significativo en [`changelog.md`](changelog.md), no aquí. Actualiza la versión y fecha del encabezado de este archivo.
5.  **Tamaño:** este archivo debe caber en una sola lectura de una IA (< ~500 líneas). Si crece más, mover historia/detalle a archivos hermanos en `.agent/`.

---

## 📋 Changelog

El historial completo de versiones vive en [`changelog.md`](changelog.md).

**Versión actual: 2.6.0** (9 Julio 2026) — registro de entrenamiento offline con cola de sincronización (sobrevive sin señal en el gym), sobre la base de v2.5.1 (recordatorios persistentes) y v2.5.0 (backup automático + primera suite de tests).

---

## 🚀 Comandos

```bash
# Iniciar Backend
cd server && npm run dev

# Iniciar Frontend
cd client && npm run dev

# Prisma Studio (Ver datos)
cd server && npx prisma studio

# Tests (funciones puras, sin DB ni navegador — ver Gotcha #4/#7)
cd client && npm test
cd server && npm test

# Backup manual / restore (ver Gotcha #6)
curl -X POST http://localhost:3001/api/backup/run -H "Authorization: Bearer <token>"
cd server && node restore-backup.mjs --apply
```