-- Minimal relational slice of schema.prisma for this endpoint, on a new test cluster only.
-- No production migrations or db push. Includes real cascading FKs to detect history loss.
CREATE TABLE "User" (id TEXT PRIMARY KEY);
CREATE TABLE "Routine" (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, "isActive" BOOLEAN NOT NULL DEFAULT false,
 source TEXT NOT NULL DEFAULT 'manual', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, "adaptiveDeloadUntil" TIMESTAMP(3), "lastAdaptiveCheckAt" TIMESTAMP(3),
 "userId" TEXT REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "RoutineDay" (
 id TEXT PRIMARY KEY, "dayName" TEXT NOT NULL, "isRestDay" BOOLEAN NOT NULL DEFAULT false,
 "order" INTEGER NOT NULL DEFAULT 0, "splitLabel" TEXT, weekday INTEGER,
 "routineId" TEXT NOT NULL REFERENCES "Routine"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Exercise" (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, "muscleGroup" TEXT, "targetSets" INTEGER NOT NULL,
 "targetReps" TEXT NOT NULL, "restSeconds" INTEGER, note TEXT, "order" INTEGER NOT NULL DEFAULT 0,
 "isUnilateral" BOOLEAN NOT NULL DEFAULT false,
 "routineDayId" TEXT NOT NULL REFERENCES "RoutineDay"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "WorkoutLog" (
 id TEXT PRIMARY KEY, date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "exerciseId" TEXT NOT NULL REFERENCES "Exercise"(id) ON DELETE CASCADE ON UPDATE CASCADE, notes TEXT
);
CREATE TABLE "SetLog" (
 id TEXT PRIMARY KEY, "setNumber" INTEGER NOT NULL, weight DOUBLE PRECISION NOT NULL, reps INTEGER NOT NULL,
 rpe INTEGER, completed BOOLEAN NOT NULL DEFAULT true, "weightRight" DOUBLE PRECISION, "repsRight" INTEGER,
 "workoutLogId" TEXT NOT NULL REFERENCES "WorkoutLog"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
