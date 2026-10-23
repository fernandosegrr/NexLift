# NexLift - Documentación Completa del Proyecto

> **Documentación exhaustiva para IAs y desarrolladores que trabajen en este proyecto.**
> **Versión:** 3.0.0 | **Última actualización:** 17 Octubre 2026
> **Historial de versiones:** [`changelog.md`](changelog.md) | **Schema:** `server/prisma/schema.prisma`
> **Checklist camino caliente:** [`checklist-cero-bugs.md`](checklist-cero-bugs.md)

---

## 🎯 ¿Qué es NexLift?

**NexLift** es una Progressive Web App (PWA) completa de tracking de gimnasio y fuerza. Está diseñada mobile-first con tema OLED oscuro (`#0a0a0a` puro) para máximo ahorro de batería en móviles con pantalla AMOLED/OLED.

A diferencia de una simple libreta de notas de gimnasio, NexLift se diferencia por su **periodización matemática**, **autorregulación intra/inter-sesión**, **prevención de estancamiento** y **adherencia diaria**:
1. **Doble progresión autorregulada por RIR**: En cada serie sugiere peso y repeticiones analizando la sesión anterior y ajustando intra-sesión con las series completadas hoy.
2. **Entrenador inteligente adaptativo**: Detección de estancamiento (plateau), mesociclos (acumulación, intensificación, descarga) y descarga adaptativa automática cuando el volumen cae y varios ejercicios se estancan a la vez.
3. **Rutina diaria con IA (o determinista)**: Para quien no tiene rutina fija, un cuestionario de 4 pasos genera la sesión de hoy balanceando volumen y rotación sin romper la continuidad del historial.
4. **Adherencia & Hábitos (Daily Check-in)**: Registro diario de creatina, cumplimiento de déficit/dieta y cero calorías líquidas, con notificaciones Web Push escalonadas en 3 etapas.
5. **Integración con Atajos de iOS (Shortcuts)**: Registrar series con un toque o por voz desde Siri/Atajos sin abrir la app, con soporte de sesiones parciales y reconciliación inteligente.
6. **Resiliencia extrema (Offline-first + Backups diarios)**: Registro de series funcional en sótanos sin señal con cola de sincronización automática y backup diario encriptado a Cloudinary.

### Stack Tecnológico Real

```
Frontend:   React 19.2 + Vite 7.2 + Tailwind CSS 4.1 + Recharts 3.6 + Lucide React
PWA:        Service Worker (Cache-first estáticos / Network-first API / Background sync) + Manifest
Backend:    Express.js 4.18 (ÚNICO backend en dev y prod) + Prisma ORM 6.0 + PostgreSQL
Seguridad:  JWT (365 días con tokenVersion para revocación inmediata) + bcryptjs + Helmet + Rate Limiting
Push:       Web Push (VAPID) en segundo plano (recordatorio de descanso y creatina escalonada)
Fotos:      Cloudinary (con SLA y firma autenticada) con fallback automático a Catbox.moe
IA:         OpenAI GPT-4o-mini (opcional, para deduplicación de ejercicios y armado de rutina diaria)
Reportes:   jsPDF 4.0 + html2canvas + jsPDF-AutoTable (PDFs de sesión y de periodo)
Deploy:     Docker multi-stage en VPS (EasyPanel / Dokku / CapRover) con sync automático de Prisma
Tests:      180 tests automatizados (104 Node tests en backend + 76 Vitest tests en frontend)
```

---

## 🏗️ Arquitectura General del Sistema

```
NexLift/
├── client/                     # Frontend SPA en React 19 + Vite 7
│   ├── public/                 # sw.js, manifest.json, iconos OLED
│   ├── src/
│   │   ├── components/         # Componentes UI reutilizables
│   │   │   ├── goals/          # GoalCard.jsx, GoalSection.jsx
│   │   │   ├── layout/         # Layout.jsx (Nav 4 tabs + Brand bar móvil)
│   │   │   └── ui/             # Celebration, MuscleIcon, Portal, Toast, WeekdayPicker
│   │   ├── context/            # AuthContext.jsx (sesión, tokenVersion, push)
│   │   ├── data/               # exercises.js, routineTemplates.js, strengthStandards.js
│   │   ├── pages/              # 17 páginas completas (Dashboard, Workout, Progress, etc.)
│   │   ├── services/           # api.js (cliente HTTP), offlineQueue.js (storage de cola)
│   │   └── utils/              # smartLoading, dates, exerciseName, goalPlanner, routineDays, etc.
│   └── vitest.config.js        # Configuración de pruebas unitarias
├── server/                     # Backend Express 4 (ÚNICO backend)
│   ├── prisma/schema.prisma    # Esquema PostgreSQL (fuente única de verdad)
│   ├── src/
│   │   ├── index.js            # Entry point Express, endpoints HTTP, tareas en background
│   │   ├── logic.js            # Funciones puras extraídas y testeadas (fechas, smart loading, etc.)
│   │   ├── logic.test.js       # Suite de 104 tests automatizados del backend
│   │   ├── data/               # exerciseCatalog.js, splitTemplates.js (catálogos de backend)
│   │   ├── services/           # aiRoutineAgent, aiRoutineService, backupService, exerciseAgent
│   │   └── utils/              # exerciseName.js (normalización)
│   ├── scripts/                # Scripts de mantenimiento (migraciones de fotos, fix de RIR)
│   ├── analyze-suggestions.mjs # Script de calibración de sugerencias
│   ├── backfill-routine-weekday.mjs # Migración de días de rutina
│   └── restore-backup.mjs      # Restauración automatizada de backups de Cloudinary
├── .agent/                     # Suite de documentación técnica para desarrolladores e IAs
├── CLAUDE.md                   # Guía de convenciones para desarrollo
├── Dockerfile                  # Build multi-stage para VPS con auto db push
└── README.md                   # Presentación del proyecto para usuarios
```

---

## 📱 Páginas y Componentes del Frontend

### 1. Dashboard (`Dashboard.jsx`)
**Ruta:** `/` (Home)
- **Carga ultra-optimizada:** Consume el endpoint agregado `GET /api/stats/home` (un solo round-trip HTTP) con cache en `sessionStorage` (`nexlift_home_v3`, TTL 5 min) para renderizado instantáneo (stale-while-revalidate).
- **Daily Check-in (Hábitos de Adherencia):** Toggles interactivos optimistas para:
  - ⚡ Creatina tomada hoy (5g)
  - 🥗 Cumplimiento de déficit calórico / dieta
  - 💧 Cero calorías líquidas
- **KPIs Rápidos:**
  - Racha actual (streak de días consecutivos entrenando o descansando según rutina)
  - Workouts completados del mes
  - Personal Records (PRs) rotos en el mes
  - Días restantes del mes
- **Alerta de Plateau:** Si hay ejercicios estancados en el servidor, muestra tarjeta de aviso con link a Progreso.
- **Tarjeta de Entrenamiento de Hoy:**
  - Si la rutina es manual: resuelve qué día toca hoy vía `resolveTodayRoutineDay(activeRoutine.days)` usando el `weekday` CDMX.
  - Si la rutina es IA (`source: 'ai'`): resuelve el día generado hoy vía `aiTodayDay`.
  - Muestra split, ejercicios programados, target reps y sets, y banner de fase (Acumulación / Intensificación / Descarga).
  - CTA principal "Entrenar Hoy" (con prefetch de chunk de Workout en idle) o botón para registrar día de descanso.
- **Heatmap de Actividad:** Calendario de consistencia estilo GitHub (30/60 días) que integra fuerza y días de descanso programados.
- **PRs Recientes:** Muestra las últimas marcas personales superadas.

### 2. Workout (`Workout.jsx`)
**Ruta:** `/workout/:dayId`
Página crítica para registrar el entrenamiento activo. Series-first (lo primero que ve el usuario son las tarjetas de series).
- **Persistencia en tiempo real (`useWorkoutPersistence`):** Guarda en `localStorage` (`workout_${dayId}`) en cada pulsación de tecla para evitar pérdida de datos si el móvil cierra la pestaña o se apaga. Expira en 24h.
- **Smart Loading (Doble Progresión Autorregulada por RIR) — 100% local, sin latencia:**
  - **Serie 1 (Inter-sesión):** `computeWorkoutSuggestion` analiza la última sesión completa (ventana de 10). Si completaste el tope de reps con RIR ≤ 1 o todas las series tocaron el tope, sube peso (5kg piernas / 2.5kg torso) y reinicia reps. Nunca sugiere bajar peso entre días.
  - **Series 2..N (Intra-sesión):** `suggestNextSetFromToday` analiza TODAS las series completadas hoy con RIR. Sí puede bajar peso si hubo fallo o fatiga excesiva.
  - **Protección Top Set / Back-off:** Si la Serie 1 se hace al fallo (RIR 0 / RPE 10), sugiere automáticamente un Back-off Set (-12.5% de carga) para las siguientes.
  - **Protección contra Ego-Lifting:** Series de 1 o 2 reps se ignoran para la referencia de trabajo a menos que el rango sea de fuerza máxima (lo ≤ 3).
- **Modal de RIR:** Al marcar una serie como completada sin haber ingresado RIR, abre un modal interactivo con opciones (0 al fallo, 1, 2, 3+).
- **Temporizador de Descanso Visual + Push:**
  - Temporizador visual en pantalla basado en timestamp absoluto (`Date.now() + restSeconds * 1000`), sin congelarse cuando el móvil pasa a segundo plano.
  - Agendamiento de push persistente (`POST /api/workouts/rest-reminder`) por serie. Al terminar la última serie del ejercicio, calcula `nextExerciseName` para que el aviso diga: *"Descanso terminado. Siguiente: [Próximo Ejercicio]"*.
  - Sincronización de `prevSetsSnapshotRef` para evitar disparos fantasma al cargar series previas.
- **Reconciliación con Atajo de iOS:** Si el Atajo registró series parciales hoy (ej. 1 de 3), muestra las series ya guardadas editables + filas vacías para las restantes. Al guardar, usa `PUT /api/workouts/:logId` para no fragmentar el día en dos registros.
- **Calculadora de Calentamiento:** Panel `<details>` colapsable con rampa 40/60/80% y tabla libre de porcentajes.
- **Chip de Objetivo:** Si el ejercicio tiene un `Goal` activo, muestra la meta de la semana actual calculada por `goalPlanner.js`.
- **Soporte Unilateral:** Campos independientes para lado izquierdo y derecho; la progresión se rige por el lado débil.
- **Cola Offline:** Si falla la red, guarda localmente, avisa con badge amarillo y encola para sincronizar al volver la conexión.
- **Resumen Post-Sesión & PDF:** Al finalizar el día, muestra resumen con volumen total, PRs rotos y descarga instantánea del PDF de la sesión (`sessionPdf.js`).

### 3. Rutinas (`Routines.jsx`) y Detalle (`RoutineDetail.jsx`)
**Rutas:** `/routines`, `/routines/:id`
- Lista de rutinas manuales e IA.
- Indicador visual de rutina activa, botón de activación directa (`PUT /api/routines/:id/activate`).
- Rutinas IA muestran tarjeta resumen con los últimos splits completados y botón "Cambiar ejercicios de hoy".
- Visualización de bloques de mesociclo activos con indicador "Semana N de M" y botón para iniciar el siguiente bloque.

### 4. Editor de Rutinas (`EditRoutine.jsx`)
**Ruta:** `/routines/:id/edit`
- Edición de nombre, descripción y días de entrenamiento.
- **Selector de Día de la Semana (`WeekdayPicker.jsx`):** 7 chips (Lunes a Domingo). Asigna `RoutineDay.weekday` (0=Dom..6=Sáb) de forma explícita. Evita duplicados transfiriendo el día si ya estaba ocupado.
- Reordenamiento de ejercicios y días.
- Configuración de series objetivo, rango de repeticiones (`targetReps`, ej. `"8-12"`), tiempo de descanso en segundos y switch unilateral.
- Gestión de Bloques de Mesociclo (`RoutineBlock`): creación, edición de fase (`accumulation`, `intensification`, `deload`, `custom`) y duración en semanas.
- Preservación de historial: renombrar ejercicios actualiza el historial sin romper PRs históricos ni perder logs.

### 5. Importar / Crear Rutinas (`Import.jsx`)
**Ruta:** `/import`
Hub unificado con 4 pestañas:
1. **Plantillas:** Selección de rutinas estándar comprobadas (PPL, Arnold Split, Upper/Lower, Full Body) con días de la semana y días de descanso preasignados.
2. **Manual:** Diseñador paso a paso desde cero con `WeekdayPicker`.
3. **JSON:** Importación directa de texto estructurado con deduplicación asistida por LLM (`exerciseAgent.js`) si hay API key, o por `canonicalExerciseKey` determinista.
4. **IA:** Acceso directo al asistente de rutina diaria (`/ai-routine/setup`).

### 6. Cuestionario de Rutina con IA (`AiRoutineSetup.jsx`)
**Ruta:** `/ai-routine/setup`
Flujo de 4 pasos para usuarios sin rutina fija:
1. Objetivo principal: Hipertrofia (8-12 reps), Fuerza (4-6 reps), Salud general (10-15 reps).
2. Días disponibles por semana (2 a 6 días).
3. Equipamiento accesible (Barra, Mancuernas, Máquinas, Poleas, Peso corporal).
4. Nivel de experiencia (Principiante, Intermedio, Avanzado).
Guarda en `TrainingProfile` y genera la rutina activa `source: 'ai'`, navegando directamente al entrenamiento de hoy.

### 7. Composición Corporal (`BodyTracking.jsx`)
**Ruta:** `/body`
- **Métricas completas:** Peso corporal + 8 valores de báscula de bioimpedancia: Grasa %, Masa Muscular kg, Agua %, Grasa Visceral, Masa Ósea kg, Proteína %, BMR (kcal) e IMC (BMI).
- **Compresión de imágenes en el cliente:** Las fotos se comprimen en un `<canvas>` HTML5 (máximo 1200px, 85% calidad JPEG) antes de enviarse en Base64.
- **Almacenamiento de Fotos:** Sube a Cloudinary con transformaciones automáticas (miniatura y visualización optimizada); si falta Cloudinary, utiliza Catbox.moe con 3 reintentos.
- **Comparador Visual de Progreso:** Modal con `<Portal>` para fotos lado a lado o con deslizador, y visor fullscreen con zoom.
- **Gráficos de Tendencia:** Evolución temporal de Peso, Grasa y Músculo con Recharts.
- **Deltas inteligentes:** Comparativa automática contra la medición de hace ~30 días (coloreando verde la pérdida de grasa y la ganancia de músculo).

### 8. Progreso & Analítica (`Progress.jsx`)
**Ruta:** `/progress`
Consume el endpoint agrupado `GET /api/stats/progress-page`:
- **Pestaña General:** KPIs históricos, Heatmap anual interactivo, gráfico de cumplimiento semanal y gráfico de volumen por semana. Descarga de PDF de días individuales (`downloadDayPdf`).
- **Pestaña Objetivos (Goals):** Renderiza `GoalSection` y `GoalCard` con planes de periodización matemática (fórmula Epley), semanas completadas y barra de avance hacia el 1RM objetivo.
- **Pestaña Músculos:** Distribución de volumen de series por grupo muscular en gráfico de pastel y barras, y desglose de ejercicios por grupo.
- **Pestaña PRs:** Récords personales con medallas de podio (🥇, 🥈, 🥉), insignias de estancamiento (Plateau) calculadas en el servidor, clasificación de fuerza según peso corporal (Principiante, Intermedio, Avanzado, Élite) y gráfico evolutivo de 1RM por ejercicio.

### 9. Exportación de Reportes PDF (`ExportReport.jsx`)
**Ruta:** `/export`
Generador de informes profesionales en PDF usando `jsPDF` y `html2canvas`:
- Rango seleccionable: Un día (1), Semanal (7), Mensual (30), Trimestral (90), Semestral (180), Anual (365).
- Contenido: Resumen ejecutivo, tabla de PRs alcanzados, desglose diario de volumen, gráficos de composición corporal y galería de fotos de progreso incrustadas en base64.
- Sanitización de emojis y compatibilidad con caracteres UTF-8.

### 10. Perfil de Usuario (`Profile.jsx`)
**Ruta:** `/profile`
- Foto de perfil / Avatar con compresión a 400px, vista previa y subida a Cloudinary.
- Métricas vitalicias (`_count` de rutinas, entrenamientos, PRs y mediciones corporales).
- Información de contacto (teléfono y fecha de nacimiento formateada en día civil CDMX).
- Accesos directos a Composición Corporal, Configuración y Cierre de Sesión (con revocación push).

### 11. Configuración & Seguridad (`Settings.jsx`)
**Ruta:** `/settings`
Dividido en 4 pestañas:
1. **Cuenta:**
   - Edición de nombre y apellidos (obligatorios), teléfono y fecha de nacimiento.
   - Web Push: Toggle para recordatorios de descanso.
   - **Recordatorios de Creatina:** Toggle para activar recordatorios diarios, selector de hora base (ej. 16:00 CDMX) y botón "Enviar prueba" para verificar la notificación push en el dispositivo.
   - **Backup JSON:** Botón para forzar backup a Cloudinary (`POST /api/backup/run`) o descargar archivo local, y botón para importar backup JSON (`POST /api/backup/import`).
2. **Seguridad:**
   - Cambio de contraseña (exige contraseña actual; rota `tokenVersion` y devuelve nuevo token).
   - Cambio de pregunta y respuesta de seguridad (exige contraseña actual; rota `tokenVersion`).
3. **Músculos:**
   - Listado completo de ejercicios del catálogo.
   - Reclasificación de grupo muscular con propagación automática a todos los ejercicios con el mismo nombre.
4. **Historial:**
   - Búsqueda difusa (Fuzzy search con algoritmo Levenshtein).
   - Filtros por rango de fechas, día de la semana y grupo muscular.
   - Acciones por sesión: Descargar PDF de sesión (`downloadSessionPdf`), Editar sesión (`/session/:logId/edit`), o Eliminar sesión (con recálculo automático de PRs).
   - Acceso a la papelera del sistema para consultar ejercicios archivados.

### 12. Edición de Sesión Pasada (`EditSession.jsx`)
**Ruta:** `/session/:logId/edit`
Permite corregir cualquier entrenamiento histórico: peso, repeticiones y RIR de cada serie, o agregar/eliminar series. Al guardar vía `PUT /api/workouts/:logId`, el backend recalcula los récords personales (PRs) del ejercicio.

### 13. Nuevo Objetivo de Fuerza (`NewGoal.jsx`)
**Ruta:** `/goals/new`
Creación de metas de fuerza (peso × repeticiones). Agrupa ejercicios por clave canónica, autocompleta el 1RM actual desde el historial real y persiste el snapshot para alimentar el generador de periodización.

### 14. Autenticación (`Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`)
**Rutas:** `/login`, `/register`, `/forgot-password`
- **Login:** Email/username + contraseña. Retorna JWT de 365 días persistido en `localStorage`. Rate limiting por IP.
- **Register:** Nombre, email, username, contraseña (mínimo 8 caracteres validada en servidor) y pregunta de seguridad obligatoria.
- **ForgotPassword:** Recuperación sin necesidad de servidor SMTP externo. Solicita username, consulta la pregunta de seguridad registrada y valida la respuesta con hash bcrypt. Rate limiting doble: por IP y por cuenta objetivo (máximo 5 intentos cada 30 min).

---

## 🧠 Lógica de Negocio y Algoritmos Matemáticos

### 1. Fórmula de 1RM (Epley con Guardas)
Ubicación: `client/src/utils/exerciseName.js` y `client/src/utils/strength.js`
$$ 1RM = Peso \times \left(1 + \frac{Reps}{30}\right) $$
- Para $Reps = 1$, $1RM = Peso$.
- Las repeticiones se acotan a un máximo de 36 ($Reps \le 36$) para evitar extrapolaciones hiperbólicas irreales en series de resistencia.
- En ejercicios unilaterales, se calcula sobre el lado que levantó menor peso o menos repeticiones (lado débil limitante).

### 2. Periodización de Objetivos (`goalPlanner.js`)
- **Regresión Lineal:** Analiza la pendiente de progreso ($\text{kg/semana}$) y coeficiente $R^2$ sobre los últimos entrenamientos.
- **Rampa de Hipertrofia (>5 reps):** 50% Acumulación (volumen alto, +2 reps sobre la meta, descanso 60-90s), 30% Intensificación (volumen moderado, intensidad media), 20% Realización (peso meta).
- **Rampa de Fuerza ($\le 5$ reps):** 35% Acumulación (base a 8 reps ~72% 1RM), 35% Intensificación (5 reps con rampa progresiva de 72% a 85%), 30% Peaking (máxima especificidad, 1-3 reps, descanso 3-5 min).
- Redondeo a incrementos de 5kg (discos estándar de gimnasio) y restricción monotónica (el peso prescrito nunca decrece entre semanas del plan).

### 3. Smart Loading Inter-sesión (`computeWorkoutSuggestion`)
Ubicación: `client/src/utils/smartLoading.js` y `server/src/logic.js` (paridad 100%)
- **Paso 1: Selección de serie de trabajo (`pickWorkReference`):** Ignora singles/doubles de ego-lifting ($reps < 3$ si el rango tiene $lo > 3$) y drop sets ($peso < 75\%$ del peso máximo). Si hubo un Top Set pesado ($RIR \le 1$) al peso máximo, se ancla a ese peso.
- **Paso 2: Evaluación de Doble Progresión:**
  - Si el Top Set llegó al tope ($reps \ge hi$) con $RIR \le 1$, o si TODAS las series al peso de trabajo tocaron $hi$: **Sube peso** (+5kg en piernas, +2.5kg en torso) y reinicia reps en el suelo del rango ($lo$).
  - Si la mejor serie tocó $hi$ pero otras quedaron cortas: **Mantiene peso** y aumenta la meta de reps en las series rezagadas ($minReps + 1$).
  - Si no se llegó a $hi$: **Mantiene peso** y suma +1 rep (o +2 si sobró mucho margen con $RIR \ge 3$).
- **Paso 3: Fases de Mesociclo:** En intensificación reduce el rango a la mitad; en acumulación sube el techo 50%; en descarga aplica un multiplicador de ~0.9 tras calcular la progresión normal.

### 4. Smart Loading Intra-sesión (`suggestNextSetFromToday`)
Ubicación: `client/src/utils/smartLoading.js` y `server/src/logic.js`
- Se ejecuta a partir de la Serie 2 calculando en tiempo real con lo ocurrido hoy. Exige RIR numérico en cada serie previa.
- **Serie 1 al Fallo (RIR 0):** Sugiere automáticamente un Back-off Set con -12.5% de peso y busca +2 reps.
- **Fallo o Reps bajo el rango en series siguientes:** **Baja 1 incremento de peso** (5kg piernas / 2.5kg resto).
- **Fatiga acumulada (RIR 1 o caída de RIR $\ge 2$):** Mantiene peso y asegura repeticiones viables.
- **Comodidad (RIR promedio $\ge 2.5$):** Mantiene peso e incrementa +1 o +2 reps.

### 5. Detección de Estancamiento (Plateau)
Ubicación: `server/src/logic.js` (`detectPlateauForExercise`) y `client/src/utils/exerciseName.js`
- Evalúa las últimas 4 a 6 sesiones del ejercicio.
- Divide la ventana en dos mitades (antigua y reciente).
- Si el 1RM máximo de la mitad reciente **no supera** al de la mitad antigua (un empate cuenta como estancamiento), marca `isPlateaued: true`.

### 6. Descarga Adaptativa Automática
Evaluada diariamente en background (`maybeEvaluateAdaptiveDeload`):
- Condición 1: El volumen total de la semana actual es inferior al 85% del volumen de la semana anterior ($< 0.85$).
- Condición 2: Al menos 3 ejercicios distintos de la rutina están en estancamiento (plateau) simultáneo.
- Acción: Activa `Routine.adaptiveDeloadUntil` por 7 días con banner visible en la interfaz y cooldown de 7 días entre evaluaciones (`lastAdaptiveCheckAt`).

---

## ⏰ Manejo Estricto de Horarios y Fechas (América/Ciudad de México)

> [!IMPORTANT]
> El servidor Docker corre en UTC, pero NexLift opera bajo el calendario civil de **`America/Mexico_City`**.
> Agrupar por `new Date().toISOString()` o `toLocaleDateString()` del navegador falla catastróficamente en la ventana nocturna de gimnasio (18:00 a 00:00 CDMX = día siguiente en UTC).

### Helpers Canónicos (`server/src/logic.js` y `client/src/utils/dates.js`)
- `mexicoCityDateStr(date)`: Retorna la fecha exacta `YYYY-MM-DD` en horario CDMX.
- `mexicoCityDayBounds(date)`: Retorna `{ start, end }` como objetos `Date` en UTC correspondientes a las `00:00:00.000` y `23:59:59.999` de ese día en CDMX.
- `mexicoCityHour(date)`: Retorna la hora civil (0 a 23) en CDMX.
- `dayOfWeekFromDateStr(dateStr)`: Ancla a mediodía UTC (`T12:00:00Z`) para obtener el día de la semana sin desfases por huso horario.
- `scheduledRestWeekdays(days)`: Identifica los días de descanso formalmente programados para la racha y el heatmap.

---

## 🔔 Sistema de Notificaciones Web Push (VAPID)

El sistema soporta dos tipos de notificaciones autónomas:

### 1. Recordatorios de Fin de Descanso
- Disparados serie a serie mediante `POST /api/workouts/rest-reminder`.
- **Deduplicación:** Cancela temporizadores anteriores para el mismo usuario y ejercicio.
- **Persistencia en Base de Datos (`PendingReminder`):** Almacena la alarma en PostgreSQL. Si el contenedor Docker se reinicia o se despliega una nueva versión a mitad de un descanso, la función `restorePendingReminders()` recupera la alarma y la re-agenda al tiempo exacto restante (o la dispara si venció hace menos de 5 min).
- **Aviso contextual:** Si fue la última serie del ejercicio, el texto anuncia el nombre del ejercicio siguiente en la rutina.

### 2. Recordatorios Escalonados de Creatina (3 Etapas)
Evaluados cada 10 minutos por `checkCreatineReminders()` en `server/src/index.js` usando `evaluateCreatineReminderStage` de `logic.js`:
- **Etapa 1 (Hora programada por el usuario, default 16:00 CDMX):**
  *"⚡ Hora de tu creatina (5g). Márcala en NexLift."*
- **Etapa 2 (+3 horas después, si aún no se ha marcado):**
  *"⏳ Pasaron 3 horas y aún no registras tu creatina de hoy."*
- **Etapa 3 (Última llamada a las 23:00 CDMX):**
  *"🚨 Última llamada (11 PM): No te vayas a dormir sin tomar tus 5g de creatina."*
- Si el usuario marca la casilla de creatina en el Daily Check-in de `BodyLog`, las etapas restantes del día se anulan inmediatamente.

---

## 📊 Modelo de Datos (Prisma / PostgreSQL)

Fuente única de verdad: `server/prisma/schema.prisma`. Sincronización obligatoria con `npx prisma db push` (nunca `prisma migrate`, ver Gotcha #2).

| Modelo | Descripción y Propósito | Detalles No Obvios |
|--------|-------------------------|-------------------|
| `User` | Cuenta de usuario, credenciales y configuración | `tokenVersion` para revocar JWTs antiguos; `lastReengagementNotifiedAt` (push si lleva 3+ días sin ir); `lastBackupAt`/`lastBackupError` para monitor de salud; `creatineReminderEnabled`, `creatineReminderTime`, `lastCreatineReminderDate`, `lastCreatineReminderStage` |
| `Routine` | Rutina de entrenamiento | `source`: `'manual'` o `'ai'`; `adaptiveDeloadUntil` y `lastAdaptiveCheckAt` para descarga adaptativa |
| `RoutineBlock` | Bloque o mesociclo de periodización | `phase`: `'accumulation'`, `'intensification'`, `'deload'`, `'custom'`. El bloque activo es el que tiene el `startedAt` más reciente |
| `RoutineDay` | Día estructurado dentro de una rutina | `weekday` (`Int?`, 0=Dom..6=Sáb): Única fuente para resolver "qué toca hoy" en manuales. `splitLabel` (ej. "Push") en días IA donde `dayName` es fecha ISO |
| `Exercise` | Ejercicio asignado a un día de rutina | `targetReps` en string (`"8-12"`); `isUnilateral` booleano; `restSeconds` descanso; `onDelete: Cascade` hacia RoutineDay |
| `WorkoutLog` | Registro de una sesión de UN ejercicio en una fecha | Vinculado a `Exercise`. `onDelete: Restrict` en la lógica de negocio para no perder historial al editar rutinas |
| `SetLog` | Serie individual registrada en un entrenamiento | **`rpe` almacena `10 - RIR`** (inversión intencional); `weightRight` y `repsRight` para unilateral |
| `PersonalRecord` | Récord Personal histórico por ejercicio | `exerciseName` almacenado en minúsculas; recalculado automáticamente en cada edición o borrado de sesión |
| `RestLog` | Registro formal de día de descanso | Cuenta positivamente para la racha y consistencia en el heatmap |
| `BodyLog` | Peso, fotos y bioimpedancia corporal | `photoUrl` en Cloudinary; métricas de báscula; hábitos diarios: `creatineTaken`, `dietCompliant`, `zeroLiquidCalories` |
| `Goal` | Objetivo de fuerza a largo plazo | `targetWeight`, `targetReps`, `completedWeeks[]`; el backend calcula y sella `achievedAt` |
| `PushSubscription`| Suscripción Web Push del dispositivo | Endpoint único, clave pública `p256dh` y `auth`. Se revoca automáticamente en logout |
| `PendingReminder`| Alarma de descanso persistida en disco | Clave única `[userId, exerciseId]`. Reagendada al reiniciar el servidor por `restorePendingReminders()` |
| `SuggestionLog` | Calibración y telemetría de sugerencias | Registra peso y reps sugeridos con `source: 'client' \| 'shortcut' \| 'intra'` para análisis posterior |
| `TrainingProfile`| Perfil para generación de Rutina con IA | Relación 1:1 con `User`: `goal`, `daysPerWeek`, `equipment[]`, `experienceLevel` |
| `CardioSession` / `CardioSegment` | Modelos de cardio en base de datos | Estructuras en DB preparadas para sesiones y tramos de cardio (minutos e inclinación) |

---

## 🔌 Catálogo de Endpoints de la API (`server/src/index.js`)

Todos los endpoints (salvo registro, login, recuperación, VAPID key y health) requieren cabecera `Authorization: Bearer <token>`.

### Autenticación y Cuenta
- `POST /api/auth/register` — Registro de cuenta con validación de contraseña ($\ge 8$ caracteres) y pregunta de seguridad.
- `POST /api/auth/login` — Autenticación por username/email y password. Retorna JWT de 365 días.
- `GET /api/auth/me` — Datos del usuario autenticado con conteos (`_count`) de rutinas, logs y PRs.
- `PUT /api/auth/profile` — Actualización de nombre, teléfono y fecha de nacimiento (anclada a mediodía UTC).
- `PUT /api/auth/password` — Cambio de contraseña. Incrementa `tokenVersion` y retorna un nuevo JWT.
- `POST /api/auth/recover/question` — Obtiene la pregunta de seguridad configurada para un username.
- `POST /api/auth/recover/verify` — Valida la respuesta de seguridad y restablece la contraseña. Doble rate limit.
- `PUT /api/auth/security-question` — Actualiza la pregunta de seguridad exigiendo la contraseña actual.
- `POST /api/auth/avatar` — Sube foto de perfil a Cloudinary y actualiza `avatarUrl`.

### Rutinas y Mesociclos
- `GET /api/routines` — Lista las rutinas del usuario (excluye la papelera del sistema).
- `GET /api/routines/trash` — Consulta los ejercicios archivados en la papelera de reciclaje.
- `GET /api/routines/active` — Retorna la rutina activa actual con sus días, ejercicios y bloque activo.
- `POST /api/routines/import` — Crea o importa una rutina con deduplicación por IA (`exerciseAgent.js`).
- `GET /api/routines/:id` — Detalle completo de una rutina.
- `PUT /api/routines/:id` — Edita una rutina, sus días y ejercicios bajo una transacción Prisma segura.
- `DELETE /api/routines/:id` — Elimina la rutina archivando en la papelera los ejercicios que tengan historial.
- `PUT /api/routines/:id/activate` — Establece una rutina como la activa para el usuario.
- `GET /api/routines/:id/blocks` — Lista los mesociclos configurados para la rutina.
- `POST /api/routines/:id/blocks` — Agrega un bloque de mesociclo (`accumulation`, `intensification`, etc.).
- `PUT /api/routines/:id/blocks/:blockId` — Modifica nombre, fase o semanas de un bloque.
- `DELETE /api/routines/:id/blocks/:blockId` — Elimina un bloque de mesociclo.
- `POST /api/routines/:id/blocks/:blockId/start` — Inicia un bloque marcando `startedAt = now()`.

### Rutina Diaria con IA
- `POST /api/ai-routine/setup` — Guarda el `TrainingProfile`, crea la rutina IA y genera el día de hoy.
- `GET /api/ai-routine/today` — Obtiene o genera de forma idempotente el día de hoy para la rutina IA activa.
- `POST /api/ai-routine/reshuffle/:routineDayId` — Regenera los ejercicios no iniciados de hoy sin tocar los ya registrados.

### Ejercicios y Catálogo
- `GET /api/exercises` — Catálogo consolidado de ejercicios del usuario (incluyendo archivados).
- `PUT /api/exercises/:id/muscle` — Clasifica el grupo muscular y lo propaga a homónimos.

### Entrenamientos y Registro
- `GET /api/workouts/today-log?exerciseId=X` — Revisa si ya existe un log hoy en CDMX para evitar duplicados en offline replay.
- `POST /api/workouts/log` — Registra una sesión completa de un ejercicio (crea un nuevo `WorkoutLog` con sus `SetLog`).
- `GET /api/workouts/:logId` — Obtiene el detalle de un registro de entrenamiento.
- `PUT /api/workouts/:logId` — Reemplaza todas las series de un log (usado por EditSession y por sesiones parciales). Recalcula PRs.
- `DELETE /api/workouts/:logId` — Elimina un log de entrenamiento y recalcula PRs.
- `GET /api/workouts/history` — Historial de entrenamientos con paginación y filtros (búsqueda, fechas CDMX, día).
- `GET /api/workouts/exercise/:exerciseId/history` — Historial específico de un ejercicio para Smart Loading.
- `POST /api/workouts/rest-reminder` — Agenda alarma de descanso Web Push para una serie completada.
- `POST /api/workouts/log-rest` — Registra un día de descanso en `RestLog`.
- `PUT /api/workouts/fix-weights` — Corrección masiva de pesos por renombre o error.

### Atajos de iOS (Apple Shortcuts)
- `GET /api/shortcuts/next-set` — Resuelve la rutina activa, el día de hoy y sugiere peso/reps del próximo ejercicio en JSON plano.
- `POST /api/shortcuts/log-set` — Registra UNA serie acumulándola en el log de hoy. Convierte RIR crudo a `10 - RIR`.

### Estadísticas y Analítica
- `GET /api/stats/home` — Endpoint consolidado del Dashboard (KPIs, consistencia, rutina activa, PRs, plateaus, check-in).
- `GET /api/stats/progress-page` — Endpoint consolidado de la página de Progreso.
- `GET /api/stats/overview` — Métricas generales rápidas en paralelo (`Promise.all`).
- `GET /api/stats/consistency` — Heatmap de consistencia en días CDMX.
- `GET /api/stats/plateaus` — Detección de ejercicios estancados en el servidor (ventana de 10 sesiones).
- `GET /api/stats/prs` — Lista de récords personales con medallas de podio.
- `GET /api/stats/progress/:exerciseName` — Historial de evolución de 1RM para gráficos de línea.
- `GET /api/stats/routine/:id` — Métricas de rendimiento de una rutina específica.

### Composición Corporal y Hábitos
- `GET /api/body/logs` — Listado histórico de mediciones corporales.
- `POST /api/body/log` — Registra peso, bioimpedancia y foto (Cloudinary/Catbox).
- `GET /api/body/photos` — Galería cronológica de fotos de progreso.
- `GET /api/body/latest` — Último peso registrado para cálculo de estándares de fuerza.
- `GET /api/body/checkin` — Consulta el estado de los hábitos diarios (creatina, déficit, cero calorías líquidas) de hoy.
- `PUT /api/body/checkin` — Actualiza los hábitos diarios en el `BodyLog` de hoy (creándolo si no existe).

### Objetivos (Goals)
- `GET /api/goals` — Lista los objetivos activos evaluando y sellando `achievedAt` si se cumplieron.
- `POST /api/goals` — Crea un nuevo objetivo (retorna 409 si ya existe un objetivo idéntico no cumplido).
- `PUT /api/goals/:id/weeks` — Marca semanas completadas en el checklist del plan.
- `DELETE /api/goals/:id` — Elimina un objetivo de fuerza.

### Web Push y Recordatorios
- `GET /api/push/vapid-public-key` — Retorna la clave pública VAPID.
- `POST /api/push/subscribe` — Registra la suscripción Web Push del navegador.
- `DELETE /api/push/subscribe` — Elimina la suscripción del dispositivo.
- `PUT /api/push/creatine-reminder` — Configura hora y estado del recordatorio diario de creatina.
- `POST /api/push/test-creatine` — Envía una notificación push de prueba inmediata al dispositivo.

### Backups y Sistema
- `POST /api/backup/run` — Fuerza la ejecución inmediata del backup en Cloudinary para el usuario del token.
- `POST /api/backup/import` — Importa y restaura una estructura de backup JSON completa en la cuenta autenticada.
- `GET /api/health` — Healthcheck del servidor, estado de la base de datos y último backup registrado.
- `GET *` — SPA Fallback: sirve `client/dist/index.html` en producción.

---

## ⚠️ Gotchas Críticos y Reglas de Oro

### 1. Manejo de Fechas en CDMX
PostgreSQL almacena fechas en UTC. La lógica de negocio corre en CDMX (`America/Mexico_City`).
- **NUNCA** uses `new Date().toISOString().split('T')[0]` ni `date.getDay()` para agrupar por día o decidir qué día toca hoy.
- **SIEMPRE** usa `mexicoCityDateStr(date)` y `mexicoCityDayBounds(date)` de `server/src/logic.js` en backend y `client/src/utils/dates.js` en frontend.

### 2. Base de Datos: Solo `prisma db push`
- **NUNCA** ejecutes `npx prisma migrate dev` ni `migrate deploy`. No existe historial de migraciones (`prisma/migrations`). Ejecutar `migrate` provocará "drift detected" y Prisma ofrecerá **borrar toda la base de datos**.
- Aplica cambios de esquema con `npx prisma db push`. En Windows, si el servidor está corriendo con `node --watch`, ejecuta `npx prisma generate` con el servidor apagado para evitar el bloqueo del archivo `.dll` del query engine.

### 3. Modales y Overlays: Siempre dentro de `<Portal>`
Cualquier modal, menú emergente o visor de fotos con `fixed inset-0` **DEBE** envolverse en `<Portal>` (`client/src/components/ui/Portal.jsx`).
- *Causa raíz:* Las animaciones de entrada (`animate-fade-in`, `slide-up`, etc.) en `index.css` utilizan `transform` con `animation-fill-mode: forwards`. Un ancestro con propiedad `transform` distinta de `none` se convierte en el *containing block* del elemento fixed, sacándolo de la pantalla cuando la página tiene scroll. `<Portal>` monta el modal directamente en `document.body`.

### 4. Convención de RIR Invertido (`SetLog.rpe`)
- `SetLog.rpe` en la base de datos guarda **`10 - RIR`**, NO el RIR crudo.
- Al guardar: `rpe = 10 - rir`.
- Al leer: `rir = 10 - rpe`.
- El endpoint de Atajos de iOS (`/api/shortcuts/log-set`) recibe el RIR crudo (0 a 4) y lo convierte mediante `convertShortcutRir(rawRir)` antes de guardar en Prisma. Si olvidas esta conversión, el RIR queda invertido y no se selecciona ningún botón en la UI.

### 5. Paridad Estricta Cliente / Servidor
El proyecto no comparte un paquete `shared/` para mantener el backend autocontenido.
- Las funciones matemáticas (`computeWorkoutSuggestion`, `suggestNextSetFromToday`, `adjustRepRangeForPhase`, `findRoutineDayForWeekday`, `scheduledRestWeekdays`) existen de forma deliberada en `client/src/utils/` y `server/src/logic.js`.
- La paridad está blindada mediante tests automáticos cruzados (`smartLoading.parity.test.js` y `routineDays.parity.test.js`). Si modificas una lógica en el cliente o servidor, **debes actualizar ambas copias y correr los tests**.

### 6. Resolución de "Qué Toca Hoy" en Rutinas Manuales
- `RoutineDay.weekday` (`Int?`, 0=Domingo..6=Sábado) es la **única** fuente de verdad para asignar días en rutinas manuales.
- `dayName` es 100% decorativo ("Día 1", "Torso Pesado", "Push A").
- En JavaScript, el número `0` (Domingo) es falsey. Compara **siempre** con `weekday != null`, nunca con `if (day.weekday)`.
- Todo `select` de Prisma que consulte `RoutineDay` debe incluir `weekday` de forma explícita.

### 7. Deduplicación y Persistencia de Recordatorios Push
- Para evitar que completar varias series de golpe envíe ráfagas de notificaciones, el servidor mantiene un mapa en memoria y una tabla `PendingReminder` con clave única `@@unique([userId, exerciseId])`.
- Agendar un recordatorio nuevo sobrescribe automáticamente el recordatorio pendiente anterior.
- Al cargar datos preexistentes en `Workout.jsx`, sincroniza siempre `prevSetsSnapshotRef.current` para evitar que el efecto detecte las series viejas como recién completadas y dispare avisos fantasma.

### 8. Registro Offline y Reconciliación Anti-Duplicados
- Si la conexión falla en el gimnasio, `safeFetch` detecta el error de red (`err.isNetworkError = true`) y encola la operación en `localStorage` (`nexlift_offline_queue`).
- Para evitar llamadas recursivas infinitas (`RangeError: Maximum call stack size exceeded`), `getQueue()` **nunca** debe notificar a los suscriptores al podar registros viejos; solo las mutaciones explícitas (`enqueueWrite`, `removeFromQueue`) notifican a la UI.
- Al reconectarse, la cola consulta `GET /api/workouts/today-log?exerciseId=X` usando los bounds CDMX del servidor. Si el log ya se había creado en el backend (porque el POST original llegó pero se perdió la respuesta), la cola convierte la operación a `PUT /api/workouts/:logId` para no duplicar la sesión del día.

### 9. Preservación del Historial de Ejercicios (Papelera del Sistema)
- `WorkoutLog` está vinculado a `Exercise` con `onDelete: Restrict` en la lógica de negocio.
- Cuando un usuario edita una rutina y elimina un ejercicio que ya tiene sesiones registradas, el backend **nunca** lo borra físicamente: lo transfiere automáticamente a la rutina oculta "Bin" (`getRecycleBinDay`).
- Si en el futuro el usuario vuelve a agregar un ejercicio con el mismo nombre, el sistema rescata el ejercicio archivado restaurando su vinculación histórica.

---

## 🚀 Comandos de Desarrollo y Verificación

```bash
# ================= BACKEND =================
cd server

# Iniciar servidor en desarrollo con hot reload
npm run dev

# Ejecutar suite de pruebas unitarias (104 tests)
npm test

# Sincronizar cambios del schema Prisma con la base de datos
npm run db:push

# Inspeccionar base de datos con GUI web
npm run db:studio

# Forzar backup manual a Cloudinary
node -e "import('./src/services/backupService.js').then(b => console.log('Backup service loaded'))"
curl -X POST http://localhost:3001/api/backup/run -H "Authorization: Bearer <TOKEN>"

# Restaurar backup de Cloudinary (dry-run primero, luego aplicar)
node restore-backup.mjs
node restore-backup.mjs --apply

# Analizar telemetría de calibración de sugerencias
node analyze-suggestions.mjs

# ================= FRONTEND =================
cd client

# Iniciar servidor de desarrollo Vite
npm run dev

# Ejecutar suite de pruebas unitarias (76 tests)
npm test

# Compilar para producción (validación de tipos y chunks)
npm run build

# Preview del build de producción
npm run preview
```