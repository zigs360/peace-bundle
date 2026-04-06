# OGdams Airtime Purchase Test Plan

## Scope

Validates the airtime purchase pipeline where the platform debits the user wallet and vends airtime via OGdams (primary) with reconciliation behavior for uncertain provider outcomes.

Primary endpoint under test:

- `POST /api/transactions/airtime`

## Success Criteria

- Returns `200` on successful vend (or `200` with queued status for uncertain provider state).
- Returns `400/403` for client-side and policy failures (invalid payload, insufficient balance, limits).
- Debits wallet exactly once per unique request reference/idempotency key.
- Creates a `Transaction` row with a unique `reference`, correct `balance_before/balance_after`, and provider metadata.
- Persists provider responses into `Transaction.smeplug_response` and/or `Transaction.metadata.provider_attempts`.
- Reconciliation checks: `Wallet.balance` matches the last successful `Transaction.balance_after`.

## Automated API Tests

Test suite:

- [ogdams_airtime_api.test.js](file:///c:/Users/7410/peace%20bundle/backend/tests/ogdams_airtime_api.test.js)

Report artifact (generated per run):

- `backend/test_reports/ogdams_airtime_api_report_<timestamp>.json`

### Covered Cases

- Positive flow: successful OGdams vend (expects `200`).
- Negative: insufficient wallet balance (expects `400`).
- Negative: invalid phone number (expects `400`).
- Negative: provider timeout (expects `200` with queued state; no double-vend).
- Edge: minimum amount (50).
- Edge: maximum amount (env `AIRTIME_MAX_NGN`, default 100000).
- Edge: duplicate request using `Idempotency-Key` (expects idempotent replay; no second debit).
- Security: rejects injection-like `network/reference` payloads (expects `400`).
- Reconciliation: wallet balance matches `Transaction.balance_after`.
- Performance: small concurrent load measurement (records durations + p95).

## Live Delivery Evidence (Manual)

Automated tests mock OGdams responses and verify that the platform stores provider responses as “delivery evidence”.
For real-world delivery confirmation, run these steps in a controlled environment:

1. Use a dedicated test SIM and number you own.
2. Call `POST /api/transactions/airtime` with a known `Idempotency-Key`.
3. Confirm:
   - The target phone receives airtime (device/network confirmation SMS).
   - The platform `Transaction.reference` is logged in OGdams dashboard and/or OGdams status endpoint (if enabled).
4. Capture evidence:
   - Screenshot of airtime credit confirmation (SMS or USSD balance inquiry).
   - Server logs for `[Airtime] Provider success` / `[Airtime] Provider success after verify`.
   - The transaction row exported from the admin transactions page.

## Performance Testing

- Automated suite includes a small concurrent-load test (10 parallel requests) to measure response times.
- For peak-load testing, run a dedicated load tool (k6/Artillery) against a staging environment with:
  - Real database
  - OGdams mocked or a provider sandbox
  - Rate limits configured to safe values

## Reconciliation Testing

- Compare:
  - `Wallet.balance`
  - Most recent airtime `Transaction.balance_after`
  - Sum/delta of created airtime transactions for the test user

Any mismatch indicates a wallet mutation outside the ledger or a failed DB transaction.

