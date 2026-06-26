BEGIN;

-- 1. Create status enum for account deletion requests
DO $$ BEGIN
    CREATE TYPE "enum_account_deletion_requests_status" AS ENUM('pending', 'cancelled', 'rejected', 'approved', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create actor_type enum for account deletion audits
DO $$ BEGIN
    CREATE TYPE "enum_account_deletion_audits_actor_type" AS ENUM('user', 'admin', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create table "account_deletion_requests"
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID REFERENCES "Users" ("id") ON DELETE SET NULL,
  "status" "enum_account_deletion_requests_status" NOT NULL DEFAULT 'pending',
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "grace_ends_at" TIMESTAMPTZ NOT NULL,
  "cancelled_at" TIMESTAMPTZ,
  "rejected_at" TIMESTAMPTZ,
  "approved_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "request_reason" TEXT,
  "admin_review_reason" TEXT,
  "execution_reason" TEXT,
  "retention_acknowledged" BOOLEAN NOT NULL DEFAULT FALSE,
  "approved_by_admin_id" UUID REFERENCES "Users" ("id") ON DELETE SET NULL,
  "rejected_by_admin_id" UUID REFERENCES "Users" ("id") ON DELETE SET NULL,
  "executed_by_admin_id" UUID REFERENCES "Users" ("id") ON DELETE SET NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create table "account_deletion_audits"
CREATE TABLE IF NOT EXISTS "account_deletion_audits" (
  "id" UUID PRIMARY KEY,
  "request_id" UUID REFERENCES "account_deletion_requests" ("id") ON DELETE CASCADE,
  "user_id" UUID REFERENCES "Users" ("id") ON DELETE SET NULL,
  "admin_id" UUID REFERENCES "Users" ("id") ON DELETE SET NULL,
  "actor_type" "enum_account_deletion_audits_actor_type" NOT NULL,
  "event_type" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) NOT NULL DEFAULT 'success',
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create indexes for "account_deletion_requests"
CREATE INDEX IF NOT EXISTS "account_deletion_requests_user_id_idx" ON "account_deletion_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "account_deletion_requests_status_idx" ON "account_deletion_requests" ("status");
CREATE INDEX IF NOT EXISTS "account_deletion_requests_grace_ends_at_idx" ON "account_deletion_requests" ("grace_ends_at");
CREATE INDEX IF NOT EXISTS "account_deletion_requests_approved_by_admin_id_idx" ON "account_deletion_requests" ("approved_by_admin_id");
CREATE INDEX IF NOT EXISTS "account_deletion_requests_rejected_by_admin_id_idx" ON "account_deletion_requests" ("rejected_by_admin_id");
CREATE INDEX IF NOT EXISTS "account_deletion_requests_executed_by_admin_id_idx" ON "account_deletion_requests" ("executed_by_admin_id");
CREATE INDEX IF NOT EXISTS "account_deletion_requests_created_at_idx" ON "account_deletion_requests" ("createdAt");

-- 6. Create indexes for "account_deletion_audits"
CREATE INDEX IF NOT EXISTS "account_deletion_audits_request_id_idx" ON "account_deletion_audits" ("request_id");
CREATE INDEX IF NOT EXISTS "account_deletion_audits_user_id_idx" ON "account_deletion_audits" ("user_id");
CREATE INDEX IF NOT EXISTS "account_deletion_audits_admin_id_idx" ON "account_deletion_audits" ("admin_id");
CREATE INDEX IF NOT EXISTS "account_deletion_audits_actor_type_idx" ON "account_deletion_audits" ("actor_type");
CREATE INDEX IF NOT EXISTS "account_deletion_audits_event_type_idx" ON "account_deletion_audits" ("event_type");
CREATE INDEX IF NOT EXISTS "account_deletion_audits_created_at_idx" ON "account_deletion_audits" ("createdAt");

COMMIT;
