BEGIN;

ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "customer_price" DECIMAL(10,2);
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "dealer_commission" DECIMAL(10,2);
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "short_code" VARCHAR(255);
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "internal_sequence_number" INTEGER;
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "portfolio" VARCHAR(255) NOT NULL DEFAULT 'standard';
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "bundle_class" VARCHAR(255) NOT NULL DEFAULT 'generic_voice';
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "service_name" VARCHAR(255) NOT NULL DEFAULT 'Call Subscriptions';
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "service_slug" VARCHAR(255) NOT NULL DEFAULT 'call-subscriptions';
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "category_name" VARCHAR(255);
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "category_slug" VARCHAR(255);
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "subcategory_name" VARCHAR(255);
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "subcategory_slug" VARCHAR(255);
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "stock_limit" INTEGER;
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "stock_remaining" INTEGER;
ALTER TABLE "CallPlans" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "CallPlans"
SET
  "customer_price" = COALESCE("customer_price", "price"),
  "short_code" = COALESCE("short_code", "api_plan_id")
WHERE "customer_price" IS NULL OR "short_code" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "call_plans_short_code_unique" ON "CallPlans" ("short_code") WHERE "short_code" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "call_plans_internal_sequence_unique" ON "CallPlans" ("internal_sequence_number") WHERE "internal_sequence_number" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "call_plans_provider_portfolio_status_idx" ON "CallPlans" ("provider", "portfolio", "bundle_class", "status");

COMMIT;
