# NexLift v1.7.1 - AI Context & Project Documentation

> **Documentación completa para IAs y desarrolladores que trabajen en este proyecto.**

---

## 🎯 Resumen del Proyecto

**NexLift** es una Progressive Web App (PWA) de tracking de gimnasio diseñada mobile-first con tema OLED oscuro. Permite registrar entrenamientos, trackear progreso, gestionar composición corporal, y generar reportes PDF profesionales.

### Stack Tecnológico
- **Frontend:** React 18 + Vite + Tailwind 4 + Recharts
- **Backend:** Express + Prisma + PostgreSQL  
- **Deployment:** Vercel (serverless) / VPS Docker / Local

---

## 🏗️ Arquitectura del Proyecto

```
NexLift/
├── client/                    # Frontend React (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── Layout.jsx       # Navbar inferior + estructura
│   │   │   └── ui/
│   │   │       ├── Toast.jsx        # Sistema de notificaciones
│   │   │       └── Celebration.jsx  # Animación confeti para PRs
│   │   ├── pages/                   # 11 páginas principales
│   │   │   ├── Dashboard.jsx        # Inicio, heatmap, stats (463 líneas)
│   │   │   ├── Progress.jsx         # Gráficas, PRs, análisis (986 líneas)
│   │   │   ├── BodyTracking.jsx     # Composición corporal (693 líneas)
│   │   │   ├── Workout.jsx          # Registro de ejercicios (850 líneas)
│   │   │   ├── Routines.jsx         # Lista de rutinas (404 líneas)
│   │   │   ├── RoutineDetail.jsx    # Detalle de día (273 líneas)
│   │   │   ├── EditRoutine.jsx      # Editar rutina (528 líneas)
│   │   │   ├── EditSession.jsx      # Editar sesión pasada (287 líneas)
│   │   │   ├── ExportReport.jsx     # Generador PDF (919 líneas)
│   │   │   ├── Settings.jsx         # Configuración (447 líneas)
│   │   │   └── Import.jsx           # Importar rutinas JSON (198 líneas)
│   │   ├── services/
│   │   │   └── api.js               # Cliente HTTP (~25 métodos)
│   │   └── index.css                # Variables CSS tema OLED
│   └── public/
│       └── manifest.json            # PWA config
├── server/                          # Backend desarrollo local
│   ├── prisma/
│   │   └── schema.prisma            # Modelos de BD
│   └── src/
│       └── index.js                 # API Express (~700 líneas)
├── api/                             # Backend Vercel (serverless)
│   ├── prisma/
│   │   └── schema.prisma            # ⚠️ DEBE estar sincronizado
│   └── index.js                     # Handler serverless (~673 líneas)
├── Dockerfile                       # Deploy VPS/Easypanel
└── .agent/
    └── context.md                   # Este archivo
```

### Decisiones Arquitectónicas

| Decisión | Razón |
|----------|-------|
| **Dos backends (server/ y api/)** | `server/` para dev local con hot reload, `api/` para serverless Vercel |
| **Dos schemas Prisma** | Vercel usa su propio directorio; AMBOS deben estar sincronizados |
| **localStorage en Workout** | Evita pérdida de datos si el usuario cierra la app antes de guardar |
| **Base64 para fotos** | Simplicidad: no requiere storage externo (S3, Cloudinary) |
| **Fórmula Epley unificada** | `peso × (1 + reps/30)` consistente en frontend y backend |

---

## 📊 Modelo de Datos

```prisma
model Routine {
  id        String       @id @default(cuid())
  name      String
  isActive  Boolean      @default(false)
  days      RoutineDay[]
  createdAt DateTime     @default(now())
}

model RoutineDay {
  id        String     @id @default(cuid())
  dayName   String     // "Lunes", "Martes", etc.
  routine   Routine    @relation(...)
  exercises Exercise[]
}

model Exercise {
  id          String       @id @default(cuid())
  name        String
  targetSets  Int          @default(3)
  targetReps  String       @default("8-12")
  muscleGroup String?      // Clasificación opcional
  workoutLogs WorkoutLog[]
}

model WorkoutLog {
  id         String   @id @default(cuid())
  date       DateTime @default(now())
  exercise   Exercise @relation(onDelete: Restrict)
  sets       SetLog[]
}

model SetLog {
  id        String     @id @default(cuid())
  setNumber Int
  weight    Float
  reps      Int
  rpe       Int?       // Rating of Perceived Exertion (1-10)
}

model PersonalRecord {
  id           String   @id @default(cuid())
  exerciseName String   // Normalizado (minúsculas, sin prefijos)
  weight       Float
  reps         Int
  estimated1RM Float
  date         DateTime @default(now())
}

model RestLog {
  id   String   @id @default(cuid())
  date DateTime @default(now())
}

model BodyLog {
  id          String   @id @default(cuid())
  date        DateTime @default(now())
  weight      Float?   // kg
  photo       String?  @db.Text  // Base64
  note        String?
  // Campos de báscula inteligente (todos opcionales)
  bmi         Float?   // Índice de Masa Corporal
  bodyFat     Float?   // Grasa corporal %
  muscleMass  Float?   // Masa muscular kg
  bmr         Float?   // Metabolismo basal kcal/día
  bodyWater   Float?   // Agua corporal %
  visceralFat Float?   // Grasa visceral (nivel 1-59)
  boneMass    Float?   // Masa ósea kg
  protein     Float?   // Proteínas %
}
```

### Relaciones Clave
```
Routine → RoutineDay → Exercise → WorkoutLog → SetLog
                                      ↓
                              PersonalRecord (automático)
```

---

## 🔌 API Endpoints

### Rutinas
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/routines` | Lista todas las rutinas con días y ejercicios |
| GET | `/api/routines/:id` | Detalle de rutina específica |
| POST | `/api/routines` | Crear nueva rutina |
| PUT | `/api/routines/:id` | Actualizar rutina (incluyendo renombrar ejercicios) |
| DELETE | `/api/routines/:id` | Eliminar rutina (protegido si hay logs) |
| POST | `/api/routines/import` | Importar rutina desde JSON |
| PUT | `/api/routines/:id/activate` | Activar rutina (desactiva otras) |
| GET | `/api/routines/active` | Obtener rutina activa actual |

### Entrenamientos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/workouts/log` | Registrar sesión (crea WorkoutLog + SetLogs + PR si aplica) |
| GET | `/api/workouts/history?limit=N` | Historial de sesiones (default 30) |
| GET | `/api/workouts/exercise/:id/history` | Historial por ejercicio (busca por nombre) |
| DELETE | `/api/workouts/:id` | Eliminar sesión específica |

### Estadísticas
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/stats/overview` | Total workouts, ejercicios, streak actual |
| GET | `/api/stats/consistency` | Eventos para calendar heatmap (365 días) |
| GET | `/api/stats/prs` | Todos los Personal Records |
| GET | `/api/stats/exercise/:name/progress` | Evolución de ejercicio específico |

### Body Tracking
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/body/logs?limit=N` | Registros corporales con composición |
| GET | `/api/body/photos` | Solo registros con fotos |
| POST | `/api/body/log` | Crear registro (peso + composición + foto) |

### Otros
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/rest/log` | Registrar día de descanso |
| GET | `/api/rest/logs` | Historial de descansos |
| PUT | `/api/exercises/:id` | Actualizar muscleGroup de ejercicio |

---

## 🎨 Custom Hooks Importantes

### `useWorkoutPersistence(dayId)` - Workout.jsx
```javascript
// Maneja localStorage con expiración de 24h
const { workoutData, setWorkoutData, completedExerciseIds, 
        setCompletedExerciseIds, saveToStorage, clearStorage } = useWorkoutPersistence(dayId);
```

### `useExerciseHistory(exerciseId)` - Workout.jsx
```javascript
// Auto-carga historial al cambiar ejercicio, busca mejor set en TODAS las sesiones
const { previousBest, suggestedWeight, loading, loadHistory } = useExerciseHistory(exerciseId);
```

### `useProgressData()` - Progress.jsx
```javascript
// Carga todos los datos de progreso: stats, PRs, events, workouts
const { stats, prs, events, workouts, exercises, loading } = useProgressData();
```

### `useExerciseProgress(exerciseName)` - Progress.jsx
```javascript
// Datos de evolución para gráfica de ejercicio específico
const { data, loading } = useExerciseProgress(exerciseName);
```

---

## 🎨 Patrones de UI

### Variables CSS (index.css)
```css
:root {
  --bg-dark: #0a0a0a;      /* Fondo principal OLED */
  --bg-card: #141414;      /* Tarjetas */
  --bg-main: #0a0a0a;      /* Alias */
  --primary: #8b5cf6;      /* Púrpura principal */
  --success: #22c55e;      /* Verde éxito */
  --warning: #eab308;      /* Amarillo warning */
  --error: #ef4444;        /* Rojo error */
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --border: #27272a;
}
```

### Componentes Reutilizables
- **Toast:** Context API para notificaciones globales (`useToast()`)
- **Celebration:** Confeti animado cuando se logra un PR
- **SkeletonLoader:** Placeholders durante carga

### PDFBuilder Class (ExportReport.jsx)
```javascript
class PDFBuilder {
  ensureSpace(height)           // Evita títulos huérfanos
  printSectionTitle(title)      // Títulos consistentes
  drawLineChart(data, w, h)     // Gráficas nativas en PDF
  renderHeader(logo, period)    // Header con logo
  renderFooters()               // Numeración de páginas
}
```

---

## ⚠️ Gotchas y Problemas Conocidos

### 1. Dos Schemas Prisma
```
⚠️ server/prisma/schema.prisma  ← Desarrollo local
⚠️ api/prisma/schema.prisma     ← Producción Vercel
```
**AMBOS deben estar sincronizados.** Si agregas campos, actualiza los dos.

### 2. Historial de Ejercicios por Nombre
La API `/api/workouts/exercise/:id/history` ahora busca por **nombre del ejercicio** (case-insensitive) para incluir datos de ejercicios con el mismo nombre en diferentes rutinas.

### 3. Comparación de Fechas
Usar `toLocaleDateString('sv')` en lugar de `toISOString().split('T')[0]` para evitar problemas de timezone.

### 4. localStorage Expira en 24h
Los datos parciales de workout expiran automáticamente para evitar confusión con datos viejos.

### 5. PRs Automáticos
- Fórmula Epley: `peso × (1 + reps/30)`
- Safety: solo para `reps > 1 && reps < 37`
- Solo se guardan si superan el PR anterior

### 6. Fotos Comprimidas
`compressImage()` en BodyTracking.jsx reduce fotos a max 1200px y 85% quality antes de guardar en base64.

### 7. jsPDF no soporta emojis
Los títulos de PDF usan texto plano sin emojis.

---

## 🔄 Flujos de Usuario Críticos

### Flujo de Entrenamiento (Workout.jsx)
```
1. Usuario entra a Workout desde RoutineDetail
2. Se cargan ejercicios del día + se verifica cuáles ya se completaron hoy
3. Por cada ejercicio:
   a. Se muestra "Mejor anterior" (mejor set de TODO el historial)
   b. Se muestra peso sugerido (basado en fórmula inversa de Epley)
   c. Usuario registra peso/reps/RIR por cada serie
   d. Al guardar: API crea WorkoutLog + SetLogs
   e. Se verifica si es PR → animación si es nuevo récord
4. Al terminar: se limpia localStorage, pantalla de éxito
```

### Flujo de PDF (ExportReport.jsx)
```
1. Usuario selecciona período (diario/semanal/mensual/trimestral/anual)
2. Se cargan en paralelo: stats, PRs, workouts, bodyLogs
3. Se filtran por fecha de corte
4. PDFBuilder genera documento con:
   - Header con logo y período
   - Resumen de estadísticas
   - Tabla de sesiones
   - PRs del período
   - Datos de composición corporal
   - Fotos de progreso (si hay)
5. Descarga automática
```

---

## 📋 Changelog

### v1.7.1 - Workout Bug Fixes & UI Cleanup (9 Ene 2026)
- ✅ "Mejor anterior" corregido: busca en TODAS las sesiones
- ✅ API busca historial por nombre de ejercicio
- ✅ Requests paralelas con Promise.all
- ✅ localStorage expira después de 24h
- ✅ Fix timezone con toLocaleDateString('sv')
- ✅ Auto-load de historial al cambiar ejercicio
- ✅ Fix aviso "salir sin guardar" después de guardar
- ✅ UI simplificada: eliminados botones +/- y números de serie
- ✅ Texto de botón correcto en último ejercicio

### v1.7.0 - Exercise Normalization (8 Ene 2026)
- ✅ Normalización de ejercicios: `normalizeExerciseName()`
- ✅ Autocomplete en EditRoutine
- ✅ Dockerfile arreglado para Prisma

### v1.6.x - Data Integrity & 1RM Formula
- ✅ Fórmula Epley unificada
- ✅ Case-insensitive PR renaming
- ✅ onDelete: Restrict en schema

### v1.5.0 - VPS Deployment
- ✅ Dockerfile para Docker/Easypanel
- ✅ Middleware para servir frontend estático

### v1.4.0 - Body Composition System
- ✅ Campos de báscula inteligente (8 métricas)
- ✅ Galería de fotos de progreso
- ✅ Integración en PDF

### v1.3.0 - Persistence & Sessions
- ✅ localStorage para evitar pérdida de datos
- ✅ Detección de ejercicios completados hoy
- ✅ EditSession para editar sesiones pasadas

---

## 📝 Notas para IAs Futuras

1. **Verifica el período** al depurar datos faltantes en reportes
2. **Sincroniza ambos schemas** al modificar modelos
3. **No elimines Ghost Mode** - feature valorada
4. **Usa refs** para cancelar requests obsoletos
5. **Tailwind 4** usa PostCSS, no tailwind.config.js
6. **Testing manual** - no hay tests automatizados

---

*Última actualización: 9 Enero 2026 - v1.7.1*
