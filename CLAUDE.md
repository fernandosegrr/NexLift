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

## Images
No binary storage. Frontend → Base64 → Backend → Catbox.moe API → URL stored in DB.

## Current Version: 2.1.0

## Conventions
- Spanish UI, Spanish commit messages preferred
- Commits follow: `feat:`, `fix:`, `refactor:` prefixes
- Exercise history and PRs are tied by exercise ID — never delete exercises with logs (use archive system)
