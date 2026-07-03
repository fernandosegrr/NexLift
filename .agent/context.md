# NexLift - Documentación Completa del Proyecto

> **Documentación exhaustiva para IAs y desarrolladores que trabajen en este proyecto.**
> **Versión:** 2.2.0 | **Última actualización:** 3 Julio 2026

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
Fotos:     Catbox.moe (almacenamiento gratuito ilimitado)
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
  - Tocar la insignia "SUGERIDO" rellena la primera serie vacía con el peso/reps sugeridos (v2.2.0 — antes no hacía nada pese a parecer tappable).
  - "Copiar peso a todo": Facilita el llenado rápido.
  - "Ver historial": Modal con sesiones pasadas.
  - Guardado por ejercicio (granularidad) y finalización global.
  - Persistencia local: `useWorkoutPersistence` guarda en `localStorage` cada keystroke para evitar pérdida de datos si se cierra la app.
  - **Temporizador de descanso visual** (`useRestTimer`, v2.2.0): cuenta regresiva en pantalla tras guardar una serie, respaldo del push de `scheduleRestReminder` (poco fiable en iOS Safari/PWA). Persiste a través del auto-avance de ejercicio — solo se detiene al terminar, al tocar la X, o al salir del entreno.

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
  - Integración con Catbox.moe.
  - Grid de fotos ordenadas cronológicamente.
  - Comparador visual (Modal).
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

### 🗺️ Roadmap: cerrar el círculo del "entrenador inteligente"
Ya existen todos los datos (historial completo por ejercicio, RIR, 1RM estimado) para dejar de ser solo un registro pasivo. Orden sugerido, de menor a mayor esfuerzo:
1.  **Detección de plateau** (sin cambio de schema): comparar el mejor 1RM estimado de las últimas 4-6 sesiones por ejercicio; si no sube, marcarlo (Dashboard/Progreso).
2.  **Sugerencia de descarga** (schema pequeño, p. ej. `Routine.deloadEveryWeeks`): volumen semanal a la baja + varios ejercicios en plateau a la vez → bajar automáticamente la sugerencia esa semana.
3.  **Mesociclos/bloques reales** (la más grande): rutina como bloques con nombre/duración (acumulación → intensificación → descarga) en vez de un split fijo indefinido. Solo si 1 y 2 no bastan.

---

## 📊 Modelo de Datos (Prisma Schema Completo)

La base de datos PostgreSQL está normalizada y optimizada para queries de series temporales.

> El bloque de abajo es el `schema.prisma` real (recortando comentarios largos) — ver el archivo para el detalle completo. Actualizado en v2.2.0: antes este bloque llevaba tiempo desincronizado del real (le faltaban `weightRight`/`repsRight`, `RestLog`, varios índices).

```prisma
// server/prisma/schema.prisma

// ==================== USUARIO ====================
model User {
  id            String    @id @default(cuid())
  username      String    @unique
  email         String    @unique
  passwordHash  String
  firstName     String
  lastName      String
  phone         String?
  birthDate     DateTime?
  avatarUrl     String?   // URL de Catbox

  // Seguridad
  securityQuestion   String?
  securityAnswerHash String?

  isActive      Boolean   @default(true)

  // Revocación de sesión (v2.2.0): cambiar contraseña o pregunta de seguridad la
  // incrementa, invalidando todos los JWT emitidos antes.
  tokenVersion  Int       @default(0)

  // Recordatorio de re-enganche (v2.2.0): último día (CDMX) en que se avisó
  // "¿no vas a entrenar hoy?" — máximo uno por día.
  lastReengagementNotifiedAt DateTime?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLogin     DateTime?

  // Relaciones
  routines          Routine[]
  bodyLogs          BodyLog[]
  restLogs          RestLog[]
  personalRecords   PersonalRecord[]
  goals             Goal[]
  pushSubscriptions PushSubscription[]

  @@index([email])
  @@index([username])
}

// ==================== RUTINAS ====================
model Routine {
  id          String       @id @default(cuid())
  name        String
  description String?
  isActive    Boolean      @default(false)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  userId      String?      // opcional para migración
  user        User?        @relation(fields: [userId], references: [id], onDelete: Cascade)
  days        RoutineDay[]

  @@index([userId])
}

model RoutineDay {
  id        String     @id @default(cuid())
  dayName   String
  isRestDay Boolean    @default(false)
  order     Int        @default(0)
  routineId String
  routine   Routine    @relation(fields: [routineId], references: [id], onDelete: Cascade)
  exercises Exercise[]
}

model Exercise {
  id           String       @id @default(cuid())
  name         String
  muscleGroup  String?      // 'Pecho', 'Espalda', 'Piernas', 'Bíceps', 'Tríceps', 'Hombros', 'Core'
  targetSets   Int
  targetReps   String       // "8-12"
  restSeconds  Int?
  note         String?
  order        Int          @default(0)
  isUnilateral Boolean      @default(false)
  routineDayId String
  routineDay   RoutineDay   @relation(fields: [routineDayId], references: [id], onDelete: Cascade)
  workoutLogs  WorkoutLog[]

  @@index([routineDayId])
  @@index([name])
}

// ==================== WORKOUTS (Logs) ====================
model WorkoutLog {
  id          String    @id @default(cuid())
  date        DateTime  @default(now())
  exerciseId  String
  // onDelete: Restrict explícito (v2.2.0) — un ejercicio con historial nunca se
  // borra de verdad (ver getRecycleBinDay/archivo en index.js).
  exercise    Exercise  @relation(fields: [exerciseId], references: [id], onDelete: Restrict)
  sets        SetLog[]
  notes       String?

  @@index([exerciseId])
  @@index([date])
}

model SetLog {
  id           String     @id @default(cuid())
  setNumber    Int
  weight       Float
  reps         Int
  rpe          Int?       // RIR
  completed    Boolean    @default(true)
  weightRight  Float?     // Lado derecho (ejercicios unilaterales)
  repsRight    Int?
  workoutLogId String
  workoutLog   WorkoutLog @relation(fields: [workoutLogId], references: [id], onDelete: Cascade)
}

// ==================== METAS & RECORDS ====================
model Goal {
  id               String    @id @default(cuid())
  exerciseName     String
  muscleGroup      String?
  targetWeight     Float
  targetReps       Int
  currentOneRepMax   Float?  // Snapshot para cálculos
  currentEightRepMax Float?
  experienceLevel  String?   // 'beginner', 'intermediate', 'advanced'
  frequencyPerWeek Int?
  completedWeeks   Int[]     // Control manual de progreso
  achievedAt       DateTime?
  createdAt        DateTime  @default(now())
  userId           String
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model PersonalRecord {
  id           String   @id @default(cuid())
  exerciseName String
  weight       Float
  reps         Int
  estimated1RM Float?   // Resultado Epley
  date         DateTime @default(now())
  userId       String?
  user         User?    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([exerciseName])
  @@index([userId])
}

// ==================== DESCANSO ====================
model RestLog {
  id     String   @id @default(cuid())
  date   DateTime @default(now())
  note   String?
  userId String?
  user   User?    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

// ==================== WEB PUSH ====================
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  @@index([userId])
}

// ==================== BODY TRACKING ====================
model BodyLog {
  id          String   @id @default(cuid())
  date        DateTime @default(now())
  weight      Float?
  photoUrl    String?
  note        String?

  // Métricas Avanzadas
  bmi         Float?
  bodyFat     Float?
  muscleMass  Float?
  bmr         Float?
  bodyWater   Float?
  visceralFat Float?
  boneMass    Float?
  protein     Float?

  createdAt   DateTime @default(now())
  userId      String?
  user        User?    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([date])
  @@index([userId])
}
```

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
2.  Backend recibe Base64 -> Sube a Catbox API -> Recibe URL.
3.  DB guarda `https://files.catbox.moe/xyz.jpg`.
4.  Backend valida (v2.2.0) que el contenido decodificado sea realmente una imagen (firma de bytes) antes de subirlo, y que la URL de respuesta de Catbox tenga el formato esperado antes de guardarla.

### 4. Sin tests automatizados
No existe ninguna suite de tests. Cualquier cambio a lógica de fechas, PRs, rutinas o autenticación debe probarse a mano (levantar `server`+`client`, probar en navegador contra datos reales) antes de darlo por bueno — no hay red de seguridad que atrape una regresión. El bug de zona horaria de v2.2.0 es el ejemplo directo de lo que pasa sin esto: se "arregló" 3 veces en sitios distintos antes de resolverse por completo.

---

## 📝 Guía para Modificar Documentación

Para mantener esta documentación al día:

1.  **Integridad:** Este archivo es la fuente de verdad. Si el código cambia, actualiza esto primero.
2.  **Detalle:** Mantén la descripción detallada de "Páginas y Componentes". No resumas excesivamente.
3.  **Schema:** Copia y pega el schema real si hay migraciones.
4.  **Changelog:** Registra cada cambio significativo abajo.

---

## 📋 Changelog Histórico

### v2.2.0 (3 Julio 2026) - **Current**
Origen: auditoría completa de código (solo lectura) seguida de una corrección exhaustiva, y luego una auditoría de experiencia real usando la cuenta de producción con datos reales (265 sesiones).

*   **FIX CRÍTICO — Zona horaria (UTC vs. Ciudad de México), causa raíz compartida:** el contenedor corre en UTC pero la app es de un solo usuario, siempre en CDMX (UTC-6). Los fixes de v2.1.0 (Atajos iOS) solo cerraron dos síntomas puntuales; el mismo patrón seguía vivo en **5 sitios**: la racha y el heatmap (`stats/overview`, `stats/consistency` agrupaban por día vía `.toISOString()`, siempre UTC), la ventana de "hoy" de los endpoints de Atajos (`resolveTargetDate`/`startOfDay`/`endOfDay` seguían usando accesores locales del contenedor en el camino de `?date=` explícito), y el filtro por día de semana del historial. Todo se centralizó en helpers nuevos y compartidos en `server/src/index.js`: `mexicoCityDateStr`, `mexicoCityDayBounds`, `mexicoCityHour`, `dayOfWeekFromDateStr`. Cualquier código nuevo que agrupe/filtre por día debe usarlos — no repetir el patrón viejo.
*   **SECURITY (auditoría completa):**
    - Recuperación de contraseña (`POST /api/auth/recover/verify`) ahora tiene un segundo límite por **cuenta objetivo** (5 intentos/30min), no solo por IP — antes alguien con IPs rotativas podía forzar-bruta la respuesta de seguridad contra el único username sin cooldown de cuenta.
    - `PUT /api/auth/security-question` ahora **exige la contraseña actual** (igual que cambiar contraseña) — antes un JWT robado alcanzaba para reescribir en silencio el único mecanismo de recuperación de la cuenta.
    - **Revocación de sesión vía `User.tokenVersion`:** cambiar contraseña o pregunta de seguridad lo incrementa, invalidando todos los JWT emitidos antes (`authMiddleware` lo verifica en cada request contra el DB). Antes un token filtrado (365 días de vida) seguía siendo válido aunque se "arreglara" la cuenta. Ambas rutas devuelven un `token` nuevo en la respuesta para no cerrar la sesión de quien hizo el cambio legítimo.
    - `cors()` ya no refleja cualquier `Origin` — bloqueado a same-origin en producción salvo que se configure `CORS_ORIGIN`.
    - `rateLimit()` ganó soporte de `keyFn` (límite por cuenta, no solo IP/ruta) y un tope de tamaño de emergencia en el Map en memoria.
    - Subida de imágenes a Catbox ahora valida que el contenido decodificado sea realmente una imagen (firma de bytes) y que la URL de respuesta tenga el formato esperado — antes se confiaba a ciegas en ambos.
    - `helmet()` agregado (cabeceras de seguridad estándar; CSP desactivada a propósito, rompía los assets de este build de Vite). `jwt.verify` ahora fija `algorithms: ['HS256']`. Longitud mínima de contraseña (8) aplicada server-side en registro/cambio/recuperación.
*   **INTEGRIDAD DE DATOS:**
    - `WorkoutLog.exercise` ahora declara `onDelete: Restrict` explícito en el schema (antes dependía del default implícito de Postgres — un `onDelete: Cascade` "corrector" bien intencionado se habría llevado el historial).
    - `PUT` y `DELETE /api/routines/:id` envueltos en `prisma.$transaction` — antes una rutina grande podía quedar parcialmente actualizada si algo fallaba a la mitad.
    - Fallback de `targetSets` (`|| 3`) aplicado consistentemente en los 3 caminos de escritura del editor de rutinas — antes 2 de 3 podían persistir `NaN` y romper en silencio la detección de "día completo".
    - `recalcPRForExercise` ahora ordena los logs por fecha ascendente — antes un empate exacto de 1RM estimado podía hacer que la fecha del PR "saltara" entre recálculos según el orden arbitrario de Postgres.
    - Nuevos índices (`WorkoutLog.exerciseId/date`, `Exercise.routineDayId/name`) en columnas de alto tráfico sin ninguno antes.
    - Validación de rango en métricas de `/api/body` y `/api/body/log` (antes un `NaN` o un valor absurdo se guardaba tal cual).
*   **DEPENDENCIAS:** `jspdf` y `react-router-dom` actualizados vía `npm audit fix` (tenían CVEs crítica y altas respectivamente) — 0 vulnerabilidades en cliente y servidor.
*   **FEATURE — Recordatorio de re-enganche:** `checkReengagementReminders` (revisa cada 30 min) infiere la hora habitual de gym del usuario (moda de la hora del día en sus últimas ~40 sesiones reales) y, si lleva 3+ días sin registrar actividad, manda un push "¿No vas a entrenar hoy?" a esa hora — máximo uno por día (`User.lastReengagementNotifiedAt`). No-op sin VAPID configurado, mismo criterio que `scheduleRestReminder` (con quien ahora comparte el helper `sendPushToUser`).
*   **FIX — Fricciones de experiencia real (encontradas usando la app con la cuenta de producción, no solo leyendo código):**
    - La insignia "SUGERIDO" en `Workout.jsx` no rellenaba el set al tocarla — el handler existía pero sobrescribía las 3 series en vez de solo la primera vacía. Ahora rellena solo la primera serie sin peso/reps, sin pisar lo que ya escribiste.
    - Las medallas de `AchievementsStrip.jsx` invitaban a "tocar para ver cómo conseguirla" pero no abrían nada. Ahora abren un modal con ícono, descripción, progreso real y estado de desbloqueo.
    - Temporizador de descanso visual agregado en `Workout.jsx` (respaldo de la notificación push, poco fiable en iOS Safari/PWA) — **se corrigió en la primera verificación**: se cancelaba solo al avanzar de ejercicio, que pasa ~300ms después de guardar una serie por el auto-avance; el descanso real sigue corriendo aunque cambie la vista, así que ya no se cancela ahí.
    - `POST /api/goals` ahora rechaza (409) un objetivo duplicado exacto (mismo ejercicio+peso+reps, no cumplido) — se encontró un caso real de dos objetivos idénticos en la cuenta de producción sin ningún aviso.
*   **FRONTEND (auditoría):** manejo de fallos de red centralizado en `services/api.js` (`safeFetch`, antes solo un método de ~41 tenía try/catch de red), `logout()` revoca la suscripción push del dispositivo, `Dashboard.jsx` ahora muestra errores (antes era la única pantalla sin toasts), doble-submit corregido en el tab Manual de `Import.jsx`, caché local de `Workout.jsx` invalidado tras editar una sesión desde `EditSession.jsx`, `GoalModal.jsx` (código muerto, fórmula 1RM duplicada y desincronizada) eliminado, y una decena de fixes menores (`BodyTracking.jsx` mostraba siempre "(30d)" aunque el dato más cercano fuera de hace meses, truncado de texto seguro para emojis en `ExportReport.jsx`, `EditRoutine.jsx` usa toasts en vez de `alert()`, trims de input en Login/Register/ForgotPassword).
*   **Verificado end-to-end** contra la cuenta real de producción: login, una sesión de entreno completa (registro y borrado de series de prueba), racha/heatmap, progreso, cuerpo, configuración, el modal de logros, el 409 de objetivo duplicado y el temporizador de descanso sobreviviendo el cambio de ejercicio.

### v2.1.0 (2 Julio 2026)
*   **FEATURE — Atajo de iOS (Shortcuts):** Nuevos endpoints `GET /api/shortcuts/next-set` (resuelve rutina activa → día de hoy [mismo criterio de nombre de día que el Dashboard] → próximo ejercicio sin completar → sugerencia de Smart Loading, todo en JSON plano sin anidar) y `POST /api/shortcuts/log-set` (registra UNA serie; agrupa en el `WorkoutLog` de hoy si ya existe uno para ese ejercicio, en vez de fragmentar). Auth: el mismo Bearer JWT de siempre (365 días), sin mecanismo nuevo — se obtiene una vez con `POST /api/auth/login` y se pega en el Atajo. El algoritmo de Smart Loading (doble progresión + RIR) y la lógica de "qué día toca" (antes solo en `Workout.jsx`/`Dashboard.jsx`) se portaron al backend como funciones puras.
*   **FEATURE — Notificaciones Web Push (recordatorio de descanso):** Nuevo modelo `PushSubscription`. Al registrar una serie (vía PWA o el Atajo) se agenda un recordatorio (`restSeconds` del ejercicio, 90s por defecto) que envía una notificación push real cuando expira — funciona con la PWA en segundo plano, incluyendo iOS 16.4+ (solo si la app está añadida a la pantalla de inicio, no en pestaña de Safari). Service worker (`sw.js`) con listeners `push`/`notificationclick`. Toggle en Configuración → Cuenta. Timer en memoria (no persistente): no sobrevive a un reinicio del servidor a mitad del descanso — aceptado dado el tamaño del proyecto. Variables opcionales `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`; sin ellas la función queda en no-op.
*   **FIX CRÍTICO — Objetivos marcaban "cumplido" prematuramente:** `GoalCard.jsx` comparaba el 1RM (Epley) del mejor set de las últimas 3 sesiones contra la meta, sin importar cuántas reps tenía ese set. Una serie submáxima de muchas reps (p. ej. 100kg×7) podía superar por extrapolación una meta exigente a pocas reps (p. ej. 120kg×1) aunque el usuario nunca hubiera probado nada cerca de ese peso a esas reps — confirmado contra datos reales de producción (un caso real: 100kg×7 daba una estimación de 123.3kg superando una meta de 120kg×1, mientras el máximo real probado — 115kg×1 a RPE 10, el mismo día — quedaba descartado por dar un Epley "menor"). Nueva función `bestOneRepMaxForTarget` (en `utils/exerciseName.js`, cliente y servidor): solo cuentan series con reps ≤ target+1. El backend (`GET /api/goals`) ahora calcula y persiste `achievedAt` de forma independiente y autoritativa (nunca confía en un flag del cliente); es una puerta de un solo sentido, como un PR. El checklist manual de semanas sigue sin poder forzar "cumplido" por sí solo.
*   **FEATURE — Deduplicación de ejercicios vía LLM (`ExerciseAgentService`):** Al importar una rutina JSON (y al añadir un ejercicio nuevo a un día existente), `server/src/services/exerciseAgent.js` hace UNA sola llamada a OpenAI (gpt-4o-mini) por operación para clasificar cada ejercicio entrante contra el catálogo existente del usuario (incluye archivados), evitando duplicados como "Press Banca" / "press de banca" / "Bench Press". Conservador por diseño (nunca fusiona variantes de equipamiento distintas). Sin `OPENAI_API_KEY`, o si la llamada falla/da JSON inválido, cae automáticamente al matching determinista existente (`canonicalExerciseKey`) sin romper el import — un elemento malformado en la respuesta del LLM solo afecta a ese elemento, no a todo el lote.
*   **CHORE:** `server/.env.example` (no existía) documentando todas las variables. Documentado que el schema de Prisma se sincroniza con `db push` (no hay `migrations/`; `migrate dev` pide resetear todo el schema).

### v2.0.1 (29 May 2026)
*   **CONSOLIDACIÓN DE EJERCICIOS (`utils/exerciseName.js`):** Nuevo módulo que identifica el "mismo" ejercicio aunque su nombre varíe entre rutinas (abreviaturas "elev."→"elevaciones", plurales, prefijos de orden "A1.", tildes y **sufijos de grupo muscular entre paréntesis** como "(bíceps)"). Conservador: NO fusiona variantes de equipamiento legítimas ("press inclinado (mancuernas)" ≠ "(hammer o smith)"). Funciones: `canonicalExerciseKey`, `normalizeExerciseName`, `groupHistoryByExercise`, `best1RMRecent`, `epley1RM`.
*   **FIX — Objetivos no mostraban todos los ejercicios:** `NewGoal` construía la lista solo desde la 1ª copia de cada ejercicio en las rutinas (a veces con `muscleGroup` null → invisible al filtrar por músculo). Ahora consolida rutinas + catálogo (`/exercises`, incluye archivados) + historial, resolviendo el grupo muscular con el primer valor no-nulo de cualquier copia. Filtro de músculo case-insensitive + **buscador global** + orden por nº de sesiones.
*   **FIX — "Faltan datos de fuerza inicial" con historial:** El conteo de sesiones de `NewGoal` y el emparejado de `GoalSection`/`GoalCard` ahora usan la misma clave canónica, así un objetivo encuentra su historial pese a variantes del nombre (p. ej. "curl martillo (bíceps)" hereda el historial de "curl martillo"). Además, al crear un objetivo con historial se **persiste un snapshot de `currentOneRepMax`** (mejor 1RM de las últimas 3 sesiones) como respaldo: la tarjeta nunca vuelve a quedarse sin fuerza inicial aunque falle el emparejado de display.
*   **FIX — Sugerencias de Workout (Smart Loading):** El algoritmo tomaba el peso máximo absoluto (un single de tope) como peso de trabajo y el **mínimo** de reps, sugiriendo a veces **bajar** el peso (ej.: tras 120×8/120×7 sugería 117.5×8). Ahora la referencia es la **serie de trabajo más fuerte** (mayor 1RM estimado), usa las **mejores** reps a ese peso (no penaliza la fatiga entre series) y nunca propone bajar la carga. Redondeo de peso sensato (mantiene la rejilla del incremento en barras; medio kilo en poleas/placas con valores no redondos). `aplicar sugerencia` ahora rellena también el lado derecho en unilateral.
*   **UI — Logros (Dashboard):** Rediseño de `AchievementsStrip`: cada medalla muestra **nombre + estado/progreso** (no solo un emoji con tooltip, que no funciona en móvil). Tarjeta de detalle del logro seleccionado (o el próximo a conseguir por defecto) con barra de progreso; toca una medalla para ver cómo desbloquearla.

### v2.0.0 (28 May 2026)
*   **PWA REAL:** Añadido service worker (`client/public/sw.js`) → la app es instalable y funciona offline (assets cache-first, navegación network-first con shell offline, API network-first con respaldo). Registrado en `main.jsx` (solo producción).
*   **PERF:** Code-splitting con `React.lazy`/`Suspense` de las rutas pesadas. El bundle inicial bajó de ~876 KB a ~272 KB (jsPDF/html2canvas y recharts se cargan solo al abrir sus pantallas).
*   **FEATURE — Logros y rachas:** Sistema de logros derivado de las stats reales (`utils/achievements.js` + `components/AchievementsStrip.jsx`), con medallas, progreso al siguiente logro y notificación al desbloquear. Integrado en el Dashboard.
*   **FEATURE — Estándares de fuerza:** Nueva pestaña "Fuerza" en Progreso con calculadora de 1RM (Epley) y nivel por ejercicio (Principiante→Élite) según múltiplo de 1RM sobre el peso corporal (`data/strengthStandards.js` + `utils/strength.js`).
*   **UI:** Dashboard enriquecido (logros + volumen semanal). `background_color` del manifest alineado a OLED.

### v1.9.9 (28 May 2026)
*   **BACKEND ÚNICO:** Eliminados `api/` (serverless de Vercel), `vercel.json` y `shared/` (código muerto). Ahora hay un solo backend (`server/src/index.js`) y un solo `schema.prisma`. Deploy en VPS con Docker/EasyPanel; `Dockerfile` ajustado.
*   **SECURITY:** El server no arranca en producción sin `JWT_SECRET` (antes usaba un secreto por defecto público → tokens falsificables). Rate limiting en `login`/`register`/`recover`. `trust proxy` para IP real tras EasyPanel. Validación server-side de peso/reps (0-2000 kg / 0-1000 reps).
*   **PRs CORRECTOS:** Los récords se recalculan desde los logs reales al crear/editar/eliminar sesiones (antes quedaban récords fantasma al editar a la baja o borrar). El recálculo considera el lado unilateral.
*   **FRONTEND (auditoría):** Manejo central de 401 (logout+redirect), `JSON.parse` seguro y sin logout ante caídas de red en AuthContext, ruta catch-all, fugas de blob URL corregidas (Profile/BodyTracking), `border-3` inexistente → `border-2`, IDs de plantillas rotos remapeados (14 tipos), propagación de `muscleGroup`/`isUnilateral`, race condition del historial de Settings, fechas UTC del PDF, IDs de Toast únicos, emoji corrupto en MuscleIcon, `--bg-body` inexistente → `--bg-dark`.
*   **`/body/log`:** acepta registros con solo composición corporal (sin peso/foto).

### v1.9.8 (28 May 2026)
*   **DATA INTEGRITY (PROD):** El backend serverless (`api/index.js`) ahora archiva ejercicios con historial al editar/eliminar rutinas (antes los borraba en duro → crash P2003 y pérdida de logs). Añadido `GET /routines/trash` y exclusión de la rutina-papelera en `GET /routines`.
*   **DATA INTEGRITY:** El backup JSON (Settings) ahora incluye `weightRight`, `repsRight`, `rpe` (RIR) e `isUnilateral`/`restSeconds` (antes se perdían).
*   **AI REMOVED:** Eliminada la sugerencia vía GPT-4o-mini y el endpoint `/api/ai/suggest`. Sustituida por cálculo local de **peso y reps** (doble progresión + autorregulación por RIR sobre la última sesión completa).
*   **UNILATERAL:** Mejor marca previa, sugerencia, detección de PR, modal de historial, historial de Settings y reporte PDF ahora consideran/ muestran el lado derecho (lado débil para cálculos). Corregido el `memo` de SetCard que congelaba el input de peso derecho.
*   **GOALS:** Tope de progresión escalado al 2.5% del 1RM (antes 1kg/sem fijo, irreal en piernas), sin inflar planes cortos a 12 semanas, y 1RM actual robusto (mejor de las últimas 3 sesiones) coherente entre barra de progreso y semanas completadas. Sesiones agrupadas por fecha local (no UTC).

### v1.9.6 (29 Mar 2026)
*   **FEATURE:** Soporte de ejercicios unilaterales en Workout (inputs IZQ/DER separados).
*   **AI:** Sugerencia de carga vía GPT-4o-mini analizando historial con RIR.
*   **FIX:** Alineación correcta del calendario heatmap (semanas empiezan en lunes).
*   **FIX:** Streak ya cuenta días de descanso programados automáticamente.
*   **FEATURE:** Historial ilimitado en Configuración con filtros (búsqueda, rango de fechas, día de semana).
*   **FIX:** PDFs incluyen datos de RIR por serie y columna 1RM estimado en tabla de PRs.
*   **GOALS:** Progreso automático desde historial real (1RM vs proyección por semana).
*   **API:** Endpoint `PUT /api/workouts/fix-weights` para corrección masiva de pesos en DB.

### v1.9.5 (28 Ene 2026)

*   **DATA INTEGRITY:** Implementación de "Papelera de Historial" (Smart Archive). Los ejercicios con logs ya no se eliminan al editar rutinas; se mueven a una rutina de sistema oculta para proteger los datos.
*   **SMART RESTORE:** Lógica automatizada en el backend que detecta si un ejercicio nuevo (o renombrado) ya existe en la papelera. Si coincide el nombre (insensible a mayúsculas), restaura el ejercicio original preservando su ID único y todo su historial.
*   **FIX:** Corregidos errores 500 (P2003) al intentar eliminar ejercicios que tenían registros vinculados.
*   **UI:** Nueva sección "Papelera de Historial" integrada en **Configuración > Historial**, permitiendo acceso y gestión de ejercicios archivados.

### v1.9.4 (13 Ene 2026)
*   **CORE FIX:** Corrección en `GoalCard.jsx` para normalizar el input manual de 1RM con la fórmula de Epley, evitando "easy mode" accidental.
*   **ALGORITMO:** Suavizado (Smoothing) de la curva de intensidad en la fase de fuerza (0.75-0.85) para conectar fluidamente con el Peaking.
*   **DOCS:** Restauración masiva de documentación detallada en `context.md`.

### v1.9.3 (12 Ene 2026)
*   **UI:** Rediseño total de la página de Configuración (`Settings.jsx`). Tabs, animaciones y mejor UX.
*   **FEATURE:** Nueva herramienta de "Clasificación Muscular" en Settings.
*   **FEATURE:** Exportación de Backup completo (JSON) desde el cliente.
*   **SECURITY:** Implementada pregunta de seguridad y recuperación de contraseña sin email.

### v1.9.2 (11 Ene 2026)
*   **PDF:** Mejora en el motor de reportes. Añadida sección de "Detalle Diario" con comparativas de volumen.
*   **DATA:** Extensión del modelo `BodyLog` para soportar métricas de bioimpedancia (agua, hueso, etc.).

### v1.9.0 (Ene 2026)
*   **MAJOR:** Lanzamiento del sistema de **Goals** (Objetivos).
*   **ALGO:** Implementación inicial del motor de periodización ondulatoria.

### v1.8.x (Dic 2025)
*   Migración a PostgreSQL + Prisma.
*   Sistema Multi-usuario (Auth JWT).

---

## 🚀 Comandos

```bash
# Iniciar Backend
cd server && npm run dev

# Iniciar Frontend
cd client && npm run dev

# Prisma Studio (Ver datos)
cd server && npx prisma studio
```