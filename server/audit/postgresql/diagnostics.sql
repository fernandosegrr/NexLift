-- Requires the columns of the current declared schema. The inspection wrapper
-- skips this file if tables/column types/nullability have drifted.
-- Output contains counts only, never IDs, names, endpoint keys, notes or dates of birth.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = public, pg_catalog;
WITH checks AS (
 SELECT 'pr_case_duplicate_groups' AS name,count(*) AS count FROM (
   SELECT "userId",lower("exerciseName") FROM "PersonalRecord" WHERE "userId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'active_routine_duplicate_owners',count(*) FROM (
   SELECT "userId" FROM "Routine" WHERE "isActive" AND "userId" IS NOT NULL GROUP BY 1 HAVING count(*)>1) d
 UNION ALL SELECT 'ai_routine_duplicate_owners',count(*) FROM (
   SELECT "userId" FROM "Routine" WHERE source='ai' AND "userId" IS NOT NULL GROUP BY 1 HAVING count(*)>1) d
 UNION ALL SELECT 'ai_day_duplicate_groups',count(*) FROM (
   SELECT d."routineId",d."dayName" FROM "RoutineDay" d JOIN "Routine" r ON r.id=d."routineId" WHERE r.source='ai' GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'ai_day_non_iso_names',count(*) FROM "RoutineDay" d JOIN "Routine" r ON r.id=d."routineId" WHERE r.source='ai' AND d."dayName" !~ '^\d{4}-\d{2}-\d{2}$'
 UNION ALL SELECT 'archive_duplicate_owners',count(*) FROM (
   SELECT "userId" FROM "Routine" WHERE name='ARCHIVED_HISTORY_DO_NOT_DELETE' AND "userId" IS NOT NULL GROUP BY 1 HAVING count(*)>1) d
 UNION ALL SELECT 'set_number_duplicate_groups',count(*) FROM (
   SELECT "workoutLogId","setNumber" FROM "SetLog" GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'multiple_sessions_per_exercise_cdmx_day_groups_informational',count(*) FROM (
   SELECT "exerciseId",((date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date FROM "WorkoutLog" GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'manual_weekday_duplicate_groups_informational',count(*) FROM (
   SELECT d."routineId",d.weekday FROM "RoutineDay" d JOIN "Routine" r ON r.id=d."routineId" WHERE r.source='manual' AND d.weekday IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'suggestion_owner_mismatch_or_unowned',count(*) FROM "SuggestionLog" s JOIN "Exercise" e ON e.id=s."exerciseId" JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE s."userId" IS DISTINCT FROM r."userId"
 UNION ALL SELECT 'reminder_owner_mismatch_or_unowned',count(*) FROM "PendingReminder" s JOIN "Exercise" e ON e.id=s."exerciseId" JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE s."userId" IS DISTINCT FROM r."userId"
 UNION ALL SELECT 'workouts_under_unowned_routines',count(*) FROM "WorkoutLog" w JOIN "Exercise" e ON e.id=w."exerciseId" JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE r."userId" IS NULL
 UNION ALL SELECT 'sets_under_unowned_routines',count(*) FROM "SetLog" s JOIN "WorkoutLog" w ON w.id=s."workoutLogId" JOIN "Exercise" e ON e.id=w."exerciseId" JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE r."userId" IS NULL
 UNION ALL SELECT 'weekday_out_of_range',count(*) FROM "RoutineDay" WHERE weekday < 0 OR weekday > 6
 UNION ALL SELECT 'rest_days_with_exercises',count(*) FROM "RoutineDay" d WHERE d."isRestDay" AND EXISTS(SELECT 1 FROM "Exercise" e WHERE e."routineDayId"=d.id)
 UNION ALL SELECT 'nonpositive_set_number',count(*) FROM "SetLog" WHERE "setNumber"<=0
 UNION ALL SELECT 'negative_set_values',count(*) FROM "SetLog" WHERE weight<0 OR reps<0 OR "weightRight"<0 OR "repsRight"<0
 UNION ALL SELECT 'nonfinite_set_weights',count(*) FROM "SetLog" WHERE weight::text IN ('NaN','Infinity','-Infinity') OR "weightRight"::text IN ('NaN','Infinity','-Infinity')
 UNION ALL SELECT 'nonfinite_pr_values',count(*) FROM "PersonalRecord" WHERE weight::text IN ('NaN','Infinity','-Infinity') OR "estimated1RM"::text IN ('NaN','Infinity','-Infinity')
 UNION ALL SELECT 'pr_without_name_matched_history_informational',count(*) FROM "PersonalRecord" p WHERE p."userId" IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM "WorkoutLog" w JOIN "Exercise" e ON e.id=w."exerciseId" JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId" WHERE r."userId"=p."userId" AND lower(e.name)=lower(p."exerciseName"))
 UNION ALL SELECT 'empty_workout_sessions_informational',count(*) FROM "WorkoutLog" w WHERE NOT EXISTS(SELECT 1 FROM "SetLog" s WHERE s."workoutLogId"=w.id)
 UNION ALL SELECT 'exercise_order_duplicate_groups_informational',count(*) FROM (
   SELECT "routineDayId","order" FROM "Exercise" GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'day_order_duplicate_groups_informational',count(*) FROM (
   SELECT "routineId","order" FROM "RoutineDay" GROUP BY 1,2 HAVING count(*)>1) d
)
SELECT jsonb_build_object('check',name,'count',count) FROM checks ORDER BY name;
-- Dates are UTC TIMESTAMP(3) in the declared schema. Only year buckets and
-- aggregate extrema are emitted; no identifiers or per-person timelines.
SELECT format('SELECT jsonb_build_object(''check'',''date_distribution'',''table'',%L,''rows'',count(*),''minYear'',min(extract(year from date)),''maxYear'',max(extract(year from date)),''futureRows'',count(*) FILTER (WHERE date > (CURRENT_TIMESTAMP AT TIME ZONE ''UTC''))) FROM public.%I;',v.name,v.name)
FROM (VALUES ('WorkoutLog'),('PersonalRecord'),('BodyLog'),('RestLog'),('CardioSession'),('SuggestionLog')) v(name)
ORDER BY v.name
\gexec
SELECT jsonb_build_object('check','workout_year_bucket','year',extract(year from date),'count',count(*))
FROM "WorkoutLog" GROUP BY extract(year from date) ORDER BY extract(year from date);
COMMIT;
