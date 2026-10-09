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

  beforeEach(() => {
    billstackVirtualAccountService.resetCircuitBreakers();
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

  it('falls back to candidate endpoints if the primary endpoint returns 404', async () => {
    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);
    const notFoundError = new Error('Request failed with status code 404');
    notFoundError.response = { status: 404, data: { message: 'Not found' } };

    const post = jest.fn()
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce({
        data: {
          status: true,
          data: {
            reference: 'R-CANDIDATE-OK',
            account: [{ account_number: '1234567890', account_name: 'Fallback User', bank_name: 'PALMPAY' }],
          },
        },
      });

    jest.spyOn(billstackVirtualAccountService, 'clientWithTimeout').mockReturnValue({ post });

    const user = {
      id: 'candidate-user-1',
      name: 'Fallback User',
      email: 'fallback@test.com',
      phone: '08012345678',
    };

    const res = await billstackVirtualAccountService.generateVirtualAccount(user, 'PALMPAY');
    expect(res).toMatchObject({
      accountNumber: '1234567890',
      bankName: 'PALMPAY',
      trackingReference: 'R-CANDIDATE-OK',
    });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('classifies 404 and route errors as downtime with fallbackEligible true', () => {
    const error404 = { response: { status: 404 }, message: 'Request failed with status code 404' };
    const classification = billstackVirtualAccountService.classifyRoutingFailure(error404);
    expect(classification.category).toBe('downtime');
    expect(classification.fallbackEligible).toBe(true);
    expect(classification.status).toBe(404);
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
    const origPriority = process.env.VA_ROUTER_PRIORITY;
    process.env.VA_ROUTER_PRIORITY = 'PALMPAY,PROVIDUS,SAFEHAVEN,9PSB';
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
      bvn: `33${String(Date.now()).slice(-9)}`,
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
    process.env.VA_ROUTER_PRIORITY = origPriority;
  });
});
