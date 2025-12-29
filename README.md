# 🏋️ NexLift

> **Tu compañero de gimnasio inteligente**  
> Gestiona tus rutinas, registra tu progreso y supera tus límites.

![Project Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-blue?style=flat-square)

---

## 📱 Descripción

**NexLift** es una Progressive Web App (PWA) diseñada para levantadores de pesas serios. Olvida las notas de celular desordenadas; NexLift te ofrece una experiencia nativa para trackear cada serie, repetición y RPE, calculando automáticamente tus récords personales y mostrándote gráficas de evolución.

Diseñada con un enfoque **Mobile-First**, funciona perfectamente en tu celular dentro del gimnasio, incluso con mala conexión.

---

## ✨ Características Principales

### 🎯 Gestión de Rutinas
- **Importación JSON Simplificada:** Carga rutinas complejas (Push/Pull/Legs, Upper/Lower) en segundos copiando y pegando un texto.
- **Rutina Activa:** Define tu foco actual y organiza tus semanas.
- **Días de Descanso:** Planifica tu recuperación con días marcados específicamente para descanso.

### 📝 Tracking de Entrenamiento
- **Registro Preciso:** Peso (kg/lbs), Repeticiones y RIR/RPE.
- **Ghost Mode 👻:** Visualiza tu mejor desempeño histórico en cada serie para motivarte a superarlo.
- **Notas por Ejercicio:** Guarda tips técnicos o recordatorios para la próxima sesión.

### 📊 Análisis y Progreso
- **Dashboard Interactivo:** Resumen semanal, racha actual y próximos entrenamientos.
- **Calendario de Asistencia:** Visualización estilo GitHub de tus días de entrenamiento (últimos 30 días).
- **Métricas de Volumen:** % de Cumplimiento basado en tu constancia real.
- **Desglose Muscular:** Analiza qué grupos musculares estás priorizando.
- **Evolución 1RM:** Gráficas de línea estimando tu 1RM teórico a lo largo del tiempo.

### 📱 Experiencia de Usuario (UX)
- **Modo Oscuro Profundo:** Interfaz OLED-friendly perfecta para gimnasios.
- **Instalable (PWA):** Añádela a tu pantalla de inicio en iOS y Android.
- **Sin Distracciones:** UI minimalista enfocada en lo importante: levantar peso.

---

## 🛠️ Stack Tecnológico

Este proyecto utiliza las últimas tecnologías de desarrollo web moderno:

| Área | Tecnología | Descripción |
|------|------------|-------------|
| **Frontend** | React 18 | Biblioteca de UI basada en componentes |
| **Build Tool** | Vite 6 | Entorno de desarrollo ultrarrápido |
| **Estilos** | Tailwind CSS 4 | Framework de utilidad para diseño responsive |
| **Gráficos** | Recharts | Visualización de datos y estadísticas |
| **Backend** | Node.js (Serverless) | API ejecutada en Vercel Functions |
| **Base de Datos** | PostgreSQL | Base de datos relacional robusta |
| **ORM** | Prisma | Acceso a datos type-safe y gestión de esquema |

---

## 🚀 Despliegue (Deploy)

La aplicación está optimizada para desplegarse en **Vercel** con base de datos PostgreSQL (ej. Supabase, Neon, Railway).

### Variables de Entorno
Configura las siguientes variables en tu proyecto de Vercel:

```env
DATABASE_URL="postgresql://usuario:password@host:port/database?schema=public"
```

### Estructura de Directorios para Vercel
Para soportar Vercel Serverless Functions, la estructura del proyecto es:

```
NexLift/
├── api/                  # Serverless Functions (Backend)
│   ├── prisma/           # Schema de BD para producción
│   └── index.js          # Entry point de la API
├── client/               # SPA React (Frontend)
│   ├── public/           # Assets estáticos (iconos PWA)
│   └── src/              # Código fuente React
├── server/               # Servidor de desarrollo local
└── vercel.json           # Configuración de rutas y rewrites
```

---

## 📋 Formato de Importación de Rutina

Para importar tu rutina, usa el siguiente formato JSON en la sección "Importar":

```json
{
  "name": "Rutina Hipertrofia 4 Días",
  "description": "Torso Pierna Frecuencia 2",
  "days": [
    {
      "dayName": "Lunes - Torso Fuerza",
      "exercises": [
        { "name": "Press Banca", "sets": 3, "reps": "6-8" },
        { "name": "Remo Pendlay", "sets": 3, "reps": "6-8" }
      ]
    },
    {
      "dayName": "Martes - Pierna Fuerza",
      "exercises": [
        { "name": "Sentadilla", "sets": 3, "reps": "5-7" }
      ]
    },
    {
      "dayName": "Miércoles - Descanso",
      "isRestDay": true,
      "exercises": []
    }
  ]
}
```

---

## 👤 Autor

**Fernando Guerrero**

*   **GitHub**: [@fernandosegrr](https://github.com/fernandosegrr)

---

## 📄 Licencia

Copyright © 2025 Fernando Guerrero.
Este proyecto es software propietario. Todos los derechos reservados.
