# Admin Ogdams Data Purchase (SIM-Billed) — API + Admin Guide

This feature enables platform administrators to buy a data bundle for any user, billed against one of the administrator’s own SIMs (SIM system), with server-side reservation, provider initiation, verification polling, and append-only audit events.

## 1) Security Model
- Auth: Admin JWT (`Authorization: Bearer <token>`)
- RBAC: Admin-only routes (middleware `protect` + `admin`)
- Rate limiting: purchase endpoint is limited to 10 requests per minute per IP
- Idempotency: supported via `Idempotency-Key` header (recommended for all purchase requests)
- Sensitive data: SIM phone is returned masked; ICCID is returned as last4 only

## 2) Data Model
- `admin_ogdams_data_purchases`
  - Main mutable purchase record (status, references, timestamps)
- `admin_ogdams_data_purchase_audits`
  - Append-only event log (reserved/provider_requested/completed/failed)

## 3) Provider Mapping Requirements
To be purchasable via this flow, a data plan must have:
- `DataPlan.ogdams_sku` set
- `DataPlan.api_cost` set (used as SIM-billed cost)

## 4) Endpoints

### 4.1 List Admin SIMs (with optional live balance refresh)
`GET /api/admin/ogdams/sims?force_balance=true`

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "provider": "mtn",
      "status": "active",
      "connection_status": "connected",
      "phone": "********678",
      "iccid_last4": "7890",
      "airtime_balance": 1000,
      "reserved_airtime": 0,
      "available_airtime": 1000,
      "last_balance_check": "2026-04-10T20:15:31.919Z"
    }
  ]
}
```

### 4.2 Create Admin Data Purchase (SIM-billed)
`POST /api/admin/ogdams/data-purchase`

Headers:
- `Idempotency-Key: <unique-string>` (recommended)

Body:
```json
{
  "userId": "uuid-of-target-user",
  "recipientPhone": "08012345678",
  "dataPlanId": 12,
  "simId": "uuid-of-admin-sim"
}
```

Success response:
```json
{
  "success": true,
  "data": {
    "reference": "OGD-ADMIN-DATA-...",
    "status": "processing",
    "providerReference": "OGD-REF-1"
  }
}
```

Validation failures:
- 400 `Invalid phone number`
- 400 `SIM balance unavailable`
- 400 `Insufficient SIM balance`
- 400 `Data plan not mapped to Ogdams SKU`
- 429 `Daily cap exceeded`
- 429 `Monthly cap exceeded`

Provider failures:
- 502 `Provider failed`

### 4.3 Get Purchase Status
`GET /api/admin/ogdams/data-purchase/:reference`

Response:
```json
{
  "success": true,
  "data": {
    "reference": "OGD-ADMIN-DATA-...",
    "status": "completed",
    "completedAt": "2026-04-10T20:20:01.122Z"
  }
}
```

## 5) Verification / Polling
After initiation, the backend polls Ogdams transaction status and transitions:
- `reserved → processing → completed`
- `reserved → failed` (provider error / reservation rollback)
- `processing → failed` (verification timeout or provider-reported failure)

Config:
- `OGDAMS_DATA_VERIFY_ENABLED` (default `true`)
- `OGDAMS_DATA_VERIFY_DELAY_MS` (default `8000`)
- `OGDAMS_DATA_VERIFY_MAX_ATTEMPTS` (default `4`)

## 6) Admin User Guide
1. Admin Dashboard → **Admin Data**
2. Search and select a user.
3. Confirm recipient phone (auto-filled from user if available).
4. Select a data plan (ensure SKU is present).
5. Select a SIM and confirm available balance.
6. Submit purchase and watch status update to `completed`.

Troubleshooting:
- “Plan not mapped”: set `ogdams_sku` for that data plan.
- “SIM balance unavailable”: run SIM balance refresh again or check SIM connection status.
- “Insufficient SIM balance”: select a different SIM or top-up that SIM.
- Provider errors: retry with the same `Idempotency-Key`.

