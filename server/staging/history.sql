-- Supplemental count-only diagnostics. No historical repair or domain changes.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=public,pg_catalog;
WITH checks AS (
 SELECT 'body_nonfinite_measurements' AS name,count(*) AS count FROM "BodyLog" b
 WHERE EXISTS(SELECT 1 FROM jsonb_each_text(to_jsonb(b)) v WHERE v.key IN ('weight','bmi','bodyFat','muscleMass','bmr','bodyWater','visceralFat','boneMass','protein') AND v.value IN ('NaN','Infinity','-Infinity'))
 UNION ALL SELECT 'body_negative_measurements',count(*) FROM "BodyLog" WHERE weight<0 OR bmi<0 OR "bodyFat"<0 OR "muscleMass"<0 OR bmr<0 OR "bodyWater"<0 OR "visceralFat"<0 OR "boneMass"<0 OR protein<0
 UNION ALL SELECT 'body_percentage_outside_zero_one_hundred',count(*) FROM "BodyLog" WHERE "bodyFat">100 OR "bodyWater">100 OR protein>100
 UNION ALL SELECT 'nullable_habits_informational',count(*) FROM "BodyLog" WHERE "creatineTaken" IS NULL OR "dietCompliant" IS NULL OR "zeroLiquidCalories" IS NULL
 UNION ALL SELECT 'multiple_body_entries_per_cdmx_day_informational',count(*) FROM (
   SELECT "userId",((date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date FROM "BodyLog" WHERE "userId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'user_case_duplicate_usernames',count(*) FROM (SELECT lower(username) FROM "User" GROUP BY 1 HAVING count(*)>1) d
 UNION ALL SELECT 'user_case_duplicate_emails',count(*) FROM (SELECT lower(email) FROM "User" GROUP BY 1 HAVING count(*)>1) d
 UNION ALL SELECT 'null_goal_week_arrays',count(*) FROM "Goal" WHERE "completedWeeks" IS NULL
 UNION ALL SELECT 'nonpositive_or_duplicate_goal_weeks',count(*) FROM "Goal" WHERE EXISTS(SELECT 1 FROM unnest("completedWeeks") w WHERE w<1) OR cardinality("completedWeeks")<>(SELECT count(DISTINCT w) FROM unnest("completedWeeks") w)
 UNION ALL SELECT 'null_training_equipment_arrays',count(*) FROM "TrainingProfile" WHERE equipment IS NULL
 UNION ALL SELECT 'pr_negative_or_zero_work_values',count(*) FROM "PersonalRecord" WHERE weight<=0 OR reps<=0
 UNION ALL SELECT 'pr_estimate_differs_from_preserved_epley_rule_informational',count(*) FROM "PersonalRecord" WHERE "estimated1RM" IS NOT NULL AND abs("estimated1RM"-(CASE WHEN reps>1 AND reps<37 THEN weight*(1+reps/30.0) ELSE weight END))>0.000001
 UNION ALL SELECT 'pr_differs_from_available_history_best_informational',count(*) FROM "PersonalRecord" p
 JOIN LATERAL (
  SELECT max(CASE WHEN v.reps>1 AND v.reps<37 THEN v.weight*(1+v.reps/30.0) ELSE v.weight END) AS best
  FROM "SetLog" s JOIN "WorkoutLog" w ON w.id=s."workoutLogId" JOIN "Exercise" e ON e.id=w."exerciseId"
  JOIN "RoutineDay" d ON d.id=e."routineDayId" JOIN "Routine" r ON r.id=d."routineId"
  CROSS JOIN LATERAL (VALUES (s.weight,s.reps),(coalesce(s."weightRight",s.weight),coalesce(s."repsRight",s.reps))) v(weight,reps)
  WHERE r."userId"=p."userId" AND lower(e.name)=lower(p."exerciseName") AND v.weight>0 AND v.reps>0
 ) h ON h.best IS NOT NULL WHERE p."estimated1RM" IS NULL OR abs(p."estimated1RM"-h.best)>0.000001
)
SELECT jsonb_build_object('check',name,'count',count) FROM checks ORDER BY name;
COMMIT;
