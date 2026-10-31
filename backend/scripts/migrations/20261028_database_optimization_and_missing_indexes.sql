BEGIN;

-- 1. Indexes for system_settings lookups
CREATE UNIQUE INDEX IF NOT EXISTS "idx_system_settings_key" ON "system_settings" ("key");
CREATE INDEX IF NOT EXISTS "idx_system_settings_group" ON "system_settings" ("group");

-- 2. Indexes for transactions hot paths (user history, reference lookups, status filters)
CREATE INDEX IF NOT EXISTS "idx_transactions_user_id_created_at" ON "transactions" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_transactions_reference" ON "transactions" ("reference");
CREATE INDEX IF NOT EXISTS "idx_transactions_status" ON "transactions" ("status");
CREATE INDEX IF NOT EXISTS "idx_transactions_created_at" ON "transactions" ("createdAt" DESC);

-- 3. Indexes for Wallets (user balance and credit/debit lookups)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_wallets_user_id" ON "Wallets" ("userId");

-- 4. Indexes for referrals (leaderboards, user referral network, status lookups)
CREATE INDEX IF NOT EXISTS "idx_referrals_referrer_status" ON "referrals" ("referrerId", "status");

-- 5. Indexes for Users hot paths (auth lookup with paranoid deletedAt, phone/email login, referral lookups)
CREATE INDEX IF NOT EXISTS "idx_users_id_deleted_at" ON "Users" ("id", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_users_email_deleted_at" ON "Users" ("email", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_users_phone_deleted_at" ON "Users" ("phone", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_users_referral_code" ON "Users" ("referral_code");
CREATE INDEX IF NOT EXISTS "idx_users_referred_by" ON "Users" ("referred_by");

COMMIT;
