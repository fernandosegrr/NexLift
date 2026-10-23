-- Coach rehearsal only. Historical migration bytes and training rows remain intact.
BEGIN;
DO $$ DECLARE marker text; BEGIN
  SELECT shobj_description(oid, 'pg_database') INTO marker FROM pg_database WHERE datname=current_database();
  IF current_database() !~ '^nexlift_ops_test_phase6_[a-f0-9_]+$'
    OR marker IS NULL OR marker !~ '^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$'
    OR current_setting('nexlift.phase6_disposable', true) IS DISTINCT FROM marker
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Coach requires verified NEW local disposable PostgreSQL';
  END IF;
END $$;
SET LOCAL lock_timeout='5s';
CREATE TABLE "CoachCheckIn" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  date VARCHAR(10) NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  "sleepHours" DOUBLE PRECISION CHECK ("sleepHours" BETWEEN 0 AND 24),
  "sleepQuality" INTEGER CHECK ("sleepQuality" BETWEEN 1 AND 5),
  energy INTEGER CHECK (energy BETWEEN 1 AND 5), fatigue INTEGER CHECK (fatigue BETWEEN 1 AND 5), stress INTEGER CHECK (stress BETWEEN 1 AND 5),
  soreness JSONB NOT NULL CHECK (jsonb_typeof(soreness)='object'), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CoachCheckIn_userId_date_key" ON "CoachCheckIn"("userId",date);
CREATE TABLE "CoachExerciseConfig" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "exerciseId" TEXT NOT NULL REFERENCES "Exercise"(id) ON DELETE CASCADE,
  "directMuscle" TEXT, "secondaryMuscles" TEXT[] NOT NULL, "indirectWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK ("indirectWeight" BETWEEN 0 AND 1),
  equipment TEXT, increment DOUBLE PRECISION CHECK (increment > 0 AND increment <= 50), "availableLoads" DOUBLE PRECISION[] NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CoachExerciseConfig_exerciseId_key" ON "CoachExerciseConfig"("exerciseId");
CREATE INDEX "CoachExerciseConfig_userId_idx" ON "CoachExerciseConfig"("userId");
CREATE TABLE "CoachMeasurement" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  date VARCHAR(10) NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'), zone TEXT NOT NULL,
  cm DOUBLE PRECISION NOT NULL CHECK (cm > 0 AND cm <= 300), quality TEXT NOT NULL DEFAULT 'unknown' CHECK (quality IN ('consistent','variable','unknown'))
);
CREATE UNIQUE INDEX "CoachMeasurement_userId_date_zone_key" ON "CoachMeasurement"("userId",date,zone);
CREATE TABLE "CoachSuggestion" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "exerciseId" TEXT NOT NULL REFERENCES "Exercise"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, payload JSONB NOT NULL, "referenceHash" TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'presented' CHECK (outcome IN ('presented','accepted','modified','ignored')),
  "resultSetId" TEXT REFERENCES "SetLog"(id) ON DELETE SET NULL, "resultHash" TEXT
);
CREATE UNIQUE INDEX "CoachSuggestion_resultSetId_key" ON "CoachSuggestion"("resultSetId");
CREATE INDEX "CoachSuggestion_userId_createdAt_idx" ON "CoachSuggestion"("userId","createdAt");
-- Defense in depth for all Prisma/raw writers: references must share the owner.
CREATE FUNCTION nexlift_coach_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Exercise" WHERE id=NEW."exerciseId" AND "userId"=NEW."userId") THEN RAISE EXCEPTION 'Coach owner mismatch'; END IF;
  IF TG_TABLE_NAME='CoachSuggestion' THEN
  IF NEW."resultSetId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "SetLog" s JOIN "WorkoutLog" w ON w.id=s."workoutLogId"
    WHERE s.id=NEW."resultSetId" AND w."userId"=NEW."userId" AND w."exerciseId"=NEW."exerciseId"
  ) THEN RAISE EXCEPTION 'Coach result owner mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER coach_config_owner BEFORE INSERT OR UPDATE ON "CoachExerciseConfig" FOR EACH ROW EXECUTE FUNCTION nexlift_coach_owner();
CREATE TRIGGER coach_suggestion_owner BEFORE INSERT OR UPDATE ON "CoachSuggestion" FOR EACH ROW EXECUTE FUNCTION nexlift_coach_owner();
COMMIT;
