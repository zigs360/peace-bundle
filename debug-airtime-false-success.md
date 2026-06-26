# Debug Session: airtime-false-success

- Status: OPEN
- Started: 2026-06-16
- Symptom:
  - Backend logs show SMEPlug airtime purchase fails (HTTP 400 / unable to purchase)
  - UI shows "Purchase Successful", marks transaction `completed`, and wallet balance decreases
  - User reports recipient did not receive airtime
- Expected:
  - If provider fails, transaction must not be marked `completed`
  - Wallet should be refunded (or transaction queued for reconciliation only when provider state is uncertain)

