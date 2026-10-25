-- ============================================================================
-- SQL REMEDIATION SCRIPT FOR INCIDENT REFUND REFERENCES
-- Target References:
--   1. 'RFND-56EB282CC7824CF7927A04E2'
--   2. 'RFND-EA4CB49A3B914056F6A11383'
--
-- This script executes inside a strict ACID transaction block.
-- It locks the target user's wallet (SELECT ... FOR UPDATE), credits the wallet,
-- writes the ledger entry, updates the original transaction, and logs an audit trail.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    rec RECORD;
    v_user RECORD;
    v_wallet RECORD;
    v_existing_credit RECORD;
    v_refund_txn_id UUID;
    v_balance_before NUMERIC(15, 2);
    v_balance_after NUMERIC(15, 2);
    v_target_refs TEXT[] := ARRAY['RFND-56EB282CC7824CF7927A04E2', 'RFND-EA4CB49A3B914056F6A11383'];
    v_ref TEXT;
BEGIN
    FOREACH v_ref IN ARRAY v_target_refs
    LOOP
        RAISE NOTICE '--- Processing incident refund reference: % ---', v_ref;

        -- 1. Locate the original transaction associated with this refund reference
        SELECT * INTO rec
        FROM "transactions"
        WHERE "refund_reference" = v_ref
           OR "reference" = v_ref
           OR "metadata"->>'refund_reference' = v_ref
           OR "metadata"->'integrity'->'refund'->>'refundReference' = v_ref
        LIMIT 1;

        IF rec.id IS NULL THEN
            RAISE NOTICE 'Skipping %: No original transaction found matching this refund reference.', v_ref;
            CONTINUE;
        END IF;

        -- 2. Check if a credit transaction for this refund reference already exists in the ledger (Idempotency)
        SELECT * INTO v_existing_credit
        FROM "transactions"
        WHERE "reference" = v_ref
          AND "type" = 'credit'
          AND "source" = 'refund'
        LIMIT 1;

        IF v_existing_credit.id IS NOT NULL THEN
            RAISE NOTICE 'Idempotency guard: % has already been credited in transaction % (Amount: %)', 
                v_ref, v_existing_credit.id, v_existing_credit.amount;
            CONTINUE;
        END IF;

        -- 3. Lock user wallet row for update
        SELECT * INTO v_wallet
        FROM "Wallets"
        WHERE "userId" = rec."userId"
        FOR UPDATE;

        IF v_wallet.id IS NULL THEN
            RAISE EXCEPTION 'Wallet not found for userId %', rec."userId";
        END IF;

        v_balance_before := v_wallet.balance;
        v_balance_after := v_balance_before + rec.amount;

        -- 4. Atomically increment wallet balance
        UPDATE "Wallets"
        SET "balance" = v_balance_after,
            "updatedAt" = NOW()
        WHERE "id" = v_wallet.id;

        -- 5. Create credit transaction record in the ledger
        v_refund_txn_id := gen_random_uuid();
        INSERT INTO "transactions" (
            "id",
            "walletId",
            "userId",
            "type",
            "amount",
            "wallet_balance_before",
            "wallet_balance_after",
            "source",
            "reference",
            "description",
            "metadata",
            "status",
            "completed_at",
            "createdAt",
            "updatedAt"
        ) VALUES (
            v_refund_txn_id,
            v_wallet.id,
            rec."userId",
            'credit',
            rec.amount,
            v_balance_before,
            v_balance_after,
            'refund',
            v_ref,
            'Manual remediation refund: ' || v_ref,
            jsonb_build_object(
                'reconciled_manually', true,
                'reconciliation_type', 'incident_manual_sql_fix',
                'original_transaction_id', rec.id,
                'original_transaction_reference', rec.reference,
                'remediated_at', NOW()
            ),
            'completed',
            NOW(),
            NOW(),
            NOW()
        );

        -- 6. Update original transaction status to 'refunded'
        UPDATE "transactions"
        SET "status" = 'refunded',
            "refund_reference" = v_ref,
            "updatedAt" = NOW()
        WHERE "id" = rec.id;

        -- 7. Insert immutable audit trail in deposit_reconciliation_audits
        INSERT INTO "deposit_reconciliation_audits" (
            "id",
            "transaction_reference",
            "user_id",
            "wallet_id",
            "transaction_id",
            "amount",
            "gateway_provider",
            "reconciliation_type",
            "status",
            "is_reconciled",
            "wallet_balance_before",
            "wallet_balance_after",
            "metadata",
            "timestamp_credited",
            "createdAt",
            "updatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_ref,
            rec."userId",
            v_wallet.id,
            v_refund_txn_id,
            rec.amount,
            COALESCE(rec.provider::text, 'wallet_refund'),
            'manual_admin_trigger',
            'settled',
            true,
            v_balance_before,
            v_balance_after,
            jsonb_build_object(
                'reconciled_manually', true,
                'original_transaction_reference', rec.reference,
                'note', 'Emergency SQL remediation for incident refunds'
            ),
            NOW(),
            NOW(),
            NOW()
        );

        RAISE NOTICE 'SUCCESS: Reconciled and credited % to user % (Wallet balance: % -> %)',
            rec.amount, rec."userId", v_balance_before, v_balance_after;

    END LOOP;
END $$;

COMMIT;
