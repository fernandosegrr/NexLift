# Inventario completo declarado y reconstruido — Fase 2.1

Generado en PostgreSQL desechable desde `schema.prisma`, sin cambios. No describe producción.

SHA-256 del archivo: `7a4efb7abf97833dff9c9daf3534bc0440acc3b08050df47494f2fd7a1fddb53`. CLI 6.19.3; Client 6.19.3.

Las columnas se muestran con tipos, nulabilidad y defaults REALES del PostgreSQL reconstruido. Los defaults Prisma y `@updatedAt` también se indican: no todos existen en SQL.

## User

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| avatarUrl | text | sí | — | `avatarUrl     String?` |
| birthDate | timestamp(3) without time zone | sí | — | `birthDate     DateTime?` |
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt     DateTime  @default(now())` |
| creatineReminderEnabled | boolean | no | false | `creatineReminderEnabled   Boolean   @default(false)` |
| creatineReminderTime | text | no | '16:00'::text | `creatineReminderTime      String    @default("16:00")` |
| email | text | no | — | `email         String    @unique` |
| firstName | text | no | — | `firstName     String` |
| id | text | no | — | `id            String    @id @default(cuid())` |
| isActive | boolean | no | true | `isActive      Boolean   @default(true)` |
| lastBackupAt | timestamp(3) without time zone | sí | — | `lastBackupAt    DateTime?` |
| lastBackupError | text | sí | — | `lastBackupError String?` |
| lastCreatineReminderDate | text | sí | — | `lastCreatineReminderDate  String?` |
| lastCreatineReminderStage | integer | no | 0 | `lastCreatineReminderStage Int       @default(0)` |
| lastLogin | timestamp(3) without time zone | sí | — | `lastLogin     DateTime?` |
| lastName | text | no | — | `lastName      String` |
| lastReengagementNotifiedAt | timestamp(3) without time zone | sí | — | `lastReengagementNotifiedAt DateTime?` |
| passwordHash | text | no | — | `passwordHash  String` |
| phone | text | sí | — | `phone         String?` |
| securityAnswerHash | text | sí | — | `securityAnswerHash String?` |
| securityQuestion | text | sí | — | `securityQuestion  String?` |
| tokenVersion | integer | no | 0 | `tokenVersion  Int       @default(0)` |
| updatedAt | timestamp(3) without time zone | no | — | `updatedAt     DateTime  @updatedAt` |
| username | text | no | — | `username      String    @unique` |

Índices (incluyen PK y únicos):

- `CREATE INDEX "User_email_idx" ON public."User" USING btree (email)`
- `CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email)`
- `CREATE UNIQUE INDEX "User_pkey" ON public."User" USING btree (id)`
- `CREATE INDEX "User_username_idx" ON public."User" USING btree (username)`
- `CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username)`

FK salientes:

- Ninguna.

## CardioSession

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| activity | text | no | 'caminadora'::text | `activity String   @default("caminadora")` |
| calories | integer | sí | — | `calories Int?` |
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt DateTime @default(now())` |
| date | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `date     DateTime @default(now())` |
| id | text | no | — | `id       String   @id @default(cuid())` |
| note | text | sí | — | `note     String?` |
| updatedAt | timestamp(3) without time zone | no | — | `updatedAt DateTime @updatedAt` |
| userId | text | no | — | `userId   String` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "CardioSession_pkey" ON public."CardioSession" USING btree (id)`
- `CREATE INDEX "CardioSession_userId_date_idx" ON public."CardioSession" USING btree ("userId", date)`
- `CREATE INDEX "CardioSession_userId_idx" ON public."CardioSession" USING btree ("userId")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## CardioSegment

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| durationMin | double precision | no | — | `durationMin   Float` |
| id | text | no | — | `id            String        @id @default(cuid())` |
| incline | double precision | sí | — | `incline       Float?` |
| note | text | sí | — | `note          String?` |
| order | integer | no | 0 | `order         Int           @default(0)` |
| sessionId | text | no | — | `sessionId     String` |
| speed | double precision | sí | — | `speed         Float?` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "CardioSegment_pkey" ON public."CardioSegment" USING btree (id)`
- `CREATE INDEX "CardioSegment_sessionId_idx" ON public."CardioSegment" USING btree ("sessionId")`

FK salientes:

- `sessionId → CardioSession(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## Routine

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| adaptiveDeloadUntil | timestamp(3) without time zone | sí | — | `adaptiveDeloadUntil DateTime?` |
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt   DateTime     @default(now())` |
| description | text | sí | — | `description String?` |
| id | text | no | — | `id          String       @id @default(cuid())` |
| isActive | boolean | no | false | `isActive    Boolean      @default(false)` |
| lastAdaptiveCheckAt | timestamp(3) without time zone | sí | — | `lastAdaptiveCheckAt DateTime?` |
| name | text | no | — | `name        String` |
| source | text | no | 'manual'::text | `source      String       @default("manual")` |
| updatedAt | timestamp(3) without time zone | no | — | `updatedAt   DateTime     @updatedAt` |
| userId | text | sí | — | `userId      String?` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "Routine_pkey" ON public."Routine" USING btree (id)`
- `CREATE INDEX "Routine_userId_idx" ON public."Routine" USING btree ("userId")`
- `CREATE INDEX "Routine_userId_isActive_idx" ON public."Routine" USING btree ("userId", "isActive")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## RoutineBlock

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| durationWeeks | integer | no | 4 | `durationWeeks Int       @default(4)` |
| id | text | no | — | `id            String    @id @default(cuid())` |
| name | text | no | — | `name          String` |
| order | integer | no | 0 | `order         Int       @default(0)` |
| phase | text | no | 'custom'::text | `phase         String    @default("custom")` |
| routineId | text | no | — | `routineId     String` |
| startedAt | timestamp(3) without time zone | sí | — | `startedAt     DateTime?` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "RoutineBlock_pkey" ON public."RoutineBlock" USING btree (id)`
- `CREATE INDEX "RoutineBlock_routineId_idx" ON public."RoutineBlock" USING btree ("routineId")`

FK salientes:

- `routineId → Routine(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## RoutineDay

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| dayName | text | no | — | `dayName     String` |
| id | text | no | — | `id          String     @id @default(cuid())` |
| isRestDay | boolean | no | false | `isRestDay   Boolean    @default(false)` |
| order | integer | no | 0 | `order       Int        @default(0)` |
| routineId | text | no | — | `routineId   String` |
| splitLabel | text | sí | — | `splitLabel  String?` |
| weekday | integer | sí | — | `weekday     Int?` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "RoutineDay_pkey" ON public."RoutineDay" USING btree (id)`
- `CREATE INDEX "RoutineDay_routineId_idx" ON public."RoutineDay" USING btree ("routineId")`

FK salientes:

- `routineId → Routine(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## Exercise

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| id | text | no | — | `id           String       @id @default(cuid())` |
| isUnilateral | boolean | no | false | `isUnilateral Boolean      @default(false)` |
| muscleGroup | text | sí | — | `muscleGroup  String?` |
| name | text | no | — | `name         String` |
| note | text | sí | — | `note         String?` |
| order | integer | no | 0 | `order        Int          @default(0)` |
| restSeconds | integer | sí | — | `restSeconds  Int?` |
| routineDayId | text | no | — | `routineDayId String` |
| targetReps | text | no | — | `targetReps   String` |
| targetSets | integer | no | — | `targetSets   Int` |

Índices (incluyen PK y únicos):

- `CREATE INDEX "Exercise_name_idx" ON public."Exercise" USING btree (name)`
- `CREATE UNIQUE INDEX "Exercise_pkey" ON public."Exercise" USING btree (id)`
- `CREATE INDEX "Exercise_routineDayId_idx" ON public."Exercise" USING btree ("routineDayId")`
- `CREATE INDEX "Exercise_routineDayId_name_idx" ON public."Exercise" USING btree ("routineDayId", name)`

FK salientes:

- `routineDayId → RoutineDay(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## WorkoutLog

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| date | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `date        DateTime  @default(now())` |
| exerciseId | text | no | — | `exerciseId  String` |
| id | text | no | — | `id          String    @id @default(cuid())` |
| notes | text | sí | — | `notes       String?` |

Índices (incluyen PK y únicos):

- `CREATE INDEX "WorkoutLog_date_idx" ON public."WorkoutLog" USING btree (date)`
- `CREATE INDEX "WorkoutLog_exerciseId_date_idx" ON public."WorkoutLog" USING btree ("exerciseId", date)`
- `CREATE INDEX "WorkoutLog_exerciseId_idx" ON public."WorkoutLog" USING btree ("exerciseId")`
- `CREATE UNIQUE INDEX "WorkoutLog_pkey" ON public."WorkoutLog" USING btree (id)`

FK salientes:

- `exerciseId → Exercise(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## SetLog

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| completed | boolean | no | true | `completed    Boolean    @default(true)` |
| id | text | no | — | `id           String     @id @default(cuid())` |
| reps | integer | no | — | `reps         Int` |
| repsRight | integer | sí | — | `repsRight    Int?` |
| rpe | integer | sí | — | `rpe          Int?` |
| setNumber | integer | no | — | `setNumber    Int` |
| weight | double precision | no | — | `weight       Float` |
| weightRight | double precision | sí | — | `weightRight  Float?` |
| workoutLogId | text | no | — | `workoutLogId String` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "SetLog_pkey" ON public."SetLog" USING btree (id)`
- `CREATE INDEX "SetLog_workoutLogId_idx" ON public."SetLog" USING btree ("workoutLogId")`

FK salientes:

- `workoutLogId → WorkoutLog(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## PersonalRecord

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| date | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `date         DateTime @default(now())` |
| estimated1RM | double precision | sí | — | `estimated1RM Float?` |
| exerciseName | text | no | — | `exerciseName String` |
| id | text | no | — | `id           String   @id @default(cuid())` |
| reps | integer | no | — | `reps         Int` |
| userId | text | sí | — | `userId       String?` |
| weight | double precision | no | — | `weight       Float` |

Índices (incluyen PK y únicos):

- `CREATE INDEX "PersonalRecord_exerciseName_idx" ON public."PersonalRecord" USING btree ("exerciseName")`
- `CREATE UNIQUE INDEX "PersonalRecord_pkey" ON public."PersonalRecord" USING btree (id)`
- `CREATE INDEX "PersonalRecord_userId_idx" ON public."PersonalRecord" USING btree ("userId")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## RestLog

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| date | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `date      DateTime @default(now())` |
| id | text | no | — | `id        String   @id @default(cuid())` |
| note | text | sí | — | `note      String?` |
| userId | text | sí | — | `userId    String?` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "RestLog_pkey" ON public."RestLog" USING btree (id)`
- `CREATE INDEX "RestLog_userId_idx" ON public."RestLog" USING btree ("userId")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## BodyLog

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| bmi | double precision | sí | — | `bmi         Float?` |
| bmr | double precision | sí | — | `bmr         Float?` |
| bodyFat | double precision | sí | — | `bodyFat     Float?` |
| bodyWater | double precision | sí | — | `bodyWater   Float?` |
| boneMass | double precision | sí | — | `boneMass    Float?` |
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt DateTime @default(now())` |
| creatineTaken | boolean | sí | false | `creatineTaken      Boolean? @default(false)` |
| date | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `date      DateTime @default(now())` |
| dietCompliant | boolean | sí | false | `dietCompliant      Boolean? @default(false)` |
| id | text | no | — | `id        String   @id @default(cuid())` |
| muscleMass | double precision | sí | — | `muscleMass  Float?` |
| note | text | sí | — | `note      String?` |
| photoUrl | text | sí | — | `photoUrl  String?` |
| protein | double precision | sí | — | `protein     Float?` |
| userId | text | sí | — | `userId    String?` |
| visceralFat | double precision | sí | — | `visceralFat Float?` |
| weight | double precision | sí | — | `weight    Float?` |
| zeroLiquidCalories | boolean | sí | false | `zeroLiquidCalories Boolean? @default(false)` |

Índices (incluyen PK y únicos):

- `CREATE INDEX "BodyLog_date_idx" ON public."BodyLog" USING btree (date)`
- `CREATE UNIQUE INDEX "BodyLog_pkey" ON public."BodyLog" USING btree (id)`
- `CREATE INDEX "BodyLog_userId_idx" ON public."BodyLog" USING btree ("userId")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## Goal

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| achievedAt | timestamp(3) without time zone | sí | — | `achievedAt   DateTime?` |
| completedWeeks | integer[] | sí | — | `completedWeeks     Int[]` |
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt    DateTime  @default(now())` |
| currentEightRepMax | double precision | sí | — | `currentEightRepMax Float?` |
| currentOneRepMax | double precision | sí | — | `currentOneRepMax   Float?` |
| exerciseName | text | no | — | `exerciseName String` |
| experienceLevel | text | sí | — | `experienceLevel    String?` |
| frequencyPerWeek | integer | sí | — | `frequencyPerWeek   Int?` |
| id | text | no | — | `id           String    @id @default(cuid())` |
| muscleGroup | text | sí | — | `muscleGroup  String?` |
| targetReps | integer | no | — | `targetReps   Int` |
| targetWeight | double precision | no | — | `targetWeight Float` |
| userId | text | no | — | `userId       String` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "Goal_pkey" ON public."Goal" USING btree (id)`
- `CREATE INDEX "Goal_userId_idx" ON public."Goal" USING btree ("userId")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## PushSubscription

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| auth | text | no | — | `auth      String` |
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt DateTime @default(now())` |
| endpoint | text | no | — | `endpoint  String   @unique` |
| id | text | no | — | `id        String   @id @default(cuid())` |
| p256dh | text | no | — | `p256dh    String` |
| userId | text | no | — | `userId    String` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON public."PushSubscription" USING btree (endpoint)`
- `CREATE UNIQUE INDEX "PushSubscription_pkey" ON public."PushSubscription" USING btree (id)`
- `CREATE INDEX "PushSubscription_userId_idx" ON public."PushSubscription" USING btree ("userId")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## PendingReminder

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt        DateTime @default(now())` |
| exerciseId | text | no | — | `exerciseId       String` |
| fireAt | timestamp(3) without time zone | no | — | `fireAt           DateTime` |
| id | text | no | — | `id               String   @id @default(cuid())` |
| nextExerciseName | text | sí | — | `nextExerciseName String?` |
| userId | text | no | — | `userId           String` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "PendingReminder_pkey" ON public."PendingReminder" USING btree (id)`
- `CREATE UNIQUE INDEX "PendingReminder_userId_exerciseId_key" ON public."PendingReminder" USING btree ("userId", "exerciseId")`

FK salientes:

- `exerciseId → Exercise(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.
- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## SuggestionLog

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| date | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `date            DateTime @default(now())` |
| exerciseId | text | no | — | `exerciseId      String` |
| id | text | no | — | `id              String   @id @default(cuid())` |
| phase | text | sí | — | `phase           String?` |
| source | text | no | — | `source          String` |
| suggestedReps | integer | no | — | `suggestedReps   Int` |
| suggestedWeight | double precision | no | — | `suggestedWeight Float` |
| userId | text | no | — | `userId          String` |

Índices (incluyen PK y únicos):

- `CREATE INDEX "SuggestionLog_exerciseId_idx" ON public."SuggestionLog" USING btree ("exerciseId")`
- `CREATE UNIQUE INDEX "SuggestionLog_pkey" ON public."SuggestionLog" USING btree (id)`
- `CREATE INDEX "SuggestionLog_userId_date_idx" ON public."SuggestionLog" USING btree ("userId", date)`
- `CREATE INDEX "SuggestionLog_userId_idx" ON public."SuggestionLog" USING btree ("userId")`

FK salientes:

- `exerciseId → Exercise(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.
- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.

## TrainingProfile

| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |
|---|---|---|---|---|
| createdAt | timestamp(3) without time zone | no | CURRENT_TIMESTAMP | `createdAt       DateTime @default(now())` |
| daysPerWeek | integer | no | — | `daysPerWeek     Int` |
| equipment | text[] | sí | — | `equipment       String[]` |
| experienceLevel | text | no | — | `experienceLevel String` |
| goal | text | no | — | `goal            String` |
| id | text | no | — | `id              String   @id @default(cuid())` |
| updatedAt | timestamp(3) without time zone | no | — | `updatedAt       DateTime @updatedAt` |
| userId | text | no | — | `userId          String   @unique` |

Índices (incluyen PK y únicos):

- `CREATE UNIQUE INDEX "TrainingProfile_pkey" ON public."TrainingProfile" USING btree (id)`
- `CREATE UNIQUE INDEX "TrainingProfile_userId_key" ON public."TrainingProfile" USING btree ("userId")`

FK salientes:

- `userId → User(id)`; DELETE CASCADE; UPDATE CASCADE; validada true; diferible false.
