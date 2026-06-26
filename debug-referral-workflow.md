# [OPEN] Referral Workflow

## Session
- Session ID: `referral-workflow`
- Started At: 2026-06-26
- Scope: End-to-end verification of referral link generation, sharing, click/sign-up attribution, reward application, and admin visibility.

## Symptoms / Goal
- Goal: Determine whether the referral system is fully operational across referrer, referred user, and admin flows.
- Expected: Unique referral links are generated, visits/sign-ups are attributed correctly, rewards are applied correctly, and all referral activity is recorded accurately in the database and admin views.

## Falsifiable Hypotheses
1. Referral links are generated inconsistently or without a stable referral code, so inbound visits/sign-ups cannot always be attributed.
2. Referral click or sign-up attribution is partially implemented in the frontend but not persisted correctly in backend records.
3. Referral rewards are only credited for one side of the flow, or reward conditions are incomplete, causing missing commissions/bonuses.
4. Referral activity appears in user-facing/profile views but is incomplete or inconsistent in admin analytics/reporting.
5. The referral flow works for direct registration but fails when auth/session/cookie behavior changes during navigation from a shared referral link.

## Evidence Plan
- Trace referral code generation and link consumption.
- Instrument backend referral capture, registration attribution, reward settlement, and admin analytics reads.
- Reproduce flows with referrer, new referred user, and admin verification.
- Compare pre-fix vs post-fix evidence if any defects are confirmed and fixed.

## Status
- Instrumentation completed.
- Root causes confirmed from runtime evidence.
- Minimal fixes implemented and verified locally.

## Evidence
- Pre-fix runtime evidence from [trae-debug-log-referral-workflow.ndjson](file:///c:/Users/user/.trae/worktrees/peace-bundle/.dbg/trae-debug-log-referral-workflow.ndjson):
  - Registration accepted a valid referral code and stored `users.referred_by`.
  - `trackReferral(...)` credited the signup bonus.
  - No `Referral` row existed afterward, so funding commission processing logged `No Referral row found for referred user`.
  - Referrer-facing stats returned `referredUsersCount=0` and `totalEarnings=0`.
  - Admin analytics returned `totalReferrals=1`.
- Post-fix runtime evidence:
  - `trackReferral(...)` now logs `stored referral record`.
  - Funding commission logs `Funding commission paid`.
  - Referrer-facing stats now return `referredUsersCount=1`, `totalEarnings=125`, and recent referral data.
  - Admin analytics remains aligned with the same referral count.

## Root Causes
1. Shared `?ref=` links were not consumed by the registration page, so referral links behaved like manual codes only.
2. Referral registration only set `users.referred_by` and credited a bonus; it never created a `Referral` record.
3. Funding commissions depended on `Referral` records, so they were silently skipped.
4. `affiliateService.processFundingCommission(...)` called a missing `updateReferralStats(...)` method.
5. `affiliateService.processTransactionCommission(...)` created invalid commission records (`type`, missing required fields), risking silent failures.
6. User-facing affiliate stats only read `commission_balance`, so signup bonus earnings were omitted.

## Fix
- Created/stored `Referral` records during `trackReferral(...)`.
- Added `updateReferralStats(...)` and corrected funding/transaction commission record creation.
- Updated user-facing affiliate stats to include both bonus and commission earnings plus pending payout.
- Added `?ref=` link capture and persistence on the registration page.

## Verification
- Controlled end-to-end reproduction now confirms:
  - shared referral code registration attribution
  - signup bonus credit
  - `Referral` DB row creation
  - funding commission payout
  - consistent user/admin referral analytics
- Added backend and frontend regression tests for the fixed workflow.

## Residual Gaps
- Backend referral-click tracking is still not implemented as a persisted server-side event stream.
- There is still no explicit referee-side reward beyond successful attribution; only referrer rewards are currently implemented.
