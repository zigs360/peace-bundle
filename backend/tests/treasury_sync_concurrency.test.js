const { connectDB, User } = require('../config/db');
const TreasuryBalance = require('../models/TreasuryBalance');
const TreasuryLedgerEntry = require('../models/TreasuryLedgerEntry');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('../services/walletService');
const treasuryService = require('../services/treasuryService');

describe('Treasury revenue sync concurrency', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await TreasuryLedgerEntry.destroy({ where: {} });
    await TreasuryBalance.destroy({ where: {} });
    await SystemSetting.set('treasury_last_sync_at', '', 'string', 'treasury');
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
});
