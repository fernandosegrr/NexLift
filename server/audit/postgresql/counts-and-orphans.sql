-- Aggregate counts only. Dynamic SQL consists exclusively of SELECT generated
-- from pg_catalog with identifier escaping. Composite MATCH SIMPLE FKs supported.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog;
SELECT format('SELECT jsonb_build_object(''check'',''entity_count'',''table'',%L,''count'',count(*)) FROM %I.%I;',c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN (
  'User','Routine','RoutineBlock','RoutineDay','Exercise','WorkoutLog','SetLog','PersonalRecord','RestLog',
  'BodyLog','Goal','PushSubscription','PendingReminder','SuggestionLog','TrainingProfile','CardioSession','CardioSegment')
ORDER BY c.relname
\gexec
WITH fk AS (
  SELECT c.oid,c.conname,n.nspname,child.relname,pn.nspname AS parent_schema,parent.relname AS parent_name,
    string_agg(format('ch.%I IS NOT NULL',ca.attname),' AND ' ORDER BY k.ord) AS nonnull,
    string_agg(format('pa.%I = ch.%I',pa.attname,ca.attname),' AND ' ORDER BY k.ord) AS equality
  FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=child.relnamespace JOIN pg_class parent ON parent.oid=c.confrelid
  JOIN pg_namespace pn ON pn.oid=parent.relnamespace
  CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(child_num,parent_num,ord)
  JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=k.child_num
  JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=k.parent_num
  WHERE c.contype='f' AND n.nspname='public'
  GROUP BY c.oid,c.conname,n.nspname,child.relname,pn.nspname,parent.relname
)
SELECT format('SELECT jsonb_build_object(''check'',''orphan_fk'',''table'',%L,''constraint'',%L,''count'',count(*)) FROM %I.%I ch WHERE %s AND NOT EXISTS (SELECT 1 FROM %I.%I pa WHERE %s);',
  relname,conname,nspname,relname,nonnull,parent_schema,parent_name,equality)
FROM fk ORDER BY relname,conname
\gexec
-- Optional legacy owners: NULL is not a dangling FK and must be counted separately.
SELECT format('SELECT jsonb_build_object(''check'',''owner_null'',''table'',%L,''count'',count(*)) FROM public.%I WHERE "userId" IS NULL;',c.relname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='userId' AND NOT a.attisdropped
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname
\gexec
-- Migration metadata, if it already exists: no migration names, logs or checksums.
SELECT 'SELECT jsonb_build_object(''check'',''migration_history_summary'',''rows'',count(*),''finished'',count(*) FILTER (WHERE finished_at IS NOT NULL),''unfinished'',count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL),''rolledBack'',count(*) FILTER (WHERE rolled_back_at IS NOT NULL)) FROM public._prisma_migrations;'
WHERE (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='_prisma_migrations' AND column_name IN ('finished_at','rolled_back_at'))=2
\gexec
COMMIT;
