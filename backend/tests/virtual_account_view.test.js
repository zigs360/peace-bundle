const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');

describe('Virtual Account secure view', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  it('returns hasVirtualAccount=false when user has no VA', async () => {
    const user = await User.create({
      name: 'No VA User',
      email: `no_va_${Date.now()}@test.com`,
      phone: '08011009900',
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
    expect(res.body.hasVirtualAccount).toBe(false);
  });

  it('returns masked account number and reveals full number on reveal endpoint', async () => {
    const user = await User.create({
      name: 'Has VA User',
      email: `has_va_${Date.now()}@test.com`,
      phone: '08011009901',
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
      phone: '08011009902',
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

