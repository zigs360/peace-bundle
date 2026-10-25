const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction, WebhookEvent, DepositReconciliationAudit } = require('../models');
const depositReconciliationEngine = require('../services/depositReconciliationEngine');
const notificationRealtimeService = require('../services/notificationRealtimeService');

describe('Enterprise Transaction Reconciliation & Synchronization Engine', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_reconciliation_secret_12345';
    jest.spyOn(notificationRealtimeService, 'sendToUser').mockResolvedValue({});
    jest.spyOn(notificationRealtimeService, 'emitToUser').mockImplementation(() => {});
  });

  const createAuthToken = (user) => {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
  };

  describe('Multi-Strategy User Resolution', () => {
    it('resolves user via Primary NUBAN, Secondary Dual Virtual Accounts, Email, Phone, and Merchant Ref', async () => {
      const primaryAcc = `99${Math.floor(10000000 + Math.random() * 90000000)}`;
      const secondaryAcc = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
      const userEmail = `recon_user_${Date.now()}@testdomain.com`;
      const userPhone = `0803${Math.floor(1000000 + Math.random() * 9000000)}`;

      const testUser = await User.create({
        name: 'Resolution Test User',
        email: userEmail,
        phone: userPhone,
        password: 'Password123!',
        virtual_account_number: primaryAcc,
        metadata: {
          dual_virtual_accounts: {
            accounts: {
              '9psb': { accountNumber: secondaryAcc, bankName: '9PSB' }
            }
          }
        }
      });

      // 1. By primary NUBAN
      const res1 = await depositReconciliationEngine.resolveUser({ accountNumber: primaryAcc });
      expect(res1.user).toBeTruthy();
      expect(res1.user.id).toBe(testUser.id);
      expect(res1.strategy).toBe('virtual_account_number');

      // 2. By secondary dual NUBAN
      const res2 = await depositReconciliationEngine.resolveUser({ accountNumber: secondaryAcc });
      expect(res2.user).toBeTruthy();
      expect(res2.user.id).toBe(testUser.id);
      expect(res2.strategy).toBe('virtual_account_number');

      // 3. By Email (case-insensitive)
      const res3 = await depositReconciliationEngine.resolveUser({ email: userEmail.toUpperCase() });
      expect(res3.user).toBeTruthy();
      expect(res3.user.id).toBe(testUser.id);
      expect(res3.strategy).toBe('customer_email');

      // 4. By Phone (with international prefix normalization)
      const res4 = await depositReconciliationEngine.resolveUser({ phone: `+234${userPhone.slice(1)}` });
      expect(res4.user).toBeTruthy();
      expect(res4.user.id).toBe(testUser.id);
      expect(res4.strategy).toBe('customer_phone');

      // 5. By Merchant Reference
      const res5 = await depositReconciliationEngine.resolveUser({ merchantReference: `PB-${testUser.id}` });
      expect(res5.user).toBeTruthy();
      expect(res5.user.id).toBe(testUser.id);
      expect(res5.strategy).toBe('merchant_reference_id');
    });
  });

  describe('Dry-Run Execution Safety', () => {
    it('simulates recovery and projects balance without modifying database state in dry-run mode', async () => {
      const accNum = `91${Math.floor(10000000 + Math.random() * 90000000)}`;
      const testUser = await User.create({
        name: 'DryRun Test User',
        email: `dryrun_${Date.now()}@testdomain.com`,
        phone: `0802${Math.floor(1000000 + Math.random() * 9000000)}`,
        password: 'Password123!',
        virtual_account_number: accNum
      });

      const wallet = await Wallet.findOne({ where: { userId: testUser.id } });
      const initialBalance = parseFloat(wallet.balance || 0);

      const ref = `DRY-RUN-REF-${Date.now()}`;
      const amount = 5000;

      const event = await WebhookEvent.create({
        provider: 'payvessel',
        status: 'failed',
        reference: ref,
        amount,
        payload: {
          reference: ref,
          amount,
          account_number: accNum
        }
      });

      // Execute dry-run reconciliation
      const result = await depositReconciliationEngine.reconcileSingleDeposit(event, {
        dryRun: true,
        reconciliationType: 'historical_dry_run'
      });

      expect(result.ok).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.status).toBe('dry_run_matched');
      expect(result.amount).toBe(amount);
      expect(result.walletBalanceBefore).toBe(initialBalance);
      expect(result.walletBalanceAfter).toBe(initialBalance + amount);

      // Verify DB was NOT mutated
      const reloadedWallet = await Wallet.findOne({ where: { userId: testUser.id } });
      expect(parseFloat(reloadedWallet.balance)).toBe(initialBalance);

      const createdTxn = await Transaction.findOne({ where: { reference: ref } });
      expect(createdTxn).toBeNull();

      const createdAudit = await DepositReconciliationAudit.findOne({ where: { transactionReference: ref } });
      expect(createdAudit).toBeNull();

      // Webhook event should still be failed
      await event.reload();
      expect(event.status).toBe('failed');
    });
  });

  describe('Live Settlement & Strict Idempotency Guard', () => {
    it('atomically credits wallet, writes immutable audit record, and prevents double crediting', async () => {
      const accNum = `92${Math.floor(10000000 + Math.random() * 90000000)}`;
      const testUser = await User.create({
        name: 'Live Settlement User',
        email: `live_settle_${Date.now()}@testdomain.com`,
        phone: `0809${Math.floor(1000000 + Math.random() * 9000000)}`,
        password: 'Password123!',
        virtual_account_number: accNum
      });

      const wallet = await Wallet.findOne({ where: { userId: testUser.id } });
      const initialBalance = parseFloat(wallet.balance || 0);

      const ref = `LIVE-SETTLE-REF-${Date.now()}`;
      const amount = 15000;

      const event = await WebhookEvent.create({
        provider: 'billstack',
        status: 'received',
        reference: ref,
        amount,
        payload: {
          data: {
            reference: ref,
            amount,
            account_number: accNum
          }
        }
      });

      // First run: Live crediting
      const liveResult = await depositReconciliationEngine.reconcileSingleDeposit(event, {
        dryRun: false,
        reconciliationType: 'historical_batch',
        operator: 'test_runner'
      });

      expect(liveResult.ok).toBe(true);
      expect(liveResult.status).toBe('settled');
      expect(liveResult.balanceAfter).toBe(initialBalance + amount);

      // Verify wallet balance incremented
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + amount);

      // Verify Transaction record exists
      const txn = await Transaction.findOne({ where: { reference: ref } });
      expect(txn).toBeTruthy();
      expect(parseFloat(txn.amount)).toBe(amount);
      expect(txn.metadata.reconciled_by).toBe('deposit_reconciliation_engine');

      // Verify DepositReconciliationAudit record exists
      const audit = await DepositReconciliationAudit.findOne({ where: { transactionReference: ref } });
      expect(audit).toBeTruthy();
      expect(audit.status).toBe('settled');
      expect(audit.isReconciled).toBe(true);
      expect(parseFloat(audit.amount)).toBe(amount);
      expect(audit.userId).toBe(testUser.id);
      expect(audit.walletId).toBe(wallet.id);

      // Verify WebhookEvent status updated to processed
      await event.reload();
      expect(event.status).toBe('processed');

      // Second run: Duplicate attempt -> strictly ignored by idempotency guard
      const duplicateResult = await depositReconciliationEngine.reconcileSingleDeposit(event, {
        dryRun: false,
        reconciliationType: 'historical_batch'
      });

      expect(duplicateResult.ok).toBe(true);
      expect(duplicateResult.duplicate).toBe(true);
      expect(duplicateResult.status).toBe('already_credited');

      // Verify balance did NOT increment again
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + amount);
    });
  });

  describe('External Batch Dump Reconciliation', () => {
    it('successfully processes external transaction dump with mixed valid, duplicate, and unknown records', async () => {
      const accNum = `93${Math.floor(10000000 + Math.random() * 90000000)}`;
      const user = await User.create({
        name: 'Dump Ingestion User',
        email: `dump_${Date.now()}@testdomain.com`,
        phone: `0808${Math.floor(1000000 + Math.random() * 9000000)}`,
        password: 'Password123!',
        virtual_account_number: accNum
      });

      const ref1 = `DUMP-TX-1-${Date.now()}`;
      const ref2 = `DUMP-TX-2-${Date.now()}`;

      const records = [
        {
          reference: ref1,
          amount: 2500,
          accountNumber: accNum,
          provider: 'palmpay'
        },
        {
          reference: ref2,
          amount: 3500,
          accountNumber: '9999999999', // Unknown account
          provider: '9psb'
        }
      ];

      // Run dry-run on batch
      const drySummary = await depositReconciliationEngine.reconcileExternalBatch({
        records,
        dryRun: true,
        operator: 'admin_test'
      });

      expect(drySummary.scanned).toBe(2);
      expect(drySummary.matchedCount).toBe(1);
      expect(drySummary.unresolvedCount).toBe(1);
      expect(drySummary.totalRecoveredAmount).toBe(2500);

      // Run live settlement on batch
      const liveSummary = await depositReconciliationEngine.reconcileExternalBatch({
        records,
        dryRun: false,
        operator: 'admin_test'
      });

      expect(liveSummary.scanned).toBe(2);
      expect(liveSummary.settledCount).toBe(1);
      expect(liveSummary.unresolvedCount).toBe(1);
      expect(liveSummary.totalRecoveredAmount).toBe(2500);

      const wallet = await Wallet.findOne({ where: { userId: user.id } });
      expect(parseFloat(wallet.balance)).toBe(2500);
    });
  });

  describe('Admin HTTP API Endpoints', () => {
    let adminToken;

    beforeAll(async () => {
      const adminUser = await User.create({
        name: 'Super Admin Reconciler',
        email: `admin_endpoint_${Date.now()}@testdomain.com`,
        phone: `0807${Math.floor(1000000 + Math.random() * 9000000)}`,
        password: 'AdminPassword123!',
        role: 'admin'
      });
      adminToken = createAuthToken(adminUser);
    });

    it('POST /api/admin/reconciliation/deposits/run executes dry-run by default', async () => {
      const res = await request(app)
        .post('/api/admin/reconciliation/deposits/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hours: 48, limit: 10 });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dryRun).toBe(true);
      expect(typeof res.body.data.scanned).toBe('number');
    });

    it('GET /api/admin/reconciliation/deposits/audits returns paginated audit records', async () => {
      const res = await request(app)
        .get('/api/admin/reconciliation/deposits/audits')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.audits)).toBe(true);
      expect(typeof res.body.data.total).toBe('number');
    });

    it('GET /api/admin/reconciliation/deposits/summary returns recovery telemetry', async () => {
      const res = await request(app)
        .get('/api/admin/reconciliation/deposits/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.totalAudits).toBe('number');
      expect(typeof res.body.data.totalRecoveredVolume).toBe('number');
    });

    it('POST /api/admin/reconciliation/deposits/import processes batch dump via API', async () => {
      const res = await request(app)
        .post('/api/admin/reconciliation/deposits/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dryRun: true,
          records: [
            {
              reference: `API-IMPORT-REF-${Date.now()}`,
              amount: 1000,
              accountNumber: '1234567890'
            }
          ]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scanned).toBe(1);
    });
  });
});
