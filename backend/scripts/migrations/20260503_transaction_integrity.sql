BEGIN;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "payment_channel" VARCHAR(255);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "fulfillment_route" VARCHAR(255);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "route_lock_key" VARCHAR(255);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "delivery_status" VARCHAR(255);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "integrity_status" VARCHAR(255);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "refund_reference" VARCHAR(255);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "anomaly_flag" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS "transaction_integrity_audits" (
  "id" UUID PRIMARY KEY,
  "transaction_id" UUID NOT NULL REFERENCES "transactions" ("id") ON DELETE CASCADE,
  "user_id" UUID REFERENCES "Users" ("id") ON DELETE CASCADE,
  "event_type" VARCHAR(255) NOT NULL,
  "severity" VARCHAR(255) NOT NULL DEFAULT 'info',
  "status" VARCHAR(255) NOT NULL DEFAULT 'open',
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "resolved_at" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "transactions_integrity_status_idx"
  ON "transactions" ("integrity_status");
CREATE INDEX IF NOT EXISTS "transactions_payment_channel_idx"
  ON "transactions" ("payment_channel");
CREATE INDEX IF NOT EXISTS "transactions_fulfillment_route_idx"
  ON "transactions" ("fulfillment_route");
CREATE INDEX IF NOT EXISTS "transactions_route_lock_key_idx"
  ON "transactions" ("route_lock_key");
CREATE INDEX IF NOT EXISTS "transactions_anomaly_flag_idx"
  ON "transactions" ("anomaly_flag");
CREATE INDEX IF NOT EXISTS "transactions_delivery_status_idx"
  ON "transactions" ("delivery_status");
CREATE INDEX IF NOT EXISTS "transactions_refund_reference_idx"
  ON "transactions" ("refund_reference");

CREATE INDEX IF NOT EXISTS "transaction_integrity_audits_transaction_id_idx"
  ON "transaction_integrity_audits" ("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_integrity_audits_user_id_idx"
  ON "transaction_integrity_audits" ("user_id");
CREATE INDEX IF NOT EXISTS "transaction_integrity_audits_event_type_idx"
  ON "transaction_integrity_audits" ("event_type");
CREATE INDEX IF NOT EXISTS "transaction_integrity_audits_severity_idx"
  ON "transaction_integrity_audits" ("severity");
CREATE INDEX IF NOT EXISTS "transaction_integrity_audits_status_idx"
  ON "transaction_integrity_audits" ("status");
CREATE INDEX IF NOT EXISTS "transaction_integrity_audits_created_at_idx"
  ON "transaction_integrity_audits" ("createdAt");

COMMIT;
