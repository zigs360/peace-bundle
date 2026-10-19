const request = require('supertest');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction } = require('../models');
const WebhookEvent = require('../models/WebhookEvent');
const virtualAccountReconciliationService = require('../services/virtualAccountReconciliationService');
const { runVirtualAccountFundingReconciliationOnce } = require('../jobs/virtualAccountFundingReconcileJob');
const notificationRealtimeService = require('../services/notificationRealtimeService');
const treasuryService = require('../services/treasuryService');
const jwt = require('jsonwebtoken');

describe('Virtual Account Automated Deposit Reconciliation & Self-Healing', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
    process.env.BILLSTACK_WEBHOOK_SECRET = 'test_billstack_secret';
    process.env.PAYVESSEL_SECRET_KEY = 'test_payvessel_secret';
    jest.spyOn(notificationRealtimeService, 'sendToUser').mockResolvedValue({});
    jest.spyOn(notificationRealtimeService, 'emitToUser').mockImplementation(() => {});
    jest.spyOn(treasuryService, 'scheduleAutoSync').mockResolvedValue();
    jest.spyOn(treasuryService, 'runAutoSync').mockResolvedValue();
  });

  const generateAuthToken = (user) => {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  };

  it('automatically detects uncredited webhook event and credits user wallet with instant notification', async () => {
    const accNum = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const user = await User.create({
      name: 'Reconcile User 1',
      email: `reconcile_1_${Date.now()}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: accNum,
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Reconcile User 1'
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const initialBalance = parseFloat(wallet.balance);

    const ref = `REC-TEST-${Date.now()}`;
    const amount = 7500;

    // Simulate an uncredited webhook event in 'received' status (e.g. from network timeout)
    const event = await WebhookEvent.create({
      provider: 'payvessel',
      status: 'received',
      reference: ref,
      amount,
      payload: {
        order: {
          reference: ref,
          amount,
          settlement_amount: amount,
          settlement_account: accNum
        },
        customer: {
          email: 'payer_other_bank@zenith.com'
        }
      }
    });

    // Run reconciliation
    const result = await virtualAccountReconciliationService.reconcileSingleEvent(event);
    expect(result.ok).toBe(true);
    expect(result.status).toBe('credited');

    // Verify wallet balance increased
    const updatedWallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(updatedWallet.balance)).toBe(initialBalance + amount);

    // Verify transaction created
    const txn = await Transaction.findOne({ where: { reference: ref } });
    expect(txn).toBeTruthy();
    expect(parseFloat(txn.amount)).toBe(amount);
    expect(txn.description).toContain('Bank Transfer:');

    // Verify event marked processed
    await event.reload();
    expect(event.status).toBe('processed');
    expect(event.userId).toBe(user.id);
  });

  it('guarantees idempotency: does not double credit if deposit is already credited', async () => {
    const accNum = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
    const user = await User.create({
      name: 'Reconcile User Idempotent',
      email: `reconcile_idemp_${Date.now()}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: accNum,
      virtual_account_bank: '9PSB',
      virtual_account_name: 'Reconcile User Idempotent'
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const initialBalance = parseFloat(wallet.balance);

    const ref = `REC-DUP-${Date.now()}`;
    const amount = 3000;

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

    // First reconciliation -> credits
    const firstResult = await virtualAccountReconciliationService.reconcileSingleEvent(event);
    expect(firstResult.ok).toBe(true);

    const walletAfterFirst = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfterFirst.balance)).toBe(initialBalance + amount);

    // Second reconciliation -> detects duplicate, does NOT credit again
    const secondResult = await virtualAccountReconciliationService.reconcileSingleEvent(event);
    expect(secondResult.ok).toBe(true);
    expect(secondResult.duplicate).toBe(true);

    const walletAfterSecond = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfterSecond.balance)).toBe(initialBalance + amount); // unchanged
  });

  it('reconciles uncredited deposits via user on-demand endpoint POST /api/wallet/sync-deposits', async () => {
    const palmPayAcc = `95${Math.floor(10000000 + Math.random() * 90000000)}`;
    const ninePsbAcc = `85${Math.floor(10000000 + Math.random() * 90000000)}`;

    const user = await User.create({
      name: 'User Sync Test',
      email: `user_sync_${Date.now()}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: palmPayAcc,
      virtual_account_bank: 'PALMPAY',
      metadata: {
        dual_virtual_accounts: {
          accounts: {
            palmpay: { accountNumber: palmPayAcc, bankName: 'PALMPAY' },
            '9psb': { accountNumber: ninePsbAcc, bankName: '9PSB' }
          }
        }
      }
    });

    const token = generateAuthToken(user);
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const initialBalance = parseFloat(wallet.balance);

    const ref = `USER-SYNC-REF-${Date.now()}`;
    const amount = 12000;

    // Simulate webhook event that was delayed or failed earlier
    await WebhookEvent.create({
      provider: 'billstack',
      status: 'failed',
      reference: ref,
      amount,
      error: 'Simulated connection timeout during webhook reception',
      payload: {
        data: {
          reference: ref,
          amount,
          account_number: ninePsbAcc // funded via their 9PSB secondary virtual account
        }
      }
    });

    // User clicks "I Have Transferred / Sync Balance"
    const res = await request(app)
      .post('/api/wallet/sync-deposits')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.newlyCreditedCount).toBe(1);
    expect(res.body.data.totalCreditedAmount).toBe(amount);
    expect(res.body.data.currentBalance).toBe(initialBalance + amount);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(initialBalance + amount);
  });

  it('runs background job cycle runVirtualAccountFundingReconciliationOnce cleanly', async () => {
    const result = await runVirtualAccountFundingReconciliationOnce();
    expect(result).not.toBeNull();
    expect(typeof result.scanned).toBe('number');
    expect(typeof result.creditedCount).toBe('number');
  });

  it('allows admin to trigger system-wide virtual account reconciliation via POST /api/admin/virtual-accounts/reconcile-all', async () => {
    const adminUser = await User.create({
      name: 'Admin Reconciler',
      email: `admin_rec_${Date.now()}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      role: 'admin',
    });

    const adminToken = generateAuthToken(adminUser);

    const res = await request(app)
      .post('/api/admin/virtual-accounts/reconcile-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ limit: 50, hours: 24 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.scanned).toBe('number');
    expect(typeof res.body.data.creditedCount).toBe('number');
  });
});
