# Debug Session: airtime-502-fallback [OPEN]

## Summary
- Symptom: `POST /api/transactions/airtime` returns `502` in production after Ogdams fails with `424 Insufficient balance`.
- Observed: failover opens and SMEPlug fallback starts, but the final SMEPlug outcome is not consistently visible in logs.
- Also observed earlier: slow DB SELECT warnings around airtime requests.

## Hypotheses
1. The fallback is timing out at the reverse proxy because SIM selection (`getOptimalSim`) is doing a slow DB query, so the request never reaches/finishes the SMEPlug call.
2. SMEPlug wallet call is being made but fails; missing logs are due to log level filtering (info logs not emitted in production).
3. SMEPlug credentials used by the server differ from the key that works in your curl docs, causing provider rejection.
4. Even when both providers fail correctly, the API returns a generic 502; we need to return a clearer error and still keep wallet safety.

## Evidence Needed
- Duration of the SIM selection query inside the fallback.
- Whether the wallet call is executed, and its status/error.
- Which SMEPlug auth source is used (private/secret/api key), without exposing secrets.

## Next Step
- Deploy this instrumentation build and retry one airtime purchase; then share the new `[Airtime][Debug]` / `[Smeplug][Debug]` warn lines.
