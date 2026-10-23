-- Metadata only. No application rows, connection details or function bodies.
-- Run with psql -X -q -A -t -v ON_ERROR_STOP=1. Targets public explicitly.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog;
WITH tables AS (
  SELECT c.oid, c.relname AS name, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
), columns AS (
  SELECT t.name AS "table", a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
    NOT a.attnotnull AS nullable,
    CASE WHEN d.oid IS NOT NULL AND a.attname IN ('passwordHash','securityAnswerHash','p256dh','auth','endpoint','email','username','firstName','lastName','phone','avatarUrl','photoUrl','securityQuestion')
      THEN '[redacted metadata fingerprint:' || md5(pg_get_expr(d.adbin,d.adrelid)) || ']'
      ELSE pg_get_expr(d.adbin,d.adrelid) END AS "default",
    a.attidentity AS identity, a.attgenerated AS generated,
    CASE WHEN a.attcollation = 0 THEN NULL ELSE coll.collname END AS collation
  FROM tables t JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  LEFT JOIN pg_collation coll ON coll.oid = a.attcollation
), fks AS (
  SELECT t.name AS "table", c.conname AS name,
    ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
    rn.nspname AS "referencedSchema", rt.relname AS "referencedTable",
    ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS "referencedColumns",
    CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION'
      WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS "onDelete",
    CASE c.confupdtype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION'
      WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS "onUpdate",
    c.condeferrable AS deferrable, c.condeferred AS "initiallyDeferred", c.convalidated AS validated,
    (SELECT array_agg(DISTINCT tr.tgenabled ORDER BY tr.tgenabled) FROM pg_trigger tr WHERE tr.tgconstraint=c.oid) AS "triggerModes"
  FROM pg_constraint c JOIN tables t ON t.oid=c.conrelid
  JOIN pg_class rt ON rt.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=rt.relnamespace
  WHERE c.contype='f'
), indexes AS (
  SELECT t.name AS "table", ic.relname AS name, pg_get_indexdef(i.indexrelid) AS definition,
    i.indisunique AS unique, i.indisprimary AS primary, i.indisvalid AS valid, i.indisready AS ready
  FROM pg_index i JOIN tables t ON t.oid=i.indrelid JOIN pg_class ic ON ic.oid=i.indexrelid
), constraints AS (
  SELECT t.name AS "table", c.conname AS name, c.contype AS type,
    pg_get_constraintdef(c.oid,true) AS definition, c.convalidated AS validated,
    c.condeferrable AS deferrable, c.condeferred AS "initiallyDeferred"
  FROM pg_constraint c JOIN tables t ON t.oid=c.conrelid WHERE c.contype IN ('p','u','f','c','x')
), extras AS (
  SELECT 'trigger' AS kind, t.name AS "table", tr.tgname AS name,
    jsonb_build_object('enabled',tr.tgenabled,'internal',tr.tgisinternal,
      'definitionHash',md5(pg_get_triggerdef(tr.oid))) AS detail
  FROM pg_trigger tr JOIN tables t ON t.oid=tr.tgrelid WHERE NOT tr.tgisinternal
  UNION ALL
  SELECT 'view', NULL, c.relname, jsonb_build_object('kind',c.relkind,'definitionHash',md5(pg_get_viewdef(c.oid)))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')
  UNION ALL
  SELECT 'routine', NULL, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    jsonb_build_object('kind',p.prokind,'definitionHash',md5(pg_get_functiondef(p.oid)))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
  UNION ALL
  SELECT 'policy', t.name, p.polname, jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive)
  FROM pg_policy p JOIN tables t ON t.oid=p.polrelid
  UNION ALL
  SELECT 'extension', NULL, e.extname, jsonb_build_object('version',e.extversion,'schema',n.nspname)
  FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname <> 'plpgsql'
)
SELECT jsonb_build_object(
  'tables', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'kind',relkind,'rls',relrowsecurity) ORDER BY name),'[]') FROM tables),
  'columns', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c."table",c.name),'[]') FROM columns c),
  'foreignKeys', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f."table",f.name),'[]') FROM fks f),
  'indexes', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i."table",i.name),'[]') FROM indexes i),
  'constraints', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c."table",c.name),'[]') FROM constraints c),
  'extras', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.kind,e."table",e.name),'[]') FROM extras e)
);
COMMIT;
