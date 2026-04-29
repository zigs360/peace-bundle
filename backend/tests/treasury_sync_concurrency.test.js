const { connectDB, User } = require('../config/db');
const TreasuryBalance = require('../models/TreasuryBalance');
const TreasuryLedgerEntry = require('../models/TreasuryLedgerEntry');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('../services/walletService');
const treasuryService = require('../services/treasuryService');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const DataPlan = require('../models/DataPlan');

describe('Treasury revenue sync concurrency', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await treasuryService.waitForAutoSyncIdle();
    await TreasuryLedgerEntry.destroy({ where: {} });
    await TreasuryBalance.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await DataPlan.destroy({ where: {} });
    await SystemSetting.set('treasury_last_sync_at', '', 'string', 'treasury');
    process.env.TREASURY_AUTO_SYNC_DEBOUNCE_MS = '0';
  });

  afterEach(async () => {
    await treasuryService.waitForAutoSyncIdle();
    jest.restoreAllMocks();
  });

  it('does not double-credit when sync is called concurrently', async () => {
    const adminUser = await User.create({
      name: 'Admin Sync',
      email: `admin_sync_${Date.now()}@test.com`,
      phone: `0811${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const u = await User.create({
      name: 'Fee User Sync',
      email: `fee_sync_${Date.now()}@test.com`,
      phone: `0812${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const start = new Date();
    await SystemSetting.set('treasury_last_sync_at', start.toISOString(), 'string', 'treasury');
    await new Promise((r) => setTimeout(r, 5));

    jest.spyOn(treasuryService, 'scheduleAutoSync').mockResolvedValue();
    await walletService.creditFundingWithFraudChecks(u, 200, 'Test Funding', { reference: `MI-${Date.now()}-A`, gateway: 'billstack' });
    await walletService.creditFundingWithFraudChecks(u, 200, 'Test Funding', { reference: `MI-${Date.now()}-B`, gateway: 'billstack' });

    const [r1, r2] = await Promise.all([
      treasuryService.syncRevenue({ adminUserId: adminUser.id }),
      treasuryService.syncRevenue({ adminUserId: adminUser.id }),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const balance = await treasuryService.getBalance();
    expect(balance).toBe(0);

    const syncEntries = await TreasuryLedgerEntry.findAll({ where: { source: 'revenue_sync', type: 'credit' } });
    expect(syncEntries.length).toBe(0);
  });

  it('correctly recognizes a burst of mixed revenue transactions without drift', async () => {
    const adminUser = await User.create({
      name: 'Admin Burst Sync',
      email: `admin_burst_${Date.now()}@test.com`,
      phone: `0813${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const user = await User.create({
      name: 'Burst Revenue User',
      email: `burst_rev_${Date.now()}@test.com`,
      phone: `0814${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: 'Burst Plan',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 100,
      api_cost: 70,
      is_active: true,
    });

    const syncStart = new Date();
    await SystemSetting.set('treasury_last_sync_at', syncStart.toISOString(), 'string', 'treasury');
    await new Promise((resolve) => setTimeout(resolve, 5));

    const transactionCreates = [];
    for (let i = 0; i < 10; i += 1) {
      transactionCreates.push(
        Transaction.create({
          walletId: wallet.id,
          userId: user.id,
          type: 'debit',
          amount: 100,
          balance_before: 1000 - i * 100,
          balance_after: 900 - i * 100,
          source: 'data_purchase',
          reference: `BURST-DATA-${Date.now()}-${i}`,
          description: 'Burst data purchase',
          dataPlanId: plan.id,
          status: 'pending',
          completed_at: null,
        }),
      );
      transactionCreates.push(
        Transaction.create({
          walletId: wallet.id,
          userId: user.id,
          type: 'credit',
          amount: 200,
          balance_before: 0,
          balance_after: 200,
          source: 'funding',
          reference: `BURST-FUND-${Date.now()}-${i}`,
          description: 'Burst funding',
          metadata: {
            gateway: 'billstack',
            gross_amount: 225,
            fee_amount: 25,
            net_amount: 200,
          },
          status: 'completed',
          completed_at: new Date(),
        }),
      );
    }

    const createdTransactions = await Promise.all(transactionCreates);
    const pendingDataTransactions = createdTransactions.filter(
      (entry) => entry && entry.source === 'data_purchase',
    );
    for (const transaction of pendingDataTransactions) {
      await transaction.update({
        status: 'completed',
        completed_at: new Date(),
      });
    }
    await treasuryService.waitForAutoSyncIdle();

    const snapshot = await treasuryService.getTreasurySnapshot();
    expect(snapshot.revenue.dataProfit).toBe(300);
    expect(snapshot.revenue.feeRevenue).toBe(250);
    expect(snapshot.revenue.totalRecognizedRevenue).toBe(550);
    expect(snapshot.balance).toBe(550);
    expect(snapshot.reconciliation.isConsistent).toBe(true);

    const syncEntries = await TreasuryLedgerEntry.findAll({ where: { source: 'revenue_sync', type: 'credit' } });
    const totalRecognized = syncEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
    expect(totalRecognized).toBe(550);

    const postBurstSync = await treasuryService.syncRevenue({ adminUserId: adminUser.id });
    expect(postBurstSync.credited).toBe(0);
  });
});
