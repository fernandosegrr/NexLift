# 🏋️ NexLift

> **Tu compañero de gimnasio inteligente**  
> Registra entrenamientos, trackea PRs y visualiza tu progreso

![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=flat-square&logo=tailwind-css)
![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?style=flat-square&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)

---

## ✨ Features

### 📱 Core
- **Importar rutinas via JSON** - Carga tu rutina personalizada en segundos
- **Sistema de rutina activa** - Una rutina principal para organizar tu semana
- **Días de descanso** - Marca días de descanso en tu rutina
- **Registro de entrenamientos** - Peso, reps y RIR por cada serie

### 📊 Tracking
- **Ghost Mode** - Ve tu mejor serie anterior para superarla
- **PRs automáticos** - Detecta y guarda tus récords personales
- **1RM estimado** - Calcula tu máximo teórico por ejercicio
- **Progreso por músculo** - Visualiza evolución agrupada por grupo muscular

### 📈 Análisis
- **Cumplimiento de asistencia** - % de días entrenados últimos 30 días
- **Comparativas anuales** - Compara tu actividad año vs año
- **Gráficas de progreso** - Ve la curva de tu fuerza a lo largo del tiempo
- **Clasificación de ejercicios** - Asigna músculos manualmente

### 🎨 UI/UX
- **Diseño mobile-first** - Optimizado para usar en el gym
- **Tema oscuro premium** - Fácil a la vista
- **PWA instalable** - Añádelo a tu pantalla de inicio
- **Animaciones fluidas** - Experiencia de app nativa

---

## 🚀 Demo

**Live:** [https://nex-lift.vercel.app](https://nex-lift.vercel.app)

---

## 🛠️ Stack Tecnológico

| Layer | Tecnología |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | Vercel Serverless Functions |
| Database | PostgreSQL |
| ORM | Prisma |
| Icons | Lucide React |
| Deploy | Vercel |

---

## 📦 Instalación Local

### Prerrequisitos
- Node.js 18+
- PostgreSQL database

### 1. Clonar repositorio
```bash
git clone https://github.com/fernandosegrr/NexLift.git
cd NexLift
```

### 2. Configurar Backend
```bash
cd server
npm install
```

Crear archivo `.env`:
```env
DATABASE_URL="postgresql://user:password@host:port/database"
PORT=3001
```

Aplicar schema:
```bash
npx prisma db push
```

### 3. Configurar Frontend
```bash
cd ../client
npm install
```

### 4. Ejecutar
```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend  
cd client && npm run dev
```

Abre: [http://localhost:5173](http://localhost:5173)

---

## 📄 Formato JSON para Rutinas

```json
{
  "name": "Mi Rutina PPL",
  "description": "Push Pull Legs 6 días",
  "days": [
    {
      "dayName": "Lunes - Push",
      "exercises": [
        { "name": "Press Banca", "sets": 4, "reps": "6-8", "note": "Control excéntrico" },
        { "name": "Press Inclinado", "sets": 3, "reps": "8-10" }
      ]
    },
    {
      "dayName": "Domingo - Descanso",
      "isRestDay": true,
      "exercises": []
    }
  ]
}
```

---

## 🚀 Deploy en Vercel

1. Importa el repositorio desde GitHub
2. Configura la variable de entorno:
   - `DATABASE_URL` = tu conexión PostgreSQL
3. Deploy automático ✨

---

## 📁 Estructura del Proyecto

```
NexLift/
├── api/                    # Vercel Serverless Functions
│   └── index.js            # API handler principal
├── client/                 # React Frontend
│   ├── public/             # Assets estáticos
│   └── src/
│       ├── components/     # Componentes reutilizables
│       ├── pages/          # Páginas de la app
│       └── services/       # API client
├── server/                 # Backend development
│   ├── prisma/             # Schema de base de datos
│   └── src/                # Express server (desarrollo)
├── vercel.json             # Configuración Vercel
└── README.md
```

---

## 🔮 Roadmap

- [ ] Notificaciones de entrenamiento
- [ ] Exportar datos a Excel
- [ ] Modo offline completo
- [ ] Integración con Apple Watch
- [ ] Compartir rutinas entre usuarios

---

## 👤 Autor

**Fernando Guerrero**

GitHub: [@fernandosegrr](https://github.com/fernandosegrr)

---

## 📜 Licencia

Este proyecto es **software propietario**.  
Todos los derechos reservados © 2024-2025 Fernando Guerrero.

No está permitida la copia, distribución, modificación o uso comercial sin autorización expresa del autor.
