const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');

describe('Virtual Account secure view', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  it('auto-assigns on summary if missing and provider allows local', async () => {
    const user = await User.create({
      name: 'On Demand VA User',
      email: `ondemand_va_${Date.now()}@test.com`,
      phone: `080${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const jwt = require('jsonwebtoken');
    const SystemSetting = require('../models/SystemSetting');
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'local', 'string', 'api');
    await SystemSetting.set('local_virtual_account_prefix', '901', 'string', 'api');
    await SystemSetting.set('local_virtual_account_bank', 'Peace Bundlle', 'string', 'api');

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/users/virtual-account')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.hasVirtualAccount).toBe(true);
    expect(res.body.bankName).toBe('Peace Bundlle');
    expect(typeof res.body.accountNumberMasked).toBe('string');
    expect(res.body.accountNumberMasked.length).toBe(10);
  });

  it('auto-assigns or returns hasVirtualAccount based on provider when user has no VA', async () => {
    const user = await User.create({
      name: 'No VA User',
      email: `no_va_${Date.now()}@test.com`,
      phone: `081${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/users/virtual-account')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.hasVirtualAccount).toBe('boolean');
  });

  it('returns masked account number and reveals full number on reveal endpoint', async () => {
    const user = await User.create({
      name: 'Has VA User',
      email: `has_va_${Date.now()}@test.com`,
      phone: `082${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '1234567890',
      virtual_account_bank: 'Test Bank',
      virtual_account_name: 'Has VA User',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    const summary = await request(app)
      .get('/api/users/virtual-account')
      .set('Authorization', `Bearer ${token}`);

    expect(summary.statusCode).toBe(200);
    expect(summary.body.hasVirtualAccount).toBe(true);
    expect(summary.body.accountNumberMasked).toBe('******7890');

    const reveal = await request(app)
      .post('/api/users/virtual-account/reveal')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(reveal.statusCode).toBe(200);
    expect(reveal.body.success).toBe(true);
    expect(reveal.body.accountNumber).toBe('1234567890');
  });

  it('accepts audit events with valid actions', async () => {
    const user = await User.create({
      name: 'Audit VA User',
      email: `audit_va_${Date.now()}@test.com`,
      phone: `083${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '1234567890',
      virtual_account_bank: 'Test Bank',
      virtual_account_name: 'Audit VA User',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-account/audit')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'copy_full' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
