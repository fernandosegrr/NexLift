-- PROVISIONAL: reviewed incremental expansion, never an approved production job.
-- 0_init and phase31 are immutable. Run ONLY in the verified fresh PGDATA runner.
-- Phase31's database comment is retained so the entire chain can run from zero.
BEGIN;
DO $$
DECLARE marker text;
BEGIN
  SELECT shobj_description(oid, 'pg_database') INTO marker FROM pg_database WHERE datname = current_database();
  IF current_database() !~ '^nexlift_ops_test_phase6_[a-f0-9_]+$'
     OR marker IS NULL OR marker !~ '^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$'
     OR current_setting('nexlift.phase6_disposable', true) IS DISTINCT FROM marker
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Phase 6 requires its explicit verified NEW disposable database';
  END IF;
END $$;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "Routine", "RoutineDay", "Exercise", "WorkoutLog", "PersonalRecord", "SuggestionLog", "PendingReminder" IN ACCESS EXCLUSIVE MODE;

-- Do not guess owners or rewrite IDs. An ambiguous legacy installation must be
-- remediated with authorized evidence before migration, never silently adopted.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "WorkoutLog" w JOIN "Exercise" e ON e.id=w."exerciseId"
      JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE r."userId" IS NULL)
     OR EXISTS (SELECT 1 FROM "SuggestionLog" s JOIN "Exercise" e ON e.id=s."exerciseId"
      JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE s."userId" IS DISTINCT FROM r."userId")
     OR EXISTS (SELECT 1 FROM "PendingReminder" s JOIN "Exercise" e ON e.id=s."exerciseId"
      JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE s."userId" IS DISTINCT FROM r."userId") THEN
    RAISE EXCEPTION 'Ambiguous history owner or cross-account reference; preserve data and stop';
  END IF;
END $$;

ALTER TABLE "Exercise" ADD COLUMN "userId" TEXT, ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Exercise" ALTER COLUMN "routineDayId" DROP NOT NULL;
UPDATE "Exercise" e SET "userId"=r."userId",
  "archivedAt"=CASE WHEN r.name='ARCHIVED_HISTORY_DO_NOT_DELETE' THEN CURRENT_TIMESTAMP AT TIME ZONE 'UTC' END
  FROM "RoutineDay" d JOIN "Routine" r ON r.id=d."routineId" WHERE d.id=e."routineDayId";

ALTER TABLE "WorkoutLog" ADD COLUMN "userId" TEXT, ADD COLUMN "exerciseNameSnapshot" TEXT,
  ADD COLUMN "muscleGroupSnapshot" TEXT, ADD COLUMN "isUnilateralSnapshot" BOOLEAN,
  ADD COLUMN "snapshotSource" TEXT NOT NULL DEFAULT 'recorded',
  ADD COLUMN "contextCapturedAt" TIMESTAMP(3),
  ADD COLUMN "originRoutineId" TEXT, ADD COLUMN "originRoutineDayId" TEXT;
-- Only the current observed label can be recovered. Unknown historical muscle,
-- unilateral classification and original plan remain NULL, not invented facts.
UPDATE "WorkoutLog" w SET "userId"=e."userId", "exerciseNameSnapshot"=e.name,
  "snapshotSource"='legacy-observed', "contextCapturedAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' FROM "Exercise" e WHERE e.id=w."exerciseId";
ALTER TABLE "WorkoutLog" ALTER COLUMN "userId" SET NOT NULL, ALTER COLUMN "exerciseNameSnapshot" SET NOT NULL;
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_snapshotSource_check" CHECK ("snapshotSource" IN ('recorded','legacy-observed'));

ALTER TABLE "PersonalRecord" ADD COLUMN "sourceExerciseId" TEXT;
-- Legacy PR provenance is unknown. Name equality alone never establishes it.
ALTER TABLE "Exercise" DROP CONSTRAINT "Exercise_routineDayId_fkey";
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_routineDayId_fkey" FOREIGN KEY ("routineDayId") REFERENCES "RoutineDay"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutLog" DROP CONSTRAINT "WorkoutLog_exerciseId_fkey";
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_sourceExerciseId_fkey" FOREIGN KEY ("sourceExerciseId") REFERENCES "Exercise"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuggestionLog" DROP CONSTRAINT "SuggestionLog_exerciseId_fkey";
ALTER TABLE "SuggestionLog" ADD CONSTRAINT "SuggestionLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Exercise_userId_archivedAt_idx" ON "Exercise"("userId", "archivedAt");
CREATE INDEX "WorkoutLog_userId_date_idx" ON "WorkoutLog"("userId", date);

CREATE FUNCTION nexlift_exercise_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE owner_id text; plan_name text;
BEGIN
  IF NEW."routineDayId" IS NOT NULL THEN
    SELECT r."userId",r.name INTO owner_id,plan_name FROM public."RoutineDay" d JOIN public."Routine" r ON r.id=d."routineId"
      WHERE d.id=NEW."routineDayId" FOR SHARE OF r,d;
    IF NEW."userId" IS NULL THEN NEW."userId"=owner_id; END IF;
    IF NEW."userId" IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Exercise owner differs from plan owner' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (OLD.id IS DISTINCT FROM NEW.id OR OLD."userId" IS DISTINCT FROM NEW."userId") THEN
    RAISE EXCEPTION 'Stable exercise identity and owner cannot change' USING ERRCODE='23514';
  END IF;
  IF NEW."routineDayId" IS NULL OR plan_name='ARCHIVED_HISTORY_DO_NOT_DELETE' THEN
    NEW."archivedAt"=coalesce(NEW."archivedAt",CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  ELSIF TG_OP='UPDATE' AND OLD."routineDayId" IS DISTINCT FROM NEW."routineDayId" THEN
    NEW."archivedAt"=NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nexlift_exercise_owner BEFORE INSERT OR UPDATE ON "Exercise" FOR EACH ROW EXECUTE FUNCTION nexlift_exercise_owner();

CREATE FUNCTION nexlift_workout_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ex public."Exercise"%ROWTYPE; routine_id text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(OLD.id,OLD."userId",OLD."exerciseId",OLD."exerciseNameSnapshot",OLD."muscleGroupSnapshot",OLD."isUnilateralSnapshot",OLD."snapshotSource",OLD."contextCapturedAt",OLD."originRoutineId",OLD."originRoutineDayId")
       IS DISTINCT FROM ROW(NEW.id,NEW."userId",NEW."exerciseId",NEW."exerciseNameSnapshot",NEW."muscleGroupSnapshot",NEW."isUnilateralSnapshot",NEW."snapshotSource",NEW."contextCapturedAt",NEW."originRoutineId",NEW."originRoutineDayId") THEN
      RAISE EXCEPTION 'Workout identity, owner and historical context are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO ex FROM public."Exercise" WHERE id=NEW."exerciseId" FOR SHARE;
  IF NOT FOUND OR ex."userId" IS NULL THEN RAISE EXCEPTION 'Workout requires an owned exercise' USING ERRCODE='23514'; END IF;
  IF NEW."userId" IS NULL THEN NEW."userId"=ex."userId"; END IF;
  IF NEW."userId" IS DISTINCT FROM ex."userId" THEN RAISE EXCEPTION 'Workout owner differs from exercise owner' USING ERRCODE='23514'; END IF;
  IF NEW."exerciseNameSnapshot" IS NULL THEN
    NEW."exerciseNameSnapshot"=ex.name; NEW."muscleGroupSnapshot"=ex."muscleGroup";
    NEW."isUnilateralSnapshot"=ex."isUnilateral"; NEW."snapshotSource"='recorded';
    NEW."contextCapturedAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    NEW."originRoutineDayId"=ex."routineDayId";
    SELECT "routineId" INTO routine_id FROM public."RoutineDay" WHERE id=ex."routineDayId";
    NEW."originRoutineId"=routine_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nexlift_workout_history BEFORE INSERT OR UPDATE ON "WorkoutLog" FOR EACH ROW EXECUTE FUNCTION nexlift_workout_history();

CREATE FUNCTION nexlift_set_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD."workoutLogId" IS DISTINCT FROM NEW."workoutLogId" THEN
    RAISE EXCEPTION 'Recorded set identity and parent session cannot change' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nexlift_set_identity BEFORE UPDATE ON "SetLog" FOR EACH ROW EXECUTE FUNCTION nexlift_set_identity();

CREATE FUNCTION nexlift_plan_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='Routine' THEN
    IF OLD.id IS DISTINCT FROM NEW.id OR OLD."userId" IS DISTINCT FROM NEW."userId" THEN
      RAISE EXCEPTION 'Routine identity and owner cannot change' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Day identity cannot change' USING ERRCODE='23514'; END IF;
    IF OLD."routineId" IS DISTINCT FROM NEW."routineId" THEN
      -- Lock both parents in deterministic order, including outside HTTP writers.
      PERFORM id FROM public."Routine" WHERE id IN (OLD."routineId",NEW."routineId") ORDER BY id FOR SHARE;
      IF (SELECT "userId" FROM public."Routine" WHERE id=OLD."routineId") IS DISTINCT FROM
         (SELECT "userId" FROM public."Routine" WHERE id=NEW."routineId") THEN
        RAISE EXCEPTION 'Day cannot transfer accounts' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nexlift_routine_owner BEFORE UPDATE ON "Routine" FOR EACH ROW EXECUTE FUNCTION nexlift_plan_owner();
CREATE TRIGGER nexlift_day_owner BEFORE UPDATE ON "RoutineDay" FOR EACH ROW EXECUTE FUNCTION nexlift_plan_owner();

CREATE FUNCTION nexlift_related_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE exercise_id text; owner_id text;
BEGIN
  IF TG_TABLE_NAME='PersonalRecord' THEN exercise_id=NEW."sourceExerciseId";
  ELSE exercise_id=NEW."exerciseId"; END IF;
  IF exercise_id IS NULL THEN RETURN NEW; END IF;
  SELECT "userId" INTO owner_id FROM public."Exercise" WHERE id=exercise_id FOR SHARE;
  IF NOT FOUND OR owner_id IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'Related exercise belongs to another account' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nexlift_pr_owner BEFORE INSERT OR UPDATE ON "PersonalRecord" FOR EACH ROW EXECUTE FUNCTION nexlift_related_owner();
CREATE TRIGGER nexlift_suggestion_owner BEFORE INSERT OR UPDATE ON "SuggestionLog" FOR EACH ROW EXECUTE FUNCTION nexlift_related_owner();
CREATE TRIGGER nexlift_reminder_owner BEFORE INSERT OR UPDATE ON "PendingReminder" FOR EACH ROW EXECUTE FUNCTION nexlift_related_owner();
COMMIT;
