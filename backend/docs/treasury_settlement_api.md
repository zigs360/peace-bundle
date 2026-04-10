# Treasury Settlement API

This backend exposes admin-only endpoints to sync revenue into a treasury balance and withdraw (settle) funds to the fixed BillStack settlement account.

## Authentication
- All endpoints require an **admin JWT**:
  - `Authorization: Bearer <token>`

## Fixed Settlement Routing (Server-Enforced)

Admin settlements are **always routed** to this settlement account, regardless of any client input:
- Account Number: `8035446865`
- Account Name: `MUHAMMAD MUHAMMAD Tier 3`
- Bank Name: `MONIEPOINT`

Bank code is configured via environment:
- `SETTLEMENT_BANK_CODE` (defaults to `50515`)

Transfer fee configuration:
- `SETTLEMENT_TRANSFER_FEE_NGN` (defaults to `50`)

BillStack transfer endpoint configuration:
- `BILLSTACK_BASE_URL` (defaults to `https://api.billstack.co/v2/thirdparty`)
- `BILLSTACK_SECRET_KEY` (required)
- `BILLSTACK_PUBLIC_KEY` (optional)
- `BILLSTACK_DISBURSEMENT_INITIATE_PATH` (defaults to `/disbursement/initiate-transfer`)

## Endpoints

### 1) Get Treasury Balance
`GET /api/admin/treasury/balance`

Response (200):
```json
{
  "success": true,
  "balance": 1250,
  "currency": "NGN",
  "lastSyncAt": "2026-04-10T19:56:35.768Z"
}
```

### 2) Sync Treasury Revenue
`POST /api/admin/treasury/sync`

What it does:
- Computes revenue from:
  - Funding fee revenue: `transactions.metadata.fee_amount` for completed funding credits
  - Data profit: `data_purchase` debit amount minus `data_plans.api_cost`
- Credits treasury and writes a ledger entry (`source = revenue_sync`).

Response (200):
```json
{
  "success": true,
  "ok": true,
  "credited": 100,
  "feeRevenue": 100,
  "dataProfit": 0
}
```

### 3) Withdraw Treasury to Settlement Account (BillStack Transfer)
`POST /api/admin/treasury/withdraw`

Headers:
- Optional idempotency:
  - `Idempotency-Key: <unique-string>`

Body:
```json
{
  "amount": 5000,
  "description": "Settlement payout"
}
```

Behavior:
- Validates amount is positive.
- Computes:
  - `fee = SETTLEMENT_TRANSFER_FEE_NGN` (default 50)
  - `totalDebit = amount + fee`
- Atomically:
  - Locks the treasury balance row
  - Validates treasury balance >= totalDebit
  - Debits treasury balance by totalDebit
  - Creates a ledger entry (`source = settlement_withdrawal`, `status = pending`)
- Initiates BillStack transfer for the **original amount** (not including fee).
- On success:
  - Marks ledger entry `completed` and stores `providerReference`.
- On failure:
  - Credits treasury back (reversal entry) and marks debit entry `failed`.

Success (200):
```json
{
  "success": true,
  "message": "Settlement withdrawal initiated",
  "data": {
    "ok": true,
    "reference": "TRSY-WD-....",
    "providerReference": "BILLSTACK-TRF-....",
    "debited": 5050
  }
}
```

Validation errors:
- 400 `Invalid amount`
- 400 `Insufficient treasury balance`
- 400 `BillStack is not configured for transfers`

Idempotency errors:
- 409 `Withdrawal is already processing`
- 409 `Previous withdrawal attempt failed`

Provider failure:
- 502 `Withdrawal failed`

