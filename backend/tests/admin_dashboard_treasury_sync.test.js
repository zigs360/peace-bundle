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

describe('Admin dashboard treasury synchronization', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.TREASURY_AUTO_SYNC_ON_READ = 'true';
    process.env.SETTLEMENT_TRANSFER_FEE_NGN = '50';
    process.env.SETTLEMENT_BANK_CODE = '50515';
  });

  beforeEach(async () => {
    await Notification.destroy({ where: {} });
    await TreasuryLedgerEntry.destroy({ where: {} });
    await TreasuryBalance.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await DataPlan.destroy({ where: {} });
    await SystemSetting.set('treasury_last_sync_at', '', 'string', 'treasury');
    billstackTransferService.initiateTransfer.mockReset();
    billstackTransferService.initiateTransfer.mockResolvedValue({
      success: true,
      reference: 'BILLSTACK-DASHBOARD-TREASURY',
      data: { status: true },
    });
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

  it('uses the same recognized revenue total for admin stats and treasury balance', async () => {
    const admin = await makeUser('admin', 'dashboard_admin');
    const user = await makeUser('user', 'dashboard_customer');
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

    await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'debit',
      amount: 100,
      balance_before: 500,
      balance_after: 400,
      source: 'data_purchase',
      reference: `DASH-DATA-${Date.now()}`,
      description: 'Completed data purchase',
      dataPlanId: plan.id,
      status: 'completed',
      completed_at: new Date(),
    });

    await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'credit',
      amount: 200,
      balance_before: 400,
      balance_after: 600,
      source: 'funding',
      reference: `DASH-FUND-${Date.now()}`,
      description: 'Completed funding',
      metadata: {
        gross_amount: 225,
        fee_amount: 25,
        net_amount: 200,
      },
      status: 'completed',
      completed_at: new Date(),
    });

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.body.stats.total_revenue).toBe(55);
    expect(statsRes.body.stats.treasury_available_balance).toBe(55);
    expect(statsRes.body.stats.treasury_fee_revenue).toBe(25);
    expect(statsRes.body.stats.treasury_data_profit).toBe(30);

    const treasuryRes = await request(app)
      .get('/api/admin/treasury/balance')
      .set('Authorization', `Bearer ${token}`);

    expect(treasuryRes.statusCode).toBe(200);
    expect(treasuryRes.body.balance).toBe(55);

    const syncEntries = await TreasuryLedgerEntry.findAll({ where: { source: 'revenue_sync' } });
    expect(syncEntries.length).toBe(1);
  });

  it('ignores invalid gross debit amounts that are not recognized treasury revenue', async () => {
    const admin = await makeUser('admin', 'dashboard_admin_invalid');
    const user = await makeUser('user', 'dashboard_invalid_customer');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const brokenPlan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: 'Broken Plan',
      size: '500MB',
      size_mb: 500,
      validity: '30 days',
      admin_price: 100,
      api_cost: null,
      is_active: true,
    });

    await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'debit',
      amount: 100,
      balance_before: 500,
      balance_after: 400,
      source: 'data_purchase',
      reference: `DASH-BROKEN-${Date.now()}`,
      description: 'Broken data purchase revenue',
      dataPlanId: brokenPlan.id,
      status: 'completed',
      completed_at: new Date(),
    });

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.body.stats.total_revenue).toBe(0);
    expect(statsRes.body.stats.treasury_available_balance).toBe(0);
  });

  it('reconciles recognized revenue with reduced available balance after settlement withdrawal', async () => {
    const admin = await makeUser('admin', 'dashboard_admin_withdrawn');
    const user = await makeUser('user', 'dashboard_withdrawn_customer');
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
      balance_before: 500,
      balance_after: 300,
      source: 'data_purchase',
      reference: `DASH-WITHDRAW-DATA-${Date.now()}`,
      description: 'Completed data purchase',
      dataPlanId: plan.id,
      status: 'completed',
      completed_at: new Date(),
    });

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const withdrawRes = await request(app)
      .post('/api/admin/treasury/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, description: 'Treasury payout' });

    expect(withdrawRes.statusCode).toBe(200);

    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.body.stats.total_revenue).toBe(150);
    expect(statsRes.body.stats.treasury_available_balance).toBe(0);
    expect(statsRes.body.stats.treasury_withdrawn_total).toBe(150);
    expect(statsRes.body.stats.treasury_pending_withdrawals).toBe(0);
    expect(statsRes.body.stats.treasury_reconciliation_difference).toBe(0);

    const treasuryRes = await request(app)
      .get('/api/admin/treasury/balance')
      .set('Authorization', `Bearer ${token}`);

    expect(treasuryRes.statusCode).toBe(200);
    expect(treasuryRes.body.revenue.totalRecognizedRevenue).toBe(150);
    expect(treasuryRes.body.balance).toBe(0);
    expect(treasuryRes.body.withdrawals.totalCompletedWithdrawals).toBe(150);
    expect(treasuryRes.body.reconciliation.isConsistent).toBe(true);
  });
});
