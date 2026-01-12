# NexLift - Documentación Completa del Proyecto

> **Documentación exhaustiva para IAs y desarrolladores que trabajen en este proyecto.**
> **Versión: 1.9.2 | Última actualización: 11 Enero 2026**

---

## 🎯 ¿Qué es NexLift?

**NexLift** es una Progressive Web App (PWA) completa de tracking de gimnasio. Está diseñada mobile-first con tema OLED oscuro para ahorro de batería en móviles con pantalla AMOLED.

### Funcionalidades Principales

| Característica | Descripción |
|----------------|-------------|
| 🏋️ **Registro de Entrenamientos** | Log de ejercicios con series, repeticiones, peso y notas |
| 📈 **Progreso Visual** | Gráficas de evolución, heatmaps de consistencia, PRs |
| 📊 **Composición Corporal** | Peso, grasa, músculo, BMI, fotos de progreso |
| 📋 **Gestión de Rutinas** | Crear, editar, importar rutinas de entrenamiento |
| 📄 **Reportes PDF** | Exportar informes profesionales con estadísticas |
| 👤 **Sistema Multi-Usuario** | Cuentas individuales con autenticación JWT |
| 📱 **PWA Instalable** | Funciona offline, instalable como app nativa |

### Stack Tecnológico

```
Frontend:  React 18 + Vite + Tailwind CSS 4 + Recharts
Backend:   Express.js + Prisma ORM + PostgreSQL
Fotos:     Catbox.moe (almacenamiento gratuito ilimitado)
Deploy:    Vercel (serverless) | VPS Docker | Local
```

---

## 📱 Páginas y Componentes

### 1. Dashboard (`Dashboard.jsx`)
**Ruta:** `/` (Home)

La página principal muestra un resumen del progreso del usuario:

- **Header personalizado:** Saludo con nombre y hora del día
- **Tarjetas de estadísticas rápidas:**
  - Racha actual de entrenamientos (streak)
  - Total de workouts del mes
  - Personal Records del mes
  - Días restantes en el mes
- **Heatmap de actividad:** Calendario visual estilo GitHub mostrando días de entrenamiento
- **Última sesión:** Resumen del último workout con ejercicios y PRs logrados
- **Acceso rápido:** Botón para ir al workout activo

**API usada:**
- `GET /api/stats/overview` - Estadísticas generales
- `GET /api/stats/consistency` - Datos del heatmap
- `GET /api/workouts/history?limit=1` - Última sesión

---

### 2. Workout (`Workout.jsx`)
**Ruta:** `/workout`

Página principal para registrar el entrenamiento del día:

- **Carga la rutina activa:** Muestra los ejercicios del día correspondiente
- **Cards de ejercicio:**
  - Nombre del ejercicio con grupo muscular
  - Input para peso (kg) y repeticiones
  - Botón para agregar series adicionales
  - Historial de la última sesión del mismo ejercicio
  - Notas opcionales por ejercicio
- **Detección automática de PRs:** Si se supera el mejor peso, muestra celebración con confeti
- **Guardado por ejercicio:** Cada ejercicio se guarda individualmente
- **Día de descanso:** Opción de registrar día de descanso

**API usada:**
- `GET /api/routines/active` - Rutina activa con ejercicios
- `POST /api/workouts/log` - Registrar workout
- `POST /api/workouts/log-rest` - Registrar día de descanso
- `GET /api/workouts/exercise/:id/history` - Historial de ejercicio

---

### 3. Routines (`Routines.jsx`)
**Ruta:** `/routines`

Gestión de rutinas de entrenamiento:

- **Lista de rutinas:** Muestra todas las rutinas del usuario
- **Indicador de rutina activa:** Badge visual en la rutina en uso
- **Acciones por rutina:**
  - Ver detalle
  - Editar
  - Activar/Desactivar
  - Eliminar con confirmación
- **Botón importar:** Permite importar rutinas desde archivo JSON

**API usada:**
- `GET /api/routines` - Listar rutinas
- `PUT /api/routines/:id/activate` - Activar rutina
- `DELETE /api/routines/:id` - Eliminar rutina

---

### 4. Routine Detail (`RoutineDetail.jsx`)
**Ruta:** `/routines/:id`

Vista detallada de una rutina específica:

- **Información general:** Nombre, descripción, días de la semana
- **Lista de días:** Cada día con sus ejercicios
- **Por cada día:**
  - Nombre del día (ej: "Lunes - Pecho y Tríceps")
  - Indicador si es día de descanso
  - Lista de ejercicios con:
    - Nombre del ejercicio
    - Series objetivo × Reps objetivo
    - Grupo muscular
    - Notas del ejercicio

---

### 5. Edit Routine (`EditRoutine.jsx`)
**Ruta:** `/routines/:id/edit`

Editor completo de rutinas:

- **Información básica:** Nombre y descripción editable
- **Gestión de días:**
  - Agregar/eliminar días
  - Marcar día como descanso
  - Reordenar días (drag & drop o flechas)
- **Gestión de ejercicios:**
  - Agregar ejercicios a cada día
  - Editar nombre, series, reps, descanso, notas
  - Seleccionar grupo muscular
  - Reordenar ejercicios
  - Eliminar ejercicios
- **Renombrado inteligente de PRs:** Al cambiar nombre de ejercicio, actualiza PRs históricos

**API usada:**
- `GET /api/routines/:id` - Obtener rutina
- `PUT /api/routines/:id` - Guardar cambios

---

### 5.1 Create Routine (`Import.jsx`)
**Ruta:** `/routines/new`

Página unificada para crear nuevas rutinas con 3 métodos:

**Pestañas:**

1. **Plantillas:**
   - Selección de rutinas prediseñadas (PPL, Full Body, Arnold, etc.)
   - Vista previa expandible de cada plantilla
   - Información de días por semana
   
2. **Manual:**
   - Crear rutina desde cero
   - Agregar días con nombre personalizable
   - Marcar días como descanso
   - Agregar ejercicios vía:
     - Búsqueda en base de datos (`exercises.js`)
     - Creación de ejercicio personalizado (escribir nombre nuevo)
   - Editar sets, reps y descanso por ejercicio
   - Valores por defecto: 3 series, 10-12 reps, 90s descanso
   
3. **JSON:**
   - Pegar JSON con estructura definida
   - Muestra ejemplo de estructura esperada
   - Normalización de datos (acepta `sets`/`targetSets`, `reps`/`targetReps`)

**UI Mobile-First:**
- Header sticky con backdrop blur
- Modal de ejercicios fullscreen en móvil
- Botones de acción fijos en la parte inferior

**API usada:**
- `POST /api/routines/import` - Crear rutina

---

### 6. Body Tracking (`BodyTracking.jsx`)
**Ruta:** `/body`

Seguimiento de composición corporal completo:

- **Tarjetas de estadísticas:**
  - Peso actual con cambio vs 30 días
  - BMI con categorización (bajo/normal/sobrepeso/obesidad)
  - Grasa corporal %
  - Masa muscular kg
- **Formulario de registro:**
  - Campos básicos: Peso, foto de progreso
  - Campos avanzados (expandible):
    - BMI, Grasa %, Músculo %, BMR
    - Agua corporal, Grasa visceral
    - Masa ósea, Proteína %
  - Notas opcionales
- **Gráficas con tabs:** Peso / Grasa / Músculo a lo largo del tiempo
- **Tabla de historial:** Últimos 10 registros
- **Galería de fotos:** Grid de fotos de progreso con modal ampliar

**API usada:**
- `GET /api/body/logs?days=90` - Historial de registros
- `GET /api/body/photos` - Fotos de progreso
- `POST /api/body/log` - Nuevo registro (auto-upload a Catbox)

---

### 7. Progress (`Progress.jsx`)
**Ruta:** `/progress`

Análisis detallado del progreso:

- **Selector de ejercicio:** Dropdown con búsqueda
- **Gráfica de evolución:** Peso máximo por sesión a lo largo del tiempo
- **Personal Records:**
  - Lista de todos los PRs del usuario
  - Cards con medalla (🥇🥈🥉) para top 3
  - Fecha relativa (hace X días)
  - Peso y reps del PR
- **Heatmap de consistencia:** Calendario de entrenamientos del año
- **Estadísticas de rutina actual:**
  - Ejercicios completados vs totales
  - Porcentaje de cumplimiento
  - PRs logrados en esta rutina

**API usada:**
- `GET /api/stats/prs` - Personal Records
- `GET /api/stats/progress/:name` - Evolución de ejercicio específico
- `GET /api/stats/consistency` - Datos del heatmap
- `GET /api/stats/routine/:id` - Stats de rutina

---

### 8. Export Report (`ExportReport.jsx`)
**Ruta:** `/export`

Generador de reportes PDF profesionales:

- **Selector de período:** 7, 14, 30, 60, 90 días
- **Secciones del reporte:**
  - Encabezado con logo y nombre de usuario
  - Resumen ejecutivo (workouts, PRs, racha)
  - Tabla de Personal Records
  - Gráfica de peso corporal
  - Tabla de composición corporal
  - Fotos de progreso (si hay ≥2)
  - Detalle de entrenamientos
- **Exporta a PDF:** Usa jsPDF + html2canvas

**API usada:**
- `GET /api/workouts/history?days=X` - Historial de workouts
- `GET /api/body/logs?days=X` - Historial corporal
- `GET /api/stats/prs` - Personal Records

**⚠️ Limitación jsPDF:**
- jsPDF NO soporta emojis ni caracteres unicode especiales (Δ, ↑, ↓, 🏆)
- Usar solo caracteres ASCII en el PDF (+, -, texto plano)
- Los emojis se renderizan como símbolos rotos

---

### 9. Profile (`Profile.jsx`)
**Ruta:** `/profile`

Gestión del perfil de usuario:

- **Header con avatar:**
  - Foto de perfil (click para ampliar)
  - Botón para cambiar foto (upload a Catbox)
  - Iniciales si no hay foto
  - Indicador online
- **Información personal:**
  - Nombre completo
  - Email
  - Teléfono
  - Fecha de nacimiento
- **Estadísticas de cuenta:**
  - Días como miembro
  - Total de rutinas
  - Total de PRs
- **Tabs de configuración:**
  - **Perfil:** Editar datos personales
  - **Seguridad:** Cambiar contraseña
  - **Protección:** Pregunta de seguridad para recuperación
- **Logout button**

**API usada:**
- `GET /api/auth/me` - Perfil actual
- `PUT /api/auth/profile` - Actualizar datos
- `PUT /api/auth/password` - Cambiar contraseña
- `PUT /api/auth/security-question` - Pregunta de seguridad
- `POST /api/auth/avatar` - Subir avatar

---

### 10. Login (`Login.jsx`)
**Ruta:** `/login`

Página de inicio de sesión:

- Input de username o email
- Input de contraseña con toggle mostrar/ocultar
- Botón "Olvidé mi contraseña"
- Link a registro
- Manejo de errores

**API usada:**
- `POST /api/auth/login` - Iniciar sesión

---

### 11. Register (`Register.jsx`)
**Ruta:** `/register`

Formulario de registro completo:

- **Campos requeridos:**
  - Nombre y apellidos
  - Username
  - Email
  - Contraseña (min 8 chars)
- **Campos opcionales:**
  - Teléfono
  - Fecha de nacimiento
  - Pregunta de seguridad

**API usada:**
- `POST /api/auth/register` - Crear cuenta

---

### 12. Forgot Password (`ForgotPassword.jsx`)
**Ruta:** `/forgot-password`

Recuperación de cuenta por pregunta de seguridad:

- **Paso 1:** Ingresar username o email
- **Paso 2:** Responder pregunta de seguridad
- **Paso 3:** Establecer nueva contraseña
- Flujo sin email (no requiere servidor de correo)

**API usada:**
- `POST /api/auth/recover/question` - Obtener pregunta
- `POST /api/auth/recover/verify` - Verificar y cambiar password

---

### 13. Import (`Import.jsx`)
**Ruta:** `/import`

Importador de rutinas desde JSON:

- Textarea para pegar JSON
- Validación de estructura
- Preview antes de importar
- Ejemplo de formato

**API usada:**
- `POST /api/routines/import` - Importar rutina

---

### 14. Settings (`Settings.jsx`)
**Ruta:** `/settings`

Configuración general (legacy, la mayoría movido a Profile):

- Unidades de peso (kg/lb)
- Tema (siempre oscuro por ahora)
- Notificaciones

---

### 15. Edit Session (`EditSession.jsx`)
**Ruta:** `/workouts/:id/edit`

Editor de sesiones pasadas:

- Cargar workout histórico
- Modificar series/reps/peso por ejercicio
- Guardar cambios

**API usada:**
- `GET /api/workouts/:id` - Obtener sesión
- `PUT /api/workouts/:id` - Actualizar sesión

---

## 🧩 Componentes Reutilizables

### Layout (`components/layout/Layout.jsx`)
- Navbar inferior con 5 pestañas: Inicio, Rutinas, Cuerpo, Progreso, Perfil
- Iconos de Lucide
- Indicador de pestaña activa
- Safe area para móviles con notch

### Toast (`components/ui/Toast.jsx`)
- Sistema de notificaciones global
- Hook `useToast()` con métodos:
  - `toast.success(message)`
  - `toast.error(message)`
  - `toast.info(message)`
- Auto-dismiss después de 3 segundos
- Posición: bottom-center (arriba del navbar)

### Celebration (`components/ui/Celebration.jsx`)
- Animación de confeti para PRs
- Se activa cuando se logra un nuevo récord personal
- Dura 2 segundos

### ProtectedRoute (`components/ProtectedRoute.jsx`)
- HOC que verifica autenticación
- Redirige a `/login` si no hay sesión
- Muestra loading mientras verifica

---

## 🔐 Sistema de Autenticación

### Flujo de Login
```
1. Usuario → Login con username/email + password
2. Server → Verifica credenciales con bcrypt
3. Server → Genera JWT (expira en 365 días)
4. Client → Guarda token en localStorage (nexlift_token)
5. Client → Guarda user en localStorage (nexlift_user)
6. Client → AuthContext distribuye estado a toda la app
```

### Protección de Rutas
```javascript
// Todas las llamadas protegidas usan authFetch() desde api.js
const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('nexlift_token');
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        }
    });
};
```

### AuthContext (`contexts/AuthContext.jsx`)
```javascript
const { 
    user,           // Datos del usuario actual
    token,          // JWT token
    loading,        // Estado de carga inicial
    isAuthenticated,// Boolean si hay sesión
    login,          // Función login(username, password)
    register,       // Función register(userData)
    logout,         // Función logout()
    updateProfile,  // Función updateProfile(data)
    refreshProfile  // Fuerza recarga del perfil
} = useAuth();
```

---

## 📸 Sistema de Fotos (Catbox)

Las fotos de progreso y avatares se almacenan en Catbox.moe (servicio gratuito):

### Flujo de Upload
```
1. Usuario selecciona imagen
2. Frontend comprime a max 1200px (fotos) o 400px (avatar)
3. Frontend envía base64 al backend
4. Backend detecta base64 y llama a Catbox API
5. Catbox devuelve URL permanente (https://files.catbox.moe/abc.jpg)
6. Backend guarda URL en DB (no el base64)
7. Frontend recibe URL
```

### En el código
```javascript
// Detección automática en el servidor
if (photo.startsWith('data:image') || photo.length > 500) {
    // Es base64 → subir a Catbox
    photoUrl = await uploadBase64ToCatbox(photo, 'jpg');
} else {
    // Ya es URL → usar directamente
    photoUrl = photo;
}
```

---

## 📊 Modelo de Datos

```prisma
model User {
  id                  String     @id @default(uuid())
  username            String     @unique
  email               String     @unique
  passwordHash        String
  firstName           String
  lastName            String
  phone               String?
  birthDate           DateTime?
  avatarUrl           String?
  securityQuestion    String?
  securityAnswerHash  String?
  isActive            Boolean    @default(true)
  createdAt           DateTime   @default(now())
  lastLogin           DateTime?
  
  // Relaciones
  routines            Routine[]
  personalRecords     PersonalRecord[]
  bodyLogs            BodyLog[]
  workoutLogs         WorkoutLog[]
}

model Routine {
  id          String       @id @default(uuid())
  userId      String?
  name        String
  description String?
  isActive    Boolean      @default(false)
  createdAt   DateTime     @default(now())
  days        RoutineDay[]
  user        User?        @relation(...)
}

model RoutineDay {
  id        String     @id @default(uuid())
  routineId String
  dayName   String
  isRestDay Boolean    @default(false)
  order     Int        @default(0)
  exercises Exercise[]
  routine   Routine    @relation(...)
}

model Exercise {
  id          String       @id @default(uuid())
  routineDayId String
  name        String
  targetSets  Int          @default(3)
  targetReps  String       @default("8-12")
  restSeconds Int?
  muscleGroup String?
  note        String?
  order       Int          @default(0)
  workoutLogs WorkoutLog[]
  routineDay  RoutineDay   @relation(...)
}

model WorkoutLog {
  id         String     @id @default(uuid())
  exerciseId String?
  userId     String?
  date       DateTime   @default(now())
  duration   Int?
  note       String?
  isRestDay  Boolean    @default(false)
  sets       SetLog[]
  exercise   Exercise?  @relation(...)
  user       User?      @relation(...)
}

model SetLog {
  id           String     @id @default(uuid())
  workoutLogId String
  weight       Float
  reps         Int
  setNumber    Int
  workoutLog   WorkoutLog @relation(...)
}

model PersonalRecord {
  id           String   @id @default(uuid())
  exerciseName String
  weight       Float
  reps         Int
  date         DateTime @default(now())
  userId       String?
  user         User?    @relation(...)
}

model BodyLog {
  id          String   @id @default(uuid())
  userId      String?
  date        DateTime @default(now())
  weight      Float?
  photoUrl    String?
  note        String?
  bmi         Float?
  bodyFat     Float?
  muscleMass  Float?
  bmr         Float?
  bodyWater   Float?
  visceralFat Float?
  boneMass    Float?
  protein     Float?
  user        User?    @relation(...)
}
```

---

## 🎨 Sistema de Diseño

### Variables CSS (`index.css`)
```css
:root {
  --bg-dark: #0a0a0a;       /* Fondo OLED true black */
  --bg-card: #141414;       /* Cards ligeramente más claras */
  --primary: #8b5cf6;       /* Púrpura principal */
  --primary-glow: rgba(139, 92, 246, 0.25);
  --success: #22c55e;       /* Verde para éxito/PRs */
  --warning: #eab308;       /* Amarillo para warnings */
  --error: #ef4444;         /* Rojo para errores */
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --border: #27272a;
}
```

### Patrones de UI
- **Cards:** `bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]`
- **Gradientes:** `bg-gradient-to-br from-purple-500 to-pink-500`
- **Inputs:** `bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3`
- **Buttons primarios:** `bg-[var(--primary)] hover:bg-purple-600 text-white rounded-xl`
- **Animaciones:** `animate-fade-in`, `transition-all duration-300`

---

## ⚠️ Gotchas y Consideraciones Importantes

### 1. Token en localStorage
```javascript
// ⚠️ Todas las llamadas protegidas DEBEN usar authFetch() o api.xyz()
// ❌ NO usar fetch() directamente para rutas protegidas
const res = await api.getRoutines(); // ✅ Correcto
const res = await fetch('/api/routines'); // ❌ Sin auth header
```

### 2. Dos Schemas Prisma
```
⚠️ server/prisma/schema.prisma  ← Desarrollo local (symlink a shared)
⚠️ api/prisma/schema.prisma     ← Vercel (sincronizar manualmente)
```
Después de cambiar el schema, correr:
```bash
cd api && npx prisma generate
```

### 3. Campo photoUrl vs photo
- **Database:** `photoUrl` (campo real)
- **API response:** A veces mapeado como `photo` para compatibilidad frontend
- **Verificar:** `log.photo || log.photoUrl`

### 4. userId Opcional
Los campos `userId` son opcionales (`String?`) para mantener compatibilidad con datos creados antes de v1.8 (sin usuarios).

### 5. Fechas y Timezone ⚠️ CRÍTICO
```javascript
// ❌ INCORRECTO - interpreta como UTC
new Date("2026-01-05").toLocaleDateString() // Muestra fecha incorrecta!

// ✅ CORRECTO - forzar parseo local
function formatLocalDate(dateStr, options) {
    const dateOnly = dateStr.split('T')[0];
    const [year, month, day] = dateOnly.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-ES', options);
}
```

---

## 🚀 Desarrollo Local

```bash
# Terminal 1 - Backend
cd server
npm run dev  # Puerto 3001

# Terminal 2 - Frontend
cd client
npm run dev  # Puerto 5173
```

### Variables de Entorno
```env
# server/.env
DATABASE_URL="postgresql://user:pass@host:5432/nexlift"
JWT_SECRET="tu_secreto_super_seguro_aqui"
```

---

## � Archivos de Datos Frontend

### exercises.js
**Ruta:** `client/src/data/exercises.js`

Base de datos local de ejercicios predefinidos (~80 ejercicios).

**Estructura:**
```javascript
export const MUSCLE_GROUPS = [
  { id: 'chest', name: 'Pecho' },
  { id: 'back', name: 'Espalda' },
  { id: 'shoulders', name: 'Hombros' },
  { id: 'legs', name: 'Piernas' },
  { id: 'biceps', name: 'Bíceps' },
  { id: 'triceps', name: 'Tríceps' },
  { id: 'forearms', name: 'Antebrazos' },
  { id: 'core', name: 'Core / Abdomen' }
];

export const EXERCISES = [
  { id: 'bench-press', name: 'Press de Banca con Barra', muscleGroup: 'chest' },
  // ... ~80 ejercicios más organizados por grupo
];
```

**Funciones Helper:**
| Función | Descripción |
|---------|-------------|
| `searchExercises(query)` | Busca ejercicios por nombre (min 2 chars) |
| `getExercisesByMuscle(muscleGroup)` | Filtra ejercicios por grupo muscular |
| `getMuscleGroup(id)` | Obtiene info de un grupo muscular |

---

### routineTemplates.js
**Ruta:** `client/src/data/routineTemplates.js`

Plantillas de rutinas predefinidas para quick-start.

**Plantillas incluidas:**
| Template | Días | Descripción |
|----------|------|-------------|
| PPL (Push Pull Legs) | 6 | Split clásico x frecuencia 2 |
| Upper/Lower | 4 | Tren superior/inferior alternado |
| Full Body | 3 | Cuerpo completo cada sesión |
| Bro Split | 5 | Un grupo muscular por día |

**Estructura:**
```javascript
export const ROUTINE_TEMPLATES = [
  {
    id: 'ppl',
    name: 'Push Pull Legs',
    description: 'Split de 6 días...',
    difficulty: 'intermediate', // beginner | intermediate | advanced
    daysPerWeek: 6,
    days: [
      {
        dayName: 'Push (Pecho/Hombros/Tríceps)',
        isRestDay: false,
        exercises: [
          { exerciseId: 'bench-press', order: 0 },
          // ...
        ]
      }
    ]
  }
];
```

---

### MuscleIcon.jsx
**Ruta:** `client/src/components/ui/MuscleIcon.jsx`

Componente para mostrar emojis/iconos de grupos musculares.

```jsx
import MuscleIcon, { MUSCLE_LIST, getMuscleColor } from './ui/MuscleIcon';

// Uso básico
<MuscleIcon muscle="chest" size={24} />

// Obtener color del grupo
const color = getMuscleColor('chest'); // '#ef4444'

// Lista de todos los grupos
MUSCLE_LIST.forEach(m => console.log(m.id, m.name, m.color, m.emoji));
```

---

## 📋 Changelog
### v1.9.2 (11 Ene 2026) - Reportes Avanzados & Fixes
- **Refinamiento de Algoritmo de Progreso**:
  - Implementada fórmula Epley (1RM) para calcular "mejor set" real, reemplazando comparación simple de peso máximo.
  - Nueva métrica **"Fuerza"** en reportes PDF para mostrar mejoras reales de rendimiento.
- **Reportes PDF (`ExportReport.jsx`)**:
  - **Nueva sección diaria**: Comparación detallada de volumen vs mismo día semana anterior, PRs del día y desglose por ejercicio.
  - **Tabla de Progreso expandida**: Muestra 6 columnas clave (Inicio, Actual, Δ Peso, Δ Reps, Δ Fuerza).
  - **Optimización técnica**: Tablas con ancho dinámico (sin `cellWidth` fijos) y compatibilidad ASCII (fix caracteres unicode/emojis).
- **UI & UX**:
  - **Preview Simplificado**: La vista previa en app muestra solo KPIs esenciales (Volumen vs Anterior), dejando el detalle denso para el PDF.
  - **Feedback Inmediato**: `SetCard` (`Workout.jsx`) ahora actualiza visualmente los checkmarks de PR al instante (fix `React.memo`).
  - Badge "Posible PR" reactivo a cambios en historial.


### v1.9.1 (11 Ene 2026) - UX Improvements
- **Dashboard**: Saludo personalizado con nombre del usuario ("Bienvenido de nuevo, {nombre}")
- **Cálculo Epley mejorado**: Peso sugerido ahora usa reps objetivo de la rutina
  - Parsea el rango (ej: "6-10" → usa 6) en lugar de hardcodear 10 reps
- **Workout UI rediseñada** (`Workout.jsx`):
  - Layout simplificado: header y botón en flujo normal (no fijos)
  - SetCard optimizado con `React.memo` y comparación personalizada
  - Validación de inputs para prevenir valores negativos
  - Eliminado `window.confirm` para mejor UX
  - Etiquetas verticales "SET 1", "SET 2" para ahorrar espacio
  - RIR selector estilo segmentado
  - Badge de "Posible PR" cuando superas tu mejor marca
  - Historial modal con diseño mejorado

### v1.9.0 (10 Ene 2026) - Routine Creation Revamp
- Página unificada para crear rutinas (`Import.jsx`)
  - 3 tabs: Plantillas, Manual, JSON
  - Biblioteca de ~80 ejercicios predefinidos
  - Crear ejercicios personalizados
  - 4 plantillas de rutinas (PPL, Upper/Lower, Full Body, Bro Split)
- Modal fullscreen mobile-first para selección de ejercicios
- UI optimizada con botones de acción flotantes
- Archivos de datos: `exercises.js`, `routineTemplates.js`

### v1.8.0 (10 Ene 2026) - Multi-User Auth
- Sistema completo de autenticación JWT
- Páginas: Login, Register, Profile, ForgotPassword
- Integración Catbox para fotos (reemplaza base64)
- Arquitectura multi-tenant con userId en todas las tablas
- Script de migración de fotos existentes

### v1.7.x - Mejoras UI
- Body composition tracking completo
- Heatmaps de consistencia
- Mejoras en gráficas de progreso
- Export PDF mejorado

### v1.6.x - Rutinas
- Importación JSON de rutinas
- Editor de rutinas mejorado
- Renombrado inteligente de PRs

### v1.5.x - Foundation

---

## 🎨 Principios de Diseño y Preferencias

> **Esta sección documenta las preferencias explícitas del usuario y reglas de diseño aprendidas.**

### 1. Reportes y PDF
- **Filosofía**: "Data-rich". El PDF debe estar cargado de información valiosa, bien estructurada y útil para análisis estadístico.
- **Contenido Diario**:
  - Comparar volumen del día vs el mismo día de la semana anterior.
  - No mostrar datos vacíos o irrelevantes.
- **Constraints Técnicos (jsPDF)**:
  - **NO EMOJIS**: jsPDF no los renderiza (se ven como símbolos rotos).
  - **NO UNICODE**: Caracteres como Δ, ↑, ↓ fallan. Usar ASCII (+, -, ^, v) o texto plano.
  - **Tablas**: No usar `cellWidth` fijos que estrechen columnas innecesariamente; dejar que `autoTable` use el ancho disponible.

### 2. UI y Previsualizaciones
- **Filosofía**: "Simple y Directo". A diferencia del PDF, la UI debe mostrar solo lo esencial.
- **Previews**: Evitar saturación. Si hay una comparación compleja, mostrar solo el dato "headline" (ej: cambio de volumen %).
- **Estética**: Tema OLED oscuro (negro puro #000000 o muy oscuro) siempre.

### 3. Lógica de Negocio
- **Cálculo de Fuerza (1RM)**: Usar fórmula Epley: `weight * (1 + reps/30)`. No usar solo peso máximo.
- **Checkmarks**: En `Workout.jsx`, el check debe reaccionar inmediatamente a cambios en `completed` y `isPR`.
- **Ordenamiento**: Cronológico inverso para historiales.

- Core workout logging
- Personal Records tracking
- Dashboard inicial