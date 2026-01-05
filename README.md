# 🏋️ NexLift

> **Tu compañero de gimnasio inteligente**  
> Gestiona tus rutinas, registra tu progreso y supera tus límites.

![Project Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.2.0-blue?style=flat-square)

---

## 📱 Descripción

**NexLift** es una Progressive Web App diseñada para levantadores de pesas serios. Olvida las notas de celular desordenadas; NexLift te ofrece una experiencia nativa para trackear cada serie, repetición y RPE, calculando automáticamente tus récords personales y mostrándote gráficas de evolución.

Diseñada con un enfoque **Mobile-First**, funciona perfectamente en tu celular dentro del gimnasio.

---

## ✨ Características Principales

### 🎯 Gestión de Rutinas
- **Importación JSON Simplificada:** Carga rutinas complejas en segundos
- **Rutina Activa:** Define tu foco actual y organiza tus semanas
- **Días de Descanso:** Planifica tu recuperación
- **Edición In-App:** Modifica ejercicios, series y reps directamente

### 📝 Tracking de Entrenamiento
- **Registro Preciso:** Peso (kg), Repeticiones y RIR/RPE
- **Ghost Mode 👻:** Visualiza tu mejor desempeño histórico
- **Notas por Ejercicio:** Guarda tips técnicos

### 📊 Análisis y Progreso
- **Dashboard Interactivo:** Resumen semanal y racha actual
- **Calendario de Asistencia:** Heatmap estilo GitHub (últimos 30 días)
- **Métricas de Volumen:** % de Cumplimiento basado en constancia
- **Desglose Muscular:** Analiza grupos musculares priorizados
- **Evolución 1RM:** Gráficas estimando tu 1RM teórico
- **Récords Personales:** Tracking automático de PRs 🏆

### 🏋️ Body Tracking
- **Registro de Peso Corporal:** Seguimiento diario/semanal
- **Fotos de Progreso:** Almacenamiento seguro en base64
- **Gráficas de Evolución:** Visualiza cambios en el tiempo
- **Notas Diarias:** Documenta cómo te sientes

### 📄 Exportación de Reportes (PDF)
- **Reportes Profesionales:** Genera PDFs con todo tu progreso
- **Períodos Configurables:** Semanal, Mensual, Trimestral, Semestral, Anual
- **Contenido Incluido:**
  - Estadísticas del período (días entrenados, sesiones, PRs)
  - Rutina activa completa
  - Récords personales del período
  - Progreso por ejercicio (Delta kg y reps)
  - Últimas sesiones con RPE
  - Evolución del peso corporal
  - Fotos de progreso (si hay 2+)
- **Optimizado con jspdf-autotable:** Tablas profesionales con saltos de página automáticos

### 🎨 Interfaz de Usuario
- **Modo Oscuro OLED:** Interfaz perfecta para gimnasios
- **Toast Notifications:** Feedback elegante en cada acción
- **Animaciones Fluidas:** Transiciones y micro-interacciones premium
- **Modal de Confirmación:** Prevención de acciones accidentales
- **Celebración de PRs:** Animaciones especiales al romper récords

---

## 🛠️ Stack Tecnológico

| Área | Tecnología | Descripción |
|------|------------|-------------|
| **Frontend** | React 18 | UI basada en componentes |
| **Build Tool** | Vite 6 | Desarrollo ultrarrápido |
| **Estilos** | Tailwind CSS 4 | Framework utility-first |
| **Iconos** | Lucide React | Iconografía moderna |
| **Gráficos** | Recharts | Visualización de datos |
| **PDF** | jsPDF + autoTable | Generación de reportes |
| **Backend** | Express.js / Vercel Functions | API REST |
| **Base de Datos** | PostgreSQL | BD relacional robusta |
| **ORM** | Prisma | Acceso a datos type-safe |

---

## 🚀 Despliegue

Optimizado para **Vercel** con PostgreSQL (Neon, Supabase, Railway).

### Variables de Entorno
```env
DATABASE_URL="postgresql://usuario:password@host:port/database"
```

### Estructura del Proyecto
```
NexLift/
├── api/                  # Serverless Functions (Vercel)
│   ├── prisma/           # Schema de BD
│   └── index.js          # Entry point API
├── client/               # React SPA
│   ├── src/
│   │   ├── components/   # Componentes reutilizables
│   │   │   ├── layout/   # Layout principal
│   │   │   └── ui/       # Toast, Celebration, etc.
│   │   ├── pages/        # Páginas de la app
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Progress.jsx
│   │   │   ├── BodyTracking.jsx
│   │   │   ├── ExportReport.jsx
│   │   │   ├── Routines.jsx
│   │   │   └── RoutineDetail.jsx
│   │   └── services/     # API client
│   └── public/           # Assets estáticos
├── server/               # Servidor local de desarrollo
│   ├── prisma/           # Schema de BD
│   └── src/index.js      # API Express
├── .agent/               # Documentación para IA
│   └── context.md        # Contexto del proyecto
└── vercel.json           # Configuración Vercel
```

---

## 📋 Formato de Importación de Rutinas

```json
{
  "name": "Mi Rutina",
  "description": "Descripción opcional",
  "days": [
    {
      "dayName": "Lunes - Torso",
      "exercises": [
        { "name": "Press Banca", "sets": 4, "reps": "8-10" },
        { "name": "Remo Pendlay", "sets": 4, "reps": "8-10" }
      ]
    },
    {
      "dayName": "Martes - Descanso",
      "isRestDay": true,
      "exercises": []
    }
  ]
}
```

---

## 🔧 Desarrollo Local

```bash
# Clonar repositorio
git clone https://github.com/fernandosegrr/NexLift.git
cd NexLift

# Backend (servidor Express)
cd server
npm install
npx prisma generate
npx prisma migrate dev
npm run dev

# Frontend (en otra terminal)
cd client
npm install
npm run dev
```

**URLs de desarrollo:**
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

---

## 👤 Autor

**Fernando Guerrero**
- GitHub: [@fernandosegrr](https://github.com/fernandosegrr)

---

## 📄 Licencia

Copyright © 2026 Fernando Guerrero.  
Este proyecto es software propietario. Todos los derechos reservados.
