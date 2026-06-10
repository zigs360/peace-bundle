const { connectDB, User } = require('../config/db');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');
const payvesselService = require('../services/payvesselService');
const safeHavenVirtualAccountService = require('../services/safeHavenVirtualAccountService');

describe('VA Router circuit breaker', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.VA_ROUTER_BREAKER_THRESHOLD = '3';
    process.env.VA_ROUTER_BREAKER_WINDOW_MS = String(60 * 1000);
    process.env.VA_ROUTER_BREAKER_OPEN_MS = String(2 * 60 * 1000);
  });

  beforeEach(() => {
    billstackVirtualAccountService.getRouterBreaker().clear();
    billstackVirtualAccountService.getHealthCache().clear();
    delete process.env.BILLSTACK_HEALTH_URL;
    delete process.env.PAYVESSEL_HEALTH_URL;
    delete process.env.SAFEHAVEN_HEALTH_URL;
  });

  it('opens the circuit for a failing provider and skips it on subsequent routing attempts', async () => {
    jest.spyOn(safeHavenVirtualAccountService, 'isConfigured').mockReturnValue(false);
    jest.spyOn(payvesselService, 'createVirtualAccount').mockImplementation(async () => {
      throw new Error('PayVessel Error: unavailable');
    });

    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);

    const generateSpy = jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccount').mockImplementation(async (_user, bank) => {
      if (bank === 'PALMPAY') {
        throw new Error('Cannot reserve PALMPAY account at the moment.');
      }
      return {
        accountNumber: `66${String(Date.now()).slice(-8)}`,
        bankName: bank,
        accountName: 'Breaker User',
        trackingReference: `BILL-${bank}-${Date.now()}`,
      };
    });

    const user = await User.create({
      name: 'Breaker User',
      email: `breaker_${Date.now()}@test.com`,
      phone: `080${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    for (let i = 0; i < 3; i++) {
      await expect(billstackVirtualAccountService.generateVirtualAccountRouted(user, { priorityOrder: 'PALMPAY,PROVIDUS' })).resolves.toBeTruthy();
    }

    const fourth = await billstackVirtualAccountService.generateVirtualAccountRouted(user, { priorityOrder: 'PALMPAY,PROVIDUS' });
    expect(fourth).toBeTruthy();
    expect(fourth.provider).toBe('billstack');
    expect(fourth.bank).toBe('PROVIDUS');

    const calls = generateSpy.mock.calls.map((c) => c[1]);
    const palmpayCalls = calls.filter((b) => b === 'PALMPAY').length;
    expect(palmpayCalls).toBe(3);
  });
});

