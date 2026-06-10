const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const payvesselService = require('../services/payvesselService');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');
const safeHavenVirtualAccountService = require('../services/safeHavenVirtualAccountService');

describe('Virtual Account Request', () => {
  beforeAll(async () => {
    await connectDB();
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');
    await SystemSetting.set('allow_mock_bvn', true, 'boolean', 'api');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows a regular user to request a virtual account for themselves', async () => {
    const email = `va_user_${Date.now()}@test.com`;
    const phone = '08011001100';

    const user = await User.create({
      name: 'VA User',
      email,
      phone,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('accountNumber');
    expect(res.body).toHaveProperty('bankName');
    expect(res.body).toHaveProperty('accountName');

    const updated = await User.findByPk(user.id);
    expect(updated.virtual_account_number).toBeTruthy();
    expect(updated.virtual_account_bank).toBeTruthy();
    expect(updated.virtual_account_name).toBeTruthy();
  });

  it('allows an admin user to request a virtual account for themselves', async () => {
    const email = `va_admin_${Date.now()}@test.com`;
    const phone = '08011001101';

    const adminUser = await User.create({
      name: 'VA Admin',
      email,
      phone,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('accountNumber');

    const updated = await User.findByPk(adminUser.id);
    expect(updated.virtual_account_number).toBeTruthy();
  });

  it('returns 400 if a user already has a virtual account', async () => {
    const email = `va_repeat_${Date.now()}@test.com`;
    const phone = '08011001102';

    const user = await User.create({
      name: 'VA Repeat',
      email,
      phone,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '1234567890',
      virtual_account_bank: 'Test Bank',
      virtual_account_name: 'Test Name',
      metadata: { va_provider: 'payvessel', payvessel_tracking_reference: 'PV-REF-3' },
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.hasVirtualAccount).toBe(true);
  });

  it('quarantines an unapproved stored virtual account and replaces it with a provider account', async () => {
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');

    const assignedAccountNumber = `67${String(Date.now()).slice(-8)}`;
    jest.spyOn(payvesselService, 'createVirtualAccount').mockResolvedValueOnce({
      accountNumber: assignedAccountNumber,
      bankName: 'PALMPAY',
      accountName: 'VA Fix',
      trackingReference: 'PV-REF-QUAR',
    });

    const user = await User.create({
      name: 'VA Fix',
      email: `va_fix_${Date.now()}@test.com`,
      phone: `080${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '9010732536',
      virtual_account_bank: 'Peace Bundlle',
      virtual_account_name: 'VA Fix',
      metadata: { va_provider: 'local' },
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.accountNumber).toBe(assignedAccountNumber);
    expect(res.body.bankName).toBe('PALMPAY');

    const updated = await User.findByPk(user.id);
    expect(updated.virtual_account_number).toBe(assignedAccountNumber);
    expect(updated.metadata?.va_provider).toBe('payvessel');
    expect(updated.metadata?.invalid_virtual_account?.accountNumber).toBe('9010732536');
  });

  it('does not require BVN/KYC when billstack is configured (uses billstack instead of payvessel)', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.PAYVESSEL_API_KEY = process.env.PAYVESSEL_API_KEY || 'test';
    process.env.PAYVESSEL_SECRET_KEY = process.env.PAYVESSEL_SECRET_KEY || 'test';
    process.env.PAYVESSEL_BUSINESS_ID = process.env.PAYVESSEL_BUSINESS_ID || 'test';

    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');
    await SystemSetting.set('allow_mock_bvn', false, 'boolean', 'api');
    delete process.env.MOCK_BVN_ALLOWED;

    const payvesselSpy = jest.spyOn(payvesselService, 'createVirtualAccount');
    const prevBillstack = { secretKey: billstackVirtualAccountService.secretKey, baseUrl: billstackVirtualAccountService.baseUrl };
    billstackVirtualAccountService.secretKey = 'test';
    billstackVirtualAccountService.baseUrl = 'https://api.billstack.co/v2/thirdparty';
    const billstackSpy = jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccount').mockResolvedValueOnce({
      accountNumber: `67${String(Date.now()).slice(-8)}`,
      bankName: 'PALMPAY',
      accountName: 'Billstack User',
      trackingReference: `PB-${Date.now()}`,
      raw: { status: true },
    });

    const user = await User.create({
      name: 'Billstack User',
      email: `billstack_user_${Date.now()}@test.com`,
      phone: `080${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('accountNumber');
    expect(res.body).toHaveProperty('bankName');
    expect(payvesselSpy).not.toHaveBeenCalled();
    expect(billstackSpy).toHaveBeenCalled();

    const updated = await User.findByPk(user.id);
    expect(updated.virtual_account_number).toBeTruthy();
    expect(updated.metadata?.va_provider).toBe('billstack');

    payvesselSpy.mockRestore();
    billstackSpy.mockRestore();
    billstackVirtualAccountService.secretKey = prevBillstack.secretKey;
    billstackVirtualAccountService.baseUrl = prevBillstack.baseUrl;
    process.env.NODE_ENV = prevEnv;
  });

  it('falls back to 9PSB after PALMPAY and PROVIDUS primary failures', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.PAYVESSEL_API_KEY = process.env.PAYVESSEL_API_KEY || 'test';
    process.env.PAYVESSEL_SECRET_KEY = process.env.PAYVESSEL_SECRET_KEY || 'test';
    process.env.PAYVESSEL_BUSINESS_ID = process.env.PAYVESSEL_BUSINESS_ID || 'test';

    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');

    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(safeHavenVirtualAccountService, 'isConfigured').mockReturnValue(false);
    const billstackSpy = jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccount').mockImplementation(async (_user, bank) => {
      throw new Error(`Cannot reserve ${bank} account at the moment.`);
    });
    const payvesselSpy = jest.spyOn(payvesselService, 'createVirtualAccount').mockImplementation(async (_user, _retryCount, options = {}) => {
      expect(options.preferredBankName).toBe('9PSB');
      return {
        accountNumber: `24${String(Date.now()).slice(-8)}`,
        bankName: '9PSB',
        accountName: 'Fallback User',
        trackingReference: `PV-9PSB-${Date.now()}`,
      };
    });

    const user = await User.create({
      name: 'Fallback User',
      email: `fallback_9psb_${Date.now()}@test.com`,
      phone: `080${String(Date.now()).slice(-8)}`,
      bvn: '12345678901',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.accountNumber).toBeTruthy();
    expect(payvesselSpy).toHaveBeenCalledTimes(1);
    expect(billstackSpy).toHaveBeenCalledTimes(2);
    expect(billstackSpy.mock.calls.map((call) => call[1])).toEqual(['PALMPAY', 'PROVIDUS']);

    const updated = await User.findByPk(user.id);
    expect(updated.metadata?.va_provider).toBe('payvessel');
    expect(updated.metadata?.va_fallback_used).toBe(true);
    expect(updated.metadata?.va_assignment_workflow).toBe('payvessel_9PSB');
    expect(updated.metadata?.va_primary_failures).toHaveLength(2);
    expect(updated.metadata?.va_primary_failures?.map((entry) => entry.bank)).toEqual(['PALMPAY', 'PROVIDUS']);

    process.env.NODE_ENV = prevEnv;
  });

  it('uses Safe Haven as the preferred secondary workflow when configured', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');

    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(safeHavenVirtualAccountService, 'isConfigured').mockReturnValue(true);
    const billstackSpy = jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccount').mockImplementation(async () => {
      throw new Error('Cannot reserve account at the moment.');
    });
    const safeHavenSpy = jest.spyOn(safeHavenVirtualAccountService, 'createVirtualAccount').mockResolvedValue({
      accountNumber: `31${String(Date.now()).slice(-8)}`,
      bankName: 'Safe Haven',
      accountName: 'Safe Haven User',
      trackingReference: `SH-${Date.now()}`,
    });
    const payvesselSpy = jest.spyOn(payvesselService, 'createVirtualAccount');

    const user = await User.create({
      name: 'Safe Haven User',
      email: `fallback_safehaven_${Date.now()}@test.com`,
      phone: `081${String(Date.now()).slice(-8)}`,
      bvn: '12345678901',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(billstackSpy).toHaveBeenCalledTimes(2);
    expect(safeHavenSpy).toHaveBeenCalledTimes(1);
    expect(payvesselSpy).not.toHaveBeenCalled();

    const updated = await User.findByPk(user.id);
    expect(updated.metadata?.va_provider).toBe('safehaven');
    expect(updated.metadata?.va_fallback_used).toBe(true);
    expect(updated.metadata?.va_assignment_workflow).toBe('safehaven_SAFEHAVEN');
    expect(updated.metadata?.safehaven_reference).toBeTruthy();
    expect(updated.virtual_account_bank).toBe('SAFE HAVEN');

    process.env.NODE_ENV = prevEnv;
  });
});
