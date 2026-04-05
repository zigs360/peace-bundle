# Virtual Account → Wallet Funding Data Flow

## Components

- **Virtual account provisioning**
  - [virtualAccountService.js](file:///c:/Users/7410/peace%20bundle/backend/services/virtualAccountService.js)
  - [dualVirtualAccountService.js](file:///c:/Users/7410/peace%20bundle/backend/services/dualVirtualAccountService.js)
- **Incoming payment processing**
  - Webhooks router: [webhookRoutes.js](file:///c:/Users/7410/peace%20bundle/backend/routes/webhookRoutes.js)
  - Handlers: [webhookController.js](file:///c:/Users/7410/peace%20bundle/backend/controllers/webhookController.js)
- **Wallet ledger**
  - Wallet + transactions: [walletService.js](file:///c:/Users/7410/peace%20bundle/backend/services/walletService.js)
  - Models: [Wallet.js](file:///c:/Users/7410/peace%20bundle/backend/models/Wallet.js), [Transaction.js](file:///c:/Users/7410/peace%20bundle/backend/models/Transaction.js)
- **Real-time updates**
  - Socket service: [notificationRealtimeService.js](file:///c:/Users/7410/peace%20bundle/backend/services/notificationRealtimeService.js)

## End-to-End Flow

### 1) Provision virtual account

1. User is created → wallet auto-created (User model hook).
2. Virtual account is assigned:
   - Primary path: `virtualAccountService.assignVirtualAccount(userId)` stores:
     - `users.virtual_account_number`
     - `users.virtual_account_bank`
     - `users.virtual_account_name`
     - `users.metadata.va_provider`
   - Optional: `dualVirtualAccountService.ensureDualVirtualAccounts(userId)` stores additional accounts under:
     - `users.metadata.dual_virtual_accounts.accounts.{provider}.accountNumber`

### 2) Bank transfer hits provider

- A customer transfers funds to the reserved virtual account number.
- Provider sends a webhook to one of:
  - `POST /api/webhooks/billstack`
  - `POST /api/webhooks/payvessel`
  - `POST /api/webhooks/monnify`
  - `POST /api/webhooks/paystack`

### 3) Webhook verification (signature + raw body)

- The server captures the raw request body for all `/api/webhooks/*` requests via middleware in [server.js](file:///c:/Users/7410/peace%20bundle/backend/server.js).
- Signature checks use the raw bytes when available (prevents false signature mismatches caused by JSON re-serialization).

### 4) Map incoming payment to a user

- BillStack: resolves the user by account number using:
  - `users.virtual_account_number`, OR
  - `users.metadata.dual_virtual_accounts...accountNumber`
- Implemented in `virtualAccountService.findUserByAccountNumber()`.

### 5) Credit wallet atomically (ledger + balance)

- Handler calls `walletService.creditFundingWithFraudChecks()` inside a DB transaction:
  - Creates a `Transaction` credit entry (`source: funding`, `reference: provider reference`)
  - Updates `Wallet.balance`
  - Applies fraud guardrails (mock-BVN caps can mark the credit as `pending_review`)
- Idempotency is enforced by unique transaction `reference` (duplicate webhook deliveries are ignored safely).

### 6) Real-time sync to the UI

- After successful commit, the handler emits:
  - `wallet_balance_updated` to the specific user’s connected sockets with `{ amount, reference, gateway, balance }`
- This enables immediate UI refresh without requiring manual reload/polling.

## Common Failure Modes (and how to detect them)

- **Invalid/missing webhook secret** → webhook rejected.
- **Signature mismatch** (frequently caused by non-raw-body HMAC) → fixed by raw body verification.
- **User not found**:
  - When an account number is stored under `metadata.dual_virtual_accounts` but the webhook lookup only checks `virtual_account_number`.
  - Fixed by `findUserByAccountNumber()` searching both locations.
- **Credit held for review**:
  - `creditFundingWithFraudChecks()` can return `pending_review` (wallet not credited immediately).
- **Duplicate webhook deliveries**:
  - Safe due to unique `reference` enforcement.

## Testing Coverage

- BillStack webhook wallet credit + idempotency:
  - [billstack_webhook.test.js](file:///c:/Users/7410/peace%20bundle/backend/tests/billstack_webhook.test.js)
  - Includes both legacy `virtual_account_number` and dual-metadata mapping scenarios.
