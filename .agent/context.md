# NexLift v1.8 - AI Context & Project Documentation

> **Documentación completa para IAs y desarrolladores que trabajen en este proyecto.**
> **Última actualización: 9 Enero 2026 - v1.8.0**

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
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx      # 🆕 v1.8 - Estado de autenticación global
│   │   ├── pages/                   # 15 páginas principales
│   │   │   ├── Dashboard.jsx        # Inicio, heatmap, stats
│   │   │   ├── Progress.jsx         # Gráficas, PRs, análisis
│   │   │   ├── BodyTracking.jsx     # Composición corporal + fotos
│   │   │   ├── Workout.jsx          # Registro de ejercicios
│   │   │   ├── Routines.jsx         # Lista de rutinas
│   │   │   ├── RoutineDetail.jsx    # Detalle de día
│   │   │   ├── EditRoutine.jsx      # Editar rutina
│   │   │   ├── EditSession.jsx      # Editar sesión pasada
│   │   │   ├── ExportReport.jsx     # Generador PDF
│   │   │   ├── Settings.jsx         # Configuración
│   │   │   ├── Import.jsx           # Importar rutinas JSON
│   │   │   ├── Login.jsx            # 🆕 v1.8 - Inicio de sesión
│   │   │   ├── Register.jsx         # 🆕 v1.8 - Registro
│   │   │   ├── ForgotPassword.jsx   # 🆕 v1.8 - Recuperación
│   │   │   └── Profile.jsx          # 🆕 v1.8 - Perfil de usuario
│   │   ├── services/
│   │   │   └── api.js               # Cliente HTTP con auth automático
│   │   └── index.css                # Variables CSS tema OLED
│   └── public/
│       └── manifest.json            # PWA config
├── server/                          # Backend desarrollo local
│   ├── prisma/
│   │   └── schema.prisma            # Symlink → shared/prisma/schema.prisma
│   ├── scripts/
│   │   └── migrate-photos.js        # 🆕 v1.8 - Migración base64→Catbox
│   └── src/
│       └── index.js                 # API Express (~1500 líneas)
├── api/                             # Backend Vercel (serverless)
│   ├── prisma/
│   │   └── schema.prisma            # ⚠️ DEBE estar sincronizado
│   └── index.js                     # Handler serverless (~1200 líneas)
├── shared/                          # 🆕 v1.8 - Código compartido
│   ├── prisma/
│   │   └── schema.prisma            # Schema centralizado
│   ├── middleware/
│   │   └── auth.js                  # Middleware JWT
│   ├── utils/
│   │   ├── password.js              # Hash bcrypt
│   │   └── catbox.js                # Upload a Catbox.moe
│   └── routes/                      # Rutas modulares
│       ├── index.js                 # Barrel export
│       ├── auth.js                  # Autenticación
│       ├── routines.js              # CRUD rutinas
│       ├── workouts.js              # Log workouts
│       ├── exercises.js             # Ejercicios
│       ├── body.js                  # Body tracking
│       └── stats.js                 # Estadísticas
├── scripts/
│   └── sync-schema.js               # Sincroniza schemas
├── Dockerfile                       # Deploy VPS/Easypanel
└── .agent/
    └── context.md                   # Este archivo
```

### Decisiones Arquitectónicas v1.8

| Decisión | Razón |
|----------|-------|
| **Autenticación JWT sin expiración** | UX móvil: usuarios no quieren re-login cada sesión |
| **Catbox para fotos en vez de base64** | Base64 sobrecargaba la DB; Catbox es gratuito e ilimitado |
| **authFetch() centralizado** | Evita olvidar tokens en llamadas individuales |
| **userId en todas las tablas** | Multi-tenant: cada usuario solo ve sus datos |
| **Rutas en shared/ pero inline en index.js** | Evita problemas de resolución de módulos ES en serverless |

---

## 📊 Modelo de Datos (v1.8)

```prisma
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
  avatarUrl     String?   // Foto perfil Catbox
  securityQuestion  String?
  securityAnswerHash String?
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLogin     DateTime?
  
  routines        Routine[]
  bodyLogs        BodyLog[]
  restLogs        RestLog[]
  personalRecords PersonalRecord[]
}

// ==================== RUTINAS ====================
model Routine {
  id          String       @id @default(cuid())
  name        String
  description String?
  isActive    Boolean      @default(false)
  userId      String?      // 🆕 v1.8
  user        User?        @relation(...)
  days        RoutineDay[]
}

model RoutineDay {
  id        String     @id @default(cuid())
  dayName   String
  isRestDay Boolean    @default(false)
  order     Int        @default(0)
  routine   Routine    @relation(...)
  exercises Exercise[]
}

model Exercise {
  id          String       @id @default(cuid())
  name        String
  muscleGroup String?
  targetSets  Int
  targetReps  String
  restSeconds Int?
  note        String?
  order       Int          @default(0)
  routineDay  RoutineDay   @relation(...)
  workoutLogs WorkoutLog[]
}

// ==================== WORKOUTS ====================
model WorkoutLog {
  id         String    @id @default(cuid())
  date       DateTime  @default(now())
  exercise   Exercise  @relation(...)
  sets       SetLog[]
  notes      String?
}

model SetLog {
  id        String     @id @default(cuid())
  setNumber Int
  weight    Float
  reps      Int
  rpe       Int?
  completed Boolean    @default(true)
  workoutLog WorkoutLog @relation(...)
}

// ==================== PERSONAL RECORDS ====================
model PersonalRecord {
  id           String   @id @default(cuid())
  exerciseName String   // Normalizado (minúsculas)
  weight       Float
  reps         Int
  estimated1RM Float?
  date         DateTime @default(now())
  userId       String?  // 🆕 v1.8
  user         User?    @relation(...)
}

// ==================== DESCANSO ====================
model RestLog {
  id     String   @id @default(cuid())
  date   DateTime @default(now())
  note   String?
  userId String?  // 🆕 v1.8
  user   User?    @relation(...)
}

// ==================== BODY TRACKING ====================
model BodyLog {
  id          String   @id @default(cuid())
  date        DateTime @default(now())
  weight      Float?
  photoUrl    String?  // 🆕 v1.8: URL Catbox (antes era base64)
  note        String?
  bmi         Float?
  bodyFat     Float?
  muscleMass  Float?
  bmr         Float?
  bodyWater   Float?
  visceralFat Float?
  boneMass    Float?
  protein     Float?
  userId      String?  // 🆕 v1.8
  user        User?    @relation(...)
}
```

---

## 🔐 Sistema de Autenticación (v1.8)

### Flujo de Auth

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Login     │         │   Server    │         │  Database   │
│   Page      │────────>│  /auth/login│────────>│   Users     │
└─────────────┘         └─────────────┘         └─────────────┘
      │                        │                       │
      │   { token, user }      │     bcrypt.compare    │
      │<───────────────────────│<──────────────────────│
      │                        │                       │
      ▼                        │                       │
┌─────────────┐                │                       │
│ localStorage│                │                       │
│ nexlift_token                │                       │
└─────────────┘                │                       │
      │                        │                       │
      ▼                        │                       │
┌─────────────┐         ┌─────────────┐               │
│ AuthContext │         │authMiddleware               │
│ (isAuth)    │────────>│jwt.verify() │               │
└─────────────┘         └─────────────┘               │
      │                        │                       │
      ▼                        ▼                       │
┌─────────────┐         ┌─────────────┐               │
│api.js       │         │ req.userId  │───────────────│
│authFetch()  │─────────│ attached    │               │
└─────────────┘         └─────────────┘               │
```

### Endpoints de Auth

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | ❌ | Crear cuenta |
| POST | `/api/auth/login` | ❌ | Iniciar sesión |
| GET | `/api/auth/me` | ✅ | Obtener perfil |
| PUT | `/api/auth/profile` | ✅ | Actualizar perfil |
| PUT | `/api/auth/password` | ✅ | Cambiar contraseña |
| POST | `/api/auth/recover/question` | ❌ | Obtener pregunta seguridad |
| POST | `/api/auth/recover/verify` | ❌ | Verificar respuesta y resetear |
| PUT | `/api/auth/security-question` | ✅ | Actualizar pregunta |

### Almacenamiento del Token

```javascript
// Al login exitoso:
localStorage.setItem('nexlift_token', token);

// Helper en api.js:
function getAuthHeaders() {
    const token = localStorage.getItem('nexlift_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}
```

---

## 🔌 API Endpoints (v1.8)

> ⚠️ **TODOS los endpoints (excepto auth login/register/recover) requieren autenticación**

### Rutinas
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/routines` | Lista rutinas del usuario |
| GET | `/api/routines/:id` | Detalle de rutina |
| GET | `/api/routines/active` | Rutina activa actual |
| POST | `/api/routines` | Crear rutina |
| POST | `/api/routines/import` | Importar JSON |
| PUT | `/api/routines/:id` | Actualizar (con smart PR rename) |
| PUT | `/api/routines/:id/activate` | Activar |
| DELETE | `/api/routines/:id` | Eliminar |

### Entrenamientos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/workouts/log` | Registrar sesión |
| POST | `/api/workouts/log-rest` | Registrar descanso |
| GET | `/api/workouts/history` | Historial |
| GET | `/api/workouts/exercise/:id/history` | Por ejercicio |
| PUT | `/api/workouts/:logId` | Editar sesión |
| DELETE | `/api/workouts/:logId` | Eliminar |

### Estadísticas
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/stats/overview` | Resumen general |
| GET | `/api/stats/consistency` | Heatmap datos |
| GET | `/api/stats/prs` | Personal Records |
| GET | `/api/stats/progress/:name` | Evolución ejercicio |
| GET | `/api/stats/routine/:id` | Stats de rutina |

### Body Tracking
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/body/logs` | Registros corporales |
| GET | `/api/body/photos` | Solo fotos |
| GET | `/api/body/latest` | Último peso |
| POST | `/api/body/log` | Crear registro (auto-upload Catbox) |

---

## 📸 Sistema de Fotos Catbox (v1.8)

### Flujo de Upload

```
Frontend                    Backend                    Catbox
   │                           │                          │
   │ base64 image              │                          │
   │──────────────────────────>│                          │
   │                           │ POST multipart/form-data │
   │                           │─────────────────────────>│
   │                           │                          │
   │                           │   https://files.catbox.moe/abc.jpg
   │                           │<─────────────────────────│
   │                           │                          │
   │   { photoUrl: "https://..." }                        │
   │<──────────────────────────│                          │
```

### Detección Automática

```javascript
// En server/src/index.js
if (photo.startsWith('data:image') || photo.length > 500) {
    // Es base64 → subir a Catbox
    photoUrl = await uploadBase64ToCatbox(photo, 'jpg');
} else {
    // Ya es URL
    photoUrl = photo;
}
```

### Script de Migración

```bash
# Migrar fotos antiguas base64 → Catbox
cd server
node scripts/migrate-photos.js
```

---

## 🎨 Patrones de UI

### Variables CSS (index.css)
```css
:root {
  --bg-dark: #0a0a0a;      /* Fondo principal OLED */
  --bg-card: #141414;      /* Tarjetas */
  --primary: #8b5cf6;      /* Púrpura principal */
  --success: #22c55e;      /* Verde éxito */
  --warning: #eab308;      /* Amarillo warning */
  --error: #ef4444;        /* Rojo error */
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --border: #27272a;
}
```

### Componentes Clave
- **AuthContext:** Estado global de autenticación
- **ProtectedRoute:** HOC para rutas que requieren login
- **Toast:** Notificaciones globales (`useToast()`)
- **Celebration:** Confeti para PRs

---

## ⚠️ Gotchas y Problemas Conocidos

### 1. Token en localStorage
```javascript
// ⚠️ Todas las llamadas protegidas DEBEN usar authFetch()
const res = await authFetch(`${API_URL}/routines`);
// ❌ NO usar fetch() directamente para rutas protegidas
```

### 2. Dos Schemas Prisma
```
⚠️ shared/prisma/schema.prisma  ← Fuente de verdad
⚠️ api/prisma/schema.prisma     ← Sincronizar manualmente para Vercel
```

### 3. Campo photoUrl vs photo
- **Base de datos:** `photoUrl` (campo real)
- **API response:** `photo` (mapeado para compatibilidad frontend)

### 4. userId Opcional
Los campos `userId` son opcionales (`String?`) para permitir migración de datos antiguos sin usuario.

---

## 📋 Changelog

### v1.8.0 - Multi-User Auth System (9 Ene 2026)
**Cambio más grande en la historia del proyecto**

#### 🔐 Autenticación Completa
- ✅ Sistema JWT con tokens persistentes
- ✅ Login, Register, Forgot Password
- ✅ Pregunta de seguridad para recuperación
- ✅ Perfil de usuario editable
- ✅ AuthContext + ProtectedRoute

#### 🏗️ Arquitectura Multi-Tenant
- ✅ Modelo `User` en Prisma
- ✅ `userId` en todas las tablas relevantes
- ✅ Filtrado por usuario en TODAS las queries
- ✅ Ownership verification en UPDATE/DELETE

#### 📸 Sistema de Fotos Catbox
- ✅ Upload automático a catbox.moe
- ✅ Eliminación de base64 en DB
- ✅ Script de migración incluido

#### 📁 Código Compartido
- ✅ `shared/` con routes, middleware, utils
- ✅ Schema centralizado
- ✅ Rutas modulares reutilizables

#### 🔧 Fixes Críticos
- ✅ api.js con authFetch() para tokens automáticos
- ✅ photoUrl vs photo mapeado correctamente
- ✅ Funciones inline para evitar problemas de módulos

### v1.7.1 - Workout Bug Fixes (9 Ene 2026)
- ✅ "Mejor anterior" corregido
- ✅ localStorage expira 24h
- ✅ Fix timezone

### v1.7.0 - Exercise Normalization (8 Ene 2026)
- ✅ `normalizeExerciseName()`
- ✅ Autocomplete en EditRoutine

### v1.6.x - Data Integrity
- ✅ Fórmula Epley unificada
- ✅ onDelete: Restrict

### v1.5.0 - VPS Deployment
- ✅ Dockerfile para Docker/Easypanel

### v1.4.0 - Body Composition
- ✅ 8 métricas de báscula inteligente
- ✅ Galería de fotos

---

## 📝 Notas para IAs Futuras

1. **SIEMPRE usa authFetch()** para llamadas protegidas
2. **Sincroniza schemas** al modificar modelos
3. **Token en localStorage** como `nexlift_token`
4. **Catbox para fotos** - no guardar base64 en DB
5. **userId en queries** - SIEMPRE filtrar por usuario
6. **Tailwind 4** usa PostCSS, no tailwind.config.js
7. **No hay tests automatizados** - testing manual

---

*Última actualización: 9 Enero 2026 - v1.8.0*
