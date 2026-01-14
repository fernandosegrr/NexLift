# 🏋️ NexLift

> **Tu compañero de gimnasio inteligente**  
> Gestiona tus rutinas, registra tu progreso y supera tus límites.

![Project Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.9.3-blue?style=flat-square)

---

## 📱 Descripción

**NexLift** es una Progressive Web App diseñada para levantadores de pesas serios. Olvida las notas de celular desordenadas; NexLift te ofrece una experiencia nativa para trackear cada serie, repetición y RPE, calculando automáticamente tus récords personales y mostrándote gráficas de evolución.

Diseñada con un enfoque **Mobile-First**, funciona perfectamente en tu celular dentro del gimnasio.

---

## ✨ Características Principales

### 🔐 Sistema de Autenticación (v1.8)
- **Registro completo:** Nombre, email, usuario, contraseña
- **Login persistente:** Sin expiraciones molestas
- **Recuperación de cuenta:** Pregunta de seguridad
- **Perfil personalizado:** Avatar, datos personales

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
- **Composición Corporal:** 8 métricas de báscula inteligente
- **Fotos de Progreso:** Almacenamiento en Catbox.moe (v1.8)
- **Gráficas de Evolución:** Visualiza cambios en el tiempo

### 📄 Exportación de Reportes (PDF)
- **Reportes Profesionales:** Genera PDFs con todo tu progreso
- **Períodos Configurables:** Semanal, Mensual, Trimestral, Anual
- **Contenido Incluido:**
  - Estadísticas del período
  - Rutina activa completa
  - Récords personales del período
  - Progreso por ejercicio
  - Evolución del peso corporal
  - Fotos de progreso

### 🎨 Interfaz de Usuario
- **Modo Oscuro OLED:** Interfaz perfecta para gimnasios
- **Toast Notifications:** Feedback elegante en cada acción
- **Animaciones Fluidas:** Transiciones y micro-interacciones premium
- **Celebración de PRs:** Animaciones especiales al romper récords

---

## 🛠️ Stack Tecnológico

| Área | Tecnología | Descripción |
|------|------------|-------------|
| **Frontend** | React 18 | UI basada en componentes |
| **Build Tool** | Vite 7 | Desarrollo ultrarrápido |
| **Estilos** | Tailwind CSS 4 | Framework utility-first |
| **Iconos** | Lucide React | Iconografía moderna |
| **Gráficos** | Recharts | Visualización de datos |
| **PDF** | jsPDF + autoTable | Generación de reportes |
| **Backend** | Express.js / Vercel Functions | API REST |
| **Base de Datos** | PostgreSQL | BD relacional robusta |
| **ORM** | Prisma | Acceso a datos type-safe |
| **Auth** | JWT + bcrypt | Autenticación segura |
| **Storage** | Catbox.moe | Hosting de fotos |

---

## 🚀 Despliegue

### Opción 1: Vercel (Serverless)
Optimizado para **Vercel** con PostgreSQL (Neon, Supabase, Railway).

```env
DATABASE_URL="postgresql://usuario:password@host:port/database"
JWT_SECRET="tu-clave-secreta-muy-larga-y-segura"
```

### Opción 2: Easypanel / VPS (Docker)
También soporta despliegue en **VPS con Easypanel** usando Docker.

1. Conecta tu repositorio de GitHub en Easypanel
2. Selecciona **Dockerfile** como método de build
3. Configura las variables de entorno
4. Deploy

### Estructura del Proyecto
```
NexLift/
├── api/                  # Serverless Functions (Vercel)
│   ├── prisma/           # Schema de BD
│   └── index.js          # Entry point API
├── client/               # React SPA
│   ├── src/
│   │   ├── components/   # Componentes reutilizables
│   │   ├── contexts/     # AuthContext (v1.8)
│   │   ├── pages/        # 15 páginas
│   │   └── services/     # API client con auth
│   └── public/           # Assets estáticos
├── server/               # Servidor local de desarrollo
│   ├── prisma/           # Schema de BD
│   ├── scripts/          # Scripts de mantenimiento
│   └── src/index.js      # API Express
├── shared/               # Código compartido (v1.8)
│   ├── middleware/       # Auth middleware
│   ├── utils/            # Password, Catbox
│   └── routes/           # Rutas modulares
├── .agent/               # Documentación para IA
│   └── context.md        # Contexto completo del proyecto
└── vercel.json           # Configuración Vercel
```

### ⚠️ Nota Importante: Sincronización de Schemas

Este proyecto tiene **dos schemas de Prisma** que deben mantenerse sincronizados:

| Archivo | Uso |
|---------|-----|
| `server/prisma/schema.prisma` | Desarrollo local |
| `api/prisma/schema.prisma` | Producción (Vercel) |

**Si agregas o modificas modelos/campos, actualiza AMBOS archivos.**

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
        { "name": "press banca", "sets": 4, "reps": "8-10" },
        { "name": "remo pendlay", "sets": 4, "reps": "8-10" }
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

> 💡 **Tip:** Pídele a ChatGPT que genere tu rutina en este formato JSON.

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

## 📜 Changelog

### v1.9.3 (13 Ene 2026) - Advanced Periodization
- **Goals V2**: Algoritmo matemático puro (Fuerza/Hipertrofia), Test week, Validación.
- **Vercel Sync**: Deploy serverless totalmente funcional.

### v1.9.0 - v1.9.2 (Ene 2026)
- **PDF Export V2**: Tablas dinámicas y datos ASCII.
- **Routine Wizard**: Creador de rutinas unificado.
- **UX**: Mejoras en dashboard y workout logs.

### v1.8.0 - Multi-User Auth System (9 Ene 2026)
**El cambio más grande en la historia del proyecto**

#### 🔐 Autenticación Completa
- Sistema JWT con tokens persistentes
- Login, Register, Forgot Password
- Pregunta de seguridad para recuperación
- Perfil de usuario editable
- AuthContext + ProtectedRoute

#### 🏗️ Arquitectura Multi-Tenant
- Modelo `User` en Prisma
- userId en todas las tablas
- Filtrado por usuario en TODAS las queries
- Ownership verification en UPDATE/DELETE

#### 📸 Sistema de Fotos Catbox
- Upload automático a catbox.moe
- Eliminación de base64 en DB
- Script de migración incluido

#### 📁 Código Compartido
- `shared/` con routes, middleware, utils
- Schema centralizado

### v1.7.x - Bug Fixes & Normalization
- Corrección de "Mejor anterior"
- Normalización de ejercicios
- Fix timezone

### v1.6.x - Data Integrity
- Fórmula Epley unificada
- onDelete: Restrict

---

## 👤 Autor

**Fernando Guerrero**
- GitHub: [@fernandosegrr](https://github.com/fernandosegrr)

---

## 📄 Licencia

Este proyecto está licenciado bajo la [Licencia MIT](LICENSE).

Copyright © 2026 Fernando Guerrero
