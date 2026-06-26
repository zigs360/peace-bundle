# Debug Session: smeplug-ok-no-reference

- Status: OPEN
- Started: 2026-06-16
- Symptom:
  - Backend logs show SMEPlug responses with `ok:true` but `hasReference:false`
  - Frontend shows "success/completed" and wallet is not refunded
- Expected:
  - If provider response does not confirm a vend reference, transaction must not be marked `completed`
  - Wallet should be refunded (or transaction queued for reconciliation only when provider state is truly uncertain)

