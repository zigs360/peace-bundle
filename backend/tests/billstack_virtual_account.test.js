const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const virtualAccountService = require('../services/virtualAccountService');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');

describe('BillStack virtual account provider', () => {
  beforeAll(async () => {
    await connectDB();
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'billstack', 'string', 'api');
    process.env.BILLSTACK_BANK = 'PALMPAY';
  });

  it('assigns billstack virtual account and stores metadata reference', async () => {
    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccount').mockResolvedValue({
      accountNumber: '0000000000',
      bankName: 'PALMPAY',
      accountName: 'Alias-Test User',
      trackingReference: 'R-TEST-REF',
      raw: { status: true },
    });

    const user = await User.create({
      name: 'Test User',
      email: `billstack_va_${Date.now()}@test.com`,
      phone: `0901234${String(Date.now()).slice(-4)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const res = await virtualAccountService.assignVirtualAccount(user);
    expect(res).toBeTruthy();

    const updated = await User.findByPk(user.id);
    expect(updated.virtual_account_number).toBe('0000000000');
    expect(updated.virtual_account_bank).toBe('PALMPAY');
    expect(updated.virtual_account_name).toBe('Alias-Test User');
    expect(updated.metadata?.va_provider).toBe('billstack');
    expect(updated.metadata?.billstack_reference).toBe('R-TEST-REF');
  });
});
