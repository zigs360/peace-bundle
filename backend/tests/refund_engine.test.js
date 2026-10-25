const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction, DepositReconciliationAudit } = require('../models');
const refundEngine = require('../services/refundEngine');
const notificationRealtimeService = require('../services/notificationRealtimeService');

describe('Enterprise Refund Engine & Incident Remediation', () => {
  let adminToken;
  let testAdmin;

  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_refund_secret_12345';
    jest.spyOn(notificationRealtimeService, 'sendToUser').mockResolvedValue({});
    jest.spyOn(notificationRealtimeService, 'emitToUser').mockImplementation(() => {});

    testAdmin = await User.create({
      name: 'Refund Admin',
      email: `refund_admin_${Date.now()}@testdomain.com`,
      phone: `0803${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'AdminPassword123!',
      role: 'admin'
    });

    adminToken = jwt.sign(
      { id: testAdmin.id, email: testAdmin.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
  });

  const createTestUserWithWallet = async (initialBalance = 1000) => {
    const user = await User.create({
      name: 'Refund Test User',
      email: `user_rfnd_${Date.now()}_${Math.random().toString(36).substring(7)}@testdomain.com`,
      phone: `0804${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'Password123!',
      virtual_account_number: `96${Math.floor(10000000 + Math.random() * 90000000)}`
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    if (wallet) {
      await wallet.update({ balance: initialBalance });
    } else {
      await Wallet.create({ userId: user.id, balance: initialBalance });
    }

    return { user, wallet: await Wallet.findOne({ where: { userId: user.id } }) };
  };

  describe('ACID Atomicity & Strict Idempotency', () => {
    it('atomically credits wallet, updates original transaction, and logs audit record', async () => {
      const { user, wallet } = await createTestUserWithWallet(1500);
      const startingBalance = 1500;
      const refundAmount = 500;

      const origRef = `DATA-PURCHASE-${Date.now()}`;
      const originalTxn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: refundAmount,
        balance_before: 2000,
        balance_after: 1500,
        source: 'data_purchase',
        reference: origRef,
        description: 'MTN 1GB Data Purchase',
        status: 'failed'
      });

      // Execute refund
      const refundResult = await refundEngine.executeRefund({
        transactionId: originalTxn.id,
        reason: 'Provider timeout delivery failure',
        operator: 'test_suite'
      });

      expect(refundResult.ok).toBe(true);
      expect(refundResult.status).toBe('settled');
      expect(refundResult.amount).toBe(refundAmount);
      expect(refundResult.balanceAfter).toBe(startingBalance + refundAmount);

      // Verify wallet balance was updated
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(startingBalance + refundAmount);

      // Verify original transaction marked refunded
      await originalTxn.reload();
      expect(originalTxn.status).toBe('refunded');
      expect(originalTxn.refund_reference).toBe(refundResult.refundReference);

      // Verify credit ledger transaction was created
      const refundCreditTxn = await Transaction.findOne({ where: { reference: refundResult.refundReference } });
      expect(refundCreditTxn).toBeTruthy();
      expect(refundCreditTxn.type).toBe('credit');
      expect(refundCreditTxn.source).toBe('refund');
      expect(parseFloat(refundCreditTxn.amount)).toBe(refundAmount);

      // Verify DepositReconciliationAudit was created
      const audit = await DepositReconciliationAudit.findOne({ where: { transactionReference: refundResult.refundReference } });
      expect(audit).toBeTruthy();
      expect(audit.status).toBe('settled');
      expect(audit.isReconciled).toBe(true);
    });

    it('enforces strict idempotency: duplicate refund attempts are ignored without double-crediting', async () => {
      const { user, wallet } = await createTestUserWithWallet(2000);
      const startingBalance = 2000;
      const refundAmount = 1000;

      const origRef = `AIRTIME-TX-${Date.now()}`;
      const originalTxn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: refundAmount,
        balance_before: 3000,
        balance_after: 2000,
        source: 'airtime_purchase',
        reference: origRef,
        status: 'failed'
      });

      // First refund -> credits wallet
      const res1 = await refundEngine.executeRefund({
        transactionId: originalTxn.id,
        reason: 'Airtime delivery failed'
      });
      expect(res1.ok).toBe(true);
      expect(res1.status).toBe('settled');

      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(startingBalance + refundAmount);

      // Second refund with the same reference -> detected as duplicate
      const res2 = await refundEngine.executeRefund({
        transactionId: originalTxn.id,
        reason: 'Duplicate webhook event retry'
      });

      expect(res2.ok).toBe(true);
      expect(res2.duplicate).toBe(true);
      expect(res2.status).toBe('already_credited');

      // Balance must remain unchanged
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(startingBalance + refundAmount);
    });
  });

  describe('Remediation of Target Incident References', () => {
    it('correctly credits and reconciles incident reference RFND-56EB282CC7824CF7927A04E2', async () => {
      const { user, wallet } = await createTestUserWithWallet(500);
      const initialBalance = parseFloat(wallet.balance);
      const targetRef1 = 'RFND-56EB282CC7824CF7927A04E2';

      // Simulate the flawed state: original transaction is marked 'refunded' with refund_reference set,
      // but no credit ledger entry was created, and user's wallet was never incremented!
      const originalTxn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: 750,
        balance_before: 1250,
        balance_after: 500,
        source: 'data_purchase',
        reference: `OGDAMS-DATA-${Date.now()}-1`,
        refund_reference: targetRef1,
        status: 'refunded',
        description: 'Failed Data Purchase'
      });

      // Verify no credit exists yet
      const missingCredit = await Transaction.findOne({ where: { reference: targetRef1 } });
      expect(missingCredit).toBeNull();

      // Execute incident remediation
      const fixResult = await refundEngine.executeRefund({
        transactionId: originalTxn.id,
        originalReference: originalTxn.reference,
        refundReference: targetRef1,
        userId: user.id,
        amount: 750,
        reason: 'Incident remediation for uncredited refund',
        operator: 'incident_remediation',
        metadata: { reconciled_manually: true }
      });

      expect(fixResult.ok).toBe(true);
      expect(fixResult.status).toBe('settled');
      expect(fixResult.balanceAfter).toBe(initialBalance + 750);

      // Verify wallet balance incremented
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + 750);

      // Verify credit transaction now exists in ledger
      const creditTxn = await Transaction.findOne({ where: { reference: targetRef1 } });
      expect(creditTxn).toBeTruthy();
      expect(parseFloat(creditTxn.amount)).toBe(750);
      expect(creditTxn.metadata.reconciled_manually).toBe(true);

      // Re-running it must be safely blocked by idempotency
      const duplicateRun = await refundEngine.executeRefund({
        transactionId: originalTxn.id,
        refundReference: targetRef1,
        userId: user.id,
        amount: 750
      });
      expect(duplicateRun.duplicate).toBe(true);
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + 750);
    });

    it('correctly credits and reconciles incident reference RFND-EA4CB49A3B914056F6A11383', async () => {
      const { user, wallet } = await createTestUserWithWallet(100);
      const initialBalance = parseFloat(wallet.balance);
      const targetRef2 = 'RFND-EA4CB49A3B914056F6A11383';

      const originalTxn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: 1500,
        balance_before: 1600,
        balance_after: 100,
        source: 'airtime_purchase',
        reference: `OGDAMS-AIRTIME-${Date.now()}-2`,
        refund_reference: targetRef2,
        status: 'refunded',
        description: 'Failed Airtime Purchase'
      });

      // Execute remediation
      const fixResult = await refundEngine.executeRefund({
        transactionId: originalTxn.id,
        originalReference: originalTxn.reference,
        refundReference: targetRef2,
        userId: user.id,
        amount: 1500,
        reason: 'Incident remediation for uncredited refund',
        operator: 'incident_remediation',
        metadata: { reconciled_manually: true }
      });

      expect(fixResult.ok).toBe(true);
      expect(fixResult.status).toBe('settled');

      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + 1500);

      const creditTxn = await Transaction.findOne({ where: { reference: targetRef2 } });
      expect(creditTxn).toBeTruthy();
      expect(parseFloat(creditTxn.amount)).toBe(1500);
    });
  });

  describe('Automated Background Reconciliation Worker', () => {
    it('detects orphaned refunds and automatically credits the user wallet', async () => {
      const { user, wallet } = await createTestUserWithWallet(400);
      const initialBalance = parseFloat(wallet.balance);
      const orphanRefundRef = `RFND-ORPHAN-${Date.now()}`;

      // Create an orphaned refund record (marked refunded, but no credit ledger entry exists)
      await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: 600,
        balance_before: 1000,
        balance_after: 400,
        source: 'data_purchase',
        reference: `ORPHAN-TXN-${Date.now()}`,
        refund_reference: orphanRefundRef,
        status: 'refunded',
        description: 'Orphaned refund test'
      });

      // Run scanner
      const scanResult = await refundEngine.scanAndRepairOrphanedRefunds({
        limit: 50,
        lookbackHours: 24,
        autoRepair: true
      });

      expect(scanResult.orphanedCount).toBeGreaterThan(0);
      expect(scanResult.repairedCount).toBeGreaterThan(0);

      // Verify wallet was auto-repaired
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + 600);

      // Verify credit transaction now exists in ledger
      const creditTxn = await Transaction.findOne({ where: { reference: orphanRefundRef } });
      expect(creditTxn).toBeTruthy();
    });
  });

  describe('Admin Refund API Endpoint (Refactored)', () => {
    it('POST /api/admin/transactions/:id/refund executes atomic refund and prevents duplicate refund calls', async () => {
      const { user, wallet } = await createTestUserWithWallet(200);
      const initialBalance = parseFloat(wallet.balance);

      const originalTxn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: 800,
        balance_before: 1000,
        balance_after: 200,
        source: 'data_purchase',
        reference: `ADMIN-API-TXN-${Date.now()}`,
        status: 'failed'
      });

      // 1. Initial refund call via API
      const res = await request(app)
        .post(`/api/admin/transactions/${originalTxn.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Admin approved refund test' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('settled');

      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + 800);

      // 2. Second refund call via API -> should return 400 already refunded
      const dupRes = await request(app)
        .post(`/api/admin/transactions/${originalTxn.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Accidental duplicate refund click' });

      expect(dupRes.statusCode).toBe(400);
      expect(dupRes.body.success).toBe(false);
      expect(dupRes.body.message).toContain('already refunded');

      // Balance remains strictly untouched
      await wallet.reload();
      expect(parseFloat(wallet.balance)).toBe(initialBalance + 800);
    });
  });
});
