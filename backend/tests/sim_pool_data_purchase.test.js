const dataPurchaseService = require('../services/dataPurchaseService');
const simManagementService = require('../services/simManagementService');
const smeplugService = require('../services/smeplugService');
const walletService = require('../services/walletService');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const Sim = require('../models/Sim');
const DataPlan = require('../models/DataPlan');
const Transaction = require('../models/Transaction');

describe('SIM pool routing for user data purchase', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  });

  beforeEach(async () => {
    await Transaction.destroy({ where: {} });
    await Sim.destroy({ where: {} });
    await DataPlan.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    jest.restoreAllMocks();
  });

  it('routes purchase via SIM pool when enabled and a SIM is available', async () => {
    process.env.SIM_POOL_ENABLED = 'true';
    process.env.SIM_POOL_ALLOW_WALLET_FALLBACK = 'false';

    const user = await User.create({
      name: 'Pool User',
      email: `pool_user_${Date.now()}@test.com`,
      phone: `0808${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    await walletService.creditFundingWithFraudChecks(user, 5000, 'Test Funding', {
      reference: `MI-${Date.now()}-POOL`,
      gateway: 'billstack',
    });

    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '1GB',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 500,
      api_cost: 200,
      is_active: true,
      ogdams_sku: null,
    });

    const sim = await Sim.create({
      userId: null,
      phoneNumber: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      provider: 'mtn',
      type: 'sim_system',
      status: 'active',
      connectionStatus: 'connected',
      airtimeBalance: 1000,
      reservedAirtime: 0,
      ogdamsLinked: false,
    });

    jest.spyOn(simManagementService, 'getOptimalSimForData').mockResolvedValue(sim);
    jest.spyOn(simManagementService, 'processTransactionWithReservation').mockResolvedValue({
      success: true,
      reference: 'SIMPOOL-REF-1',
      platform: 'smeplug',
      details: { ok: true },
    });
    const smeplugSpy = jest.spyOn(smeplugService, 'purchaseData');

    const txn = await dataPurchaseService.purchase(user, plan, user.phone, null);
    const fresh = await Transaction.findByPk(txn.id);

    expect(fresh.status).toBe('completed');
    expect(String(fresh.simId)).toBe(String(sim.id));
    expect(fresh.metadata?.sim_pool).toBe(true);
    expect(fresh.metadata?.service_provider).toBe('smeplug');
    expect(smeplugSpy).not.toHaveBeenCalled();
  });

  it('fails without wallet fallback when SIM pool is enabled and no SIM is available', async () => {
    process.env.SIM_POOL_ENABLED = 'true';
    process.env.SIM_POOL_ALLOW_WALLET_FALLBACK = 'false';

    const user = await User.create({
      name: 'Pool User 2',
      email: `pool_user2_${Date.now()}@test.com`,
      phone: `0809${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    await walletService.creditFundingWithFraudChecks(user, 5000, 'Test Funding', {
      reference: `MI-${Date.now()}-POOL2`,
      gateway: 'billstack',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBal = parseFloat(String(walletBefore.balance));

    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '1GB',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 500,
      api_cost: 200,
      is_active: true,
      ogdams_sku: null,
    });

    jest.spyOn(simManagementService, 'getOptimalSimForData').mockResolvedValue(null);
    jest.spyOn(smeplugService, 'purchaseData').mockResolvedValue({ success: true, data: { reference: 'SHOULD-NOT' } });

    const txn = await dataPurchaseService.purchase(user, plan, user.phone, null);
    const fresh = await Transaction.findByPk(txn.id);
    expect(fresh.status).toBe('failed');

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    const afterBal = parseFloat(String(walletAfter.balance));
    expect(afterBal).toBe(beforeBal);
  });
});

