# NexLift — Referencia Completa de la API REST

> Especificación exhaustiva de endpoints, parámetros, cargas útiles (payloads), códigos de estado y reglas de validación.
> **Versión:** 3.0.0 | **Base URL:** `http://localhost:3001` (Dev) / `/api` (Prod)

> Referencia histórica v3: sus ejemplos no sustituyen al código actual. Fase 4.1
> no cambia contratos HTTP. El protocolo v1 actual está documentado en
> [3.1](../server/audit/operations/PHASE-3.1.md),
> [3.2](../server/audit/sync/PHASE-3.2.md) y
> [3.4](../server/audit/conflicts/PHASE-3.4.md). Los formatos de backup v4 están
> en [1.3](../server/test/PHASE-1.3.md). Health público no enumera cuentas/backups;
> readiness y `/api/backup/status` autenticado conservan los controles de 2.3.
> Shared todavía no define ni reemplaza esos contratos.

---

## 🔒 Convenciones Globales y Autenticación

- **Formato:** Todas las solicitudes y respuestas utilizan `Content-Type: application/json` salvo indicación contraria.
- **Cabecera de Autenticación:** Peticiones protegidas requieren:
  `Authorization: Bearer <JWT_TOKEN>`
- **Revocación de Sesión:** El token JWT incluye el campo `tokenVersion`. Si el usuario cambia su contraseña o pregunta de seguridad, `User.tokenVersion` se incrementa en la base de datos, invalidando automáticamente todos los tokens previos con código `401 Unauthorized`.
- **Zonas Horarias:** Todas las consultas y agrupaciones temporales se resuelven en la zona horaria **`America/Mexico_City`**.

---

## 1. Autenticación y Perfil (`/api/auth`)

### `POST /api/auth/register`
Crea una nueva cuenta de usuario.
- **Público:** Sí (Rate Limited por IP).
- **Body:**
  ```json
  {
    "username": "atleta1",
    "email": "atleta1@ejemplo.com",
    "password": "Password123!",
    "firstName": "Juan",
    "lastName": "Pérez",
    "securityQuestion": "¿Nombre de tu primera mascota?",
    "securityAnswer": "Firulais"
  }
  ```
- **Validaciones:** Contraseña mínima de 8 caracteres; email y username únicos; pregunta y respuesta obligatorias.
- **Respuesta (201 Created):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "cuid123",
      "username": "atleta1",
      "email": "atleta1@ejemplo.com",
      "firstName": "Juan",
      "lastName": "Pérez"
    }
  }
  ```

### `POST /api/auth/login`
Inicia sesión y genera un JWT con duración de 365 días.
- **Público:** Sí (Rate Limited por IP).
- **Body:** `{ "username": "atleta1", "password": "Password123!" }`
- **Respuesta (200 OK):** Mismo formato que registro con JWT.

### `GET /api/auth/me`
Obtiene el perfil del usuario autenticado con métricas consolidadas.
- **Auth:** Requerida.
- **Respuesta (200 OK):**
  ```json
  {
    "id": "cuid123",
    "username": "atleta1",
    "email": "atleta1@ejemplo.com",
    "firstName": "Juan",
    "lastName": "Pérez",
    "phone": "+525512345678",
    "birthDate": "1995-05-15T12:00:00.000Z",
    "avatarUrl": "https://res.cloudinary.com/...",
    "securityQuestion": "¿Nombre de tu primera mascota?",
    "creatineReminderEnabled": true,
    "creatineReminderTime": "16:00",
    "createdAt": "2026-01-10T10:00:00.000Z",
    "_count": {
      "routines": 3,
      "bodyLogs": 24,
      "personalRecords": 15
    }
  }
  ```

### `PUT /api/auth/profile`
Actualiza datos personales (nombre, teléfono y fecha de nacimiento).
- **Auth:** Requerida.
- **Body:**
  ```json
  {
    "firstName": "Juan Carlos",
    "lastName": "Pérez",
    "phone": "+525598765432",
    "birthDate": "1995-05-15"
  }
  ```
- **Respuesta (200 OK):** Objeto de usuario actualizado.

### `PUT /api/auth/password`
Cambia la contraseña. Incrementa `tokenVersion` y devuelve un token nuevo para no cerrar la sesión del cliente actual.
- **Auth:** Requerida (Rate Limited max 8 intentos).
- **Body:** `{ "currentPassword": "Password123!", "newPassword": "NewPassword456!" }`
- **Respuesta (200 OK):** `{ "message": "Contraseña actualizada exitosamente", "token": "<NEW_JWT>" }`

### `POST /api/auth/recover/question`
Consulta la pregunta de seguridad configurada para un usuario.
- **Público:** Sí (Rate Limited por IP).
- **Body:** `{ "username": "atleta1" }`
- **Respuesta (200 OK):** `{ "question": "¿Nombre de tu primera mascota?" }`

### `POST /api/auth/recover/verify`
Valida la respuesta de seguridad y restablece la contraseña.
- **Público:** Sí (Doble Rate Limit: por IP y máximo 5 intentos por cuenta cada 30 min).
- **Body:**
  ```json
  {
    "username": "atleta1",
    "answer": "firulais",
    "newPassword": "NewPassword789!"
  }
  ```
- **Respuesta (200 OK):** `{ "message": "Contraseña restablecida exitosamente" }`

### `PUT /api/auth/security-question`
Actualiza la pregunta y respuesta de seguridad (exige confirmar contraseña actual).
- **Auth:** Requerida.
- **Body:**
  ```json
  {
    "question": "¿Ciudad donde naciste?",
    "answer": "Guadalajara",
    "currentPassword": "NewPassword456!"
  }
  ```
- **Respuesta (200 OK):** `{ "message": "Pregunta de seguridad actualizada", "token": "<NEW_JWT>" }`

### `POST /api/auth/avatar`
Sube una foto de perfil en Base64 a Cloudinary/Catbox.
- **Auth:** Requerida.
- **Body:** `{ "avatar": "data:image/jpeg;base64,..." }`
- **Respuesta (200 OK):** `{ "avatarUrl": "https://res.cloudinary.com/..." }`

---

## 2. Rutinas y Mesociclos (`/api/routines`)

### `GET /api/routines`
Lista todas las rutinas activas del usuario (excluye la papelera del sistema).
- **Auth:** Requerida.
- **Respuesta (200 OK):** Array de objetos `Routine` con sus `days` y `blocks`. Para rutinas `source: 'ai'`, limita los días a los 7 más recientes.

### `GET /api/routines/active`
Retorna la rutina activa del usuario con su bloque de mesociclo vigente (`activeBlock`).
- **Respuesta (200 OK):** Objeto `Routine` o `null` con status 404 si no hay rutina activa.

### `GET /api/routines/trash`
Obtiene los ejercicios archivados en la papelera del sistema que aún conservan historial.
- **Respuesta (200 OK):** Rutina especial "Papelera" con los ejercicios archivados.

### `POST /api/routines/import`
Importa o crea una rutina desde JSON con deduplicación asistida por LLM.
- **Auth:** Requerida.
- **Body:**
  ```json
  {
    "name": "Torso / Pierna",
    "description": "Frecuencia 2",
    "days": [
      {
        "dayName": "Torso A",
        "weekday": 1,
        "isRestDay": false,
        "order": 0,
        "exercises": [
          { "name": "Press Banca", "targetSets": 4, "targetReps": "6-8", "restSeconds": 120, "isUnilateral": false }
        ]
      },
      {
        "dayName": "Descanso",
        "weekday": 3,
        "isRestDay": true,
        "order": 1,
        "exercises": []
      }
    ]
  }
  ```
- **Regla:** `weekday` acepta 0 (Domingo) a 6 (Sábado).

### `GET /api/routines/:id`
Detalle completo de una rutina por su identificador.

### `PUT /api/routines/:id`
Actualiza íntegramente una rutina bajo una transacción segura de Prisma. Si se eliminan ejercicios con historial previo, son transferidos automáticamente a la papelera del sistema.

### `DELETE /api/routines/:id`
Elimina la rutina. Si sus ejercicios poseen registros de entrenamiento (`WorkoutLog`), los ejercicios se preservan en la papelera para no romper el historial.

### `PUT /api/routines/:id/activate`
Marca la rutina como activa para el usuario y desactiva las demás.

### `GET/POST /api/routines/:id/blocks`
- **GET:** Lista los bloques de mesociclo de la rutina ordenados por `order`.
- **POST:** Crea un bloque `{ name: "Fase 1", phase: "accumulation", durationWeeks: 4 }`.

### `PUT/DELETE /api/routines/:id/blocks/:blockId`
Actualiza o elimina un bloque de mesociclo.

### `POST /api/routines/:id/blocks/:blockId/start`
Inicia un bloque de mesociclo estableciendo `startedAt = now()`.

---

## 3. Rutina Diaria con IA (`/api/ai-routine`)

### `POST /api/ai-routine/setup`
Configura el perfil de entrenamiento y genera la primera rutina IA.
- **Body:**
  ```json
  {
    "goal": "hypertrophy",
    "daysPerWeek": 4,
    "equipment": ["barbell", "dumbbell", "machine", "cable"],
    "experienceLevel": "intermediate"
  }
  ```
- **Respuesta (200 OK):** `{ "success": true, "routine": { ... }, "day": { ... } }`

### `GET /api/ai-routine/today`
Obtiene o genera de forma idempotente el día correspondiente a hoy para la rutina IA activa.
- **Respuesta (200 OK):**
  - Si toca entrenar: Objeto `RoutineDay` generado con ejercicios y metas.
  - Si toca descanso: `{ "isRestDay": true, "message": "Día de descanso programado" }`

### `POST /api/ai-routine/reshuffle/:routineDayId`
Regenera los ejercicios de hoy respetando los que ya tengan series registradas hoy.
- **Respuesta (200 OK):** `RoutineDay` actualizado con ejercicios frescos sin duplicar grupos musculares.

---

## 4. Ejercicios y Catálogo (`/api/exercises`)

### `GET /api/exercises`
Retorna el catálogo consolidado de ejercicios creados por el usuario (activos y archivados).

### `PUT /api/exercises/:id/muscle`
Reclasifica el grupo muscular de un ejercicio y lo propaga a todos los ejercicios homónimos en la cuenta.
- **Body:** `{ "muscleGroup": "Piernas" }`

---

## 5. Entrenamientos y Registro (`/api/workouts`)

### `GET /api/workouts/today-log?exerciseId=X`
Verifica si ya existe un `WorkoutLog` registrado hoy (en horario CDMX) para el ejercicio especificado. Utilizado para anti-duplicados en offline replay.
- **Respuesta (200 OK):** `{ "exists": true, "log": { "id": "log123", ... } }` o `{ "exists": false }`.

### `POST /api/workouts/log`
Registra una sesión completa para un ejercicio. Crea un nuevo `WorkoutLog` y recalcula los PRs correspondientes.
- **Body:**
  ```json
  {
    "exerciseId": "ex123",
    "sets": [
      { "weight": 80, "reps": 10, "rpe": 8, "completed": true },
      { "weight": 80, "reps": 9, "rpe": 9, "completed": true }
    ],
    "notes": "Buen bombeo"
  }
  ```
- **Nota:** En el body, `rpe` representa el valor invertido `10 - RIR` o RIR crudo según valide `sanitizeSets()`.

### `GET /api/workouts/:logId`
Consulta el detalle y las series de una sesión pasada.

### `PUT /api/workouts/:logId`
Reemplaza todas las series del log indicado. Recalcula automáticamente los PRs del ejercicio.
- **Body:** `{ "sets": [ ... ] }`

### `DELETE /api/workouts/:logId`
Elimina la sesión y recalcula los PRs del ejercicio desde el historial restante.

### `GET /api/workouts/history`
Lista el historial de sesiones con filtros avanzados.
- **Query Params:**
  - `limit`: Máximo de registros (default 30).
  - `offset`: Desplazamiento para paginación.
  - `search`: Búsqueda por nombre de ejercicio.
  - `dateFrom` / `dateTo`: Rango de fechas evaluado en límites de día CDMX.
  - `dayOfWeek`: Filtro numérico (0=Dom..6=Sáb).

### `GET /api/workouts/exercise/:exerciseId/history`
Historial de sesiones pasadas del ejercicio (insumo principal de Smart Loading). Retorna sesiones ordenadas descendente por fecha.

### `POST /api/workouts/rest-reminder`
Agenda un aviso Web Push para el descanso entre series.
- **Body:** `{ "exerciseId": "ex123", "nextExerciseName": "Remo con Barra" }`

### `POST /api/workouts/log-rest`
Registra un día de descanso explícito en `RestLog`.
- **Body:** `{ "note": "Descanso activo" }`

---

## 6. Atajos de iOS (Shortcuts API)

### `GET /api/shortcuts/next-set`
Resuelve el próximo ejercicio que toca entrenar hoy según la rutina activa y calcula la sugerencia de Smart Loading.
- **Auth:** Bearer Token en cabecera.
- **Query Params:** `date` (opcional, YYYY-MM-DD para pruebas).
- **Respuesta (200 OK):**
  ```json
  {
    "exerciseId": "ex123",
    "exerciseName": "Press de Banca con Barra",
    "targetSets": 3,
    "currentSet": 1,
    "suggestedWeight": 82.5,
    "suggestedReps": 8,
    "restSeconds": 90,
    "rationale": "Alcanzaste 12 reps con 80kg: sube carga y reinicia en 8.",
    "isRestDay": false
  }
  ```

### `POST /api/shortcuts/log-set`
Registra una serie individual desde el Atajo, acumulándola en el `WorkoutLog` de hoy.
- **Body:**
  ```json
  {
    "exerciseId": "ex123",
    "weight": 82.5,
    "reps": 8,
    "rpe": 2
  }
  ```
- **Nota:** El Atajo envía el RIR crudo en `rpe` (0 a 4). El endpoint ejecuta `convertShortcutRir()` guardando `10 - rpe` en la base de datos.

---

## 7. Estadísticas y Analítica (`/api/stats`)

### `GET /api/stats/home`
Endpoint único consolidado para la pantalla de Dashboard.
- **Respuesta (200 OK):**
  ```json
  {
    "stats": {
      "streak": 5,
      "workoutsThisMonth": 14,
      "prsThisMonth": 3,
      "daysLeftInMonth": 14
    },
    "activeRoutine": { ... },
    "consistencyCounts": { "2026-10-15": 1, "2026-10-16": 2 },
    "prs": [ ... ],
    "plateauCount": 1,
    "aiTodayDay": null,
    "todayCheckin": {
      "creatineTaken": true,
      "dietCompliant": true,
      "zeroLiquidCalories": false
    }
  }
  ```

### `GET /api/stats/progress-page`
Endpoint consolidado para la página de Progreso.
- **Respuesta (200 OK):** Objeto con KPIs generales, consistencia anual, PRs con clasificación de fuerza y distribución muscular por grupos.

### `GET /api/stats/plateaus`
Calcula en el servidor los ejercicios estancados en las últimas 10 sesiones.
- **Respuesta (200 OK):** `{ "plateaued": ["press banca", "sentadilla"], "plateauCount": 2, "window": 10 }`

### `GET /api/stats/prs`
Lista completa de Personal Records con medallas históricas.

### `GET /api/stats/progress/:exerciseName`
Evolución de 1RM estimado a lo largo del tiempo para un ejercicio específico.

---

## 8. Composición Corporal y Hábitos (`/api/body`)

### `GET /api/body/logs`
Listado de registros de bioimpedancia y peso corporal ordenados descendente por fecha.

### `POST /api/body/log`
Crea un registro de peso, métricas de báscula y foto de progreso.
- **Body:**
  ```json
  {
    "weight": 78.4,
    "photoBase64": "data:image/jpeg;base64,...",
    "bodyFat": 14.5,
    "muscleMass": 38.2,
    "bodyWater": 58.0,
    "visceralFat": 4,
    "boneMass": 3.2,
    "protein": 19.5,
    "bmr": 1780,
    "bmi": 23.2,
    "note": "Medición en ayunas"
  }
  ```

### `GET /api/body/photos`
Lista de fotos de progreso con URLs optimizadas de Cloudinary.

### `GET /api/body/checkin`
Consulta los hábitos de adherencia de hoy.
- **Respuesta (200 OK):** `{ "date": "2026-10-17", "creatineTaken": true, "dietCompliant": true, "zeroLiquidCalories": true }`

### `PUT /api/body/checkin`
Actualiza los hábitos de adherencia en el `BodyLog` de hoy.
- **Body:** `{ "creatineTaken": true, "dietCompliant": true, "zeroLiquidCalories": false }`

---

## 9. Objetivos de Fuerza (`/api/goals`)

### `GET /api/goals`
Lista los objetivos activos calculando automáticamente si la meta fue alcanzada (`achievedAt`).

### `POST /api/goals`
Crea un nuevo objetivo de fuerza.
- **Body:**
  ```json
  {
    "exerciseName": "Press Militar",
    "targetWeight": 70,
    "targetReps": 5,
    "experienceLevel": "intermediate",
    "frequencyPerWeek": 2
  }
  ```
- **Error (409 Conflict):** Si ya existe un objetivo idéntico no cumplido para ese ejercicio.

### `PUT /api/goals/:id/weeks`
Marca o desmarca semanas en el checklist de periodización.
- **Body:** `{ "weekNumber": 3, "completed": true }`

### `DELETE /api/goals/:id`
Elimina un objetivo de fuerza.

---

## 10. Web Push y Notificaciones (`/api/push`)

### `GET /api/push/vapid-public-key`
Retorna la clave pública para la suscripción en el navegador.

### `POST /api/push/subscribe`
Registra la suscripción Web Push en el servidor.
- **Body:** `{ "endpoint": "https://...", "keys": { "p256dh": "...", "auth": "..." } }`

### `DELETE /api/push/subscribe`
Elimina la suscripción del dispositivo (usado al cerrar sesión).

### `PUT /api/push/creatine-reminder`
Configura los recordatorios diarios de creatina.
- **Body:** `{ "enabled": true, "time": "16:00" }`

### `POST /api/push/test-creatine`
Dispara una notificación push de prueba inmediata al dispositivo.

---

## 11. Respaldo y Diagnóstico (`/api/backup` y `/api/health`)

### `POST /api/backup/run`
Fuerza la ejecución inmediata de la exportación a Cloudinary para el usuario del token. Retorna metadata del archivo subido.

### `POST /api/backup/import`
Restaura un backup JSON completo en la cuenta del usuario.
- **Body:** Estructura completa de exportación de backup (rutinas, logs, PRs, bodyLogs, goals, restLogs).

### `GET /api/health`
Healthcheck de disponibilidad del servidor, conexión a base de datos y estado del último backup ejecutado.
- **Público:** Sí.
- **Respuesta (200 OK):**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-17T17:00:00.000Z",
    "timezone": "America/Mexico_City",
    "database": "connected",
    "backup": {
      "configured": true,
      "users": [
        { "username": "fernando.segrr", "lastBackupAt": "2026-10-17T10:00:00.000Z", "lastBackupError": null }
      ]
    }
  }
  ```
