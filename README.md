# 🏋️ NexLift

> **Tu compañero de gimnasio inteligente**  
> Registra tu entrenamiento y deja que el entrenador adaptativo calcule peso, reps y cuándo tocar descarga.

![Project Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/Version-4.0.0-blue?style=flat-square)

---

## Publicación v4.0 — Fases 1–10

El propietario autorizó commits, push directo a main y su posible despliegue automático.
El Dockerfile raíz usa ahora la misma receta que Dockerfile.release: Node 24.22.1,
build de workspaces y arranque HTTP sin DDL. Express continúa disponible; Fastify
requiere selección y autorización de configuración explícitas.

Configurar las variables obligatorias y puerto 3001 conforme a
[EasyPanel v4](docs/RELEASE-V4-EASYPANEL.md). El arranque rechaza configuración
incompleta o esquema incompatible: publicar no ejecuta ni autoriza migraciones
sobre una baseline desconocida. Linux/Docker y producción aún no están certificados.
[Runbook](docs/RELEASE-V4-RUNBOOK.md) e
[informe de publicación](docs/PUBLICATION-V4.md).

Las instrucciones v3 de db push que aparecen más abajo son históricas y quedan
retiradas: no ejecutarlas sobre producción. Los informes de cada fase conservan
la autorización y resultados de su ejecución original.

## Desarrollo v4: monorepo (Fase 4.1)

Fase 6: [modelo, migración y recuperación del historial](server/audit/database/PHASE-6-COMPLETE.md).
`npm run test:database:integration` usa únicamente PostgreSQL nuevo desechable;
`npm test` verifica compatibilidad anterior y el modelo nuevo en una copia aislada.
Baseline PROVISIONAL, sin autorización de migración o despliegue productivo.

Con Node **24.22.1** y npm **11.19.1**, desde la raíz: `npm ci`,
`npm run db:generate`, `npm run check` y `npm run build`. Desarrollo independiente:
`npm run dev:client` / `npm run dev:server`, exclusivamente con un destino local
autorizado. `npm test` ejecuta la matriz completa en otra copia y bases desechables;
`npm run test:client` y `npm run test:server` ejecutan las unitarias independientes.

Procedimiento, lockfiles, límites de shared y TypeScript:
[docs/MONOREPO.md](docs/MONOREPO.md). Informe:
[PHASE-4.1.md](server/audit/monorepo/PHASE-4.1.md).
La primera migración TypeScript (Fase 4.2), sus builds y fachadas de compatibilidad
se explican en [docs/TYPESCRIPT.md](docs/TYPESCRIPT.md).
La baseline continúa **PROVISIONAL**. No se modifica producción ni se habilita
la sincronización nueva allí. El Dockerfile operativo fue sustituido al publicar
v4; cualquier migración persistente sigue requiriendo una revisión posterior.

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
- **Rutina diaria con IA (v2.7.0):** para quien no tiene rutina fija — responde un cuestionario corto (objetivo, días/semana, equipo, experiencia) y la app decide qué entrenar cada día. El peso y las reps de cada serie los sigue calculando el mismo Smart Loading determinista de siempre; funciona igual sin IA configurada (plantillas de split fijas como fallback).
- Papelera de historial: un ejercicio con series registradas nunca se borra de verdad al editar o eliminar una rutina.

### 🧠 Entrenador Inteligente
- **Sugerencia de carga (Smart Loading):** doble progresión con autorregulación por RIR sobre la última sesión completa — sube peso y reinicia reps al llegar al tope del rango, suma reps si sobró margen, ajusta si hubo fallo. 100% cálculo local, sin IA.
- **Autorregulación por serie (v2.8.0):** tras la primera serie, el coach recalcula la siguiente mirando **todas las series de hoy** (RIR obligatorio, con pregunta al completar). Puede **bajar el peso** si la sesión se puso dura; chip chico en cada serie siguiente.
- **Detección de plateau:** marca un ejercicio como estancado si su mejor 1RM estimado no mejora entre la mitad antigua y la reciente de sus últimas sesiones (calculado en el servidor, últimas 10 sesiones).
- **Descarga adaptativa:** si el volumen semanal cae por debajo del 85% del anterior y 3+ ejercicios están en plateau al mismo tiempo, la rutina entra en una ventana de descarga automática con la carga sugerida reducida — siempre avisado con un banner visible, nunca en silencio.
- La fase activa de un mesociclo ajusta en tiempo real el rango de reps usado para sugerir (más reps en acumulación, más peso/menos reps en intensificación).
- **Calculadora de calentamiento (v2.7.0):** rampa 40/60/80% del peso sugerido + tabla libre "peso a X%", visible junto a la sugerencia de cada ejercicio.
- **Objetivo visible (v2.7.0):** si el ejercicio actual tiene un Objetivo de fuerza activo, un chip muestra el peso/reps que le toca esta semana según su plan de periodización — sin mezclarse con la sugerencia de Smart Loading.

### 📲 Atajo de iOS (Shortcuts)
- Registra una serie sin abrir la app: un Atajo consulta la sugerencia del próximo ejercicio y guarda la serie contra la misma cuenta.
- Compatible con sesiones parciales: si ya registraste algunas series por el Atajo, la app las muestra editables junto con las que faltan, sin fragmentar el registro del día.

### 🔔 Notificaciones Push (Web Push / VAPID)
- **Recordatorios escalonados de Creatina (3 etapas):** Notificaciones automáticas en horario CDMX a la hora programada (ej. 16:00), a las +3 horas si no se ha tomado, y última llamada a las 23:00 antes de dormir.
- **Aviso de fin de descanso:** Alerta al completar cada serie (con el nombre del ejercicio siguiente si tocaba cambiar de ejercicio).
- **Re-enganche:** Recordatorio de "¿no vas a entrenar hoy?" si llevas 3+ días sin registrar actividad, a tu hora habitual de gym.
- Totalmente opcional — sin claves VAPID configuradas, la app funciona igual, solo sin push.

### ⚡ Daily Check-in & Hábitos (Adherencia en Dashboard)
- Toggles interactivos optimistas en la pantalla de inicio para registrar diariamente:
  - ⚡ Creatina tomada (5g) — anula automáticamente las etapas push restantes del día.
  - 🥗 Déficit calórico o dieta cumplida.
  - 💧 Cero calorías líquidas (cero refrescos o jugos con azúcar).

### 📊 Análisis y Progreso
- **Carga instantánea:** Endpoints agrupados (`/api/stats/home` y `/api/stats/progress-page`) que devuelven todas las métricas en un solo roundtrip HTTP.
- Dashboard con racha, heatmap de consistencia estilo GitHub y PRs del mes.
- Evolución de 1RM estimado, distribución de volumen por grupo muscular, cumplimiento semanal.
- **Objetivos (Goals):** planes de periodización (Fuerza/Hipertrofia) generados desde tu 1RM real o uno manual.

### 🏋️ Body Tracking
- Peso corporal + 8 métricas de báscula inteligente (grasa, agua, músculo, hueso, visceral, proteína, BMI, BMR).
- Fotos de progreso: suben a Cloudinary si está configurado, con fallback automático a Catbox.moe.
- Comparador visual con deslizador y visor fullscreen con zoom.

### 📄 Reportes PDF
- Exportación con rango configurable (7/30/90 días): resumen ejecutivo, tabla de PRs, detalle diario de volumen, composición corporal y galería de fotos.

### 🎨 PWA
- OLED negro puro, instalable desde el navegador, shell/assets offline. API y Authorization solo por red; journal y borradores propios en Dexie bajo las flags de ensayo, con conservación de legacy y confirmación mediante comprobantes (Fases 3.1–3.5).

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
├── package.json + package-lock.json # npm workspaces y versiones reproducibles
├── packages/shared/            # Paquete puro mínimo; sin lógica deportiva todavía
├── configs/                    # Bases TypeScript para adopción gradual
├── scripts/                    # Verificación aislada, límites y Prisma offline
├── docs/MONOREPO.md            # Procedimiento actual de desarrollo
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
│   ├── prisma/                  # Schema intacto + migraciones PROVISIONALES
│   └── scripts/ + *.mjs          # Mantenimiento: migración de fotos a Cloudinary, fix de RIR del Atajo...
├── .agent/
│   └── context.md              # Contexto histórico; contrastar con código e informes PHASE
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

El formato v4 centraliza la exportación manual y automática: 15 modelos exportables, IDs, rutinas manuales/IA, historial, objetivos, mesociclos, cardio, perfil y preferencias seguras, con manifiesto y SHA-256. `GET /api/backup/export` entrega un snapshot consistente sin truncar el historial. Settings analiza cada importación antes de mostrar el botón para aplicarla. La restauración es transaccional, remapea IDs al cambiar de cuenta y rechaza contenidos existentes diferentes sin sobrescribirlos.

- **Forzar un backup ahora:** `POST /api/backup/run` (autenticado) — corre solo para el usuario del token, útil antes de una operación riesgosa o para probar la integración.
- **Consultar el respaldo propio:** `GET /api/backup/status` con autenticación → `lastBackupAt` y `hasBackupError`. Los probes públicos `/api/health` y `/api/ready` no exponen datos de respaldos.
- **Restaurar JSON:** la cuenta destino debe estar registrada; sus credenciales nunca se importan. Las CLI ya **no cargan `.env` ni infieren el destino de `DATABASE_URL`**. Ejemplo con una base local nueva:
  ```powershell
  cd server
  $env:NEXLIFT_RESTORE_DATABASE_URL='postgresql://usuario@127.0.0.1:5432/nexlift_recuperacion'
  node restore-backup.mjs --file=./backup.json --user=cuenta
  node restore-backup.mjs --file=./backup.json --user=cuenta --apply
  ```
  `--restore-profile` permite aplicar el perfil seguro; `--allow-incomplete` reconoce las omisiones detalladas de un legacy. Cloudinary exige `--source-user-id=<id>`; los archivos anteriores requieren además `--public-id` explícito y `--allow-legacy-cloud`. No se selecciona el último respaldo global.

Con Cloudinary configurado, el job diario (~04:00 CDMX) sube recursos `raw` + `authenticated` y verifica su descarga. Se organizan en `nexlift-backups/users/<hash-del-id>/`; la retención tiene límite de 14 por cuenta y ordena por `created_at`. **La poda está en análisis por defecto** (`NEXLIFT_BACKUP_PRUNE_ENABLED=false`). Su activación operativa posterior afecta solamente al nuevo namespace; los archivos legacy no se podan. Acceso autenticado no equivale a cifrado propio del archivo.

Un archivo recién exportado indica `restoreVerified:false`. Para certificar **ese archivo**, el siguiente comando crea un PostgreSQL temporal nuevo, restaura, compara todos los datos y comprueba la repetición; el comprobante externo identifica su checksum:

```powershell
cd server
node test/run-backup-integration.mjs --verify-file=C:/respaldos/backup.json --receipt=C:/respaldos/backup.verificado.json
```

La recuperación PostgreSQL utiliza `postgres-recovery.mjs` (`pg_dump`/`pg_restore`, esquema y datos seguros). Por la política de excluir secretos, omite credenciales y push; requiere restablecer el acceso a las cuentas. Restore exige una base nueva sin tablas y verifica conteos y datos antes del commit. **Las fotos solo se conservan como URL; sus binarios no están respaldados.** Procedimientos, resultados, retención externa y límites: [informe de fase 1.3](server/test/PHASE-1.3.md).

---

## 📋 Formato de Importación de Rutinas

```json
{
  "name": "Mi Rutina",
  "description": "Descripción opcional",
  "days": [
    {
      "dayName": "Torso",
      "weekday": 1,
      "exercises": [
        { "name": "press banca", "targetSets": 4, "targetReps": "8-10", "restSeconds": 150, "muscleGroup": "Pecho" },
        { "name": "remo pendlay", "targetSets": 4, "targetReps": "4-6", "restSeconds": 0, "muscleGroup": "Espalda", "isUnilateral": false, "note": "Técnica controlada" }
      ]
    },
    {
      "dayName": "Descanso",
      "weekday": 2,
      "isRestDay": true,
      "exercises": []
    }
  ]
}
```

`weekday`: 0=Domingo … 6=Sábado. Si lo omites y `dayName` trae un día ("Lunes - Torso"), se asigna solo — pero un nombre sin día ("Push", "Día 1") queda sin programar hasta que lo asignes en el editor.

Se conservan los alias históricos `sets`, `reps`, `rest`, `muscle` y `day.name`. Si aparecen junto a su campo canónico, deben expresar el mismo valor; los conflictos devuelven `400` indicando el campo. `restSeconds: 0` significa cero segundos y `null` significa sin descanso configurado. Los valores por defecto solo se aplican a campos ausentes. El servidor valida el grafo completo y confirma la importación después de completar la transacción. Contrato, reglas y pruebas: [informe de fase 1.4](server/test/PHASE-1.4.md).

> 💡 **Tip:** Pídele a ChatGPT que genere tu rutina en este formato JSON.

La persistencia de entrenamientos, series y récords personales se verifica en el
[informe de fase 1.5](server/test/PHASE-1.5.md), con transacciones, concurrencia,
contratos HTTP y pruebas sobre PostgreSQL aislado.

---

La auditoría de PostgreSQL y preparación de migraciones está en el
[informe de fase 2.1](server/audit/postgresql/PHASE-2.1.md), con inventario completo,
SQL de lectura y procedimiento de baseline pendiente de activación.

La [fase 2.2](server/audit/postgresql/PHASE-2.2.md) incorpora una baseline
**PROVISIONAL**, ensayos aislados de Prisma Migrate, recuperación del historial
y una propuesta de arranque con validación previa. No activa migraciones en producción.

La [fase 2.3](server/audit/infrastructure/PHASE-2.3.md) prepara Node 24 LTS,
Docker multietapa de ensayo y separa fallos de PostgreSQL de sesiones inválidas.
El [procedimiento de infraestructura](server/deploy/INFRASTRUCTURE-2.3.md) sigue
sin activar migraciones ni sustituir el Dockerfile de producción.

La [fase 2.4](server/audit/staging/PHASE-2.4.md) crea staging local aislado con
PostgreSQL, API y frontend, referencia sintética protegida y restauraciones
verificadas. El [procedimiento operativo](server/deploy/STAGING-2.4.md) incluye
Compose y EasyPanel pendientes de validación. La baseline continúa PROVISIONAL.

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
cd client && npm test   # vitest — 76 tests (exerciseName, dates, routineDays parity, smartLoading parity, offlineQueue)
cd server && npm test   # node --test — 104 tests (server/src/logic.js, aiRoutineService.js)
```
> ⚠️ La suite de 180 tests automatizados cubre de forma exhaustiva la lógica pura (fechas CDMX, periodización, Smart Loading, paridad cliente/servidor, rotaciones y creatina).

---

## 📜 Changelog

Historial completo y detallado (con causa raíz de cada fix) en [`.agent/changelog.md`](.agent/changelog.md). Resumen de versiones recientes:

### v3.0.0 (17 Oct 2026) — Creatina, Daily Check-in y Endpoints Agrupados
Recordatorios escalonados de creatina (Web Push en 3 etapas), Daily Check-in de hábitos en Dashboard (`BodyLog`: creatina, dieta, cero calorías líquidas), endpoints agregados de 1 solo roundtrip (`/api/stats/home` y `/api/stats/progress-page`), importación web de backups (`POST /api/backup/import`), poda de código muerto y suite de 180 tests automáticos.

### v2.9.1 (25 Jul 2026) — Día de la semana explícito en rutinas manuales
`RoutineDay.weekday` explícito (0=Dom..6=Sáb) asignado vía `WeekdayPicker.jsx` para que las rutinas manuales siempre identifiquen correctamente qué día toca hoy sin depender del nombre de texto. Migración automática de datos existentes y tests de paridad.

### v2.8.2 (14 Jul 2026) — Camino caliente a prueba de bugs
Fix `getTodayName` (día de semana CDMX, no UTC del contenedor), filtros de historial por día CDMX, validación centralizada de series/RIR (API + Atajo), tests ampliados y checklist anti-regresión (`.agent/checklist-cero-bugs.md`).

### v2.8.0 (14 Jul 2026) — Coach por serie + rendimiento
Autorregulación **dentro** de la sesión (`suggestNextSetFromToday`): RIR obligatorio con pregunta al completar, chip por serie, puede bajar peso según las series de hoy. Plateau en servidor (`GET /api/stats/plateaus`), historial acotado a 10 sesiones para Smart Loading, cache HTTP en GETs de lectura e índices Prisma en el camino caliente.

### v2.6.2 (9 Jul 2026) — Instrumentación de calibración del entrenador inteligente
Cada sugerencia de peso/reps (mostrada por el Atajo de iOS o aplicada en la app) ahora queda registrada (`SuggestionLog`). Nuevo script `server/analyze-suggestions.mjs` (solo lectura) compara sugerido vs. realizado — no cambia ningún umbral todavía, solo recolecta datos para decidir eso después con semanas de uso real.

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

## NexLift — Fase 3.1

Backend de operaciones idempotentes preparado y probado exclusivamente en PostgreSQL desechable. Contrato, migración provisional, concurrencia, fechas originales y recuperación: [informe de la fase 3.1](server/audit/operations/PHASE-3.1.md). La sincronización automática del frontend sigue sin activarse.

## NexLift — Fase 3.2

La sincronización automática del frontend se incorpora bajo activación explícita y se demuestra en ensayo aislado. Producción continúa deshabilitada. El journal conserva identificadores, fechas, conflictos y datos legacy; PostgreSQL aporta la idempotencia. Arquitectura, configuración, pruebas y límites pendientes: [informe de la fase 3.2](server/audit/sync/PHASE-3.2.md).

## NexLift — Fase 3.3

La migración recuperable a IndexedDB/Dexie se documenta en [Fase 3.3](server/audit/storage/PHASE-3.3.md). Ambas flags permanecen deshabilitadas por defecto; no se retiran los originales legacy.

Fase 3.4: [Resolución de conflictos y concurrencia offline](server/audit/conflicts/PHASE-3.4.md).

Fase 3.5: [Estabilización integral offline, pruebas end-to-end y gates de activación](server/audit/offline/PHASE-3.5.md). La activación en producción permanece bloqueada.
