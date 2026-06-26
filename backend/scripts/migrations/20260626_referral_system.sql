BEGIN;

-- 1. Create table "referral_clicks"
CREATE TABLE IF NOT EXISTS "referral_clicks" (
  "id" SERIAL PRIMARY KEY,
  "referrerId" UUID REFERENCES "Users" ("id") ON DELETE CASCADE,
  "referredUserId" UUID REFERENCES "Users" ("id") ON DELETE SET NULL,
  "referral_code" VARCHAR(255) NOT NULL,
  "click_token" VARCHAR(255) NOT NULL,
  "landing_path" VARCHAR(255),
  "source" VARCHAR(255),
  "ip_hash" VARCHAR(255),
  "user_agent_hash" VARCHAR(255),
  "converted_at" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add columns to "referrals"
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referrer_signup_bonus_amount" DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referrer_signup_bonus_awarded_at" TIMESTAMPTZ;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referee_signup_bonus_amount" DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referee_signup_bonus_awarded_at" TIMESTAMPTZ;

-- 3. Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "referral_clicks_code_token_unique" 
  ON "referral_clicks" ("referral_code", "click_token");
CREATE INDEX IF NOT EXISTS "referral_clicks_referrerId_idx" 
  ON "referral_clicks" ("referrerId");
CREATE INDEX IF NOT EXISTS "referral_clicks_referredUserId_idx" 
  ON "referral_clicks" ("referredUserId");

COMMIT;
