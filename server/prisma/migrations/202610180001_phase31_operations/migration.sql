-- PROVISIONAL DEVELOPMENT ONLY. 0_init has NOT been reconciled with production.
-- This guard deliberately rejects ordinary migrate deploy, including staging.
-- Only the fresh disposable runner may provide this random per-database marker.
BEGIN;
DO $$
DECLARE marker text;
BEGIN
  SELECT shobj_description(oid, 'pg_database') INTO marker FROM pg_database WHERE datname = current_database();
  IF current_database() !~ '^nexlift_ops_test_[a-z0-9_]+$'
     OR marker IS NULL OR marker !~ '^NEXLIFT_PHASE31_DISPOSABLE:[a-f0-9-]{36}$'
     OR current_setting('nexlift.phase31_disposable', true) IS DISTINCT FROM marker THEN
    RAISE EXCEPTION 'Phase 3.1 provisional migration requires a verified NEW disposable database';
  END IF;
END $$;

-- SQL-managed infrastructure: no changes to the 17 historical Prisma models,
-- portable JSON contract or mathematical formulas. Full pg_dump includes this
-- schema. Public-only sanitized/JSON backups are NOT an operation journal.
CREATE SCHEMA nexlift_operations;
REVOKE ALL ON SCHEMA nexlift_operations FROM PUBLIC;
CREATE TABLE nexlift_operations."IdempotencyRecord" (
  "userId" TEXT NOT NULL,
  "operationId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "performedAt" TIMESTAMPTZ(3) NOT NULL,
  "performedDay" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" TEXT NOT NULL DEFAULT 'confirmed',
  "resourceId" TEXT NOT NULL,
  "responseStatus" INTEGER NOT NULL,
  "response" JSONB NOT NULL,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("userId", "operationId"),
  CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IdempotencyRecord_kind_check" CHECK ("kind" IN ('workout.create','workout.appendSet','workout.replaceSets','workout.delete','rest.create')),
  CONSTRAINT "IdempotencyRecord_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "IdempotencyRecord_state_check" CHECK ("state" = 'confirmed'),
  CONSTRAINT "IdempotencyRecord_status_check" CHECK ("responseStatus" IN (200,201)),
  CONSTRAINT "IdempotencyRecord_time_check" CHECK (isfinite("performedAt") AND isfinite("performedDay") AND "performedDay" = ("performedAt" AT TIME ZONE 'America/Mexico_City')::date),
  CONSTRAINT "IdempotencyRecord_response_check" CHECK (jsonb_typeof("response") = 'object' AND length("resourceId") > 0)
);
CREATE INDEX "IdempotencyRecord_resourceId_idx" ON nexlift_operations."IdempotencyRecord" ("userId", "resourceId");
-- No TTL, cleanup job, resource cascade or resource FK: acknowledgements survive
-- an intentional later edit/delete. User deletion retires the account itself.
COMMIT;
