-- Migration: 20261025_deposit_reconciliation_audit.sql
-- Description: Creates the deposit_reconciliation_audits table for tracking automated deposit reconciliations,
-- dry-run audits, multi-gateway resolutions, and fund recoveries.

CREATE TABLE IF NOT EXISTS "deposit_reconciliation_audits" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "transaction_reference" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "wallet_id" UUID REFERENCES "Wallets"("id") ON DELETE SET NULL,
    "transaction_id" UUID REFERENCES "transactions"("id") ON DELETE SET NULL,
    "amount" DECIMAL(15, 2) NOT NULL,
    "gateway_provider" VARCHAR(64) NOT NULL,
    "account_number" VARCHAR(64),
    "reconciliation_type" VARCHAR(64) NOT NULL DEFAULT 'historical_batch',
    "status" VARCHAR(32) NOT NULL DEFAULT 'settled',
    "is_reconciled" BOOLEAN NOT NULL DEFAULT true,
    "wallet_balance_before" DECIMAL(15, 2),
    "wallet_balance_after" DECIMAL(15, 2),
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "timestamp_credited" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe indexes for fast queries, lookups, and audit reports
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_user_id" ON "deposit_reconciliation_audits" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_wallet_id" ON "deposit_reconciliation_audits" ("wallet_id");
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_tx_ref" ON "deposit_reconciliation_audits" ("transaction_reference");
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_status" ON "deposit_reconciliation_audits" ("status");
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_provider" ON "deposit_reconciliation_audits" ("gateway_provider");
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_recon_type" ON "deposit_reconciliation_audits" ("reconciliation_type");
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_created_at" ON "deposit_reconciliation_audits" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_deposit_recon_audits_acc_num" ON "deposit_reconciliation_audits" ("account_number");
