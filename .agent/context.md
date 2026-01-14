# NexLift - Documentación Completa del Proyecto

> **Documentación exhaustiva para IAs y desarrolladores que trabajen en este proyecto.**
> **Versión:** 1.9.4 | **Última actualización:** 13 Enero 2026

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
Deploy:    Vercel (serverless) | VPS Docker | Local
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
- **Algoritmo de Sugerencia (Smart Loading):**
  - Analiza el historial del ejercicio.
  - Calcula el 1RM estimado de la mejor sesión histórica.
  - Sugiere un peso para igualar ese esfuerzo en el rango de reps actual.
- **Cards de Ejercicio (`SetCard.jsx`):**
  - Componente optimizado (React.memo).
  - Inputs para Peso (kg), Reps y **RIR** (Reps in Reserve).
  - Feedback visual inmediato al completar (verde/check).
  - Badge de "PR" animado si se rompe un récord.
- **Acciones:**
  - "Copiar peso a todo": Facilita el llenado rápido.
  - "Ver historial": Modal con sesiones pasadas.
  - Guardado por ejercicio (granularidad) y finalización global.
  - Persistencia local: `useWorkoutPersistence` guarda en `localStorage` cada keystroke para evitar pérdida de datos si se cierra la app.

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

3.  **Smart Loading (Workout):**
    Calcula la "Mejor Serie Histórica" (mayor 1RM estimado) del ejercicio actual y proyecta ese esfuerzo a las repeticiones objetivo de hoy.
    *Ejemplo: Si tu mejor fue 100kg x 5, y hoy te tocan 8 reps, te sugerirá ~90kg para mantener la misma intensidad relativa.*

---

## 📊 Modelo de Datos (Prisma Schema Completo)

La base de datos PostgreSQL está normalizada y optimizada para queries de series temporales.

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
  createdAt     DateTime  @default(now())
  
  // Relaciones
  routines        Routine[]
  bodyLogs        BodyLog[]
  personalRecords PersonalRecord[]
  goals           Goal[]
  workoutLogs     WorkoutLog[] // (Opcional, logs sueltos)
}

// ==================== RUTINAS ====================
model Routine {
  id          String       @id @default(cuid())
  name        String
  description String?
  isActive    Boolean      @default(false)
  userId      String?
  user        User?        @relation(fields: [userId], references: [id], onDelete: Cascade)
  days        RoutineDay[]
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
  routineDayId String
  routineDay   RoutineDay   @relation(fields: [routineDayId], references: [id], onDelete: Cascade)
  workoutLogs  WorkoutLog[]
}

// ==================== WORKOUTS (Logs) ====================
model WorkoutLog {
  id          String    @id @default(cuid())
  date        DateTime  @default(now())
  exerciseId  String
  exercise    Exercise  @relation(fields: [exerciseId], references: [id])
  sets        SetLog[]
  notes       String?
}

model SetLog {
  id           String     @id @default(cuid())
  setNumber    Int
  weight       Float
  reps         Int
  rpe          Int?       // (1-10) Esfuerzo Percibido / RIR invertido
  completed    Boolean    @default(true)
  workoutLogId String
  workoutLog   WorkoutLog @relation(fields: [workoutLogId], references: [id], onDelete: Cascade)
}

// ==================== METAS & RECORDS ====================
model Goal {
  id               String    @id @default(cuid())
  exerciseName     String
  targetWeight     Float
  targetReps       Int
  currentOneRepMax Float?    // Snapshot para cálculos
  experienceLevel  String?   // 'beginner', 'intermediate', 'advanced'
  frequencyPerWeek Int?
  completedWeeks   Int[]     // Control manual de progreso
  achievedAt       DateTime?
  createdAt        DateTime  @default(now())
  userId           String
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
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
  
  userId      String?
  user        User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
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

### 2. Sincronización de Schema
Existen dos copias de `schema.prisma`:
1.  `server/prisma/schema.prisma` (Desarrollo Local)
2.  `api/prisma/schema.prisma` (Producción Vercel)
**Regla:** Cualquier cambio en el modelo debe aplicarse manualmente a ambos archivos.

### 3. Imágenes
No almacenamos binarios.
1.  Frontend recibe archivo -> Convierte a Base64.
2.  Backend recibe Base64 -> Sube a Catbox API -> Recibe URL.
3.  DB guarda `https://files.catbox.moe/xyz.jpg`.

---

## 📝 Guía para Modificar Documentación

Para mantener esta documentación al día:

1.  **Integridad:** Este archivo es la fuente de verdad. Si el código cambia, actualiza esto primero.
2.  **Detalle:** Mantén la descripción detallada de "Páginas y Componentes". No resumas excesivamente.
3.  **Schema:** Copia y pega el schema real si hay migraciones.
4.  **Changelog:** Registra cada cambio significativo abajo.

---

## 📋 Changelog Histórico

### v1.9.4 (13 Ene 2026) - **Current**
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