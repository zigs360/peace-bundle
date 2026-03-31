const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');

describe('Admin virtual account health', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  it('returns provider configuration without leaking secrets', async () => {
    const adminUser = await User.create({
      name: 'Admin VA Health',
      email: `admin_va_health_${Date.now()}@test.com`,
      phone: '08011006610',
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/admin/virtual-accounts/health').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.providers).toBeTruthy();
    expect(res.body.providers.billstack).toBeTruthy();
    expect(res.body.providers.payvessel).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('SECRET_KEY');
    expect(JSON.stringify(res.body)).not.toContain('sk_');
  });
});

