# Debug Session: airtime-provider-failure [OPEN]

## Summary
- Symptom: Airtime purchases fail via both Ogdams and SMEPlug in production.
- Observations:
  - Ogdams returns `424 Insufficient balance` (provider-confirmed).
  - SMEPlug fallback returns `400 Unable to purchase Airtime` even though SMEPlug docs show `POST /api/v1/airtime/purchase` should work with `{network_id, phone, amount}`.

## Hypotheses
1. SMEPlug wallet requests are being sent with extra fields (e.g., `mode`, `phone_number`) that the production SMEPlug endpoint rejects.
2. The wrong SMEPlug credential is being used (e.g., API key used instead of the documented private key), causing a generic `400` in this account/environment.
3. The request is sent to the correct endpoint but with incorrect phone normalization or amount constraints.
4. Ogdams is genuinely out of balance; the only viable path is SMEPlug (wallet or device-based), so the remaining blocker is SMEPlug integration correctness.

## Evidence Needed
- The exact SMEPlug payload shape that leaves the server on wallet-mode fallback.
- Which SMEPlug credential source was used for Authorization.

## Plan
1. Add one small instrumentation point to log SMEPlug auth source (without exposing the key).
2. Align SMEPlug wallet airtime request with the documentation payload.
3. Verify via focused tests and then deploy; compare pre-fix vs post-fix logs.
