# NexLift - Claude Code Guide

## Project Overview
NexLift is a PWA gym tracking app. Mobile-first, OLED dark theme. Built with React 18 + Vite + Tailwind CSS 4 (frontend) and Express.js + Prisma + PostgreSQL (backend).

## Architecture
```
client/          → React frontend (Vite)
  src/pages/     → Page components (Dashboard, Workout, Progress, etc.)
  src/components/→ Reusable components (goals/, layout/, ui/)
  src/services/  → API client functions
  src/context/   → React context providers
  src/data/      → Static data (exercises.js)
server/          → Express.js backend (ÚNICO backend, dev y prod)
  src/index.js   → Main server entry (sirve también client/dist en prod)
  prisma/        → Prisma schema & migrations
```
Backend único: `server/src/index.js` es el único backend. El antiguo `api/` (serverless de Vercel) y `shared/` fueron eliminados al migrar el deploy a Docker en VPS.

## Key Commands
```bash
cd server && npm run dev     # Start backend
cd client && npm run dev     # Start frontend
cd server && npx prisma studio  # View DB data
```

## Prisma: usar `db push`, nunca `migrate`
No existe `server/prisma/migrations/` — el schema siempre se ha sincronizado con `npx prisma db push`. Correr `prisma migrate dev`/`migrate deploy` falla con "drift detected" y ofrece resetear TODO el schema (pérdida total de datos) porque no hay historial de migraciones contra el que reconciliar. Para cualquier cambio de schema: `cd server && npx prisma db push` (y `npx prisma generate` aparte si el server estaba corriendo — Windows bloquea el archivo del query engine).

## Deploy (VPS + EasyPanel + Docker)
- `Dockerfile` (raíz): build multi-stage → compila el cliente, genera Prisma y arranca `server` (que sirve `client/dist` + API en el mismo puerto).
- **Variables de entorno obligatorias en EasyPanel:** `DATABASE_URL`, `JWT_SECRET` (el server NO arranca en producción sin `JWT_SECRET`), `NODE_ENV=production`. Opcional: `PORT`.
- **Variables opcionales (nuevas funciones, degradan sin romper si faltan):** `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (Web Push de recordatorio de descanso — sin ellas, `scheduleRestReminder` es no-op), `OPENAI_API_KEY` (deduplicación de ejercicios al importar rutinas — sin ella, cae al matching determinista por `canonicalExerciseKey`). Ver `server/.env.example`.

## Design System
- OLED black (`#0a0a0a`), card bg (`#141414`), primary violet (`#8b5cf6`)
- All UI is mobile-first, dark theme only

## Date Handling
- DB stores UTC. Frontend must convert to local for display.
- Use `date.toLocaleDateString('sv')` (ISO format) when sending dates to backend.
- **Backend: la app es de un solo usuario, siempre en América/Ciudad de México, pero el contenedor corre en UTC.** Cualquier cálculo de "qué día es" (streak, heatmap, ventanas de "hoy", filtros por día de semana) DEBE pasar por los helpers de `server/src/index.js` (`mexicoCityDateStr`, `mexicoCityDayBounds`, `mexicoCityHour`, `dayOfWeekFromDateStr`) — nunca `new Date()` ni sus accesores locales directo. Este bug se "arregló" 3 veces en distintos endpoints antes de resolverse por completo en un solo lugar; si agregas un endpoint nuevo que agrupe por día, usa estos helpers desde el inicio.

## Sesión y autenticación
- JWT con `tokenVersion` embebido: cambiar la contraseña o la pregunta de seguridad incrementa `User.tokenVersion` e invalida todos los tokens emitidos antes (`authMiddleware` lo compara en cada request). Esas dos rutas devuelven un `token` nuevo en la respuesta — el frontend debe persistirlo (`AuthContext.updateToken`) o la sesión actual se cierra sola.
- Tokens duran 365 días a propósito (se pegan una vez en un Atajo de iOS y no se renuevan) — la revocación real depende de `tokenVersion`, no de la expiración.
- Rate limiting en memoria (`rateLimit()` en `index.js`) — soporta un `keyFn` opcional para limitar por cuenta además de por IP (usado en recuperación de contraseña).

## Recordatorios (Web Push)
- `scheduleRestReminder`: aviso de fin de descanso tras registrar una serie (además hay un temporizador visual en `Workout.jsx` como respaldo, porque el push no es fiable en iOS Safari/PWA).
- `checkReengagementReminders` (revisa cada 30 min): infiere la hora habitual de gym del usuario desde su historial real y manda "¿no vas a entrenar hoy?" si lleva 3+ días sin registrar nada, esa hora, máximo una vez al día (`User.lastReengagementNotifiedAt`).
- Ambos son no-op si `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no están configuradas.

## Images
No binary storage. Frontend → Base64 → Backend → Catbox.moe API → URL stored in DB.

## Current Version: 2.2.0

## Conventions
- Spanish UI, Spanish commit messages preferred
- Commits follow: `feat:`, `fix:`, `refactor:` prefixes
- Exercise history and PRs are tied by exercise ID — never delete exercises with logs (use archive system)
- **No hay suite de tests automatizados.** Cualquier cambio a lógica de fechas, PRs, rutinas o autenticación debe probarse a mano (levantar server+client, probar en navegador) antes de darlo por bueno — no hay red de seguridad que atrape una regresión.

## Roadmap: entrenador inteligente
La app ya tiene los datos (historial completo por ejercicio, RIR, 1RM estimado) para dejar de ser solo un registro y sugerir de forma proactiva. Orden sugerido, de menor a mayor esfuerzo:
1. **Detección de plateau** — sin cambio de schema. Comparar el mejor 1RM estimado de las últimas 4-6 sesiones por ejercicio; si no sube, marcarlo y mostrarlo (Dashboard o Progreso).
2. **Sugerencia de descarga** — pequeño cambio de schema (algo como `Routine.deloadEveryWeeks`). Combinar volumen semanal a la baja + varios ejercicios en plateau a la vez para bajar automáticamente la sugerencia esa semana.
3. **Mesociclos/bloques reales** — la más grande: redefinir una rutina como bloques con nombre/duración (acumulación → intensificación → descarga) en vez de un split fijo indefinido. Solo vale la pena si 1 y 2 no bastan.
