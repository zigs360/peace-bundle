const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');

describe('Admin settings: allow_mock_bvn', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  it('updates allow_mock_bvn and persists as boolean setting', async () => {
    const adminUser = await User.create({
      name: 'Admin AllowMockBVN',
      email: `admin_allowmock_${Date.now()}@test.com`,
      phone: '08011006611',
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    await SystemSetting.set('allow_mock_bvn', false, 'boolean', 'api');

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ settings: { allow_mock_bvn: true } });

    expect(res.statusCode).toBe(200);
    const stored = await SystemSetting.findOne({ where: { key: 'allow_mock_bvn' } });
    expect(stored.type).toBe('boolean');
    expect(await SystemSetting.get('allow_mock_bvn')).toBe(true);
  });
});

