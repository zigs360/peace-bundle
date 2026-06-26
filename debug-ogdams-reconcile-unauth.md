# Debug Session: ogdams-reconcile-unauth

- Status: OPEN
- Started: 2026-06-16
- Symptom:
  - Airtime vend can return `202 Accepted` / pending and gets queued
  - Reconcile status check later fails with `Unauthenticated.`
- Expected:
  - Reconcile status check should authenticate correctly and update queued transactions to completed/failed
- Suspected area:
  - `ogdamsService.requestWithAuthFallback` retry decision (`shouldRetryAuth`) and auth style fallback for status checks

