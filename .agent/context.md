# NexLift - AI Context & Project Documentation

> **Este documento proporciona contexto completo para IAs que trabajen en este proyecto.**

---

## 🎯 Resumen del Proyecto

**NexLift** es una Progressive Web App (PWA) de tracking de gimnasio con arquitectura cliente-servidor separada. El proyecto está optimizado para Vercel pero también funciona con servidor Express local.

### Objetivo Principal
Permitir a usuarios de gimnasio registrar sus entrenamientos, trackear progreso de peso/reps por ejercicio, y visualizar su evolución a través de estadísticas, gráficas y reportes PDF profesionales.

---

## 🏗️ Arquitectura

```
NexLift/
├── client/              # Frontend React (Vite)
│   ├── src/
│   │   ├── components/  # UI reutilizable
│   │   ├── pages/       # Páginas principales
│   │   └── services/    # Cliente API
│   └── public/
├── server/              # Backend desarrollo local (Express)
│   ├── prisma/          # Schema BD
│   └── src/index.js     # Rutas API
├── api/                 # Backend Vercel (Serverless)
│   └── index.js
└── .agent/              # Documentación IA
```

### Decisiones Arquitectónicas Clave

1. **Dos backends paralelos:**
   - `server/` para desarrollo local con Express + Prisma
   - `api/` para producción en Vercel (serverless)
   - Ambos comparten la misma lógica pero `api/` está optimizado para cold starts

2. **Base de datos PostgreSQL:**
   - Desarrollo: PostgreSQL local o Neon/Supabase
   - Producción: Neon/Supabase/Railway conectado via `DATABASE_URL`

3. **Mobile-First + OLED Dark Mode:**
   - Diseño optimizado para uso en gimnasio
   - Variables CSS en `:root` para temas

---

## 📊 Modelo de Datos (Prisma Schema)

```prisma
model Routine        # Rutinas de entrenamiento
model RoutineDay     # Días de la rutina (Lunes, Martes, etc.)
model Exercise       # Ejercicios configurados por día
model WorkoutLog     # Registro de sesión (fecha + ejercicio)
model SetLog         # Series individuales (peso, reps, RPE)
model PersonalRecord # PRs automáticos por ejercicio
model RestLog        # Días de descanso chequeados
model BodyLog        # Peso corporal + fotos de progreso
```

### Relaciones Importantes
- `Routine → RoutineDay → Exercise → WorkoutLog → SetLog`
- `Exercise.name` se normaliza para comparar PRs
- `BodyLog.photo` almacena imágenes en base64 (comprimidas en cliente)

---

## 📁 Archivos Clave por Funcionalidad

### Frontend (client/src/)

| Archivo | Propósito |
|---------|-----------|
| `pages/Dashboard.jsx` | Vista principal, calendar heatmap, stats rápidos |
| `pages/Progress.jsx` | Gráficas de evolución por ejercicio, PRs, análisis muscular |
| `pages/BodyTracking.jsx` | Registro peso corporal + fotos de progreso |
| `pages/ExportReport.jsx` | Generación de PDF profesional con jspdf + autotable |
| `pages/Routines.jsx` | Lista de rutinas, importación JSON, activar rutina |
| `pages/RoutineDetail.jsx` | Vista de día de rutina, registro de sets, ghost mode |
| `services/api.js` | Cliente HTTP para todas las llamadas al backend |
| `components/ui/Toast.jsx` | Sistema de notificaciones toast |
| `components/ui/Celebration.jsx` | Animación de confeti para PRs |
| `components/layout/Layout.jsx` | Navbar inferior + estructura general |

### Backend (server/src/)

| Archivo | Propósito |
|---------|-----------|
| `index.js` | Todas las rutas API REST (Express) |
| `prisma/schema.prisma` | Definición de modelos de BD |

---

## 🔌 API Endpoints Principales

### Rutinas
- `GET /api/routines` - Lista todas
- `GET /api/routines/:id` - Detalle con días y ejercicios
- `POST /api/routines` - Crear nueva
- `POST /api/routines/import` - Importar desde JSON
- `PUT /api/routines/:id/activate` - Activar rutina
- `GET /api/routines/active` - Obtener rutina activa

### Workouts
- `POST /api/workouts/log` - Registrar sesión completa
- `GET /api/workouts/history?limit=30` - Historial de sesiones
- `GET /api/workouts/exercise/:id/history` - Historial por ejercicio

### Stats
- `GET /api/stats/overview` - Estadísticas generales
- `GET /api/stats/consistency` - Eventos para calendar heatmap
- `GET /api/stats/prs` - Personal Records
- `GET /api/stats/exercise/:name/progress` - Evolución de ejercicio

### Body Tracking
- `GET /api/body/logs?limit=30` - Registros corporales
- `POST /api/body/log` - Crear registro (peso + foto opcional)

---

## 🎨 Convenciones de Código

### CSS Variables (client/src/index.css)
```css
:root {
  --bg-dark: #0a0a0a;
  --bg-card: #141414;
  --primary: #8b5cf6;      /* Purple principal */
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --border: #27272a;
}
```

### Patrones React Usados
1. **useMemo** para cálculos costosos (filtrados, estadísticas)
2. **useEffect** con cleanup para subscripciones
3. **Estados con defaults seguros** (`[]`, `{}`, `null`)
4. **Componentes funcionales** exclusivamente
5. **Toast context** para notificaciones globales

### Patrones PDF (ExportReport.jsx)
1. **jspdf-autotable** para tablas profesionales
2. **ensureSpace(height)** helper para evitar títulos huérfanos
3. **printSectionTitle(title, minHeight)** helper para consistencia
4. **COLORS constant** fuera del componente
5. **Logo precargado** en useEffect al montar

---

## ⚠️ Gotchas y Problemas Conocidos

### 1. Límite de Workout History
- `GET /api/workouts/history` tiene limit=30 por defecto
- Para reportes anuales, pasar `?limit=500`

### 2. Emojis en PDF
- jsPDF no renderiza emojis correctamente
- Todos los títulos usan texto plano sin emojis

### 3. Fotos en Base64
- Las fotos se comprimen en cliente antes de guardar
- El campo `BodyLog.photo` usa `@db.Text` para strings largos

### 4. Ghost Mode
- Compara con el último mejor set histórico del mismo ejercicio
- Se actualiza cada vez que se guarda un workout

### 5. PRs Automáticos
- Se calculan usando fórmula Brzycki para 1RM estimado
- Se guardan solo si superan el PR anterior

---

## 🔄 Flujos de Usuario Críticos

### Registrar Entrenamiento
1. Usuario va a RoutineDetail del día actual
2. Ve ejercicios configurados + ghost de última sesión
3. Registra peso/reps/RPE por cada set
4. Al guardar: se crea WorkoutLog + SetLogs
5. Se verifica si es PR → si es, se guarda + animación

### Exportar Reporte PDF
1. Usuario elige período (semanal, mensual, etc.)
2. Se cargan datos: stats, PRs, historial, body logs
3. Se filtran por fecha de corte
4. Se genera PDF con jspdf + autotable
5. Se descarga automáticamente

### Tracking Corporal
1. Usuario va a BodyTracking
2. Registra peso del día
3. Opcionalmente sube foto (se comprime)
4. Datos aparecen en gráfica de evolución
5. En PDF aparecen si hay 2+ fotos en el período

---

## 🧪 Testing

**No hay testing automatizado implementado.**

El usuario ha indicado que no quiere que la IA ejecute tests automáticos. La verificación se hace manualmente probando la app en el navegador.

---

## 📝 Notas para IAs Futuras

1. **Siempre verificar el período seleccionado** al depurar problemas de datos faltantes
2. **El schema de Prisma está en server/prisma/**, no en api/prisma/ (aunque api también lo referencia)
3. **Los componentes UI personalizados** (Toast, Modal) usan Context API
4. **El backend de desarrollo** (server/) tiene más endpoints/features que el de producción (api/)
5. **Tailwind 4** está configurado con PostCSS, no con tailwind.config.js tradicional
6. **No eliminar el Ghost Mode** - es feature muy valorada por el usuario
7. **Comparar fechas con strings ISO** - usar `dateStr >= cutoffDateStr` en lugar de `new Date()`
8. **Workout.jsx usa localStorage** - datos persisten en `workout_${dayId}` hasta guardar
9. **Race conditions** - usar refs para cancelar requests obsoletos al cambiar de ejercicio

---

## 🔗 Dependencias Principales

### Frontend
```json
{
  "react": "^18.x",
  "react-router-dom": "^6.x",
  "recharts": "^2.x",
  "lucide-react": "latest",
  "jspdf": "^2.x",
  "jspdf-autotable": "^3.x"
}
```

### Backend
```json
{
  "express": "^4.x",
  "prisma": "^6.x",
  "@prisma/client": "^6.x",
  "cors": "^2.x"
}
```

---

## 📋 Changelog Reciente (Enero 2026)

### v1.3.0 - Bug Fixes & Improvements
- ✅ **Workout.jsx:** Sistema de persistencia con localStorage (evita pérdida de datos)
- ✅ **Workout.jsx:** Detección de ejercicios completados hoy (evita duplicados en BD)
- ✅ **Workout.jsx:** Fix race condition en `loadPreviousBest` con refs
- ✅ **Workout.jsx:** Warning al navegar sin guardar
- ✅ **ExportReport.jsx:** Comparación de fechas timezone-safe (strings ISO)
- ✅ **ExportReport.jsx:** Período "Diario" normalizado a medianoche
- ✅ **Progress.jsx:** Selector de años dinámico basado en datos reales
- ✅ **Progress.jsx:** Gráfico semanal sin desfases de timezone
- ✅ **Settings.jsx:** Navegación a página dedicada EditSession
- ✅ **EditSession.jsx:** Nueva página para editar sesiones de entrenamiento

---

*Última actualización: 6 Enero 2026*
