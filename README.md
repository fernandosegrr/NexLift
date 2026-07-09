# 🏋️ NexLift

> **Tu compañero de gimnasio inteligente**  
> Registra tu entrenamiento y deja que el entrenador adaptativo calcule peso, reps y cuándo tocar descarga.

![Project Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/Version-2.6.1-blue?style=flat-square)

---

## 📱 Descripción

**NexLift** es una Progressive Web App (PWA) de tracking de gimnasio, mobile-first y con tema OLED oscuro. Se diferencia de una libreta de notas por su **periodización matemática**: en cada serie sugiere peso y reps con doble progresión autorregulada por RIR, detecta cuándo un ejercicio se estanca, organiza el entrenamiento en mesociclos (acumulación / intensificación / descarga) y activa una descarga automática cuando el volumen cae y varios ejercicios se estancan a la vez.

Funciona instalada como app nativa (offline-first) y también admite registrar series desde un **Atajo de iOS**, sin abrir la app.

---

## ✨ Características Principales

### 🔐 Autenticación
- Registro, login persistente (JWT de 365 días) y recuperación de cuenta por pregunta de seguridad.
- Revocación real de sesión: cambiar la contraseña o la pregunta de seguridad invalida todos los tokens emitidos antes.

### 🎯 Rutinas y Mesociclos
- Crear rutinas a mano, desde plantillas (PPL, Arnold, Full Body...) o importando JSON/texto.
- Deduplicación de ejercicios al importar vía LLM (opcional) para evitar duplicados como "Press Banca" / "press de banca".
- **Mesociclos:** organiza una rutina en bloques de Acumulación, Intensificación, Descarga o personalizados, con duración en semanas e inicio manual del siguiente bloque.
- Papelera de historial: un ejercicio con series registradas nunca se borra de verdad al editar o eliminar una rutina.

### 🧠 Entrenador Inteligente
- **Sugerencia de carga (Smart Loading):** doble progresión con autorregulación por RIR sobre la última sesión completa — sube peso y reinicia reps al llegar al tope del rango, suma reps si sobró margen, ajusta si hubo fallo. 100% cálculo local, sin IA.
- **Detección de plateau:** marca un ejercicio como estancado si su mejor 1RM estimado no mejora entre la mitad antigua y la reciente de sus últimas sesiones.
- **Descarga adaptativa:** si el volumen semanal cae por debajo del 85% del anterior y 3+ ejercicios están en plateau al mismo tiempo, la rutina entra en una ventana de descarga automática con la carga sugerida reducida — siempre avisado con un banner visible, nunca en silencio.
- La fase activa de un mesociclo ajusta en tiempo real el rango de reps usado para sugerir (más reps en acumulación, más peso/menos reps en intensificación).

### 📲 Atajo de iOS (Shortcuts)
- Registra una serie sin abrir la app: un Atajo consulta la sugerencia del próximo ejercicio y guarda la serie contra la misma cuenta.
- Compatible con sesiones parciales: si ya registraste algunas series por el Atajo, la app las muestra editables junto con las que faltan, sin fragmentar el registro del día.

### 🔔 Notificaciones Push
- Aviso de fin de descanso al completar cada serie (con el nombre del ejercicio correcto si tocaba cambiar de ejercicio).
- Recordatorio de "¿no vas a entrenar hoy?" si llevas 3+ días sin registrar actividad, a tu hora habitual de gym.
- Totalmente opcional — sin claves VAPID configuradas, la app funciona igual, solo sin push.

### 📊 Análisis y Progreso
- Dashboard con racha, heatmap de consistencia estilo GitHub, PRs del mes y logros con progreso real (no solo un ícono).
- Evolución de 1RM estimado, distribución de volumen por grupo muscular, cumplimiento semanal.
- **Objetivos (Goals):** planes de periodización (Fuerza/Hipertrofia) generados desde tu 1RM real o uno manual.

### 🏋️ Body Tracking
- Peso corporal + 8 métricas de báscula inteligente (grasa, agua, músculo, hueso, visceral, proteína, BMI, BMR).
- Fotos de progreso: suben a Cloudinary si está configurado, con fallback automático a Catbox.moe.

### 📄 Reportes PDF
- Exportación con rango configurable (7/30/90 días): resumen ejecutivo, tabla de PRs, detalle diario de volumen, composición corporal y galería de fotos.

### 🎨 PWA
- OLED negro puro, instalable desde el navegador, funciona offline (assets cache-first, navegación y API network-first con respaldo).

---

## 🛠️ Stack Tecnológico

| Área | Tecnología |
|------|------------|
| Frontend | React 19 + Vite 7 |
| Estilos | Tailwind CSS 4 |
| Gráficos | Recharts |
| Reportes PDF | jsPDF + html2canvas |
| Backend | Express.js — **único backend**, sirve la API y `client/dist` en el mismo puerto |
| Base de datos | PostgreSQL + Prisma ORM |
| Auth | JWT + bcryptjs |
| Fotos | Cloudinary (opcional) con fallback a Catbox.moe |
| Notificaciones | web-push / VAPID (opcional) |
| Dedup. de ejercicios | OpenAI gpt-4o-mini (opcional, con fallback determinista) |
| Deploy | Docker en VPS (EasyPanel) |

---

## 🏗️ Estructura del Proyecto

```
NexLift/
├── client/                    # React SPA (Vite)
│   ├── src/
│   │   ├── components/        # goals/, layout/, ui/ + componentes sueltos
│   │   ├── context/            # AuthContext
│   │   ├── pages/               # Dashboard, Workout, Routines, Progress, BodyTracking, Settings...
│   │   ├── services/            # api.js — cliente HTTP con auth
│   │   ├── utils/                # Epley, canonicalización de nombres, detección de plateau...
│   │   └── data/                  # exercises.js
│   └── public/                 # sw.js (service worker), manifest, íconos
├── server/                    # Express — ÚNICO backend (desarrollo y producción)
│   ├── src/index.js            # API + helpers de fecha CDMX + sirve client/dist en prod
│   ├── prisma/schema.prisma     # Schema (se sincroniza con `db push`, sin carpeta migrations/)
│   └── scripts/ + *.mjs          # Mantenimiento: migración de fotos a Cloudinary, fix de RIR del Atajo...
├── .agent/
│   └── context.md              # Documentación exhaustiva para IA — fuente de verdad técnica
├── CLAUDE.md                   # Guía para Claude Code (arquitectura, convenciones, gotchas)
└── Dockerfile                  # Build multi-stage: compila client, genera Prisma, arranca server
```

---

## 🚀 Despliegue

Único método soportado: **VPS + Docker** (EasyPanel o equivalente). El `Dockerfile` de la raíz compila el cliente, genera el cliente de Prisma y arranca `server/src/index.js`, que sirve la API y el build del frontend en el mismo puerto.

### Variables de entorno

**Obligatorias:**
```env
DATABASE_URL="postgresql://usuario:password@host:port/database"
JWT_SECRET="clave-secreta-larga-y-aleatoria"
NODE_ENV=production
```
El servidor **no arranca en producción** sin `JWT_SECRET`.

**Opcionales** (funciones nuevas que degradan sin romper nada si faltan):
```env
VAPID_PUBLIC_KEY=       # Recordatorio de descanso / re-enganche vía Web Push
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:tu-email@ejemplo.com

OPENAI_API_KEY=         # Deduplicación de ejercicios al importar rutinas

CLOUDINARY_CLOUD_NAME=  # Fotos de avatar/progreso (si faltan, cae a Catbox.moe)
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```
Plantilla completa en [`server/.env.example`](server/.env.example).

### Backup y restauración

Con `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` configuradas, el server sube automáticamente cada día (~04:00 hora CDMX) un JSON completo de rutinas, entrenamientos, PRs, body logs, goals y descansos por usuario a Cloudinary, como recurso `raw`+`authenticated` (no público) en la carpeta `nexlift-backups/`. Se conservan los 14 más recientes; los más viejos se borran solos. Sin esas 3 variables, el job es un no-op silencioso — el server arranca igual.

- **Forzar un backup ahora:** `POST /api/backup/run` (autenticado) — corre solo para el usuario del token, útil antes de una operación riesgosa o para probar la integración.
- **Ver la fecha del último backup exitoso:** `GET /api/health` → `backup.users[].lastBackupAt` (y `lastBackupError` si algo falló).
- **Restaurar** (DB nueva/perdida, o revertir un desastre): el usuario destino debe existir ya en la DB (mismo `username` que tenía el backup — regístralo primero si hace falta). Luego:
  ```bash
  cd server
  node restore-backup.mjs                    # dry-run: solo cuenta qué restauraría, usa el backup más reciente
  node restore-backup.mjs --apply             # aplica de verdad (idempotente — puede correrse más de una vez)
  node restore-backup.mjs --user=otro_usuario --apply   # forzar a qué cuenta reconectar los datos
  node restore-backup.mjs --file=./backup.json --apply  # restaurar desde un JSON ya descargado a mano
  ```
  El backup **no incluye** contraseña ni pregunta de seguridad (se excluyen a propósito antes de subir el JSON a un CDN de terceros) — el restore solo repone historial de entrenamiento, nunca credenciales.

**Complemento recomendado (segunda capa, no automatizada por la app):** además de este backup a nivel aplicación, agregar un cron a nivel VPS con `pg_dump` completo de la base (EasyPanel permite agregar un servicio/cron aparte). Este backup de Cloudinary cubre "perdí el JSON estructurado de mis datos"; un `pg_dump` cubre "perdí la base completa" (incluye credenciales, todos los usuarios, y no depende de que el server de la app haya podido correr ese día).

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

# Backend (Express)
cd server
npm install
npx prisma generate
npx prisma db push   # NUNCA `prisma migrate` — no hay carpeta migrations/, ver .agent/context.md
npm run dev

# Frontend (en otra terminal)
cd client
npm install
npm run dev
```

**URLs de desarrollo:**
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

**Tests (funciones puras, sin DB ni navegador):**
```bash
cd client && npm test   # vitest — exerciseName.js, paridad cliente/servidor
cd server && npm test   # node --test — server/src/logic.js
```
> ⚠️ Estos tests cubren solo lógica pura (fechas, plateau, Smart Loading, RIR). El resto (rutinas, auth, integración con Prisma/UI) sigue sin cobertura automatizada — pruébalo a mano (navegador, datos reales) antes de darlo por bueno.

---

## 📜 Changelog

Historial completo y detallado (con causa raíz de cada fix) en [`.agent/context.md`](.agent/context.md). Resumen de versiones recientes:

### v2.6.1 (9 Jul 2026) — Auditoría de rendimiento
Medido contra datos reales: `/api/stats/overview` y `/api/stats/consistency` paralelizaron sus queries independientes (~47% menos tiempo), payloads/build/Lighthouse documentados como línea base.

### v2.6.0 (9 Jul 2026) — Registro offline con cola de sincronización
Registrar series/descansos ya no se pierde sin conexión (típico en sótanos de gimnasio): se guarda localmente con un badge "pendiente de sincronizar" y se reintenta solo al volver la conexión, con reconciliación anti-duplicados (evita crear un registro repetido si el guardado original sí había llegado al servidor).

### v2.5.1 (9 Jul 2026) — Recordatorios de descanso persistentes
Los avisos de "descanso terminado" ahora sobreviven un redeploy/reinicio del servidor a mitad del descanso (nuevo modelo `PendingReminder`, espejo en DB del temporizador en memoria) — antes se perdían en silencio.

### v2.5.0 (9 Jul 2026) — Backup automático y tests de funciones puras
Backup diario (~04:00 CDMX) de rutinas/entrenamientos/PRs/body logs/goals a Cloudinary (`raw`+`authenticated`, retención de 14), con endpoint de corrida manual, estado en `/api/health` y script de restauración documentado y probado (`server/restore-backup.mjs`). Además, primera suite de tests automatizados del proyecto: funciones puras extraídas a `server/src/logic.js` y `client/src/utils/smartLoading.js`, con tests de paridad cliente/servidor.

### v2.4.1 (7 Jul 2026) — Fixes de Atajo de iOS y notificaciones
Las sesiones parciales del Atajo ya no bloquean completar el ejercicio a mano, el RIR enviado por el Atajo se guardaba invertido (corregido, con script de corrección retroactiva), el aviso de descanso ahora menciona el ejercicio siguiente correcto al cambiar de ejercicio, se eliminaron notificaciones duplicadas al completar varias series de golpe, y un aviso "fantasma" al recargar la página quedó corregido.

### v2.4.0 (6 Jul 2026) — Entrenador inteligente
Detección de plateau, mesociclos (`RoutineBlock`: acumulación / intensificación / descarga) y descarga adaptativa automática cuando cae el volumen semanal y varios ejercicios se estancan a la vez.

### v2.3.0 (6 Jul 2026) — UX real de gimnasio
Fix crítico de modales que se salían de pantalla en cuanto había scroll (nuevo componente `Portal`), fotos de progreso migradas a Cloudinary con fallback a Catbox, temporizador de descanso real por serie (antes solo saltaba entre ejercicios), timer resistente a que el navegador pause timers en segundo plano, y notificaciones que ya no se apilan.

### v2.2.0 (3 Jul 2026) — Auditoría de seguridad e integridad
Fix de raíz del bug de zona horaria (UTC del contenedor vs. Ciudad de México) centralizado en un solo lugar tras aparecer en 5 endpoints distintos, revocación real de sesión, rate limiting por cuenta además de por IP, protección explícita del historial contra borrado en cascada, recordatorio de re-enganche, y una decena de fricciones de UX encontradas usando la app con datos reales.

### v2.1.0 (2 Jul 2026) — Atajo de iOS y Web Push
Endpoints para registrar series desde un Atajo de iOS sin abrir la app, notificaciones push de fin de descanso, y deduplicación de ejercicios al importar rutinas vía LLM.

### v2.0.x (Mayo 2026) — PWA real y backend único
Service worker instalable y offline, code-splitting del bundle, sistema de logros y estándares de fuerza, y consolidación en un solo backend (se eliminaron el backend serverless de Vercel y el código compartido duplicado; deploy exclusivo en VPS + Docker desde entonces).

<details>
<summary>Versiones anteriores (v1.x)</summary>

- **v1.9.x:** Papelera de historial para ejercicios con logs, sugerencia de carga calculada localmente (se retiró la IA de esa función puntual), soporte de ejercicios unilaterales, historial ilimitado con filtros.
- **v1.8.0:** Sistema multi-usuario con JWT, fotos vía Catbox.moe.
- **v1.6.x – v1.7.x:** Fórmula de Epley unificada, protección de logs contra borrado en cascada, normalización de nombres de ejercicio, primer fix de timezone.

</details>

---

## 👤 Autor

**Fernando Guerrero**
- GitHub: [@fernandosegrr](https://github.com/fernandosegrr)

---

## 📄 Licencia

Este proyecto está licenciado bajo la [Licencia MIT](LICENSE).

Copyright © 2026 Fernando Guerrero
