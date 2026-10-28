BEGIN;

-- 1. Add transaction-gated & audit columns to "referrals" table
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "bonus_status" VARCHAR(50) NOT NULL DEFAULT 'locked';
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_transaction_amount" DECIMAL(15, 2);
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_transaction_at" TIMESTAMPTZ;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "flag_reason" TEXT;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "flagged_at" TIMESTAMPTZ;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "flagged_by" UUID;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "reversed_at" TIMESTAMPTZ;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "reversal_reason" TEXT;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "reversal_admin_id" UUID;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "admin_notes" TEXT;

-- 2. Create performance indexes
CREATE INDEX IF NOT EXISTS "referrals_bonus_status_idx" ON "referrals" ("bonus_status");
CREATE INDEX IF NOT EXISTS "referrals_qualifying_tx_idx" ON "referrals" ("qualifying_transaction_id");

COMMIT;
