# Debug Session: airtime-refund-mismatch [OPEN]

## Summary
- Symptom: Airtime purchase fails; UI/API reports “refunded”, but user wallet balance does not increase back.

## Hypotheses (Falsifiable)
1. The wallet debit is committed, but the refund credit is not committed (transaction boundary mismatch).
2. The refund marks `Transaction.status = refunded` but does not actually create/apply a `WalletTransaction` credit entry.
3. The refund credit is written, but wallet balance shown to the user is stale/cached or derived from a different wallet row/field.
4. The refund path throws after marking the transaction refunded, causing the credit to roll back while the status update persists.
5. Duplicate/idempotency logic prevents a second credit even though the debit happened (ledger mismatch).

## Evidence Needed
- For a single airtime reference: debit ledger entry, credit ledger entry (if any), wallet balance_before/balance_after transitions, DB transaction commit/rollback outcomes.

## Plan
1. Instrument wallet debit + refund credit + transaction status updates with a correlation id (transaction reference).
2. Reproduce one failing airtime purchase.
3. Compare pre/post balances and ledger rows for that reference.
4. Apply minimal fix based on evidence, then verify again.

