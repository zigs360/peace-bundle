const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');

describe('BillStack upgrade on KYC approval', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'billstack', 'string', 'api');
    await SystemSetting.set('billstack_bank', 'PALMPAY', 'string', 'api');
  });

  it('calls upgradeVirtualAccount after KYC approval when BVN exists', async () => {
    const adminUser = await User.create({
      name: 'Admin',
      email: `admin_billstack_${Date.now()}@test.com`,
      phone: '08011006600',
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const user = await User.create({
      name: 'KYC User',
      email: `kyc_billstack_${Date.now()}@test.com`,
      phone: '08011006601',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      bvn: '22222222222',
    });

    jest.spyOn(billstackVirtualAccountService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccount').mockResolvedValue({
      accountNumber: '0000000000',
      bankName: 'PALMPAY',
      accountName: 'Alias-KYC User',
      trackingReference: 'R-TEST-REF',
      raw: { status: true },
    });
    const upgradeSpy = jest.spyOn(billstackVirtualAccountService, 'upgradeVirtualAccount').mockResolvedValue({
      responseCode: '00',
      status: true,
      message: 'Validated',
    });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .put(`/api/admin/users/${user.id}/kyc/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(upgradeSpy).toHaveBeenCalledWith(user.email, '22222222222');

    const updated = await User.findByPk(user.id);
    expect(updated.metadata?.billstack_upgrade?.status).toBe('success');
    expect(updated.metadata?.billstack_upgraded_at).toBeTruthy();
  });
});

