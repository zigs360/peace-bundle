const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const virtualAccountService = require('../services/virtualAccountService');
const SystemSetting = require('../models/SystemSetting');

describe('Admin virtual account retry', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns success without waiting for notification completion', async () => {
    const admin = await User.create({
      name: `Admin ${Date.now()}`,
      email: `admin_va_retry_${Date.now()}@test.com`,
      phone: `080${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const target = await User.create({
      name: `Retry Target ${Date.now()}`,
      email: `retry_target_${Date.now()}@test.com`,
      phone: `081${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    await target.update({
      virtual_account_number: null,
      virtual_account_bank: null,
      virtual_account_name: null,
      metadata: { va_status: 'pending' },
    });

    jest.spyOn(virtualAccountService, 'notifyUserOfNewAccount').mockImplementation(() => new Promise(() => {}));

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const responsePromise = request(app)
      .post(`/api/admin/users/${target.id}/virtual-account/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const res = await Promise.race([
      responsePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('admin retry response timed out')), 1500)),
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accountNumber');
  });
});
