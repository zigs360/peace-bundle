const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User, Wallet, Transaction } = require('../config/db');
const virtualAccountReconciliationService = require('../services/virtualAccountReconciliationService');

describe('Admin User Transactions and Reconciliation', () => {
  let adminUser;
  let targetUser;
  let regularUser;
  let targetWallet;
  let adminToken;
  let regularToken;
  let tx1;
  let tx2;

  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';

    const timestamp = Date.now();
    adminUser = await User.create({
      name: `Admin Tx ${timestamp}`,
      email: `admin_tx_${timestamp}@test.com`,
      phone: `080${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    targetUser = await User.create({
      name: `Target User ${timestamp}`,
      email: `target_user_${timestamp}@test.com`,
      phone: `081${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    targetWallet = await Wallet.findOne({ where: { userId: targetUser.id } });
    if (targetWallet) {
      await targetWallet.update({ balance: 10000 });
    } else {
      targetWallet = await Wallet.create({ userId: targetUser.id, balance: 10000 });
    }

    regularUser = await User.create({
      name: `Other User ${timestamp}`,
      email: `other_user_${timestamp}@test.com`,
      phone: `082${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    adminToken = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);
    regularToken = jwt.sign({ id: regularUser.id }, process.env.JWT_SECRET);

    // Create transactions for target user
    tx1 = await Transaction.create({
      userId: targetUser.id,
      walletId: targetWallet.id,
      reference: `DEP_${timestamp}_1`,
      type: 'credit',
      amount: 5000,
      fee: 0,
      status: 'completed',
      description: 'Virtual Account Deposit',
      source: 'safehaven',
      provider: 'safehaven',
      balance_before: 5000,
      balance_after: 10000,
      metadata: { session_id: 'SH-SESSION-001' },
    });

    tx2 = await Transaction.create({
      userId: targetUser.id,
      walletId: targetWallet.id,
      reference: `DATA_${timestamp}_2`,
      type: 'debit',
      amount: 1500,
      fee: 0,
      status: 'failed',
      description: 'MTN 1GB Data Purchase',
      recipient_phone: '08123456789',
      source: 'data_purchase',
      provider: 'ogdams',
      balance_before: 10000,
      balance_after: 10000,
      failure_reason: 'Provider timeout: ogdams 504 gateway timeout',
      metadata: { sku: 'MTN-1GB-SME' },
    });

    tx3 = await Transaction.create({
      userId: targetUser.id,
      walletId: targetWallet.id,
      reference: `REF_${timestamp}_3`,
      type: 'credit',
      amount: 1500,
      fee: 0,
      status: 'refunded',
      description: 'Auto-reversal for failed data purchase',
      source: 'refund',
      balance_before: 8500,
      balance_after: 10000,
    });

    // Other user transaction
    await Transaction.create({
      userId: regularUser.id,
      reference: `OTHER_${timestamp}`,
      type: 'credit',
      amount: 200,
      fee: 0,
      status: 'completed',
      source: 'wallet',
      balance_before: 100,
      balance_after: 300,
      description: 'Other user txn',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows admin to fetch user transaction history with full failure reasons and metadata', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUser.id}/transactions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(targetUser.id);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.transactions.length).toBe(3);

    const failedTx = res.body.data.transactions.find(t => t.id === tx2.id);
    expect(failedTx).toBeDefined();
    expect(failedTx.failure_reason).toBe('Provider timeout: ogdams 504 gateway timeout');
    expect(failedTx.provider).toBe('ogdams');
  });

  it('supports filtering transactions by status', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUser.id}/transactions?status=failed`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.transactions[0].id).toBe(tx2.id);
  });

  it('supports filtering transactions by status=reversed without database enum error', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUser.id}/transactions?status=reversed`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.transactions[0].id).toBe(tx3.id);
  });

  it('supports filtering transactions by status=refunded without database enum error', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUser.id}/transactions?status=refunded`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.transactions[0].id).toBe(tx3.id);
  });

  it('supports filtering transactions by type=data without database enum error', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUser.id}/transactions?type=data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.transactions[0].id).toBe(tx2.id);
  });

  it('supports search query matching reference or recipient_phone', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUser.id}/transactions?search=08123456789`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.transactions[0].id).toBe(tx2.id);
  });

  it('rejects non-admin users from accessing user transactions', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUser.id}/transactions`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.statusCode).toBe(403);
  });

  it('allows admin to trigger deposit synchronization for a user', async () => {
    jest.spyOn(virtualAccountReconciliationService, 'reconcileUserDeposits').mockResolvedValue({
      success: true,
      newlyCreditedCount: 1,
      totalCreditedAmount: 3000,
      details: [{ reference: 'DEP_SYNC_1', amount: 3000 }],
    });

    const res = await request(app)
      .post(`/api/admin/users/${targetUser.id}/sync-deposits`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('3,000');
    expect(res.body.data.newlyCreditedCount).toBe(1);
  });

  it('GET /api/admin/transactions returns paginated transactions with user name populated (including wallet fallback)', async () => {
    // Create a transaction that only links walletId (simulating legacy tx where userId was null)
    const walletOnlyTx = await Transaction.create({
      userId: null,
      walletId: targetWallet.id,
      reference: `WALLET_ONLY_${Date.now()}`,
      type: 'credit',
      amount: 750,
      fee: 0,
      status: 'completed',
      description: 'Wallet only legacy txn',
      source: 'wallet',
      balance_before: 10000,
      balance_after: 10750,
    });

    const page1 = await request(app)
      .get('/api/admin/transactions?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(page1.statusCode).toBe(200);
    expect(Array.isArray(page1.body.transactions)).toBe(true);
    expect(page1.body.transactions.length).toBe(2);
    expect(page1.body.currentPage).toBe(1);
    expect(page1.body.totalPages).toBeGreaterThanOrEqual(2);
    expect(page1.body.total).toBeGreaterThanOrEqual(5);

    const resolvedWalletOnly = page1.body.transactions.find(t => t.id === walletOnlyTx.id);
    if (resolvedWalletOnly) {
      expect(resolvedWalletOnly.user).toBeDefined();
      expect(resolvedWalletOnly.user.name).toBe(targetUser.name);
      expect(resolvedWalletOnly.userId).toBe(targetUser.id);
    }

    const page2 = await request(app)
      .get('/api/admin/transactions?page=2&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(page2.statusCode).toBe(200);
    expect(page2.body.currentPage).toBe(2);
    expect(page2.body.transactions.length).toBeGreaterThanOrEqual(1);
    for (const tx of page2.body.transactions) {
      if (tx.userId) {
        expect(tx.user).toBeDefined();
        expect(tx.user.name).toBeTruthy();
      }
    }
  });

  it('GET /api/transactions/my supports limit and offset for bounded mobile payloads', async () => {
    const tokenForTarget = jwt.sign({ id: targetUser.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/transactions/my?limit=2&offset=0')
      .set('Authorization', `Bearer ${tokenForTarget}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });
});
