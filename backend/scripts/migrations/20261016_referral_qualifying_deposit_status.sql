BEGIN;

-- 1. Add missing status and qualifying deposit columns to "referrals" table
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "status" VARCHAR(255) NOT NULL DEFAULT 'pending';
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_deposit_amount" DECIMAL(15, 2);
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_deposit_at" TIMESTAMPTZ;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_transaction_id" VARCHAR(255);

-- 2. Create indexes for performance and rapid lookups
CREATE INDEX IF NOT EXISTS "referrals_status_idx" ON "referrals" ("status");
CREATE INDEX IF NOT EXISTS "referrals_referred_user_id_idx" ON "referrals" ("referredUserId");
CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx" ON "referrals" ("referrerId");

COMMIT;
