const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const payvesselService = require('../services/payvesselService');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');

describe('Virtual Account Request', () => {
  beforeAll(async () => {
    await connectDB();
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');
    await SystemSetting.set('allow_mock_bvn', true, 'boolean', 'api');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
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
});
