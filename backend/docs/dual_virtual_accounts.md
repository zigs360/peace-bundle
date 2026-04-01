# Dual Virtual Account Retrieval (BillStack + PayVessel)

## Endpoint

`POST /api/users/virtual-accounts/dual`

Requires `Authorization: Bearer <JWT>`.

This endpoint orchestrates retrieval/creation of a dedicated virtual account from both BillStack and PayVessel in one operation and returns a unified response. Calls are executed concurrently with a strict timeout per provider request.

`GET /api/users/virtual-accounts/dual`

Requires `Authorization: Bearer <JWT>`.

Read-only snapshot. Returns whatever is currently stored in the user metadata without triggering any provider calls or creating new accounts.

## Request Body (Optional)

```json
{
  "timeoutMs": 10000,
  "retry": { "retries": 2, "baseDelayMs": 400, "maxDelayMs": 2500 }
}
```

Notes:
- `timeoutMs` is capped at `10000` and floored at `500`.
- Retry values are clamped for safety.

## Response Shape

```json
{
  "success": true,
  "overallStatus": "ok",
  "operationId": "uuid-or-random-id",
  "results": {
    "billstack": {
      "provider": "billstack",
      "status": "ok",
      "account": {
        "bankName": "PALMPAY",
        "accountName": "Alias-User",
        "accountNumberMasked": "******0575",
        "last4": "0575"
      },
      "reference": "R-XXXXXXXXXXX"
    },
    "payvessel": {
      "provider": "payvessel",
      "status": "ok",
      "account": {
        "bankName": "Palmpay",
        "accountName": "USER NAME",
        "accountNumberMasked": "******8942",
        "last4": "8942"
      },
      "reference": "tracking-reference"
    }
  }
}
```

Possible provider statuses:
- `ok`: account data returned (masked)
- `pending`: a prior in-flight attempt exists; no duplicate creation is triggered
- `error`: provider failed (timeout, transient, or provider error)

If both providers fail, the endpoint returns HTTP `502` with `overallStatus: "failed"`.

## cURL Example

```bash
curl -X POST "https://your-domain.com/api/users/virtual-accounts/dual" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"timeoutMs":10000,"retry":{"retries":2,"baseDelayMs":400,"maxDelayMs":2500}}'
```

```bash
curl -X GET "https://your-domain.com/api/users/virtual-accounts/dual" \
  -H "Authorization: Bearer <JWT>"
```

## Provider Configuration

Set environment variables securely (do not hardcode secrets):

BillStack:
- `BILLSTACK_SECRET_KEY`
- `BILLSTACK_PUBLIC_KEY`
- `BILLSTACK_BASE_URL` (default: `https://api.billstack.co/v2/thirdparty`)

PayVessel:
- `PAYVESSEL_API_KEY`
- `PAYVESSEL_SECRET_KEY`
- `PAYVESSEL_BUSINESS_ID`
- `PAYVESSEL_BASE_URL` (default in code)

## Webhooks

Configure provider webhooks to point to the backend:

- BillStack: `POST /api/webhooks/billstack`
- PayVessel: `POST /api/webhooks/payvessel`
- Paystack: `POST /api/webhooks/paystack`
- Monnify: `POST /api/webhooks/monnify`

For BillStack, set `BILLSTACK_WEBHOOK_SECRET` and configure BillStack to sign webhook payloads. In production the BillStack webhook is rejected if the secret is not configured.

## Recovery & Monitoring

- User retry (manual recovery): `POST /api/users/virtual-account/request`
- Admin retry (per user): `POST /api/admin/users/:id/virtual-account/retry`
- Admin readiness check: `GET /api/admin/virtual-accounts/health`

When provisioning fails, the system records provisioning state in `user.metadata` and creates an in-app notification so users understand the next step (retry, complete KYC, or contact support).

## PCI-DSS / Security Notes

- The API returns masked account numbers by default.
- Avoid logging raw account numbers or secrets. Server logs record audit events without exposing sensitive values.
- All calls must be made over HTTPS/TLS.
- Store provider credentials only in environment/secret storage (Render/Cloud secrets), never in the repository.
