# Debug Session: smeplug-wallet-502 [OPEN]

## Summary
- Symptom: `POST /api/transactions/airtime` returns `502 Bad Gateway` after Ogdams failover triggers SMEPlug fallback.
- Pre-fix evidence shows:
  - Ogdams fails with `OGDAMS_INSUFFICIENT_BALANCE`
  - Failover opens successfully
  - SMEPlug fallback is attempted
  - SMEPlug returns `400 {"status":false,"msg":"Unable to purchase Airtime"}`
  - Slow DB warnings appear around the same timeframe

## Initial Evidence
- Frontend error: `POST https://www.peacebundlle.com/api/transactions/airtime 502 (Bad Gateway)`
- Backend log: `[Airtime] Falling back to SMEPlug after Ogdams failure`
- Backend log: `Smeplug API Error {"endpoint":"/api/v1/airtime/purchase","error":"Request failed with status code 400","response":{"status":false,"msg":"Unable to purchase Airtime"},"status":400}`
- Backend log: `[DB] Slow query detected (10075ms)` and `(10175ms)`

## Hypotheses
1. The SMEPlug wallet fallback payload shape is still wrong for the provider, so SMEPlug rejects it with a generic `400 Unable to purchase Airtime`.
2. The fallback is correctly switching away from Ogdams, but SMEPlug wallet capacity or account state is insufficient, and the provider returns only a generic error.
3. The fallback path is selecting the right provider but missing a critical mode/reference/header field that SMEPlug requires in production.
4. The slow DB query is increasing request latency but is not the root cause of the `400`; it is a secondary effect that needs separate confirmation.

## Plan
1. Add instrumentation around SMEPlug fallback request construction and provider error metadata.
2. Reproduce or inspect post-instrumentation logs to determine whether this is payload, auth/account-state, or provider-capacity related.
3. Apply the minimal fix only after the instrumentation confirms the actual cause.
4. Verify with focused tests and compare pre-fix vs post-fix logs.

## Findings So Far
- Confirmed: the failure is on the SMEPlug fallback leg, not on the Ogdams failover trigger.
- Confirmed: the current production logs are still pre-instrumentation logs, so the new debug fields are not live yet.
- Strong static signal: local verification notes reference SMEPlug airtime as `POST /api/v1/vtu`, while the fallback client was using only `POST /api/v1/airtime/purchase`.
- Likely conclusion: the SMEPlug wallet fallback may be using the wrong endpoint for this production account/version, causing the generic `400 Unable to purchase Airtime`.

## Changes Applied
- Added instrumentation in `dataPurchaseService` around SMEPlug fallback selection and wallet fallback request.
- Added instrumentation in `smeplugService` around outbound request context.
- Changed `smeplugService.purchaseVTU()` to:
  - try `/api/v1/vtu` first
  - fall back to `/api/v1/airtime/purchase` only when the first call fails without a provider reference
- Added focused regression test `backend/tests/smeplug_vtu_endpoint_fallback.test.js`.

## Verification
- Focused tests passed:
  - `tests/smeplug_vtu_endpoint_fallback.test.js`
  - `tests/airtime_ogdams_balance_fallback.test.js`
  - `tests/ogdams_airtime_payload_validation.test.js`

## Current Status
- The fix is local only at this point.
- To get post-fix runtime evidence, the updated backend needs to be deployed and one airtime retry needs to be reproduced.
