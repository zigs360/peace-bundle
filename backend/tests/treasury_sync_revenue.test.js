const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../services/billstackTransferService', () => ({
  initiateTransfer: jest.fn(),
}));

const billstackTransferService = require('../services/billstackTransferService');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const DataPlan = require('../models/DataPlan');
const TreasuryBalance = require('../models/TreasuryBalance');
const TreasuryLedgerEntry = require('../models/TreasuryLedgerEntry');
const SystemSetting = require('../models/SystemSetting');
const Notification = require('../models/Notification');
const treasuryService = require('../services/treasuryService');
const notificationRealtimeService = require('../services/notificationRealtimeService');
const walletService = require('../services/walletService');

describe('Treasury revenue synchronization', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.TREASURY_AUTO_SYNC_ON_READ = 'true';
    process.env.TREASURY_AUTO_SYNC_DEBOUNCE_MS = '0';
    process.env.SETTLEMENT_TRANSFER_FEE_NGN = '50';
    process.env.SETTLEMENT_BANK_CODE = '50515';
  });

  beforeEach(async () => {
    await treasuryService.waitForAutoSyncIdle();
    await Notification.destroy({ where: {} });
    await TreasuryLedgerEntry.destroy({ where: {} });
    await TreasuryBalance.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await DataPlan.destroy({ where: {} });
    await SystemSetting.set('treasury_last_sync_at', '', 'string', 'treasury');

    billstackTransferService.initiateTransfer.mockReset();
    billstackTransferService.initiateTransfer.mockResolvedValue({
      success: true,
      reference: 'BILLSTACK-TREASURY-SYNC',
      data: { status: true },
    });
  });

  afterEach(async () => {
    await treasuryService.waitForAutoSyncIdle();
    jest.restoreAllMocks();
  });

  const makeUser = async (role, prefix) =>
    User.create({
      name: `${role} ${prefix}`,
      email: `${prefix}_${Date.now()}@test.com`,
      phone: `081${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: 'password123',
      role,
      account_status: 'active',
    });

  it('captures data purchase profit when the transaction completes after the previous sync window', async () => {
    const admin = await makeUser('admin', 'treasury_admin');
    const user = await makeUser('user', 'treasury_customer');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '1GB Plan',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 100,
      api_cost: 70,
      is_active: true,
    });

    const createdAt = new Date(Date.now() - 60_000);
    const tx = await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'debit',
      amount: 100,
      balance_before: 500,
      balance_after: 400,
      source: 'data_purchase',
      reference: `TREASURY-DATA-${Date.now()}`,
      description: 'Pending data purchase',
      dataPlanId: plan.id,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    });

    const syncStart = new Date();
    await SystemSetting.set('treasury_last_sync_at', syncStart.toISOString(), 'string', 'treasury');
    await new Promise((resolve) => setTimeout(resolve, 10));

    await tx.update({
      status: 'completed',
      completed_at: new Date(),
    });

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/admin/treasury/balance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(30);

    const balance = await treasuryService.getBalance();
    expect(balance).toBe(30);

    const syncLedger = await TreasuryLedgerEntry.findOne({ where: { source: 'revenue_sync' } });
    expect(syncLedger).toBeTruthy();
    expect(parseFloat(String(syncLedger.amount))).toBe(30);

    const syncedTx = await Transaction.findByPk(tx.id);
    expect(syncedTx.metadata.treasury_sync).toBeTruthy();
    expect(syncedTx.metadata.treasury_sync.bucket).toBe('data_profit');
  });

  it('captures funding fee revenue when a held funding transaction is approved later', async () => {
    const admin = await makeUser('admin', 'treasury_admin_fee');
    const user = await makeUser('user', 'treasury_fee_customer');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });

    const createdAt = new Date(Date.now() - 60_000);
    const tx = await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'credit',
      amount: 200,
      balance_before: 0,
      balance_after: 0,
      source: 'funding',
      reference: `TREASURY-FEE-${Date.now()}`,
      description: 'Held funding transaction',
      metadata: {
        gross_amount: 225,
        fee_amount: 25,
        net_amount: 200,
        review_status: 'pending_review',
      },
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    });

    const syncStart = new Date();
    await SystemSetting.set('treasury_last_sync_at', syncStart.toISOString(), 'string', 'treasury');
    await new Promise((resolve) => setTimeout(resolve, 10));

    await tx.update({
      status: 'completed',
      completed_at: new Date(),
      metadata: {
        ...(tx.metadata || {}),
        review_status: 'approved',
      },
    });

    const result = await treasuryService.syncRevenue({ adminUserId: admin.id });
    expect(result.ok).toBe(true);
    expect(result.credited).toBe(25);
    expect(result.feeRevenue).toBe(25);
    expect(result.dataProfit).toBe(0);

    const balance = await treasuryService.getBalance();
    expect(balance).toBe(25);
  });

  it('auto-syncs treasury revenue and emits admin updates when funding fees are credited', async () => {
    const admin = await makeUser('admin', 'treasury_admin_realtime');
    const user = await makeUser('user', 'treasury_realtime_customer');

    const emitSpy = jest.spyOn(notificationRealtimeService, 'emitToUser').mockImplementation(() => {});
    jest.spyOn(notificationRealtimeService, 'getConnectedUserIds').mockReturnValue([admin.id]);

    const syncStart = new Date();
    await SystemSetting.set('treasury_last_sync_at', syncStart.toISOString(), 'string', 'treasury');
    await new Promise((resolve) => setTimeout(resolve, 10));

    await walletService.creditFundingWithFraudChecks(user, 200, 'Realtime funding credit', {
      reference: `TREASURY-AUTO-FUND-${Date.now()}`,
      gateway: 'billstack',
      gross_amount: 225,
      fee_amount: 25,
      net_amount: 200,
    });

    await treasuryService.waitForAutoSyncIdle();

    const snapshot = await treasuryService.getTreasurySnapshot();
    expect(snapshot.revenue.totalRecognizedRevenue).toBe(25);
    expect(snapshot.revenue.feeRevenue).toBe(25);
    expect(snapshot.balance).toBe(25);
    expect(emitSpy).toHaveBeenCalledWith(
      admin.id,
      'treasury_balance_updated',
      expect.objectContaining({
        balance: 25,
        snapshot: expect.objectContaining({
          revenue: expect.objectContaining({
            totalRecognizedRevenue: 25,
            feeRevenue: 25,
          }),
        }),
      }),
    );
  });

  it('auto-syncs treasury revenue when a pending data purchase completes', async () => {
    const user = await makeUser('user', 'treasury_auto_data_customer');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: 'Auto Sync 1GB',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 100,
      api_cost: 70,
      is_active: true,
    });

    const txn = await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'debit',
      amount: 100,
      balance_before: 500,
      balance_after: 400,
      source: 'data_purchase',
      reference: `TREASURY-AUTO-DATA-${Date.now()}`,
      description: 'Pending data purchase',
      dataPlanId: plan.id,
      status: 'pending',
      completed_at: null,
    });

    const syncStart = new Date();
    await SystemSetting.set('treasury_last_sync_at', syncStart.toISOString(), 'string', 'treasury');
    await new Promise((resolve) => setTimeout(resolve, 10));

    await txn.update({
      status: 'completed',
      completed_at: new Date(),
    });

    await treasuryService.waitForAutoSyncIdle();

    const snapshot = await treasuryService.getTreasurySnapshot();
    expect(snapshot.revenue.totalRecognizedRevenue).toBe(30);
    expect(snapshot.revenue.dataProfit).toBe(30);
    expect(snapshot.balance).toBe(30);
  });

  it('skips invalid revenue transactions and alerts admins', async () => {
    const admin = await makeUser('admin', 'treasury_admin_invalid');
    const user = await makeUser('user', 'treasury_invalid_customer');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'debit',
      amount: 100,
      balance_before: 500,
      balance_after: 400,
      source: 'data_purchase',
      reference: `TREASURY-INVALID-${Date.now()}`,
      description: 'Broken revenue record',
      status: 'completed',
      completed_at: new Date(),
    });

    const result = await treasuryService.syncRevenue({ adminUserId: admin.id });
    expect(result.ok).toBe(true);
    expect(result.credited).toBe(0);
    expect(result.invalidRevenueTransactions).toBe(1);

    const balance = await treasuryService.getBalance();
    expect(balance).toBe(0);

    const warning = await Notification.findOne({
      where: {
        userId: admin.id,
        title: 'Treasury revenue validation warning',
      },
    });
    expect(warning).toBeTruthy();
  });

  it('syncs fresh revenue before validating treasury withdrawal balance', async () => {
    const admin = await makeUser('admin', 'treasury_admin_withdraw');
    const user = await makeUser('user', 'treasury_withdraw_customer');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '2GB Plan',
      size: '2GB',
      size_mb: 2048,
      validity: '30 days',
      admin_price: 200,
      api_cost: 50,
      is_active: true,
    });

    await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'debit',
      amount: 200,
      balance_before: 600,
      balance_after: 400,
      source: 'data_purchase',
      reference: `TREASURY-WITHDRAW-${Date.now()}`,
      description: 'Completed data purchase',
      dataPlanId: plan.id,
      status: 'completed',
      completed_at: new Date(),
    });

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/admin/treasury/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, description: 'Settle recent revenue' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const balance = await treasuryService.getBalance();
    expect(balance).toBe(0);
    expect(billstackTransferService.initiateTransfer).toHaveBeenCalledTimes(1);
  });
});
