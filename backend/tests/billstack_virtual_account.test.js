const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const virtualAccountService = require('../services/virtualAccountService');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');
const payvesselService = require('../services/payvesselService');
const safeHavenVirtualAccountService = require('../services/safeHavenVirtualAccountService');
const logger = require('../utils/logger');

describe('BillStack virtual account provider', () => {
  beforeAll(async () => {
    await connectDB();
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'billstack', 'string', 'api');
    process.env.BILLSTACK_BANK = 'PALMPAY';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts the documented BillStack banks including 9PSB and BANKLY', async () => {
    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);
    const post = jest.fn()
      .mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            reference: 'R-9PSB',
            account: [{ account_number: '0000000001', account_name: 'Alias-Test User', bank_name: '9PSB Bank' }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            reference: 'R-BANKLY',
            account: [{ account_number: '0000000002', account_name: 'Alias-Test User', bank_name: 'Bankly Bank' }],
          },
        },
      });
    jest.spyOn(billstackVirtualAccountService, 'clientWithTimeout').mockReturnValue({ post });

    const user = {
      id: 'billstack-doc-bank-user',
      name: 'Test User',
      email: 'billstack_doc_bank@test.com',
      phone: '09012345678',
    };

    await expect(billstackVirtualAccountService.generateVirtualAccount(user, '9PSB')).resolves.toMatchObject({
      accountNumber: '0000000001',
      bankName: '9PSB Bank',
      trackingReference: 'R-9PSB',
    });
    await expect(billstackVirtualAccountService.generateVirtualAccount(user, 'BANKLY')).resolves.toMatchObject({
      accountNumber: '0000000002',
      bankName: 'Bankly Bank',
      trackingReference: 'R-BANKLY',
    });

    expect(post.mock.calls.map((call) => call[1].bank)).toEqual(['9PSB', 'BANKLY']);
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

  it('logs and throws the full attempted bank chain when all four banks fail', async () => {
    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(safeHavenVirtualAccountService, 'isConfigured').mockReturnValue(true);
    const billstackSpy = jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccount').mockImplementation(async (_user, bank) => {
      throw new Error(`Cannot reserve ${bank} account at the moment.`);
    });
    const safeHavenSpy = jest.spyOn(safeHavenVirtualAccountService, 'createVirtualAccount').mockRejectedValue(
      new Error('Cannot reserve SafeHaven account at the moment.'),
    );
    const payvesselSpy = jest.spyOn(payvesselService, 'createVirtualAccount').mockRejectedValue(
      new Error('PayVessel Error: Cannot reserve 9PSB account at the moment.'),
    );
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    const user = await User.create({
      name: 'Test User Failure',
      email: `billstack_va_fail_${Date.now()}@test.com`,
      phone: `0902234${String(Date.now()).slice(-4)}`,
      bvn: '12345678901',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    await expect(virtualAccountService.assignVirtualAccount(user)).rejects.toMatchObject({
      message: expect.stringContaining('(attempted banks: PALMPAY, PROVIDUS, SAFEHAVEN, 9PSB)'),
      details: expect.objectContaining({
        attemptedBanks: ['PALMPAY', 'PROVIDUS', 'SAFEHAVEN', '9PSB'],
      }),
    });

    expect(billstackSpy.mock.calls.map((call) => call[1])).toEqual(['PALMPAY', 'PROVIDUS', 'SAFEHAVEN', '9PSB']);
    expect(safeHavenSpy).toHaveBeenCalledTimes(1);
    expect(payvesselSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[VirtualAccount] Failed to assign virtual account (transient)',
      expect.objectContaining({
        userId: user.id,
        attemptedBanks: ['PALMPAY', 'PROVIDUS', 'SAFEHAVEN', '9PSB'],
        message: expect.stringContaining('(attempted banks: PALMPAY, PROVIDUS, SAFEHAVEN, 9PSB)'),
      }),
    );
  });
});
