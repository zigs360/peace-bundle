# Database Connectivity Runbook

## Purpose

This runbook covers how to diagnose communication failures between the backend runtime and the database layer in production and during deployments.

## Health Endpoints

- `GET /api/health`
  - Performs a live database query check.
  - Returns runtime pool configuration, recent query metrics, and the last observed DB error.
  - Add `?schema=true` to include transaction-integrity schema compatibility checks.

- `GET /api/ready`
  - Lightweight readiness check for load balancers and deploy health probes.
  - Returns `200` when the database query path is healthy and `503` when not ready.

## Recommended Environment Variables

- `NODE_ENV=production`
- `DB_SYNC=none`
- `DB_RUNTIME_SCHEMA_ENSURE=false`
- `DB_POOL_MAX=5`
- `DB_POOL_MIN=0`
- `DB_POOL_ACQUIRE_MS=30000`
- `DB_POOL_IDLE_MS=10000`
- `DB_POOL_EVICT_MS=1000`
- `DB_CONNECT_TIMEOUT_MS=60000`
- `DB_STATEMENT_TIMEOUT_MS=15000`
- `DB_QUERY_TIMEOUT_MS=15000`
- `DB_SLOW_QUERY_MS=1500`
- `DB_APPLICATION_NAME=peace-bundle-backend`
- `DB_HEALTH_MONITOR_ENABLED=true`
- `DB_HEALTH_MONITOR_INTERVAL_MS=60000`
- `DB_LOGGING=false`

## Deploy Sequence

1. Apply SQL migrations before starting the API service.
2. Deploy the backend with `DB_SYNC=none`.
3. Verify `GET /api/ready` returns `200`.
4. Verify `GET /api/health?schema=true` shows no missing required transaction columns.

## Common Failure Modes

### Authentication failure

Symptoms:
- `CRITICAL: Authentication failed during connectDB sequence`

Checks:
- Verify `DATABASE_URL`
- Confirm database username/password are valid
- Confirm the database is accepting connections from the Render service

### Network reachability failure

Symptoms:
- connect timeout
- socket hang up
- no route to host

Checks:
- Confirm the backend and Postgres service are in the same Render region when possible
- Confirm the host in `DATABASE_URL` is the expected internal Render hostname
- Check Render service networking and database status

### Schema mismatch

Symptoms:
- `column "... " does not exist`
- boot succeeds but requests fail on specific query paths

Checks:
- Run pending migrations
- Call `GET /api/health?schema=true`
- Confirm required transaction-integrity columns exist on `transactions`

### Pool exhaustion or slow queries

Symptoms:
- rising latency
- request timeouts
- queries waiting on pool acquisition

Checks:
- Inspect `/api/health`
- Review `pool.waiting`, `pool.using`, `metrics.slowQueryCount`, and `lastError`
- Increase pool size only after confirming query efficiency and DB capacity

## Monitoring Guidance

- Point uptime/health checks to `GET /api/ready`
- Point operational diagnostics to `GET /api/health`
- Alert on:
  - readiness failures
  - health failures
  - increasing `slowQueryCount`
  - repeated `healthFailureCount`

## Render Notes

- Do not depend on runtime schema mutation during boot.
- Keep schema changes in SQL migrations.
- Keep server startup focused on connectivity and request handling only.
