# [OPEN] Airtime Success Refund

## Session
- Session ID: `airtime-success-refund`
- Started At: 2026-06-25
- Scope: Investigate why airtime can be delivered successfully while the platform still auto-refunds the wallet debit.

## Symptoms
- Actual: User receives airtime, but the platform marks the purchase as failed/refunded and credits the deducted amount back to the wallet.
- Expected: If airtime delivery succeeds, the transaction should remain settled and no refund should be issued.

## Falsifiable Hypotheses
1. The provider response classifier treats a successful airtime vend as non-terminal or failed because it relies on the wrong field or fallback condition.
2. The controller triggers `failAndRefund(...)` after provider completion because the refreshed transaction state is stale or not updated to `completed` in time.
3. The provider returns an ambiguous or partial success payload, and the reconciliation logic incorrectly interprets it as failure before delivery verification completes.
4. The fallback provider path records delivery evidence in `metadata.provider_attempts`, but the final success marker is never persisted to the transaction row.
5. A post-provider exception occurs after successful delivery, and the recovery branch incorrectly assumes the transaction failed and initiates an automatic refund.

## Evidence Plan
- Instrument provider response classification.
- Instrument transaction status transitions around provider success, queueing, failure, and refund.
- Reproduce the false-refund case and compare pre-fix vs post-fix logs.

## Status
- Instrumentation completed.
- Root cause confirmed from runtime evidence.
- Minimal fix implemented and verified locally.

## Evidence
- Pre-fix reproduction:
  - Ogdams returned `status: true`, `httpStatus: 200`, and a provider reference.
  - The system classified that response as `ok: false`.
  - Refund path executed, creating a refunded airtime transaction.
- Pre-fix debug log excerpts:
  - `A`: provider response classified with `status=true`, `httpStatus=200`, `ok=false`
  - `C`: provider failure requested refund after the misclassified Ogdams response
  - `E`: `failAndRefund(...)` executed on the airtime transaction
  - `D`: controller observed the transaction as `refunded`
- Post-fix reproduction:
  - The same Ogdams-style payload is classified as `ok: true`, `successLike: true`.
  - `persistSuccess(...)` runs instead of refund logic.
  - Final transaction state is `completed`, wallet remains debited, no refund is created.

## Root Cause
- Ogdams airtime success classification only accepted `status === 'success'`.
- Real provider responses can also signal success as `status: true` with HTTP `200` and a provider reference.
- That mismatch incorrectly triggered SMEPlug fallback and, if fallback failed, a full wallet refund even though the primary vend had already succeeded.

## Fix
- Normalize Ogdams success-like responses in `dispenseAirtimeWithFallback(...)`.
- Accept boolean success markers and success-like status strings, while still keeping pending and failure handling intact.
- Add a pre-refund delivery-evidence guard so any confirmed successful provider attempt blocks automatic refund and is settled as success instead.
- Persist clearer payment-state metadata for successful airtime settlements.
- Add an audit-and-repair path for historical false refunds caused by this misclassification.

## Verification
- Focused Jest suite passed after the fix.
- Controlled local end-to-end reproduction now returns:
  - HTTP `200`
  - transaction status `completed`
  - wallet `1000 -> 900`
  - no refund reference
- Read-only staging reconciliation probe found `12` refunded airtime transactions matching the false-refund signature (Ogdams success-like attempt plus automatic refund).

## Next Step
- Await user confirmation to decide whether to keep or clean up the temporary debugging instrumentation and repro artifacts.
