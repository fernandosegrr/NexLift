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
server/          → Express.js backend (local dev)
  src/index.js   → Main server entry
  prisma/        → Prisma schema & migrations (DEV)
api/             → Vercel serverless deployment
  prisma/        → Prisma schema (PROD) — MUST stay in sync with server/prisma
shared/          → Shared utilities
```

## Key Commands
```bash
cd server && npm run dev     # Start backend
cd client && npm run dev     # Start frontend
cd server && npx prisma studio  # View DB data
```

## Schema Sync Rule
Two copies of schema.prisma exist: `server/prisma/schema.prisma` (dev) and `api/prisma/schema.prisma` (prod). **Any schema change must be applied to both files.**

## Design System
- OLED black (`#0a0a0a`), card bg (`#141414`), primary violet (`#8b5cf6`)
- All UI is mobile-first, dark theme only

## Date Handling
- DB stores UTC. Frontend must convert to local for display.
- Use `date.toLocaleDateString('sv')` (ISO format) when sending dates to backend.

## Images
No binary storage. Frontend → Base64 → Backend → Catbox.moe API → URL stored in DB.

## Current Version: 1.9.6

## Conventions
- Spanish UI, Spanish commit messages preferred
- Commits follow: `feat:`, `fix:`, `refactor:` prefixes
- Exercise history and PRs are tied by exercise ID — never delete exercises with logs (use archive system)
