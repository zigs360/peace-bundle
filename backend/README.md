# Peace Bundlle Backend API

The robust, secure, and high-performance backend for the Peace Bundlle VTU and fintech platform.

## 🚀 Features

- **Scalable Architecture**: Built with Node.js, Express, and PostgreSQL (Sequelize).
- **Secure Authentication**: JWT-based auth with two-factor authentication (2FA) support.
- **Robust Wallet System**: Atomic transactions with pessimistic locking to prevent race conditions.
- **Automated VTU Services**: Integration with Smeplug, PayVessel, and Ogdams for automated data and airtime delivery.
- **Virtual Account Provisioning**: Automated virtual bank account assignment via PayVessel.
- **Security First**: Rate limiting, security headers (Helmet), input validation, and audit logging.
- **Real-time Notifications**: Socket.io integration for instant user alerts.
- **Comprehensive Testing**: Full suite of unit and integration tests.

## 🛠️ Tech Stack

- **Runtime**: Node.js v18+
- **Database**: PostgreSQL with Sequelize ORM
- **Cache/Queue**: Redis (optional, for background tasks)
- **Logging**: Winston with centralized audit trails
- **Validation**: Express Validator & Joi

## 📦 Setup & Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd peace-bundle/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Copy `.env.example` to `.env` and fill in the required values.
   ```bash
   cp .env.example .env
   ```

4. **Initialize Database**
   ```bash
   # Create database first, then run sync (auto-migration in dev)
   node server.js
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Run Tests**
   ```bash
   npm test
   ```

## 🔍 API Documentation

The API endpoints are structured under `/api`:
- `/api/auth`: Registration, Login, Profile, KYC
- `/api/wallet`: Funding, Transfers, Balance
- `/api/purchase`: Unified VTU purchase (Airtime/Data)
- `/api/admin`: Management of users, transactions, and SIMs
- `/api/reports`: Admin reporting endpoints (system stats, charts, provider health)

### Airtime Provider Monitoring

- `GET /api/reports/airtime-providers?timeRange=24h|7d|30d`
  - Returns success rates and fallback/switch counts for Ogdams vs Smeplug (admin only).

## ⚙️ Required Environment Variables

- `DATABASE_URL` and `JWT_SECRET` are required at runtime. The server will refuse to start if missing.
- Provider timeouts (optional):
  - `OGDAMS_TIMEOUT_MS` (default: 12000)
  - `SMEPLUG_TIMEOUT_MS` (default: 15000)
- Airtime verification (optional, safety against double-vend on timeouts):
  - `OGDAMS_STATUS_CHECK_ENABLED` (default: true)
  - `OGDAMS_STATUS_PATH` (default: `/transactions`)
  - `AIRTIME_RECONCILE_DELAY_MS` (default: 5000)
  - `AIRTIME_RECONCILE_MAX_ATTEMPTS` (default: 3)

## 🛡️ Security Best Practices

- **Rate Limiting**: Configured globally and specifically for auth routes.
- **Audit Logging**: Every sensitive action (login, debit, credit) is logged with `[AUDIT]` tag.
- **Data Integrity**: All financial operations use database-level transactions.

## 🚀 Deployment

1. **Production Build**
   ```bash
   npm install --production
   ```

2. **Process Management**
   Use PM2 for production process management:
   ```bash
   pm2 start server.js --name peace-bundle-api
   ```

---
© 2026 Peace Bundlle. All rights reserved.
