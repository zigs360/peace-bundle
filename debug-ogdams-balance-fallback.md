# Debug Session: ogdams-balance-fallback [OPEN]

## Summary
- Symptom: Ogdams airtime request returns `424 Insufficient balance`, then the platform falls back to SMEPlug, which also fails.
- Expected: Confirm whether Ogdams insufficient balance should stop immediately, queue, or fall back to another provider.

## Initial Evidence
- Pre-fix log shows Ogdams airtime request reference `OGD|1|714256|20260611150941`
- Ogdams response: `424` with `msg: "Insufficient balance"`
- Platform then logs: `Falling back to SMEPlug after Ogdams failure`
- SMEPlug response then fails with `400 Unable to purchase Airtime`

## Hypotheses
1. The airtime fallback policy is too broad and treats Ogdams `Insufficient balance` as a generic recoverable provider error.
2. The code does not classify provider-confirmed balance errors as terminal, so it unnecessarily triggers SMEPlug fallback.
3. The platform should return a direct wallet/provider-balance failure to the user instead of attempting another provider after a confirmed Ogdams balance rejection.
4. The current fallback branch may be correct only for network/timeout/duplicate-reference cases, but not for confirmed business-rule failures like insufficient provider balance.

## Plan
1. Inspect airtime fallback classification in `dataPurchaseService`.
2. Confirm which error shapes from `ogdamsService` reach the fallback decision.
3. Add minimal instrumentation if existing logs are insufficient.
4. Apply the smallest fix that prevents the wrong fallback path.
5. Verify with focused tests and compare pre-fix vs post-fix behavior.

## Findings
- Confirmed Hypothesis 1: `424 Insufficient balance` was reaching the generic `ogdams_confirmed_failure` branch.
- Confirmed Hypothesis 2: the fallback policy was too broad and allowed SMEPlug fallback after a provider-confirmed Ogdams balance rejection.
- Confirmed Hypothesis 3: `ogdamsService.purchaseAirtime()` did not previously classify insufficient balance with a dedicated error code.
- Rejected Hypothesis 4 only partially: the fallback design is still valid for uncertain/network conditions, but not for confirmed provider balance failures.

## Requirement Update
- The debugging goal changed mid-session: the desired behavior is now managed failover to SMEPlug when Ogdams is insufficient or unavailable, not immediate refund-only behavior.

## Changes Applied
- Added temporary classification logging in `dataPurchaseService` around the Ogdams failure decision.
- Classified Ogdams `424 Insufficient balance` as `OGDAMS_INSUFFICIENT_BALANCE` in `ogdamsService`.
- Added `ogdamsFailoverService` to maintain failover state, optional health probing, admin alerts, and automatic recovery.
- Changed `dataPurchaseService` so:
  - `OGDAMS_INSUFFICIENT_BALANCE` opens failover and attempts SMEPlug
  - explicit Ogdams unavailability opens failover and attempts SMEPlug
  - active failover bypasses Ogdams and routes new airtime requests to SMEPlug until recovery
  - successful Ogdams requests clear failover
- Added focused regression test `backend/tests/airtime_ogdams_balance_fallback.test.js`.

## Verification
- Post-fix focused tests passed:
  - `tests/airtime_ogdams_balance_fallback.test.js`
  - `tests/ogdams_airtime_payload_validation.test.js`
- Expected post-fix runtime behavior:
  - Ogdams returns `424 Insufficient balance` or explicit availability failure
  - Platform opens Ogdams failover state and alerts admins
  - Airtime request falls back to SMEPlug
  - Subsequent airtime requests bypass Ogdams while failover remains active
  - A healthy Ogdams success clears failover and restores primary routing
