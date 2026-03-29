const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');

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
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/api/users/virtual-account/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

